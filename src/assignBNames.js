/* eslint-env node */

"use strict";

const fluid = require("infusion");
const minimist = require("minimist");
const JSON5 = require("json5");
const fs = require("fs");
const path = require("path");

fluid.require("%imerss-bioinfo");

require("./dataProcessing/readCSV.js");
require("./dataProcessing/readCSVwithMap.js");
require("./dataProcessing/writeCSV.js");

require("./iNaturalist/taxonAPI.js");

const hortis = fluid.registerNamespace("hortis");

fluid.setLogging(true);

hortis.handleFailure = function () {
//    process.exit(1);
};

// Override this one from module fluid.js so that we continue in the face of socket hangup
fluid.handleUncaughtException = function () {
    console.log("Received uncaught exception");
};

fluid.onUncaughtException.addListener(fluid.handleUncaughtException, "fail",
    fluid.handlerPriorities.uncaughtException.fail);

/** Catch socket hangup issues
 */
process.on("unhandledRejection", (reason, promise) => {
    console.log("Unhandled Rejection at:", promise, "reason:", reason);
});

// fluid.failureEvent.addListener(hortis.handleFailure, "hortis", "before:fail");


process.on("uncaughtException", function onUncaughtException(err) {
    fluid.log("Uncaught exception", err);
});

/**
 * Extracts the "trunk" portion of an input file path by removing the file extension
 * and, if present, the last hyphen-separated suffix after the last slash.
 *
 * The function determines the position to truncate the string by:
 * - Finding the last position of a period (.) for the file extension.
 * - Finding the last position of a hyphen (-).
 * - Finding the last position of a slash (/).
 * If the last hyphen is not present or occurs before the last slash, truncation occurs at the last period.
 * Otherwise, truncation occurs at the last hyphen.
 *
 * @param {String} inputFile - The input file path to process.
 * @return {String} The trunk portion of the input file path.
 */
hortis.inputFileToTrunk = function (inputFile) {
    const lastdotpos = inputFile.lastIndexOf(".");
    const lasthypos = inputFile.lastIndexOf("-");
    const lastslashpos = inputFile.lastIndexOf("/");
    const trunkPos = (lasthypos === -1 || lasthypos <= lastslashpos) ? lastdotpos : lasthypos;
    return inputFile.substring(0, trunkPos);
};

// Only current use of "rawName" is to be spat out for "unmapped taxa"
const strategies = {
    bees: {
        plant: {
            iNatName: "plantINatName",
            rawName: "plantScientificName",
            iNatId: "plantINatId",
            nameStatus: "plantNameStatus",
            assignedINatName: "plantAssignedINatName"
        },
        pollinator: {
            iNatName: "pollinatorINatName",
            rawName: "scientificName",
            iNatId: "pollinatorINatId",
            nameStatus: "pollinatorNameStatus",
            assignedINatName: "pollinatorAssignedINatName",
            sanitize: true
        }
    },
    DwC: {
        iNatName: "verbatimScientificName",
        rawName: "verbatimScientificName",
        iNatId: "iNaturalistTaxonId",
        nameStatus: "nameStatus",
        assignedINatName: "iNaturalistTaxonName",
        assignRanks: ["kingdom", "phylum", "class", "order", "infraorder", "superfamily", "family", "subfamily", "genus"],
        sanitize: true,
        csvOptions: {
            separator: "\t"
        }
    },
    DwCA: { // The form that Howe Sound is in
        iNatName: "scientificName",
        rawName: "scientificName",
        iNatId: "iNaturalistTaxonId",
        nameStatus: "nameStatus",
        assignedINatName: "iNaturalistTaxonName",
        commonName: "commonName",
        assignRanks: ["kingdom", "phylum", "subphylum", "class", "subclass", "superorder", "order", "infraorder", "superfamily", "family", "subfamily", "tribe", "genus", "species", "subspecies", "variety", "hybrid"],
        sanitize: true
    },
    DwCR: { // Reduced DwC as it comes direct from GBIF
        iNatName: "species",
        rawName: "species",
        iNatId: "iNaturalistTaxonId",
        nameStatus: "nameStatus",
        assignedINatName: "iNaturalistTaxonName",
        assignRanks: ["kingdom", "phylum", "class", "order", "infraorder", "superfamily", "family", "subfamily", "genus"],
        sanitize: true
    },
    // Has been reintegrated already, info should match and we just need to compute and assign higher taxa
    reintegrated: {
        iNatName: "iNaturalist taxon name",
        rawName: "Taxon name",
        iNatId: "iNaturalist taxon ID",
        nameStatus: "nameStatus",
        assignedINatName: "iNaturalist taxon name"
    },
    // Raw iNat obs output
    iNat: {
        iNatName: "scientific_name",
        rawName: "scientific_name",
        iNatId: "taxon_id",
        nameStatus: "nameStatus",
        assignedINatName: "scientific_name",
        assignRanks: ["kingdom", "phylum", "class", "order", "infraorder", "superfamily", "family", "subfamily", "genus"]
    },
    Saanich: {
        iNatName: "iNaturalistTaxonName",
        rawName: "iNaturalistTaxonName",
        iNatId: "iNaturalistTaxonId",
        nameStatus: "nameStatus",
        assignedINatName: "iNaturalistTaxonName",
        assignRanks: ["kingdom", "phylum", "class", "order", "infraorder", "superfamily", "family", "subfamily", "genus"],
        sanitize: true
    }
};

// Strategy fields which may be overridden from the command line or a driver file
const overridableFields = ["phylum", "phylumField", "rank", "rankField", "rawName", "iNatName"];

// Paths held in a driver file, which are stored relative to the driver file's own directory
const driverPaths = ["input", "swaps", "output", "taxa", "mismatches"];

/**
 * Load a driver file, resolving any paths it holds against the driver file's directory.
 * @param {String} driverFile - Path to a JSON5 driver file
 * @return {Object} The driver record with its paths made absolute
 */
hortis.readDriver = function (driverFile) {
    const driver = JSON5.parse(fs.readFileSync(driverFile, "utf8"));
    const driverDir = path.dirname(path.resolve(driverFile));
    driverPaths.forEach(function (key) {
        if (driver[key] !== undefined) {
            driver[key] = path.resolve(driverDir, fluid.module.resolvePath(driver[key]));
        }
    });
    return driver;
};

/**
 * Write a driver file which will reproduce this run, with paths relative to the driver file's directory.
 * @param {String} driverFile - Path at which to write the JSON5 driver file
 * @param {Object} driver - The fully resolved driver record for this run
 */
hortis.writeDriver = function (driverFile, driver) {
    const driverDir = path.dirname(path.resolve(driverFile));
    const togo = fluid.copy(driver);
    driverPaths.forEach(function (key) {
        if (togo[key] !== undefined) {
            togo[key] = path.relative(driverDir, path.resolve(fluid.module.resolvePath(togo[key]))).replace(/\\/g, "/");
        }
    });
    fs.writeFileSync(driverFile, JSON5.stringify(togo, null, 4) + "\n");
    console.log("Written driver file " + driverFile);
};

const parsedArgs = minimist(process.argv.slice(2), {boolean: [...Object.keys(strategies), "noRank"], string: overridableFields});

const fileDriver = parsedArgs.driver ? hortis.readDriver(parsedArgs.driver) : {};

const argStrategy = parsedArgs.strategy || Object.keys(strategies).find(strategy => parsedArgs[strategy]);

const argOverrides = {};
overridableFields.forEach(function (key) {
    if (parsedArgs[key] !== undefined) {
        argOverrides[key] = parsedArgs[key];
    }
});

// Values supplied on the command line take priority over those in any driver file
const driver = {
    strategy: argStrategy || fileDriver.strategy,
    input: parsedArgs._[0] || fileDriver.input || fluid.module.resolvePath("%imerss-bioinfo/data/b-team/plant-pollinators-Carril-normalised.csv"),
    swaps: parsedArgs.swaps || fileDriver.swaps || fluid.module.resolvePath("%imerss-bioinfo/data/b-team/taxon-swaps-2025.csv"),
    noRank: parsedArgs.noRank || fileDriver.noRank || false,
    // Default to DwC column names for phylum and rank - other layouts supply these via e.g. --phylumField, --rank
    overrides: {phylumField: "phylum", rankField: "taxonRank", ...fileDriver.overrides, ...argOverrides}
};

if (!driver.strategy || !strategies[driver.strategy]) {
    fluid.fail("Please supply strategy argument via --strategy=<name> or one of ", Object.keys(strategies).map(key => "--" + key).join(", "));
}

const inputTrunk = hortis.inputFileToTrunk(driver.input);

driver.output = parsedArgs.o || fileDriver.output || inputTrunk + "-assigned.csv";
driver.taxa = parsedArgs.taxa || fileDriver.taxa || inputTrunk + "-assigned-taxa.csv";
driver.mismatches = parsedArgs.mismatches || fileDriver.mismatches || inputTrunk + "-mismatches.csv";

const driverOutFile = parsedArgs.driverOut || inputTrunk + "-driver.json5";

const strategy = driver.strategy;
const noRank = driver.noRank;

const swapsReader = hortis.csvReaderWithMap({
    inputFile: driver.swaps,
    mapColumns: {
        "preferred": "Preferred name",
        "supplied": "Supplied name",
        "comments": "Comments"
    }
});

const source = hortis.iNatTaxonSource({
//     disableNameCache: true
});

console.log("Applying strategy ", strategy);
const strategyBigRec = strategy === "bees" ? strategies.bees : {...strategies[strategy], ...driver.overrides};

const reader = hortis.csvReaderWithoutMap({
    inputFile: driver.input,
    csvOptions: strategyBigRec.csvOptions
});

/**
 * Determine a value such as phylum or rank for a row, taking it from the configured field if present,
 * falling back to any configured default.
 * @param {Object} row - The row being processed
 * @param {String} [field] - The name of the field holding the value
 * @param {String} [defaultValue] - Value to use if the field is absent or empty
 * @return {String} The resolved value, or undefined
 */
hortis.rowValue = function (row, field, defaultValue) {
    return (field && row[field]) || defaultValue;
};

// Added in Epifamily so we can include Bees [Epifamily Anthophila]
const storeRanks = ["stateofmatter", "kingdom", "phylum", "subphylum", "class", "order", "epifamily", "family", "genus"];

hortis.iNat.newRecordTransform = {
    iNaturalistTaxonName: "name",
    commonName: "preferred_common_name", // This one seems to have moved in the new API
    rank: "rank",
    iNaturalistTaxonImage: "default_photo.medium_url"
};

hortis.addName = function (allTaxa, id, name, nameStatus) {
    const existing = allTaxa[id];
    existing.names = existing.names || {};
    existing.names[name] = nameStatus;

    // Bodge to ensure that we don't omit higher taxa which do appear in catalogue - in practice we need
    // a swaps system
    // In practice there is too much junk in the OBA data
    // if (nameStatus === "accepted") {
    //    existing.taxonName = existing.iNaturalistTaxonName;
    //}
};

hortis.storeTaxon = async function (allTaxa, taxonDoc, inSummary) {
    const id = taxonDoc.doc.id;
    if (!allTaxa[id]) {
        const filtered = {id};
        const ancestry = await hortis.iNat.getAncestry(id, source);
        let parentId;
        ancestry.forEach((ancestour, i) => {
            if (storeRanks.includes(ancestour.doc.rank)) {
                if (inSummary) {
                    hortis.storeTaxon(allTaxa, ancestour, false);
                }
                if (i > 0 && !parentId) {
                    parentId = ancestour.doc.id;
                }
            }
        });
        filtered.depth = ancestry.length;
        // eslint-disable-next-line eqeqeq
        if (!parentId && id != 48460) {
            // TODO: Why does this exception not bomb out the stack without the failure handler?
            fluid.fail("Cannot find parent taxon for taxon ", taxonDoc.doc);
        }
        filtered.parentId = parentId;
        // Call out for the standard fields that the viz depends on
        hortis.iNat.addTaxonInfo(hortis.iNat.newRecordTransform, filtered, taxonDoc.doc);
        // TODO: Should actually be the curated summary name
        // Need to accept summary file as input, right now we axe this and apply it later in the merge
        // filtered.taxonName = inSummary ? filtered.iNaturalistTaxonName : "";
        allTaxa[id] = filtered;
    }
};

// Note: This is the beginning of "new marmalisation" - hortis.iNat.addTaxonInfo used to be called in the marmaliser
hortis.applyName = async function (row, index, phylum, inRank, invertedSwaps, allTaxa, unmappedTaxa, strategyRec) {
    const s = strategyRec;
    const rawName = row[s.iNatName] || row[s.rawName];
    if (rawName === undefined) {
        fluid.fail(`Couldn't get taxon name for row ${index} from field names ${s.iNatName} or ${s.rawName}`);
    }
    const rank = noRank ? undefined : inRank;
    const iNatName = invertedSwaps[rawName]?.preferred || rawName;
    const saneName = s.sanitize ? hortis.sanitizeSpeciesName(iNatName) : iNatName;
    const looked = await source.get({name: saneName, phylum, rank});

    const scientificName = row[s.rawName];

    const assign = function (row, field, value) {
        // eslint-disable-next-line eqeqeq
        if (value !== undefined) {
            if (row[field] && row[field] !== value) {
                console.log(`Inconsistency in reintegrated data - assigning ${value} to field ${field} over existing value ${row[field]}`);
                console.log("Row: ", row);
            }
            row[field] = value;
        }
    };

    if (looked && looked.doc && looked.doc.phylumMatch) {
        const id = looked.doc.id;
        assign(row, s.iNatId, id);
        assign(row, s.assignedINatName, looked.doc.name);
        if (s.commonName) {
            assign(row, s.commonName, looked.doc.commonName);
        }
        if (strategyRec.assignRanks) {
            await hortis.iNat.getRanks(looked.doc.id, row, source.byId, strategyRec.assignRanks, scientificName);
        }
        const existing = allTaxa[id];
        if (!existing) {
            const taxonDoc = await source.get({id: id});
            await hortis.storeTaxon(allTaxa, taxonDoc, true);
        }
        row[s.nameStatus] = looked.doc.nameStatus;
        // Can't recall what this field did
        // hortis.addName(allTaxa, id, iNatName, looked.doc.nameStatus);
    } else {
        assign(row, s.iNatId, 0);
        assign(row, s.assignedINatName, "");
        row[s.nameStatus] = "unknown";
        unmappedTaxa[iNatName] = {scientificName};
    }
};

hortis.invertSwaps = function (swapRows) {
    const swaps = {};
    swapRows.forEach(function (row) {
        swaps[row.supplied] = row;
    });
    return swaps;
};

hortis.depthComparator = function (rowa, rowb) {
    return rowa.depth - rowb.depth;
};

hortis.flattenTaxa = function (taxa) {
    const taxaRows = Object.values(taxa);
    // taxaRows.forEach(row => row.names = JSON.stringify(row.names));
    taxaRows.sort(hortis.depthComparator);
    taxaRows.forEach(row => delete row.depth);
    return taxaRows;
};

Promise.all([reader.completionPromise, swapsReader.completionPromise, source.events.onCreate]).then(async function () {
    const mapped = [];
    // Receives map of taxon id to row for all taxa which are seen
    const taxa = {};
    const unmappedTaxa = {};
    const invertedSwaps = hortis.invertSwaps(swapsReader.rows);
    for (let i = 0; i < reader.rows.length; ++i) {
        if ( (i % 100) === 0) {
            console.log("Processing row ", i);
        }
        const row = reader.rows[i];
        if (strategy === "bees") {
            await hortis.applyName(row, i, "Tracheophyta", null, invertedSwaps, taxa, unmappedTaxa, strategyBigRec.plant);
            await hortis.applyName(row, i, "Arthropoda", null, invertedSwaps, taxa, unmappedTaxa, strategyBigRec.pollinator);
        } else {
            const s = strategyBigRec;
            await hortis.applyName(row, i, hortis.rowValue(row, s.phylumField, s.phylum), hortis.rowValue(row, s.rankField, s.rank),
                invertedSwaps, taxa, unmappedTaxa, s);
        }

        mapped.push(row);
    }
    const resolveOut = fluid.module.resolvePath(driver.output);
    await hortis.writeCSV(resolveOut, Object.keys(mapped[0]), mapped, fluid.promise());

    const taxaRows = hortis.flattenTaxa(taxa);
    await hortis.writeCSV(driver.taxa, Object.keys(taxaRows[0]), taxaRows, fluid.promise());

    const unmapped = Object.keys(unmappedTaxa);
    if (unmapped.length > 0) {
        console.log("Listing " + unmapped.length + " unmapped taxa:");
        const unmappedRows = unmapped.map(function (key) {
            const scientificName = unmappedTaxa[key].scientificName;
            console.log(key + ", original name " + scientificName);
            return {taxonName: key, originalName: scientificName};
        });
        await hortis.writeCSV(driver.mismatches, Object.keys(unmappedRows[0]), unmappedRows, fluid.promise());
    }
    hortis.writeDriver(driverOutFile, driver);
});
