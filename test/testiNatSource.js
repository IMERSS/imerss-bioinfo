/* eslint-env node */

"use strict";

const fluid = require("infusion");

const hortis = fluid.registerNamespace("hortis");

require("../src/iNaturalist/taxonAPI.js");

const source = hortis.iNatTaxonSource({
    // disableCache: true
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
// Velutina velutina - bizarrely resolves onto Sambucus cerulea, because iNat API returns 376 results TODO
// Orthopyxis
// Hyalophora - test Wikipedia extracts
// {id: 47429}
// {obsId: 86945066}
// Crataegus monogyna
// Leptoglossus occidentalis gets wrong name in species
// We updated it but seemed to have bad cache

const testSource = async function () {
    try {
        const query = "Anthidiellum robertsoni";
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
