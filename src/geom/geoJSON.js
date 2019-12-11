/* eslint-env node */

"use strict";

var fluid = require("infusion");

var hortis = fluid.registerNamespace("hortis");

hortis.intersectsFeature = function (feature, mappedRow) {
    if (!hortis.isPoint(mappedRow.point)) {
        return false;
    } else {
        var reject = function (message) {
            fluid.fail(message + " for feature ", feature);
        };
        var geometry = feature.geometry;
        if (geometry.type !== "MultiPolygon") {
            reject("Cannot handle feature type " + geometry.type);
        } else {
            var multiPolygon = geometry.coordinates;
            var intersects = multiPolygon.find(function (polyPolygon) {
                if (polyPolygon.length !== 1) {
                    // This would require us to rewrite point_in_polygon so it accumulated the winding count over nested polygons
                    reject("Cannot handle compound multipolygon with " + polyPolygon[0].length + " polygon elements");
                }
                if (hortis.pointInPolygon(mappedRow.point, polyPolygon[0])) {
                    return true;
                }
            });
            return intersects ? true : false;
        }
    }
};
