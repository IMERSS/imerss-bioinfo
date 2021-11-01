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
        dateResolution: "dateObservedResolution",
        unique: "iNaturalistTaxonName", // Field which identifies observations as being of the same taxon
        obsCount: "observationCount",
        obsId: "observationId",
        coords: "coords"
    },
    invokers: {
        storeRow: "hortis.summarise.storeRow({that}, {arguments}.0)"
    }
});

// TODO: Wrong place for all of this processing - coordinates should be processed as part of the main
// parsing of the obs file

// Taken from https://stackoverflow.com/a/1140335 with several fixes
hortis.summarise.convertDMStoDD = function (degrees, minutes, seconds, direction) {
    var dd = +degrees + minutes / 60 + seconds / (60 * 60);

    if (direction === "S" || direction === "W") {
        dd = -1 * Math.abs(dd);
    }
    return dd;
};

hortis.summarise.parseDMS = function (string) {
    var parts = string.split(/[^\d\w]+/);
    return hortis.summarise.convertDMStoDD(parts[0], parts[1], parts[2], parts[3]);
};

hortis.summarise.parseCoordinate = function (value) {
    if (typeof(value) === "string" && value.match(/[NSEW]/)) {
        return hortis.summarise.parseDMS(value);
    } else {
        return hortis.parseFloat(value);
    }
};

hortis.summarise.parseCoordinates = function (row) {
    var round = function (coord) {
        return +hortis.roundDecimals(coord, 6);
    };
    var latitude = hortis.summarise.parseCoordinate(row.latitude);
    var longitude = hortis.summarise.parseCoordinate(row.longitude);
    return !isNaN(latitude) && !isNaN(longitude) ? [round(latitude), round(longitude)] : null;
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
        // TODO: Wrong place for this logic - these should be parsed as part of main filtering workflow, and before
        // hortis.roundCoordinates
        var coords = hortis.summarise.parseCoordinates(row);
        fluid.set(summaryRow, [coordsField, obsId], coords);
        if (coords) {
            row.latitude = coords[0];
            row.longitude = coords[1];
        }
    }
};
