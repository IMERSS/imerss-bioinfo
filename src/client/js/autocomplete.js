/*
Copyright 2018 Antranig Basman
Licensed under the Educational Community License (ECL), Version 2.0 or the New
BSD license. You may not use this file except in compliance with one these
Licenses.
You may obtain a copy of the ECL 2.0 License and BSD License at
https://github.com/fluid-project/infusion/raw/master/Infusion-LICENSE.txt
*/
"use strict";

var hortis = fluid.registerNamespace("hortis");

fluid.defaults("hortis.autocomplete", {
    gradeNames: ["fluid.newViewComponent"],
    listeners: {
        "onCreate.render": "hortis.autocomplete.render"
    },
    invokers: {
        query: "hortis.autocomplete.emptyQuery"
    },
    widgetOptions: {
        displayMenu: "overlay"
    }
});

hortis.autocomplete.emptyQuery = function (query, callback) {
    callback("");
};

hortis.autocomplete.render = function (that) {
    var widgetOptions = $.extend({
        element: that.container[0],
        id: that.options.id,
        source: that.query
    }, that.options.widgetOptions);
    that.widget = accessibleAutocomplete(widgetOptions);
};