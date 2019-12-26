/* eslint-env node */

"use strict";

var fluid = require("infusion");
var minimist = require("minimist");

require("./dataProcessing/readCSV.js");
require("./dataProcessing/summarise.js");

var hortis = fluid.registerNamespace("hortis");

fluid.defaults("hortis.summarise.csvReader", {
    gradeNames: "hortis.summarise",
    outputFile: null,
    listeners: {
        "onHeaders.validateHeaders": {
            funcName: "hortis.summarise.validateHeaders",
            args: ["{that}.headers", "{that}.options.dateField", "{that}.options.uniqueField", "{that}.events.onError"]
        },
        "onRow.storeRow": "{that}.storeRow",
        "onCompletion.writeCSV": {
            funcName: "hortis.bagatelle.writeCSV",
            args: ["{that}.options.outputFile", "{that}.headers", "{that}.uniqueRows", "{that}.completionPromise"]
        }
    }
});

hortis.summarise.validateHeaders = function (headers, dateField, uniqueField, onError) {
    if (!headers.includes(dateField)) {
        onError.fire("Date field " + dateField + " not found in headers ", headers);
    }
    if (!headers.includes(uniqueField)) {
        onError.fire("Unique filter field " + uniqueField + " not found in headers ", headers);
    }
};

var parsedArgs = minimist(process.argv.slice(2));

var outputFile = parsedArgs.o || "filtered.csv";

var that = hortis.summarise.csvReader({
    uniqueField: "Taxon name",
    dateField: "Date observed",
    inputFile: "data/Galiano/Galiano_marine_species_catalogue.csv",
    outputFile: outputFile
});

that.completionPromise.then(null, function (error) {
    console.error(error);
});
