/* eslint-env node */

"use strict";

var fluid = require("infusion");

require("./dataProcessing/readCSV.js");
require("./dataProcessing/writeCSV.js");
require("./dataProcessing/readCSVwithoutMap.js");
require("./lib/point-in-polygon.js");
require("./geom/geoJSON.js");

var hortis = fluid.registerNamespace("hortis");
fluid.registerNamespace("hortis.intersect");

var polygon = require("../data/Galiano/Galiano-boundary.json");

var completionPromise = hortis.imerss.csvReaderWithoutMap({
    inputFile: process.argv[2],
    csvOptions: {
        separator: "\t",
        quote: "\0",
        escape: "\0"
    }
}).completionPromise;

hortis.intersect.mapGBIFRow = function (row) {
    return {
        point: [
            Number.parseFloat(row.decimalLongitude),
            Number.parseFloat(row.decimalLatitude)
        ]
    };
};

completionPromise.then(function (result) {
    console.log(JSON.stringify(result.rows[0], null, 2));
    var feature = polygon.features[0];
    var outs = [];
    result.rows.forEach(function (oneRow) {
        var mappedRow = hortis.intersect.mapGBIFRow(oneRow);
        if (hortis.intersectsFeature(feature, mappedRow)) {
            outs.push(oneRow);
        }
    });
    console.log("Found " + outs.length + " intersecting rows");
    hortis.imerss.writeCSV("intersected.csv", result.headers, outs, fluid.promise());
});
