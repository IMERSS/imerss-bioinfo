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

const testSource = async function () {
    try {
        const query = "Balanus glandula/Balanus crenatus";
        const sane = hortis.sanitizeSpeciesName(query);
        const result = await source.get({name: sane});
        console.log(result);
        // const parents = await hortis.iNat.getAncestry(result.doc.id, source.byId);
        // console.log(parents);
        const rankTarget = {
            Kingdom: "",
            Phylum: "",
            Subclass: "Magnoliidae", // test overriding
            Order: "",
            Genus: "",
            Species: ""
        };
        await hortis.iNat.getRanks(result.doc.id, rankTarget, source.byId);
        console.log(rankTarget);
    } catch (e) {
        console.log("Error fetching ancestry ", e);
    }
};

source.events.onCreate.then(testSource);
