/* eslint-env node */

"use strict";

const fluid = require("infusion");
const minimist = require("minimist");
const fs = require("fs");

require("./utils/utils.js");
require("./dataProcessing/readJSON.js");
require("./dataProcessing/readCSV.js");
require("./dataProcessing/readCSVwithMap.js");
require("./dataProcessing/LZ4.js");
require("./iNaturalist/taxonAPI.js");

const hortis = fluid.registerNamespace("hortis");

hortis.ranks = fluid.freezeRecursive(require("../data/ranks.json"));

hortis.newTaxon = function (iNaturalistTaxonName, rank, depth, counts) {
    const togo = {
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
        const countField = row[countDef.column];
        row[key] = countDef.free ? Number(countField) : (countField === countDef.equals ? 1 : 0);
    });
};

hortis.cleanRow = function (row) {
    fluid.each(row, function (value, key) {
        if (typeof(value) === "string") {
            const trimmed = value.trim();
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
        const source = fluid.get(fullRecord, path);
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
    const counts = treeBuilder.map.counts;
    hortis.rowToTaxon(row, path.length, counts);
    let node = treeBuilder.tree;
    path.forEach(function (doc, index) {
        const last = index === path.length - 1;
        const name = doc.name;
        let child = node.children[name];
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
/*
hortis.loadCachedTaxonDoc = function (treeBuilder, id) {
    let existing = treeBuilder.taxonCache[id];
    if (!existing) {
        existing = treeBuilder.taxonCache[id] = hortis.iNat.loadTaxonDoc(treeBuilder.options.taxonAPIFileBase, id);
    }
    // This otherwise causes rank to be "undefined" in the interface - AS report 18/4/22
    // Not sure what to do about this long-term
    if (existing.rank === "complex") {
        existing.rank = "species";
    }
    return existing;
};
 */

/** Produce a "path" holding each cached taxon doc from the supplied row from the root
 * @param {TreeBuilder} treeBuilder - The treeBuilder instance
 * @param {Row} row - An observation or summary row
 * @return {Promise<TaxonDoc[]>} Array of taxon docs starting at the root and ending at the row's doc
 */
hortis.taxaToPathiNat = async function (treeBuilder, row) {
    const baseDoc = (await treeBuilder.taxonSource.get({id: row.iNaturalistTaxonId})).doc;
    const parentTaxaIds = hortis.iNat.parentTaxaIds(baseDoc).reverse();
    const ancestourDocs = await Promise.all(parentTaxaIds.map(async function (id) {
        return (await treeBuilder.taxonSource.get({id: id})).doc;
    }));
    const rankDocs = ancestourDocs.filter(function (oneDoc) {
        return treeBuilder.options.vizRanks.includes(oneDoc.rank);
    });
    return rankDocs.concat([baseDoc]);
};


hortis.applyRowsToTree = async function (treeBuilder, rows) {
    for (let i = 0; i < rows.length; ++i) {
        const row = rows[i];
        if (i % 100 === 0) {
            process.stdout.write(i + " ... ");
        }
        hortis.cleanRow(row);
        const path = await hortis.taxaToPathiNat(treeBuilder, row);
        treeBuilder.storeAtPath(path, row);
    }
    console.log("");
};

hortis.flattenChildren = function (root) {
    const children = [];
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
    const map = hortis.readJSONSync(fluid.module.resolvePath(mapFile));
    hortis.parseCounts(map.counts);
    return map;
};

hortis.rootNode = function (map) {
    return hortis.newTaxon("Life", "life", 0, map.counts);
};

hortis.filterVizRanks = function (skipRanks) {
    return hortis.ranks.filter(function (rank) {
        return !skipRanks.includes(rank);
    });
};

fluid.defaults("hortis.treeBuilder", {
    gradeNames: "fluid.component",
    taxonAPIFileBase: "data/iNaturalist/taxonAPI",
    mapFile: "data/Galiano/Galiano-map.json",
    outputFile: "Life.json.lz4",
    featureFile: "",
    regionField: null, obsIdField: null,
    inputFiles: [],
    skipRanks: [],
    vizRanks: "@expand:hortis.filterVizRanks({that}.options.skipRanks)",
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
    },
    components: {
        taxonSource: {
            type: "hortis.iNatTaxonSource"
        }
    }
});

hortis.filterDataset = function (dataset) {
    return fluid.filterKeys(dataset, ["name", "colour"]);
};

hortis.indexRegions = function (treeBuilder) {
    const features = treeBuilder.features;
    const summaryById = {};
    treeBuilder.summaryRows.forEach(function (row) {
        summaryById[row.iNaturalistTaxonId] = row;
    });
    const communities = fluid.transform(features.communities, function (community) {
        community.count = 0;
        community.byTaxonId = {};
        return community;
    });
    const classes = {};
    fluid.each(features.classes, function (clazz, classKey) {
        classes[classKey] = {
            count: 0,
            byTaxonId: {}
        };
    });
    const applyObs = function (container, key, taxonId, obsId) {
        if (key) {
            const region = container[key];
            if (!region) {
                fluid.fail("Unknown region key ", key, " in container with keys ", Object.keys(container).join(", "));
            }
            let bucketTaxa = region.byTaxonId[taxonId]; // TODO: use fluid.pushArray?
            if (!bucketTaxa) {
                bucketTaxa = region.byTaxonId[taxonId] = [];
            }
            bucketTaxa.push(obsId);
            ++region.count;
        }
    };
    const options = treeBuilder.options;
    treeBuilder.obs.rows.forEach(function (row) {
        const obsId = row[options.obsIdField];
        const summaryRow = summaryById[row.iNaturalistTaxonId];
        if (summaryRow) {
            const taxonId = summaryRow.id;
            applyObs(communities, row.COMMUNITY, taxonId, obsId);
            applyObs(classes, row.clazz, taxonId, obsId);

        } else {
            console.log("Warning: row with iNaturalistTaxonId " + row.iNaturalistTaxonId + " did not correspond to row in summary: ", row);
        }
    });
    return {
        communities: communities,
        classes: fluid.extend(true, {}, features.classes, classes),
        features: features.features
    };
};

hortis.marmalise = async function (treeBuilder) {
    const options = treeBuilder.options;
    await hortis.asyncMap(options.inputFiles, async function (fileName) {
        const result = await hortis.csvReaderWithMap({
            inputFile: fluid.module.resolvePath(fileName),
            mapColumns: treeBuilder.map.columns
        }).completionPromise;
        // console.log(JSON.stringify(result.rows[0], null, 2));
        console.log("Applying " + result.rows.length + " rows from " + fileName);
        treeBuilder.summaryRows = result.rows;
        await treeBuilder.applyRowsToTree(fileName, result.rows);
    });
    if (options.featuresFile) {
        fluid.expect("viz config file", options, ["obsFile", "obsMapFile", "regionField", "obsIdField"]);
        treeBuilder.features = hortis.readModuleJSONSync(options.featuresFile);
        const obsMap = hortis.readModuleJSONSync(options.obsMapFile);
        const obs = await hortis.csvReaderWithMap({
            inputFile: fluid.module.resolvePath(options.obsFile),
            mapColumns: obsMap.columns
        }).completionPromise;
        console.log("Read " + obs.rows.length + " observation rows from " + options.obsFile);
        treeBuilder.obs = obs;
    }

    hortis.flattenChildren(treeBuilder.tree);
    const output = {
        datasets: fluid.transform(treeBuilder.map.datasets, hortis.filterDataset),
        tree: treeBuilder.tree
    };
    const extraOutput = options.featuresFile ? hortis.indexRegions(treeBuilder) : {};
    const fullOutput = fluid.extend(output, extraOutput);
    fs.writeFileSync("marmalised.json", JSON.stringify(fullOutput, null, 4) + "\n");
    const text = JSON.stringify(fullOutput);
    hortis.writeLZ4File(text, fluid.module.resolvePath(treeBuilder.options.outputFile));
};


const parsedArgs = minimist(process.argv.slice(2));

const options = parsedArgs.config ? hortis.readJSONSync(parsedArgs.config) : {
    mapFile: parsedArgs.map,
    obsFile: parsedArgs.obsFile,
    skipRanks: [],
    obsMapFile: parsedArgs.obsMapFile,
    featuresFile: parsedArgs.featuresFile,
    outputFile: parsedArgs.o || parsedArgs.output,
    inputFiles: parsedArgs._
};

hortis.treeBuilder(options);
