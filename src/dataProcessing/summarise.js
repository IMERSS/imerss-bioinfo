/* eslint-env node */

"use strict";

var fluid = require("infusion");

var hortis = fluid.registerNamespace("hortis");

fluid.defaults("hortis.summarise", {
    gradeNames: "fluid.component",
    summarise: true,
    members: {
        uniqueRows: {},
        discardedRows: {}
    },
    fields: {
        date: "dateObserved",
        unique: "iNaturalistTaxonName", // Field which identifies observations as being of the same taxon
        obsCount: "observationCount",
        obsId: "observationId",
        coords: "coords"
    },
    invokers: {
        storeRow: "hortis.summarise.storeRow({that}, {arguments}.0)"
    }
});

// Helpful answer: https://stackoverflow.com/a/35759874
hortis.parseFloat = function (str) {
    return isNaN(str) ? NaN : parseFloat(str);
};

hortis.summarise.pushCoordinates = function (existing, row, coordsField, obsId) {
    var latitude = hortis.parseFloat(row.privateLatitude || row.latitude);
    var longitude = hortis.parseFloat(row.privateLongitude || row.longitude);
    if (!isNaN(latitude) && !isNaN(longitude)) {
        fluid.set(existing, [coordsField, obsId], [latitude, longitude]);
    };
};

hortis.summarise.storeRow = function (that, row) {
    var fields = that.options.fields;
    var obsCountField = fields.obsCount;
    var coordsField = fields.coords;
    row.timestamp = Date.parse(row[fields.date]);
    var uniqueVal = row[fields.unique];
    var existing = that.uniqueRows[uniqueVal];
    if (existing) {
        if (row.timestamp < existing.timestamp) {
            that.uniqueRows[uniqueVal] = row;
            row[obsCountField] = existing[obsCountField];
            row[coordsField] = existing[coordsField];
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
    if (that.options.summarise) {
        var obsId = row[fields.obsId];
        if (obsId === undefined) {
            fluid.fail("Unable to find unique observation field for row ", row);
        }
        hortis.summarise.pushCoordinates(existing, row, coordsField, obsId);
    }
};
