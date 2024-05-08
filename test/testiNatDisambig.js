/* eslint-env node */

"use strict";

const fluid = require("infusion");

const hortis = fluid.registerNamespace("hortis");

require("../src/iNaturalist/taxonAPI.js");

// New test following 16/10/23 - can we prevent resolutions such as Diplotaxis -> Brassicaceae
// {name: "Diplotaxis", phylum: "Arthropoda"}; // Should be in Brassicaceae
// {name: "Liparis", phylum: "Chordata"}; // Should be in Actinopterygii
// {name: "Bacteria", phylum: "Bacteria", rank: "kingdom"}; // Should not be 47319 "Bacteria Stick Insects", a genus! Need to add taxonRank a la GBIF
// {name: "Porella", phylum: "Plantae", rank: "genus"}
// {name: "Amelanchier alnifolia"}
// {name: "Homo sapiens", phylum: "Tracheophyta"}
// {name: "Henricia aspera aspera", phylum: "Echinodermata", rank: "species"} - should be good even though rank is not species
// {name: "Prunella vulgaris vulgaris", phylum: "Tracheophyta", rank: "species"}

const source = hortis.iNatTaxonSource({
    disableNameCache: true
});

const testSource = async function () {
    try {
        const query = {name: "Prunella vulgaris vulgaris", phylum: "Tracheophyta", rank: "species"};
        const result = await source.get(query);
        console.log(result);
        const byId = await source.get({id: result.doc.id});
        console.log(byId);
    } catch (e) {
        console.log("Error performing query ", e);
    }
};

source.events.onCreate.then(testSource);
