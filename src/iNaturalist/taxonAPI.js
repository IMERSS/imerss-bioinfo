/* eslint-env node */

"use strict";

const fluid = require("infusion");
const hortis = fluid.registerNamespace("hortis");
const moment = require("moment");

fluid.registerNamespace("hortis.iNat");

require("../utils/dataSource.js");
require("../utils/utils.js");
require("../dataProcessing/sqlite.js");
require("./obsAPI.js");
require("kettle"); // for kettle.dataSource.URL

hortis.ranks = fluid.freezeRecursive(fluid.require("%imerss-bioinfo/data/ranks.json"));

hortis.sanitizeSpeciesName = function (name) {
    name = name.trim();
    // Examples such as Blidingia spp., including Blidingia minima var. vexata
    [" sp.", " spp.", "?", " / ", " x "].forEach(function (toRemove) {
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
    name = name.replace(" s. lat.", "");
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
    return taxonDoc.ancestry ? taxonDoc.ancestry.split("/").reverse() : [];
};

fluid.defaults("hortis.iNatAPILimiter", {
    gradeNames: ["fluid.dataSource.rateLimiter", "fluid.resolveRootSingle"],
    rateLimit: 1300,
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
    refreshInDays: 31,
    disableCache: false,
    components: {
        inMemorySource: {
            type: "fluid.inMemoryCachedSource"
        }
        //apiSource,
        //dbSource
    },
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

hortis.readNoValue = function (value) {
    return value === fluid.NO_VALUE ? undefined : value;
};

hortis.writeNoValue = function (value) {
    return value === undefined ? fluid.NO_VALUE : value;
};

hortis.cachedApiSource.read = async function (that, payload, options) {
    const query = options.directModel;
    const firstLevel = await that.inMemorySource.get(query);
    if (firstLevel) {
        return hortis.readNoValue(firstLevel);
    } else {
        const cached = await that.dbSource.get(query);
        if (cached && !that.options.disableCache) {
            const staleness = Date.now() - Date.parse(cached.fetched_at);
            if (staleness < that.options.refreshInDays * hortis.DAY_IN_MS) {
                await that.inMemorySource.set(hortis.writeNoValue(query), cached);
                return cached;
            } else {
                console.log("Staleness is " + moment.duration(staleness).humanize() + " so fetching live document");
            }
        }
        const live = await that.apiSource.get(query);
        const toWrite = await that.upgradeLiveDocument(query, live);
        if (live) { // Only write to db if we got live
            await that.dbSource.set(query, toWrite);
        }
        // Always write to top-level cache
        await that.inMemorySource.set(hortis.writeNoValue(query), toWrite);
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
    console.log("upgradeLive byName given ", live);
    const togo = {
        name: query.name,
        fetched_at: new Date().toISOString()
    };
    if (live && live.results.length > 0) {
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
        togo.doc = doc;
        console.log("About to write ", togo);
        return togo;
    }
    return togo;
};

hortis.iNat.jwtDistribution = function (jwt) {
    return jwt ? "hortis.iNat.distributeJWT" : [];
};

hortis.iNat.computeHeaders = function (jwt) {
    return {
        Authorization: "Bearer " + jwt.api_token
    };
};

fluid.defaults("hortis.iNat.distributeJWT", {
    jwtHeaders: "@expand:hortis.iNat.computeHeaders({that}.options.jwt)",
    distributeOptions: {
        distributeJWT: {
            target: "{that kettle.dataSource.URL}.options.headers",
            source: "{that}.options.jwtHeaders"
        }
    }
});

// The top-level overall cached iNaturalist taxon and obs source
fluid.defaults("hortis.iNatTaxonSource", {
    gradeNames: ["fluid.dataSource", "fluid.dataSource.noencoding", "{that}.jwtDistribution"],
    disableCache: false,
    distributeOptions: {
        disableCache: {
            source: "{that}.options.disableCache",
            target: "{that hortis.cachedApiSource}.options.disableCache"
        }
    },
    invokers: {
        jwtDistribution: "hortis.iNat.jwtDistribution({that}.options.jwt)"
    },
    components: {
        db: {
            type: "hortis.sqliteDB",
            options: {
                dbFile: "%imerss-bioinfo/data/iNaturalist/taxa.db/taxa.sqlite3"
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
        },
        obsById: {
            type: "hortis.cachediNatObsById"
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
    } else if (query.obsId) {
        doc = await that.obsById.get({id: query.obsId});
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
                dbFile: "%imerss-bioinfo/data/iNaturalist/taxa.db/taxa.sqlite3"
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

hortis.extractSpeciesName = function (name) {
    const words = name.split(" ");
    return words[1];
};

// Plan in the end is for multitaxonomy source which federates ids as "id:iNat:", names as "name:iNat:"

/** Return ancestry documents starting from the specified taxon and continuing up the hierarchy to the root. Note that a
 * rank of "complex" will be considered to be "species".
 * @param {String} id - The id of the taxon for which ancestry is required
 * @param {fluid.dataSource} byIdSource - The dataSource serving taxon documents by ID
 * @return {Promise<Array<Object>>} - A promise for an array of taxon documents, with the taxon document for which the
 * id was specified in the first element
 */
hortis.iNat.getAncestry = async function (id, byIdSource) {
    const baseDoc = await byIdSource.get({id: id});
    const parentIds = hortis.iNat.parentTaxaIds(baseDoc.doc);
    // TODO: Should not really be parallel
    const allDocs = await Promise.all(parentIds.map(async id => byIdSource.get({id: id})));
    return [baseDoc, ...allDocs];
};

/**
 * Resolve the higher taxon ranks of a taxon into a supplied structure, given a taxon Id
 * @param {String} id - The id of the taxon whose ranks are to be fetched
 * @param {Object} rankTarget - The structure to receive the ranks. If `fields` is not set, any existing rank fields
 * in this structure will be overwritten - otherwise just the fields listed in `fields` will be overwritten
 * @param {fluid.dataSource} byIdSource - The taxon source
 * @param {Array<String>} [fields] - [optional] If supplied, only the taxa whose keys are listed in this structure will be
 * fetched into `rankTarget` - these are uncapitalized
 * @return {Promise<Object>} The structure `rankTarget` with higher taxa filled in
 */
hortis.iNat.getRanks = async function (id, rankTarget, byIdSource, fields) {
    const allDocs = await hortis.iNat.getAncestry(id, byIdSource);
    const indexed = {};
    allDocs.forEach(function (doc) {
        const docRank = doc.doc.rank;
        const rank = hortis.capitalize(docRank === "complex" ? "species" : docRank);
        indexed[rank] = rank === "Species" ? hortis.extractSpeciesName(doc.doc.name) : doc.doc.name;
    });
    // console.log("Got ranks ", Object.keys(indexed));
    hortis.ranks.forEach(function (lowRank) {
        const rank = hortis.capitalize(lowRank);
        let targetRank = fields ? lowRank : rank;
        if (lowRank in rankTarget) {
            targetRank = lowRank;
        }
        if (fields && fields.includes(targetRank) || targetRank in rankTarget) {
            const thisRank = indexed[rank];
            const oldTarget = rankTarget[targetRank];
            if (thisRank && oldTarget && oldTarget !== thisRank) {
                console.log("Replacing " + targetRank + " " + oldTarget + " with " + thisRank + " for taxon " + rankTarget.taxonName);
            }
            rankTarget[targetRank] = thisRank || "";
        }
    });
};
