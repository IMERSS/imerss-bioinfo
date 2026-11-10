/*
Copyright 2025-2026 Antranig Basman
Licensed under the Educational Community License (ECL), Version 2.0 or the New
BSD license. You may not use this file except in compliance with one these
Licenses.
You may obtain a copy of the ECL 2.0 License and BSD License at
https://github.com/fluid-project/infusion/raw/master/Infusion-LICENSE.txt
*/

"use strict";

// Functions specific to plant taxa, which a project's configuration may name - e.g. as the `valueOf` of a
// hortis.valueFilter

// noinspection ES6ConvertVarToLetConst // otherwise this is a duplicate on minifying
var hortis = fluid.registerNamespace("hortis");

hortis.isGraminoid = function (taxonRow) {
    let row = taxonRow;
    while (row && !(row.rank === "family" && ["Poaceae", "Cyperaceae", "Juncaceae"].includes(row.iNaturalistTaxonName))) {
        row = row.parent;
    }
    return !!row;
};

// A value for a filter of taxa by whether they are graminoids - grasses, sedges and rushes
hortis.graminoidValue = row => hortis.isGraminoid(row) ? "graminoid" : "non-graminoid";
