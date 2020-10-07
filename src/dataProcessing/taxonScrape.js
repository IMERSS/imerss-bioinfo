/* eslint-env node */

"use strict";

var fluid = require("infusion");
var fs = require("fs");

var hortis = fluid.registerNamespace("hortis");

hortis.writeTaxonDoc = function (filename, doc) {
    var formatted = JSON.stringify(doc, null, 4);
    fs.writeFileSync(filename, formatted);
    console.log("Written " + formatted.length + " bytes to " + filename);
};
