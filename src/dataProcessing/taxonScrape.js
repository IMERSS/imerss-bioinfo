/* eslint-env node */

"use strict";

const fluid = require("infusion");
const fs = require("fs");

const hortis = fluid.registerNamespace("hortis");

// Ancient utility used in the obsoleted inattify.js and wormify.js from the days we wrote taxon docs to the filesystem
// rather than putting them in SQLite

hortis.writeTaxonDoc = function (filename, doc) {
    const formatted = JSON.stringify(doc, null, 4);
    fs.writeFileSync(filename, formatted);
    console.log("Written " + formatted.length + " bytes to " + filename);
};
