/* eslint-env node */

"use strict";

var fluid = require("infusion");

var hortis = fluid.registerNamespace("hortis");

hortis.iNaturalistObsFromUrl = function (url) {
    var lastSlashPos = url.lastIndexOf("/");
    return url.substring(lastSlashPos + 1);
};

// Currently disused
hortis.iNaturalistIdToLink = function (id) {
    return "https://www.inaturalist.org/taxa/" + id;
};
