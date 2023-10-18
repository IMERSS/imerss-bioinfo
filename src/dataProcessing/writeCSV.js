/* eslint-env node */

"use strict";

const fluid = require("infusion");
const csvWriterModule = require("csv-writer");

const hortis = fluid.registerNamespace("hortis");

require("./readCSVWithmap.js");
require("./readCSVWithoutMap.js");
require("../utils/utils.js");

hortis.writeCSV = function (fileName, headersOrMap, rows, completionPromise) {
    const isHeaders = fluid.isArrayable(headersOrMap);
    const headers = isHeaders ? headersOrMap : Object.values(headersOrMap);
    const duplicates = hortis.findDuplicates(headers);
    if (duplicates.length > 0) {
        fluid.fail("Error in hortis.writeCSV: duplicate column names: ", duplicates.join(", "));
    }
    const csvWriter = csvWriterModule.createArrayCsvWriter({
        header: headers,
        path: fileName
    });
    const arrayRows = [];
    fluid.each(rows, function (row) {
        arrayRows.push(hortis[isHeaders ? "rowToArray" : "mapToArray"](row, headersOrMap));
    });
    const promise = csvWriter.writeRecords(arrayRows);
    promise.then(function () {
        fluid.log("Written " + arrayRows.length + " lines to CSV file ", fileName);
    });
    fluid.promise.follow(promise, completionPromise);
    return promise;
};
