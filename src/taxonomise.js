/* eslint-env node */
/* eslint dot-notation: "off"*/
"use strict";

const fluid = require("infusion");

fluid.require("%imerss-bioinfo");

const minimist = require("minimist");

require("./dataProcessing/readJSON.js");
require("./dataProcessing/writeJSON.js");
require("./dataProcessing/readCSV.js");
require("./dataProcessing/readCSVwithMap.js");
require("./dataProcessing/writeCSV.js");
require("./dataProcessing/summarise.js");
require("./dataProcessing/coordinatePatch.js");
require("./geom/geoJSON.js");
require("./utils/utils.js");
require("./utils/settleStructure.js");
require("./iNaturalist/taxonAPI.js");

require("./xetthecum/xetthecumFilters.js"); // TODO: Bundle into open pipeline system when we can move to it

fluid.setLogging(true);
fluid.defeatLogging = true;

const hortis = fluid.registerNamespace("hortis");

let jwt;

try {
    jwt = hortis.readJSONSync("jwt.json", "reading JWT token file");
} catch (e) {
    console.log(e);
}

const iNatTaxonSource = hortis.iNatTaxonSource({
    // disableNameCache: true,
    jwt: jwt
});

const parsedArgs = minimist(process.argv.slice(2));

const taxonResolveMap = hortis.readJSONSync("data/TaxonResolution-map.json", "reading taxon resolution map");
const swaps = hortis.readJSONSync("data/taxon-swaps.json5", "reading taxon swaps file");
if (!parsedArgs.fusion) {
    fluid.fail("Missing argument --fusion");
}
const fusion = hortis.readJSONSync(parsedArgs.fusion);

const discardRanksBelow = "class"; // TODO: Make this an argument
// var discardRanksBelow = "species";
const discardRanksBelowIndex = hortis.ranks.indexOf(discardRanksBelow);

hortis.combineMaps = function (maps, mutable) {
    const extendArgs = [true, {}].concat(maps);
    const extended = fluid.extend.apply(null, extendArgs);
    return mutable ? extended : fluid.freezeRecursive(extended);
};

hortis.baseCommonOutMap = fluid.freezeRecursive({
    "columns": {
        "iNaturalistTaxonName": "iNaturalist taxon name",
        "iNaturalistTaxonId": "iNaturalist taxon ID",
        "taxonName": "Taxon name",
        "ambiguousNameMatch": "ambiguousNameMatch",
        "nameStatus": "nameStatus",
        "commonName": "commonName",
        "authority": "Author" // TODO: Make this conditional on whether it is present in input?
    }
});

// Fields which are transferred to "first" and "last" entries from observations to summaries
hortis.obsToSummaryFields = {
    recordedBy: "Reported By",
    collection: "Source", // old-fashioned pre-GBIF field - being phased out - would have been "collectionCode" which is not so useful
    institutionCode: "Institution Code",
    placeName: "Place Name",
    catalogueNumber: "Catalogue Number",
    observationId: "observationId",
    timestamp: "Date Reported"
};

hortis.obsToSummaryColumns = function (fields) {
    const togo = {};
    const appendWith = function (prefix) {
        const capPrefix = hortis.capitalize(prefix);
        return function (value, key) {
            const newKey = prefix + hortis.capitalize(key);
            const newValue = capPrefix + " " + value;
            togo[newKey] = newValue;
        };
    };
    fluid.each(fields, appendWith("first"));
    fluid.each(fields, appendWith("last"));
    return togo;
};

hortis.baseSummariseCommonOutMap = hortis.combineMaps([hortis.baseCommonOutMap, {
    "counts": {
        "observationCount": {
            "column": "observationCount",
            "free": true
        }
    },
    "columns": {
        "observationCount": "Observation count",
        "coords": "Coordinates"
    }
}]);

hortis.ranksToColumns = function (ranks) {
    return fluid.transform(fluid.arrayToHash(ranks), function (troo, key) {
        return hortis.capitalize(key);
    });
};

hortis.commonOutMap = hortis.combineMaps([hortis.baseCommonOutMap, {
    columns: hortis.ranksToColumns(hortis.ranks)
}]);

hortis.commonObsOutMap = hortis.combineMaps([hortis.commonOutMap, {
    columns: {
        observationId: "observationId",
        latitude: "Latitude",
        longitude: "Longitude"
    }
}]);

hortis.summariseCommonOutMap = hortis.combineMaps([hortis.baseSummariseCommonOutMap, {
    columns: hortis.ranksToColumns(hortis.ranks)
}, {
    columns: hortis.obsToSummaryColumns(hortis.obsToSummaryFields)
}]);

const invertedSwaps = hortis.iNat.invertSwaps(swaps);

hortis.checkFilters = function (filters, mapColumns) {
    fluid.each(filters, function (oneFilter) {
        if (!mapColumns[oneFilter.field]) {
            fluid.fail("Column " + oneFilter.field + " is unknown in input map file");
        }
    });
    return filters || {};
};

hortis.makeObsIdGenerator = function (idField, dataset) {
    if (idField.includes("(")) {
        const parsed = fluid.compactStringToRec(idField, "idGenerator");
        return function (obsRow) {
            const expandArgs = fluid.transform(parsed.args, function (arg) {
                return fluid.stringTemplate(arg, obsRow);
            });
            return fluid.invokeGlobalFunction(parsed.funcName, expandArgs);
        };
    } else { // It must be a simple reference
        return function (obsRow, rowNumber) {
            const terms = fluid.extend({}, obsRow, {rowNumber: rowNumber}, dataset);
            return fluid.stringTemplate(idField, terms);
        };
    }
};

hortis.assignObsIds = function (rows, map, dataset) {
    const observationId = dataset.observationId || map.observationId;
    if (observationId) {
        // Note that leafletMapWithGrid expects datasets to be resolvable from prefix so that dataset controls can be operated
        // This implies that we need local control over allocation of these in the fusion file and not always take it from the
        // map file
        const idGenerator = hortis.makeObsIdGenerator(observationId, dataset);
        rows.forEach(function (row, index) {
            const id = idGenerator(row, index);
            row.observationId = id;
        });
    }
    rows.forEach(function (row) {
        // TODO: Source this field from hortis.summarise - implies pushing summarise through args all the way back to hortis.fusionToLoadable
        if (row.collection === undefined) {
            row.collection = map.datasetId;
        }
    });
    return rows;
};

hortis.applyFilters = function (obsRows, filters, filterCount) {
    const origRows = obsRows.length;
    obsRows = obsRows.filter(function (row) {
        const pass = Object.values(filters).reduce(function (pass, filter) {
            const element = row[filter.field];
            const match = element === filter.equals;
            if (match) {
                pass = filter.exclude ? !match : match;
            }
            return pass;
        }, true);
        return pass;
    });
    if (filterCount > 0) {
        console.log("Discarded " + (origRows - obsRows.length) + " rows by applying " + hortis.pluralise(filterCount, "filter"));
    }
    return obsRows;
};

hortis.resolvePaths = function (obj, pathKeys) {
    pathKeys.forEach(function (pathKey) {
        const path = obj[pathKey];
        if (!path) {
            fluid.fail("Dataset record ", obj, " is missing required member " + pathKey);
        }
        obj[pathKey] = fluid.module.resolvePath(path);
    });
};

hortis.oneDatasetToLoadable = function (dataset, key) {
    hortis.resolvePaths(dataset, ["map", "outMap", "input"]);
    // TODO: Turn this into a component with transform chain elements some day
    const map = hortis.readJSONSync(dataset.map, "reading Observations map file");
    map.datasetId = dataset.datasetId = key;
    if (dataset.datasetClass) {
        map.datasetClass = dataset.datasetClass;
    }
    const rawInput = hortis.csvReaderWithMap({
        inputFile: dataset.input,
        mapColumns: map.columns,
        templateMap: dataset.templateMap !== false
    }).completionPromise;
    const parsedFilters = hortis.checkFilters(dataset.filters, map.columns);
    return {
        rawInput: rawInput,
        obsRows: fluid.promise.map(rawInput, function (data) {
            const rowsWithId = hortis.assignObsIds(data.rows, map, dataset);
            const filterCount = Object.keys(parsedFilters).length;
            const filteredRows = hortis.applyFilters(rowsWithId, parsedFilters, filterCount);
            if (filterCount > 0) {
                console.log("Pre-filtered observations to list of " + filteredRows.length + " with " + filterCount + " filters");
            }
            return filteredRows;
        }),
        map: map,
        outMap: hortis.readJSONSync(dataset.outMap, "reading Observations output map file")
    };
};

// These are not functions, but they are not components
fluid.defaults("hortis.pipe", {
    gradeNames: "fluid.component",
    loader: "fluid.identity"
});

fluid.defaults("hortis.pipe.CSVInput", {
    gradeNames: "hortis.pipe",
    loader: "hortis.pipe.loadCSVInputPipe"
});

fluid.defaults("hortis.pipe.JSONInput", {
    gradeNames: "hortis.pipe",
    loader: "hortis.pipe.loadJSONInputPipe"
});

fluid.defaults("hortis.pipe.contextInput", {
    gradeNames: "hortis.pipe",
    loader: "hortis.pipe.loadContextInputPipe"
});

hortis.pipe.loadCSVInputPipe = function (patch) {
    hortis.resolvePaths(patch, ["map", "input"]);
    const map = hortis.readJSONSync(patch.map, "reading patch map file");
    const patchData = hortis.csvReaderWithMap({
        inputFile: patch.input,
        mapColumns: map.columns
    }).completionPromise;
    return {
        patchData: patchData,
        map: map
    };
};

hortis.pipe.loadJSONInputPipe = function (patch) {
    hortis.resolvePaths(patch, ["input"]);
    return {
        patchData: hortis.readJSONSync(patch.input)
    };
};

hortis.pipe.loadContextInputPipe = function (patch) {
    hortis.resolvePaths(patch, ["input"]);
    fluid.loadInContext(patch.input, true);
    return {
        patchData: fluid.getGlobalValue(patch.globalName)
    };
};

hortis.onePatchToLoadable = function (patch) {
    const defaults = fluid.defaults(patch.type);
    const loaded = defaults ? fluid.invokeGlobalFunction(defaults.loader, [patch]) : {};
    Object.assign(patch, loaded);
    return patch;
};

hortis.fusionToLoadable = function (fusion) {
    return {
        datasets: fluid.transform(fusion.datasets, function (dataset, key) {
            return hortis.oneDatasetToLoadable(dataset, key);
        }),
        patches: fluid.transform(fusion.patches, function (patch) {
            return hortis.onePatchToLoadable(patch);
        }),
        summaryPatches: fluid.transform(fusion.summaryPatches, function (patch) {
            return hortis.onePatchToLoadable(patch);
        })
    };
};

// Convert a BCCSN-style resolution to metres
hortis.mapBCCSNResolution = function (resolution) {
    const matches = resolution.trim().match(/([\d.]+)(km|m)$/);
    if (!matches) {
        console.log("Warning: BCCSN resolution value " + resolution + " was not recognised");
    } else {
        return matches[1] * (matches[2] === "km" ? 1000 : 1);
    }
};

// Some commonly used filters - split off into a proper infrastructure

hortis.deprivatise = function (resolved) {
    resolved.obsRows.forEach(function (row) {
        row.latitude = row.privateLatitude || row.latitude;
        row.longitude = row.privateLongitude || row.longitude;
    });
};

hortis.fuseUsers = function (resolved) {
    resolved.obsRows.forEach(function (row) {
        row.recordedBy = row.recordedBy || row.observer;
    });
};

hortis.roundCoordinates = function (resolved, patch) {
    resolved.obsRows.forEach(function (row) {
        row.latitude = hortis.roundDecimals(row.latitude, patch.places);
        row.longitude = hortis.roundDecimals(row.longitude, patch.places);
    });
};



hortis.deduplicateById = function (resolved, patch) {
    const idField = patch.idField;
    const usedIds = {};
    const filteredObsRows = resolved.obsRows.filter(function (row) {
        const id = row[idField];
        const used = usedIds[id];
        usedIds[id] = true;
        return !used;
    });
    resolved.obsRows = filteredObsRows;
};

hortis.blankRow = function (row) {
    return fluid.transform(row, function (/* col */) {
        return "";
    });
};

hortis.renderDateBound = function (value) {
    return Number.isFinite(value) ? new Date(value).toISOString() : "";
};

hortis.doSummarise = function (outrows, summarise) {
    const that = hortis.summarise({summarise: summarise});
    outrows.forEach(that.storeRow);
    that.destroy();
    if (summarise) {
        fluid.each(that.uniqueRows, function (row) {
            row.coords = row.coords && JSON.stringify(row.coords);
            row.firstTimestamp = hortis.renderDateBound(row.firstTimestamp);
            row.lastTimestamp = hortis.renderDateBound(row.lastTimestamp);
        });
    }
    return Object.values(that.uniqueRows);
};

hortis.makeTaxonomiser = function (source, options) {
    const that = {
        options: fluid.extend(true, {}, options),
        source: source,
        //taxaHash: {}, // map iNat scientificName to taxon
        // taxaById: {},  // map iNat taxonId to taxon
        // Initialised from observations:
        obsIdToTaxon: [],  // Map of obs id to iNat taxon
        undetHash: {}, // Map of taxon name to undetermined taxon
        undetKeys: [], // Keys of undetHash
        discardedTaxa: {} // Map of discarded taxon name to taxon for filtering by identification level
    };
    /* data.taxa.rows.forEach(function (taxon) {
        that.taxaHash[taxon.scientificName] = taxon;
        that.taxaById[taxon.taxonId] = taxon;
    });*/
    return that;
};

hortis.isSelfUndetermined = function (name) {
    return !name || name.includes("undetermined") || name.includes("various") || name.includes("Various") || name.includes("filamentous");
};

hortis.obsToNameQuery = function (name, obs) {
    const query = {name};
    if (obs.phylum) {
        query.phylum = obs.phylum;
    }
    if (obs.taxonRank) {
        query.rank = obs.taxonRank;
    }
    return query;
};

// Side-effects: populates that.obsIdToTaxon, that.undetHash, that.undetKeys, that.discardedTaxa
hortis.applyObservations = async function (that, obsRows, applySwaps) {
    const identifiedTo = {}; // Two-level hash of {rank, obs id} to obs
    const obsIdToRank = {}; // One-level hash of {obs id} to rank
    for (let i = 0; i < obsRows.length; ++i) {
        if (i % 100 === 0) {
            console.log("Resolving taxon for observation " + i + "/" + obsRows.length);
        }
        const obs = obsRows[i];
        const obsId = obs.observationId;
        if (obsId === undefined) {
            fluid.fail("Observation ", obs, " was not assigned an id");
        }
        const san = hortis.sanitizeSpeciesName(obs.taxonName);
        let taxonLevel = "Undetermined";
        if (!hortis.isSelfUndetermined(san)) {
            const invertedId = applySwaps ? invertedSwaps[san] : null;
            const nameQuery = hortis.obsToNameQuery(san, obs);
            const taxon = invertedId && await that.source.get({id: invertedId}) || await that.source.get(nameQuery);
            if (taxon && taxon.doc) {
                taxonLevel = taxon.doc.rank;
                const existing = that.obsIdToTaxon[obsId];
                if (existing && existing.doc.id !== taxon.doc.id) {
                    console.log("Warning: Observation id " + obsId + " has previously been used to resolve taxon ", existing
                        , "now overwritten with ", taxon);
                }
                that.obsIdToTaxon[obsId] = taxon;
            }
        }
        fluid.set(identifiedTo, [taxonLevel, obsId], obs);
        obsIdToRank[obsId] = taxonLevel;
    }
    fluid.each(identifiedTo, function (recs, taxonLevel) {
        console.log("Identified " + Object.keys(recs).length + " records to " + taxonLevel);
    });

    const swapaway = identifiedTo.stateofmatter;
    if (swapaway) {
        const swapawayKeys = Object.keys(swapaway);

        console.log(swapawayKeys.length + " records were swapped away: \n");

        fluid.each(swapaway, function (value, key) {
            console.log(value.taxonName + " (" + key + ")");
        });
    }

    const undets = identifiedTo["Undetermined"];

    if (that.options.discardRanksBelowIndex !== -1) {
        const allRanks = ["stateofmatter", ...hortis.ranks];
        allRanks.forEach(function (rank, rankIndex) {
            if (rankIndex < that.options.discardRanksBelowIndex) {
                const toDiscard = identifiedTo[rank];
                if (toDiscard && Object.keys(toDiscard).length) {
                    fluid.each(toDiscard, function (obs, obsId) {
                        const taxon = that.obsIdToTaxon[obsId];
                        fluid.set(that.discardedTaxa, [taxon.doc.name, obsId], obs);
                        delete that.obsIdToTaxon[obsId];
                    });
                }
            }
        });
    }
    fluid.each(that.discardedTaxa, function (obsMap, taxonName) {
        const keys = Object.keys(obsMap);
        const firstObs = obsMap[keys[0]];
        console.log("\nDiscarded " + keys.length + " observations for taxon " + taxonName + " which were only identified to rank " + obsIdToRank[firstObs.observationId] + ":");
        console.log(keys.join(", "));
    });

    fluid.each(undets, function (undet) {
        if (!hortis.isSelfUndetermined(undet.taxonName)) {
            that.undetHash[undet.taxonName] = undet;
        }
    });
    const undetKeys = Object.keys(that.undetHash).sort();
    console.log("\nListing " + undetKeys.length + " undetermined species in observations: \n");
    undetKeys.forEach(function (undetKey) {
        const row = that.undetHash[undetKey];
        console.log(undetKey + (row.observationId ? (": " + row.observationId) : ""));
    });
    console.log();
    that.undetKeys = undetKeys;
};

hortis.resolveObservationTaxa = async function (that, observations, outMap) {
    const togo = [];
    const taxa = Object.keys(outMap.columns);
    for (let i = 0; i < observations.length; ++i) {
        if (i % 100 === 0) {
            console.log("Resolving ranks for observation " + i + "/" + observations.length);
        }
        const row = observations[i];
        const taxon = that.obsIdToTaxon[row.observationId];
        if (taxon) {
            const outrow = fluid.copy(row);
            outrow.iNaturalistTaxonName = taxon.doc.name;
            outrow.iNaturalistTaxonId = taxon.doc.id;
            outrow.ambiguousNameMatch = +!!taxon.doc.ambiguousNameMatch;
            outrow.nameStatus = taxon.doc.nameStatus;
            const byId = await that.source.get({id: taxon.doc.id});
            outrow.commonName = outrow.commonName || byId.doc.preferred_common_name;
            await hortis.iNat.getRanks(taxon.doc.id, outrow, that.source, taxa);
            togo.push(outrow);
        }
    }
    return togo;
};


hortis.applyPatches = function (resolved, patches) {
    fluid.each(patches, function (patch, key) {
        fluid.invokeGlobalFunction(patch.processor, [resolved, patch, key]);
    });
};

// Summarise really means "Input was obs"
hortis.resolveAndFilter = async function (that, observations, filters, outMap, summarise) {
    const resolved = {};
    const outrows = await hortis.resolveObservationTaxa(that, observations, outMap);

    resolved.filters = filters || {};
    resolved.filterCount = Object.keys(resolved.filters).length;

    const filtered = hortis.applyFilters(outrows, resolved.filters, resolved.filterCount);

    if (summarise) {
        resolved.obsRows = filtered;
    } else {
        resolved.summarisedRows = filtered;
    }

    return resolved;
};

hortis.writeReintegratedObservations = function (resolved, fileName, outMapFileName) {
    // If we've been asked to summarise, also output obs since we must have input obs. Summarise means "input was obs"
    if (resolved.obsRows) {
        const reintegratedObsFile = hortis.obsifyFilename(fileName);
        hortis.writeCSV(reintegratedObsFile, resolved.combinedObsOutMap.columns, resolved.obsRows, fluid.promise());

        const combinedObsOutMapFilename = hortis.obsifyFilename(outMapFileName);
        hortis.writeJSONSync(combinedObsOutMapFilename, resolved.combinedObsOutMap);
    }
    hortis.writeCSV(fileName, resolved.combinedOutMap.columns, resolved.summarisedRows, fluid.promise());
    hortis.writeJSONSync(outMapFileName, resolved.combinedOutMap);
};

hortis.writeResolutionFile = function (that) {
    const resolutionRows = fluid.transform(that.undetKeys, function (undetKey) {
        return {
            taxonName: undetKey,
            commonName: that.undetHash[undetKey].commonName
        };
    });
    const promise = fluid.promise();
    hortis.writeCSV("taxonResolution.csv", taxonResolveMap.columns, resolutionRows, promise);
};

hortis.obsifyFilename = function (filename) {
    const lastDot = filename.lastIndexOf(".");
    return filename.substring(0, lastDot) + "-obs" + filename.substring(lastDot);
};

const dataPromises = hortis.fusionToLoadable(fusion);

hortis.settleStructure(dataPromises).then(async function (data) {
    await iNatTaxonSource.events.onCreate;
    const summarise = parsedArgs.summarise || fusion.summarise;
    const datasets = data.datasets;
    let flatObs = [];
    fluid.each(datasets, function (dataset) {
        flatObs = flatObs.concat(dataset.obsRows);
    });
    console.log("Loaded " + flatObs.length + " observations from " + hortis.pluralise(Object.keys(datasets).length, "dataset"));
    const that = hortis.makeTaxonomiser(iNatTaxonSource, {
        discardRanksBelowIndex: discardRanksBelowIndex
    });
    await hortis.applyObservations(that, flatObs, fusion.applySwaps);

    const writeResolutionFile = parsedArgs.writeRes; // TODO: doesn't seem that this is read or modified any more
    if (writeResolutionFile) {
        hortis.writeResolutionFile(that);
    }
    const outMaps = Object.values(fluid.getMembers(datasets, "outMap"));
    const combinedOutMap = summarise ?
        hortis.combineMaps([hortis.summariseCommonOutMap].concat({
            counts: fusion.counts
        }), true) :
        hortis.combineMaps([hortis.commonOutMap].concat(outMaps), true);

    combinedOutMap.datasets = fusion.datasets;

    const resolved = await hortis.resolveAndFilter(that, flatObs, fusion.filters, combinedOutMap, summarise);

    resolved.combinedOutMap = combinedOutMap;
    resolved.combinedObsOutMap = hortis.combineMaps([hortis.commonObsOutMap].concat(outMaps), true);

    if (summarise) {
        hortis.applyPatches(resolved, data.patches);
        resolved.summarisedRows = hortis.doSummarise(resolved.obsRows, true);
    }
    hortis.applyPatches(resolved, data.summaryPatches);

    const reintegratedFilename = parsedArgs.dry ? "reintegrated.csv" : fluid.module.resolvePath(fusion.output);

    hortis.writeReintegratedObservations(resolved, reintegratedFilename, fusion.combinedOutMap);

}, function (err) {
    fluid.fail("Error loading data", err);
    if (err.stack) {
        console.log(err.stack);
    }
});
