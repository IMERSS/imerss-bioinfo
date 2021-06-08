/* eslint-env node */

"use strict";

var fluid = require("infusion");
fluid.require("%bagatelle");

require("./dataProcessing/readJSON.js");
require("./dataProcessing/readCSV.js");
require("./dataProcessing/readCSVwithoutMap.js");
require("./dataProcessing/writeCSV.js");

var hortis = fluid.registerNamespace("hortis");

fluid.setLogging(true);

var allFile = "e:/data/RSA_FWSTRMNTWR_line.csv";
var mineFile = "e:/data/RSA_FWSTRMNTWR_line_intersect_mines.csv";

var outputFile = "downstream_mines.csv";

var files = [allFile, mineFile];

var readers = files.map(function (oneFile) {
    return hortis.csvReaderWithoutMap({
        inputFile: oneFile
    });
});

var promises = fluid.getMembers(readers, "completionPromise");

var wf = "FWWTRSHDCD";

var desuffixify = function (row) {
    var prefix = row[wf];
    while (prefix.endsWith("-000000")) {
        prefix = prefix.substring(0, prefix.length - 7);
    }
    row[wf] = prefix;
    return row;
};

fluid.promise.sequence(promises).then(function () {
    console.log("Loaded " + readers.length + " CSV files");
    var rows = fluid.getMembers(readers, "rows");
    var allRows = rows[0].map(desuffixify);
    var mineRows = rows[1].map(desuffixify);

    var uniquePrefix = {};
    mineRows.forEach(function (row) {
        uniquePrefix[row[wf]] = true;
    });

    var keys = Object.keys(uniquePrefix);

    console.log("Found " + keys.length + " unique prefixes: ", keys.join("\n"));

    var prefixKeys = keys.filter(function (key) {
        return keys.every(function (testkey) {
            return !key.startsWith(testkey) || key.length === testkey.length;
        });
    });

    console.log("Filtered down to " + prefixKeys.length + " prefix keys: ", prefixKeys.join("\n"));

    var downRows = allRows.filter(function (row) {
        return prefixKeys.some(function (key) {
            return row[wf].startsWith(key);
        });
    });

    console.log("Filtered " + allRows.length + " down to " + downRows.length + " downstream rows");

    var togo = fluid.promise();
    hortis.writeCSV(fluid.module.resolvePath(outputFile), readers[0].headers, downRows, togo);
}, function (err) {
    console.log("Error ", err);
});
