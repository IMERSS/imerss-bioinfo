/*
Copyright 2021 Antranig Basman
Licensed under the Educational Community License (ECL), Version 2.0 or the New
BSD license. You may not use this file except in compliance with one these
Licenses.
You may obtain a copy of the ECL 2.0 License and BSD License at
https://github.com/fluid-project/infusion/raw/master/Infusion-LICENSE.txt
*/

"use strict";

// noinspection ES6ConvertVarToLetConst // otherwise this is a duplicate on minifying
var hortis = fluid.registerNamespace("hortis");

// cf arphify.js line 80 hortis.axeFromName and hortis.qualForming
hortis.sppAnnotations = ["agg.", "aff.", "s.lat.", "cf", "sp.nov.", "var.", "sp.", "ssp.", "spp.", "complex"];
hortis.annoteRegex = new RegExp("(" + hortis.sppAnnotations.map(annot => annot.replace(".", "\\.")).join("|") + ")", "g");

// Render a species name with annotation specially rendered in Roman font
hortis.renderSpeciesName = function (name) {
    return name.replace(hortis.annoteRegex, "<span class=\"flc-checklist-annote\">$1</span>");
};

hortis.checklistItem = function (entry, selectedId, simple) {
    const record = entry.row;
    const styleprop = "";
    const rowid = " data-row-id=\"" + record.id + "\"";
    // Note: "species" really means "has obs" and could be a higher taxon - in the case of a simple checklist
    // we promote e.g. a genus-level obs to species level so it appears inline
    const rank = record.rank && !(simple && record.taxonName) ? record.rank : "species";
    const selectedClass = rank === "species" && record.id === selectedId ? " class=\"fl-checklist-selected\"" : "";
    const header = "<li " + selectedClass + ">";
    const render = rank === "species" ? hortis.renderSpeciesName : fluid.identity;
    let name = "<p " + styleprop + rowid + " class=\"flc-checklist-rank-" +
        rank + "\">" + render(hortis.encodeHTML(hortis.rowToScientific(record))) + "</p>";
    if (record.commonName) {
        name += " - <p " + styleprop + rowid + " class=\"flc-checklist-common-name\">" + record.commonName + "</p>";
    }
    if (record.hulqName) {
        name += " - <p " + styleprop + rowid + " class=\"flc-checklist-hulq-name\"><em>" + record.hulqName + "</em></p>";
    }
    const subList = hortis.checklistList(entry.children, selectedId, simple);
    const footer = "</li>";
    return header + name + subList + footer;
};

hortis.checklistList = function (entries, selectedId, simple) {
    return entries.length ?
        "<ul>" + entries.map(function (entry) {
            return hortis.checklistItem(entry, selectedId, simple);
        }).join("") + "</ul>" : "";
};

hortis.checklistRowForId = function (that, id) {
    return that.container.find("[data-row-id=" + id + "]").closest("li");
};

// Note that we can't test on layoutId since it is updated asynchronously and in a complex way in hortis.changeLayoutId
// This is the kind of logic that, in the end, makes us want to render with something like Preact
// Could we return component-like things backed by markup snippets? Rather than JSX, use relay-like notation?
hortis.updateChecklistSelection = function (that, newSelectedId, oldSelectedId, entryById) {
    // TODO: Since we updated Xetthecum data we are now getting a null selected id on startup
    if (newSelectedId === null) {
        return;
    }
    const oldSelected = hortis.checklistRowForId(that, oldSelectedId);
    oldSelected.removeClass("fl-checklist-selected");
    const row = entryById[newSelectedId].row;
    if (row && row.species) {
        const newSelected = hortis.checklistRowForId(that, newSelectedId);
        newSelected.addClass("fl-checklist-selected");
    }
};

hortis.alwaysRejectRanks = ["subfamily", "tribe", "genus"]; // AS directive of 18/7/23

hortis.acceptChecklistRow = function (row, filterRanks) {
    const acceptBasic = !filterRanks || filterRanks.includes(row.rank) || row.species;
    const alwaysReject = hortis.alwaysRejectRanks.includes(row.rank);
    // Special request from AS - suppress any checklist entry at species level if there are any ssp
    const rejectSpecies = row.rank === "species" && row.children.length > 0;
    // Note: Elaborated understanding - this so-called "genus level record" is actually a species - see elements
    // in document 2nd July 2023
    // "taxonName" being set will be a proxy for "there is an entry in the curated summary" so we always accept
    const acceptChecklist = row.taxonName;
    return acceptBasic && !rejectSpecies && !alwaysReject || acceptChecklist;
};

hortis.rowToScientific = function (row) {
    return row.taxonName || row.iNaturalistTaxonName;
};

hortis.scientificComparator = function (entrya, entryb) {
    return hortis.rowToScientific(entrya.row) > hortis.rowToScientific(entryb.row) ? 1 : -1;
};

hortis.sortChecklistLevel = function (entries) {
    return entries.sort(hortis.scientificComparator);
};

// Accepts array of rows and returns array of "entries", where entry is {row, children: array of entry}
hortis.filterRanks = function (rows, filterRanks, showRoot, depth) {
    const togo = [];
    fluid.each(rows, function (row) {
        if (hortis.acceptChecklistRow(row, filterRanks) || depth === 0 && showRoot) {
            togo.push({
                row: row,
                children: hortis.filterRanks(row.children, filterRanks, depth + 1)
            });
        } else {
            const dChildren = hortis.filterRanks(row.children, filterRanks, depth + 1);
            Array.prototype.push.apply(togo, dChildren);
        }
    });
    return hortis.sortChecklistLevel(togo);
};

hortis.generateChecklist = function (element, layoutHolder, filterRanks, showRoot) {
    const {entryById, filterEntries} = layoutHolder;
    const {layoutId: rootId, selectedId} = layoutHolder.model;

    console.log("Generating checklist for id " + rootId);
    const rootChildren = rootId ? [entryById[rootId].row] : [];
    const filteredRanks = hortis.filterRanks(rootChildren, filterRanks, showRoot, 0);
    const filteredEntries = filterEntries(filteredRanks);
    const markup = hortis.checklistList(filteredEntries, selectedId, filterRanks);
    element[0].innerHTML = markup;
};

fluid.defaults("hortis.checklist", {
    gradeNames: ["hortis.withPanelLabel", "fluid.viewComponent"],
    filterRanks: false, // or array to include
    showRoot: false,
    selectors: {
        hoverable: "p",
        checklist: ".fld-imerss-checklist",
    },
    invokers: {
        generateChecklist: {
            funcName: "hortis.generateChecklist",
            args: ["{that}.dom.checklist", "{layoutHolder}", "{that}.options.filterRanks", "{that}.options.showRoot"]
        }
    },
    modelListeners: {
        updateSelected: {
            path: ["{layoutHolder}.model.selectedId"],
            args: ["{that}", "{change}.value", "{change}.oldValue", "{layoutHolder}.entryById"],
            func: "hortis.updateChecklistSelection"
        },
        generateChecklist: {
            path: ["{layoutHolder}.model.layoutId", "{layoutHolder}.model.rowFocus"],
            func: "{that}.generateChecklist"
        }
    },
    listeners: {
        "onCreate.bindTaxonHover": "hortis.bindTaxonHover({that}, {layoutHolder})"
    }
});

