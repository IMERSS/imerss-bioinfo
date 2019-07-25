/* eslint-env node */
/* eslint dot-notation: "off"*/
"use strict";

var fluid = require("infusion");
var fs = require("fs");
var BSON = require("bson");

require("./dataProcessing/readJSON.js");
require("./dataProcessing/readCSV.js");
require("./dataProcessing/readCSVwithMap.js");

fluid.setLogging(true);
fluid.defeatLogging = true;

BSON.setInternalBufferSize(1024*1024*200);

var hortis = fluid.registerNamespace("hortis");

var taxaMap = hortis.readJSONSync("data/iNaturalist/iNaturalist-taxa-map.json", "reading iNaturalist taxa map file");

hortis.bagatelle.csvReader({
    inputFile: "data/iNaturalist/iNaturalist-taxa.csv",
    mapColumns: taxaMap.columns
}).completionPromise.then(function (taxa) {
    fs.writeFileSync("iNaturalist-taxa.bson", BSON.serialize(taxa.rows));
});
