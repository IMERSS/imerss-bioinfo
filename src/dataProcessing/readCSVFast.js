/* eslint-env node */

"use strict";

const fluid = require("infusion");
const papaparse = require("papaparse");
const fs = require("fs");

const hortis = fluid.registerNamespace("hortis");

// Experiment using papaparse shelved since despite promises of fastness it seemed 2x slower than csv-parser on reading iNat taxa
// even without per-row overhead of Infusion

fluid.defaults("hortis.csvFastReader", {
    gradeNames: "fluid.component",
    members: {
        completionPromise: "@expand:fluid.promise()"
        // beginParse: "@expand:hortis.csvFastReader.parse({that}, {that}.options.csvOptions, {that}.options.inputFile)"
    },
    // inputFile: null,
    csvOptions: {
        header: true,
        skipEmptyLines: true
    },
    events: {
    },
    listeners: {
        "onCreate.parse": "hortis.csvFastReader.parse({that}, {that}.options.csvOptions, {that}.options.inputFile)"
    }
});

hortis.csvFastReader.parse = function (that, csvOptions, inputFile) {
    const now = Date.now();
    const options = {
        ...csvOptions,
        complete: function (results) {
            that.parsed = results;
            that.data = results.data;
            that.headers = results.meta.fields;
            console.log("Read " + that.data.length + " lines in " + (Date.now() - now) + " ms");
            that.completionPromise.resolve(true);
        },
        error: function (err) {
            that.completionPromise.reject();
            fluid.fail("Error parsing CSV file ", inputFile, ": ", err);
        }
    };
    const stream = fs.createReadStream(inputFile);
    papaparse.parse(stream, options);
};
