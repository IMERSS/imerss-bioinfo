/* eslint-env node */

"use strict";

const fluid = require("infusion");

const hortis = fluid.registerNamespace("hortis");

require("../src/iNaturalist/taxonAPI.js");

const source = hortis.iNatTaxonAPISource();

const testSource = async function () {
    const result = await source.get({name: "Flabellina japonica"});
    console.log(result);
};

testSource();
