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

// Note that the taxon API at https://www.inaturalist.org/taxa/877359.json , e.g gives different results to the
// "modern" one at https://api.inaturalist.org/v1/taxa/877359
// The former will return alternate names in the "taxon_names" block and the latter does not. But the former can
// only accept exact ids.

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

fluid.defaults("hortis.iNatTaxonAPISource", {
    gradeNames: ["fluid.dataSource", "fluid.dataSource.noencoding"],
    components: {
        byId: {
            type: "hortis.iNatTaxonById"
        },
        byName: {
            type: "hortis.iNatTaxonByName"
        }
    },
    listeners: {
        "onRead.impl": {
            func: "hortis.iNatTaxonAPISource.impl",
            args: ["{that}", "{arguments}.0"]
        }
    }
});

hortis.iNatTaxonAPISource.impl = async function (that, query) {
    if (query.id) {
        var byId = await that.byId.get(query);
    } else if (query.name) {
        var byName = await that.byName.get(query);
        if (byName.results.length === 0) {
            return null;
        } else {
            var record = byName.results[0];
            var togo = fluid.filterKeys(record, ["name", "rank", "id"]);
            // TODO: This should really hit the cached dataSource first
            var byIdBack = await that.byId.get({id: togo.id});
            var nameRecord = byIdBack.taxon_names.find(function (nameRec) {
                return nameRec.name === query.name;
            });
            var nameStatus;
            if (nameRecord) {
                fluid.extend(togo, fluid.filterKeys(nameRecord, ["is_valid", "lexicon", "created_at", "updated_at"]));
                nameStatus = nameRecord.is_valid ? "accepted" : "unaccepted";
            } else {
                nameStatus = "invalid";
            }
            togo.nameStatus = nameStatus;
            // TODO: We are here
        }
    }
};
