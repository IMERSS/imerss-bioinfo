/* eslint-env node */

"use strict";

const fluid = require("infusion");
const minimist = require("minimist");
fluid.require("%bagatelle");

require("./dataProcessing/readJSON.js");
require("./dataProcessing/readCSV.js");
require("./dataProcessing/readCSVwithMap.js");
require("./dataProcessing/writeCSV.js");

require("./iNaturalist/taxonAPI.js");

const hortis = fluid.registerNamespace("hortis");

fluid.setLogging(true);

const parsedArgs = minimist(process.argv.slice(2));

const outputFile = parsedArgs.o || "assigned.csv";
const inputFile = parsedArgs._[0] || fluid.module.resolvePath("%bagatelle/data/Galiano 2022/Tracheophyta_review_summary_reviewed_2022-10-29.csv");

const reader = hortis.csvReaderWithoutMap({
    inputFile: inputFile
});

const source = hortis.iNatTaxonSource();

Promise.all([reader.completionPromise, source.events.onCreate]).then(async function () {
    const mapped = [];
    for (let i = 0; i < reader.rows.length; ++i) {
        console.log("Processing row ", i);
        const row = reader.rows[i];
        const taxon = row["Taxon"];
        const saneName = hortis.sanitizeSpeciesName(taxon);
        const looked = await source.get({name: saneName});
        console.log("Got document ", looked);
        if (looked) {
            row["Name Status"] = looked.doc.nameStatus;
            row["Referred iNaturalist Id"] = looked.doc.id;
            row["Referred iNaturalist Name"] = looked.doc.name;
            await hortis.iNat.getRanks(looked.doc.id, row, source.byId);
        } else {
            row["Name Status"] = "unknown";
        }
        const lookedId = await source.get({id: row.ID});
        row["Indexed iNaturalist Name"] = lookedId ? lookedId.doc.name : "unknown";
        mapped.push(row);
    }
    hortis.writeCSV(fluid.module.resolvePath(outputFile), Object.keys(mapped[0]), mapped, fluid.promise());
});
