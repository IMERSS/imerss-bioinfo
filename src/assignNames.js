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

const outputFile = parsedArgs.o || "assigned.csv";
// fluid.module.resolvePath("%imerss-bioinfo/data/Comprehensive Lists/San_Juan_Dunwiddie_List.csv");
// fluid.module.resolvePath("%imerss-bioinfo/data/Galiano 2022/Tracheophyta_review_summary_reviewed_2022-10-29.csv")
// fluid.module.resolvePath("%imerss-bioinfo/data/Squamish/Tracheophyta_review_summary_2022-12-14.csv")
// fluid.module.resolvePath("%imerss-bioinfo/data/Squamish/GBIF_2022_Plantae_DwC-deauthorized.csv")
// fluid.module.resolvePath("%imerss-bioinfo/data/Squamish/GBIF_2022_Plantae_DwC-deauthorized.csv")
// fluid.module.resolvePath("%imerss-bioinfo/data/Howe Sound/AHSBR_CNALH_data_spatial_query_2023-03-03_DwC-UTF-8.csv");
const inputFile = parsedArgs._[0] || fluid.module.resolvePath("%imerss-bioinfo/data/Galiano 2024/review/Terrestrial_arthropods_review_summary_2023-10-18.csv");

const reader = hortis.csvReaderWithoutMap({
    inputFile: inputFile
});

const source = hortis.iNatTaxonSource();

hortis.highRanks = ["kingdom", "phylum", "subphylum", "superclass", "class", "subclass", "superorder", "order",
    "suborder", "infraorder", "superfamily", "family", "subfamily", "tribe", "genus", "species", "subspecies"].map(hortis.capitalize);

hortis.finestRank = function (row, ranks) {
    let finestRank = null;
    ranks.forEach(function (rank) {
        if (row[rank]) {
            finestRank = rank;
        }
    });
    return finestRank;
};

hortis.queryFromSummaryRow2023 = function (row) {
    const name = hortis.sanitizeSpeciesName(row.Taxon);
    const phylum = row.Phylum;
    const rank = hortis.finestRank(row, hortis.highRanks);
    return {name, phylum, rank};
};

hortis.obsIdFromSummaryRow2022 = function (row) {
    const obsLink = row["iNaturalist Link"];
    if (obsLink) {
        const slashPos = obsLink.lastIndexOf("/");
        const obsId = obsLink.substring(slashPos + 1);
        return obsId;
    }
};

hortis.obsIdFromSummaryRow2023 = function (row) {
    const obsLink = row["iNaturalist.Link"];
    if (obsLink) {
        const slashPos = obsLink.lastIndexOf(":");
        const obsId = obsLink.substring(slashPos + 1);
        return obsId;
    }
};

// One-off script to update taxonomies and iNaturalist ids from files produced in Andrew's 2022 run of Galiano data

hortis.applyName = async function (row) {
    const query = hortis.queryFromSummaryRow2023(row);
    const looked = await source.get(query);
    //    console.log("Got document ", looked);
    if (looked && looked.doc) {
        row["Name Status"] = looked.doc.nameStatus;
        row["Referred iNaturalist Id"] = looked.doc.id;
        row["Referred iNaturalist Name"] = looked.doc.name;
        await hortis.iNat.getRanks(looked.doc.id, row, source.byId /*, hortis.ranks*/); // uncomment for Dunwiddie
    } else {
        row["Name Status"] = "unknown";
    }
    if (row.ID && row.ID > 0) {
        try {
            const lookedId = await source.get({id: row.ID});
            row["Indexed iNaturalist Name"] = lookedId?.doc?.name || "unknown";
        } catch (e) {
            console.log("Got error: ", e);
            row["Indexed iNaturalist Name"] = "error";
            if (e.statusCode !== 404) {
                throw e;
            }
        }
    }
    const obsId = hortis.obsIdFromSummaryRow2023(row);
    if (obsId) {
        row["Observation Taxon Name"] = "error";
        if (+obsId > 0) {
            const obs = await source.get({obsId: obsId});
            if (obs.doc.results.length === 1) {
                const name = obs.doc.results[0].taxon.name;
                row["Observation Taxon Name"] = name;
            }
        }
    }
};

hortis.unscrewGBIFName = function (name) {
    const words = name.split(" ");
    let outWords = words;
    if (words.length > 2) {
        if (words[3] !== "var." && words[3] !== "subsp.") {
            outWords = words.slice(0, 2);
        }
    }
    return outWords.join(" ");
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
