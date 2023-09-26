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

const inputFile = parsedArgs._[0] || fluid.module.resolvePath("%imerss-bioinfo/data/b-team/plant-pollinators-Carril-normalised.csv");

const reader = hortis.csvReaderWithoutMap({
    inputFile: inputFile
});

const source = hortis.iNatTaxonSource();

Promise.all([reader.completionPromise, source.events.onCreate]).then(async function () {
    const mapped = [];
    for (let i = 0; i < reader.rows.length; ++i) {
        console.log("Processing row ", i);
        const row = reader.rows[i];

        mapped.push(row);
    }
    hortis.writeCSV(fluid.module.resolvePath(outputFile), Object.keys(mapped[0]), mapped, fluid.promise());
});
