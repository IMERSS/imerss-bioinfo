/* eslint-env node */

"use strict";

var fluid = require("infusion");
var hortis = fluid.registerNamespace("hortis");

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
        "foodValue": "Food Value",
        "medicinalValue": "Medicinal Value",
        "spiritualValue": "Spiritual Value",
        "materialValue": "Material Value",
        "tradeValue": "Trade Value",
        "indicatorValue": "Indicator Value"
    }
};

hortis.xetthecum.extraOutMap = {
    columns: {
        "hulqName": "Hulquminum Name",
        "hulqAuth": "Hulquminum Authority"
    }
};

hortis.xetthecum.mediaOutMap = {
    columns: {
        "audioLink": "Audio Link"
    }
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
        const hulqRow = byTaxon[taxon];
        if (!hulqRow) {
            withoutHulq.push({
                taxon: taxon,
                found: "no record"
            });
        } else {
            usedTaxa[taxon] = true;
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

hortis.xetthecum.assignHulqMedia = function (resolved, patch) {
    const byTaxon = {};
    const usedTaxa = {};
    patch.patchData.rows.forEach(function (row) {
        const sanitized = hortis.sanitizeSpeciesName(row.scientificName);
        byTaxon[sanitized] = row;
    });
    resolved.summarisedRows.forEach(function (row) {
        const taxon = row.iNaturalistTaxonName;
        const hulqRow = byTaxon[taxon];
        if (hulqRow) {
            usedTaxa[taxon] = true;
            row.audioLink = hulqRow.audioLink;
        }
    });
    resolved.combinedOutMap = hortis.combineMaps([resolved.combinedOutMap, hortis.xetthecum.mediaOutMap]);
    hortis.xetthecum.summariseUnseen(byTaxon, usedTaxa, "Hul'qumi'num media data");
};
