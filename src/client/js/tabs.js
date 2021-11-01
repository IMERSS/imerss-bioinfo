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

/**********************
 * Tabs *
 *********************/

fluid.defaults("hortis.tabs", {
    gradeNames: ["fluid.viewComponent"],
    tabOptions: {},
    model: {
        selectedTab: null
    },
    listeners: {
        "onCreate.initTabs": {
            "this": "{that}.container",
            "method": "tabs",
            "args": "{that}.options.tabOptions"
        },
        "onCreate.bindEvents": {
            funcName: "hortis.tabs.bindEvents"
        }
    }
});

hortis.tabs.findTab = function (that, tabId) {
    return fluid.find(that.options.tabIds, function (id, key) {
        return id === tabId ? key : undefined;
    });
};

hortis.tabs.bindEvents = function (that) {
    that.container.on("tabsactivate", function (event, ui) {
        var tabId = ui.newTab.find("a").attr("href").substring(1);
        var tab = hortis.tabs.findTab(that, tabId);
        that.applier.change("selectedTab", tab);
    });
    var initialIndex = Object.keys(that.options.tabIds).indexOf(that.model.selectedTab);
    if (initialIndex !== -1) {
        that.container.tabs("option", "active", initialIndex);
    }
};
