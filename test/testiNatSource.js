/* eslint-env node */

"use strict";

const fluid = require("infusion");

const hortis = fluid.registerNamespace("hortis");

require("../src/iNaturalist/taxonAPI.js");

const source = hortis.iNatTaxonSource({
    disableCache: true
});

// Old queries:
// "Acmispon americanus var. americanus" - to test resolution of multiple returned taxa
// Calandrinia ciliata - test resolution onto "name" rather than "matched name"
// Symphyotrichum chilense x subspicatum

const testSource = async function () {
    const query = "Symphyotrichum chilense x subspicatum";
    const sane = hortis.sanitizeSpeciesName(query);
    const result = await source.get({name: sane});
    console.log(result);
};

source.events.onCreate.then(testSource);
