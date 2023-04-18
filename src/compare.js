/* eslint-env node */

"use strict";

// Compare two summaries derived from different workflows, outputting excess in both directions as excess1.csv and excess2.csv
// Accepts two arguments which are summary files, typically a "reintegrated.csv"

const fluid = require("infusion");
const minimist = require("minimist");
fluid.require("%imerss-bioinfo");

require("./dataProcessing/readJSON.js");
require("./dataProcessing/readCSV.js");
require("./dataProcessing/readCSVwithMap.js");
require("./dataProcessing/writeCSV.js");

const hortis = fluid.registerNamespace("hortis");

hortis.ranks = fluid.freezeRecursive(require("../data/ranks.json"));
// Map of taxon name to list of higher taxa
hortis.higherTaxa = fluid.transform(fluid.arrayToHash(hortis.ranks), function (troo, rank) {
    return hortis.ranks.slice(0, hortis.ranks.indexOf(rank));
});

fluid.setLogging(true);

const parsedArgs = minimist(process.argv.slice(2));

const file1 = parsedArgs._[0];
const file2 = parsedArgs._[1];

const mapFile = parsedArgs.map || "%imerss-bioinfo/data/coreOutMap.json";
const map = hortis.readJSONSync(fluid.module.resolvePath(mapFile), "reading map file");

const files = [file1, file2];

const readers = files.map(function (oneFile) {
    return hortis.csvReaderWithMap({
        inputFile: oneFile,
        mapColumns: map.columns
    });
});

const promises = fluid.getMembers(readers, "completionPromise");

hortis.findExcess = function (hash1, hash2) {
    const togo = [];
    fluid.each(hash1, function (value, name) {
        if (!hash2[name]) {
            togo.push(name);
        }
    });
    return togo;
};

hortis.reportExcess = function (names, hash, mapColumns, filename) {
    const excessRowHash = fluid.filterKeys(hash, names);
    const excessRows = Object.values(excessRowHash);
    hortis.writeCSV(filename, map.columns, excessRows, fluid.promise());
};

hortis.castOutOneHigherTaxa = function (hash, row, rank) {
    if (row[rank]) {
        hortis.higherTaxa[rank].forEach(function (higherRank) {
            delete hash[row[higherRank]];
        });
    }
};

hortis.castOutHigherTaxa = function (hash) {
    console.log("Original size: " + Object.keys(hash).length);
    fluid.each(hash, function (row) {
        hortis.castOutOneHigherTaxa(hash, row, "species");
        hortis.castOutOneHigherTaxa(hash, row, "genus");
    });
    console.log("After casting out higher taxa: " + Object.keys(hash).length);
};

fluid.promise.sequence(promises).then(function () {
    console.log("Loaded " + readers.length + " CSV files");
    const rows = fluid.getMembers(readers, "rows");
    const names = rows.map(function (oneRows) {
        return fluid.getMembers(oneRows, "iNaturalistTaxonName");
    });
    const hashes = names.map(function (oneNames, index) {
        const togo = {};
        oneNames.forEach(function (name, rowIndex) {
            togo[name] = rows[index][rowIndex];
        });
        return togo;
    });
    hashes.forEach(hortis.castOutHigherTaxa);
    const onlyOne = hortis.findExcess(hashes[0], hashes[1]);
    hortis.reportExcess(onlyOne, hashes[0], map.columns, "excess1.csv");
    const onlyTwo = hortis.findExcess(hashes[1], hashes[0]);
    hortis.reportExcess(onlyTwo, hashes[1], map.columns, "excess2.csv");

}, function (err) {
    console.log("Error ", err);
});
