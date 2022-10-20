/* eslint-env node */

"use strict";

const fluid = require("infusion");
const hortis = fluid.registerNamespace("hortis");

fluid.registerNamespace("hortis.iNat");

require("../utils/dataSource.js");
require("../dataProcessing/sqlite.js");
require("kettle"); // for kettle.dataSource.URL

hortis.iNat.filenameFromTaxonId = function (taxonAPIFileBase, id) {
    return taxonAPIFileBase + "/" + id + ".json";
};

hortis.iNat.loadTaxonDoc = function (taxonAPIFileBase, id) {
    const filename = hortis.iNat.filenameFromTaxonId(taxonAPIFileBase, id);
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
    gradeNames: ["fluid.dataSource.rateLimiter", "fluid.resolveRootSingle"],
    singleRootType: "hortis.iNatAPILimiter"
});

// Create a singleton rate limiter to ensure that all requests against the real iNaturalist API are rate-limited
// regardless of source
hortis.iNatAPILimiter();

// A mixin for any dataSource which will rate limit its requests against the singleton iNaturalist rate limiter
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
            args: ["{that}", "{arguments}.0", "{arguments}.1"]
        }
    }
});

fluid.defaults("hortis.cachedApiSource", {
    gradeNames: ["fluid.dataSource", "fluid.dataSource.noencoding"],
    refreshInDays: 7,
    /*
    components: {
        apiSource,
        dbSource
    }
    */
    listeners: {
        "onRead.impl": {
            func: "hortis.cachedApiSource.read",
            args: ["{that}", "{arguments}.0", "{arguments}.1"]
        }
    }
});


hortis.cachedApiSource.read = function (that, payload, options) {

};

fluid.defaults("hortis.cachediNatTaxonById", {
    gradeNames: "hortis.cachedApiSource",

    components: {
        apiSource: {
            type: "hortis.iNatTaxonById"
        },
        dbSource: {
            type: "hortis.iNatTaxonAPI.byIdDBSource"
        }
    },

});


/** Accepts queries either by name or by id, forwarding to the two raw API sources which are attached.
 * In the case of a by id query, it is sent direct.
 * In the case of a by name query, we look at the first result in the list and attempt to look it up by id and then
 * look at the "taxon_names" entries which account for iNat's alternate names. If we find it there, we can decide
 * that the entry is either "accepted" (if iNat says is_valid), "unaccepted" (if not is_valid)
 * or "invalid" if it is not there, because iNat has returned the result as a partial or fuzzy name match.
 * @param {Component} that - The iNatTaxonAPISource component
 * @param {Object} payload - The payload being transformed
 * @param {Object} options - The DataSource chain options, including the query in "directModel"
 * @return {Promise<Object>} A promise for the document as returned from the API
 */
hortis.iNatTaxonAPISource.impl = async function (that, payload, options) {
    const query = options.directModel;
    let doc;
    if (query.id) {
        doc = await that.byId.get(query);
    } else if (query.name) {
        const byName = await that.byName.get(query);
        if (byName.results.length === 0) {
            return null;
        } else {
            const record = byName.results[0];
            doc = fluid.filterKeys(record, ["name", "rank", "id"]);
            // TODO: This should really hit the cached dataSource first
            const byIdBack = await that.byId.get({id: doc.id});
            const nameRecord = byIdBack.taxon_names.find(function (nameRec) {
                return nameRec.name === query.name;
            });
            let nameStatus;
            if (nameRecord) {
                fluid.extend(doc, fluid.filterKeys(nameRecord, ["is_valid", "lexicon", "created_at", "updated_at"]));
                nameStatus = nameRecord.is_valid ? "accepted" : "unaccepted";
            } else {
                nameStatus = "invalid";
            }
            doc.nameStatus = nameStatus;
        }
    }
    const togo = {
        fetched_at: new Date().toISOString(),
        doc: doc
    };
    return togo;
};

fluid.defaults("fluid.dataSource.listable", {
    invokers: {
        list: "fluid.notImplemented"
    }
});

fluid.defaults("hortis.iNatTaxonAPI.byIdDBSource", {
    gradeNames: ["hortis.listableSqliteSource"],
    createString: "CREATE TABLE IF NOT EXISTS iNatTaxaId (id INTEGER PRIMARY KEY, fetched_at TEXT, doc BLOB)",
    columnCodecs: {
        doc: "zlib"
    },
    readQuery: {
        query: "SELECT id, fetched_at, doc from iNatTaxaId WHERE id = ?",
        args: ["%id"]
    },
    writeQuery: {
        query: "INSERT OR REPLACE INTO iNatTaxaId (id, fetched_at, doc) VALUES ($id, $fetched_at, $doc)",
        args: {
            $id: "%id",
            $fetched_at: "%fetched_at",
            $doc: "%doc"
        }
    },
    listQuery: {
        query: "SELECT id from iNatTaxaId"
    }
});

fluid.defaults("hortis.iNatTaxonAPI.byNameDBSource", {
    gradeNames: ["hortis.listableSqliteSource"],
    createString: "CREATE TABLE IF NOT EXISTS iNatTaxaName (name TEXT PRIMARY KEY, fetched_at TEXT, doc BLOB)",
    columnCodecs: {
        doc: "zlib"
    },
    readQuery: {
        query: "SELECT name, fetched_at, doc from iNatTaxaName WHERE name = ?",
        args: ["%name"]
    },
    writeQuery: {
        query: "INSERT OR REPLACE INTO iNatTaxaId (name, fetched_at, doc) VALUES ($name, $fetched_at, $doc)",
        args: {
            $name: "%name",
            $fetched_at: "%fetched_at",
            $doc: "%doc"
        }
    },
    listQuery: {
        query: "SELECT name from iNatTaxaName"
    }
});

fluid.defaults("hortis.iNatTaxonAPI.dbTaxonAPIs", {
    gradeNames: "fluid.modelComponent",
    components: {
        db: {
            type: "hortis.sqliteDB",
            options: {
                dbFile: "%bagatelle/data/iNaturalist/taxa.db/taxa.sqlite3"
            }
        },
        byId: {
            type: "hortis.iNatTaxonAPI.byIdDBSource"
        },
        byName: {
            type: "hortis.iNatTaxonAPI.byNameDBSource"
        }
    }
});

// Plan in the end is for multitaxonomy source which federates ids as "id:iNat:", names as "name:iNat:"
