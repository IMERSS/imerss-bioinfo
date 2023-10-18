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
require("../Wikipedia/wikipedia.js");
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

hortis.iNat.recordTransform = {
    "wikipediaSummary": "wikipedia_summary",
    "commonName": "common_name.name",
    "iNaturalistTaxonId": "id",
    "iNaturalistTaxonImage": "default_photo.medium_url"
};

hortis.iNat.addTaxonInfo = function (transform, row, fullRecord) {
    fluid.each(transform, function (path, target) {
        const source = fluid.get(fullRecord, path);
        if (row[target] === undefined) {
            row[target] = source;
        }
    });
};

hortis.iNat.invertSwaps = function (swaps) {
    const invertedSwaps = {};
    fluid.each(swaps, function (value, resolvedTaxon) {
        const iNaturalistTaxonId = value.iNaturalistTaxonId;
        if (!iNaturalistTaxonId) {
            fluid.fail("Swap with name " + resolvedTaxon + " does not have iNaturalistTaxonId");
        }
        fluid.each(value.taxonNames, function (record, taxonName) {
            if (record.type !== "commonName") {
                invertedSwaps[taxonName] = iNaturalistTaxonId;
            }
        });
    });
    return invertedSwaps;
};

// Return parent taxa ids in order up the hierarchy
hortis.iNat.parentTaxaIds = function (taxonDoc) {
    return taxonDoc.ancestry ? taxonDoc.ancestry.split("/").reverse() : [];
};

fluid.defaults("hortis.iNatAPILimiter", {
    gradeNames: ["fluid.dataSource.rateLimiter", "fluid.resolveRootSingle"],
    rateLimit: 1200,
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
    url: "https://api.inaturalist.org/v1/taxa/%id",
    termMap: {
        id: "%id"
    }
});

fluid.defaults("hortis.iNatTaxonByName", {
    gradeNames: ["kettle.dataSource.URL", "hortis.withINatRateLimit"],
    url: "https://api.inaturalist.org/v1/taxa/autocomplete?q=%name",
    termMap: {
        name: "%name"
    }
});


hortis.DAY_IN_MS = 24 * 60 * 60 * 1000;

fluid.defaults("hortis.cachedApiSource", {
    gradeNames: ["fluid.dataSource", "fluid.dataSource.noencoding"],
    refreshInDays: 70,
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
                await that.inMemorySource.set(query, cached);
                return cached;
            } else {
                console.log("Staleness is " + moment.duration(staleness).humanize() + " so fetching live document");
            }
        }
        const live = await that.apiSource.get(query);
        const writer = async function (query, toWrite) {
            if (toWrite.doc) { // Only write to db if we got live
                await that.dbSource.set(query, toWrite);
            }
            // Always write to top-level cache
            await that.inMemorySource.set(query, hortis.writeNoValue(toWrite));
        };
        const toWrite = await that.upgradeLiveDocument(query, live, writer);

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
        upgradeLiveDocument: {
            funcName: "hortis.cachediNatTaxonById.upgradeLiveDocument",
            // query,          live
            args: ["{arguments}.0", "{arguments}.1", "{arguments}.2", "{cachediNatTaxonById}.inMemorySource", "{wikipediaExtracts}"]
        }
    }
});



hortis.cachediNatTaxonById.upgradeLiveDocument = async function (query, live, writer, inMemorySource, wikipediaExtracts) {
    const writeUpgrade = async (id, doc) => {
        const cached = await inMemorySource.get({id});
        if (!cached) {
            if (doc) {
                console.log("No cached doc for id " + id);
                if (doc.wikipedia_url) {
                    const name = hortis.wikipediaExtracts.urlToTitle(doc.wikipedia_url);
                    const extract = wikipediaExtracts && await wikipediaExtracts.get({name: name});
                    doc.wikipedia_summary = extract && extract.extract;
                }
            }
            const toWrite = {
                fetched_at: new Date().toISOString(),
                id: id,
                doc: doc
            };
            await writer({id}, toWrite);
            console.log("Document written for id " + id);
            return toWrite;
        }
        return cached;
    };
    if (live && live.results.length > 0) {
        const oneLive = live.results[0];
        const toWrite = fluid.censorKeys(oneLive, ["ancestors"]);
        const togo = await writeUpgrade(query.id, toWrite);
        const ancestors = oneLive.ancestors || [];
        await hortis.asyncForEach(ancestors, async ancestor => {
            await writeUpgrade(ancestor.id, ancestor);
        });
        return togo;
    } else {
        console.log("Got empty response ", live);
        return await writeUpgrade(query.id, undefined);
    }
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
        upgradeLiveDocument: "hortis.cachediNatTaxonByName.upgradeLiveDocument({that}.byIdSource, {arguments}.0, {arguments}.1, {arguments}.2)"
    }
});

hortis.scoreNameMatch = async function (result, query, byIdSource) {
    let score = (query.name === result.matched_term ? 200 : 0) + (query.name === result.name ? 100 : 0) - result.rank_level;
    // Don't hit the DB for any results which are not already an exact match for the query
    if (query.rank) {
        if (query.rank === result.rank) {
            score += 800;
        }
    }
    if (query.phylum && score > 200) {
        const rankTarget = {};
        await hortis.iNat.getRanks(result.id, rankTarget, byIdSource, ["phylum"]);
        if (query.phylum === rankTarget.phylum) {
            score += 400;
        }
    }
    return score;
};

// Assumes results sorted into descending order of $score, returns run of 1 or more for repeated equal scores
hortis.topScoreRun = function (results) {
    let highest = -Infinity,
        run = 0;
    for (let i = 0; i < results.length; ++i) {
        const score = results[i].$score;
        if (score > highest) {
            highest = score;
        } else if (score === highest) {
            ++run;
        } else {
            break;
        }
    }
    return run;
};

hortis.bestNameMatch = async function (results, query, byIdSource) {
    await hortis.asyncForEach(results, async result => result.$score = await hortis.scoreNameMatch(result, query, byIdSource));
    const sorted = results.sort((a, b) => b.$score - a.$score);
    const run = hortis.topScoreRun(sorted);
    const togo = sorted[0];
    if (run > 0) {
        togo.$ambiguous = sorted[1];
        console.log("!*!*!*!* Warning - ambiguous name search for ", query.name, " - record ", togo.$ambiguous, " matches equally well");
    }
    return togo;
};

hortis.cachediNatTaxonByName.upgradeLiveDocument = async function (byIdSource, query, live, writer) {
    // TODO: Note we could speed up this query a lot by supplying rank and phylum (via its id) to the autocomplete query in hortis.iNatTaxonByName
    console.log("upgradeLive byName given ", live);
    const togo = {
        ...query,
        fetched_at: new Date().toISOString()
    };
    if (live && live.results.length > 0) {
        const record = await hortis.bestNameMatch(live.results, query, byIdSource);
        const doc = fluid.filterKeys(record, ["name", "matched_term", "rank", "id"]);
        doc.ambiguousNameMatch = !!record.$ambiguous;

        // const byIdBack = await byIdSource.get({id: doc.id});

        const nameStatus = doc.matched_term === query.name ? (doc.name === query.name ? "accepted" : "unaccepted") : "invalid";

        doc.nameStatus = nameStatus;
        console.log("Filtered byName document to ", doc);
        togo.doc = doc;
        console.log("About to write ", togo);
    }
    await writer(query, togo);
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
            target: "{that hortis.withINatRateLimit}.options.headers",
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
        },
        disableNameCache: {
            source: "{that}.options.disableNameCache",
            target: "{that > byName}.options.disableCache",
            priority: "after:disableCache"
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
        },
        wikipediaExtracts: {
            type: "hortis.wikipediaExtracts"
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
        args: ["%key"]
    },
    writeQuery: {
        query: "INSERT OR REPLACE INTO iNatTaxaName (name, fetched_at, doc) VALUES ($name, $fetched_at, $doc)",
        args: {
            $name: "%key",
            $fetched_at: "%fetched_at",
            $doc: "%doc"
        }
    },
    listQuery: {
        query: "SELECT name from iNatTaxaName"
    },
    invokers: {
        encodeQueryKey: "hortis.iNatTaxonAPI.byNameDBSource.encodeQueryKey({arguments}.0)"
    }
});

hortis.iNatTaxonAPI.byNameDBSource.encodeQueryKey = function (query) {
    let key = query.name;
    if (query.phylum) {
        key += "|phylum=" + query.phylum;
    }
    if (query.rank) {
        key += "|rank=" + query.rank;
    }
    return {
        ...query,
        key
    };
};

fluid.defaults("hortis.iNatTaxonAPI.dbTaxonAPIs", {
    gradeNames: "fluid.modelComponent",
    components: {
        db: {
            type: "hortis.sqliteDB",
            options: {
                dbFile: "%imerss-bioinfo/data/iNaturalist/taxa.db/taxa-auto.sqlite3"
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
    const taxonIsComplex = allDocs[0].doc.rank === "complex";
    allDocs.forEach(function (doc) {
        const docRank = doc.doc.rank;
        // Prevent issue of 17/10/23 where name of complex got assigned as name of species - presumably we still need this
        // bypass to display complexes themselves in the UI
        const rank = hortis.capitalize(taxonIsComplex && docRank === "complex" ? "species" : docRank);
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
