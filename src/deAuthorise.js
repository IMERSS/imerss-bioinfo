/* eslint-env node */

"use strict";

const fluid = require("infusion");
const minimist = require("minimist");
fluid.require("%bagatelle");

require("./dataProcessing/readCSV.js");
require("./dataProcessing/readCSVwithMap.js");
require("./dataProcessing/writeCSV.js");

const hortis = fluid.registerNamespace("hortis");

fluid.setLogging(true);

const parsedArgs = minimist(process.argv.slice(2));

const outputFile = parsedArgs.o || "deauthorized.csv";
const inputFile = parsedArgs._[0] || fluid.module.resolvePath("%bagatelle/data/Comprehensive Lists/sji_master_flora.csv");

const reader = hortis.csvReaderWithoutMap({
    inputFile: inputFile
});

// One-off script to parse out authorities from files such as those received from Dunwiddie

reader.completionPromise.then(async function () {
    const mapped = [];
    for (let i = 0; i < reader.rows.length; ++i) {
        console.log("Processing row ", i);
        const row = reader.rows[i];
        const taxon = row["Full Species"];
        const parsed = taxon.split(" ");
        row.taxonName = parsed[0] + " " + parsed[1];
        const infra = row["Infra taxa"];
        if (infra) {
            row.infraTaxonName = row.taxonName + " " + infra;
        } else {
            row.infraTaxonName = "";
        }
        row.authority = parsed.slice(2).join(" ");
        mapped.push(row);
    }
    hortis.writeCSV(fluid.module.resolvePath(outputFile), Object.keys(mapped[0]), mapped, fluid.promise());
});
