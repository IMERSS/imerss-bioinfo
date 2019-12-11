/* eslint-env node */

"use strict";

var fluid = require("infusion");
var hortis = fluid.registerNamespace("hortis");

fluid.registerNamespace("hortis.iNatTaxa");

hortis.iNatTaxa.filenameFromTaxonId = function (taxonAPIFileBase, id) {
    return taxonAPIFileBase + "/" + id + ".json";
};

hortis.iNatTaxa.loadTaxonDoc = function (taxonAPIFileBase, id) {
    var filename = hortis.iNatTaxa.filenameFromTaxonId(taxonAPIFileBase, id);
    return hortis.readJSONSync(filename);
};

hortis.iNatTaxa.parentTaxaIds = function (taxonDoc) {
    return taxonDoc.ancestry ? taxonDoc.ancestry.split("/") : [];
};
