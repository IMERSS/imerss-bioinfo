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
        children: {}
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

hortis.reverseMerge = function (target, source) {
    fluid.each(source, function (value, key) {
        if (!target[key]) {
            target[key] = value;
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
        } else if (last) { // Store any surplus fields, expecially include "coords" here otherwise they will be lost
            hortis.reverseMerge(child, row);
            // It may already have had an id allocated as a result of being observed as a lower taxon - make sure
            // row records this since this id may be used when assigning obs to regions
            row.id = child.id;
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

/** Produce a "path" holding each cached taxon doc from the supplied row from the root
 * @param {TreeBuilder} treeBuilder - The treeBuilder instance
 * @param {Row} row - An observation or summary row
 * @return {TaxonDoc[]} Array of taxon docs starting at the root and ending at the row's doc
 */
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
    var map = hortis.readJSONSync(fluid.module.resolvePath(mapFile));
    hortis.parseCounts(map.counts);
    return map;
};

hortis.rootNode = function (map) {
    return hortis.newTaxon("Life", "life", 0, map.counts);
};

fluid.defaults("hortis.treeBuilder", {
    gradeNames: "fluid.component",
    taxonAPIFileBase: "data/iNaturalist/taxonAPI",
    mapFile: "data/Galiano/Galiano-map.json",
    outputFile: "Life.json.lz4",
    featureFile: "",
    regionField: null, obsIdField: null,
    inputFiles: [],
    members: {
        // Mutable tree to which each file contributes its taxa
        tree: "@expand:hortis.rootNode({that}.map)",
        map: "@expand:hortis.loadMapWithCounts({that}.options.mapFile)",
        features: null, // "flatFeatures" file output, e.g. by deqgis, if configured
        obs: null, // observations file which will be applied to features - expected to contain column named "regionColumn" supplied in options
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

hortis.indexRegions = function (treeBuilder) {
    var features = treeBuilder.features;
    var summaryById = {};
    treeBuilder.summaryRows.forEach(function (row) {
        summaryById[row.iNaturalistTaxonId] = row;
    });
    var regions = {};
    fluid.each(features.classes, function (clazz) {
        regions[clazz.region] = {
            count: 0,
            byTaxonId: {}
        };
    });
    var options = treeBuilder.options;
    treeBuilder.obs.rows.forEach(function (row) {
        var obsId = row[options.obsIdField];
        var summaryRow = summaryById[row.iNaturalistTaxonId];
        if (summaryRow) {
            var taxonId = summaryRow.id;
            var regionName = row[options.regionField];
            var region = regions[regionName];
            var bucketTaxa = region.byTaxonId[taxonId]; // TODO: use fluid.pushArray?
            if (!bucketTaxa) {
                bucketTaxa = region.byTaxonId[taxonId] = [];
            }
            bucketTaxa.push(obsId);
            ++region.count;
        } else {
            console.log("Warning: row with iNaturalistTaxonId " + row.iNaturalistTaxonId + " did not correspond to row in summary: ", row);
        }
    });
    return {
        regions: regions,
        classes: features.classes,
        features: features.features
    };
};

hortis.marmalise = function (treeBuilder) {
    var options = treeBuilder.options;
    var results = options.inputFiles.map(function (fileName) {
        var togo = fluid.promise();
        var result = hortis.csvReaderWithMap({
            inputFile: fluid.module.resolvePath(fileName),
            mapColumns: treeBuilder.map.columns
        }).completionPromise;
        result.then(function (result) {
            // console.log(JSON.stringify(result.rows[0], null, 2));
            console.log("Applying " + result.rows.length + " rows from " + fileName);
            treeBuilder.summaryRows = result.rows;
            treeBuilder.applyRowsToTree(fileName, result.rows);
            togo.resolve();
        }, fluid.fail);
        return togo;
    });
    if (options.featuresFile) {
        fluid.expect("viz config file", options, ["obsFile", "obsMapFile", "regionField", "obsIdField"]);
        treeBuilder.features = hortis.readModuleJSONSync(options.featuresFile);
        var obsMap = hortis.readModuleJSONSync(options.obsMapFile);
        var obsResult = hortis.csvReaderWithMap({
            inputFile: fluid.module.resolvePath(options.obsFile),
            mapColumns: obsMap.columns
        }).completionPromise;
        obsResult.then(function (obs) {
            console.log("Read " + obs.rows.length + " observation rows from " + options.obsFile);
            treeBuilder.obs = obs;
        }, fluid.fail);
        results.push(obsResult);
    }

    var fullResult = fluid.promise.sequence(results);
    fullResult.then(function () {
        hortis.flattenChildren(treeBuilder.tree);
        var output = {
            datasets: fluid.transform(treeBuilder.map.datasets, hortis.filterDataset),
            tree: treeBuilder.tree
        };
        var extraOutput = options.featuresFile ? hortis.indexRegions(treeBuilder) : {};
        var fullOutput = fluid.extend(output, extraOutput);
        fs.writeFileSync("marmalised.json", JSON.stringify(fullOutput, null, 4) + "\n");
        var text = JSON.stringify(fullOutput);
        hortis.writeLZ4File(text, fluid.module.resolvePath(treeBuilder.options.outputFile));
    });
};


var parsedArgs = minimist(process.argv.slice(2));

var options = parsedArgs.config ? hortis.readJSONSync(parsedArgs.config) : {
    mapFile: parsedArgs.map,
    obsFile: parsedArgs.obsFile,
    obsMapFile: parsedArgs.obsMapFile,
    featuresFile: parsedArgs.featuresFile,
    outputFile: parsedArgs.o || parsedArgs.output,
    inputFiles: parsedArgs._
};

hortis.treeBuilder(options);
