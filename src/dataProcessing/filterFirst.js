/* eslint-env node */

"use strict";

var fluid = require("infusion");

var hortis = fluid.registerNamespace("hortis");

fluid.defaults("hortis.filterFirst", {
    gradeNames: "fluid.component",
    members: {
        uniqueRows: {}
    },
    dateField: null,
    uniqueField: null,
    obsCountField: "observationCount",
    invokers: {
        storeRow: "hortis.filterFirst.storeRow({that}, {arguments}.0)"
    }
});

hortis.filterFirst.storeRow = function (that, row) {
    var obsCountField = that.options.obsCountField;
    row.timestamp = Date.parse(row[that.options.dateField]);
    var uniqueVal = row[that.options.uniqueField];
    var existing = that.uniqueRows[uniqueVal];
    if (existing) {
        if (row.timestamp < existing.timestamp) {
            that.uniqueRows[uniqueVal] = row;
            row[obsCountField] = existing[obsCountField];
        }
        that.uniqueRows[uniqueVal][obsCountField]++;
    } else {
        that.uniqueRows[uniqueVal] = row;
        row[obsCountField] = 1;
    }
};
