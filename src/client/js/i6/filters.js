/*
Copyright 2017-2026 Antranig Basman
Licensed under the Educational Community License (ECL), Version 2.0 or the New
BSD license. You may not use this file except in compliance with one these
Licenses.
You may obtain a copy of the ECL 2.0 License and BSD License at
https://github.com/fluid-project/infusion/raw/master/Infusion-LICENSE.txt
*/

"use strict";

// Observation filters ported to Infusion 6 - corresponds to src/client/js/new/filters.js and the filters in
// imerss-bbea.js

// noinspection ES6ConvertVarToLetConst // otherwise this is a duplicate on minifying
var hortis = fluid.registerNamespace("hortis");

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
    // Holds the previous output, so that an evaluation yielding the same rows yields the same array
    outputCache: "$compute:hortis.filters.makeCache()",
    allOutput: "$compute:hortis.filters.evaluate({self}.allInput, {self}.filterComps, {self}.outputCache)"
});

hortis.filters.makeCache = () => ({});

/**
 * Determine whether two arrays hold identical elements in the same order.
 * @param {Array} a - The first array
 * @param {Array} b - The second array
 * @return {Boolean} `true` if the arrays have the same length and identical elements
 */
hortis.shallowArrayEquals = function (a, b) {
    return a.length === b.length && a.every((element, i) => element === b[i]);
};

/**
 * Apply each active filter in turn to the rows output by the previous one.
 * The selector supplying the filters is redelivered as a fresh array whenever components beneath its root turn over,
 * e.g. when the source of a $for is written, which reruns this evaluation with unchanged filters. So that this does
 * not propagate through the whole visualisation, the previous output array is returned if it holds the same rows.
 * @param {Object[]} allInput - The rows to be filtered
 * @param {Component[]} filterComps - The filters, each bearing `isActive`, `filterState` and the method `doFilter`
 * @param {Object} outputCache - Mutable cache holding the previous output at `output`
 * @return {Object[]} The rows surviving all active filters
 */
hortis.filters.evaluate = function (allInput, filterComps, outputCache) {
    const now = Date.now();
    const output = filterComps.reduce((rows, filterComp) => filterComp.isActive ? filterComp.doFilter(rows, filterComp.filterState) : rows, allInput);
    fluid.log("Filtered " + allInput.length + " rows to " + output.length + " through " + filterComps.length + " filters in " + (Date.now() - now) + " ms");
    const previous = outputCache.output;
    const togo = previous && hortis.shallowArrayEquals(previous, output) ? previous : output;
    outputCache.output = togo;
    return togo;
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

// The markup of a checkbox styled by pretty-checkbox, whose state is bound to the model site `ref`
hortis.prettyCheckbox = function (ref) {
    return `<span class="pretty p-icon">
        <input type="checkbox" class="checklist-check" checked="@{${ref}}"/>
        <span class="state p-success">
            <i class="icon mdi mdi-check"></i>
            <label></label>
        </span>
    </span>`;
};

/** Sex filter **/

fluid.def("hortis.sexFilter", {
    $layers: "hortis.obsFilter",
    // Bound two-way to the checkboxes in the template
    filterState: {
        $reactiveRoot: {
            male: false,
            female: false
        }
    },
    filterSummary: "$compute:hortis.sexFilter.summarise({self}.filterState)",
    doFilter: "$method:hortis.sexFilter.doFilter({0}:obsRows, {1}:filterState)",
    reset: "$method:hortis.sexFilter.reset({self})",
    view: {
        $component: {
            $layers: "hortis.selectorTemplateView",
            template: `
        <div class="imerss-sex-filter mf-inline">
            <span class="mf-inline-label">Sex</span>
            <label class="mf-inline-check">${hortis.prettyCheckbox("filterState.female")}Female</label>
            <label class="mf-inline-check">${hortis.prettyCheckbox("filterState.male")}Male</label>
        </div>`
        }
    }
});

hortis.sexFilter.reset = function (that) {
    that.filterState = {male: false, female: false};
};

/**
 * Summarise the sex filter by the number of sexes selected.
 * @param {Object} filterState - The filter state, with Boolean members `male` and `female`
 * @return {FilterSummary} The summary of the filter
 */
hortis.sexFilter.summarise = function (filterState) {
    return hortis.countSummary((filterState.male ? 1 : 0) + (filterState.female ? 1 : 0), ["sex", "sexes"]);
};

hortis.sexFilter.doFilter = function (obsRows, filterState) {
    const all = !(filterState.female || filterState.male);
    return all ? obsRows : obsRows.filter(row => row.sex === "F" && filterState.female || row.sex === "M" && filterState.male);
};

/** Phenology filter **/

hortis.months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October",
    "November", "December"];

fluid.def("hortis.phenologyFilter", {
    $layers: "hortis.obsDrivenFilter",
    // One record per month - each month's row is a subcomponent whose checkbox is bound two-way to its record's
    // `checked`, which it writes through to this array since the $for source is sited
    filterState: {
        $reactiveRoot: hortis.months.map(month => ({month, checked: false}))
    },
    // Month of each observation, cached by row rather than written onto it
    monthCache: "$compute:hortis.phenologyFilter.monthCache({self}.obsRows)",
    filterSummary: "$compute:hortis.phenologyFilter.summarise({self}.filterState)",
    doFilter: "$method:hortis.phenologyFilter.doFilter({0}:obsRows, {1}:filterState, {self}.monthCache)",
    reset: "$method:hortis.phenologyFilter.reset({self})",
    monthRows: {
        $component: {
            $layers: "hortis.phenologyFilter.row",
            $for: {
                source: "{phenologyFilter}.filterState",
                valueAs: "range",
                keyAs: "index"
            }
        }
    },
    view: {
        $component: {
            $layers: "hortis.selectorTemplateView",
            template: `
        <div class="imerss-phenology-filter">
            <div class="imerss-filter-title">Phenology:</div>
            <div class="imerss-filter-body imerss-region-filter-rows" @id="monthRows"></div>
        </div>`
        }
    }
});

// The row for one month. A template's live state write-back to a $for iteration variable currently writes only to the
// row and not through to the variable's source, so the checkbox is bound to a read-only copy of the record's state, and
// the user's change is written through the proxy, which does reach the source
fluid.def("hortis.phenologyFilter.row", {
    $layers: "fluid.component",
    isChecked: "$compute:fluid.identity({self}.range.checked)",
    setChecked: "$method:hortis.phenologyFilter.setChecked({self}, {0}:event)",
    view: {
        $component: {
            $layers: "fluid.templateViewComponent",
            template: `
        <div class="imerss-filter-row">
            <div class="imerss-row-checkbox">
                <span class="pretty p-icon">
                    <input type="checkbox" class="checklist-check" checked="@{isChecked}" @onchange="{self}.setChecked({0})"/>
                    <span class="state p-success">
                        <i class="icon mdi mdi-check"></i>
                        <label></label>
                    </span>
                </span>
            </div>
            <div class="imerss-phenology-label">@{range.month}</div>
        </div>`
        }
    }
});

hortis.phenologyFilter.setChecked = function (row, event) {
    row.range.checked = event.target.checked;
};

/**
 * Compute the month of each observation.
 * @param {Object[]} obsRows - The observations, each with an `eventDate`
 * @return {Map<Object, Number>} Map of each observation row to its month, from 0 to 11
 */
hortis.phenologyFilter.monthCache = function (obsRows) {
    return new Map(obsRows.map(row => [row, new Date(row.eventDate).getMonth()]));
};

hortis.phenologyFilter.reset = function (that) {
    that.filterState = hortis.months.map(month => ({month, checked: false}));
};

/**
 * Summarise the phenology filter by the number of months selected.
 * @param {Object[]} filterState - The filter state, holding a record with Boolean member `checked` for each month
 * @return {FilterSummary} The summary of the filter
 */
hortis.phenologyFilter.summarise = function (filterState) {
    return hortis.countSummary(filterState.filter(range => range.checked).length, ["month", "months"]);
};

hortis.phenologyFilter.doFilter = function (obsRows, filterState, monthCache) {
    const selected = new Set(filterState.map((range, index) => range.checked ? index : -1).filter(index => index !== -1));
    return selected.size === 0 ? obsRows : obsRows.filter(row => selected.has(monthCache.get(row)));
};

/** Reset control **/

// The button resetting every filter and checklist beneath the visualisation loader
fluid.def("hortis.filterControls", {
    $layers: "fluid.component",
    filters: "{vizLoader hortis.filter}",
    checklists: "{vizLoader hortis.checklist}",
    resetAll: "$method:hortis.filterControls.resetAll({self}.filters, {self}.checklists)",
    view: {
        $component: {
            $layers: "hortis.selectorTemplateView",
            template: `<span>
                <button class="mf-linkbtn imerss-reset-filter" type="button" title="Reset all filters and selections" @onclick="{self}.resetAll()">
                    <svg width="13" height="13" aria-hidden="true"><use href="#mf-i-reset"/></svg> Reset
                </button>
            </span>`
        }
    }
});

hortis.filterControls.resetAll = function (filters, checklists) {
    filters.forEach(filter => filter.reset());
    checklists.forEach(checklist => checklist.reset());
};

/** Grouped region filter **/

// A region filter presenting every row of the region indirection table, grouped under its region field (e.g.
// "BLM District Boundaries") as a set of unfoldable groups, together with a free text search over region labels.
// Selections are ORed within a group and ANDed between groups. Rendered as a computed tree whose root delegates its
// events, as for hortis.checklist
fluid.def("hortis.groupedRegionFilter", {
    $layers: "hortis.obsFilter",
    // indirectionRows: Object[] - rows with members {regionField, id, label}
    controlId: "fli-imerss-region-search",
    filterName: "Region",
    // Region fields whose groups are listed first
    leadingFields: [],
    summaryNouns: ["region", "regions"],
    groups: "$compute:hortis.groupedRegionFilter.computeGroups({self}.indirectionRows, {self}.leadingFields)",
    // Free hash of indirection table row index to true
    filterState: {
        $reactiveRoot: {}
    },
    // Hash of the indices of groups the user has unfolded to true
    openGroups: {
        $reactiveRoot: {}
    },
    // Bound two-way to the search box
    query: "",
    filterSummary: "$compute:hortis.keyCountSummary({self}.filterState, {self}.summaryNouns)",
    doFilter: "$method:hortis.groupedRegionFilter.doFilter({self}.indirectionRows, {0}:obsRows, {1}:filterState)",
    reset: "$method:hortis.groupedRegionFilter.reset({self})",
    view: {
        $component: {
            $layers: "hortis.selectorContainerView",
            templateTree: `$compute:hortis.groupedRegionFilter.renderTree({$parent}.groups, {$parent}.filterState, {$parent}.openGroups,
                {$parent}.query, {$parent}.filterName, {$parent}.controlId)`
        }
    }
});

/**
 * Arrange the rows of the region indirection table into groups, one for each region field.
 * @param {Object[]} indirectionRows - Rows of the indirection table, each with members `regionField`, `id` and `label`
 * @param {String[]} leadingFields - Region fields whose groups are to be listed first, in this order
 * @return {Object[]} Array of groups, each with members `regionField` and `rows`, where each of `rows` holds
 * the indirection `row` and its `index` in the indirection table
 */
hortis.groupedRegionFilter.computeGroups = function (indirectionRows, leadingFields) {
    const byField = {};
    const fieldOrder = [];
    indirectionRows.forEach((row, index) => {
        if (byField[row.regionField] === undefined) {
            byField[row.regionField] = [];
            fieldOrder.push(row.regionField);
        }
        byField[row.regionField].push({row, index});
    });
    const leading = leadingFields.filter(field => byField[field] !== undefined);
    const trailing = fieldOrder.filter(field => !leading.includes(field));
    return [...leading, ...trailing].map(regionField => ({
        regionField,
        rows: byField[regionField].sort((rowa, rowb) => rowa.row.label.localeCompare(rowb.row.label, undefined, {numeric: true}))
    }));
};

/**
 * Filter observations by the selected regions - ORing within each region field and ANDing between region fields.
 * @param {Object[]} indirectionRows - Rows of the indirection table
 * @param {Object[]} obsRows - The observation rows to be filtered
 * @param {Object<String, Boolean>} filterState - Hash of selected indirection row indices to `true`
 * @return {Object[]} The filtered observation rows
 */
hortis.groupedRegionFilter.doFilter = function (indirectionRows, obsRows, filterState) {
    const selected = Object.keys(filterState);
    let togo = obsRows;
    if (selected.length > 0) {
        const byField = {};
        selected.forEach(index => {
            const iRow = indirectionRows[index];
            fluid.pushArray(byField, iRow.regionField, iRow.id);
        });
        const fieldEntries = Object.entries(byField);
        togo = obsRows.filter(obsRow => fieldEntries.every(([regionField, ids]) => ids.includes(obsRow[regionField])));
    }
    return togo;
};

hortis.groupedRegionFilter.reset = function (that) {
    that.filterState = {};
    that.query = "";
};

/**
 * Split a search query into its lower-cased words.
 * @param {String|null} query - The query
 * @return {String[]} The words of the query
 */
hortis.queryWords = function (query) {
    return (query || "").toLowerCase().split(" ").filter(word => word.trim().length > 0);
};

/**
 * Render a grouped region filter. Whilst a search is in progress, groups with matches are unfolded and those without
 * are hidden, and within each group only those regions whose labels match all of the words in the search are shown.
 * @param {Object[]} groups - The groups as computed by `hortis.groupedRegionFilter.computeGroups`
 * @param {Object<String, Boolean>} filterState - Hash of selected indirection row indices to `true`
 * @param {Object<String, Boolean>} openGroups - Hash of the indices of unfolded groups to `true`
 * @param {String} query - The contents of the search box
 * @param {String} filterName - The label for the search box
 * @param {String} controlId - The id of the search box
 * @return {VNode} The tree to be rendered
 */
hortis.groupedRegionFilter.renderTree = function (groups, filterState, openGroups, query, filterName, controlId) {
    const words = hortis.queryWords(query);
    const searching = words.length > 0;
    const groupNodes = groups.map((group, groupIndex) => {
        const matches = group.rows.map(({row}) => words.every(word => row.label.toLowerCase().includes(word)));
        const matchCount = matches.filter(match => match).length;
        const selectedCount = group.rows.filter(({index}) => filterState[index]).length;
        const open = searching || !!openGroups[groupIndex];
        const rowNodes = group.rows.map(({row, index}, i) => {
            const inputAttrs = {type: "checkbox", "class": "imerss-region-check", "data-row-id": String(index)};
            if (filterState[index]) {
                inputAttrs.checked = "";
            }
            return {tag: "label", attrs: {"class": "mf-check" + (matches[i] ? "" : " mf-check-hidden")}, children: [
                {tag: "input", attrs: inputAttrs, children: []},
                {tag: "span", attrs: {}, children: [{text: row.label}]}
            ]};
        });
        const stateAttrs = {"class": "mf-group-state", title: `${selectedCount} selected region${selectedCount === 1 ? "" : "s"} of type ${group.regionField}`};
        if (selectedCount === 0) {
            stateAttrs.hidden = "";
        }
        const bodyAttrs = {"class": "mf-group-body"};
        if (!open) {
            bodyAttrs.hidden = "";
        }
        const groupAttrs = {"class": "mf-group", "data-group": String(groupIndex)};
        if (searching && matchCount === 0) {
            groupAttrs.hidden = "";
        }
        return {tag: "div", attrs: groupAttrs, children: [
            {tag: "button", attrs: {type: "button", "class": "mf-group-head", "aria-expanded": String(open), "data-group": String(groupIndex)}, children: [
                {tag: "svg", attrs: {"class": "mf-node-chev", width: "12", height: "12", "aria-hidden": "true"}, children: [
                    {tag: "use", attrs: {href: "#mf-i-chev"}, children: []}
                ]},
                {tag: "span", attrs: {"class": "mf-group-name"}, children: [{text: group.regionField}]},
                {tag: "span", attrs: stateAttrs, children: [{text: String(selectedCount)}]},
                {tag: "span", attrs: {"class": "mf-group-count", title: `${group.rows.length} regions of type ${group.regionField}`},
                    children: [{text: String(group.rows.length)}]}
            ]},
            {tag: "div", attrs: bodyAttrs, children: rowNodes}
        ]};
    });
    const root = {tag: "div", attrs: {"class": "imerss-grouped-region-filter",
        "@onclick": "hortis.groupedRegionFilter.click({0}, {self})",
        "@onchange": "hortis.groupedRegionFilter.change({0}, {self})"}, children: [
        {tag: "label", attrs: {"class": "imerss-filter-title", "for": controlId}, children: [{text: filterName}]},
        {tag: "div", attrs: {"class": "mf-combo"}, children: [
            {tag: "svg", attrs: {"class": "mf-combo-icon", width: "14", height: "14", "aria-hidden": "true"}, children: [
                {tag: "use", attrs: {href: "#mf-i-search"}, children: []}
            ]},
            {tag: "input", attrs: {type: "search", id: controlId, "class": "mf-combo-input imerss-region-search", placeholder: "Filter by region",
                autocomplete: "off", spellcheck: "false", value: "@{query}"}, children: []}
        ]},
        fluid.markVerbatim({tag: "div", attrs: {"class": "mf-scroll mf-groups"}, children: groupNodes})
    ]};
    return {tag: "fragment", children: [root]};
};

hortis.groupedRegionFilter.click = function (event, that) {
    const head = event.target.closest(".mf-group-head");
    if (head) {
        const groupIndex = head.dataset.group;
        that.openGroups[groupIndex] = !that.openGroups[groupIndex];
    }
};

hortis.groupedRegionFilter.change = function (event, that) {
    const check = event.target.closest(".imerss-region-check");
    if (check) {
        const filterState = {...that.filterState};
        if (check.checked) {
            filterState[check.dataset.rowId] = true;
        } else {
            delete filterState[check.dataset.rowId];
        }
        that.filterState = filterState;
    }
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

// An accessible-autocomplete widget, rendered into a container of its own so that no template reconciles its markup
fluid.def("hortis.autocomplete", {
    $layers: "fluid.component",
    view: {
        $component: {
            $layers: "fluid.selfTemplateViewComponent"
        }
    },
    widget: {
        $bindable: {
            bind: "hortis.autocomplete.bind({self}, {autocompleteHost}, {self}.view.renderedContainer, {global}.accessibleAutocomplete)",
            onceOnly: true
        }
    }
});

hortis.autocomplete.bind = function (that, host, container, accessibleAutocomplete) {
    let togo;
    if (accessibleAutocomplete) {
        fluid.disableRendering(that);
        togo = accessibleAutocomplete({
            element: container,
            id: host.controlId,
            placeholder: host.placeholder,
            minLength: host.minLength,
            displayMenu: "overlay",
            confirmOnBlur: false,
            source: (query, callback) => host.queryAutocomplete(query, callback),
            templates: {
                suggestion: fluid.getGlobalValue(host.renderSuggestion),
                inputValue: fluid.getGlobalValue(host.renderInputValue)
            },
            onConfirm: selection => host.confirmAutocomplete(selection)
        });
        container.querySelector("input")?.setAttribute("spellcheck", "false");
    } else {
        togo = fluid.unavailable({message: "The accessible-autocomplete library is not loaded", variety: "config"});
    }
    return togo;
};

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

/** Collector filter **/

// Filters observations by a single collector chosen with an autocomplete
fluid.def("hortis.collectorFilter", {
    $layers: ["hortis.autocompleteHost", "hortis.obsDrivenFilter"],
    filterName: "Collector",
    fieldName: "recordedBy",
    controlId: "fli-imerss-collector",
    placeholder: "Volunteer name",
    filterState: null,
    // TODO: This is lazy, we really want it computed at any "idle time" so as not to delay 3rd keystroke
    allCollectors: "$compute:hortis.computeAllCollectors({self}.obsRows, {self}.fieldName)",
    filterSummary: "$compute:hortis.collectorFilter.summarise({self}.filterState, {self}.filterName)",
    doFilter: "$method:hortis.collectorFilter.doFilter({0}:obsRows, {1}:filterState, {self}.fieldName)",
    reset: "$method:hortis.collectorFilter.reset({self}, {global}.document)",
    queryAutocomplete: "$method:hortis.queryAutocompleteCollector({self}.allCollectors, {0}:query, {1}:callback)",
    confirmAutocomplete: "$method:hortis.collectorFilter.confirm({self}, {0}:selection)",
    view: {
        $component: {
            $layers: "hortis.selectorTemplateView",
            template: `
        <div class="imerss-collector-filter">
            <label class="imerss-filter-title" for="@{controlId}">@{filterName}:</label>
            <div class="imerss-filter-body imerss-filter-autocomplete">
                <div @id="autocomplete"></div>
                <div class="imerss-filter-clear imerss-basic-tooltip" @class="fl-hidden:!@{filterState}" title="Reset this filter"
                    @onclick="{self}.reset()">
                    <svg width="24" height="24"><use href="#x-circle-close"/></svg>
                </div>
            </div>
        </div>`
        }
    }
});

hortis.collectorFilter.confirm = function (that, selection) {
    // accessible-autocomplete confirms with undefined when the input is cleared or blurred without a choice
    if (selection) {
        that.filterState = selection;
    }
};

hortis.collectorFilter.reset = function (that, dokkument) {
    that.filterState = null;
    hortis.autocomplete.clear(dokkument, that.controlId);
};

/**
 * Summarise a filter which is active when any value has been chosen.
 * @param {any} filterState - The chosen value, or a falsy value if none has been chosen
 * @param {String} filterName - The name of the filter
 * @return {FilterSummary} The summary of the filter
 */
hortis.collectorFilter.summarise = function (filterState, filterName) {
    return {
        count: filterState ? 1 : 0,
        title: "Filtering by a single " + filterName.toLowerCase()
    };
};

hortis.computeAllCollectors = function (obsRows, fieldName) {
    const collectors = new Set();
    obsRows.forEach(row => (row[fieldName] || "").split(";").forEach(lump => collectors.add(lump.trim())));
    return [...collectors].filter(collector => collector);
};

hortis.collectorFilter.doFilter = function (obsRows, filterState, fieldName) {
    // TODO: Fix this to parse properly during computeCollectors
    return filterState ? obsRows.filter(row => (row[fieldName] || "").includes(filterState)) : obsRows;
};

hortis.queryAutocompleteCollector = function (allCollectors, query, callback) {
    const lowerQuery = query.toLowerCase();
    callback(query.length < 3 ? [] : allCollectors.filter(collector => collector.toLowerCase().includes(lowerQuery)));
};

/** Elevation filter **/

// Filters observations to a range of elevations chosen with a dual range input
fluid.def("hortis.elevationFilter", {
    $layers: "hortis.obsDrivenFilter",
    fieldName: "verbatimElevation",
    rangeCache: "$compute:hortis.elevationFilter.rangeCache({self}.obsRows, {self}.fieldName)",
    filterState: "$compute:hortis.elevationFilter.toState({self}.dualRangeInput.range)",
    filterSummary: "$compute:hortis.elevationFilter.summarise({self}.filterState, {self}.rangeCache)",
    doFilter: "$method:hortis.elevationFilter.doFilter({0}:obsRows, {1}:filterState, {self}.rangeCache)",
    reset: "$method:hortis.dualRangeInput.reset({self}.dualRangeInput)",
    dualRangeInput: {
        $component: {
            $layers: "hortis.dualRangeInput",
            minRange: "{elevationFilter}.rangeCache.lower",
            maxRange: "{elevationFilter}.rangeCache.upper",
            unit: " m"
        }
    },
    view: {
        $component: {
            $layers: "hortis.selectorTemplateView",
            template: `
        <div class="imerss-elevation-filter">
            <div class="imerss-filter-title">Elevation:</div>
            <div class="imerss-filter-body" @id="dualRangeInput"></div>
        </div>`
        }
    }
});

/**
 * Compute the elevation of each observation, and the range of elevations.
 * @param {Object[]} obsRows - The observations
 * @param {String} fieldName - The field holding each observation's elevation
 * @return {Object} Members `lower` and `upper` bounding the elevations, and `elevations`, a Map of each observation row
 * with an elevation to its elevation as a Number
 */
hortis.elevationFilter.rangeCache = function (obsRows, fieldName) {
    const range = {lower: Number.POSITIVE_INFINITY, upper: Number.NEGATIVE_INFINITY, elevations: new Map()};
    obsRows.forEach(row => {
        const elevation = hortis.parseFloat(row[fieldName]);
        // Observations without an elevation take no part in the range, and are excluded once it is narrowed
        if (!isNaN(elevation)) {
            range.elevations.set(row, elevation);
            range.lower = Math.min(elevation, range.lower);
            range.upper = Math.max(elevation, range.upper);
        }
    });
    return range;
};

hortis.elevationFilter.toState = range => ({lower: range.min, upper: range.max});

/**
 * Summarise the elevation filter, which is active when its range has been narrowed from the full range of the data.
 * @param {Object} filterState - The selected range, with members `lower` and `upper`
 * @param {Object} rangeCache - The full range of elevations in the data, with members `lower` and `upper`
 * @return {FilterSummary} The summary of the filter
 */
hortis.elevationFilter.summarise = function (filterState, rangeCache) {
    const narrowed = filterState.lower !== rangeCache.lower || filterState.upper !== rangeCache.upper;
    return {
        count: narrowed ? 1 : 0,
        dot: true,
        title: "An elevation range is set"
    };
};

hortis.elevationFilter.doFilter = function (obsRows, filterState, rangeCache) {
    const none = filterState.lower === rangeCache.lower && filterState.upper === rangeCache.upper;
    return none ? obsRows : obsRows.filter(row => {
        const elevation = rangeCache.elevations.get(row);
        return elevation >= filterState.lower && elevation <= filterState.upper;
    });
};
