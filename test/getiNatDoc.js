/* eslint-env node */

"use strict";

const fluid = require("infusion");

const hortis = fluid.registerNamespace("hortis");

require("../src/iNaturalist/taxonAPI.js");

const source = hortis.iNatTaxonSource({
});

const testSource = async function () {
    try {
        const query = {id: 1199401};
        const result = await source.get(query);
        console.log(result);

    } catch (e) {
        console.log("Error fetching ancestry ", e);
    }
};

source.events.onCreate.then(testSource);
