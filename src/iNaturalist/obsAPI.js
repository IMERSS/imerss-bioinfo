
/* eslint-env node */

"use strict";

var fluid = require("infusion");
var hortis = fluid.registerNamespace("hortis");

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
        project_id: 5799,
        taxon_id: 1,
        quality_grade: "research",
        order: "asc",
        order_by: "id",
        id_above: "%id_above",
        per_page: "%per_page"
    }
});

hortis.paramsToSearch = function (params) {
    var encoded = fluid.hashToArray(fluid.transform(params, function (value, key) {
        return encodeURIComponent(key) + "=" + encodeURIComponent(value);
    }));
    return encoded.join("&");
};

hortis.resolveUrl = function (url, paramMap, directModel) {
    var params = fluid.transform(paramMap, function (value) {
        var path = typeof(value) === "string" && value.startsWith("%") ? value.substring(1) : null;
        var paramValue = path ? fluid.get(directModel, path) : value;
        // TODO: Encode arrays as CSV here
        return fluid.isValue(paramValue) ? paramValue : fluid.NO_VALUE;
    });
    var urlObj = new fluid.resourceLoader.UrlClass(url);

    urlObj.search = hortis.paramsToSearch(params);
    return urlObj.toString();
};

hortis.iNat.obsMap = {
    "id": "id",
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
    var key = prefix + "location";
    var location = typeof(oneResult[key]) === "string" ? oneResult[key].split(",") : [];
    row[prefix + "latitude"] = location[0];
    row[prefix + "longitude"] = location[1];
};

hortis.resultToRow = function (oneResult) {
    var row = fluid.transform(hortis.iNat.obsMap, function (value) {
        return fluid.get(oneResult, value);
    });
    hortis.applyLocation(oneResult, row, "");
    hortis.applyLocation(oneResult, row, "private_");
    return row;
};

hortis.pushResultRows = function (rows, response) {
    response.results.forEach(function (oneResult) {
        var row = hortis.resultToRow(oneResult);
        rows.push(row);
    });
};

// var obsURL = "https://api.inaturalist.org/v1/observations?place_id=94935&taxon_id=1&quality_grade=research&order=asc&order_by=id";
