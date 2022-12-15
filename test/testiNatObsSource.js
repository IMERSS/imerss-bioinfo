/* eslint-env node */

"use strict";

const fluid = require("infusion");

const hortis = fluid.registerNamespace("hortis");

require("../src/iNaturalist/taxonAPI.js");

const source = hortis.iNatTaxonSource({
    disableCache: false
});

// Old queries:
// "Acmispon americanus var. americanus" - to test resolution of multiple returned taxa
// Calandrinia ciliata - test resolution onto "name" rather than "matched name"
// Symphyotrichum chilense x subspicatum - test normalisation of "x"
// Veronica peregrina var. xalapensis - test not being confused by things beginning with x!
// Abies grandis - test how we extract species name from document - led to including species in first place
// Achillea millefolium complex - Convert rank of "complex" to "species" as per AS
// Adenocaulon bicolor - test retrieving subclass
// Balanus glandula/Balanus crenatus - test caching of missing values
// {id: 47429}
// {obsId: 86945066}

const testSource = async function () {
    try {
        const result = await source.get({obsId: 86945066});
        console.log("Got result ", result);
        console.log("Got taxon name ", result.doc.results[0].taxon.name);

    } catch (e) {
        console.log("Error fetching observation ", e);
    }
};

source.events.onCreate.then(testSource);
