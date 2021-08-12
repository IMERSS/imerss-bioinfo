/* eslint-env node */
/* eslint dot-notation: "off"*/

"use strict";

var fluid = require("infusion");
var glob = require("glob");
var kettle = require("kettle");
var fs = require("fs");
fluid.require("%bagatelle");

var baseDir = fluid.module.resolvePath("%bagatelle/data/dataPaper-I-in/Animalia/");

fs.mkdirSync(baseDir, {
    recursive: true
});

var dir = process.argv[2] || "C:/Users/Bosmon/Google Drive/Galiano Data Paper 2021/Marine Life/Animalia";
var source = kettle.dataSource.URL({
    url: "https://docs.google.com/spreadsheets/d/%id/export?format=csv&id=%id&gid=0",
    port: 443,
    termMap: {
        id: "%id"
    },
    requestOptions: {
        followAllRedirects: true
    },
    components: {
        encoding: {
            type: "fluid.dataSource.encoding.none"
        }
    }
});

var getSegment = function (path) {
    var lastSlash = path.lastIndexOf("/");
    var lastDot = path.lastIndexOf(".");
    return path.substring(lastSlash + 1, lastDot);
};

fluid.setLogging(true);

glob(dir + "/*.gsheet", function (er, files) {
    console.log("Got files ", files);
    var records = files.map(function (oneFile) {
        var promise = kettle.JSON.readFileSync(oneFile);
        var parsed;
        promise.then(function (result) {
            parsed = result;
        });
        return {
            id: parsed["doc_id"],
            segment: getSegment(oneFile)
        };
    });
    console.log("Got records ", records);
    records.forEach(function (oneRecord) {
        source.get({id: oneRecord.id}).then(function (doc) {
            console.log("Got doc ", doc);
            fs.writeFileSync(baseDir + oneRecord.segment + ".csv", doc);
        }, function (err) {
            console.log("Got err ", err);
        });
    });
});
