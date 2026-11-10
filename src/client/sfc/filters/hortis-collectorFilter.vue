<fluid-import src="../components/hortis-autocomplete.vue"></fluid-import>
<script src="../../js/i6/imerss-core.js"></script>
<script src="../../js/i6/filters.js"></script>
<script>
"use strict";

// Filters observations by a single collector chosen with an autocomplete
fluid.def("hortis.collectorFilter", {
    $layers: ["hortis.autocompleteHost", "hortis.obsDrivenFilter", "hortis.urlMappedFilter"],
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
    confirmAutocomplete: "$method:hortis.collectorFilter.confirm({self}, {0}:selection)"
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
</script>

<template>
    <div class="imerss-collector-filter">
        <label class="imerss-filter-title" for="@{controlId}">@{filterName}:</label>
        <div class="imerss-filter-body imerss-filter-autocomplete">
            <div @id="autocomplete"></div>
            <div class="imerss-filter-clear imerss-basic-tooltip" @class="fl-hidden:!@{filterState}" title="Reset this filter"
                @onclick="{self}.reset()">
                <svg width="24" height="24"><use href="#imerss-i-x-circle-close"/></svg>
            </div>
        </div>
    </div>
</template>

<symbols>
    <symbol id="imerss-i-x-circle-close" viewBox="0 0 24 24">
        <path d="M16 8L12 12M12 12L8 16M12 12L8 8M12 12L16 16" stroke="#808080" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <circle cx="12" cy="12" r="10" fill="none" stroke="#808080" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </symbol>
</symbols>
