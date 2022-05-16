/* eslint-env node */

"use strict";

var fluid = require("infusion");

require("./dataProcessing/readJSON.js");

var level = require("level");
var glob = require("glob");

var dbFile = "%bagatelle/data/iNaturalist/taxa.ldb";
var taxonAPIFileBase = "data/iNaturalist/taxonAPI";

var hortis = fluid.registerNamespace("hortis");

var now = Date.now();

var dataFiles = glob.sync(taxonAPIFileBase + "/*.json");

console.log("Found " + dataFiles.length + " taxon files in " + (Date.now() - now) + "ms");

var db = new level.Level(fluid.module.resolvePath(dbFile), {
    createIfMissing: true
});

hortis.idFromFilename = function (filename) {
    var lastslash = filename.lastIndexOf("/");
    var lastdot = filename.lastIndexOf(".");
    return filename.substring(lastslash + 1, lastdot);
};

hortis.padTaxonId = function (id) {
    return id.padStart(8, "0");
};

var writeAll = async function (dataFiles) {
    for (var i = 0; i < dataFiles.length; ++i) {
        var dataFile = dataFiles[i];
        var contents = hortis.readJSONSync(dataFile);
        var id = hortis.idFromFilename(dataFile);
        var key = hortis.padTaxonId(id);
        var value = JSON.stringify(contents);
        await db.put(key, value);
        if (i % 1000 === 0) {
            process.stdout.write(i + " ... ");
        }
    }
};

// writeAll(dataFiles);

var readAll = async function () {
    var index = 0;
    for await (const key of db.keys()) {
        if (index % 100 === 0) {
            process.stdout.write("\"" + key + "\" ");
        }
        ++index;
    }
};

readAll();
