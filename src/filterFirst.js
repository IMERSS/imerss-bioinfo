/* eslint-env node */

"use strict";

var fluid = require("infusion");
var csvWriterModule = require("csv-writer");
var minimist = require("minimist");

require("./dataProcessing/readCSV.js");

var hortis = fluid.registerNamespace("hortis");

fluid.defaults("hortis.filterFirst.csvReader", {
    gradeNames: "hortis.csvFileReader",
    members: {
        uniqueRows: {}
    },
    dateField: null,
    uniqueField: null,
    outputFile: null,
    listeners: {
        "onHeaders.validateHeaders": {
            funcName: "hortis.filterFirst.validateHeaders",
            args: ["{that}.headers", "{that}.options.dateField", "{that}.options.uniqueField", "{that}.events.onError"]
        },
        "onRow.storeRow": "hortis.filterFirst.storeRow({that}, {arguments}.0)",
        "onCompletion.writeCSV": {
            funcName: "hortis.filterFirst.writeCSV",
            args: ["{that}.options.outputFile", "{that}.headers", "{that}.uniqueRows", "{that}.completionPromise"]
        }
    }
});

hortis.filterFirst.validateHeaders = function (headers, dateField, uniqueField, onError) {
    if (!headers.includes(dateField)) {
        onError.fire("Date field " + dateField + " not found in headers ", headers);
    }
    if (!headers.includes(uniqueField)) {
        onError.fire("Unique filter field " + uniqueField + " not found in headers ", headers);
    }
};

hortis.filterFirst.storeRow = function (that, row) {
    row.timestamp = Date.parse(row[that.options.dateField]);
    var uniqueVal = row[that.options.uniqueField];
    var existing = that.uniqueRows[uniqueVal];
    if (existing) {
        if (row.timestamp < existing.timestamp) {
            that.uniqueRows[uniqueVal] = row;
        }
    } else {
        that.uniqueRows[uniqueVal] = row;
    }
};

hortis.filterFirst.rowToArray = function (row, headers) {
    return headers.map(function (header) {
        return row[header];
    });
};

hortis.filterFirst.writeCSV = function (fileName, headers, uniqueRows, completionPromise) {
    var csvWriter = csvWriterModule.createArrayCsvWriter({
        header: headers,
        path: fileName
    });
    var arrayRows = [];
    fluid.each(uniqueRows, function (row) {
        arrayRows.push(hortis.filterFirst.rowToArray(row, headers));
    });
    var promise = csvWriter.writeRecords(arrayRows);
    fluid.promise.follow(promise, completionPromise);
};


var parsedArgs = minimist(process.argv.slice(2));

var outputFile = parsedArgs.o || "filtered.csv";

var that = hortis.filterFirst.csvReader({
    uniqueField: "Taxon name",
    dateField: "Date observed",
    inputFile: "data/Galiano/Galiano_marine_species_catalogue.csv",
    outputFile: outputFile
});

that.completionPromise.then(null, function (error) {
    console.error(error);
});
