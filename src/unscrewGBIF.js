/* eslint-env node */

"use strict";

const fluid = require("infusion");
const minimist = require("minimist");
fluid.require("%bagatelle");

require("./dataProcessing/readCSV.js");
require("./dataProcessing/readCSVwithoutMap.js");
require("./dataProcessing/writeCSV.js");

const hortis = fluid.registerNamespace("hortis");

fluid.setLogging(true);

// Unscrew GBIF output by extracting back out into a stable field "scientificName" whatever is the most derived taxon name
// held in any taxon field

const parsedArgs = minimist(process.argv.slice(2));

const outputFile = parsedArgs.o || "unscrewed.csv";
const inputFile = parsedArgs._[0] || "%bagatelle/data/RBCM/RBCM_GBIF_records_intersected_with_Galiano_polygon_2021_03_08.tsv";

const input = hortis.csvReaderWithoutMap({
    inputFile: fluid.module.resolvePath(inputFile),
    csvOptions: {
//        separator: "\t" // TODO: remember to put this back for real GBIF
    }
});
input.completionPromise.then(function () {
    const rows = input.rows.map(function (row) {
        row.taxonName = row.species || row.genus || row.family || row.order || row["class"] || row.phylum || row.kingdom;
        row.infraTaxonName = "";
        const infra = row["infraspecificEpithet"];
        if (infra) {
            const rank = row.taxonRank === "VARIETY" ? " var. " : " ssp. ";
            row.infraTaxonName += row.taxonName + rank + infra;
        }
        return row;
    });
    const completion = fluid.promise();
    hortis.writeCSV(fluid.module.resolvePath(outputFile), Object.keys(rows[0]), rows, completion);
});
