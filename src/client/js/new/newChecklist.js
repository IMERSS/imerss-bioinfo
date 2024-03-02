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

// In indeterminate state, add p-is-indeterminate to div state
// In indeterminate state remove mdi-check from i

hortis.checklistCheckbox = function (rowid) {
    return `
    <span class="pretty p-icon">
      <input type="checkbox" class="flc-checklist-check" ${rowid}/>
      <span class="state p-success">
        <i class="icon mdi mdi-check"></i>
        <label></label>
      </span>
    </span>`;
};

hortis.checklistItem = function (entry, selectedId, simple, selectable) {
    const record = entry.row;
    const styleprop = "";
    const rowid = " data-row-id=\"" + record.id + "\"";
    // Note: "species" really means "has obs " and could be a higher taxon - in the case of a simple checklist
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
    const subList = hortis.checklistList(entry.children, selectedId, simple, selectable);
    const footer = "</li>";
    const check = (selectable ? hortis.checklistCheckbox(rowid) : "");
    return header + check + name + subList + footer;
};

hortis.checklistList = function (entries, selectedId, simple, selectable) {
    return entries.length ?
        "<ul>" + entries.map(function (entry) {
            return hortis.checklistItem(entry, selectedId, simple, selectable);
        }).join("") + "</ul>" : "";
};

hortis.checklistRowForId = function (that, id) {
    return that.container.find("[data-row-id=" + id + "]").closest("li");
};

// Note that we can't test on layoutId since it is updated asynchronously and in a complex way in hortis.changeLayoutId
// This is the kind of logic that, in the end, makes us want to render with something like Preact
// Could we return component-like things backed by markup snippets? Rather than JSX, use relay-like notation?
hortis.updateChecklistSelection = function (that, newSelectedId, oldSelectedId, rowById) {
    // TODO: Since we updated Xetthecum data we are now getting a null selected id on startup
    if (newSelectedId === null) {
        return;
    }
    const oldSelected = hortis.checklistRowForId(that, oldSelectedId);
    oldSelected.removeClass("fl-checklist-selected");
    const row = rowById[newSelectedId];
    if (row && row.species) {
        const newSelected = hortis.checklistRowForId(that, newSelectedId);
        newSelected.addClass("fl-checklist-selected");
    }
};

hortis.alwaysRejectRanks = [];
// We used to have
// ["subfamily", "tribe", "genus"]; // AS directive of 18/7/23
// which doubtless makes no sense in the new world

// Variety of acceptChecklistRow following work with Andrew Simon where the importance is on the number of resolved
// entities - as a result there are rules such as not producing a genus level entry if any are resolved to species level
hortis.acceptChecklistRowAS = function (row, filterRanks) {
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
    selectors: {
        hoverable: "p",
        checklist: ".fld-imerss-checklist"
    },
    invokers: {
        acceptChecklistRow: {
            funcName: "hortis.acceptChecklistRowAS",
            //     row
            args: ["{arguments}.0", "{that}.options.filterRanks"]
        },
        filterTaxonomy: {
            funcName: "hortis.filterTaxonomy",
            //     rows            , depth
            args: ["{arguments}.0", "{arguments}.1", "{that}.acceptChecklistRow", "{that}.filterTaxonomy", "{that}.options.showRoot"]
        },
        generateChecklist: {
            funcName: "hortis.checklist.generate",
            args: ["{that}", "{that}.dom.checklist", "{layoutHolder}", "{that}.filterTaxonomy", "{that}.options.filterRanks"]
        },
        check: "hortis.checklist.check({that}, {arguments}.0, {arguments}.1)"
    },
    modelListeners: {
        updateSelected: {
            path: ["{layoutHolder}.model.selectedId"],
            args: ["{that}", "{change}.value", "{change}.oldValue", "{layoutHolder}.model.rowById"],
            func: "hortis.updateChecklistSelection"
        },
        generateChecklist: {
            path: ["{layoutHolder}.model.layoutId", "{layoutHolder}.model.rowFocus", "{layoutHolder}.model.rowById"],
            func: "{that}.generateChecklist"
        },
        modelToCheck: {
            path: "idToState.*",
            func: "hortis.checklist.stateToCheck",
            args: ["{that}", "{change}.value", "{change}.path"]
        }
    },
    listeners: {
        "onCreate.bindTaxonHover": "hortis.bindTaxonHover({that}, {layoutHolder})",
        "onCreate.bindClick": "hortis.checklist.bindClick({that})"
    }
});

hortis.checklist.bindClick = function (checklist) {
    checklist.container.on("click", ".pretty input", function () {
        const id = this.dataset.rowId;
        console.log("Checkbox clicked with row " + id);
        checklist.check(id, this.checked);
        // checklist.applier.change(["idToState", id], this.checked);
    });
};

hortis.checklist.stateToCheck = function (checklist, state, path) {
    const id = fluid.peek(path);
    const node = checklist.idToNode?.[id];
    if (node) {
        node.checked = state === hortis.SELECTED;
        node.indeterminate = state === hortis.INDETERMINATE;
        const holder = node.closest(".p-icon");
        const ui = holder.querySelector(".icon");
        $(ui).toggleClass("mdi-check", state !== hortis.INDETERMINATE);
    }
};

hortis.checklist.generate = function (that, element, layoutHolder, filterTaxonomy, simple) {
    const {layoutId: rootId, selectedId, rowById} = layoutHolder.model;

    console.log("Generating checklist for id " + rootId);
    const rootChildren = fluid.makeArray(rowById[rootId]);
    const filteredRanks = filterTaxonomy(rootChildren, 0);
    const filteredEntries = layoutHolder.filterEntries(filteredRanks);
    that.rootEntry = {row: {id: hortis.checklist.ROOT_ID}, children: filteredEntries};
    const {idToEntry, allRowFocus, model} = hortis.checklist.computeInitialModel(that.rootEntry);
    that.idToEntry = idToEntry;
    that.allRowFocus = allRowFocus; // Must do this first because checksToSelection will read it

    that.applier.change([], model);

    const markup = hortis.checklistList(filteredEntries, selectedId, simple, true);
    element[0].innerHTML = markup;
    const checks = element[0].querySelectorAll(".flc-checklist-check");
    const idToNode = {};
    checks.forEach(check => idToNode[check.dataset.rowId] = check);
    that.idToNode = idToNode;
};

hortis.checklist.allChildrenState = function (idToState, entry, state) {
    return entry.children.find(child => idToState[child.row.id] !== state) === undefined;
};

// In-DOM variants of this algorithm at https://css-tricks.com/indeterminate-checkboxes/
hortis.checklist.check = function (checklist, id, checked) {
    const idToStateUp = {...checklist.model.idToState};
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
    checklist.applier.change(["idToState"], idToStateUp);

};

// A fake ID to hold the checklist's root so we can display a polyphyletic set
hortis.checklist.ROOT_ID = Number.NEGATIVE_INFINITY;

hortis.checklist.computeInitialModel = function (rootEntry) {
    const selectedCount = 0,
        idToState = {},
        idToEntry = {},
        allRowFocus = {};
    const indexEntry = function (entry, parent) {
        const id = entry.row.id;
        if (!id) {
            console.log("Warning, discarding row ", entry.row, " without id set");
        } else {
            idToState[id] = hortis.UNSELECTED;
            idToEntry[id] = entry;
            allRowFocus[id] = true;
        }
        entry.parent = parent;
        entry.children.forEach(childEntry => indexEntry(childEntry, entry));
    };
    indexEntry(rootEntry);
    return {idToEntry, allRowFocus, model: {idToState, selectedCount}};
};

fluid.defaults("hortis.checklist.withHolder", {
    gradeNames: ["hortis.layoutHolder", "hortis.checklist"],
    invokers: {
        filterEntries: "{vizLoader}.filterEntries"
    },
    modelListeners: {
        // Can't use modelRelay because of https://issues.fluidproject.org/browse/FLUID-6208
        checklistSelection: {
            path: ["{checklist}.model.idToState", "{checklist}.model.rowFocus"],
            func: "hortis.checklist.checksToSelection",
            args: ["{checklist}.model.idToState", "{checklist}.model.rowFocus", "{checklist}"],
            excludeSource: "init"
        }
    }
});

// TODO: Get layoutHolder to compute allRowFocus
hortis.checklist.checksToSelection = function (idToState, rowFocus, checklist) {
    const selection = {};
    let selected = 0;
    fluid.each(idToState, (state, key) => {
        if (state === hortis.SELECTED) {
            ++selected;
            selection[key] = true;
        }
    });
    const anyRowFocus = !$.isEmptyObject(rowFocus);
    const rowSelection = selected === 0 ? (anyRowFocus ? {...rowFocus} : checklist.allRowFocus) : selection;
    fluid.replaceModelValue(checklist.applier, "rowSelection", rowSelection);
};
