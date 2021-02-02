/* eslint-env node */

"use strict";

var fluid = require("infusion");
var csvWriterModule = require("csv-writer");

var hortis = fluid.registerNamespace("hortis");

require("./readCSVWithmap.js");
require("./readCSVWithoutMap.js");

hortis.writeCSV = function (fileName, headersOrMap, rows, completionPromise) {
    var isHeaders = fluid.isArrayable(headersOrMap);
    var headers = isHeaders ? headersOrMap : Object.values(headersOrMap);
    var csvWriter = csvWriterModule.createArrayCsvWriter({
        header: headers,
        path: fileName
    });
    var arrayRows = [];
    fluid.each(rows, function (row) {
        arrayRows.push(hortis[isHeaders ? "rowToArray" : "mapToArray"](row, headersOrMap));
    });
    var promise = csvWriter.writeRecords(arrayRows);
    promise.then(function () {
        fluid.log("Written " + arrayRows.length + " lines to CSV file ", fileName);
    });
    fluid.promise.follow(promise, completionPromise);
};
