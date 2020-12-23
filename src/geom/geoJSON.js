/* eslint-env node */

"use strict";

var fluid = require("infusion");

var hortis = fluid.registerNamespace("hortis");

hortis.countTrue = function (array) {
    return array.reduce( function(a, c) {return a + c;}, 0);
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
                intersects = coords.find(function (polyPolygon) {
                    return intersectPolygon(polyPolygon);
                });
            }
            return intersects;
        }
    }
};
