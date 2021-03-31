/* eslint-env node */

"use strict";

var fluid = require("infusion");

require("../lib/point-in-polygon.js");

var hortis = fluid.registerNamespace("hortis");

hortis.countTrue = function (array) {
    return array.reduce(function (a, c) {return a + c;}, 0);
};

hortis.intersections = 0;

hortis.intersectsFeature = function (feature, mappedRow) {
    if (!hortis.isPoint(mappedRow.point)) {
        return false;
    } else {
        var reject = function (message) {
            fluid.fail(message + " for feature ", feature);
        };
        var intersectPolygon = function (polyPolygon) {
            var intersects = polyPolygon.map(function (polygon) {
                ++hortis.intersections;
                return hortis.pointInPolygon(mappedRow.point, polygon);
            });
            var count = hortis.countTrue(intersects);
            return count % 2;
        };
        var geometry = feature.geometry;
        // Stupid export of Galiano polygon has the latter type
        if (geometry.type !== "MultiPolygon" && geometry.type !== "MultiLineString") {
            reject("Cannot handle feature type " + geometry.type);
        } else {
            var coords = geometry.coordinates;
            var intersects = false;
            if (geometry.type === "MultiLineString") {
                intersects = intersectPolygon(coords);
            } else {
                intersects = coords.some(function (polyPolygon) {
                    return intersectPolygon(polyPolygon);
                });
            }
            return intersects;
        }
    }
};

hortis.intersectsAnyFeature = function (features, row) {
    var intersects = features.map(function (feature) {
        return hortis.intersectsFeature(feature, row);
    });
    var intersectCount = hortis.countTrue(intersects);
    return intersectCount > 0;
};

hortis.makeFeatureRowFilter = function (feature, options) {
    options = options || {};
    return function (rows) {
        var rejections = 0;
        var togo = rows.filter(function (row) {
            row.point = [hortis.parseFloat(row.longitude), hortis.parseFloat(row.latitude)];
            var accept = hortis.intersectsAnyFeature(feature, row);
            if (!accept) {
                ++rejections;
                if (options.logRejection) {
                    var tolog = fluid.filterKeys(row, ["iNaturalistTaxonName", "observationId", "placeName", "latitude", "longitude"]);
                    console.log("Rejecting observation ", tolog, " as lying outside polygon " + options.featureName);
                }
            }
            return accept;
        });
        console.log("Rejecting " + rejections + " observations as lying outside polygon " + options.featureName);
        return togo;
    };
};

hortis.processRegionFilter = function (resolved, patch, key) {
    var filter = hortis.makeFeatureRowFilter(patch.patchData.features, {
        logRejection: patch.logRejection,
        featureName: key
    });
    // TODO: MATT-based immutable filtering!
    resolved.obsRows = filter(resolved.obsRows);
};
