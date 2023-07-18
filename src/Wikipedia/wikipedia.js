/* eslint-env node */

"use strict";

const fluid = require("infusion");
const hortis = fluid.registerNamespace("hortis");

fluid.registerNamespace("hortis.wikipedia");

require("../utils/dataSource.js");
require("kettle"); // for kettle.dataSource.URL

fluid.defaults("hortis.wikipediaExtracts", {
    gradeNames: ["kettle.dataSource.URL"],
    url: "https://en.wikipedia.org/w/api.php?action=query&exchars=450&prop=extracts&redirects&format=json&titles=%name",
    termMap: {
        name: "%name"
    },
    listeners: {
        "onRead.extract": {
            priority: "after:encoding",
            funcName: "hortis.wikipediaExtracts.extractText"
        }
    }
});

hortis.wikipediaExtracts.urlToTitle = function (url) {
    const index = url.indexOf("wiki/");
    return url.substring(index + 5);
};

hortis.wikipediaExtracts.trimAt = ["<h2"];

hortis.wikipediaExtracts.trimPage = function (text) {
    const indices = hortis.wikipediaExtracts.trimAt.map(find => text.indexOf(find));
    const censored = indices.map(index => index === -1 ? text.length : index);
    const min = Math.min(...censored);
    return text.substring(0, min);
};

hortis.wikipediaExtracts.extractText = function (response) {
    const pages = response.query.pages;
    const firstPage = pages[Object.keys(pages)[0]];
    if (firstPage && firstPage.extract) {
        firstPage.extract = hortis.wikipediaExtracts.trimPage(firstPage.extract);
    }
    return firstPage;
};
