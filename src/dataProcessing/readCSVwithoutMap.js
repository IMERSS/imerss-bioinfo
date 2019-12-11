/* eslint-env node */

"use strict";

var fluid = require("infusion");

var hortis = fluid.registerNamespace("hortis");

fluid.defaults("hortis.csvReaderWithoutMap", {
    gradeNames: ["hortis.csvFileReader", "hortis.storingCSVReader"],
    listeners: {
        "onRow.storeRow": "hortis.storeRowWithoutMap({that}, {arguments}.0)"
    }
});

hortis.storeRowWithoutMap = function (that, row) {
    that.rows.push(row);
};

// Used in writeCSV
hortis.rowToArray = function (row, headers) {
    return headers.map(function (header) {
        return row[header];
    });
};
