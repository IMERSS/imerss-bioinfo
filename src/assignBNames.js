/* eslint-env node */

"use strict";

const fluid = require("infusion");
const minimist = require("minimist");

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
    debugger;
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
        assignRanks: ["kingdom", "phylum", "class", "order", "infraorder", "superfamily", "family", "subfamily", "genus"],
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
        assignRanks: ["kingdom", "phylum", "class", "order", "infraorder", "superfamily", "family", "subfamily", "genus"]
    }
};

const parsedArgs = minimist(process.argv.slice(2), {boolean: [...Object.keys(strategies), "noRank"]});

const swapsFile = parsedArgs.swaps || fluid.module.resolvePath("%imerss-bioinfo/data/b-team/taxon-swaps-2025.csv");

const noRank = parsedArgs.noRank;

const inputFile = parsedArgs._[0] || fluid.module.resolvePath("%imerss-bioinfo/data/b-team/plant-pollinators-Carril-normalised.csv");

const inputTrunk = hortis.inputFileToTrunk(inputFile);

const outputFile = parsedArgs.o || inputTrunk + "-assigned.csv";
const outputTaxaFile = parsedArgs.taxa || inputTrunk + "-assigned-taxa.csv";

const mismatchFile = parsedArgs.mismatches || inputTrunk + "-mismatches.csv";

const swapsReader = hortis.csvReaderWithMap({
    inputFile: swapsFile,
    mapColumns: {
        "preferred": "Preferred name",
        "supplied": "Supplied name",
        "comments": "Comments"
    }
});

const source = hortis.iNatTaxonSource({
//     disableNameCache: true
});


const strategy = Object.keys(strategies).find(strategy => parsedArgs[strategy]);

if (!strategy) {
    fluid.fail("Please supply strategy argument via one of ", Object.keys(strategies).map(key => "--" + key).join(", "));
}

console.log("Applying strategy ", strategy);
const strategyBigRec = strategies[strategy];


const reader = hortis.csvReaderWithoutMap({
    inputFile: inputFile,
    csvOptions: strategyBigRec.csvOptions
});


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
        if (row[field] && row[field] != value) {
            console.log(`Inconsistency in reintegrated data - assigning ${value} to field ${field} over existing value ${row[field]}`);
            console.log("Row: ", row);
        }
        row[field] = value;
    };

    if (looked && looked.doc && looked.doc.phylumMatch) {
        const id = looked.doc.id;
        assign(row, s.iNatId, id);
        assign(row, s.assignedINatName, looked.doc.name);
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
        } else if (strategy === "reintegrated") {
            await hortis.applyName(row, i, row.Phylum, row.Rank, invertedSwaps, taxa, unmappedTaxa, strategyBigRec);
        } else if (strategy.startsWith("DwC")) {
            await hortis.applyName(row, i, row.phylum, row.taxonRank, invertedSwaps, taxa, unmappedTaxa, strategyBigRec);
        } else if (strategy === "iNat") {
            await hortis.applyName(row, i, row.phylum, row.taxon_rank, invertedSwaps, taxa, unmappedTaxa, strategyBigRec);
        } else if (strategy === "Saanich") {
            await hortis.applyName(row, i, "Tracheophyta", "species", invertedSwaps, taxa, unmappedTaxa, strategyBigRec);
        }

        mapped.push(row);
    }
    const resolveOut = fluid.module.resolvePath(outputFile);
    await hortis.writeCSV(resolveOut, Object.keys(mapped[0]), mapped, fluid.promise());

    const taxaRows = hortis.flattenTaxa(taxa);
    await hortis.writeCSV(outputTaxaFile, Object.keys(taxaRows[0]), taxaRows, fluid.promise());

    const unmapped = Object.keys(unmappedTaxa);
    if (unmapped.length > 0) {
        console.log("Listing " + unmapped.length + " unmapped taxa:");
        const unmappedRows = unmapped.map(function (key) {
            const scientificName = unmappedTaxa[key].scientificName;
            console.log(key + ", original name " + scientificName);
            return {taxonName: key, originalName: scientificName};
        });
        await hortis.writeCSV(mismatchFile, Object.keys(unmappedRows[0]), unmappedRows, fluid.promise());
    }

});
