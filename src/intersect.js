/* eslint-env node */

"use strict";

var fluid = require("infusion");
var fs = require("fs");

require("./dataProcessing/readCSV.js");
require("./dataProcessing/readCSVwithMap.js");
require("./lib/point-in-polygon.js");

var hortis = fluid.registerNamespace("hortis");
fluid.registerNamespace("hortis.intersect");

var protected_areas = require("../data/Galiano/Protected_Areas_2013_2.json");

var map = require("../data/iNaturalist-obs-map.json");

var result = hortis.bagatelle.csvReader({
    inputFile: "data/Galiano/observations-iNat.csv",
    mapColumns: map.columns
}).completionPromise;

hortis.countUniqueInPolygon = function (counts, polygon, mappedRows) {
    mappedRows.forEach(function (row) {
        if (row.id && hortis.pointInPolygon(row.point, polygon)) {
            if (counts[row.id]) {
                counts[row.id]++;
            } else {
                counts[row.id] = 1;
            }
        }
    });
};

hortis.countUniqueInFeature = function (counts, feature, mappedRows) {
    var reject = function (message) {
        fluid.fail(message + " for feature ", feature);
    };
    var geometry = feature.geometry;
    if (geometry.type !== "MultiPolygon") {
        reject("Cannot handle feature type " + geometry.type);
    } else {
        var multiPolygon = geometry.coordinates;
        multiPolygon.forEach(function (polyPolygon) {
            if (polyPolygon.length !== 1) {
                // This would require us to rewrite point_in_polygon so it accumulated the winding count over nested polygons
                reject("Cannot handle compound multipolygon with " + polyPolygon[0].length + " polygon elements");
            }
            hortis.countUniqueInPolygon(counts, polyPolygon[0], mappedRows);
        });
    }
    return counts;
};

hortis.intersect.mapOneRow = function (row) {
    return {
        id: row.scientificName,
        point: [
            row.longitude,
            row.latitude
        ]
    };
};

var fileHeader = "var json_Protected_Areas_2013_2 = {\n\"type\": \"FeatureCollection\",\n\"name\": \"Protected_Areas_2013_2\",\n\"crs\": { \"type\": \"name\""
    + ", \"properties\": { \"name\": \"urn:ogc:def:crs:OGC:1.3:CRS84\" } },\n\"features\": [\n";
var fileFooter = "\n]\n}\n";

hortis.intersect.writeUpdatedFeatures = function (featuresWithCounts) {
    var outFile = fs.openSync("Protected_Areas_2013_2_counts.js", "w");
    fs.writeSync(outFile, fileHeader);
    var body = featuresWithCounts.map(function (feature) {
        return JSON.stringify(feature);
    });
    fs.writeSync(outFile, body.join(",\n"));
    fs.writeSync(outFile, fileFooter);
    fs.closeSync(outFile);
};

var start = Date.now();

result.then(function (result) {
    var read = Date.now();
    console.log("Read " + result.rows.length + " in " + (read - start) + "ms");
    console.log(JSON.stringify(result.rows[0], null, 2));
    var mappedRows = result.rows.map(hortis.intersect.mapOneRow);
    var featureCounts = protected_areas.features.map(function (feature) {
        console.log("Mapping feature " + feature.properties.NAME + " id " + feature.properties.ID);
        var counts = hortis.countUniqueInFeature({}, feature, mappedRows);
        return Object.keys(counts).length;
    });
    console.log("Mapped " + result.rows.length + " against " + protected_areas.features.length + " features in " + (Date.now() - read) + "ms");
    console.log("Got featureCounts ", featureCounts);
    var featuresWithCounts = protected_areas.features.map(function (feature, index) {
        return fluid.extend(true, {}, feature, {properties: {speciesCount: featureCounts[index]}});
    });
    hortis.intersect.writeUpdatedFeatures(featuresWithCounts);
});
