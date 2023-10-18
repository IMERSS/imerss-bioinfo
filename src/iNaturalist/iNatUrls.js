/* eslint-env node */

"use strict";

const fluid = require("infusion");

const hortis = fluid.registerNamespace("hortis");

hortis.iNaturalistObsFromUrl = function (url) {
    const lastSlashPos = url.lastIndexOf("/");
    return url.substring(lastSlashPos + 1);
};

hortis.iNaturalistTaxonFromUrl = function (url) {
    const lastSlashPos = url.lastIndexOf("/");
    return url.substring(lastSlashPos + 1);
};

// Currently disused
hortis.iNaturalistIdToLink = function (id) {
    return "https://www.inaturalist.org/taxa/" + id;
};
