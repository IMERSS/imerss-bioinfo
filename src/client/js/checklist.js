/*
Copyright 2021 Antranig Basman
Licensed under the Educational Community License (ECL), Version 2.0 or the New
BSD license. You may not use this file except in compliance with one these
Licenses.
You may obtain a copy of the ECL 2.0 License and BSD License at
https://github.com/fluid-project/infusion/raw/master/Infusion-LICENSE.txt
*/

"use strict";

var hortis = fluid.registerNamespace("hortis");


hortis.checklistItem = function (entry, selectedId) {
    var record = entry.row;
    // var focusProp = record.focusCount / record.childCount;
    // var interp = fluid.colour.interpolate(focusProp, hortis.checklist.unfocusedColour, hortis.checklist.focusedColour);
    // var styleprop = "style=\"color: " + fluid.colour.arrayToString(interp) + "\"";
    var styleprop = "";
    var rowid = " data-row-id=\"" + record.id + "\"";

    var rank = record.species ? "species" : record.rank;
    var selectedClass = rank === "species" && record.id === selectedId ? " class=\"fl-checklist-selected\"" : "";
    var header = "<li " + selectedClass + ">";
    var name = "<p " + styleprop + rowid + " class=\"flc-checklist-rank-" +
        rank + "\">" + hortis.encodeHTML(record.iNaturalistTaxonName) + "</p>";
    if (record.commonName) {
        name += " - <p " + styleprop + rowid + " class=\"flc-checklist-common-name\">" + record.commonName + "</p>";
    }
    if (record.hulqName) {
        name += " - <p " + styleprop + rowid + " class=\"flc-checklist-hulq-name\"><em>" + record.hulqName + "</em></p>";
    }
    var subList = hortis.checklistList(entry.children);
    var footer = "</li>";
    return header + name + subList + footer;
};

hortis.checklistList = function (entries, selectedId) {
    return entries.length ?
        "<ul>" + entries.map(function (entry) {
            return hortis.checklistItem(entry, selectedId);
        }).join("") + "</ul>" : "";
};

hortis.checklistRowForId = function (that, id) {
    return that.container.find("[data-row-id=" + id + "]").closest("li");
};

// Note that we can't test on layoutId since it is updated asynchronously and in a complex way in hortis.changeLayoutId
// This is the kind of logic that, in the end, makes us want to render with something like Preact
// Could we return component-like things backed by markup snippets? Rather than JSX, use relay-like notation?
hortis.updateChecklistSelection = function (that, newSelectedId, oldSelectedId, index) {
    var oldSelected = hortis.checklistRowForId(that, oldSelectedId);
    oldSelected.removeClass("fl-checklist-selected");
    var row = index[newSelectedId];
    if (row && row.species) {
        var newSelected = hortis.checklistRowForId(that, newSelectedId);
        newSelected.addClass("fl-checklist-selected");
    }
};

// Accepts entries and returns entries
hortis.filterFocused = function (entries) {
    var togo = fluid.transform(entries, function (entry) {
        if (entry.row.focusCount > 0) {
            return {
                row: entry.row,
                children: hortis.filterFocused(entry.children)
            };
        } else {
            return fluid.NO_VALUE;
        }
    }) || [];
    return togo;
};

hortis.acceptChecklistRow = function (row, filterRanks) {
    var acceptBasic = !filterRanks || filterRanks.includes(row.rank) || row.species;
    // Special request from AS - suppress any checklist entry at species level if there are any ssp
    var rejectSpecies = row.rank === "species" && row.children.length > 0;
    return acceptBasic && !rejectSpecies;
};

// Accepts a rows structure and returns "entries"
hortis.filterRanks = function (rows, filterRanks) {
    var togo = [];
    fluid.each(rows, function (row) {
        if (hortis.acceptChecklistRow(row, filterRanks)) {
            togo.push({
                row: row,
                children: hortis.filterRanks(row.children, filterRanks)
            });
        } else {
            var dChildren = hortis.filterRanks(row.children, filterRanks);
            Array.prototype.push.apply(togo, dChildren);
        }
    });
    return togo;
};

hortis.generateChecklist = function (element, rootId, selectedId, index, filterRanks) {
    console.log("Generating checklist for id " + rootId);
    var rootChildren = rootId ? [index[rootId]] : [];
    var filteredRanks = hortis.filterRanks(rootChildren, filterRanks);
    var filteredFocus = hortis.filterFocused(filteredRanks);
    var markup = hortis.checklistList(filteredFocus, selectedId);
    element[0].innerHTML = markup;
};

fluid.defaults("hortis.checklist", {
    gradeNames: ["hortis.withPanelLabel", "fluid.viewComponent"],
    filterRanks: false,
    selectors: {
        hoverable: "p",
        checklist: ".fld-bagatelle-checklist",
        upArrow: ".fld-bagatelle-checklist-up"
    },
    invokers: {
        generateChecklist: {
            funcName: "hortis.generateChecklist",
            args: ["{that}.dom.checklist", "{layoutHolder}.model.layoutId", "{layoutHolder}.model.selectedId",
                "{layoutHolder}.index", "{that}.options.filterRanks"]
        }
    },
    modelListeners: {
        updateSelected: {
            path: ["{layoutHolder}.model.selectedId"],
            args: ["{that}", "{change}.value", "{change}.oldValue", "{layoutHolder}.index"],
            func: "hortis.updateChecklistSelection"
        },
        generateChecklist: {
            path: ["{layoutHolder}.model.layoutId", "{layoutHolder}.model.rowFocus"],
            func: "{that}.generateChecklist"
        },
        arrowClick: {
            path: "dom.upArrow.click",
            funcName: "hortis.checklist.moveUp",
            args: ["{layoutHolder}"]
        }
    },
    modelRelay: {
        source: "{layoutHolder}.model.isAtRoot",
        target: "dom.upArrow.visible",
        func: function (x) {
            return !x;
        }
    },
    listeners: {
        "onCreate.bindHover": "hortis.checklist.bindHover({that}, {layoutHolder})"
    }
});

hortis.checklist.focusedColour = fluid.colour.hexToArray("#333");
hortis.checklist.unfocusedColour = fluid.colour.hexToArray("#ccc");

hortis.checklist.moveUp = function (layoutHolder) {
    var layoutId = layoutHolder.model.layoutId;
    var row = layoutId ? layoutHolder.index[layoutId] : null;
    var parentId = row && row.parent && row.parent.id;
    layoutHolder.events.changeLayoutId.fire(parentId);
};

hortis.checklist.bindHover = function (that, layoutHolder) {
    var hoverable = that.options.selectors.hoverable;
    that.container.on("mouseenter", hoverable, function (e) {
        var id = this.dataset.rowId;
        layoutHolder.mouseEvent = e;
        layoutHolder.applier.change("hoverId", id);
    });
    that.container.on("mouseleave", hoverable, function () {
        layoutHolder.applier.change("hoverId", null);
    });
    that.container.on("click", hoverable, function () {
        var id = this.dataset.rowId;
        layoutHolder.events.changeLayoutId.fire(id);
    });
};

