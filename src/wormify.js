/* eslint-env node */

"use strict";

var fluid = require("infusion");
var fs = require("fs");
var kettle = require("kettle");
var minimist = require("minimist");

require("./utils/utils.js");
require("./utils/settleStructure.js");
require("./dataProcessing/readJSON.js");
require("./dataProcessing/readCSV.js");
require("./dataProcessing/readCSVwithMap.js");
require("./dataProcessing/writeCSV.js");
require("./dataProcessing/taxonScrape.js");

require("./WoRMS/taxonAPI.js");

fluid.setLogging(true);

var hortis = fluid.registerNamespace("hortis");
var taxonAPIFileBase = "data/WoRMS/taxonAPI";

var source = kettle.dataSource.URL({
    url: "https://www.marinespecies.org/rest/AphiaRecordsByName/%name?like=false&marine_only=false&offset=1",
    termMap: {
        name: "%name"
    }
});

var parsedArgs = minimist(process.argv.slice(2));

var mapFile = parsedArgs.map || "data/dataPaper-I-in/dataPaper-out-map.json";
var map = hortis.readJSONSync(mapFile);

var file = parsedArgs._[0] || "data/dataPaper-I-in/reintegrated.csv";
var outFile = "reintegrated-WoRMS.csv";

var resultsPromise = hortis.csvReaderWithMap({
    inputFile: file,
    mapColumns: map.columns
}).completionPromise;

var outMapColumns = fluid.copy(map.columns);

delete outMapColumns.authority;
outMapColumns.authority = "Authority";
outMapColumns.WoRMSAuthority = "WoRMS Authority";
outMapColumns.mismatch = "Authority mismatch";
outMapColumns.accepted = "WoRMS Accepted";

resultsPromise.then(function (results) {
    var rows = results.rows;
    console.log("Got " + rows.length + " rows");

    var queue = fluid.transform(rows, function (row) {
        return {name: row.iNaturalistTaxonName};
    });
    var cachePromise = hortis.queueFetchWork(queue);
    cachePromise.then(function (cache) {
        var newRows = rows.map(function (oneRow) {
            var newRow = fluid.copy(oneRow);
            var entry = cache[oneRow.iNaturalistTaxonName];
            newRow.WoRMSAuthority = entry ? (entry.authority ? entry.authority : entry.message) : "Internal error";
            var authority = newRow.subtaxonAuthority || newRow.authority;
            newRow.mismatch = newRow.WoRMSAuthority === authority ? "" : "x";
            newRow.accepted = entry && entry.status;
            return newRow;
        });
        hortis.writeCSV(outFile, outMapColumns, newRows, fluid.promise());
    });
});

// Values of "status" field in decreasing order of desirability
hortis.WoRMSstatus = ["accepted", "unaccepted", "deleted"];

hortis.WoRMSstatusIndex = function (status) {
    var index = hortis.WoRMSstatus.indexOf(status);
    return index === -1 ? hortis.WoRMSstatus.length : index;
};

hortis.findBestWoRMSDoc = function (docs) {
    var byIndex = [];
    fluid.each(docs, function (doc) {
        var index = hortis.WoRMSstatusIndex(doc.status);
        fluid.pushArray(byIndex, index, doc);
    });
    return byIndex.find(function (slot) {
        return slot && slot.length > 0;
    });
};

hortis.queueFetchWork = function (queue) {
    var that = {
        queue: queue,
        cache: {},
        skipCount: 0,
        fetched: [],
        completion: fluid.promise()
    };
    var oneWork = function () {
        if (that.queue.length) {
            var head = that.queue.shift();
            var name = head.name;
            var filename = hortis.WoRMSTaxa.filenameFromTaxonName(taxonAPIFileBase, name);
            var doc;
            if (that.cache[name] || fs.existsSync(filename)) {
                // hortis.noteSkip(that, "File " + filename + " exists, skipping");
                doc = that.cache[filename];
                if (!doc) {
                    doc = hortis.readJSONSync(filename);
                    that.cache[name] = doc;
                }
                // hortis.enqueueAncestry(doc, that.queue);
                fluid.invokeLater(oneWork);
            } else {
                doc = source.get(head).then(function (docs) {
                    that.fetched.push(head);
                    var sortedDocs = hortis.findBestWoRMSDoc(docs);
                    if (!sortedDocs || sortedDocs.length === 0) {
                        console.log("Received no results for name " + head.name);
                        that.cache[name] = {
                            isError: true,
                            message: "Document not found"
                        };
                    } else {
                        if (sortedDocs.length > 1) {
                            console.log("Warning: received " + sortedDocs.length + " equally good results for name " + head.name);
                        }
                        // hortis.enqueueAncestry(doc, that.queue);
                        hortis.writeTaxonDoc(filename, sortedDocs[0]);
                        that.cache[name] = sortedDocs[0];
                    }
                    // that.completion.resolve(that.cache);
                    nextWork();
                }, function (err) {
                    console.log("Received ERROR for name " + head.name, err);
                    that.cache[name] = {
                        isError: true,
                        message: err
                    };
                });
            }
        } else {
            that.completion.resolve(that.cache);
        }
    };
    var nextWork = function () {
        setTimeout(oneWork, 1000);
    };
    nextWork();
    return that.completion;
};
