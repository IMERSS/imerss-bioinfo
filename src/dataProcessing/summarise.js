/* eslint-env node */

"use strict";

var fluid = require("infusion");

var hortis = fluid.registerNamespace("hortis");

fluid.defaults("hortis.summarise", {
    gradeNames: "fluid.component",
    summarise: true,
    members: {
        uniqueRows: {},
        discardedRows: {},
        withoutCoords: 0
    },
    fields: {
        date: "dateObserved",
        collection: "collection",
        unique: "iNaturalistTaxonName", // Field which identifies observations as being of the same taxon
        obsCount: "observationCount",
        obsId: "observationId",
        coords: "coords"
    },
    invokers: {
        storeRow: "hortis.summarise.storeRow({that}, {arguments}.0)"
    }
});

hortis.summarise.parseCoordinates = function (row) {
    var latitude = hortis.parseFloat(row.privateLatitude || row.latitude);
    var longitude = hortis.parseFloat(row.privateLongitude || row.longitude);
    return !isNaN(latitude) && !isNaN(longitude) ? [latitude, longitude] : null;
};

hortis.summarise.storeRow = function (that, row) {
    var fields = that.options.fields;
    var obsCountField = fields.obsCount;
    var coordsField = fields.coords;
    var collectionField = fields.collection;
    row.timestamp = Date.parse(row[fields.date]);
    var uniqueVal = row[fields.unique];
    var existing = that.uniqueRows[uniqueVal];
    if (existing) {
        // TODO: This is an incomplete and ancient workflow - in practice to fully "Simonize" we should do this
        // separately in the category of naturalist and citizen obs - but it would be better instead to do this
        // as post-processing after the process of fusing obs. Also we would like to recover the ability to work
        // on data which had already been summarised, although this is of low priority
        if (row.timestamp < existing.timestamp) {
            that.uniqueRows[uniqueVal] = row;
            row[obsCountField] = existing[obsCountField];
            row[coordsField] = existing[coordsField];
            row[collectionField] = existing[collectionField];
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
        var coords = hortis.summarise.parseCoordinates(row);
        if (coords) {
            fluid.set(existing, [coordsField, obsId], coords);
            row.latitude = coords[0];
            row.longitude = coords[1];
        } else {
            ++that.withoutCoords;
            console.log("Row without coords ", row);
        }
    }
};
