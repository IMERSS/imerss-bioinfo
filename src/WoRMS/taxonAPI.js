/* eslint-env node */

"use strict";

const fluid = require("infusion");
const hortis = fluid.registerNamespace("hortis");

fluid.registerNamespace("hortis.WoRMSTaxa");

hortis.WoRMSTaxa.filenameFromTaxonName = function (taxonAPIFileBase, name) {
    return taxonAPIFileBase + "/" + name + ".json";
};

