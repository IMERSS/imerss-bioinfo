/* eslint-env node */

"use strict";

var fluid = require("infusion");
var minimist = require("minimist");
var glob = require("glob");
fluid.require("%bagatelle");

require("./dataProcessing/readJSON.js");
require("./dataProcessing/readCSV.js");
require("./dataProcessing/readCSVwithMap.js");
require("./dataProcessing/writeCSV.js");

var hortis = fluid.registerNamespace("hortis");

fluid.setLogging(true);

var parsedArgs = minimist(process.argv.slice(2));

var outputFile = parsedArgs.o || "%bagatelle/data/dataPaper-in/Animalia.csv";
var inputFile = parsedArgs._[0] || "%bagatelle/data/dataPaper-in/Animalia/*.csv";
var mapFile = parsedArgs.map || "%bagatelle/data/dataPaper-in/dataPaper-map.json";

var map = hortis.readJSONSync(fluid.module.resolvePath(mapFile), "reading map file");

var files = glob.sync(fluid.module.resolvePath(inputFile));

var readers = files.map(function (oneFile) {
    return hortis.csvReaderWithMap({
        inputFile: oneFile,
        mapColumns: map.columns
    });
});

var promises = fluid.getMembers(readers, "completionPromise");

fluid.promise.sequence(promises).then(function () {
    console.log("Loaded " + readers.length + " CSV files");
    var allRows = fluid.flatten(fluid.getMembers(readers, "rows"));
    var togo = fluid.promise();
    hortis.writeCSV(fluid.module.resolvePath(outputFile), map.columns, allRows, togo);
}, function (err) {
    console.log("Error ", err);
});
