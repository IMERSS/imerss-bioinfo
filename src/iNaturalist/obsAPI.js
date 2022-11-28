
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
    // "latitude": "location.0",
    // "longitude": "location.1",
    "positional_accuracy": "positional_accuracy",
    // "private_latitude": "private_location[0]",
    // "private_longitude": "private_location[1]",
    "scientific_name": "taxon.name",
    "common_name": "taxon.preferred_common_name",
    "taxon_id": "taxon.id"
};

hortis.applyLocation = function (oneResult, row, prefix) {
    const key = prefix + "location";
    const location = typeof(oneResult[key]) === "string" ? oneResult[key].split(",") : [];
    row[prefix + "latitude"] = location[0];
    row[prefix + "longitude"] = location[1];
};

hortis.resultToRow = function (oneResult) {
    const row = fluid.transform(hortis.iNat.obsMap, function (value) {
        return fluid.get(oneResult, value);
    });
    hortis.applyLocation(oneResult, row, "");
    hortis.applyLocation(oneResult, row, "private_");
    row.time_observed_at = row.time_observed_at || row.observed_on;
    return row;
};

hortis.pushResultRows = function (rows, response) {
    response.results.forEach(function (oneResult) {
        const row = hortis.resultToRow(oneResult);
        rows.push(row);
    });
};

// var obsURL = "https://api.inaturalist.org/v1/observations?place_id=94935&taxon_id=1&quality_grade=research&order=asc&order_by=id";
