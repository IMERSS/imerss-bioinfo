/* global hortis */

"use strict";

fluid.registerNamespace("hortis.tests");

// A miniature dataset - two bee families and two plant orders, each down to species
hortis.tests.taxaRows = [
    {id: "1", rank: "epifamily", iNaturalistTaxonName: "Anthophila"},
    {id: "10", parentId: "1", rank: "family", iNaturalistTaxonName: "Apidae"},
    {id: "11", parentId: "10", rank: "genus", iNaturalistTaxonName: "Bombus"},
    {id: "12", parentId: "11", rank: "species", iNaturalistTaxonName: "Bombus mixtus"},
    {id: "13", parentId: "11", rank: "species", iNaturalistTaxonName: "Bombus vosnesenskii"},
    {id: "20", parentId: "1", rank: "family", iNaturalistTaxonName: "Andrenidae"},
    {id: "21", parentId: "20", rank: "genus", iNaturalistTaxonName: "Andrena"},
    {id: "22", parentId: "21", rank: "species", iNaturalistTaxonName: "Andrena nigrihirta"},
    {id: "47126", rank: "kingdom", iNaturalistTaxonName: "Plantae"},
    {id: "100", parentId: "47126", rank: "order", iNaturalistTaxonName: "Rosales"},
    {id: "101", parentId: "100", rank: "family", iNaturalistTaxonName: "Rosaceae"},
    {id: "102", parentId: "101", rank: "genus", iNaturalistTaxonName: "Rosa"},
    {id: "103", parentId: "102", rank: "species", iNaturalistTaxonName: "Rosa nutkana"},
    {id: "200", parentId: "47126", rank: "order", iNaturalistTaxonName: "Asterales"},
    {id: "201", parentId: "200", rank: "family", iNaturalistTaxonName: "Asteraceae"},
    {id: "202", parentId: "201", rank: "genus", iNaturalistTaxonName: "Solidago"},
    {id: "203", parentId: "202", rank: "species", iNaturalistTaxonName: "Solidago lepida"}
];

hortis.tests.obsRows = [
    {pollinatorINatId: "12", plantINatId: "103", sex: "F", eventDate: "2024-05-10", recordedBy: "Ada Lovelace",
        verbatimElevation: "100", ecoregion: "Willamette Valley", county: "Benton"},
    {pollinatorINatId: "12", plantINatId: "203", sex: "M", eventDate: "2024-07-03", recordedBy: "Ada Lovelace; Charles Babbage",
        verbatimElevation: "900", ecoregion: "Cascades", county: "Linn"},
    {pollinatorINatId: "13", plantINatId: "103", sex: "F", eventDate: "2024-06-15", recordedBy: "Charles Babbage",
        verbatimElevation: "300", ecoregion: "Willamette Valley", county: "Linn"},
    {pollinatorINatId: "22", plantINatId: "203", sex: "F", eventDate: "2024-04-20", recordedBy: "Mary Somerville",
        verbatimElevation: "1500", ecoregion: "Cascades", county: "Benton"},
    {pollinatorINatId: "22", plantINatId: "103", sex: "M", eventDate: "2024-04-22", recordedBy: "Mary Somerville",
        verbatimElevation: "200", ecoregion: "Willamette Valley", county: "Benton"}
];

hortis.tests.regionIndirectionRows = [
    {regionField: "county", id: "Benton", label: "Benton"},
    {regionField: "county", id: "Linn", label: "Linn"},
    {regionField: "ecoregion", id: "Cascades", label: "Cascades"},
    {regionField: "ecoregion", id: "Willamette Valley", label: "Willamette Valley"}
];
