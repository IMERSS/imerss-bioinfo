
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
    const phylumDoc = await byIdSource.get({id: oneResult.taxon.ancestor_ids[2]});
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
