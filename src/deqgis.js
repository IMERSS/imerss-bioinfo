/* eslint-env node */

"use strict";

const fluid = require("infusion");
const fs = require("fs");
const minimist = require("minimist");
var glob = require("glob");

fluid.require("%bagatelle");

require("./dataProcessing/readJSON.js");
require("./dataProcessing/writeJSON.js");
require("./dataProcessing/readCSV.js");
require("./dataProcessing/readCSVWithoutMap.js");

const hortis = fluid.registerNamespace("hortis");

fluid.setLogging(true);

const parsedArgs = minimist(process.argv.slice(2));

const inputFile = parsedArgs._[0] || "%bagatelle/data/Xetthecum/deqgis.json5";
const outputFile = fluid.module.resolvePath(parsedArgs.o || "%bagatelle/data/Xetthecum/flatFeatures.json");

const config = hortis.readJSONSync(fluid.module.resolvePath(inputFile));

const baseDir = fluid.module.resolvePath(config.baseDirectory);

const dataFiles = glob.sync(baseDir + "/*.js");

console.log("Got data files ", dataFiles);

hortis.seColumns = ["Tagline", "What", "Where", "Importance", "Protection", "Source"];

hortis.applySensitiveEcosystems = function (togo, rows) {
    rows.forEach(function (row, index) {
        const labels = row.LABELS.split(",").map(s => s.trim());
        labels.forEach(function (clazz) {
            if (togo.classes[clazz]) {
                hortis.seColumns.forEach(function (column) {
                    const cell = row[column];
                    if (cell) {
                        togo.classes[clazz]["sE-" + column] = cell;
                    }
                    else {
                        console.log("Warnings: Sensitive ecosystems column " + column + " did not match row " + index, row);
                    }
                });
            } else if (clazz) {
                console.log("Warning: Sensitive ecosystems column " + clazz + " did not match any from QGIS");
            }
        });
    });
};

hortis.applyCulturalValues = function (togo, rows) {
    rows.forEach(function (row) {
        const communityName = row.COMMUNITIES;
        if (togo.communities[communityName]) {
            const community = togo.communities[communityName];
            community.culturalValues = row["CULTURAL VALUES"];
            community.culturalValuesSources = row.SOURCES;
        } else {
            console.log("Warning: Cultural values column " + communityName + " did not match any from QGIS");
        }
    });
};

const features = [];

hortis.indexCommunities = function (communities) {
    const classes = {};
    fluid.each(communities, function (community, communityKey) {
        fluid.each(community.classes, function (clazz, classKey) {
            clazz.community = communityKey;
            classes[classKey] = clazz;
        });
    });
    return classes;
};

hortis.filterCommunities = function (communities) {
    return fluid.transform(communities, function (community) {
        return fluid.extend(fluid.censorKeys(community, ["classes"]), {
            classes: fluid.transform(community.classes, function () {
                return {};
            })
        });
    });
};

const labels = {};

hortis.indexOneFeature = function (dataFileName, feature, features, classes) {
    var classname = feature.properties.LEGEND_LAB || feature.properties.LABEL;
    fluid.set(labels, [feature.properties.COMMUNITY, classname], true);

    feature.properties.clazz = classname;
    var clazz = classes[classname];
    if (!clazz) {
        console.log("Warning: unknown feature with name " + classname + " in file " + dataFileName);
    } else {
        features.push(feature);
    }
};

const classes = hortis.indexCommunities(config.communities);

const CSVs = fluid.transform(config.CSVs, function (oneFile) {
    return hortis.csvReaderWithoutMap({
        inputFile: fluid.module.resolvePath(oneFile.path)
    });
});

const promises = Object.values(fluid.getMembers(CSVs, "completionPromise"));

fluid.promise.sequence(promises).then(function () {
    console.log("Loaded " + Object.keys(CSVs).length + " CSV files");
    const allRows = fluid.getMembers(CSVs, "rows");

    dataFiles.forEach(function (dataFileName) {
        const string = fs.readFileSync(dataFileName, "utf8");
        const firstp = string.indexOf("{");
        const lastp = string.lastIndexOf("}");
        const data = JSON.parse(string.substring(firstp, lastp + 1));
        console.log("Processing qgis2web data with name " + data.name);
        data.features.forEach(function (feature) {
            hortis.indexOneFeature(dataFileName, feature, features, classes);
        });
    });

    const togo = {
        communities: hortis.filterCommunities(config.communities),
        classes: classes,
        features: features
    };

    if (allRows.sensitiveEcosystems) {
        hortis.applySensitiveEcosystems(togo, allRows.sensitiveEcosystems);
    }
    if (allRows.culturalValues) {
        hortis.applyCulturalValues(togo, allRows.culturalValues);
    }

    console.log("Encountered feature hierarchy: ", JSON.stringify(labels, null, 2));
    hortis.writeJSONSync(outputFile, togo);
});
