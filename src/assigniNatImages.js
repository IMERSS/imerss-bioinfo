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

const parsedArgs = minimist(process.argv.slice(2));

const inputFile = parsedArgs._[0] || fluid.module.resolvePath("%imerss-bioinfo/data/Xetthecum/reintegrated.csv");

const reader = hortis.csvReaderWithoutMap({
    inputFile: inputFile,
    csvOptions: {
        //separator: "\t" // TODO: remember to put this back for real GBIF
    }
});

hortis.assignedFromInput = function (inputFile) {
    const lastDotPos = inputFile.lastIndexOf(".");
    return inputFile.substring(0, lastDotPos) + "-withImages" + inputFile.substring(lastDotPos);
};

const outputFile = parsedArgs.o || hortis.assignedFromInput(inputFile);

const source = hortis.iNatTaxonSource();

hortis.lowRanks = ["kingdom", "phylum", "subphylum", "superclass", "class", "subclass", "superorder", "order",
    "suborder", "infraorder", "superfamily", "family", "subfamily", "tribe", "genus", "species", "subspecies"];

hortis.highRanks = hortis.lowRanks.map(hortis.capitalize);

hortis.finestRank = function (row, ranks) {
    let finestRank = null;
    ranks.forEach(function (rank) {
        if (row[rank]) {
            finestRank = rank;
        }
    });
    return finestRank;
};

hortis.queryFromReintegrated = function (row) {
    const name = hortis.sanitizeSpeciesName(row["Taxon name"]);
    const phylum = row.Phylum;
    const rank = hortis.finestRank(row, hortis.highRanks);
    return {name, phylum, rank};
};

// One-off script to update taxonomies and iNaturalist ids from files produced in Andrew's 2022 run of Galiano data

hortis.applyName = async function (row) {
    const query = hortis.queryFromReintegrated(row);

    const looked = await source.get(query);
    //    console.log("Got document ", looked);
    if (looked && looked.doc) {
        row["Name Status"] = looked.doc.nameStatus;
        row["Referred iNaturalist Id"] = looked.doc.id;
        row["Referred iNaturalist Name"] = looked.doc.name;
        const lookedId = await source.get({id: looked.doc.id});
        row.iNaturalistTaxonImage = lookedId?.doc.default_photo?.medium_url;
        row.wikipediaSummary = lookedId?.doc.wikipedia_summary;
        if (row.commonName === "") {
            row.commonName = lookedId?.doc.preferred_common_name;
        }
    } else {
        row["Name Status"] = "unknown";
    }
};

Promise.all([reader.completionPromise, source.events.onCreate]).then(async function () {
    const mapped = [];
    for (let i = 0; i < reader.rows.length; ++i) {
        console.log("Processing row ", i);
        const row = reader.rows[i];
        await hortis.applyName(row);
        // TODO: produce mapping functions for these older forms of data
        /*
        if (row.infraTaxonName) {
            await hortis.applyName(row, row.infraTaxonName);
        }
        if (!row.infraTaxonName || row["Name Status"] === "unknown") {
            await hortis.applyName(row, hortis.unscrewGBIFName(row.scientificName)); // taxonName for Dunwiddie data, scientificName for DwC
        }
        */
        mapped.push(row);
    }
    hortis.writeCSV(fluid.module.resolvePath(outputFile), Object.keys(mapped[0]), mapped, fluid.promise());
});
