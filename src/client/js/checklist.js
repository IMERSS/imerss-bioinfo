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


hortis.checklistItem = function (entry, index) {
    var record = entry.row;
    // var focusProp = record.focusCount / record.childCount;
    // var interp = fluid.colour.interpolate(focusProp, hortis.checklist.unfocusedColour, hortis.checklist.focusedColour);
    // var styleprop = "style=\"color: " + fluid.colour.arrayToString(interp) + "\"";
    var styleprop = "";
    var rowid = " data-row-id=\"" + record.id + "\"";

    var rank = record.species ? "species" : record.rank;
    var header = "<li>";
    var name = "<p " + styleprop + rowid + " class=\"flc-checklist-rank-" +
        rank + "\">" + hortis.encodeHTML(record.iNaturalistTaxonName) + "</p>";
    if (record.commonName) {
        name += " - <p " + styleprop + rowid + " class=\"flc-checklist-common-name\">" + record.commonName + "</p>";
    }
    var subList = hortis.checklistList(entry.children, index);
    var footer = "</li>";
    return header + name + subList + footer;
};

hortis.checklistList = function (entries, index) {
    return entries.length ?
        "<ul>" + entries.map(function (entry) {
            return hortis.checklistItem(entry, index);
        }).join("") + "</ul>" : "";
};

hortis.filterChecklist = function (rows, index) {
    var togo = fluid.transform(rows, function (row) {
        if (row.focusCount > 0) {
            return {
                row: row,
                children: hortis.filterChecklist(row.children, index)
            };
        } else {
            return fluid.NO_VALUE;
        }
    }) || [];
    return togo;
};

hortis.generateChecklist = function (element, rootId, index) {
    console.log("Generating checklist for id " + rootId);
    var rootChildren = rootId ? [index[rootId]] : [];
    var filtered = hortis.filterChecklist(rootChildren);
    var markup = hortis.checklistList(filtered, index);
    element[0].innerHTML = markup;
};

fluid.defaults("hortis.checklist", {
    gradeNames: ["fluid.viewComponent"],
    selectors: {
        hoverable: "p",
        checklist: ".fld-bagatelle-checklist",
        upArrow: ".fld-bagatelle-checklist-up"
    },
    invokers: {
        generateChecklist: {
            funcName: "hortis.generateChecklist",
            args: ["{that}.dom.checklist", "{layoutHolder}.model.layoutId", "{layoutHolder}.index"]
        }
    },
    modelListeners: {
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

hortis.checklist.moveUp = function (that) {
    var layoutId = that.model.layoutId;
    var row = layoutId ? that.index[layoutId] : null;
    var parentId = row && row.parent && row.parent.id;
    that.applier.change("layoutId", parentId);
};

hortis.checklist.bindHover = function (that, layoutHolder) {
    var hoverable = that.options.selectors.hoverable;
    that.container.on("mouseenter", hoverable, function () {
        window.clearTimeout(that.leaveTimeout);
        var id = this.dataset.rowId;
        layoutHolder.applier.change("hoverId", id);
    });
    that.container.on("mouseleave", hoverable, function () {
        that.leaveTimeout = window.setTimeout(function () {
            layoutHolder.applier.change("hoverId", null);
        }, 50);
    });
    that.container.on("click", hoverable, function () {
        var id = this.dataset.rowId;
        layoutHolder.applier.change("layoutId", id);
    });
};

