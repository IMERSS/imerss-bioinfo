/*
Copyright 2017-2026 Antranig Basman
Licensed under the Educational Community License (ECL), Version 2.0 or the New
BSD license. You may not use this file except in compliance with one these
Licenses.
You may obtain a copy of the ECL 2.0 License and BSD License at
https://github.com/fluid-project/infusion/raw/master/Infusion-LICENSE.txt
*/

"use strict";

// Observation filters ported to Infusion 6 - corresponds to the since removed src/client/js/new/filters.js and the filters in
// imerss-bbea.js

// noinspection ES6ConvertVarToLetConst // otherwise this is a duplicate on minifying
var hortis = fluid.registerNamespace("hortis");

// Namespaces of components defined in Single File Components, whose functions are defined here
fluid.registerNamespace("hortis.autocomplete");
fluid.registerNamespace("hortis.valueFilter");

// More abstract base layer for anything which filters with a filterState, which can be reset, but which should not
// be picked up by hortis.obsFilters' general trawl for hortis.obsFilter - e.g. a checklist's taxon search
fluid.def("hortis.filter", {
    $layers: "fluid.component",
    isActive: true
    // filterState - must be implemented
    // reset: $method - must be implemented
});

/**
 * A summary of how many of a filter's settings are active, suitable for display in a badge beside its controls.
 * @typedef {Object} FilterSummary
 * @property {Number} count - The number of active settings, 0 if the filter is inactive
 * @property {String} title - A description of the active settings, suitable for a tooltip
 * @property {Boolean} [dot] - `true` if the count is not meaningful to the user and a plain marker should be shown instead
 */

// A filter which can summarise its active settings as a FilterSummary held at `filterSummary`
fluid.def("hortis.summarisedFilter", {
    $layers: "fluid.component"
    // filterSummary - should be implemented
});

// A filter of observation rows, found by hortis.obsFilters
fluid.def("hortis.obsFilter", {
    $layers: ["hortis.filter", "hortis.summarisedFilter"]
    // doFilter: $method accepting (rows, filterState) - must be implemented
});

/**
 * Summarise a filter whose active settings can simply be counted.
 * @param {Number} count - The number of active settings
 * @param {String[]} nouns - The singular and plural nouns for one of the settings
 * @return {FilterSummary} The summary of the filter
 */
hortis.countSummary = function (count, nouns) {
    return {
        count,
        title: hortis.plural(count, nouns[0], nouns[1]) + " selected"
    };
};

/**
 * Summarise a filter whose state is a hash of selected keys to `true`.
 * @param {Object<String, Boolean>} filterState - The filter state
 * @param {String[]} nouns - The singular and plural nouns for one of the keys
 * @return {FilterSummary} The summary of the filter
 */
hortis.keyCountSummary = function (filterState, nouns) {
    return hortis.countSummary(Object.keys(filterState).length, nouns);
};

// Folds a chain of filters over its input, in tree order. Unlike the Infusion 4 implementation, this is a plain
// computation - each filter's state is read inside it, so that a change in any filter reruns the chain
fluid.def("hortis.filters", {
    $layers: "fluid.component",
    // allInput: Object[]
    // filterComps: Component[] - the filters to be applied, typically found by a selector reference
    allOutput: "$compute:hortis.filters.evaluate({self}.allInput, {self}.filterComps)"
});

/**
 * Apply each active filter in turn to the rows output by the previous one. Each filter's `isActive` and `filterState`
 * are read through its proxy, so that a change in any of them reruns the chain.
 * @param {Object[]} allInput - The rows to be filtered
 * @param {Component[]} filterComps - The filters, each bearing `isActive`, `filterState` and the method `doFilter`
 * @return {Object[]} The rows surviving all active filters
 */
hortis.filters.evaluate = function (allInput, filterComps) {
    const now = Date.now();
    const output = filterComps.reduce((rows, filterComp) => filterComp.isActive ? filterComp.doFilter(rows, filterComp.filterState) : rows, allInput);
    fluid.log("Filtered " + allInput.length + " rows to " + output.length + " through " + filterComps.length + " filters in " + (Date.now() - now) + " ms");
    return output;
};

fluid.def("hortis.obsFilters", {
    $layers: "hortis.filters",
    allInput: "{vizLoader}.obsRows",
    filterComps: "{vizLoader hortis.obsFilter}"
});

// Mixin for a filter which needs the full set of observations, e.g. to compute the range of values to be offered
fluid.def("hortis.obsDrivenFilter", {
    $layers: "hortis.obsFilter",
    obsRows: "{vizLoader}.obsRows"
});

/**
 * Split a search query into its lower-cased words.
 * @param {String|null} query - The query
 * @return {String[]} The words of the query
 */
hortis.queryWords = function (query) {
    return (query || "").toLowerCase().split(" ").filter(word => word.trim().length > 0);
};

/** Autocomplete **/

// A component hosting an autocomplete widget as its subcomponent `autocomplete`
fluid.def("hortis.autocompleteHost", {
    $layers: "fluid.component",
    // controlId: String - the id of the autocomplete's input
    placeholder: "",
    minLength: 3,
    maxSuggestions: 10,
    // Global names of functions rendering a suggestion and the value of the input for a selected suggestion
    renderSuggestion: "fluid.identity",
    renderInputValue: "fluid.identity",
    // queryAutocomplete: $method accepting (query, callback), calling the callback with the suggestions
    // confirmAutocomplete: $method accepting the confirmed suggestion
    autocomplete: {
        $component: {
            $layers: "hortis.autocomplete"
        }
    }
});

/**
 * Clear the input of an autocomplete widget.
 * @param {Document} dokkument - The document holding the widget
 * @param {String} controlId - The id of the widget's input
 */
hortis.autocomplete.clear = function (dokkument, controlId) {
    const input = dokkument.getElementById(controlId);
    if (input) {
        input.value = "";
    }
};

// A filter of taxon rows, found by hortis.taxaFilters rather than hortis.obsFilters
fluid.def("hortis.taxaFilter", {
    $layers: ["hortis.filter", "hortis.summarisedFilter"]
    // doFilter: $method accepting (rows, filterState) - must be implemented
});

// Folds the taxa filters beneath a component over a set of taxon rows
fluid.def("hortis.taxaFilters", {
    $layers: "hortis.filters"
    // allInput: TaxonRow[]
    // filterComps: Component[] - typically "{someContext hortis.taxaFilter}"
});

/** Filters of values - see hortis-valueFilter.vue **/

/**
 * Compute the rows of a filter of values of a field - one for each value, with its label.
 * @param {String[]} fieldValues - The values
 * @param {String[]} [fieldLabels] - Their labels - by default, the values
 * @return {Object[]} The rows, each with members `value` and `label`
 */
hortis.valueFilter.rows = (fieldValues, fieldLabels) => fieldValues.map((value, i) => ({value, label: (fieldLabels || fieldValues)[i]}));

hortis.valueFilter.toggle = function (that, value, checked) {
    const filterState = {...that.filterState};
    if (checked) {
        filterState[value] = true;
    } else {
        delete filterState[value];
    }
    that.filterState = filterState;
};

hortis.valueFilter.reset = function (that) {
    that.filterState = {};
};

hortis.valueFilter.isChecked = (filterState, value) => !!filterState[value];

hortis.valueFilter.rowChange = function (event, row) {
    row.toggle(event.target.checked);
};

/**
 * Filter rows to those whose value of a field is one of those selected.
 * @param {Object[]} rows - The rows
 * @param {Object<String, Boolean>} filterState - The selected values
 * @param {String} fieldName - The field
 * @param {String|null} valueOf - The global name of a function computing a row's value in place of its field, if any
 * @return {Object[]} The rows surviving the filter
 */
hortis.valueFilter.doFilter = function (rows, filterState, fieldName, valueOf) {
    const selected = Object.keys(filterState);
    const value = valueOf ? fluid.getGlobalValue(valueOf) : row => row[fieldName];
    return selected.length === 0 ? rows : rows.filter(row => selected.includes(value(row)));
};

/** Filters whose state is held in the URL **/

/**
 * A codec translating a filter's state to and from the text held for it in the URL's hash.
 * @typedef {Object} UrlCodec
 * @property {Function} encode - Accepts a filter state and returns its text, or `undefined` if the state is empty and
 * nothing is to be held in the URL
 * @property {Function} decode - Accepts the text held in the URL, which is `undefined` if there is none, and returns
 * the filter state - the empty state if there is no text
 */

// A filter whose state is held in the URL's hash once the page has a hash manager - see hashManager.js, whose
// $linkage lays hortis.urlMappedFilter.linked over every component bearing this layer. The filter itself need know
// nothing of the URL, beyond the key under which its state is held and the codec translating it
fluid.def("hortis.urlMappedFilter", {
    $layers: "fluid.component",
    // The key under which the filter's state is held in the hash - by default, its member name with any trailing
    // "Filter" removed, e.g. "collector" for a filter held at member collectorFilter
    urlKey: "$compute:hortis.urlMappedFilter.urlKey({self})",
    // The global name of the UrlCodec translating the filter's state
    urlCodec: "hortis.urlCodecs.string"
});

// Laid over a hortis.urlMappedFilter by the hash manager's $linkage - the filter's state becomes a view of its entry
// in the hash, so that writing the state writes that entry alone, and navigating the URL's history restores the state
fluid.def("hortis.urlMappedFilter.linked", {
    filterState: {
        $lens: {
            source: "{hashManager}.hash",
            path: "{self}.urlKey",
            forward: "hortis.urlMappedFilter.decode({0}, {self}.urlCodec)",
            backward: "hortis.urlMappedFilter.encode({0}, {self}.urlCodec)"
        }
    }
});

/**
 * Derive the default key under which a filter's state is held in the URL from the member name at which it is held.
 * @param {fluid.component} that - The filter
 * @return {String} The member name with any trailing "Filter" removed
 */
hortis.urlMappedFilter.urlKey = function (that) {
    const memberName = String(that[fluid.metadataSymbol].memberName);
    return memberName.endsWith("Filter") && memberName !== "Filter" ? memberName.slice(0, -"Filter".length) : memberName;
};

/**
 * Read a filter's state from its entry in the URL's hash.
 * @param {String|undefined} text - The filter's entry in the hash, if any
 * @param {String} urlCodec - The global name of the codec translating the state
 * @return {any} The filter's state
 */
hortis.urlMappedFilter.decode = function (text, urlCodec) {
    return fluid.getGlobalValue(urlCodec).decode(text);
};

/**
 * Encode a filter's state as its entry in the URL's hash.
 * @param {any} filterState - The filter's state
 * @param {String} urlCodec - The global name of the codec translating the state
 * @return {String|fluid.deleteMarker} The entry, or `fluid.deleteMarker`, removing the entry, if the state is empty
 */
hortis.urlMappedFilter.encode = function (filterState, urlCodec) {
    const encoded = fluid.getGlobalValue(urlCodec).encode(filterState);
    return encoded === undefined ? fluid.deleteMarker : encoded;
};

fluid.registerNamespace("hortis.urlCodecs");

// A state which is a String, or null if the filter is inactive
hortis.urlCodecs.string = {
    encode: state => state === null || state === undefined || state === "" ? undefined : String(state),
    decode: text => text === undefined || text === "" ? null : String(text)
};

// A state which is a hash of keys to true, e.g. the selected values of a filter or the ids of selected taxa, held as
// the keys separated by commas
hortis.urlCodecs.keys = {
    encode: function (state) {
        const keys = Object.keys(state || {}).filter(key => state[key]);
        return keys.length === 0 ? undefined : keys.join(",");
    },
    decode: text => text === undefined || text === "" ? {} : Object.fromEntries(String(text).split(",").map(key => [key, true]))
};

/**
 * Construct a codec for a state which is a fixed set of Boolean flags, held as the names of those which are set
 * separated by commas.
 * @param {String[]} flags - The names of the flags
 * @return {UrlCodec} The codec, whose decoded state holds every flag
 */
hortis.urlCodecs.flags = function (flags) {
    return {
        encode: hortis.urlCodecs.keys.encode,
        decode: function (text) {
            const keys = hortis.urlCodecs.keys.decode(text);
            return Object.fromEntries(flags.map(flag => [flag, !!keys[flag]]));
        }
    };
};

// A state which is a numeric range with members `lower` and `upper`, or null if unrestricted, held as "lower,upper"
hortis.urlCodecs.range = {
    encode: state => state ? state.lower + "," + state.upper : undefined,
    decode: function (text) {
        const bounds = text === undefined ? [] : String(text).split(",").map(Number);
        return bounds.length === 2 && bounds.every(bound => !isNaN(bound)) ? {lower: bounds[0], upper: bounds[1]} : null;
    }
};

// A state which is a taxon row, or null, held as the taxon's id - the decoded state holds the id alone
hortis.urlCodecs.taxonRow = {
    encode: state => state ? String(state.id) : undefined,
    decode: text => text === undefined || text === "" ? null : {id: String(text)}
};
