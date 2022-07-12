/* eslint-env node */

"use strict";

var fluid = require("infusion");
var hortis = fluid.registerNamespace("hortis");

var level = require("level");

fluid.registerNamespace("hortis.iNat");

hortis.iNat.filenameFromTaxonId = function (taxonAPIFileBase, id) {
    return taxonAPIFileBase + "/" + id + ".json";
};

hortis.iNat.loadTaxonDoc = function (taxonAPIFileBase, id) {
    var filename = hortis.iNat.filenameFromTaxonId(taxonAPIFileBase, id);
    return hortis.readJSONSync(filename);
};

hortis.iNat.parentTaxaIds = function (taxonDoc) {
    return taxonDoc.ancestry ? taxonDoc.ancestry.split("/") : [];
};

hortis.iNat.idToKey = function (id) {
    return "id:" + id.padStart(8, "0");
};

hortis.iNat.nameToKey = function (name) {
    return "name:" + name;
};

fluid.defaults("hortis.iNatAPILimiter", {
    gradeNames: ["fluid.rateLimiter", "fluid.resolveRootSingle"],
    singleRootType: "hortis.iNatAPILimiter"
});

hortis.iNatAPILimiter();

// Note that the taxon API at https://www.inaturalist.org/taxa/877359.json , e.g gives different results to the
// "modern" one at https://api.inaturalist.org/v1/taxa/877359

fluid.defaults("hortis.withINatRateLimit", {
    listeners: {
        "onRead.rateLimitBefore": {
            priority: "before:impl",
            func: "{hortis.iNatAPILimiter}.requestStart"
        },
        "onRead.rateLimitAfter": {
            priority: "after:impl",
            func: "{hortis.iNatAPILimiter}.requestEnd"
        }
    }
});

// The former will return alternate names in the "taxon_names" block and the latter does not.

fluid.defaults("hortis.iNatTaxonById", {
    gradeNames: ["kettle.dataSource.URL", "hortis.withINatRateLimit"],
    url: "https://www.inaturalist.org/taxa/%id.json",
    termMap: {
        id: "%id"
    }
});

fluid.defaults("hortis.iNatTaxonByName", {
    gradeNames: ["kettle.dataSource.URL", "hortis.withINatRateLimit"],
    url: "https://api.inaturalist.org/v1/taxa?q=%name",
    termMap: {
        name: "%name"
    }
});
