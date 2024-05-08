/* eslint-env node */

"use strict";

const fluid = require("infusion");
const hortis = fluid.registerNamespace("hortis");

require("../dataProcessing/writeCSV.js");

fluid.registerNamespace("hortis.xetthecum");

hortis.xetthecum.names = [{
    field: "hulqThom",
    auth: "(Thom, 2011)"
}, {
    field: "hulqTurner1",
    auth: "(Turner, 2014)"
},  {
    field: "hulqTurner2",
    auth: "(Turner, 2014)"
}];

hortis.xetthecum.valueOutMap = {
    columns: {
        "foodValue": "foodValue",
        "medicinalValue": "medicinalValue",
        "spiritualValue": "spiritualValue",
        "materialValue": "materialValue",
        "tradeValue": "tradeValue",
        "indicatorValue": "indicatorValue"
    }
};

hortis.xetthecum.extraOutMap = {
    columns: {
        "hulqName": "hulquminumName",
        "hulqAuth": "hulquminumAuthority"
    }
};

hortis.xetthecum.mediaOutMap = {
    columns: {
        "audioLink": "audioLink"
    }
};

hortis.xetthecum.taxonResolution = {
    "Camassia": "Camassia quamash",
    "Camassia leichtlinii suksdorfii": "Camassia leichtlinii",
    "Pseudotsuga menziesii menziesii": "Pseudotsuga menziesii"
};

hortis.xetthecum.chooseName = function (target, hulqRow) {
    const bestRec = hortis.xetthecum.names.find(function (rec) {
        return !!hulqRow[rec.field];
    });
    if (bestRec) {
        target.hulqName = hulqRow[bestRec.field];
        target.hulqAuth = bestRec.auth;
        return true;
    } else {
        return false;
    }
};

hortis.xetthecum.summariseUnseen = function (byTaxon, usedTaxa, message) {
    const unseen = [];
    fluid.each(byTaxon, function (value, key) {
        if (!usedTaxa[key]) {
            unseen.push(key);
        }
    });
    console.log("The following ", unseen.length, " taxa with " + message + " were not observed:\n" + unseen.join("\n"));
};

hortis.xetthecum.assignHulqNames = function (resolved, patch) {
    const byTaxon = {};
    const usedTaxa = {};
    const withoutHulq = [];
    let hits = 0;
    const valueFields = Object.keys(hortis.xetthecum.valueOutMap.columns);
    patch.patchData.rows.forEach(function (row) {
        byTaxon[row.scientificName] = row;
    });
    resolved.summarisedRows.forEach(function (row) {
        const taxon = row.iNaturalistTaxonName;
        const resolve = hortis.xetthecum.taxonResolution[taxon];
        const useLookup = resolve || taxon;
        const hulqRow = byTaxon[useLookup];
        if (!hulqRow) {
            withoutHulq.push({
                taxon: taxon,
                found: "no record"
            });
        } else {
            usedTaxa[useLookup] = true;
            const transfer = fluid.filterKeys(hulqRow, valueFields);
            const foundName = hortis.xetthecum.chooseName(transfer, hulqRow);
            if (foundName) {
                ++hits;
            } else {
                withoutHulq.push({
                    taxon: taxon,
                    found: "no name"
                });
            }
            fluid.extend(row, transfer);
        }
    });
    console.log("Matched " + hits + " taxa with Hul'qumi'num names");

    hortis.xetthecum.summariseUnseen(byTaxon, usedTaxa, "Hul'qumi'num name records");
    hortis.writeCSV("hulq-mismatches.csv", ["taxon", "found"], withoutHulq, fluid.promise());
    resolved.combinedOutMap = hortis.combineMaps([resolved.combinedOutMap, hortis.xetthecum.valueOutMap, hortis.xetthecum.extraOutMap]);
};

// e.g. input of .../audio/ey'x_Levi_Wilson_&_Emily_Menzies_Galiano_Island_2022-02-20.WAV
// becomes audio/ey_x_Levi_Wilson_&_Emily_Menzies_Galiano_Island_2022-02-20.mp3
hortis.xetthecum.transformAudioPath = function (audioPath) {
    const rel = audioPath.substring(".../".length); // Weird initial paths in Species_media table
    const lower = rel.replaceAll("'", "_"); // Google Drive export does this
    return lower.replace(/\.WAV$/, ".mp3");
};

hortis.xetthecum.assignHulqMedia = function (resolved, patch) {
    const byTaxon = {};
    const usedTaxa = {};
    patch.patchData.rows.forEach(function (row) {
        const sanitized = hortis.sanitizeSpeciesName(row.scientificName);
        byTaxon[sanitized] = row;
    });
    resolved.summarisedRows.forEach(function (row) {
        const taxon = row.iNaturalistTaxonName;
        const resolve = hortis.xetthecum.taxonResolution[taxon];
        const useLookup = resolve || taxon;
        const hulqRow = byTaxon[useLookup];
        if (hulqRow) {
            usedTaxa[taxon] = true;
            row.audioLink = hortis.xetthecum.transformAudioPath(hulqRow.audioPath);
        }
    });
    resolved.combinedOutMap = hortis.combineMaps([resolved.combinedOutMap, hortis.xetthecum.mediaOutMap]);
    hortis.xetthecum.summariseUnseen(byTaxon, usedTaxa, "Hul'qumi'num media data");
};
