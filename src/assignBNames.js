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
    process.exit(1);
};

fluid.failureEvent.addListener(hortis.handleFailure, "hortis", "before:fail");

hortis.inputFileToTrunk = function (inputFile) {
    const lastdotpos = inputFile.lastIndexOf(".");
    const lasthypos = inputFile.lastIndexOf("-");
    const trunkPos = lasthypos === -1 ? lastdotpos : lasthypos;
    return inputFile.substring(0, trunkPos);
};

const parsedArgs = minimist(process.argv.slice(2));

const swapsFile = parsedArgs.swaps || fluid.module.resolvePath("%imerss-bioinfo/data/b-team/taxon-swaps.csv");

const inputFile = parsedArgs._[0] || fluid.module.resolvePath("%imerss-bioinfo/data/b-team/plant-pollinators-Carril-normalised.csv");

const inputTrunk = hortis.inputFileToTrunk(inputFile);

const outputFile = parsedArgs.o || inputTrunk + "-assigned.csv";
const outputTaxaFile = parsedArgs.taxa || inputTrunk + "-assigned-taxa.csv";

const mismatchFile = parsedArgs.mismatches || inputTrunk + "-mismatches.csv";

const reader = hortis.csvReaderWithoutMap({
    inputFile: inputFile
});

const swapsReader = hortis.csvReaderWithMap({
    inputFile: swapsFile,
    mapColumns: {
        "preferred": "Preferred name",
        "supplied": "Supplied name",
        "comments": "Comments"
    }
});

const source = hortis.iNatTaxonSource({
//    disableNameCache: true
});

const scientificNames = {
    pollinatorINatName: "scientificName",
    plantINatName: "plantScientificName"
};

const storeRanks = ["stateofmatter", "kingdom", "phylum", "subphylum", "class", "order", "family", "genus"];

hortis.iNat.newRecordTransform = {
    iNaturalistTaxonName: "name",
    commonName: "preferred_common_name", // This one seems to have moved in the new API
    rank: "rank",
    wikipediaSummary: "wikipedia_summary",
    iNaturalistTaxonImage: "default_photo.medium_url"
};

hortis.addName = function (allTaxa, id, name, nameStatus) {
    const existing = allTaxa[id];
    existing.names = existing.names || {};
    existing.names[name] = nameStatus;
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
        // TODO: Should actualy be the curated summary name
        filtered.taxonName = inSummary ? filtered.iNaturalistTaxonName : "";
        allTaxa[id] = filtered;
    }
};

// Note: This is the beginning of "new marmalisation" - hortis.iNat.addTaxonInfo used to be called in the marmaliser
hortis.applyName = async function (row, prefix, phylum, invertedSwaps, allTaxa, unmappedTaxa) {
    const fieldName = prefix + "INatName";
    const rawName = row[fieldName];
    const iNatName = invertedSwaps[rawName]?.preferred || rawName;
    const scientificName = row[scientificNames[fieldName]];
    // const saneName = hortis.sanitizeSpeciesName(taxon);
    const looked = await source.get({name: iNatName, phylum: phylum});

    if (looked && looked.doc && looked.doc.phylumMatch) {
        const id = looked.doc.id;
        row[prefix + "INatId"] = id;
        row[prefix + "AssignedINatName"] = looked.doc.name;
        const existing = allTaxa[id];
        if (!existing) {
            const taxonDoc = await source.get({id: id});
            await hortis.storeTaxon(allTaxa, taxonDoc, true);
        }
        hortis.addName(allTaxa, id, iNatName, looked.doc.nameStatus);
    } else {
        row["Name Status"] = "unknown";
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
    taxaRows.forEach(row => row.names = JSON.stringify(row.names));
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
        await hortis.applyName(row, "plant", "Tracheophyta", invertedSwaps, taxa, unmappedTaxa);
        await hortis.applyName(row, "pollinator", "Arthropoda", invertedSwaps, taxa, unmappedTaxa);

        mapped.push(row);
    }
    const resolveOut = fluid.module.resolvePath(outputFile);
    await hortis.writeCSV(resolveOut, Object.keys(mapped[0]), mapped, fluid.promise());

    const taxaRows = hortis.flattenTaxa(taxa);
    await hortis.writeCSV(outputTaxaFile, Object.keys(taxaRows[0]), taxaRows, fluid.promise());

    const unmapped = Object.keys(unmappedTaxa);
    console.log("Listing " + unmapped.length + " unmapped taxa:");
    const unmappedRows = unmapped.map(function (key) {
        const scientificName = unmappedTaxa[key].scientificName;
        console.log(key + ", original name " + scientificName);
        return {taxonName: key, originalName: scientificName};
    });
    await hortis.writeCSV(mismatchFile, Object.keys(unmappedRows[0]), unmappedRows, fluid.promise());

});
