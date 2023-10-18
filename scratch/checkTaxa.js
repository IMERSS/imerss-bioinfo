/* eslint-env node */
"use strict";

const fluid = require("infusion");
const minimist = require("minimist");
const hortis = fluid.registerNamespace("hortis");

fluid.require("%imerss-bioinfo");

require("../src/dataProcessing/readCSV.js");
require("../src/dataProcessing/readCSVWithoutMap.js");

require("../src/iNaturalist/iNatUrls.js");

const parsedArgs = minimist(process.argv.slice(2));

const input = hortis.csvReaderWithoutMap({
    inputFile: parsedArgs._[0] || fluid.module.resolvePath("%imerss-bioinfo/data/iNaturalist/iNaturalist-taxa.csv")
});

const nameToRows = {};
const idToRow = {};

// Taken from imerss-viz.js only return array rather than common node ancestor
hortis.lcaRoot = function (parents) {
    const lcaRoot = [];
    for (let i = 0; ; ++i) {
        let commonValue = null;
        for (const key in parents) {
            const seg = parents[key][i];
            if (seg === undefined) {
                commonValue = null;
                break;
            } else if (commonValue === null) {
                commonValue = seg;
            } else if (commonValue !== seg) {
                commonValue = null;
                break;
            }
        }
        if (commonValue === null) {
            break;
        } else {
            lcaRoot.push(commonValue);
        }
    }
    return lcaRoot;
};

hortis.pathFromRoot = function (row, idToRow) {
    const path = [];
    while (row) {
        path.unshift(row.taxonID);
        const parent = row.parentNameUsageID;
        row = parent ? idToRow[parent] : null;
    };
    return path;
};

hortis.castOutNested = function (dupes, oneDupe) {
    dupes = dupes.filter(function (dupe) {
        const lcaRoot = hortis.lcaRoot([dupe.path, oneDupe.path]);
        if (lcaRoot.length === dupe.path.length && lcaRoot.length !== oneDupe.path.length) {
        //            console.log("Cast out nested taxon ", dupe);
            return false;
        } else {
            return true;
        }
    });
    return dupes;
};

let bads = 0;

hortis.worstDepth = function (dupes) {
    let worstDepth = 0;
    for (let i = 0; i < dupes.length - 1; ++i) {
        for (let j = i + 1; j < dupes.length; ++j) {
            const di = dupes[i], dj = dupes[j];
            const lcaRoot = hortis.lcaRoot([di.path, dj.path]);
            worstDepth = Math.max(worstDepth, lcaRoot.length);
            if (worstDepth > 2 && di.taxonRank === dj.taxonRank) {
                ++bads;
                console.log("Bad taxon pair depth " + worstDepth + ", ", di, " and ", dj);
            }
        }
    }
    return worstDepth;
};

hortis.assessDupes = function (dupes, idToRow) {
    dupes.forEach(dupe => dupe.path = hortis.pathFromRoot(dupe, idToRow));
    dupes = dupes.filter(function (dupe) {
        if (dupe.path[0] === "48460") {
            return true;
        } else {
            console.log("Cast out untethered taxon ", dupe);
            return false;
        }
    });
    for (let i = dupes.length - 1; i >= 0;) {
        dupes = hortis.castOutNested(dupes, dupes[i]);
        --i;
        i = Math.min(dupes.length - 1, i);
    }
    const worstDepth = hortis.worstDepth(dupes);
    return worstDepth;
};

input.completionPromise.then(function () {
    const first = Date.now();
    input.rows.forEach(function (row) {
        // Convert "new" taxon dump to old format
        row.taxonID = hortis.iNaturalistTaxonFromUrl(row.taxonID);
        row.parentNameUsageID = hortis.iNaturalistTaxonFromUrl(row.parentNameUsageID);
        delete row.identifier;
        delete row.kingdom; delete row.phylum; delete row.class; delete row.order; delete row.family; delete row.genus;
        delete row.specificEpithet; delete row.infraspecificEpithet;
        fluid.pushArray(nameToRows, row.scientificName, row);
        idToRow[row.taxonID] = row;
    });
    console.log("Indexed in " + (Date.now() - first) + "ms");
    const now = Date.now();
    const dupeHash = fluid.transform(nameToRows, rows => rows.length > 1 ? rows : fluid.NO_VALUE);
    const dupes = fluid.hashToArray(dupeHash, "name", function (elem, value) {
        elem.rows = value;
    });
    console.log("Found ", dupes.length, "dupes");
    const depths = dupes.map(oneDupe => hortis.assessDupes(oneDupe.rows, idToRow));
    console.log(bads, " bad pairs");

    console.log("Processed in " + (Date.now() - now) + "ms");
});
