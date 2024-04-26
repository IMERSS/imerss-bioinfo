/*
Copyright 2023 Antranig Basman
Licensed under the Educational Community License (ECL), Version 2.0 or the New
BSD license. You may not use this file except in compliance with one these
Licenses.
You may obtain a copy of the ECL 2.0 License and BSD License at
https://github.com/fluid-project/infusion/raw/master/Infusion-LICENSE.txt
*/

/* global preactSignalsCore */

"use strict";

// noinspection ES6ConvertVarToLetConst // otherwise this is a duplicate on minifying
var hortis = fluid.registerNamespace("hortis");

//
// noinspection ES6ConvertVarToLetConst
var {signal, effect} = preactSignalsCore; // eslint-disable-line no-unused-vars

// cf arphify.js line 80 hortis.axeFromName and hortis.qualForming
hortis.sppAnnotations = ["agg.", "aff.", "s.lat.", "cf", "sp.nov.", "var.", "sp.", "ssp.", "spp.", "complex"];
hortis.annoteRegex = new RegExp("(" + hortis.sppAnnotations.map(annot => annot.replace(".", "\\.")).join("|") + ")", "g");

// Render a species name with annotation specially rendered in Roman font
hortis.renderSpeciesName = function (name) {
    return name.replace(hortis.annoteRegex, "<span class=\"checklist-annote\">$1</span>");
};

// Duplicate from renderSVG.js so we don't need to rebuild temporarily whilst we work on Xetthecum
hortis.encodeHTML = function (str) {
    return str.replace(/[&<>'"]/g, function (tag) {
        return {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            "'": "&#39;",
            "\"": "&quot;"
        }[tag];
    });
};

hortis.rowToScientific = function (row) {
    return row.taxonName || row.iNaturalistTaxonName;
};

hortis.checklistItem = function (entry, selectedId, simple, selectable) {
    const record = entry.row;
    const styleprop = "";
    const rowid = ` data-row-id="${record.id}"`;
    // Note: "species" really means "has obs " and could be a higher taxon - in the case of a simple checklist
    // we promote e.g. a genus-level obs to species level so it appears inline
    const rank = record.rank && !(simple && record.taxonName) ? record.rank : "species";
    const selectedClass = rank === "species" && record.id === selectedId ? " class=\"checklist-selected\"" : "";
    const header = "<li " + selectedClass + ">";
    const render = rank === "species" ? hortis.renderSpeciesName : fluid.identity;
    let name = "<p " + styleprop + rowid + " class=\"checklist-rank-" +
        rank + "\">" + render(hortis.encodeHTML(hortis.rowToScientific(record))) + "</p>";
    if (record.commonName) {
        name += " - <p " + styleprop + rowid + " class=\"checklist-common-name\">" + record.commonName + "</p>";
    }
    const hulqName = record["Hulquminum Name"];
    if (hulqName) {
        name += " - <p " + styleprop + rowid + " class=\"checklist-hulq-name\"><em>" + hulqName + "</em></p>";
    }
    const subList = hortis.checklistList(entry.children, selectedId, simple, selectable);
    const footer = "</li>";
    const check = (selectable ? hortis.rowCheckbox(rowid) : "");
    return header + check + name + subList + footer;
};

hortis.checklistList = function (entries, selectedId, simple, selectable) {
    return entries.length ?
        "<ul>" + entries.map(function (entry) {
            return hortis.checklistItem(entry, selectedId, simple, selectable);
        }).join("") + "</ul>" : "";
};

hortis.checklistRowForId = function (container, id) {
    return container.find("[data-row-id=" + id + "]").closest("li");
};

// Note that we can't test on layoutId since it is updated asynchronously and in a complex way in hortis.changeLayoutId
// This is the kind of logic that, in the end, makes us want to render with something like Preact
// Could we return component-like things backed by markup snippets? Rather than JSX, use relay-like notation?
hortis.updateChecklistSelection = function (container, newSelectedId, oldSelectedId, rowById) {
    // TODO: Since we updated Xetthecum data we are now getting a null selected id on startup
    if (newSelectedId === null) {
        return;
    }
    const oldSelected = hortis.checklistRowForId(container, oldSelectedId);
    oldSelected.removeClass("checklist-selected");
    const row = rowById[newSelectedId];
    if (row && row.species) {
        const newSelected = hortis.checklistRowForId(container, newSelectedId);
        newSelected.addClass("checklist-selected");
    }
};

hortis.alwaysRejectRanks = [];
// We used to have
// ["subfamily", "tribe", "genus"]; // AS directive of 18/7/23
// which doubtless makes no sense in the new world

// Variety of acceptChecklistRow following work with Andrew Simon where the importance is on the number of resolved
// entities - as a result there are rules such as not producing a genus level entry if any are resolved to species level
hortis.acceptChecklistRowAS = function (row, filterRanks, rowFocus) {
    const acceptBasic = !filterRanks || filterRanks.includes(row.rank) || row.species;
    const alwaysReject = hortis.alwaysRejectRanks.includes(row.rank);
    // Special request from AS - suppress any checklist entry at species level if there are any ssp
    const rejectSpecies = row.rank === "species" && row.children.length > 0;
    // Note: Elaborated understanding - this so-called "genus level record" is actually a species - see elements
    // in document 2nd July 2023
    // "taxonName" being set will be a proxy for "there is an entry in the curated summary" so we always accept
    const acceptChecklist = row.taxonName;
    return rowFocus[row.id] && (acceptBasic && !rejectSpecies && !alwaysReject || acceptChecklist);
};

hortis.acceptChecklistRowOBA = function (row, filterRanks, idToState, rowFocus) {
    const acceptBasic = !filterRanks || filterRanks.includes(row.rank);
    const alwaysReject = hortis.alwaysRejectRanks.includes(row.rank);
    return rowFocus[row.id] && acceptBasic && !alwaysReject;
};

hortis.scientificComparator = function (entrya, entryb) {
    return hortis.rowToScientific(entrya.row) > hortis.rowToScientific(entryb.row) ? 1 : -1;
};

hortis.sortChecklistLevel = function (entries) {
    return entries.sort(hortis.scientificComparator);
};

// Accepts array of rows and returns fresh array of "entries", where entry is {row, children: array of entry}
hortis.filterTaxonomy = function (rows, depth, acceptChecklistRow, filterTaxonomy, showRoot) {
    const togo = [];
    fluid.each(rows, function (row) {
        if (acceptChecklistRow(row) || depth === 0 && showRoot) {
            togo.push({
                row: row,
                children: filterTaxonomy(row.children, depth + 1)
            });
        } else {
            const dChildren = filterTaxonomy(row.children, depth + 1);
            Array.prototype.push.apply(togo, dChildren);
        }
    });
    return hortis.sortChecklistLevel(togo);
};

hortis.SELECTED = 1;
hortis.UNSELECTED = 0;
hortis.INDETERMINATE = -1;

fluid.defaults("hortis.checklist", {
    gradeNames: ["hortis.withPanelLabel", "fluid.viewComponent"],
    filterRanks: false, // or array to include - if set, counts as "simple"
    showRoot: false,
    selectable: false,
    selectors: {
        hoverable: "p",
        checklist: ".imerss-checklist"
    },
    invokers: {
        acceptChecklistRow: {
            funcName: "hortis.acceptChecklistRowAS",
            //     row
            args: ["{arguments}.0", "{that}.options.filterRanks", "{that}.rowFocus.value"]
        },
        filterTaxonomy: {
            funcName: "hortis.filterTaxonomy",
            //     rows            , depth
            args: ["{arguments}.0", "{arguments}.1", "{that}.acceptChecklistRow", "{that}.filterTaxonomy", "{that}.options.showRoot"]
        },
        generateChecklist: {
            funcName: "hortis.checklist.generate",
            args: ["{that}", "{that}.dom.checklist", "{layoutHolder}", "{that}.filterTaxonomy", "{that}.options.filterRanks", "{arguments}.0"]
        },
        check: "hortis.checklist.check({that}, {arguments}.0, {arguments}.1)"
    },
    members: {
        idToState: "@expand:signal({})",
        // cache of old value used during generateChecklist render cycle
        // rowById: required for tooltips
        // rowFocus
        oldIdToState: {},
        rowSelection: "@expand:fluid.computed(hortis.checklist.checksToSelection, {checklist}.idToState)",
        subscribeChecks: "@expand:hortis.checklist.subscribeChecks({that}.idToState, {that})",
        subscribeSelected: "@expand:hortis.checklist.subscribeSelected({that}, {that}.selectedId, {that}.rowById)",
        subscribeGenerate: "@expand:hortis.checklist.subscribeGenerate({that}, {that}.rootId, {that}.selectedId, {that}.rowFocus, {that}.rowById)"
    },
    listeners: {
        "onCreate.bindTaxonHover": "hortis.bindTaxonHover({that}, {layoutHolder})",
        "onCreate.bindCheckboxClick": "hortis.checklist.bindCheckboxClick({that})"
    }
});

fluid.defaults("hortis.checklist.withOBA", {
    invokers: {
        acceptChecklistRow: {
            funcName: "hortis.acceptChecklistRowOBA",
            //     row
            args: ["{arguments}.0", "{that}.options.filterRanks", "{that}.oldIdToState", "{that}.rowFocus.value"]
        }
    }
});

hortis.checklist.bindCheckboxClick = function (checklist) {
    checklist.container.on("click", ".pretty input", function () {
        const id = this.dataset.rowId;
        fluid.log("Checkbox clicked with row " + id);
        checklist.check(id, this.checked);
        // checklist.applier.change(["idToState", id], this.checked);
    });
};

// This used to read:
// modelToCheck: {
//     path: "idToState.*",
//         func: "hortis.checklist.stateToCheck",
//         args: ["{that}", "{change}.value", "{change}.path"]
// }

hortis.checklist.subscribeChecks = function (idToStateSignal, checklist) {
    let oldIdToState = undefined;
    return effect( () => {
        const newIdToState = idToStateSignal.value;
        fluid.each(newIdToState, (newState, id) => {
            const oldState = oldIdToState[id];
            if (newState !== oldState) {
                hortis.checklist.stateToCheck(checklist, newState, id);
            }
        });
        oldIdToState = newIdToState;
    });
};

// This used to read:
//         updateSelected: {
//             path: ["{layoutHolder}.model.selectedId"],
//             args: ["{that}", "{change}.value", "{change}.oldValue", "{layoutHolder}.model.rowById"],
//             func: "hortis.updateChecklistSelection"
//         },
hortis.checklist.subscribeSelected = function (that, selectedIdSignal, rowByIdSignal) {
    let oldSelectedId = undefined;
    return effect( () => {
        const newSelectedId = selectedIdSignal.value;
        hortis.updateChecklistSelection(that.container, newSelectedId, oldSelectedId, rowByIdSignal.peek());
        oldSelectedId = newSelectedId;
    });
};

// This used to read:
// generateChecklist: {
//     path: ["{layoutHolder}.model.layoutId", "{layoutHolder}.model.rowFocus", "{layoutHolder}.model.rowById"],
//         func: "{that}.generateChecklist"
// },
hortis.checklist.subscribeGenerate = function (that, rootIdSignal, selectedIdSignal, rowFocusSignal, rowByIdSignal) {
    return effect( () => {
        // note that this reads selectedId but does not depend on it because of rendering optimisation
        const rootId = rootIdSignal.value,
            selectedId = selectedIdSignal.value,
            rowFocus = rowFocusSignal.value,
            rowById = rowByIdSignal.value;

        const model = {rootId, selectedId, rowFocus, rowById};
        that.generateChecklist(model);
        // Writes: idToEntry, idToNode, idToState
        // idToNode is a cache just used in stateToCheck, no need to signalise it
        // Updates signal idToState
    });
};

hortis.checklist.stateToCheck = function (checklist, state, id) {
    const node = checklist.idToNode?.[id];
    if (node) {
        node.checked = state === hortis.SELECTED;
        node.indeterminate = state === hortis.INDETERMINATE;
        const holder = node.closest(".p-icon");
        const ui = holder.querySelector(".icon");
        $(ui).toggleClass("mdi-check", state !== hortis.INDETERMINATE);
    }
};

hortis.checklist.generate = function (that, element, layoutHolder, filterTaxonomy, simple, model) {
    const {rootId, selectedId, rowFocus, rowById} = model;
    const selectable = that.options.selectable;

    fluid.log("Generating checklist for id " + rootId);
    // Don't read it to avoid creating a cycle since we are likely already in an effect
    that.oldIdToState = that.idToState.peek();
    const rootChildren = fluid.makeArray(rowById[rootId]);
    const filteredEntries = filterTaxonomy(rootChildren, 0);
    that.rootEntry = {row: {id: hortis.checklist.ROOT_ID}, children: filteredEntries};
    if (selectable) {
        const {idToEntry, idToState} = hortis.checklist.computeInitialModel(that.rootEntry, rowFocus, that.oldIdToState);
        that.idToEntry = idToEntry;
        that.idToState.value = idToState;
    }

    const markup = hortis.checklistList(filteredEntries, selectedId, simple, selectable);
    element[0].innerHTML = markup;
    if (selectable) {
        const checks = element[0].querySelectorAll(".checklist-check");
        const idToNode = {};
        checks.forEach(check => idToNode[check.dataset.rowId] = check);
        that.idToNode = idToNode;
    }
};

hortis.checklist.allChildrenState = function (idToState, entry, state) {
    return entry.children.find(child => idToState[child.row.id] !== state) === undefined;
};

// In-DOM variants of this algorithm at https://css-tricks.com/indeterminate-checkboxes/
// From reacting to an individual checkbox click, compute the full idToState signal
hortis.checklist.check = function (checklist, id, checked) {
    const idToStateUp = {...checklist.idToState.value};
    const upState = checked ? hortis.SELECTED : hortis.UNSELECTED;
    const entry = checklist.idToEntry[id];
    // Traverse downward, cascading selected/unselected flag
    const setChildState = function (entry, state) {
        idToStateUp[entry.row.id] = state;
        entry.children.forEach(child => setChildState(child, state));
    };

    // Traverse upward, cascading indeterminate as well as flag
    setChildState(entry, upState);

    let parent = entry.parent;
    while (parent) {
        const allChildrenState = hortis.checklist.allChildrenState(idToStateUp, parent, upState);
        idToStateUp[parent.row.id] = allChildrenState ? upState : hortis.INDETERMINATE;
        parent = parent.parent;
    }
    checklist.idToState.value = idToStateUp;
};

// A fake ID to hold the checklist's root so we can display a polyphyletic set
hortis.checklist.ROOT_ID = Number.NEGATIVE_INFINITY;

hortis.checklist.computeInitialModel = function (rootEntry, rowFocus, oldIdToState) {
    const idToState = {},
        idToEntry = {};
    const indexEntry = function (entry, parent) {
        const id = entry.row.id;
        if (!id) {
            fluid.log("Warning, discarding row ", entry.row, " without id set");
        } else if (rowFocus[id]) {
            idToState[id] = oldIdToState[id] || hortis.UNSELECTED;
            idToEntry[id] = entry;
        }
        entry.parent = parent;
        entry.children.forEach(childEntry => indexEntry(childEntry, entry));
    };
    indexEntry(rootEntry);
    return {idToEntry, idToState};
};

fluid.defaults("hortis.checklist.withHolder", {
    gradeNames: ["hortis.layoutHolder", "hortis.checklist"]
});

// From the individual signals of each checkbox, compute the effective rowSelection - taking into account the "no selection is all selection" idiom
hortis.checklist.checksToSelection = function (idToState) {
    const selection = {};
    const selectAll = {};
    let selected = 0;
    fluid.each(idToState, (state, key) => {
        if (state === hortis.SELECTED) {
            ++selected;
            selection[key] = true;
        }
        selectAll[key] = true;
    });
    return selected === 0 ? selectAll : selection;
};
