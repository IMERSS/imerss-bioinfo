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
var {signal, effect, batch} = preactSignalsCore;

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
    listeners: {
        "onCreate.wireFilters": "hortis.wireObsFilters"
    },
    components: {
        filterRoot: "{that}"
    },
    members: {
        allInput: "{vizLoader}.obsRows",
        allOutput: "@expand:signal()"
    }
});

hortis.wireObsFilters = function (that) {
    const filterComps = fluid.queryIoCSelector(that.filterRoot, "hortis.filter", false);
    let prevOutput = that.allInput;

    filterComps.forEach(filterComp => {
        filterComp.filterInput = prevOutput;
        filterComp.filterOutput = fluid.computed(filterComp.doFilter, filterComp.filterInput, filterComp.filterState);
        prevOutput = filterComp.filterOutput;
    });
    // This is the bit we can't wire up with a computed - it would be great to be able to "wire" the pre-existing
    // allOutput.value onto prevOutput.value after it had been constructed
    effect( () => that.allOutput.value = prevOutput.value);
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
    gradeNames: ["hortis.filter", "hortis.obsDrivenFilter", "hortis.repeatingRowFilter", "fluid.stringTemplateRenderingView"],
    markup: {
        container: `
        <div class="imerss-region-filter">
            <div class="imerss-filter-title">%filterName:</div>
            <div class="imerss-filter-body imerss-region-filter-rows">%rows</div>
        </div>
        `
    },
    // fieldName
    // filterName
    members: {
        values: "@expand:fluid.computed(hortis.regionFilter.computeValues, {that}.obsRows, {that}.options.fieldName)",
        filterState: "@expand:signal({})",
        renderModel: `@expand:fluid.computed(hortis.regionFilter.renderModel, {that}.values,
            {that}.idToLabel, {that}.options.markup, {that}.options.filterName)`
    },
    invokers: {
        idToLabel: "fluid.identity",
        doFilter: "hortis.regionFilter.doFilter({that}.options.fieldName, {arguments}.0, {arguments}.1)",
        reset: "hortis.regionFilter.reset({that})"
    },
    listeners: {
        "onCreate.bindClick": "hortis.regionFilter.bindClick"
    }
});

hortis.regionFilter.doFilter = function (fieldName, obsRows, filterState) {
    const none = Object.keys(filterState).length === 0;

    return none ? obsRows : obsRows.filter(row => filterState[row[fieldName]]);
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


fluid.defaults("hortis.regionFilter.withLookup", {
    // idField,
    // nameField
    members: {
        indirection: "@expand:signal([])"
    },
    invokers: {
        lookupId: "hortis.regionFilter.withLookup.lookupId({that}, {arguments}.0)",
        idToLabel: "{that}.lookupId({arguments}.0)"
    }
});

hortis.regionFilter.withLookup.lookupId = function (that, id) {
    const rows = that.indirection.value;
    return rows.find(row => row[that.options.idField] === id)?.[that.options.nameField];
};

// Compute an array of the distinct values of the field found in the obs
hortis.regionFilter.computeValues = function (obsRows, fieldName) {
    const values = {};
    obsRows.forEach(row => {
        const value = row[fieldName];
        if (value !== undefined && value !== "") {
            values[value] = true;
        }
    });
    return Object.keys(values);
};

hortis.regionFilter.renderModel = function (values, idToLabel, markup, filterName) {
    return {
        filterName,
        rows: values.map(value => hortis.repeatingRowFilter.renderRow(markup.row, idToLabel(value), value)).join("\n")
    };
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
                <div class="imerss-filter-clear imerss-hidden"></div>
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

