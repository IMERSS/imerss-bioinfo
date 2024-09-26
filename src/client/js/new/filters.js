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
var {effect} = preactSignalsCore;

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

fluid.defaults("hortis.dataDrivenFilter", {
    members: {
        obsRows: "{hortis.filters}.obsRows"
    }
});

fluid.defaults("hortis.regionFilter", {
    gradeNames: ["hortis.filter", "hortis.dataDrivenFilter", "hortis.repeatingRowFilter", "fluid.stringTemplateRenderingView"],
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