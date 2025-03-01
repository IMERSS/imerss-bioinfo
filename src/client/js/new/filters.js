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

fluid.defaults("hortis.filter", {
    // gradeNames: "fluid.component",
    members: {
        filterInput: null, // must be overridden
        filterOutput: null // must be overridden
    },
    invokers: {
        // doFilter
        // reset
    }
});

fluid.defaults("hortis.filters", {
    // gradeNames: "fluid.component",
    components: {
        filterRoot: "{that}"
    },
    members: {
        allInput: "{vizLoader}.obsRows",
        combinedFilterInput: "@expand:hortis.combinedFilterInput({that})",
        idle: "@expand:signal(true)",
        lastEvaluatedInput: null,
        scheduleFilter: "@expand:fluid.effect(hortis.scheduleFilter, {that}, {that}.combinedFilterInput, {that}.idle)",
        // TODO: syntax for unavailable literal on startup
        allOutput: "@expand:signal()"
    }
});

hortis.combinedFilterInput = function (that) {
    return computed( () => {
        const filterComps = fluid.queryIoCSelector(that.filterRoot, "hortis.filter", false);

        const filterStates = filterComps.map(comp => comp.filterState);

        const args = [that.allInput, ...filterStates];
        const {undefinedSignals} = fluid.processSignalArgs(args);

        return undefinedSignals ? fluid.unavailable({message: "Filter input unavailable"}) : {
            filterStates: filterStates.map(filterState => filterState.value),
            filterComps,
            allInput: that.allInput.value};
    });
};

hortis.evaluateFilter = function (that, combinedFilterInput) {
    const {filterStates, filterComps, allInput} = combinedFilterInput;

    let prevOutput = allInput;

    for (let i = 0; i < filterComps.length; ++i) {
        const filterComp = filterComps[i];
        const filterOutput = filterComp.doFilter(prevOutput, filterStates[i]);
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

hortis.recordReporter.renderModel = (filteredRows, allRows) => ({
    filteredRows: filteredRows.length,
    allRows: allRows.length
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

hortis.repeatingRowFilter.renderRow = function (template, rowLabel, rowId) {
    return fluid.stringTemplate(template, {
        rowLabel,
        checkbox: hortis.rowCheckbox(rowId)
    });
};

fluid.defaults("hortis.obsDrivenFilter", {
    members: {
        obsRows: "{hortis.filters}.obsRows"
    }
});

fluid.defaults("hortis.regionFilter", {
    gradeNames: ["hortis.filter", "hortis.repeatingRowFilter", "fluid.stringTemplateRenderingView"],
    markup: {
        container: `
        <div class="imerss-region-filter">
            <div class="imerss-filter-title">%filterName:</div>
            <div class="imerss-filter-body imerss-region-filter-rows">%rows</div>
        </div>
        `
    },
    freeFilter: false,
    // fieldNames
    // filterName
    members: {
        indirectionRows: "@expand:signal([])",
        filterRows: "@expand:fluid.computed(hortis.regionFilter.computeFilterRows, {that}.indirectionRows, {that}.options.fieldNames, {that}.options.freeFilter)",
        filterState: "@expand:signal({})",
        renderModel: `@expand:fluid.computed(hortis.regionFilter.renderModel, {that}.filterRows,
            {that}.options.markup, {that}.options.filterName, {that}.options.freeFilter)`
    },
    invokers: {
        doFilter: "hortis.regionFilter.doFilter({that}.filterRows.value, {arguments}.0, {arguments}.1)",
        reset: "hortis.regionFilter.reset({that})"
    },
    listeners: {
        "onCreate.bindClick": "hortis.regionFilter.bindClick"
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

hortis.regionFilter.reset = function (that) {
    that.filterState.value = {};
    // TODO: preactish rendering with signals
    hortis.resetChecks(that.container[0]);
};

// cf. hortis.checklist.bindCheckboxClick
hortis.regionFilter.bindClick = function (that) {
    that.container.on("click", ".pretty input", function () {
        const id = this.dataset.rowId;
        fluid.log("Filter clicked with row " + id);
        const filterState = {...that.filterState.value};
        if (this.checked) {
            filterState[id] = true;
        } else {
            delete filterState[id];
        }
        that.filterState.value = filterState;
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

fluid.defaults("hortis.freeRegionFilter", {
    gradeNames: "fluid.viewComponent",
    selectors: {
        freeRegionInput: ".imerss-free-region-input",
        freeRegionControl: ".imerss-free-region-control",
        filterBody: ".imerss-region-filter-rows",
        clearFilter: ".imerss-filter-clear"
    },
    members: {
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
            func: (node, filterState) => effect(() => hortis.toggleClass(node, "imerss-hidden", !filterState.value))
        }
    },
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

fluid.defaults("hortis.autocompleteFilter", {
    gradeNames: ["hortis.filter", "hortis.obsDrivenFilter", "fluid.stringTemplateRenderingView"],
    // fieldName
    // filterName
    // controlId
    // rootClass
    markup: {
        container: `
        <div class="%rootClass">
            <label class="imerss-filter-title" for="%controlId">%filterName:</label>
            <div class="imerss-filter-body imerss-filter-autocomplete">
                <div class="imerss-filter-clear imerss-basic-tooltip imerss-hidden" title="Reset this filter"><svg width="24" height="24">
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
        // obsRows:
        filterState: "@expand:signal(null)",
        renderModel: `@expand:fluid.computed(hortis.autocompleteFilter.renderModel, 
            {that}.options.filterName, {that}.options.controlId, {that}.options.rootClass)`
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
                        func: (filter, selection) => filter.filterState.value = selection
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
            func: (node, filterState) => effect(() => hortis.toggleClass(node, "imerss-hidden", !filterState.value))
        }
    }
});

hortis.autocompleteFilter.reset = function (that) {
    that.filterState.value = "";
    that.container.find("#" + that.options.controlId).val("");
};

// Isn't this awkward, because it is a "computed" it needs some kind of signal to get it going. In future, all
// access to constants will be signalised
hortis.autocompleteFilter.renderModel = function (filterName, controlId, rootClass) {
    const model = signal({filterName, controlId, rootClass});
    return model.value;
};

// Collectors filter

fluid.defaults("hortis.collectorFilter", {
    gradeNames: ["hortis.autocompleteFilter"],
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

fluid.defaults("hortis.taxonFilter", {
    gradeNames: ["hortis.autocompleteFilter"],
    controlId: "fli-imerss-taxonFilter",
    rootClass: "imerss-taxon-filter",
    components: {
        taxa: "{hortis.taxa}",
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
        doFilter: "hortis.taxonFilter.doFilter({arguments}.0, {arguments}.1, {that}.taxa.rowById.value)",
        queryAutocomplete: "hortis.queryAutocompleteTaxon({taxa}.lookupTaxon, {arguments}.0, {arguments}.1, {autocomplete}.options.maxSuggestions)"
    }
});

hortis.computeAllCollectors = function (obsRows, fieldName) {
    const collectors = {};
    obsRows.forEach(row => {
        row[fieldName].split(";").map(lump => lump.trim()).map(trimmed => collectors[trimmed] = true);
    });
    return Object.keys(collectors);
};

hortis.taxonFilter.doFilter = function (obsRows, filterState, taxonRowById) {
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

hortis.queryAutocompleteTaxon = function (lookupTaxon, query, callback, maxSuggestions) {
    const output = lookupTaxon(query, maxSuggestions);
    callback(output);
};
