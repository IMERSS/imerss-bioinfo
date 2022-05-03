/* eslint-env node */

"use strict";

var fluid = require("infusion");
var csvModule = require("csv-parser");
var fs = require("fs");
var removeBOM = require("remove-bom-stream");

var hortis = fluid.registerNamespace("hortis");

fluid.defaults("hortis.csvReader", {
    gradeNames: "fluid.component",
    members: {
        line: 1,
        rowStream: null,
        headers: {},
        completionPromise: "@expand:fluid.promise()"
    },
    csvOptions: {
    },
    events: {
        onHeaders: null,
        onRow: null,
        onError: null,
        onCompletion: null
    },
    listeners: {
        "onRow.lineCounter": {
            funcName: "hortis.csvReader.incLine",
            args: "{that}",
            priority: "first"
        },
        "onHeaders.storeHeaders": "hortis.csvReader.storeHeaders({that}, {arguments}.0)",
        "onError.rejector": "hortis.csvReader.rejector({that}, {arguments}.0)",
        "onCreate.openStream": "fluid.notImplemented",
        "onCreate.bindStream": {
            priority: "after:openStream",
            funcName: "hortis.csvReader.bindStream"
        }
    }
});

hortis.csvReader.incLine = function (that) {
    ++that.line;
};

hortis.csvReader.storeHeaders = function (that, headers) {
    that.headers = headers;
};

hortis.csvReader.rejector = function (that, error) {
    that.completionPromise.reject({
        message: "Error at line " + that.line + " reading file " + that.options.inputFile + ": " + error
    });
};

hortis.csvReader.bindStream = function (that) {
    var now = Date.now();
    that.rowStream.on("data", function (data) {
        that.events.onRow.fire(data);
    });
    that.rowStream.on("error", function (error) {
        that.events.onError.fire(error);
    });
    that.rowStream.on("headers", function (headers) {
        that.events.onHeaders.fire(headers);
    });
    that.rowStream.on("end", function () {
        console.log("Read " + that.line + " lines in " + (Date.now() - now) + " ms");
        if (!that.completionPromise.disposition) {
            that.events.onCompletion.fire();
        }
    });
};



fluid.defaults("hortis.csvFileReader", {
    gradeNames: "hortis.csvReader",
    inputFile: null,
    listeners: {
        "onCreate.openStream": "hortis.csvFileReader.openFileStream"
    }
});

hortis.csvFileReader.openFileStream = function (that) {
    that.rowStream = fs.createReadStream(that.options.inputFile)
        .pipe(removeBOM("utf-8"))
        .pipe(csvModule(that.options.csvOptions)
    );
};

fluid.defaults("hortis.storingCSVReader", {
    members: {
        rows: []
    },
    listeners: {
        "onCompletion.resolve": {
            func: "{that}.completionPromise.resolve",
            args: {
                rows: "{that}.rows",
                headers: "{that}.headers"
            }
        }
    }
});
