/* eslint-env node */

"use strict";

const fluid = require("infusion");
const minimist = require("minimist");
fluid.require("%bagatelle");

require("./dataProcessing/readCSV.js");
require("./dataProcessing/readCSVwithMap.js");
require("./dataProcessing/writeCSV.js");

require("./iNaturalist/taxonAPI.js");

const hortis = fluid.registerNamespace("hortis");

fluid.setLogging(true);

const parsedArgs = minimist(process.argv.slice(2));

const outputFile = parsedArgs.o || "assigned.csv";
// fluid.module.resolvePath("%bagatelle/data/Comprehensive Lists/San_Juan_Dunwiddie_List.csv");
// fluid.module.resolvePath("%bagatelle/data/Galiano 2022/Tracheophyta_review_summary_reviewed_2022-10-29.csv")
// fluid.module.resolvePath("%bagatelle/data/Squamish/Tracheophyta_review_summary_2022-12-14.csv")
// fluid.module.resolvePath("%bagatelle/data/Squamish/GBIF_2022_Plantae_DwC-deauthorized.csv")
const inputFile = parsedArgs._[0] || fluid.module.resolvePath("%bagatelle/data/Squamish/GBIF_2022_Plantae_DwC-deauthorized.csv");

const reader = hortis.csvReaderWithoutMap({
    inputFile: inputFile
});

const source = hortis.iNatTaxonSource();

// One-off script to update taxonomies and iNaturalist ids from files produced in Andrew's 2022 run of Galiano data

hortis.applyName = async function (row, taxon) {
    const saneName = hortis.sanitizeSpeciesName(taxon);
    const looked = await source.get({name: saneName});
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
            row["Indexed iNaturalist Name"] = lookedId ? lookedId.doc.name : "unknown";
        } catch (e) {
            console.log("Got error: ", e);
            row["Indexed iNaturalist Name"] = "error";
            if (e.statusCode !== 404) {
                throw e;
            }
        }
    }
    const obsLink = row["iNaturalist Link"];
    if (obsLink) {
        const slashPos = obsLink.lastIndexOf("/");
        const obsId = obsLink.substring(slashPos + 1);
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

Promise.all([reader.completionPromise, source.events.onCreate]).then(async function () {
    const mapped = [];
    for (let i = 0; i < reader.rows.length; ++i) {
        console.log("Processing row ", i);
        const row = reader.rows[i];
        // const taxon = row["taxonName"]; // Taxon for AS reviewed data
        if (row.infraTaxonName) {
            await hortis.applyName(row, row.infraTaxonName);
        }
        if (!row.infraTaxonName || row["Name Status"] === "unknown") {
            await hortis.applyName(row, row.taxonName); // taxonName for Dunwiddie data
        }

        mapped.push(row);
    }
    hortis.writeCSV(fluid.module.resolvePath(outputFile), Object.keys(mapped[0]), mapped, fluid.promise());
});
