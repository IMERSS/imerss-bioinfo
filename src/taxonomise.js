/* eslint-env node */
/* eslint dot-notation: "off"*/
"use strict";

var fluid = require("infusion");
var minimist = require("minimist");

require("./dataProcessing/readJSON.js");
require("./dataProcessing/readCSV.js");
require("./dataProcessing/readCSVwithMap.js");
require("./dataProcessing/filterFirst.js");
require("./utils/settleStructure.js");

fluid.setLogging(true);
fluid.defeatLogging = true;

var hortis = fluid.registerNamespace("hortis");

var parsedArgs = minimist(process.argv.slice(2));

var taxaMap = hortis.readJSONSync("data/iNaturalist/iNaturalist-taxa-map.json", "reading iNaturalist taxa map file");
var dataMap = hortis.readJSONSync(parsedArgs._[1] || "data/Valdes/Valdes-map.json", "reading Observations map file");
var dataOutMap = hortis.readJSONSync(parsedArgs._[2] || "data/Valdes/Valdes-out-map.json", "reading Observations output map file");
var taxonResolveMap = hortis.readJSONSync("data/TaxonResolution-map.json", "reading taxon resolution map");
var swaps = hortis.readJSONSync("data/taxon-swaps.json5", "reading taxon swaps file");

hortis.parseFilters = function (argFilters) {
    var filters = fluid.makeArray(argFilters);
    return filters.map(function (oneFilter) {
        var eqpos = oneFilter.indexOf("=");
        if (eqpos === -1) {
            fluid.fail("Filter string " + oneFilter + " must be of the form <column>=<value>");
        } else {
            var togo = {
                column: oneFilter.substring(0, eqpos),
                value: oneFilter.substring(eqpos + 1)
            };
            if (!dataMap.columns[togo.column]) {
                fluid.fail("Column " + togo.column + " is unknown in input map file");
            }
            return togo;
        }
    });
};

var parsedFilters = hortis.parseFilters(parsedArgs.filter);

hortis.invertSwaps = function (swaps) {
    var invertedSwaps = {};
    fluid.each(swaps, function (value, resolvedTaxon) {
        fluid.each(value.taxonNames, function (record, taxonName) {
            if (record.type !== "commonName") {
                invertedSwaps[taxonName] = resolvedTaxon;
            }
        });
    });
    return invertedSwaps;
};

var invertedSwaps = hortis.invertSwaps(swaps);

var dataPromises = {
    observations: hortis.bagatelle.csvReader({
        inputFile: parsedArgs._[0] || "data/Valdes/Valdes marine data (dives included).csv",
        mapColumns: dataMap.columns
    }).completionPromise,
    taxa: hortis.bagatelle.csvReader({
        inputFile: "data/iNaturalist/iNaturalist-taxa.csv",
        mapColumns: taxaMap.columns
    }).completionPromise
};

hortis.sanitizeSpeciesName = function (name) {
    name = name.trim();
    [" sp.", " spp.", "?", " etc."].forEach(function (toRemove) {
        var index = name.indexOf(toRemove);
        if (index !== -1) {
            name = name.substring(0, index);
        }
    });
    name = name.replace(" ssp.", "");
    name = name.replace(" var.", "");
    name = name.replace(" s.lat.", "");
    name = name.replace(" cf ", " ");
    name = name.replace(" x ", " × ");
    return name;
};

hortis.iNaturalistIdToLink = function (id) {
    return "https://www.inaturalist.org/taxa/" + id;
};

hortis.resolveTaxa = function (target, taxaById, taxonId, columns) {
    var taxon = taxaById[taxonId];
    while (taxon.parentNameUsageId) {
        if (columns[taxon.taxonRank]) {
            target[taxon.taxonRank] = taxon.scientificName;
        }
        taxon = taxaById[taxon.parentNameUsageId];
    }
};

hortis.filterOneRow = function (row, filters) {
    return filters.every(function (oneFilter) {
        return row[oneFilter.column] === oneFilter.value;
    });
};

hortis.filterRows = function (rows, filters) {
    return rows.filter(function (oneRow) {
        return hortis.filterOneRow(oneRow, filters);
    });
};

hortis.doFilterFirst = function (outrows) {
    var that = hortis.filterFirst({
        dateField: dataOutMap.dateField,
        uniqueField: dataOutMap.uniqueField
    });
    outrows.forEach(that.storeRow);
    that.destroy();
    return that.uniqueRows;
};

hortis.writeReintegratedObservations = function (fileName, observations, taxaById, lookups) {
    var outrows = [];
    observations.forEach(function (row, index) {
        var lookup = lookups[index];
        if (lookup) {
            var outrow = fluid.copy(row);
            outrow.iNaturalistTaxonName = lookup.scientificName;
            outrow.iNaturalistTaxonId = lookup.taxonId;
            hortis.resolveTaxa(outrow, taxaById, lookup.taxonId, dataOutMap.columns);
            outrows.push(outrow);
        }
    });
    outrows = hortis.doFilterFirst(outrows);

    var promise = fluid.promise();
    hortis.bagatelle.writeCSV(fileName, dataOutMap.columns, outrows, promise);
};

hortis.settleStructure(dataPromises).then(function (data) {
    console.log("Loaded " + data.observations.rows.length + " observations to match against " + data.taxa.rows.length + " taxa");
    var taxaHash = {};
    var taxaById = {};
    data.taxa.rows.forEach(function (taxon) {
        taxaHash[taxon.scientificName] = taxon;
        taxaById[taxon.taxonId] = taxon;
    });
    var identifiedTo = {}; // Two-level hash of {taxonLevel, obs index} to obs
    var lookups = [];
    var obsRows = hortis.filterRows(data.observations.rows, parsedFilters);
    if (parsedFilters.length > 0) {
        console.log("Filtered observations to list of " + obsRows.length + " with " + parsedFilters.length + " filters");
    }
    obsRows.forEach(function (obs, index) {
        var san = hortis.sanitizeSpeciesName(obs.taxonName);
        var taxonLevel = "Undetermined";
        if (!san.includes("undetermined")) {
            var resolved = invertedSwaps[san];
            if (resolved) {
                san = resolved;
            }
            var lookup = taxaHash[san];
            if (lookup) {
                taxonLevel = lookup.taxonRank;
                lookups[index] = lookup;
            }
        }
        fluid.set(identifiedTo, [taxonLevel, obs.index], obs);
    });
    fluid.each(identifiedTo, function (recs, taxonLevel) {
        console.log("Identified " + Object.keys(recs).length + " records to " + taxonLevel);
    });
    var undets = identifiedTo["Undetermined"];

    var undetHash = {};
    fluid.each(undets, function (undet) {
        if (!undet.taxonName.includes("undetermined")) {
            undetHash[undet.taxonName] = undet;
        }
    });
    var undetKeys = Object.keys(undetHash).sort();
    console.log("Listing " + undetKeys.length + " undetermined species in observations: ");
    console.log(undetKeys.join("\n"));
    var resolutionRows = fluid.transform(undetKeys, function (undetKey) {
        return {
            taxonName: undetKey,
            commonName: undetHash[undetKey].commonName
        };
    });
    var promise = fluid.promise();
    var writeResolutionFile = parsedArgs.writeRes;
    if (writeResolutionFile) {
        hortis.bagatelle.writeCSV("taxonResolution.csv", taxonResolveMap.columns, resolutionRows, promise);
    }
    hortis.writeReintegratedObservations(parsedArgs.o || "reintegrated.csv", obsRows, taxaById, lookups);
});
