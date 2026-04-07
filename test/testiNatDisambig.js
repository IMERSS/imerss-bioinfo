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
// {name: "Anthidiellum robertsoni", phylum: "Tracheophyta"}
// {name: "Mytilus edulis", phylum: "Mollusca", rank: "complex"} // should get 1108240
// {name: "Didymosphenia geminata", phylum: "Ochrophyta", rank: "species"}
// {name: "Pentagramma triangularis", phylum: "Tracheophyta", rank: "species"} // should get ssp
// {name: "Halictus", phylum: "Arthropoda"} // should get genus or subgenus
// {name: "Coelioxys octodentata", phylum: "Arthropoda"};
// {name: "Thinopyrum intermedium barbulatum", phylum: "Anthophyta"}; // Test phylum remapping
// {name: "Trichia favoginea", phylum: "Anthophyta"};
// {name: "Abies amabilis", phylum: "Coniferophyta"};
// {name: "x Elyhordeum stebbinsianum", phylum: "Tracheophyta"}; // Test normalisation, used to be a branch which axed after first later capital letter

const source = hortis.iNatTaxonSource({
    disableNameCache: true
});

hortis.dumpiNatNameScores = true;

const testSource = async function () {
    try {
        const query = {name: "Stachys cooleyae", phylum: "Tracheophyta", rank: "species"};
        const result = await source.get({name: hortis.sanitizeSpeciesName(query.name), phylum: query.phylum, rank: query.rank});
        console.log(result);
        const byId = await source.get({id: result.doc.id});
        console.log(byId);
    } catch (e) {
        console.log("Error performing query ", e);
    }
};

source.events.onCreate.then(testSource);
