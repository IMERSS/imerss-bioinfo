/* eslint-env node */

"use strict";

const fluid = require("infusion");
const hortis = fluid.registerNamespace("hortis");
const moment = require("moment");

fluid.registerNamespace("hortis.iNat");

require("../utils/dataSource.js");
require("../dataProcessing/sqlite.js");
require("kettle"); // for kettle.dataSource.URL

hortis.sanitizeSpeciesName = function (name) {
    name = name.trim();
    // Examples such as Blidingia spp., including Blidingia minima var. vexata
    [" sp.", " spp.", "?", " / ", " x"].forEach(function (toRemove) {
        const index = name.indexOf(toRemove);
        // Special exception to allow us to process Myxicola sp.A and sp.B, as well as Haliclona sp.1 and sp.2 etc.
        if (index !== -1 && !name.match(/sp\.[A-Z0-9]/)) {
            name = name.substring(0, index);
        }
    });
    name = name.replace("�", "ue");
    name = name.replace(/ (\(.*\))/g, "");
    name = name.replace(" ssp.", "");
    name = name.replace(" subsp.", "");
    name = name.replace(" grp.", "");
    name = name.replace(" grp", "");
    name = name.replace(" group", "");
    name = name.replace(" var.", "");
    name = name.replace(" ined.", "");
    name = name.replace(" etc.", "");
    name = name.replace(" aff.", "");
    name = name.replace(" agg.", "");
    name = name.replace(" s.lat.", "");
    name = name.replace(" f.", "");
    name = name.replace(" species complex", "");
    name = name.replace(" complex", "");
    name = name.replace(" cf ", " ");
    name = name.replace(" ?", " ");
    name = name.replace(" x ", " × ");
    return name;
};

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


hortis.DAY_IN_MS = 24 * 60 * 60 * 1000;

fluid.defaults("hortis.cachedApiSource", {
    gradeNames: ["fluid.dataSource", "fluid.dataSource.noencoding"],
    refreshInDays: 7,
    disableCache: false,
    /*
    components: {
        apiSource,
        dbSource
    }
    */
    invokers: {
        // accepts "payload", "live" in order to convert API document to DB form
        upgradeLiveDocument: "fluid.notImplemented"
    },
    listeners: {
        "onRead.impl": {
            func: "hortis.cachedApiSource.read",
            args: ["{that}", "{arguments}.0", "{arguments}.1"]
        }
    }
});

hortis.cachedApiSource.read = async function (that, payload, options) {
    const query = options.directModel;
    const cached = await that.dbSource.get(query);
    console.log("cachedAPISource got cached document ", cached);
    if (cached && !that.options.disableCache) {
        const staleness = Date.now() - Date.parse(cached.fetched_at);
        if (staleness < that.options.refreshInDays * hortis.DAY_IN_MS) {
            console.log("Staleness is " + moment.duration(staleness).humanize() + " so returning cached document");
            return cached;
        }
    }
    const live = await that.apiSource.get(query);
    if (live) {
        const toWrite = await that.upgradeLiveDocument(query, live);
        console.log("cachedApiSource got ", toWrite);
        if (toWrite) {
            await that.dbSource.set(query, toWrite);
        }
        return toWrite;
    }
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
    invokers: {
        upgradeLiveDocument: "hortis.cachediNatTaxonById.upgradeLiveDocument"
    }
});

hortis.cachediNatTaxonById.upgradeLiveDocument = function (query, live) {
    return {
        fetched_at: new Date().toISOString(),
        id: query.id,
        doc: live
    };
};

fluid.defaults("hortis.cachediNatTaxonByName", {
    gradeNames: "hortis.cachedApiSource",
    components: {
        apiSource: {
            type: "hortis.iNatTaxonByName"
        },
        dbSource: {
            type: "hortis.iNatTaxonAPI.byNameDBSource"
        }
        // byIdSource
    },
    invokers: {
        upgradeLiveDocument: "hortis.cachediNatTaxonByName.upgradeLiveDocument({that}.byIdSource, {arguments}.0, {arguments}.1)"
    }
});

hortis.bestNameMatch = function (results, query) {
    const match = results.findIndex(function (result) {
        return result.matched_term === query.name || result.name === query.name;
    });
    return results[match === -1 ? 0 : match];
};

hortis.cachediNatTaxonByName.upgradeLiveDocument = async function (byIdSource, query, live) {
    console.log("upgradeLive given ", live);
    if (live.results.length === 0) {
        return null;
    } else {
        const record = hortis.bestNameMatch(live.results, query);
        const doc = fluid.filterKeys(record, ["name", "rank", "id"]);

        const byIdBack = await byIdSource.get({id: doc.id});
        const nameRecord = byIdBack.doc.taxon_names.find(function (nameRec) {
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
        console.log("Filtered byName document to ", doc);
        const togo = {
            name: query.name,
            fetched_at: new Date().toISOString(),
            doc: doc
        };
        console.log("About to write ", togo);
        return togo;
    }
};

// The top-level overall cached iNaturalist taxon source
fluid.defaults("hortis.iNatTaxonSource", {
    gradeNames: ["fluid.dataSource", "fluid.dataSource.noencoding"],
    disableCache: false,
    distributeOptions: {
        disableCache: {
            source: "{that}.options.disableCache",
            target: "{that hortis.cachedApiSource}.options.disableCache"
        }
    },
    components: {
        db: {
            type: "hortis.sqliteDB",
            options: {
                dbFile: "%bagatelle/data/iNaturalist/taxa.db/taxa.sqlite3"
            }
        },
        byId: {
            type: "hortis.cachediNatTaxonById"
        },
        byName: {
            type: "hortis.cachediNatTaxonByName",
            options: {
                components: {
                    byIdSource: "{hortis.cachediNatTaxonById}"
                }
            }
        }
    },
    listeners: {
        "onRead.impl": {
            func: "hortis.iNatTaxonSource.read",
            args: ["{that}", "{arguments}.0", "{arguments}.1"]
        }
    }
});

/** Accepts queries either by name or by id, forwarding to the two raw API sources which are attached.
 * In the case of a by id query, it is sent direct.
 * In the case of a by name query, we look at the first result in the list and attempt to look it up by id and then
 * look at the "taxon_names" entries which account for iNat's alternate names. If we find it there, we can decide
 * that the entry is either "accepted" (if iNat says is_valid), "unaccepted" (if not is_valid)
 * or "invalid" if it is not there, because iNat has returned the result as a partial or fuzzy name match.
 * @param {Component} that - The iNatTaxonSource component
 * @param {Object} payload - The payload being transformed
 * @param {Object} options - The DataSource chain options, including the query in "directModel"
 * @return {Promise<Object>} A promise for the document as returned from the API
 */
hortis.iNatTaxonSource.read = async function (that, payload, options) {
    const query = options.directModel;
    let doc;
    if (query.id) {
        doc = await that.byId.get(query);
    } else if (query.name) {
        doc = await that.byName.get(query);
    }
    return doc;
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
        query: "INSERT OR REPLACE INTO iNatTaxaName (name, fetched_at, doc) VALUES ($name, $fetched_at, $doc)",
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
