/* eslint-env node */

"use strict";

var fluid = require("infusion");
var fs = require("fs");

var hortis = fluid.registerNamespace("hortis");

hortis.writeJSONSync = function (inFilename, doc) {
    var filename = fluid.module.resolvePath(inFilename);
    var formatted = JSON.stringify(doc, null, 4) + "\n";
    fs.writeFileSync(filename, formatted);
    console.log("Written " + formatted.length + " bytes to " + filename);
};
