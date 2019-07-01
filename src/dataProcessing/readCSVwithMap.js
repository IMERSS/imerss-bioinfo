/* eslint-env node */

"use strict";

var fluid = require("infusion");
var csvWriterModule = require("csv-writer");

var hortis = fluid.registerNamespace("hortis");

fluid.defaults("hortis.bagatelle.csvReader", {
    gradeNames: "hortis.csvFileReader",
    members: {
        rows: []
    },
    mapColumns: null,
    listeners: {
        "onHeaders.validateHeaders": {
            funcName: "hortis.bagatelle.validateHeaders",
            args: ["{that}.options.map", "{that}.headers", "{that}.events.onError"]
        },
        "onRow.storeRow": "hortis.bagatelle.storeRow({that}, {arguments}.0)",
        "onCompletion.resolve": {
            func: "{that}.completionPromise.resolve",
            args: {
                rows: "{that}.rows"
            }
        }
    }
});

hortis.bagatelle.mapRow = function (data, mapColumns, index) {
    var togo = {};
    fluid.each(mapColumns, function (label, key) {
        togo[key] = data[label];
    });
    togo.index = index;
    return togo;
};

hortis.bagatelle.storeRow = function (that, row) {
    var mappedRow = hortis.bagatelle.mapRow(row, that.options.mapColumns, that.rows.length + 1);
    that.rows.push(mappedRow);
};

hortis.bagatelle.validateHeaders = function (mapColumns, headers, onError) {
    fluid.each(mapColumns, function (label) {
        if (headers.indexOf(label) === -1) {
            onError.fire("Error in headers - field " + label + " required in map file was not found");
        }
    });
};

hortis.bagatelle.rowToArray = function (row, headers) {
    return headers.map(function (header) {
        return row[header];
    });
};

hortis.bagatelle.mapToArray = function (row, map) {
    var keys = Object.keys(map);
    return keys.map(function (header) {
        return row[header];
    });
};

hortis.bagatelle.writeCSV = function (fileName, headersOrMap, rows, completionPromise) {
    var isHeaders = fluid.isArrayable(headersOrMap);
    var headers = isHeaders ? headers : Object.values(headersOrMap);
    var csvWriter = csvWriterModule.createArrayCsvWriter({
        header: headers,
        path: fileName
    });
    var arrayRows = [];
    fluid.each(rows, function (row) {
        arrayRows.push(hortis.bagatelle[isHeaders ? "rowToArray" : "mapToArray"](row, headersOrMap));
    });
    var promise = csvWriter.writeRecords(arrayRows);
    promise.then(function () {
        fluid.log("Written CSV file ", fileName);
    });
    fluid.promise.follow(promise, completionPromise);
};
