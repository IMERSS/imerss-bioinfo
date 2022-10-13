/* eslint-env node */

"use strict";

var fluid = require("infusion");

var hortis = fluid.registerNamespace("hortis");

require("../src/iNaturalist/taxonAPI.js");

var source = hortis.iNatTaxonAPISource();

var testSource = async function () {
    var result = await source.get({name: "Flabellina japonica"});
    console.log(result);
};

testSource();
