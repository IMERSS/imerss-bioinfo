/* eslint-env node */

"use strict";

const fluid = require("infusion");
const minimist = require("minimist");
const moment = require("moment-timezone");
const ExcelJS = require("exceljs");
const fs = require("fs");

fluid.require("%imerss-bioinfo");

require("./dataProcessing/readJSON.js");
require("./dataProcessing/readCSV.js");
require("./dataProcessing/readCSVwithMap.js");
require("./dataProcessing/readCSVwithoutMap.js");
require("./dataProcessing/writeCSV.js");
require("./expressions/expr.js");
require("./utils/utils.js");

const hortis = fluid.registerNamespace("hortis");

hortis.ranks = Object.freeze(require("../data/ranks.json"));
hortis.reverseRanks = Object.freeze(fluid.makeArray(hortis.ranks).reverse());

fluid.setLogging(true);

const parsedArgs = minimist(process.argv.slice(2));

require("./WoRMS/taxonAPI.js");
const WoRMSTaxonAPIFileBase = "data/WoRMS/taxonAPI";

// Yes, if only it actually were a pipeline!
const pipeline = hortis.readJSONSync(parsedArgs.pipeline || "data/dataPaper-I-in/arpha-out.json5");

const summaryMap = hortis.readJSONSync(fluid.module.resolvePath(pipeline.summaryFileMap), "reading summary map file");

const summaryReader = hortis.csvReaderWithMap({
    inputFile: fluid.module.resolvePath(pipeline.summaryFile),
    mapColumns: summaryMap.columns
});

const obsMap = hortis.readJSONSync(fluid.module.resolvePath(pipeline.obsFileMap), "reading obs map file");

const obsReader = hortis.csvReaderWithMap({
    inputFile: fluid.module.resolvePath(pipeline.obsFile),
    mapColumns: obsMap.columns
});

const patchReader = pipeline.patchFile ? hortis.csvReaderWithoutMap({
    inputFile: fluid.module.resolvePath(pipeline.patchFile)
}) : {
    completionPromise: fluid.promise().resolve([]),
    rows: []
};

const outputDir = fluid.module.resolvePath(pipeline.outputDir);
fs.mkdirSync(outputDir, { recursive: true });

hortis.genusEx = /\((.*)\)/;

hortis.normalise = function (str) {
    return str.replace(/\s+/g, " ").trim();
};

// Variant for summaries
hortis.extractGenus = function (name, outRow) {
    const matches = hortis.genusEx.exec(name);
    let togo;
    if (matches) {
        outRow.Subgenus = matches[1];
        togo = name.replace(hortis.genusEx, "");
    } else {
        togo = name;
    }
    return hortis.normalise(togo);
};

// Variant for obs -> Darwin Core
hortis.axeFromName = ["sp.", "ssp.", "spp.", "complex", "sp.A", "sp.B", "B"];

hortis.qualForming = ["agg", "aff.", "s.lat.", "cf", "sp.nov.", "var."];

hortis.extractSubgenus = function (seg, outRow) {
    if (seg.startsWith("(") && seg.endsWith(")")) {
        outRow.subgenus = seg.substring(1, seg.length - 1);
        return 1;
    } else {
        return 0;
    }
};

hortis.findRank = function (row, ranks) {
    return ranks.find(function (rank) {
        return !!row[rank];
    });
};

/*
 * AS of 19/7/21
 * so yes, in the 'qualifier' field I think the only relevant values from our dataset are: 'cf', 'species complex', 'sp.A', and 'sp.B'
 * in the 'identificationRemarks' field we will add the critical note
 * so let's discard 'sp.' and 'spp.' from the catalogue
 * we will only use it in the curated summary / checklists
 */

hortis.extractQualifier = function (name, outRow) {
    const words = name.split(" ");
    // Unconditionally axe sp/spp/ssp from all words
    const useWords = words.filter(function (word) {
        return !hortis.axeFromName.includes(word);
    });

    // Filter out even qualifier-forming terms so that we can populate broken-out fields and scientificName
    const bareWords = useWords.filter(function (word) {
        return !hortis.qualForming.includes(word);
    });

    const sspPoint = 1 + hortis.extractSubgenus(bareWords[1] || "", outRow);

    const lastBareWords = bareWords.slice(sspPoint);
    const rank = hortis.findRank(outRow, hortis.reverseRanks);

    if (rank === "genus" || rank === "species") {
        outRow.genus = bareWords[0];
    }

    if (lastBareWords.length === 0) {
        outRow.taxonRank = rank;
    } else if (lastBareWords.length === 1) {
        outRow.specificEpithet = lastBareWords[0];
        outRow.taxonRank = "species";
    } else if (lastBareWords.length === 2) {
        outRow.specificEpithet = lastBareWords[0];
        outRow.infraspecificEpithet = lastBareWords[1];
        outRow.taxonRank = "subspecies";
    }

    const qualPoint = useWords.findIndex(function (word) {
        return hortis.qualForming.includes(word);
    });
    if (outRow.subgenus) {
        lastBareWords.unshift("(" + outRow.subgenus + ")");
    }

    outRow.identificationQualifier = qualPoint === -1 ? "" : useWords.slice(qualPoint).join(" ");
    outRow.scientificName = [outRow.genus, ...lastBareWords].join(" ");

};

// Reviewer recommendation 7
hortis.normaliseSex = function (outRow) {
    const sexes = [];
    const sex = outRow.sex;
    if (sex.match(/(([^f][^e]|^)male)|M/)) {
        sexes.push("male");
    }
    if (sex.match(/female|F/)) {
        sexes.push("female");
    }
    const newSexes = sexes.join(", ");
    if (sex !== newSexes) {
        outRow.occurrenceRemarks = outRow.sex;
        outRow.sex = newSexes;
    }
};

// Variant for summaries
hortis.extractSsp = function (name, outRow) {
    const words = name.split(" ");

    if (words.length === 3) {
        const maybeSsp = words[2];
        if (maybeSsp.startsWith("complex")
            || maybeSsp.startsWith("agg")
            || maybeSsp.startsWith("s.lat.")
            || words[1].startsWith("cf")) {
            outRow.Species = words[1] + " " + maybeSsp;
        } else {
            outRow.Species = words[1];
            outRow.Subspecies = maybeSsp;
        }
    } else if (words.length === 2) {
        outRow.Species = words[1];
    } else {
        fluid.fail("Unexpected species name " + name);
    }
};

// Also in coordinatePatch.js, leafletMap.js
hortis.datasetIdFromObs = function (obsId) {
    const colpos = obsId.indexOf(":");
    return obsId.substring(0, colpos);
};

hortis.badDates = {};

hortis.formatDate = function (row, template) {
    let togo = "";
    const format = template.substring("!Date:".length);
    // TODO: This should actually be applied in the data loader
    const momentVal = moment.tz(row.dateObserved, "Canada/Pacific");
    if (momentVal.isValid()) {
        // RBCM records claim to have a time but they don't
        const noTime = !row.dateObserved.includes("T") || row.dateObserved.includes("T00:00:00");
        togo = noTime && format.includes("H") ? "" : momentVal.format(format);
    } else {
        const obsId = row.observationId;
        if (!hortis.badDates[obsId]) {
            console.log("WARNING: row " + row.observationId + " has invalid date " + row.dateObserved);
        }
        hortis.badDates[obsId] = true;
    }
    return togo;
};

// TODO: Of course we need to pipeline the whole of ARPHA export
hortis.quantiseDepth = function (outRow, places) {
    const depth = outRow.verbatimDepth;
    if (depth === "o-86") {
        outRow.verbatimDepth = "0-86";
        outRow.minimumDepthInMeters = "0";
        outRow.maximumDepthInMeters = "86";
    } else {
        const togo = hortis.roundDecimals(depth, places);
        if (togo && isNaN(togo)) {
            console.log("WARNING: row " + outRow.occurrenceID + " has invalid depth " + depth);
        }
        outRow.verbatimDepth = togo;
    }
};

// Table of bad "count" entries from PMLS data
hortis.badCountTable = {
    "1 patc": "1 patch",
    "1tiny":  "1 tiny",
    "2 (pair0": "2",
    "2 larg": "2 large",
    "?": "",
    "`": "",
    "i": "",
    "-": "",
    "snall": "",
    "present": "",
    "NA": "",
    "white and cream": ""
};

// Technical reviewer recommendation 4
hortis.mapIndividualCount = function (outRow) {
    const count = outRow.individualCount;
    const lookup = hortis.badCountTable[count];
    const mapped = lookup === undefined ? count : lookup;
    if (mapped && !hortis.isInteger(mapped)) {
        outRow.occurrenceRemarks = "Count: " + mapped;
        outRow.individualCount = "";
    } else {
        outRow.individualCount = mapped;
    }
};

hortis.countDecimals = function (value) {
    const string = value.toString();
    const dotpos = string.indexOf(".");
    return dotpos === -1 ? dotpos : string.length - 1 - dotpos;
};


hortis.correctUncertainty = function (outRow) {
    // 2nd round reviewer recommendation 9
    const uncertainty = outRow.coordinateUncertaintyInMeters;
    const val = hortis.parseFloat(uncertainty);
    if (isNaN(val) || val < 1) {
        outRow.coordinateUncertaintyInMeters = "";
    }
    // 3rd round reviewer recommendation 3
    if (!outRow.coordinateUncertaintyInMeters) {
        const decimals = Math.min(hortis.countDecimals(outRow.decimalLatitude), hortis.countDecimals(outRow.decimalLongitude));
        if (decimals === -1) {
            console.log("ERROR: unable to find coordinate resolution for row without coordinate uncertainty ", outRow);
        } else { // 2 -> 4, 3 -> 3, 4 -> 2, 5-> 2
            const scale = Math.min(Math.max(6 - decimals, 2), 4);
            outRow.coordinateUncertaintyInMeters = Math.pow(10, scale);
            const comment = "coordinate uncertainty inferred from coordinate resolution";
            outRow.georeferenceRemarks = outRow.georeferenceRemarks ? outRow.georeferenceRemarks + "; " + comment : comment;
        }
    }
};

// 2nd round reviewer recommendation 10
hortis.correctLocalityTable = {
    "e96b99b5-e978-49b0-a151-b5e5eb0f0981": "Trincomali Channel",
    "29392e13-0c6b-4ea0-9c3d-bec39ae428a3": "Trincomali Channel",
    "dfead0da-98f0-4ed1-b6c2-d270339704ee": "Trincomali Channel",
    "f8ebf88e-6e0a-4a6e-a888-5f837d5326b6": "Trincomali Channel",
    "0c5923fe-91e6-423e-bedf-1d46a0b89273": "Trincomali Channel"
};

hortis.correctLocality = function (outRow) {
    const lookup = hortis.correctLocalityTable[outRow.occurrenceID];
    if (lookup !== undefined) {
        outRow.locality = lookup;
    }
};

// 2nd round reviewer recommendation 11
hortis.cleanIdRemarks = function (outRow) {
    outRow.identificationRemarks = outRow.identificationRemarks.replace(/\"/g, "");
};

hortis.normaliseRecorders = function (recordedBy) {
    // Technical reviewer recommendation 5
    const separators = recordedBy.replace("; ", " | ").trim();
    // Technical reviewer recommendation 6
    const togo = separators === "anonymous" ? "" : separators;
    return togo;
};

// 2nd round reviewer recommendation 13
hortis.badEventRemarksTable = {
    "/": "",
    "?": "",
    "??": "",
    "#NAME?": ""
};

hortis.cleanEventRemarks = function (outRow) {
    const lookup = hortis.badEventRemarksTable[outRow.eventRemarks];
    if (lookup !== undefined) {
        outRow.eventRemarks = lookup;
    }
};

/* Accepts a row of a summary, and the column structure inside "Taxa" */

hortis.mapTaxaRows = function (rows, columns, materialsMap) {
    return fluid.transform(rows, function (row) {
        const summaryRow = materialsMap.summaryIndex[row.iNaturalistTaxonId];
        const togo = {};
        fluid.each(columns, function (template, target) {
            togo[target] = hortis.stringTemplate(template, row);
        });
        if (row.species !== "" || row.genus !== "") {
            const degenified = hortis.extractGenus(row.taxonName, togo);
            hortis.extractSsp(degenified, togo);
        }
        if (summaryRow) {
            // Account for observations which have been hacked by assigning them to proxy iNat taxa - in theory we should
            // copy more fields but we have managed to assign these to, e.g. proxies in the same family
            const proxySummary = fluid.copy(summaryRow);
            // Replicate this piece of workflow from mapMaterialsRows
            hortis.extractQualifier(summaryRow.taxonName, proxySummary);
            togo.Genus = proxySummary.genus;
        }
        return togo;
    });
};

hortis.stashMismatchedRow = function (mismatches, patchIndex, obsRow, summaryRow) {
    const key = obsRow.previousIdentifications + "|" + obsRow.scientificName;
    const patchRow = patchIndex[key];
    if (patchRow) {
        if (patchRow.Disposition === "P") {
            obsRow.scientificName = obsRow.previousIdentifications;
        } else if (patchRow.Disposition === "S") {
            const desp = obsRow.previousIdentifications.replace(" sp.", "");
            obsRow.scientificName = desp + " sp.";
        } else if (patchRow.Disposition === "X") {
            console.log("!!! Unexpected use of patch with key " + key);
        }
    } else {
        const existing = mismatches[key];
        if (!existing) {
            mismatches[key] = fluid.extend({
                previousIdentifications: obsRow.previousIdentifications
            }, summaryRow);
            console.log("Stashing mismatched row ", mismatches[key]);
        }
    }
};

hortis.mapMaterialsRows = function (rows, patchIndex, materialsMap, references, columns) {
    return fluid.transform(rows, function (row) {
        const togo = {};
        const dataset = hortis.datasetIdFromObs(row.observationId);
        const summaryRow = materialsMap.summaryIndex[row.iNaturalistTaxonId];
        const termMap = fluid.extend({}, row, {
            summary: summaryRow
        });
        // row.scientificName = summaryRow ? summaryRow.taxonName : "";
        const refBlock = references[dataset];
        fluid.each(columns, function (template, target) {
            let outVal = "";
            if (refBlock && refBlock[target]) {
                outVal = refBlock[target];
            }
            if (template.startsWith("!references.")) {
                const ref = template.substring("!references.".length);
                outVal = refBlock && refBlock[ref] || "";
            } else if (template.startsWith("!Date:")) {
                outVal = hortis.formatDate(row, template);
            } else {
                outVal = hortis.stringTemplate(template, termMap) || outVal;
            }
            if (outVal === "Confidence: ") { // blatant special casing
                outVal = "";
            }
            togo[target] = outVal;
        });
        if (!togo.occurrenceID) {
            togo.occurrenceID = "imerss.org:" + row.observationId;
        }

        if (row.coordinatesCorrected === "yes") {
            togo.georeferencedBy = "Andrew Simon";
            togo.georeferenceProtocol = "interpretation of locality, and/or inference based on local knowledge and species ecology";
            togo.georeferenceVerificationStatus = "corrected";
            togo.georeferenceRemarks = row.coordinatesCorrectedNote;
        }
        // Note that previousIdentifications is taken from the row's own "taxonName" field from the original obs
        if (togo.scientificName !== togo.previousIdentifications) {
            hortis.stashMismatchedRow(materialsMap.mismatches, patchIndex, togo, summaryRow);
        }
        hortis.extractQualifier(togo.scientificName, togo);
        hortis.normaliseSex(togo);
        if (summaryRow && summaryRow.criticalNotes) {
            togo.identificationRemarks = summaryRow.criticalNotes;
        }

        // var filename = hortis.WoRMSTaxa.filenameFromTaxonName(WoRMSTaxonAPIFileBase, row.iNaturalistTaxonName);
        // var wormsRec = hortis.readJSONSync(filename);
        // togo.taxonID = "WoRMS:" + wormsRec.AphiaID;
        togo.taxonID = "iNaturalist:" + row.iNaturalistTaxonId;

        togo.recordedBy = hortis.normaliseRecorders(togo.recordedBy);
        togo.georeferencedBy = hortis.normaliseRecorders(togo.georeferencedBy);

        hortis.quantiseDepth(togo, 2);
        hortis.mapIndividualCount(togo);
        hortis.correctUncertainty(togo);
        hortis.correctLocality(togo);
        hortis.cleanIdRemarks(togo);
        hortis.cleanEventRemarks(togo);
        return togo;
    });
};

hortis.writeSheet = function (workbook, sheetName, rows) {
    const sheet = workbook.addWorksheet(sheetName);
    const keys = Object.keys(rows[0]);
    const header = sheet.getRow(1);
    keys.forEach(function (key, index) {
        header.getCell(index + 1).value = key;
    });
    rows.forEach(function (row, rowIndex) {
        const sheetRow = sheet.getRow(rowIndex + 2);
        keys.forEach(function (key, index) {
            sheetRow.getCell(index + 1).value = row[key];
        });
    });
};

hortis.writeExcel = function (sheets, key, outputDir) {
    if (sheets.Taxa.length === 0) {
        console.log("Skipping key " + key + " since no rows were selected");
        return fluid.promise().resolve();
    }
    const workbook = new ExcelJS.Workbook();

    fluid.each(sheets, function (sheet, sheetName) {
        hortis.writeSheet(workbook, sheetName, sheet);
    });

    const filename = outputDir + "/" + key + ".xlsx";
    const togo = workbook.xlsx.writeFile(filename);
    togo.then(function () {
        const stats = fs.statSync(filename);
        console.log("Written " + stats.size + " bytes to " + filename);
    });
    return togo;
};

hortis.indexSummary = function (summaryRows) {
    const togo = {};
    summaryRows.forEach(function (row) {
        togo[row.iNaturalistTaxonId] = row;
        if (row.subtaxonAuthority) { // All downstream steps expect only a single authority
            row.authority = row.subtaxonAuthority;
        }
    });
    return togo;
};

hortis.indexPatchRows = function (patchRows) {
    const togo = {};
    patchRows.forEach(function (row) {
        togo[row.previousIdentifications + "|" + row.taxonName] = row;
    });
    return togo;
};

// TODO: Worry if obs and summaries diverge in taxonomy
hortis.filterArphaRows = function (rows, rec, rowCount) {
    return rows.filter(function (row, index) {
        const parsed = hortis.expr.parse(rec.filter);
        const match = hortis.expr.evaluate(parsed, row);
        if (match) {
            ++rowCount[index];
        }
        return match;
    });
};

// Note - argument modified
hortis.sortRows = function (rows, sortBy) {
    const comparator = function (ra, rb) {
        return fluid.find(sortBy, function (column) {
            return ra[column] > rb[column] ? 1 : (ra[column] < rb[column] ? -1 : undefined);
        });
    };
    rows.sort(comparator);
};

hortis.verifyCounts = function (name, rowCount, rows) {
    rowCount.forEach(function (count, index) {
        if (count !== 1) {
            console.log("Anomalous " + name + " count for row " + index + ": " + count);
            console.log("Row contents: ", rows[index]);
        }
    });
};

hortis.eliminateEmptyColumns = function (rows) {
    const hasValue = {};
    rows.forEach(function (row) {
        fluid.each(row, function (value, key) {
            if (fluid.isValue(value) && value !== "") {
                hasValue[key] = true;
            }
        });
    });
    const valueKeys = Object.keys(hasValue);
    const togo = fluid.transform(rows, function (row) {
        return fluid.filterKeys(row, valueKeys);
    });
    return togo;
};

hortis.checkDuplicates = function (rows, eliminate) {
    const columns = ["occurrenceID"];
    const byDataset = {};

    columns.forEach(function (column) {
        console.log("Checking near duplicates by omitting column " + column);
        const buckets = {};
        const emittedKeys = {};
        const emitDuplicate = function (row) {
            const key = row[column];
            if (!emittedKeys[key]) {
                fluid.pushArray(byDataset, row.institutionCode, row);
                emittedKeys[key] = true;
            }
        };
        const outRows = [];
        let duplicates = 0;
        rows.forEach(function (row) {
            var filtered = fluid.censorKeys(row, [column]);
            var omitted = row[column] || true;
            var hash = Object.values(filtered).join("|");
            var oldValue = buckets[hash];
            if (oldValue) {
                emitDuplicate(oldValue);
                emitDuplicate(row);
                fluid.log("ERROR: duplicate row with contents " + hash + " and key " + omitted);
                ++duplicates;
            } else {
                buckets[hash] = row;
                outRows.push(row);
            }
        });
        if (duplicates) {
            console.log("Found " + duplicates + " duplicates");
        }
        if (eliminate && rows.length !== outRows.length) {
            console.log("After filtering duplicates, " + rows.length + " rows reduced to " + outRows.length);
            rows = outRows;
        }
    });
    fluid.each(byDataset.iNaturalist, function (row) {
        var id = row.occurrenceID;
        var iNatObs = id.substring(id.lastIndexOf(":") + 1);
        row.observationUrl = "https://www.inaturalist.org/observations/" + iNatObs;
    });
    fluid.each(byDataset, function (oneDataset, key) {
        var outfile = "materials-duplicates-" + key + ".csv";
        hortis.writeCSV(outfile, Object.keys(oneDataset[0]), oneDataset, fluid.promise());
    });
    return rows;
};

const completion = fluid.promise.sequence([summaryReader.completionPromise, obsReader.completionPromise, patchReader.completionPromise]);

completion.then(function () {
    const summaryRows = summaryReader.rows;
    console.log("Summary Input: " + summaryRows.length + " rows");
    const summaryRowCount = fluid.generate(summaryRows.length, 0);
    const obsRows = obsReader.rows;
    console.log("Obs Input: " + obsRows.length + " rows");
    const obsRowCount = fluid.generate(obsRows.length, 0);
    const summaryIndex = hortis.indexSummary(summaryRows); // also overrides authority with subtaxonAuthority
    const patchRows = patchReader.rows;
    console.log("Patch Input: " + patchRows.length + " rows");
    const patchIndex = hortis.indexPatchRows(patchRows);
    const materialsMap = {
        summaryIndex: summaryIndex,
        mismatches: {}
    };
    const now = Date.now();
    let allMaterials = [];
    const outs = fluid.transform(pipeline.files, function (rec, key) {
        const outSummaryRows = hortis.filterArphaRows(summaryRows, rec, summaryRowCount);
        console.log("Extracted " + outSummaryRows.length + " summary rows via filter " + key);

        const Taxa = pipeline.sheets.Taxa;
        const taxaRows = hortis.mapTaxaRows(outSummaryRows, Taxa.columns, materialsMap);
        hortis.sortRows(taxaRows, Taxa.sortBy);

        const outObsRows = hortis.filterArphaRows(obsRows, rec, obsRowCount);
        console.log("Extracted " + outObsRows.length + " obs rows via filter " + key);

        const materialsRows = hortis.mapMaterialsRows(outObsRows, patchIndex, materialsMap, pipeline.references, pipeline.sheets.Materials.columns);

        // This is the export file destined for GBIF
        allMaterials = allMaterials.concat(materialsRows);

        return {
            Taxa: taxaRows,
            Materials: materialsRows,
            ExternalLinks: [fluid.copy(pipeline.sheets.ExternalLinks.columns)]
        };
    });
    console.log("Total extracted obs rows: " + fluid.flatten(fluid.getMembers(outs, "Materials")).length);
    console.log("Filtered obs in " + (Date.now() - now) + " ms");
    hortis.verifyCounts("summary", summaryRowCount, summaryRows);
    hortis.verifyCounts("obs", obsRowCount, obsRows);
    const mismatches = Object.values(materialsMap.mismatches);
    if (mismatches.length > 0) {
        console.log("Writing " + mismatches.length + " mismatched rows to arphaMismatches.csv");
        hortis.writeCSV("arphaMismatches.csv", ["previousIdentifications", "taxonName"].concat(Object.keys(fluid.censorKeys(summaryRows[0], ["taxonName"]))), mismatches, fluid.promise());
    }

    hortis.sortRows(allMaterials, pipeline.sheets.Materials.sortBy);
    let filteredMaterials = hortis.eliminateEmptyColumns(allMaterials);
    filteredMaterials = hortis.checkDuplicates(filteredMaterials, true);
    hortis.writeCSV(outputDir + "/Materials.csv", Object.keys(filteredMaterials[0]), filteredMaterials, fluid.promise());

    fluid.each(outs, function (sheets, key) {
        hortis.writeExcel(sheets, key, outputDir);
    });
}, function (err) {
    console.log("Error ", err);
});
