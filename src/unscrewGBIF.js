/* eslint-env node */

"use strict";

var fluid = require("infusion");
var minimist = require("minimist");
fluid.require("%bagatelle");

require("./dataProcessing/readCSV.js");
require("./dataProcessing/readCSVwithoutMap.js");
require("./dataProcessing/writeCSV.js");

var hortis = fluid.registerNamespace("hortis");

fluid.setLogging(true);

// Unscrew GBIF output by extracting back out into a stable field "scientificName" whatever is the most derived taxon name
// held in any taxon field

var parsedArgs = minimist(process.argv.slice(2));

var outputFile = parsedArgs.o || "unscrewed.csv";
var inputFile = parsedArgs._[0] || "%bagatelle/data/RBCM/RBCM_GBIF_records_intersected_with_Galiano_polygon_2021_03_08.tsv";

var input = hortis.csvReaderWithoutMap({
    inputFile: fluid.module.resolvePath(inputFile),
    csvOptions: {
        separator: "\t"
    }
});
input.completionPromise.then(function () {
    var rows = input.rows.map(function (row) {
        row.scientificName = row.species || row.genus || row.family || row.order || row["class"] || row.phylum || row.kingdom;
        return row;
    });
    var completion = fluid.promise();
    hortis.writeCSV(fluid.module.resolvePath(outputFile), input.headers, rows, completion);
});
