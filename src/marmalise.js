/* eslint-env node */

"use strict";

var fluid = require("infusion");
var csv = require("csv-parser");
var fs = require("fs");
var lz4 = require("lz4");
var minimist = require("minimist");
var stream = require("stream");

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

hortis.readCSV = function (fileName, map) {
    var rows = [];
    var togo = fluid.promise();

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

hortis.addCounts = function (row, counts) {
    fluid.each(counts, function (countDef, key) {
        row[key] = row[countDef.column] === countDef.equals ? 1 : 0;
    });
};

hortis.cleanRow = function (row, depth, counts) {
    row.depth = depth;
    row.id = fluid.allocateGuid();
    row.childCount = 1;
    hortis.addCounts(row, counts);
    fluid.each(row, function (value, key) {
        if (typeof(value) === "string" && value.trim() === "" || value === "—") { // Note funny AS hyphen in here
            delete row[key];
        }
    });
};

hortis.storeAtPath = function (tree, path, row, counts) {
    hortis.cleanRow(row, path.length, counts);
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
        fluid.each(counts, function (countDef, key) {
            node[key] += row[key];
        });
        node = child;
    });
};

hortis.flatToTree = function (tree, rows, counts) {
    rows.forEach(function (row) {
        var path = hortis.taxaToPath(row);
        hortis.storeAtPath(tree, path, row, counts);
    });
};

hortis.flattenChildren = function (root) {
    var children = [];
    fluid.each(root.children, function (value) {
        children.push(hortis.flattenChildren(value));
    });
    root.children = children;
    return root;
};

hortis.writeLZ4File = function (text, filename) {
    var input = new stream.Readable();
    input.push(text);
    input.push(null);

    var output = fs.createWriteStream(filename);

    var encoder = lz4.createEncoderStream();
    input.pipe(encoder).pipe(output);
    output.on("finish", function () {
        var stats = fs.statSync(filename);
        console.log("Written " + stats.size + " bytes to " + filename);
    });
};

var parsedArgs = minimist(process.argv.slice(2));

var outputFile = parsedArgs.o || "Life.json.lz4";
var mapFile = parsedArgs.map || __dirname + "/../data/Galiano-map.json"; 

var map = JSON.parse(fs.readFileSync(mapFile, "utf-8"));
var tree = hortis.newTaxon("Life", "Life", 0);

var files = parsedArgs._;
var results = files.map(function (file) {
    var togo = fluid.promise();
    var result = hortis.readCSV(file, map.columns);
    result.then(function (result) {
        // console.log(JSON.stringify(result.rows[0], null, 2));
        hortis.flatToTree(tree, result.rows, map.counts);
        togo.resolve();
    }, function (error) {
        fluid.fail(error);
    });
    return togo;
});

var fullResult = fluid.promise.sequence(results);
fullResult.then(function () {
    hortis.flattenChildren(tree);
    var text = JSON.stringify(tree);
    hortis.writeLZ4File(text, outputFile);
    console.log();
});
