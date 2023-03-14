/* eslint-env node */

"use strict";

var fluid = require("infusion");
var minimist = require("minimist");
var glob = require("glob");
fluid.require("%imerss-bioinfo");

require("./dataProcessing/readJSON.js");
require("./dataProcessing/readCSV.js");
require("./dataProcessing/readCSVwithMap.js");
require("./dataProcessing/writeCSV.js");

var hortis = fluid.registerNamespace("hortis");

fluid.setLogging(true);

var parsedArgs = minimist(process.argv.slice(2));

var outputFile = parsedArgs.o || "%imerss-bioinfo/data/dataPaper-I-in/Animalia.csv";
var inputFile = parsedArgs._[0] || "%imerss-bioinfo/data/dataPaper-I-in/Animalia/*.csv";
var mapFile = parsedArgs.map || "%imerss-bioinfo/data/dataPaper-I-in/dataPaper-map.json";

var map = hortis.readJSONSync(fluid.module.resolvePath(mapFile), "reading map file");

var files = glob.sync(fluid.module.resolvePath(inputFile));

var readers = files.map(function (oneFile) {
    // TODO: Worry if the schemas of the CSV files diverge - we stopped using the map file since we don't want
    // its conversion, but we do want to verify the headers
    // We probably want to grab the "onHeaders.validateHeaders" listener from csvReaderWithMap
    return hortis.csvReaderWithoutMap({
        inputFile: oneFile
    });
});

var promises = fluid.getMembers(readers, "completionPromise");

fluid.promise.sequence(promises).then(function () {
    console.log("Loaded " + readers.length + " CSV files");
    var allRows = fluid.flatten(fluid.getMembers(readers, "rows"));
    var togo = fluid.promise();
    hortis.writeCSV(fluid.module.resolvePath(outputFile), Object.keys(allRows[0]), allRows, togo);
}, function (err) {
    console.log("Error ", err);
});
