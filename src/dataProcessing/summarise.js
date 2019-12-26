/* eslint-env node */

"use strict";

var fluid = require("infusion");

var hortis = fluid.registerNamespace("hortis");

fluid.defaults("hortis.summarise", {
    gradeNames: "fluid.component",
    members: {
        uniqueRows: {},
        discardedRows: {}
    },
    dateField: null,
    uniqueField: null,
    obsCountField: "observationCount",
    invokers: {
        storeRow: "hortis.summarise.storeRow({that}, {arguments}.0)"
    }
});

// Helpful answer: https://stackoverflow.com/a/35759874
hortis.parseFloat = function (str) {
    return isNaN(str) ? NaN : parseFloat(str);
};

hortis.summarise.pushCoordinates = function (existing, row) {
    var latitude = hortis.parseFloat(row.latitude);
    var longitude = hortis.parseFloat(row.longitude);
    if (!isNaN(latitude) && !isNaN(longitude)) {
        var coords = existing.coords;
        if (!coords) {
            coords = existing.coords = [];
        }
        coords.push([latitude, longitude]);
    };
};

hortis.summarise.storeRow = function (that, row) {
    var obsCountField = that.options.obsCountField;
    row.timestamp = Date.parse(row[that.options.dateField]);
    var uniqueVal = row[that.options.uniqueField];
    var existing = that.uniqueRows[uniqueVal];
    if (existing) {
        if (row.timestamp < existing.timestamp) {
            that.uniqueRows[uniqueVal] = row;
            row[obsCountField] = existing[obsCountField];
        } else {
            var discardEntry = that.discardedRows[uniqueVal];
            if (!discardEntry) {
                that.discardedRows[uniqueVal] = discardEntry = [that.uniqueRows[uniqueVal]];
            }
            discardEntry.push(row);
        }
        that.uniqueRows[uniqueVal][obsCountField]++;
    } else {
        existing = that.uniqueRows[uniqueVal] = row;
        row[obsCountField] = 1;
    }
    hortis.summarise.pushCoordinates(existing, row);
};
