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
    var latitude = hortis.parseFloat(row.latitude);
    var longitude = hortis.parseFloat(row.longitude);
    return !isNaN(latitude) && !isNaN(longitude) ? [latitude, longitude] : null;
};

hortis.summarise.copyObsFields = function (target, source, prefix, fields) {
    fields.forEach(function (field) {
        if (source[field]) {
            var targetField = prefix + hortis.capitalize(field);
            target[targetField] = source[field];
        }
    });
};

hortis.summarise.updateRowRange = function (that, summaryRow, obsRow) {
    var obsCountField = that.options.fields.obsCount;
    if (!summaryRow) {
        summaryRow = fluid.filterKeys(obsRow, Object.keys(hortis.summariseCommonOutMap.columns));
        summaryRow.firstTimestamp = Infinity;
        summaryRow.lastTimestamp = -Infinity;
        summaryRow[obsCountField] = 1;
    } else {
        summaryRow[obsCountField]++;
    }
    var fields = Object.keys(hortis.obsToSummaryFields);
    if (obsRow.timestamp < summaryRow.firstTimestamp) {
        hortis.summarise.copyObsFields(summaryRow, obsRow, "first", fields);
    }

    if (obsRow.timestamp > summaryRow.lastTimestamp) {
        hortis.summarise.copyObsFields(summaryRow, obsRow, "last", fields);
    }

    return summaryRow;
};

hortis.summarise.storeRow = function (that, row) {
    var fields = that.options.fields;
    var coordsField = fields.coords;
    row.timestamp = Date.parse(row[fields.date]);
    var uniqueVal = row[fields.unique];
    var existing = that.uniqueRows[uniqueVal];

    var summaryRow = hortis.summarise.updateRowRange(that, existing, row);

    that.uniqueRows[uniqueVal] = summaryRow;

    if (that.options.summarise) {
        var obsId = row[fields.obsId];
        if (obsId === undefined) {
            fluid.fail("Unable to find unique observation field for row ", row);
        }
        var coords = hortis.summarise.parseCoordinates(row);
        if (coords) {
            fluid.set(summaryRow, [coordsField, obsId], coords);
            row.latitude = coords[0];
            row.longitude = coords[1];
        } else {
            ++that.withoutCoords;
            console.log("Row without coords ", fluid.filterKeys(row, ["taxonName", "observationId"]));
        }
    }
};
