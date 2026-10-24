/*
Copyright 2017-2024 Antranig Basman
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

// TODO: Hoist this into some kind of core library
// noinspection ES6ConvertVarToLetConst // otherwise this is a duplicate on minifying
var {signal, computed, effect, batch} = preactSignalsCore;

// More abstract base grade created for "filter" to deal with things that do some kind of filtering with filterState
// but should not be picked up by hortis.obsFilters general trawl for hortis.obsFilter - e.g. our repurposing
// of hortis.checklist.filter as something which
fluid.defaults("hortis.filter", {
    // gradeNames: "fluid.component",
    members: {
        isActive: "@expand:signal(true)"
    }
});

/**
 * A summary of how many of a filter's settings are active, suitable for display in a badge beside its controls.
 * @typedef {Object} FilterSummary
 * @property {Number} count - The number of active settings, 0 if the filter is inactive
 * @property {String} title - A description of the active settings, suitable for a tooltip
 * @property {Boolean} [dot] - `true` if the count is not meaningful to the user and a plain marker should be shown instead
 */

// A component which acts as a filter in the UI and can summarise its active settings. Badges summing these summaries
// are shown by hortis.filterConcertina in the header of whichever section of the concertina holds the filter's
// container, and are ignored by UIs which have no place for them.
fluid.defaults("hortis.summarisedFilter", {
    members: {
        // filterSummary: Signal<FilterSummary> - should be implemented
    }
});

fluid.defaults("hortis.obsFilter", {
    gradeNames: ["hortis.filter", "hortis.summarisedFilter"],
    members: {
        // filterState - must be implemented
        // filterSummary - should be implemented, see hortis.summarisedFilter
    },
    invokers: {
        // doFilter
        // reset
    }
});

/**
 * Render an integer with thousands separators.
 * @param {Number} value - The integer to be rendered
 * @return {String} The value grouped in threes, e.g. "3,000"
 */
hortis.formatInt = function (value) {
    return Math.round(value).toLocaleString("en-US");
};

/**
 * Pluralise a noun according to a count.
 * @param {Number} count - The count
 * @param {String} noun - The singular form of the noun
 * @param {String} [nouns] - The plural form of the noun, defaulting to the singular with "s" appended
 * @return {String} The count followed by the appropriate form of the noun
 */
hortis.plural = function (count, noun, nouns = noun + "s") {
    return hortis.formatInt(count) + " " + (count === 1 ? noun : nouns);
};

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

fluid.defaults("hortis.taxaFilter", {
    gradeNames: "hortis.filter"
});

fluid.defaults("hortis.filters", {
    // gradeNames: "fluid.component",
    components: {
        filterRoot: "{that}"
    },
    members: {
        // allInput
        combinedFilterInput: "@expand:hortis.combinedFilterInput({that}, {that}.options.filterGradeName)",
        rendered: "@expand:signal()",
        idle: "@expand:signal(true)",
        lastEvaluatedInput: null,
        scheduleFilter: "@expand:fluid.effect(hortis.scheduleFilter, {that}, {that}.combinedFilterInput, {that}.idle)",
        // TODO: syntax for unavailable literal on startup
        allOutput: "@expand:signal()"
    }
});

fluid.defaults("hortis.obsFilters", {
    gradeNames: "hortis.filters",
    filterGradeName: "hortis.obsFilter",
    members: {
        allInput: "{vizLoader}.obsRows"
    }
});

fluid.defaults("hortis.taxaFilters", {
    gradeNames: "hortis.filters",
    filterGradeName: "hortis.taxaFilter",
    members: {
        allInput: "{vizLoader}.taxaRows"
    }
});

hortis.combinedFilterInput = function (that, filterGradeName) {
    return computed( () => {
        const filterComps = fluid.queryIoCSelector(that.filterRoot, filterGradeName, false);

        const filterStates = filterComps.map(comp => comp.filterState);
        const filtersActive = filterComps.map(comp => comp.isActive);

        const args = [that.allInput, ...filterStates];
        const {undefinedSignals} = fluid.processSignalArgs(args);

        return undefinedSignals ? fluid.unavailable({message: "Filter input unavailable"}) : {
            filterStates: filterStates.map(filterState => filterState.value),
            filtersActive: filtersActive.map(filtersActive => filtersActive ? filtersActive.value : true),
            filterComps,
            allInput: that.allInput.value};
    });
};

hortis.evaluateFilter = function (that, combinedFilterInput) {
    const {filterStates, filterComps, filtersActive, allInput} = combinedFilterInput;

    let prevOutput = allInput;

    for (let i = 0; i < filterComps.length; ++i) {
        const filterComp = filterComps[i];
        const filterActive = filtersActive[i];
        const filterOutput = filterActive ? filterComp.doFilter(prevOutput, filterStates[i]) : prevOutput;
        prevOutput = filterOutput;
        if (fluid.isUnavailable(prevOutput)) {
            break;
        }
    }
    that.allOutput.value = prevOutput;
    that.idle.value = true;
    that.rendered.value = true;
};

hortis.scheduleFilter = function (that, combinedFilterInput, idle) {
    if (idle && combinedFilterInput !== that.lastEvaluatedInput) {
        that.idle.value = false;
        that.lastEvaluatedInput = combinedFilterInput;
        window.setTimeout(() => hortis.evaluateFilter(that, combinedFilterInput), 1);
    }
};

fluid.defaults("hortis.filterControls", {
    gradeNames: "fluid.viewComponent",
    selectors: {
        button: ".imerss-reset-filter"
    },
    listeners: {
        "onCreate.bindClick": "hortis.filterControls.bindClick({hortis.vizLoader}, {that}.dom.button)"
    }
});

hortis.filterControls.bindClick = function (vizLoader, button) {
    button.on("click", () => {
        const filters = fluid.queryIoCSelector(vizLoader, "hortis.filter");
        const checklists = fluid.queryIoCSelector(vizLoader, "hortis.checklist");
        batch(() => {
            filters.forEach(filter => filter.reset());
            checklists.forEach(checklist => checklist.reset());
        });
    });
};

fluid.defaults("hortis.recordReporter", {
    gradeNames: "fluid.stringTemplateRenderingView",
    members: {
        renderModel: "@expand:fluid.computed(hortis.recordReporter.renderModel, {that}.filteredRows, {that}.allRows)"
    },
    markup: {
        container: "<div>Displaying %filteredRows of %allRows records</div>"
    }
});

fluid.defaults("hortis.recordAndTaxaReporter", {
    gradeNames: "fluid.stringTemplateRenderingView",
    members: {
        renderModel: "@expand:fluid.computed(hortis.recordAndTaxaReporter.renderModel, {that}.filteredRows, {that}.allRows, {that}.taxa, {that}.taxaById)"
    },
    markup: {
        container: "<div>Displaying %filteredRows of %allRows records for %taxa taxa</div>"
    }
});

hortis.recordReporter.renderModel = (filteredRows, allRows, taxa) => ({
    filteredRows: filteredRows.length,
    allRows: allRows.length,
    taxa: taxa && Object.keys(taxa).length
});

hortis.recordAndTaxaReporter.renderModel = (filteredRows, allRows, taxa, taxaById) => ({
    filteredRows: filteredRows.length,
    allRows: allRows.length,
    taxa: Object.keys(taxa).filter(id => taxaById[id].inSummary).length
});

fluid.defaults("hortis.repeatingRowFilter", {
    markup: {
        row: `
        <div class="imerss-filter-row">
            <div class="imerss-row-checkbox">%checkbox</div>
            <div class="imerss-row-label">%rowLabel</div>
        </div>
        `
    }
});

hortis.repeatingRowFilter.renderRow = function (template, rowLabel, rowId, state) {
    return fluid.stringTemplate(template, {
        rowLabel,
        checkbox: hortis.rowCheckbox(rowId, state)
    });
};

// Receives obsRows from a standardised location - dubious because of "members" options merging bug which implies
// expansion happens before merging for those. As a result "statusFilter" doesn't derive from this.
fluid.defaults("hortis.obsDrivenFilter", {
    gradeNames: ["hortis.obsFilter"],
    members: {
        obsRows: "{hortis.obsFilters}.obsRows"
    }
});

fluid.defaults("hortis.valueFilter", {
    gradeNames: ["hortis.filter", "hortis.repeatingRowFilter", "fluid.stringTemplateRenderingView"],
    markup: {
        container: `
        <div class="imerss-value-filter">
            <div class="imerss-filter-title">%filterName:</div>
            <div class="imerss-filter-body imerss-value-filter-rows">%rows</div>
        </div>
        `
    },
    // fieldName
    // fieldValues, fieldLabels
    fieldLabels: "{that}.options.fieldValues",
    // filterName
    members: {
        // Free hash of region keys (indirection table row index) to true
        filterState: "@expand:signal({})",
        renderModel: `@expand:fluid.computed(hortis.valueFilter.renderModel, {that}.options.markup, {that}.options.filterName,
                          {that}.options.fieldValues, {that}.options.fieldLabels)`
    },
    invokers: {
        doFilter: "hortis.valueFilter.doFilter({that}.options.fieldName, {arguments}.0, {arguments}.1)",
        reset: "hortis.valueFilter.reset({that})"
    },
    listeners: {
        "onCreate.bindClick": "hortis.valueFilter.bindClick"
    }
});

hortis.valueFilter.renderModel = function (markup, filterName, fieldValues, fieldLabels) {
    return {
        filterName,
        rows: fieldLabels.map((label, index) => hortis.repeatingRowFilter.renderRow(markup.row, label, fieldValues[index])).join("\n")
    };
};

hortis.valueFilter.doFilter = function (fieldName, rows, filterState) {
    const filterStateRows = Object.keys(filterState);
    const none = filterStateRows.length === 0;

    return none ? rows : rows.filter(row => {
        return filterStateRows.some(fieldValue => {
            return row[fieldName] === fieldValue;
        });
    });
};

hortis.valueFilter.reset = function (that) {
    that.filterState.value = {};
    // TODO: preactish rendering with signals
    hortis.resetChecks(that.container[0]);
};


/**
 * Updates the filter state for a value-based filter component.
 *
 * @param {hortis.filter} that - The filter component instance.
 * @param {Number} id - The ide for the filter row to update.
 * @param {Boolean} selected - Whether the filter row is selected
 */
hortis.valueFilter.update = function (that, id, selected) {
    const filterState = {...that.filterState.value};
    if (selected) {
        filterState[id] = true;
    } else {
        delete filterState[id];
    }
    that.filterState.value = filterState;
};

// cf. hortis.checklist.bindCheckboxClick
hortis.valueFilter.bindClick = function (that) {
    that.container.on("click", ".pretty input", function () {
        const id = this.dataset.rowId;
        fluid.log("Filter clicked with row " + id);
        hortis.valueFilter.update(that, id, this.checked);
    });
};

fluid.defaults("hortis.regionFilter", {
    gradeNames: ["hortis.obsFilter", "hortis.repeatingRowFilter", "fluid.stringTemplateRenderingView"],
    markup: {
        container: `
        <div class="imerss-region-filter">
            <div class="imerss-filter-title">%filterName:</div>
            <div class="imerss-filter-body imerss-region-filter-rows">%rows</div>
        </div>
        `
    },
    freeFilter: false,
    summaryNouns: ["region", "regions"],
    // fieldNames
    // filterName
    members: {
        // Rows with members {regionField, id, label} where regionField is the obs column, id is the value found there, label is the label to be rendered for it
        indirectionRows: "@expand:signal([])",
        filterRows: "@expand:fluid.computed(hortis.regionFilter.computeFilterRows, {that}.indirectionRows, {that}.options.fieldNames, {that}.options.freeFilter)",
        // Free hash of region keys (indirection table row index) to true
        filterState: "@expand:signal({})",
        renderModel: `@expand:fluid.computed(hortis.regionFilter.renderModel, {that}.filterRows,
            {that}.options.markup, {that}.options.filterName, {that}.options.freeFilter)`,
        filterSummary: "@expand:fluid.computed(hortis.keyCountSummary, {that}.filterState, {that}.options.summaryNouns)"
    },
    invokers: {
        doFilter: "hortis.regionFilter.doFilter({that}.filterRows.value, {arguments}.0, {arguments}.1)",
        reset: "hortis.valueFilter.reset({that})"
    },
    listeners: {
        "onCreate.bindClick": "hortis.valueFilter.bindClick"
    }
});

hortis.regionFilter.doFilter = function (filterRows, obsRows, filterState) {
    const filterStateRows = Object.keys(filterState);
    const none = filterStateRows.length === 0;

    return none ? obsRows : obsRows.filter(obsRow => {
        return filterStateRows.some(iIndex => {
            const iRow = filterRows[iIndex];
            return obsRow[iRow.regionField] === iRow.id;
        });
    });
};

// Compute the subset of indirectionRows that will be rendered in this filter
hortis.regionFilter.computeFilterRows = function (indirectionRows, fieldNames, freeFilter) {
    return indirectionRows.filter(row => fieldNames.includes(row.regionField) ^ freeFilter);
};

hortis.regionFilter.renderModel = function (filterRows, markup, filterName, freeFilter) {
    const rowToLabel = freeFilter ? row => `${row.label} - <span class="imerss-region-field">${row.regionField}</span>` : row => row.label;
    return {
        filterName,
        rows: filterRows.map((iRow, index) => hortis.repeatingRowFilter.renderRow(markup.row, rowToLabel(iRow, freeFilter), index)).join("\n")
    };
};

/** TODO: The markup for this component needs to be supplied upstream (e.g. in bbeaFiltersTemplate) since
 * we can't trust ourselves to render it recursively
 */
// A region filter aggregating multiple region columns into a freely browseable list.
// After accepting indirectionRows, it accepts a set of fieldNames which hold regions which are to be *excluded* from the
// browseable list.
fluid.defaults("hortis.freeRegionFilter", {
    gradeNames: "fluid.viewComponent",
    selectors: {
        freeRegionInput: ".imerss-free-region-input",
        freeRegionControl: ".imerss-free-region-control",
        filterBody: ".imerss-region-filter-rows",
        clearFilter: ".imerss-filter-clear"
    },
    members: {
        // In this case our fieldNames is a set of columns to *exclude* from the browseable list
        inputFocused: "@expand:signal(false)",
        regionFilterState: "@expand:signal(null)",
        regionFilterEffect: "@expand:fluid.effect(hortis.freeRegionFilter.applyFilter, {that}.regionFilterState, {that}.dom, {regionFilter}.templateRoot)",
        inputFocusEffect: "@expand:fluid.effect(hortis.toggleClass, {that}.dom.freeRegionInput.0, autocomplete__input--focused, {that}.inputFocused)"
    },
    components: {
        filter: {
            type: "hortis.regionFilter",
            container: "{freeRegionFilter}.dom.freeRegionControl",
            options: {
                members: {
                    indirectionRows: "{freeRegionFilter}.indirectionRows"
                },
                freeFilter: true,
                fieldNames: "{freeRegionFilter}.options.fieldNames"
            }
        }
    },
    listeners: {
        "onCreate.bindEvents": "hortis.freeRegionFilter.bindEvents",
        "onCreate.bindClearClick": {
            func: (that) => that.dom.locate("clearFilter").on("click", () => {
                that.dom.locate("freeRegionInput")[0].value = "";
                that.regionFilterState.value = null;
            })
        },
        "onCreate.bindShowClear": {
            args: ["{that}.dom.clearFilter.0", "{that}.regionFilterState"],
            func: (node, filterState) => effect(() => hortis.toggleClass(node, "fl-hidden", !filterState.value))
        }
    }
});

hortis.freeRegionFilter.bindEvents = function (that) {
    const input = that.locate("freeRegionInput")[0];
    input.addEventListener("input", () => that.regionFilterState.value = input.value);
    input.addEventListener("focus", () => that.inputFocused.value = true);
    input.addEventListener("blur", () => that.inputFocused.value = false);
};

hortis.freeRegionFilter.applyFilter = function (filterState, dom) {
    const filterBody = dom.locate("filterBody")[0];
    let words = [];
    if (typeof(filterState) === "string") {
        words = filterState.split(" ").filter(word => word.trim().toLowerCase());
    }
    const rows = [...filterBody.querySelectorAll(".imerss-filter-row")].map(row => ({row, text: row.innerText.toLowerCase()}));
    rows.forEach(({row, text}) => {
        const match = words.length === 0 || words.every(word => text.includes(word));
        row.style.display = match ? "flex" : "none";
    });
};

// A region filter presenting every row of the indirection table, grouped under its region field (e.g.
// "BLM District Boundaries") as a set of unfoldable groups, together with a free text search over region labels.
// Selections are ORed within a group and ANDed between groups.
fluid.defaults("hortis.groupedRegionFilter", {
    gradeNames: ["hortis.obsFilter", "fluid.stringTemplateRenderingView"],
    markup: {
        container: `
        <div class="imerss-grouped-region-filter">
            <label class="imerss-filter-title" for="%controlId">%filterName</label>
            <div class="mf-combo">
                <svg class="mf-combo-icon" width="14" height="14" aria-hidden="true"><use href="#mf-i-search"/></svg>
                <input type="search" id="%controlId" class="mf-combo-input imerss-region-search" placeholder="Filter by region" autocomplete="off" spellcheck="false">
            </div>
            <div class="mf-scroll mf-groups">%groups</div>
        </div>
        `,
        group: `
        <div class="mf-group" data-group="%groupIndex">
            <button type="button" class="mf-group-head" aria-expanded="false" data-open="false">
                <svg class="mf-node-chev" width="12" height="12" aria-hidden="true"><use href="#mf-i-chev"/></svg>
                <span class="mf-group-name">%groupName</span>
                <span class="mf-group-state" hidden></span>
                <span class="mf-group-count" title="%total regions of type %groupName">%total</span>
            </button>
            <div class="mf-group-body" hidden>%rows</div>
        </div>
        `,
        row: `
        <label class="mf-check"><input type="checkbox" class="imerss-region-check" data-row-id="%rowId"><span>%rowLabel</span></label>
        `
    },
    controlId: "fli-imerss-region-search",
    filterName: "Region",
    // Region fields whose groups are listed first
    leadingFields: [],
    summaryNouns: ["region", "regions"],
    members: {
        // Rows with members {regionField, id, label} as for hortis.regionFilter
        indirectionRows: "@expand:signal()",
        groups: "@expand:fluid.computed(hortis.groupedRegionFilter.computeGroups, {that}.indirectionRows, {that}.options.leadingFields)",
        // Free hash of indirection table row index to true
        filterState: "@expand:signal({})",
        query: "@expand:signal(null)", // null rather than empty string, which the expander can't express
        filterSummary: "@expand:fluid.computed(hortis.keyCountSummary, {that}.filterState, {that}.options.summaryNouns)",
        renderModel: `@expand:fluid.computed(hortis.groupedRegionFilter.renderModel, {that}.groups, {that}.options.markup,
            {that}.options.filterName, {that}.options.controlId)`,
        renderGroupState: "@expand:fluid.effect(hortis.groupedRegionFilter.renderGroupState, {that}, {that}.filterState, {that}.groups, {that}.templateRoot)",
        applyQuery: "@expand:fluid.effect(hortis.groupedRegionFilter.applyQuery, {that}, {that}.query, {that}.templateRoot)"
    },
    invokers: {
        doFilter: "hortis.groupedRegionFilter.doFilter({that}.indirectionRows.value, {arguments}.0, {arguments}.1)",
        reset: "hortis.groupedRegionFilter.reset({that})"
    },
    listeners: {
        "onCreate.bindEvents": "hortis.groupedRegionFilter.bindEvents"
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
 * Compute the render model for a grouped region filter.
 * @param {Object[]} groups - The groups as computed by `hortis.groupedRegionFilter.computeGroups`
 * @param {Object} markup - The component's markup templates
 * @param {String} filterName - The (visually hidden) label for the region search box
 * @param {String} controlId - The id to be allocated to the region search box
 * @return {Object} Render model for the container template
 */
hortis.groupedRegionFilter.renderModel = function (groups, markup, filterName, controlId) {
    const renderGroup = (group, groupIndex) => fluid.stringTemplate(markup.group, {
        groupIndex,
        groupName: hortis.encodeHTML(group.regionField),
        total: group.rows.length,
        rows: group.rows.map(({row, index}) => fluid.stringTemplate(markup.row, {
            rowId: index,
            rowLabel: hortis.encodeHTML(row.label)
        })).join("")
    });
    return {
        filterName,
        controlId,
        groups: groups.map(renderGroup).join("\n")
    };
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
    that.filterState.value = {};
    that.query.value = null;
    const root = that.container[0];
    root.querySelectorAll(".imerss-region-check").forEach(check => check.checked = false);
    const search = root.querySelector(".imerss-region-search");
    if (search) {
        search.value = "";
    }
};

/**
 * Display in each group's header the number of regions selected within it.
 * @param {hortis.groupedRegionFilter} that - The filter component
 * @param {Object<String, Boolean>} filterState - Hash of selected indirection row indices to `true`
 * @param {Object[]} groups - The groups as computed by `hortis.groupedRegionFilter.computeGroups`
 */
hortis.groupedRegionFilter.renderGroupState = function (that, filterState, groups) {
    const root = that.container[0];
    groups.forEach((group, groupIndex) => {
        const badge = root.querySelector(`[data-group="${groupIndex}"] .mf-group-state`);
        if (badge) {
            const count = group.rows.filter(({index}) => filterState[index]).length;
            badge.hidden = count === 0;
            badge.textContent = String(count);
            badge.setAttribute("title", `${count} selected region${count === 1 ? "" : "s"} of type ${group.regionField}`);
        }
    });
};

/**
 * Show only those regions whose labels match all of the words in the search box. Whilst a search is in progress,
 * groups with matches are unfolded and those without are hidden.
 * @param {hortis.groupedRegionFilter} that - The filter component
 * @param {String|null} query - The contents of the search box, or `null` if it has not been used
 */
hortis.groupedRegionFilter.applyQuery = function (that, query) {
    const words = (query || "").toLowerCase().split(" ").filter(word => word.trim().length > 0);
    const searching = words.length > 0;
    const root = that.container[0];
    root.querySelectorAll(".mf-group").forEach(groupNode => {
        const head = groupNode.querySelector(".mf-group-head");
        const body = groupNode.querySelector(".mf-group-body");
        let matches = 0;
        body.querySelectorAll(".mf-check").forEach(row => {
            const text = row.textContent.toLowerCase();
            const match = words.every(word => text.includes(word));
            row.classList.toggle("mf-check-hidden", !match);
            matches += match ? 1 : 0;
        });
        if (searching) {
            groupNode.hidden = matches === 0;
            body.hidden = false;
            head.setAttribute("aria-expanded", "true");
        } else {
            const open = head.dataset.open === "true";
            groupNode.hidden = false;
            body.hidden = !open;
            head.setAttribute("aria-expanded", open ? "true" : "false");
        }
    });
};

hortis.groupedRegionFilter.bindEvents = function (that) {
    that.container.on("click", ".mf-group-head", function () {
        const open = this.getAttribute("aria-expanded") === "true";
        this.setAttribute("aria-expanded", open ? "false" : "true");
        this.dataset.open = open ? "false" : "true";
        this.parentNode.querySelector(".mf-group-body").hidden = open;
    });
    that.container.on("change", ".imerss-region-check", function () {
        hortis.valueFilter.update(that, this.dataset.rowId, this.checked);
    });
    that.container.on("input", ".imerss-region-search", function () {
        that.query.value = this.value;
    });
};

fluid.defaults("hortis.autocompleteFilter", {
    gradeNames: ["hortis.filter", "fluid.stringTemplateRenderingView"],
    // filterName
    // controlId
    // rootClass
    // [fieldName used in subclasses]
    markup: {
        container: `
        <div class="%rootClass">
            <label class="imerss-filter-title" for="%controlId">%filterName:</label>
            <div class="imerss-filter-body imerss-filter-autocomplete">
                <div class="imerss-filter-clear imerss-basic-tooltip fl-hidden" title="Reset this filter"><svg width="24" height="24">
                        <use href="#x-circle-close" />
                    </svg>
                </div>
            </div>
        </div>
        `
    },
    selectors: {
        autocomplete: ".imerss-filter-autocomplete",
        clearFilter: ".imerss-filter-clear"
    },
    members: {
        filterState: "@expand:signal(null)",
        renderModel: `@expand:fluid.computed(hortis.autocompleteFilter.renderModel, 
            {that}.options.filterName, {that}.options.controlId, {that}.options.rootClass)`,
        filterSummary: "@expand:fluid.computed(hortis.autocompleteFilter.summarise, {that}.filterState, {that}.options.filterName)"
    },
    invokers: {
        reset: "hortis.autocompleteFilter.reset({that})"
    },
    components: {
        autocomplete: {
            type: "hortis.autocomplete",
            options: {
                container: "{filter}.dom.autocomplete",
                id: "{filter}.options.controlId",
                maxSuggestions: 10,
                widgetOptions: {
                    minLength: 3
                },
                listeners: {
                    onConfirm: {
                        args: ["{filter}", "{arguments}.0"],
                        func: (filter, selection) => {
                            console.log("Setting filter state to ", selection);
                            filter.filterState.value = selection;
                        }
                    }
                },
                invokers: {
                    //                                 query,         callback
                    query: "{filter}.queryAutocomplete({arguments}.0, {arguments}.1)"
                }
            }
        }
    },
    listeners: {
        "onCreate.bindClearClick": {
            func: (that) => that.dom.locate("clearFilter").on("click", () => {
                that.reset();
            })
        },
        "onCreate.bindShowClear": {
            args: ["{that}.dom.clearFilter.0", "{that}.filterState"],
            func: (node, filterState) => effect(() => hortis.toggleClass(node, "fl-hidden", !filterState.value))
        }
    }
});

hortis.autocompleteFilter.reset = function (that) {
    that.filterState.value = "";
    that.container.find("#" + that.options.controlId).val("");
};

/**
 * Summarise an autocomplete filter, which is active when any value has been chosen.
 * @param {any} filterState - The chosen value, or a falsy value if none has been chosen
 * @param {String} filterName - The name of the filter
 * @return {FilterSummary} The summary of the filter
 */
hortis.autocompleteFilter.summarise = function (filterState, filterName) {
    return {
        count: filterState ? 1 : 0,
        title: "Filtering by a single " + filterName.toLowerCase()
    };
};

// Isn't this awkward, because it is a "computed" it needs some kind of signal to get it going. In future, all
// access to constants will be signalised
hortis.autocompleteFilter.renderModel = function (filterName, controlId, rootClass) {
    const model = signal({filterName, controlId, rootClass});
    return model.value;
};

// Collectors filter

fluid.defaults("hortis.collectorFilter", {
    gradeNames: ["hortis.autocompleteFilter", "hortis.obsDrivenFilter"],
    controlId: "fli-imerss-collector",
    rootClass: "imerss-collector-filter",
    members: {
        // TODO: This is lazy, we really want it computed at any "idle time" so as not to delay 3rd keystroke
        allCollectors: "@expand:fluid.computed(hortis.computeAllCollectors, {that}.obsRows, {that}.options.fieldName)"
    },
    invokers: {
        doFilter: "hortis.collectorFilter.doFilter({arguments}.0, {arguments}.1, {that}.options.fieldName)",
        queryAutocomplete: "hortis.queryAutocompleteCollector({filter}.allCollectors.value, {arguments}.0, {arguments}.1)"
    }
});

hortis.computeAllCollectors = function (obsRows, fieldName) {
    const collectors = {};
    obsRows.forEach(row => {
        row[fieldName].split(";").map(lump => lump.trim()).map(trimmed => collectors[trimmed] = true);
    });
    return Object.keys(collectors);
};

hortis.collectorFilter.doFilter = function (obsRows, filterState, fieldName) {
    const all = !(filterState);
    // TODO: Fix this to parse properly during computeCollectors
    return all ? obsRows : obsRows.filter(row => row[fieldName].includes(filterState));
};

hortis.queryAutocompleteCollector = function (allCollectors, query, callback) {
    const lowerQuery = query.toLowerCase();
    const results = query.length < 3 ? [] : allCollectors.filter(collector => collector.toLowerCase().includes(lowerQuery));
    callback(results);
};

// Taxon filter

// Note that this is not a hortis.obsFilter so that "hortis.checklist.search" can be one, so that its search action
// can punch through to the checklist rather than acting directly by itself.
fluid.defaults("hortis.autocompleteTaxonFilter", {
    gradeNames: ["hortis.autocompleteFilter", "hortis.filter"],
    controlId: "fli-imerss-taxonFilter",
    rootClass: "imerss-taxon-filter",
    components: {
        taxonNameLookup: "{hortis.taxonNameLookup}",
        autocomplete: {
            options: {
                invokers: {
                    renderSuggestion: "hortis.autocompleteSuggestionForTaxonRow",
                    renderInputValue: "hortis.autocompleteInputForTaxonRow"
                }
            }
        }
    },
    invokers: {
        queryAutocomplete: "hortis.queryAutocompleteTaxon({taxonNameLookup}.lookupTaxon, {arguments}.0, {arguments}.1, {autocomplete}.options.maxSuggestions)"
    }
});


hortis.queryAutocompleteTaxon = function (lookupTaxon, query, callback, maxSuggestions) {
    const output = lookupTaxon(query, maxSuggestions);
    callback(output);
};


fluid.defaults("hortis.autocompleteTaxonObsFilter", {
    gradeNames: ["hortis.autocompleteTaxonFilter", "hortis.obsFilter"],
    members: {
        // rowById
    },
    invokers: {
        doFilter: "hortis.filterObsBySingleTaxon({arguments}.0, {arguments}.1, {that}.rowById.value)"
    }
});

hortis.filterObsBySingleTaxon = function (obsRows, filterState, taxonRowById) {
    const all = !(filterState);
    const filterRoot = filterState?.id;
    const includeRow = function (obsRow) {
        let taxonRow = taxonRowById[obsRow.iNaturalistTaxonId];
        while (taxonRow) {
            if (taxonRow.id === filterRoot) {
                return true;
            }
            taxonRow = taxonRow.parent;
        }
        return false;
    };
    return all ? obsRows : obsRows.filter(includeRow);
};
