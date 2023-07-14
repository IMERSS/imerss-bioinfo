/* eslint-env node */

"use strict";

const fluid = require("infusion");
const hortis = fluid.registerNamespace("hortis");

fluid.registerNamespace("hortis.wikipedia");

require("../utils/dataSource.js");
require("kettle"); // for kettle.dataSource.URL

fluid.defaults("hortis.wikipediaExtracts", {
    gradeNames: ["kettle.dataSource.URL"],
    url: "https://en.wikipedia.org/w/api.php?action=query&exchars=1200&prop=extracts&redirects&format=json&titles=%name",
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

hortis.wikipediaExtracts.extractText = function (response) {
    const pages = response.query.pages;
    const firstPage = pages[Object.keys(pages)[0]];
    return firstPage;
};
