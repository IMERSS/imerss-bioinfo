/* eslint-env node */

"use strict";

var fluid = require("infusion");
var hortis = fluid.registerNamespace("hortis");

fluid.registerNamespace("hortis.WoRMSTaxa");

hortis.WoRMSTaxa.filenameFromTaxonName = function (taxonAPIFileBase, name) {
    return taxonAPIFileBase + "/" + name + ".json";
};

