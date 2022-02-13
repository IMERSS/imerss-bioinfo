/* eslint-env node */

"use strict";

var fluid = require("infusion");
var fs = require("fs");
var minimist = require("minimist");
var glob = require("glob");

fluid.require("%bagatelle");

require("./dataProcessing/readJSON.js");
require("./dataProcessing/writeJSON.js");

var hortis = fluid.registerNamespace("hortis");

fluid.setLogging(true);

var parsedArgs = minimist(process.argv.slice(2));

var inputFile = parsedArgs._[0] || "%bagatelle/data/Xetthecum/deqgis.json5";
var outputFile = fluid.module.resolvePath(parsedArgs.o || "%bagatelle/data/Xetthecum/flatFeatures.json");

var config = hortis.readJSONSync(fluid.module.resolvePath(inputFile));

var baseDir = fluid.module.resolvePath(config.baseDirectory);

var dataFiles = glob.sync(baseDir + "/*.js");

console.log("Got data files ", dataFiles);

var features = [];

hortis.indexRegions = function (regions) {
    var classes = {};
    fluid.each(regions, function (region, regionKey) {
        fluid.each(region.classes, function (clazz, classKey) {
            clazz.region = regionKey;
            classes[classKey] = clazz;
        });
    });
    return classes;
};

hortis.indexOneFeature = function (dataFileName, feature, features, classes) {
    var classname = feature.properties.CLASS;
    var clazz = classes[classname];
    if (!clazz) {
        console.log("Warning: unknown feature with name " + classname + " in file " + dataFileName);
    } else {
        feature.properties.region = clazz.region;
        features.push(feature);
    }
};

var classes = hortis.indexRegions(config.regions);

dataFiles.forEach(function (dataFileName) {
    var string = fs.readFileSync(dataFileName, "utf8");
    var firstp = string.indexOf("{");
    var lastp = string.lastIndexOf("}");
    var data = JSON.parse(string.substring(firstp, lastp + 1));
    console.log("Processing qgis2web data with name " + data.name);
    data.features.forEach(function (feature) {
        hortis.indexOneFeature(dataFileName, feature, features, classes);
    });
});

var togo = {
    classes: classes,
    features: features
};

hortis.writeJSONSync(outputFile, togo);
