/* eslint-env node */

"use strict";

var fluid = require("infusion");

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
