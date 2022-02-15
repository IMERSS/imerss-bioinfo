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

hortis.rowToLoggable = function (row) {
    return fluid.filterKeys(row, ["iNaturalistTaxonName", "observationId", "placeName", "latitude", "longitude"]);
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
                    var tolog = hortis.rowToLoggable(row);
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

hortis.processAssignFeature = function (resolved, patch) {
    var extraCols = {};
    var features = patch.patchData.features;
    var last = Date.now();
    resolved.obsRows.forEach(function (row) {
        row.point = [hortis.parseFloat(row.longitude), hortis.parseFloat(row.latitude)];
        var intersects = features.filter(function (feature) {
            return hortis.intersectsFeature(feature, row);
        });
        if (intersects.length === 0) {
            console.log("Warning: row ", hortis.rowToLoggable(row), " did not intersect any feature");
        } else {
            if (intersects.length > 1) {
                var allProps = fluid.getMembers(intersects, "properties");
                console.log("Warning: row ", hortis.rowToLoggable(row), " intersected multiple features: ", allProps);
            }
            var props = intersects[0].properties;
            fluid.extend(row, props);
            fluid.extend(extraCols, props);
        }
    });
    console.log("Intersected " + resolved.obsRows.length + " observations in " + (Date.now() - last) + " ms");
    var extraOutMap = {
        columns: fluid.transform(extraCols, function (junk, key) {
            return key;
        })
    };
    resolved.combinedObsOutMap = hortis.combineMaps([resolved.combinedObsOutMap, extraOutMap], true);
};
