
/* eslint-env node */

"use strict";

const fluid = require("infusion");
const hortis = fluid.registerNamespace("hortis");

fluid.defaults("hortis.iNat.obsSource", {
    gradeNames: "kettle.dataSource.URL",
    url: "https://api.inaturalist.org/v1/observations",
    port: 443,
    invokers: {
        resolveUrl: {
            funcName: "hortis.resolveUrl", // url, termMap, directModel as sent from fluid.dataSource.URL.handle
            args: ["{arguments}.0", "{that}.options.paramMap", "{arguments}.2"]
        }
    },
    paramMap: {
        // place_id: 94935,
        // project_id: 5799,
        // taxon_id: 1,
        quality_grade: "research",
        order: "asc",
        order_by: "id",
        id_above: "%id_above",
        per_page: "%per_page"
    }
});

hortis.paramsToSearch = function (params) {
    const encoded = fluid.hashToArray(fluid.transform(params, function (value, key) {
        return encodeURIComponent(key) + "=" + encodeURIComponent(value);
    }));
    return encoded.join("&");
};

hortis.resolveUrl = function (url, paramMap, directModel) {
    const params = fluid.transform(paramMap, function (value) {
        const path = typeof(value) === "string" && value.startsWith("%") ? value.substring(1) : null;
        const paramValue = path ? fluid.get(directModel, path) : value;
        // TODO: Encode arrays as CSV here
        return fluid.isValue(paramValue) ? paramValue : fluid.NO_VALUE;
    });
    const urlObj = new fluid.resourceLoader.UrlClass(url);

    urlObj.search = hortis.paramsToSearch(params);
    return urlObj.toString();
};

hortis.iNat.obsMap = {
    "id": "id",
    "time_observed_at": "time_observed_at",
    "observed_on": "observed_on",
    "user_login": "user.login",
    "user_name": "user.name",
    "quality_grade": "quality_grade",
    "coordinates_obscured": "obscured",
    "image_url": "observation_photos.0.photo.url", // replace "small" with "medium"
    // "latitude": "location.0", // achieved via "applyLocation"
    // "longitude": "location.1",
    "positional_accuracy": "positional_accuracy",
    "positioning_method": "positioning_method",
    "positioning_device": "positioning_device",
    // "private_latitude": "private_location[0]", // achieved via "applyLocation"
    // "private_longitude": "private_location[1]",
    "scientific_name": "taxon.name",
    "common_name": "taxon.preferred_common_name",
    // phylum - fetched from ancestors
    "captive": "captive",
    "taxon_id": "taxon.id",
    "taxon_rank": "taxon.rank"
};

hortis.applyLocation = function (oneResult, row, prefix) {
    const key = prefix + "location";
    const location = typeof(oneResult[key]) === "string" ? oneResult[key].split(",") : [];
    row[prefix + "latitude"] = location[0];
    row[prefix + "longitude"] = location[1];
};

hortis.resultToRow = async function (oneResult, byIdSource) {
    const row = fluid.transform(hortis.iNat.obsMap, function (value) {
        return fluid.get(oneResult, value);
    });
    hortis.applyLocation(oneResult, row, "");
    hortis.applyLocation(oneResult, row, "private_");
    const phylumDoc = await byIdSource.get({id: oneResult.taxon?.ancestor_ids[2]});
    row.phylum = phylumDoc?.doc.name;
    row.time_observed_at = row.time_observed_at || row.observed_on;
    return row;
};

hortis.pushResultRows = async function (rows, response, byIdSource) {
    await hortis.asyncForEach(response.results, async function (oneResult) {
        const row = await hortis.resultToRow(oneResult, byIdSource);
        rows.push(row);
    });
};

// var obsURL = "https://api.inaturalist.org/v1/observations?place_id=94935&taxon_id=1&quality_grade=research&order=asc&order_by=id";


fluid.defaults("hortis.iNatObsById", {
    gradeNames: ["kettle.dataSource.URL", "hortis.withINatRateLimit"],
    url: "https://api.inaturalist.org/v1/observations/%id",
    termMap: {
        id: "%id"
    }
});

fluid.defaults("hortis.cachediNatObsById", {
    gradeNames: "hortis.cachedApiSource",
    components: {
        apiSource: {
            type: "hortis.iNatObsById"
        },
        dbSource: {
            type: "hortis.iNatObsAPI.byIdDBSource"
        }
    },
    invokers: {
        upgradeLiveDocument: "hortis.cachediNatObsById.upgradeLiveDocument"
    }
});

hortis.cachediNatObsById.upgradeLiveDocument = function (query, live) {
    return {
        fetched_at: new Date().toISOString(),
        id: query.id,
        doc: live
    };
};


fluid.defaults("hortis.iNatObsAPI.byIdDBSource", {
    gradeNames: ["hortis.listableSqliteSource"],
    createString: "CREATE TABLE IF NOT EXISTS iNatObsId (id INTEGER PRIMARY KEY, fetched_at TEXT, doc BLOB)",
    columnCodecs: {
        doc: "zlib"
    },
    readQuery: {
        query: "SELECT id, fetched_at, doc from iNatObsId WHERE id = ?",
        args: ["%id"]
    },
    writeQuery: {
        query: "INSERT OR REPLACE INTO iNatObsId (id, fetched_at, doc) VALUES ($id, $fetched_at, $doc)",
        args: {
            $id: "%id",
            $fetched_at: "%fetched_at",
            $doc: "%doc"
        }
    },
    listQuery: {
        query: "SELECT id from iNatObsId"
    }
});

// A cached source for pages of the observations search API, so that an interrupted run of inatObs.js can be resumed
// rapidly. The cache is short-lived since observations change much more rapidly than taxa.
// Accepts the same directModel as hortis.iNat.obsSource, e.g. {per_page, id_above}, and resolves to a record
// {key, fetched_at, doc} where doc is the API response.
// Expected to be instantiated as a child of hortis.iNatTaxonSource in order to share its database and JWT.
fluid.defaults("hortis.cachediNatObsPage", {
    gradeNames: "hortis.cachedApiSource",
    refreshInDays: 3,
    // Pages are large and each is requested only once per run, so holding them in memory would exhaust the heap
    useInMemoryCache: false,
    // paramMap: Object - search parameters for the observations query, merged with those in hortis.iNat.obsSource
    components: {
        apiSource: {
            type: "hortis.iNat.obsSource",
            options: {
                gradeNames: "hortis.withINatRateLimit",
                paramMap: "{cachediNatObsPage}.options.paramMap"
            }
        },
        dbSource: {
            type: "hortis.iNatObsAPI.pageDBSource",
            options: {
                invokers: {
                    encodeQueryKey: "hortis.cachediNatObsPage.encodeQueryKey({arguments}.0, {cachediNatObsPage}.apiSource)"
                }
            }
        }
    },
    invokers: {
        upgradeLiveDocument: "hortis.cachediNatObsPage.upgradeLiveDocument({arguments}.0, {arguments}.1, {arguments}.2, {that}.apiSource)"
    }
});

/** Compute the database key for an observations page query - this is the full resolved API URL
 * @param {Object} query - The directModel for the query, or a record already holding its `key`
 * @param {Component} apiSource - The hortis.iNat.obsSource issuing the requests
 * @return {Object} The query, supplemented with member `key`
 */
hortis.cachediNatObsPage.encodeQueryKey = function (query, apiSource) {
    let key = query.key;
    if (!key) {
        key = apiSource.resolveUrl(apiSource.options.url, apiSource.options.termMap, query);
    }
    return {
        ...query,
        key
    };
};

/** Convert a live observations page response into the record form stored in the database
 * @param {Object} query - The directModel for the query
 * @param {Object} live - The response from the observations API
 * @param {Function} writer - Function accepting (query, record) which writes the record to the caches
 * @param {Component} apiSource - The hortis.iNat.obsSource issuing the requests
 * @return {Promise<Object>} A promise for the record {key, fetched_at, doc}
 */
hortis.cachediNatObsPage.upgradeLiveDocument = async function (query, live, writer, apiSource) {
    const toWrite = {
        key: hortis.cachediNatObsPage.encodeQueryKey(query, apiSource).key,
        fetched_at: new Date().toISOString(),
        doc: live
    };
    // Don't cache the final empty page, so that a rerun will always pick up observations added since
    if (live && live.results && live.results.length > 0) {
        await writer(query, toWrite);
    }
    return toWrite;
};

fluid.defaults("hortis.iNatObsAPI.pageDBSource", {
    gradeNames: ["hortis.listableSqliteSource"],
    createString: "CREATE TABLE IF NOT EXISTS iNatObsPage (key TEXT PRIMARY KEY, fetched_at TEXT, doc BLOB)",
    columnCodecs: {
        doc: "zlib"
    },
    readQuery: {
        query: "SELECT key, fetched_at, doc from iNatObsPage WHERE key = ?",
        args: ["%key"]
    },
    writeQuery: {
        query: "INSERT OR REPLACE INTO iNatObsPage (key, fetched_at, doc) VALUES ($key, $fetched_at, $doc)",
        args: {
            $key: "%key",
            $fetched_at: "%fetched_at",
            $doc: "%doc"
        }
    },
    listQuery: {
        query: "SELECT key from iNatObsPage"
    }
});
