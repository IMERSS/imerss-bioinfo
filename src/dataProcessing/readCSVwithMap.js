/* eslint-env node */

"use strict";

var fluid = require("infusion");

var hortis = fluid.registerNamespace("hortis");

fluid.defaults("hortis.csvReaderWithMap", {
    gradeNames: ["hortis.csvFileReader", "hortis.storingCSVReader"],
    // "columns" member of the map structure
    mapColumns: null,
    listeners: {
        "onHeaders.validateHeaders": {
            funcName: "hortis.validateHeaders",
            args: ["{that}.options.map", "{that}.headers", "{that}.events.onError"]
        },
        "onRow.storeRow": "hortis.storeRow({that}, {arguments}.0)"
    }
});
// Speed on taxa - 500ms on IoC dispatch, 1300ms on mapping

hortis.mapRow = function (data, mapColumns, index) {
    var togo = {};
    fluid.each(mapColumns, function (label, key) {
        togo[key] = data[label];
    });
    togo.index = index;
    return togo;
};

hortis.storeRow = function (that, row) {
    var mappedRow = hortis.mapRow(row, that.options.mapColumns, that.rows.length + 1);
    that.rows.push(mappedRow);
};

hortis.validateHeaders = function (mapColumns, headers, onError) {
    fluid.each(mapColumns, function (label) {
        if (headers.indexOf(label) === -1) {
            onError.fire("Error in headers - field " + label + " required in map file was not found");
        }
    });
};

// Used in writeCSV
hortis.mapToArray = function (row, map) {
    var keys = Object.keys(map);
    return keys.map(function (header) {
        return row[header];
    });
};
