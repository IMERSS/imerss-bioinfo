/* eslint-env node */

"use strict";

hortis.iNaturalistObsFromUrl = function (url) {
    var lastSlashPos = url.lastIndexOf("/");
    return url.substring(lastSlashPos + 1);
};