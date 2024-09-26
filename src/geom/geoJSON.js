/* eslint-env node */

"use strict";

// noinspection ES6ConvertVarToLetConst
var fluid = fluid || require("infusion");

if (typeof(require) !== "undefined") {
    require("../lib/point-in-polygon.js");
}

// noinspection ES6ConvertVarToLetConst // otherwise this is a duplicate on minifying
var hortis = fluid.registerNamespace("hortis");

hortis.countTrue = function (array) {
    return array.reduce(function (a, c) {return a + c;}, 0);
};

hortis.intersections = 0;

hortis.intersectsFeature = function (feature, mappedRow) {
    if (!hortis.isPoint(mappedRow.point)) {
        return false;
    } else {
        const reject = function (message) {
            fluid.fail(message + " for feature ", feature);
        };
        const intersectPolygon = function (polyPolygon) {
            const intersects = polyPolygon.map(function (polygon) {
                ++hortis.intersections;
                return hortis.pointInPolygon(mappedRow.point, polygon);
            });
            const count = hortis.countTrue(intersects);
            return count % 2;
        };
        const geometry = feature.geometry;
        // Stupid export of Galiano polygon has the latter type
        if (geometry.type !== "MultiPolygon" && geometry.type !== "MultiLineString" && geometry.type !== "Polygon") {
            reject("Cannot handle feature type " + geometry.type);
        } else {
            const coords = geometry.coordinates;
            let intersects = false;
            if (geometry.type === "MultiLineString" || geometry.type === "Polygon") {
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
    const intersects = features.map(function (feature) {
        return hortis.intersectsFeature(feature, row);
    });
    const intersectCount = hortis.countTrue(intersects);
    return intersectCount > 0;
};
