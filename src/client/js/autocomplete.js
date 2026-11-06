/*
Copyright 2018 Antranig Basman
Licensed under the Educational Community License (ECL), Version 2.0 or the New
BSD license. You may not use this file except in compliance with one these
Licenses.
You may obtain a copy of the ECL 2.0 License and BSD License at
https://github.com/fluid-project/infusion/raw/master/Infusion-LICENSE.txt
*/

/* global accessibleAutocomplete */

"use strict";

var hortis = fluid.registerNamespace("hortis");

fluid.defaults("hortis.autocomplete", {
    gradeNames: ["fluid.newViewComponent"],
    // id: Must be supplied to forward to autocomplete constructor
    listeners: {
        "onCreate.render": "hortis.autocomplete.render"
    },
    events: {
        onConfirm: null
    },
    maxSuggestions: 20,
    invokers: {
        query: "hortis.autocomplete.emptyQuery",
        renderSuggestion: "fluid.identity",
        renderInputValue: "fluid.identity",
        setSelection: "hortis.autocomplete.setSelection({that}, {arguments}.0)"
    },
    widgetOptions: {
        displayMenu: "overlay",
        confirmOnBlur: false
    }
});

hortis.autocomplete.emptyQuery = function (query, callback) {
    callback("");
};

/**
 * Set the selection displayed by the widget from outside it, leaving it in the same state as if the user had picked
 * this option from its menu and then moved focus away. The widget is an uncontrolled preact component whose constructor
 * returns nothing, so we have to reach for the instance that preact 8 stores on its root node. Simply updating the
 * input's value won't do since the widget polls for this and treats it as typing, which would open its menu.
 * @param {fluid.component} that - The autocomplete component
 * @param {any} option - The option to be selected, as supplied by the component's query
 */
hortis.autocomplete.setSelection = function (that, option) {
    const widget = that.container[0].querySelector(".autocomplete__wrapper")._component;
    widget.setState({
        focused: null,
        hovered: null,
        menuOpen: false,
        options: [option],
        query: that.renderInputValue(option),
        selected: null,
        validChoiceMade: true
    });
};

hortis.autocomplete.render = function (that) {
    const widgetOptions = $.extend({
        element: that.container[0],
        id: that.options.id,
        source: that.query,
        templates: {
            suggestion: that.renderSuggestion,
            inputValue: that.renderInputValue
        },
        onConfirm: that.events.onConfirm.fire
    }, that.options.widgetOptions);
    that.widget = accessibleAutocomplete(widgetOptions);
    // TODO: another one for the bestiary of reuse failures
    $("input", that.container).attr("spellcheck", false);
};
