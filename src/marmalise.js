/* eslint-env node */

"use strict";

var fluid = require("infusion");
var csv = require("csv-parser");
var fs = require("fs");

var hortis = fluid.registerNamespace("hortis");

hortis.ranks = fluid.freezeRecursive(require("../data/ranks.json"));

hortis.mapRow = function (data, map, index) {
    var togo = {};
    fluid.each(map, function (label, key) {
        togo[key] = data[label];
    });
    togo.index = index;
    return togo;
};

hortis.validateHeaders = function (map, headers, rejector) {
    fluid.each(map, function (label) {
        if (headers.indexOf(label) === -1) {
            rejector("Error in headers - field " + label + " required in map file was not found");
        }
    });
};

hortis.readCSV = function (fileName, mapFile) {
    var rows = [];
    var togo = fluid.promise();
    var map = require(mapFile);

    var rowStream = fs.createReadStream(fileName)
      .pipe(csv());

    var rejector = function (error) {
        togo.reject("Error at line " + rows.length + " reading file " + fileName + ": " + error);
    };

    rowStream.on("data", function (data) {
        rows.push(hortis.mapRow(data, map, rows.length + 1));
    });
    rowStream.on("error", function (error) {
        rejector(error);
    });
    rowStream.on("headers", function (headers) {
        hortis.validateHeaders(map, headers, rejector);
    });
    rowStream.on("end", function () {
        togo.resolve({
            map: map,
            rows: rows
        });
    });

    return togo;
};

hortis.taxaToPath = function (row) {
    var rowTaxa = [];
    fluid.each(hortis.ranks, function (rank) {
        if (row[rank]) {
            rowTaxa.push(row[rank]);
        }
    });
    return rowTaxa;
};

hortis.newTaxon = function (name, rank, depth) {
    return {
        name: name,
        id: fluid.allocateGuid(),
        rank: rank,
        depth: depth,
        childCount: 0,
        undocumentedCount: 0,
        children: {},
        layoutLeft: 0
    };
};

hortis.cleanRow = function (row, depth) {
    row.depth = depth;
    row.id = fluid.allocateGuid();
    row.childCount = 1;
    row.undocumentedCount = row.iNaturalistLink ? 0 : 1;
    fluid.each(row, function (value, key) {
        if (typeof(value) === "string" && value.trim() === "" || value === "—") {
            delete row[key];
        }
    });
};

hortis.storeAtPath = function (tree, path, row) {
    hortis.cleanRow(row, path.length);
    var node = tree;
    path.forEach(function (seg, index) {
        var last = index === path.length - 1;
        var child = node.children[seg];
        if (!child) {
            var rank = fluid.find(hortis.ranks, function (rank) {
                return row[rank] === seg ? rank : undefined;
            });
            child = node.children[seg] = (last ? row : hortis.newTaxon(seg, rank, index + 1));
        }
        ++node.childCount;
        node.undocumentedCount += row.undocumentedCount;
        node = child;
    });
};

hortis.flatToTree = function (rows) {
    var tree = hortis.newTaxon("Life", "Life", 0);
    rows.forEach(function (row) {
        var path = hortis.taxaToPath(row);
        hortis.storeAtPath(tree, path, row);
    });
    return tree;
};

hortis.flattenChildren = function (root) {
    var children = [];
    fluid.each(root.children, function (value) {
        children.push(hortis.flattenChildren(value));
    });
    root.children = children;
    return root;
};

var result = hortis.readCSV(process.argv[2], __dirname + "/../data/Galiano-map.json");

fluid.setLogging(true);
fluid.logObjectRenderChars = 10240;

result.then(function (result) {
//    console.log(JSON.stringify(result, null, 2));
    var tree = hortis.flatToTree(result.rows);
    hortis.flattenChildren(tree);
    console.log(JSON.stringify(tree, null, 2));
}, function (error) {
    fluid.fail(error);
});
