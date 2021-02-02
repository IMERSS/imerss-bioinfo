/* eslint-env node */

"use strict";

var fluid = require("infusion");
var minimist = require("minimist");
var fs = require("fs");

require("./dataProcessing/readJSON.js");
require("./dataProcessing/readCSV.js");
require("./dataProcessing/readCSVwithMap.js");
require("./dataProcessing/LZ4.js");
require("./iNaturalist/loadTaxa.js");
require("./iNaturalist/taxonAPI.js");

var hortis = fluid.registerNamespace("hortis");

hortis.ranks = fluid.freezeRecursive(require("../data/ranks.json"));

hortis.newTaxon = function (iNaturalistTaxonName, rank, depth, counts) {
    var togo = {
        iNaturalistTaxonName: iNaturalistTaxonName,
        id: fluid.allocateGuid(),
        rank: rank,
        depth: depth,
        childCount: 0,
        children: {},
        layoutLeft: 0
    };
    fluid.each(counts, function (oneCount, key) {
        togo[key] = 0;
    });
    return togo;
};

hortis.addCounts = function (row, counts) {
    fluid.each(counts, function (countDef, key) {
        var countField = row[countDef.column];
        row[key] = countDef.free ? Number(countField) : (countField === countDef.equals ? 1 : 0);
    });
};

hortis.cleanRow = function (row) {
    fluid.each(row, function (value, key) {
        if (typeof(value) === "string") {
            var trimmed = value.trim();
            if (trimmed === "" || trimmed === "—") { // Note funny AS hyphen in here
                delete row[key];
            } else {
                row[key] = trimmed;
            }
        }
    });
};

hortis.rowToTaxon = function (row, depth, counts) {
    row.depth = depth;
    row.id = fluid.allocateGuid();
    row.childCount = 1;
    row.children = {};
    hortis.addCounts(row, counts);
};

hortis.fullRecordTransform = {
    "wikipediaSummary": "wikipedia_summary",
    "commonName": "common_name.name",
    "iNaturalistTaxonId": "id",
    "iNaturalistTaxonImage": "default_photo.medium_url"
};

hortis.addTaxonInfo = function (row, fullRecord) {
    fluid.each(hortis.fullRecordTransform, function (path, target) {
        var source = fluid.get(fullRecord, path);
        if (row[target] === undefined) {
            row[target] = source;
        }
    });
};

hortis.storeAtPath = function (treeBuilder, path, row) {
    var counts = treeBuilder.map.counts;
    hortis.rowToTaxon(row, path.length, counts);
    var node = treeBuilder.tree;
    path.forEach(function (doc, index) {
        var last = index === path.length - 1;
        var name = doc.name;
        var child = node.children[name];
        if (!child) {
            child = node.children[name] = (last ? row : hortis.newTaxon(name, doc.rank, index + 1, counts));
            try {
                hortis.addTaxonInfo(child, doc);
            } catch (e) {
                console.log("While storing row ", row);
                throw e;
            }
        }
        ++node.childCount;
        fluid.each(counts, function (countDef, key) {
            node[key] += row[key];
        });
        node = child;
    });
};

hortis.loadCachedTaxonDoc = function (treeBuilder, id) {
    var existing = treeBuilder.taxonCache[id];
    if (!existing) {
        existing = treeBuilder.taxonCache[id] = hortis.iNat.loadTaxonDoc(treeBuilder.options.taxonAPIFileBase, id);
    }
    return existing;
};

hortis.taxaToPathiNat = function (treeBuilder, row) {
    var baseDoc = hortis.loadCachedTaxonDoc(treeBuilder, row.iNaturalistTaxonId);
    var parentTaxaIds = hortis.iNat.parentTaxaIds(baseDoc);
    var ancestourDocs = parentTaxaIds.map(function (id) {
        return hortis.loadCachedTaxonDoc(treeBuilder, id);
    });
    var rankDocs = ancestourDocs.filter(function (oneDoc) {
        return hortis.ranks.includes(oneDoc.rank);
    });
    return rankDocs.concat([baseDoc]);
};


hortis.applyRowsToTree = function (treeBuilder, rows) {
    rows.forEach(function (row, index) {
        if (index % 100 === 0) {
            process.stdout.write(index + " ... ");
        }
        hortis.cleanRow(row);
        var path = hortis.taxaToPathiNat(treeBuilder, row);
        treeBuilder.storeAtPath(path, row);
    });
    console.log("");
};

hortis.flattenChildren = function (root) {
    var children = [];
    fluid.each(root.children, function (value) {
        children.push(hortis.flattenChildren(value));
    });
    root.children = children;
    return root;
};

hortis.parseCounts = function (counts) {
    fluid.each(counts, function (oneCount) {
        if (oneCount.equals === "") {
            oneCount.equals = undefined;
        }
    });
};

hortis.loadMapWithCounts = function (mapFile) {
    var map = hortis.readJSONSync(mapFile);
    hortis.parseCounts(map.counts);
    return map;
};

hortis.rootNode = function (map) {
    return hortis.newTaxon("Life", "life", 0, map.counts);
};

fluid.defaults("hortis.treeBuilder", {
    gradeNames: "fluid.component",
    taxonAPIFileBase: "e:/data/iNaturalist/taxonAPI",
    mapFile: "data/Galiano/Galiano-map.json",
    outputFile: "Life.json.lz4",
    inputFiles: [],
    members: {
        // Mutable tree to which each file contributes its taxa
        tree: "@expand:hortis.rootNode({that}.map)",
        map: "@expand:hortis.loadMapWithCounts({that}.options.mapFile)",
        // map of taxonId to taxon file
        taxonCache: {}
    },
    invokers: {
        applyRowsToTree: "hortis.applyRowsToTree({that}, {arguments}.1)", // rows
        storeAtPath: "hortis.storeAtPath({that}, {arguments}.0, {arguments}.1)" // path, row
    },
    listeners: {
        "onCreate.marmalise": "hortis.marmalise({that})"
    }
});

hortis.filterDataset = function (dataset) {
    return fluid.filterKeys(dataset, ["name", "colour"]);
};

hortis.marmalise = function (treeBuilder) {
    var results = treeBuilder.options.inputFiles.map(function (fileName) {
        var togo = fluid.promise();
        var result = hortis.csvReaderWithMap({
            inputFile: fileName,
            mapColumns: treeBuilder.map.columns
        }).completionPromise;
        result.then(function (result) {
            // console.log(JSON.stringify(result.rows[0], null, 2));
            console.log("Applying " + result.rows.length + " rows from " + fileName);
            treeBuilder.applyRowsToTree(fileName, result.rows);
            togo.resolve();
        }, function (error) {
            fluid.fail(error);
        });
        return togo;
    });

    var fullResult = fluid.promise.sequence(results);
    fullResult.then(function () {
        hortis.flattenChildren(treeBuilder.tree);
        var output = {
            datasets: fluid.transform(treeBuilder.map.datasets, hortis.filterDataset),
            tree: treeBuilder.tree
        };
        fs.writeFileSync("marmalised.json", JSON.stringify(output, null, 4) + "\n");
        var text = JSON.stringify(output);
        hortis.writeLZ4File(text, treeBuilder.options.outputFile);
    });
};


var parsedArgs = minimist(process.argv.slice(2));

hortis.treeBuilder({
    mapFile: parsedArgs.map,
    outputFile: parsedArgs.o || parsedArgs.output,
    inputFiles: parsedArgs._
});
