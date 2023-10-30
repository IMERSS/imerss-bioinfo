/* eslint-env node */
/* eslint dot-notation: "off"*/

"use strict";

const fluid = require("infusion");
const glob = require("glob");
const kettle = require("kettle");
const fs = require("fs");
fluid.require("%imerss-bioinfo");

const baseDir = fluid.module.resolvePath("%imerss-bioinfo/data/dataPaper-I-in/Animalia/");

fs.mkdirSync(baseDir, {
    recursive: true
});

// Used during preparation of data paper to materialise an entire folder full of Google Sheets as CSV.
// Will need to updated to use Google Sheets API directly and not rely on a Google Drive mapping

const dir = process.argv[2] || "e:/data/Google Drive/Galiano Data Paper 2021/Marine Life/Animalia";
const source = kettle.dataSource.URL({
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

const getSegment = function (path) {
    const lastSlash = path.lastIndexOf("/");
    const lastDot = path.lastIndexOf(".");
    return path.substring(lastSlash + 1, lastDot);
};

fluid.setLogging(true);

glob(dir + "/*.gsheet", function (er, files) {
    console.log("Got files ", files);
    const records = files.map(function (oneFile) {
        const promise = kettle.JSON.readFileSync(oneFile);
        let parsed;
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
