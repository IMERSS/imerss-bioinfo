/* eslint-env node */

"use strict";

const fluid = require("infusion");
const fs = require("fs");

const hortis = fluid.registerNamespace("hortis");

hortis.writeJSONSync = function (inFilename, doc) {
    const filename = fluid.module.resolvePath(inFilename);
    const formatted = JSON.stringify(doc, null, 4) + "\n";
    fs.writeFileSync(filename, formatted);
    console.log("Written " + formatted.length + " bytes to " + filename);
};
