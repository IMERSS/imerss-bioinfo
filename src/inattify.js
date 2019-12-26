/* eslint-env node */

"use strict";

var fluid = require("infusion");
var fs = require("fs");
var kettle = require("kettle");
var minimist = require("minimist");

require("./utils/settleStructure.js");
require("./dataProcessing/readJSON.js");
require("./dataProcessing/readCSV.js");
require("./dataProcessing/readCSVwithMap.js");

require("./iNaturalist/taxonAPI.js");

var hortis = fluid.registerNamespace("hortis");
var taxonAPIFileBase = "e:/data/iNaturalist/taxonAPI";

var source = kettle.dataSource.URL({
    url: "https://www.inaturalist.org/taxa/%id.json",
    termMap: {
        id: "%id"
    }
});

var parsedArgs = minimist(process.argv.slice(2));

var mapFile = parsedArgs.map || "data/Galiano WoL/Galiano-data-out-map.json";
var map = hortis.readJSONSync(mapFile);

var files = parsedArgs._;

var readFiles = files.map(function (file) {
    return hortis.csvReaderWithMap({
        inputFile: file,
        mapColumns: map.columns
    }).completionPromise;
});

var resultsPromise = hortis.settleStructure(readFiles);

resultsPromise.then(function (results) {
    var allRows = fluid.flatten(fluid.transform(results, function (oneResult) {
        return oneResult.rows;
    }));

    console.log("Got " + allRows.length + " rows");

    console.log(allRows[0]);
    var queue = fluid.transform(allRows, function (row) {
        return {id: row.iNaturalistTaxonId};
    });
    hortis.queueFetchWork(queue);
});

hortis.writeiNatTaxonDoc = function (filename, doc) {
    var formatted = JSON.stringify(doc, null, 4);
    fs.writeFileSync(filename, formatted);
    console.log("Written " + formatted.length + " bytes to " + filename);
};

// fluid.setLogging(true);

hortis.enqueueAncestry = function (doc, queue) {
    var ancestours = hortis.iNatTaxa.parentTaxaIds(doc).reverse();
    var elements = ancestours.map(function (oneAnc) {
        return {id: oneAnc};
    });
    queue.unshift.apply(queue, elements);
};

hortis.logWork = function (that) {
    console.log("Remaining " + that.queue.length + "/" + (that.queue.length + that.fetched.length));
};

hortis.noteSkip = function (that, message) {
    ++that.skipCount;
    if (that.skipCount % 1000 === 0) {
        console.log(message);
        hortis.logWork(that);
    }
};

hortis.queueFetchWork = function (queue) {
    var that = {
        queue: queue,
        cache: {},
        skipCount: 0,
        fetched: []
    };
    var oneWork = function () {
        if (that.queue.length) {
            var head = that.queue.shift();
            var filename = hortis.iNatTaxa.filenameFromTaxonId(taxonAPIFileBase, head.id);
            var doc;
            if (that.cache[filename] || fs.existsSync(filename)) {
                hortis.noteSkip(that, "File " + filename + " exists, skipping");
                doc = that.cache[filename];
                if (!doc) {
                    doc = hortis.readJSONSync(filename);
                    that.cache[filename] = doc;
                }
                hortis.enqueueAncestry(doc, that.queue);
                fluid.invokeLater(oneWork);
            } else {
                doc = source.get(head).then(function (doc) {
                    that.fetched.push(head);
                    hortis.enqueueAncestry(doc, that.queue);
                    hortis.writeiNatTaxonDoc(filename, doc);
                    nextWork();
                }, function (err) {
                    console.log("Received ERROR for id " + head.id, err);
                });
            }
        }
    };
    var nextWork = function () {
        hortis.logWork(that);
        setTimeout(oneWork, 1000);
    };
    nextWork();
};
