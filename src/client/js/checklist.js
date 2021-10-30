/*
Copyright 2017 Antranig Basman
Licensed under the Educational Community License (ECL), Version 2.0 or the New
BSD license. You may not use this file except in compliance with one these
Licenses.
You may obtain a copy of the ECL 2.0 License and BSD License at
https://github.com/fluid-project/infusion/raw/master/Infusion-LICENSE.txt
*/

"use strict";

var hortis = fluid.registerNamespace("hortis");


hortis.checklistItem = function (id, index) {
    var record = index[id];
    var focusProp = record.focusCount / record.childCount;
    var interp = fluid.colour.interpolate(focusProp, hortis.checklist.unfocusedColour, hortis.checklist.focusedColour);
    var styleprop = "style=\"color: " + fluid.colour.arrayToString(interp) + "\"";
    var rowid = " data-row-id=\"" + id + "\"";

    var rank = record.species ? "species" : record.rank;
    var header = "<li>";
    var name = "<p " + styleprop + rowid + " class=\"flc-checklist-rank-" +
        rank + "\">" + hortis.encodeHTML(record.iNaturalistTaxonName) + "</p>";
    if (record.commonName) {
        name += " - <p " + styleprop + rowid + " class=\"flc-checklist-common-name\">" + record.commonName + "</p>"; 
    }
    var subList = hortis.checklistList(record.children, index);
    var footer = "</li>";
    return header + name + subList + footer;
};

hortis.checklistList = function (children, index) {
    return children && children.length ?
        "<ul>" + children.map(function (child) {
            return hortis.checklistItem(child.id, index);
        }).join("") + "</ul>" : "";  
};

hortis.generateChecklist = function (element, rootId, index) {
    console.log("Generating checklist for id " + rootId);
    var rootChildren = rootId ? [index[rootId]] : [];
    var markup = hortis.checklistList(rootChildren, index);
    element[0].innerHTML = markup;
};

fluid.defaults("hortis.checklist", {
    gradeNames: ["fluid.viewComponent"],
    selectors: {
        hoverable: "p",
        checklist: ".fld-bagatelle-checklist",
        upArrow: ".fld-bagatelle-checklist-up"
    },
    modelListeners: {
        layoutId: {
            funcName: "hortis.generateChecklist",
            args: ["{that}.dom.checklist", "{change}.value", "{checklist}.index"]
        },
        arrowClick: {
            path: "dom.upArrow.click",
            funcName: "hortis.checklist.moveUp",
            args: ["{that}"]
        }
    },
    modelRelay: {
        source: "isAtRoot",
        target: "dom.upArrow.visible",
        func: function (x) {
            return !x;
        } 
    },
    listeners: {
        "onCreate.bindHover": "hortis.checklist.bindHover"
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

hortis.checklist.bindHover = function (that) {
    var hoverable = that.options.selectors.hoverable;
    that.container.on("mouseenter", hoverable, function (e) {
        window.clearTimeout(that.leaveTimeout);
        var id = this.dataset.rowId;
        that.applier.change("hoverId", id);
    });
    that.container.on("mouseleave", hoverable, function (e) {
        that.leaveTimeout = window.setTimeout(function () {
            that.mouseEvent = e;
            that.applier.change("hoverId", null);
        }, 50);
    });
    that.container.on("click", hoverable, function (e) {
        var id = this.dataset.rowId;
        that.applier.change("layoutId", id);
    });
};

