/* eslint-env node */
/* eslint dot-notation: "off"*/
"use strict";

var fluid = require("infusion");
var fs = require("fs");

fluid.require("%bagatelle");

var minimist = require("minimist");

require("./dataProcessing/readJSON.js");
require("./dataProcessing/readCSV.js");
require("./dataProcessing/readCSVwithMap.js");
require("./dataProcessing/writeCSV.js");
require("./dataProcessing/summarise.js");
require("./utils/utils.js");
require("./utils/settleStructure.js");
require("./iNaturalist/iNatUrls.js");

fluid.setLogging(true);
fluid.defeatLogging = true;

var hortis = fluid.registerNamespace("hortis");

var parsedArgs = minimist(process.argv.slice(2));

var taxaMap = hortis.readJSONSync("data/iNaturalist/iNaturalist-taxa-map.json", "reading iNaturalist taxa map file");
var taxonResolveMap = hortis.readJSONSync("data/TaxonResolution-map.json", "reading taxon resolution map");
var swaps = hortis.readJSONSync("data/taxon-swaps.json5", "reading taxon swaps file");
var fusion = hortis.readJSONSync(parsedArgs.fusion);

hortis.ranks = fluid.freezeRecursive(require("../data/ranks.json"));

hortis.baseCommonOutMap = fluid.freezeRecursive({
    "counts": {
        "observationCount": {
            "column": "observationCount",
            "free": true
        }
    },
    "columns": {
        "observationCount": "Observation count",
        "iNaturalistTaxonName": "iNaturalist taxon name",
        "iNaturalistTaxonId": "iNaturalist taxon ID",
        "coords": "Coordinates"
    }
});

hortis.ranksToColumns = function (ranks) {
    return fluid.transform(fluid.arrayToHash(ranks), function (troo, key) {
        return hortis.capitalize(key);
    });
};

hortis.commonOutMap = fluid.freezeRecursive(fluid.extend(true, {}, hortis.baseCommonOutMap, {
    columns: hortis.ranksToColumns(hortis.ranks)
}));

hortis.combineOutMaps = function (outMaps) {
    var extendArgs = [true, {}, hortis.commonOutMap].concat(outMaps);
    return fluid.extend.apply(null, extendArgs);
};

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

hortis.checkFilters = function (filter, mapColumns) {
    fluid.each(filter, function (oneFilter) {
        if (!mapColumns[oneFilter.column]) {
            fluid.fail("Column " + oneFilter.column + " is unknown in input map file");
        }
    });
    return filter || [];
};

hortis.makeObsIdGenerator = function (idField) {
    if (idField.includes("(")) {
        var parsed = fluid.compactStringToRec(idField, "idGenerator");
        return function (obsRow) {
            var expandArgs = fluid.transform(parsed.args, function (arg) {
                return fluid.stringTemplate(arg, obsRow);
            });
            return fluid.invokeGlobalFunction(parsed.funcName, expandArgs);
        };
    } else { // It must be a simple reference
        return function (obsRow, rowNumber) {
            var terms = fluid.extend({}, obsRow, {rowNumber: rowNumber});
            return fluid.stringTemplate(idField, terms);
        };
    }
};

hortis.assignObsIds = function (rows, map) {
    if (map.observationId) {
        var idGenerator = hortis.makeObsIdGenerator(map.observationId);
        rows.forEach(function (row, index) {
            var id = map.datasetId + ":" + idGenerator(row, index);
            row.observationId = id;
        });
    }
    return rows;
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

hortis.resolvePaths = function (obj, pathKeys) {
    pathKeys.forEach(function (pathKey) {
        var path = obj[pathKey];
        if (!path) {
            fluid.fail("Dataset record ", obj, " is missing required member " + pathKey);
        }
        obj[pathKey] = fluid.module.resolvePath(path);
    });
};

hortis.oneDatasetToLoadable = function (dataset) {
    hortis.resolvePaths(dataset, ["map", "outMap", "input"]);
    // TODO: Turn this into a component with transform chain elements some day
    var map = hortis.readJSONSync(dataset.map, "reading Observations map file");
    var rawInput = hortis.csvReaderWithMap({
        inputFile: dataset.input,
        mapColumns: map.columns
    }).completionPromise;
    var parsedFilters = hortis.checkFilters(dataset.filters, map.columns);
    return {
        rawInput: rawInput,
        obsRows: fluid.promise.map(rawInput, function (data) {
            var rowsWithId = hortis.assignObsIds(data.rows, map);
            var filteredRows = hortis.filterRows(rowsWithId, parsedFilters);
            if (parsedFilters.length > 0) {
                console.log("Filtered observations to list of " + filteredRows.length + " with " + parsedFilters.length + " filters");
            }
            return filteredRows;
        }),
        map: map,
        outMap: hortis.readJSONSync(dataset.outMap, "reading Observations output map file")
    };
};

hortis.datasetsToLoadable = function (datasets) {
    return fluid.transform(datasets, function (dataset) {
        return hortis.oneDatasetToLoadable(dataset);
    });
};

hortis.fusionToLoadable = function (fusion, taxaMap) {
    return {
        datasets: hortis.datasetsToLoadable(fusion.datasets),
        taxa: hortis.csvReaderWithMap({
            inputFile: "data/iNaturalist/iNaturalist-taxa.csv",
            mapColumns: taxaMap.columns
        }).completionPromise
    };
};

var dataPromises = hortis.fusionToLoadable(fusion, taxaMap);

hortis.sanitizeSpeciesName = function (name) {
    name = name.trim();
    [" sp.", " spp.", "?", " etc.", " / "].forEach(function (toRemove) {
        var index = name.indexOf(toRemove);
        if (index !== -1) {
            name = name.substring(0, index);
        }
    });
    name = name.replace("�", "ue");
    name = name.replace(/ (\(.*\))/g, "");
    name = name.replace(" ssp.", "");
    name = name.replace(" grp.", "");
    name = name.replace(" var.", "");
    name = name.replace(" ined.", "");
    name = name.replace(" aff.", "");
    name = name.replace(" s.lat.", "");
    name = name.replace(" species complex", "");
    name = name.replace(" complex", "");
    name = name.replace(" cf ", " ");
    name = name.replace(" x ", " × ");
    return name;
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

hortis.blankRow = function (row) {
    return fluid.transform(row, function (/* col */) {
        return "";
    });
};

hortis.doSummarise = function (outrows, outMap, summarise) {
    var that = hortis.summarise();
    outrows.forEach(that.storeRow);
    that.destroy();
    if (summarise) {
        fluid.each(that.uniqueRows, function (row) {
            row.coords = row.coords && JSON.stringify(row.coords);
        });
    } else if (Object.keys(that.discardedRows).length) {
        var outDiscards = [];
        console.log("Warning: the following rows were discarded as duplicates:");
        fluid.each(that.discardedRows, function (discardedRows) {
            outDiscards.push.apply(outDiscards, discardedRows);
            outDiscards.push(hortis.blankRow(discardedRows[0]));
        });
        hortis.writeCSV("duplicates.csv", outMap.columns, outDiscards, fluid.promise());
        console.log(outDiscards.length + " duplicate rows written to duplicates.csv");
    }
    return that.uniqueRows;
};

hortis.makeTaxonomiser = function (data) {
    var that = {
        taxaHash: {}, // map iNat scientificName to taxon
        taxaById: {},  // map iNat taxonId to taxon
        // Initialised from observations:
        lookups: [],  // Map of obs index to iNat taxon
        undetHash: {}, // Map of taxon name to undetermined taxon
        undetKeys: [] // Keys of undetHash
    };
    data.taxa.rows.forEach(function (taxon) {
        that.taxaHash[taxon.scientificName] = taxon;
        that.taxaById[taxon.taxonId] = taxon;
    });
    return that;
};

hortis.applyObservations = function (that, taxa, obsRows) {
    var identifiedTo = {}; // Two-level hash of {taxonLevel, obs index} to obs
    obsRows.forEach(function (obs, index) { // TODO - get better index
        var san = hortis.sanitizeSpeciesName(obs.taxonName);
        var taxonLevel = "Undetermined";
        if (!san.includes("undetermined")) {
            var resolved = invertedSwaps[san];
            if (resolved) {
                san = resolved;
            }
            var lookup = that.taxaHash[san];
            if (lookup) {
                taxonLevel = lookup.taxonRank;
                that.lookups[index] = lookup;
            }
        }
        fluid.set(identifiedTo, [taxonLevel, obs.index], obs);
    });
    fluid.each(identifiedTo, function (recs, taxonLevel) {
        console.log("Identified " + Object.keys(recs).length + " records to " + taxonLevel);
    });
    var undets = identifiedTo["Undetermined"];

    fluid.each(undets, function (undet) {
        if (!undet.taxonName.includes("undetermined")) {
            that.undetHash[undet.taxonName] = undet;
        }
    });
    var undetKeys = Object.keys(that.undetHash).sort();
    console.log("Listing " + undetKeys.length + " undetermined species in observations: ");
    console.log(undetKeys.join("\n"));
    that.undetKeys = undetKeys;
};

hortis.writeReintegratedObservations = function (that, fileName, observations, outMap, summarise) {
    var outrows = [];
    observations.forEach(function (row, index) {
        var lookup = that.lookups[index];
        if (lookup) {
            var outrow = fluid.copy(row);
            outrow.iNaturalistTaxonName = lookup.scientificName;
            outrow.iNaturalistTaxonId = lookup.taxonId;
            hortis.resolveTaxa(outrow, that.taxaById, lookup.taxonId, outMap.columns);
            outrows.push(outrow);
        }
    });
    outrows = hortis.doSummarise(outrows, outMap, summarise);

    var promise = fluid.promise();
    hortis.writeCSV(fileName, outMap.columns, outrows, promise);
};

hortis.writeCombinedOutMap = function (inFilename, doc) {
    var filename = fluid.module.resolvePath(inFilename);
    var formatted = JSON.stringify(doc, null, 4);
    fs.writeFileSync(filename, formatted);
    console.log("Written " + formatted.length + " bytes to " + filename);
};

hortis.writeResolutionFile = function (that) {
    var resolutionRows = fluid.transform(that.undetKeys, function (undetKey) {
        return {
            taxonName: undetKey,
            commonName: that.undetHash[undetKey].commonName
        };
    });
    var promise = fluid.promise();
    hortis.writeCSV("taxonResolution.csv", taxonResolveMap.columns, resolutionRows, promise);
};

hortis.settleStructure(dataPromises).then(function (data) {
    var datasets = data.datasets;
    var flatObs = [];
    fluid.each(datasets, function (dataset) {
        flatObs = flatObs.concat(dataset.obsRows);
    });
    console.log("Loaded " + flatObs.length + " observations from " + hortis.pluralise(Object.keys(datasets).length, "dataset") +
        " to match against " + data.taxa.rows.length + " taxa");
    var that = hortis.makeTaxonomiser(data);
    hortis.applyObservations(that, data.taxa, flatObs);

    var writeResolutionFile = parsedArgs.writeRes; // TODO: doesn't seem that this is read or modified any more
    if (writeResolutionFile) {
        hortis.writeResolutionFile(that);
    }
    var summarise = parsedArgs.summarise || fusion.summarise;
    var combinedOutMap = hortis.combineOutMaps(Object.values(fluid.getMembers(datasets, "outMap")));
    combinedOutMap.datasets = fusion.datasets;
    hortis.writeReintegratedObservations(that, parsedArgs.dry ? "reintegrated.csv" :
        fluid.module.resolvePath(fusion.output), flatObs, combinedOutMap, summarise);
    hortis.writeCombinedOutMap(fusion.combinedOutMap, combinedOutMap);
}, function (err) {
    fluid.fail("Error loading data", err);
    console.log(err.stack);
});
