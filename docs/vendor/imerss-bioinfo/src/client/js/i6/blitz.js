/*
Copyright 2025-2026 Antranig Basman
Licensed under the Educational Community License (ECL), Version 2.0 or the New
BSD license. You may not use this file except in compliance with one these
Licenses.
You may obtain a copy of the ECL 2.0 License and BSD License at
https://github.com/fluid-project/infusion/raw/master/Infusion-LICENSE.txt
*/

"use strict";

// The reporting status of taxa in a BioBlitz or bioReportR project - whether a historical record has been confirmed
// by a project contributor, or remains unconfirmed, or whether the taxon is a new report - shared by the BioBlitz
// visualisation and the story page

// noinspection ES6ConvertVarToLetConst // otherwise this is a duplicate on minifying
var hortis = fluid.registerNamespace("hortis");

/**
 * Classify the reporting status of each taxon as "confirmed", "unconfirmed" or "new".
 * @param {Object<String, TaxonRow>} rowById - Map of taxon id to taxon row, each with a `reportingStatus`
 * @return {Object<String, String>} Map of taxon id to its status, for the taxa which have one
 */
hortis.reportingStatusById = function (rowById) {
    const togo = {};
    Object.values(rowById).forEach(row => {
        const reportingStatus = row.reportingStatus || "";
        if (reportingStatus === "confirmed") {
            togo[row.id] = "confirmed";
        } else if (reportingStatus === "reported" || reportingStatus === "unconfirmed") {
            togo[row.id] = "unconfirmed";
        } else if (reportingStatus.startsWith("new")) {
            togo[row.id] = "new";
        }
    });
    return togo;
};

hortis.blitzChecklistDecorations = {
    confirmed: {symbol: "tick", title: "Confirmed: This historical record has been confirmed by a project contributor"},
    unconfirmed: {symbol: "question", title: "Unconfirmed: This historical record is yet to be confirmed by a project contributor"},
    new: {symbol: "exclamation", title: "New: This record is a new report from a project contributor"}
};

/**
 * Decorate a checklist row with an icon showing its taxon's reporting status, if it has one.
 * @param {TaxonRow} row - The checklist's taxon row
 * @return {VNode|null} The icon, or null if the taxon has no reporting status
 */
hortis.blitzChecklistDecoration = function (row) {
    const status = hortis.reportingStatusById({[row.id]: row})[row.id];
    const decoration = hortis.blitzChecklistDecorations[status];
    return decoration ? {tag: "svg", attrs: {width: "18", height: "18", "class": "imerss-checklist-decoration"}, children: [
        {tag: "title", attrs: {}, children: [{text: decoration.title}]},
        {tag: "use", attrs: {href: "#" + decoration.symbol}, children: []}
    ]} : null;
};
