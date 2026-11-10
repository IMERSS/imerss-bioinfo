<fluid-import src="../components/hortis-dualRangeInput.vue"></fluid-import>
<script src="../../js/i6/imerss-core.js"></script>
<script src="../../js/i6/filters.js"></script>
<script>
"use strict";

// Filters observations to a range of elevations chosen with a dual range input
fluid.def("hortis.elevationFilter", {
    $layers: ["hortis.obsDrivenFilter", "hortis.urlMappedFilter"],
    urlCodec: "hortis.urlCodecs.range",
    fieldName: "verbatimElevation",
    rangeCache: "$compute:hortis.elevationFilter.rangeCache({self}.obsRows, {self}.fieldName)",
    // The selected range, with members `lower` and `upper`, or null if the whole range of the data is selected. This
    // is free to be held elsewhere, e.g. in the URL - the dual range input views it through a lens
    filterState: null,
    filterSummary: "$compute:hortis.elevationFilter.summarise({self}.filterState)",
    doFilter: "$method:hortis.elevationFilter.doFilter({0}:obsRows, {1}:filterState, {self}.rangeCache)",
    reset: "$method:hortis.elevationFilter.reset({self})",
    dualRangeInput: {
        $component: {
            $layers: "hortis.dualRangeInput",
            minRange: "{elevationFilter}.rangeCache.lower",
            maxRange: "{elevationFilter}.rangeCache.upper",
            unit: " m",
            // The range shown by the input is the filter's state, or the whole range of the data if it has none -
            // moving the input to the whole range clears the state
            range: {
                $lens: {
                    source: "{elevationFilter}.filterState",
                    forward: "hortis.elevationFilter.toRange({0}, {self}.minRange, {self}.maxRange)",
                    backward: "hortis.elevationFilter.toState({0}, {self}.minRange, {self}.maxRange)"
                }
            }
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

/**
 * Compute the range shown by the dual range input from the filter's state.
 * @param {Object|null} filterState - The selected range, with members `lower` and `upper`, or null if there is none
 * @param {Number} minRange - The lowest elevation in the data
 * @param {Number} maxRange - The highest elevation in the data
 * @return {Object} The range shown, with members `min` and `max`
 */
hortis.elevationFilter.toRange = function (filterState, minRange, maxRange) {
    return filterState ? {min: filterState.lower, max: filterState.upper} : {min: minRange, max: maxRange};
};

/**
 * Compute the filter's state from the range chosen with the dual range input.
 * @param {Object} range - The range chosen, with members `min` and `max`
 * @param {Number} minRange - The lowest elevation in the data
 * @param {Number} maxRange - The highest elevation in the data
 * @return {Object|null} The selected range, with members `lower` and `upper`, or null if it is the whole range of the data
 */
hortis.elevationFilter.toState = function (range, minRange, maxRange) {
    return range.min === minRange && range.max === maxRange ? null : {lower: range.min, upper: range.max};
};

hortis.elevationFilter.reset = function (that) {
    that.filterState = null;
};

/**
 * Summarise the elevation filter, which is active when its range has been narrowed from the full range of the data.
 * @param {Object|null} filterState - The selected range, with members `lower` and `upper`, or null if there is none
 * @return {FilterSummary} The summary of the filter
 */
hortis.elevationFilter.summarise = function (filterState) {
    return {
        count: filterState ? 1 : 0,
        dot: true,
        title: "An elevation range is set"
    };
};

hortis.elevationFilter.doFilter = function (obsRows, filterState, rangeCache) {
    return filterState === null ? obsRows : obsRows.filter(row => {
        const elevation = rangeCache.elevations.get(row);
        return elevation >= filterState.lower && elevation <= filterState.upper;
    });
};
</script>

<template>
    <div class="imerss-elevation-filter">
        <div class="imerss-filter-title">Elevation:</div>
        <div class="imerss-filter-body" @id="dualRangeInput"></div>
    </div>
</template>
