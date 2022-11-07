/* eslint-env node */

"use strict";

const fluid = require("infusion");
const fs = require("fs");
const kettle = require("kettle");
const minimist = require("minimist");

require("./utils/utils.js");
require("./utils/settleStructure.js");
require("./dataProcessing/readJSON.js");
require("./dataProcessing/readCSV.js");
require("./dataProcessing/readCSVwithMap.js");
require("./dataProcessing/taxonScrape.js");

require("./iNaturalist/taxonAPI.js");

const hortis = fluid.registerNamespace("hortis");
const taxonAPIFileBase = "data/iNaturalist/taxonAPI";

const source = kettle.dataSource.URL({
    url: "https://www.inaturalist.org/taxa/%id.json",
    termMap: {
        id: "%id"
    }
});

const parsedArgs = minimist(process.argv.slice(2));

const mapFile = parsedArgs.map || "data/Galiano WoL/Galiano-data-out-map.json";
const map = hortis.readJSONSync(mapFile);

const files = parsedArgs._;

const readFiles = files.map(function (file) {
    return hortis.csvReaderWithMap({
        inputFile: file,
        mapColumns: map.columns
    }).completionPromise;
});

const resultsPromise = hortis.settleStructure(readFiles);

resultsPromise.then(function (results) {
    const allRows = fluid.flatten(fluid.transform(results, function (oneResult) {
        return oneResult.rows;
    }));

    console.log("Got " + allRows.length + " rows");

    console.log(allRows[0]);
    const queue = fluid.transform(allRows, function (row) {
        return {id: row.iNaturalistTaxonId};
    });
    hortis.queueFetchWork(queue);
});

// fluid.setLogging(true);

hortis.enqueueAncestry = function (doc, queue) {
    const ancestours = hortis.iNat.parentTaxaIds(doc);
    const elements = ancestours.map(function (oneAnc) {
        return {id: oneAnc};
    });
    queue.unshift.apply(queue, elements);
};

hortis.logWork = function (that) {
    console.log("Remaining " + that.queue.length + "/" + (that.queue.length + that.fetched.length));
};

hortis.noteSkip = function (that, message) {
    ++that.skipCount;
    if (that.skipCount % 50000 === 0) {
        console.log(message);
        hortis.logWork(that);
    }
};

hortis.queueFetchWork = function (queue) {
    const nextWork = function () {
        hortis.logWork(that);
        setTimeout(oneWork, 1000);
    };
    const that = {
        queue: queue,
        cache: {},
        skipCount: 0,
        fetched: []
    };
    const oneWork = function () {
        if (that.queue.length) {
            const head = that.queue.shift();
            const filename = hortis.iNat.filenameFromTaxonId(taxonAPIFileBase, head.id);
            let doc;
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
                    hortis.writeTaxonDoc(filename, doc);
                    that.cache[filename] = doc;
                    nextWork();
                }, function (err) {
                    console.log("Received ERROR for id " + head.id, err);
                });
            }
        }
    };
    nextWork();
};
