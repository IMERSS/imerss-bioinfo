/* eslint-env node */

"use strict";

var fluid = require("infusion");
var csvModule = require("csv-parser");
var csvWriterModule = require("csv-writer");
var fs = require("fs");
var minimist = require("minimist");

var hortis = fluid.registerNamespace("hortis");

fluid.defaults("hortis.csvReader", {
    gradeNames: "fluid.component",
    members: {
        line: 1,
        rowStream: null,
        headers: {},
        rows: [],
        completionPromise: "@expand:fluid.promise()"
    },
    events: {
        onHeaders: null,
        onRow: null,
        onError: null,
        onCompletion: null
    },
    listeners: {
        "onRow.lineCounter": {
            funcName: "hortis.csvReader.incLine",
            args: "{that}",
            priority: "first"
        },
        "onHeaders.storeHeaders": "hortis.csvReader.storeHeaders({that}, {arguments}.0)",
        "onError.rejector": "hortis.csvReader.rejector({that}, {arguments}.0)",
        "onCreate.openStream": "fluid.notImplemented",
        "onCreate.bindStream": {
            priority: "after:openStream",
            funcName: "hortis.csvReader.bindStream"
        }
    }
});

hortis.csvReader.incLine = function (that) {
    ++that.line;
};

hortis.csvReader.storeHeaders = function (that, headers) {
    that.headers = headers;
};

hortis.csvReader.rejector = function (that, error) {
    that.completionPromise.reject("Error at line " + that.line + " reading file " + that.options.inputFile + ": " + error);
};

hortis.csvReader.bindStream = function (that) {
    that.rowStream.on("data", function (data) {
        that.events.onRow.fire(data);
    });
    that.rowStream.on("error", function (error) {
        that.events.onError.fire(error);
    });
    that.rowStream.on("headers", function (headers) {
        that.events.onHeaders.fire(headers);
    });
    that.rowStream.on("end", function () {
        that.events.onCompletion.fire();
    });
};



fluid.defaults("hortis.csvFileReader", {
    gradeNames: "hortis.csvReader",
    inputFile: null,
    listeners: {
        "onCreate.openStream": "hortis.csvFileReader.openFileStream"
    }
});

hortis.csvFileReader.openFileStream = function (that) {
    that.rowStream = fs.createReadStream(that.options.inputFile).pipe(csvModule());
};



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
