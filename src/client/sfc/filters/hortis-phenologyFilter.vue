<fluid-import src="hortis-phenologyFilter-row.vue"></fluid-import>
<fluid-import src="../components/hortis-dualRangeInput.vue"></fluid-import>
<script src="../../js/i6/imerss-core.js"></script>
<script src="../../js/i6/filters.js"></script>
<script>
"use strict";

hortis.months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October",
    "November", "December"];

hortis.shortMonths = hortis.months.map(month => month.substring(0, 3));

// The number of milliseconds in a day, by which an observation's date is converted to the number of its day since
// the epoch, in UTC
hortis.dayMillis = 24 * 60 * 60 * 1000;

// Filters observations by when they were made, in either of two modes - by the months of the year in which they were
// made, chosen with a checkbox for each month, or by a period between two days, chosen with a dual range input. The
// modes are exclusive - once either has been operated, the other is disabled until the filter is reset
fluid.def("hortis.phenologyFilter", {
    $layers: ["hortis.obsDrivenFilter", "hortis.urlMappedFilter"],
    urlCodec: "hortis.phenologyFilter.urlCodec",
    // Member `months` holds one record per month - each month's row is a subcomponent whose checkbox is bound two-way
    // to its record's `checked`, which it writes through to this array since the $for source is sited. Member `days`
    // holds the period chosen, with members `lower` and `upper`, the numbers of its first and last days, or null if
    // none is chosen
    filterState: {
        $reactiveRoot: {
            months: hortis.months.map(month => ({month, checked: false})),
            days: null
        }
    },
    // true when any month is checked, which disables the choice of a period
    monthsActive: "$compute:hortis.phenologyFilter.monthsActive({self}.filterState)",
    // true when a period is chosen, which disables the checkboxes of the months
    daysActive: "$compute:hortis.phenologyFilter.daysActive({self}.filterState)",
    // Month and day of each observation, cached by row rather than written onto it, with the range of its days
    dateCache: "$compute:hortis.phenologyFilter.dateCache({self}.obsRows)",
    filterSummary: "$compute:hortis.phenologyFilter.summarise({self}.filterState)",
    doFilter: "$method:hortis.phenologyFilter.doFilter({0}:obsRows, {1}:filterState, {self}.dateCache)",
    reset: "$method:hortis.phenologyFilter.reset({self})",
    monthRows: {
        $component: {
            $layers: "hortis.phenologyFilter.row",
            $for: {
                source: "{phenologyFilter}.filterState.months",
                valueAs: "range",
                keyAs: "index"
            },
            disabled: "{phenologyFilter}.daysActive"
        }
    },
    dualRangeInput: {
        $component: {
            $layers: "hortis.dualRangeInput",
            minRange: "{phenologyFilter}.dateCache.lower",
            maxRange: "{phenologyFilter}.dateCache.upper",
            formatter: "hortis.phenologyFilter.formatDay",
            thumbLabels: true,
            ticks: "$compute:hortis.phenologyFilter.monthTicks({self}.minRange, {self}.maxRange)",
            disabled: "{phenologyFilter}.monthsActive",
            // The period shown by the input is the filter's chosen period, or the whole period of the data if none
            // is chosen - moving the input to the whole period clears it
            range: {
                $lens: {
                    source: "{phenologyFilter}.filterState",
                    path: "days",
                    forward: "hortis.phenologyFilter.toRange({0}, {self}.minRange, {self}.maxRange)",
                    backward: "hortis.phenologyFilter.toState({0}, {self}.minRange, {self}.maxRange)"
                }
            }
        }
    }
});

/**
 * Convert the date of an observation to the number of its day since the epoch.
 * @param {String} eventDate - The date, e.g. "2024-04-01"
 * @return {Number} The number of its day, or NaN if it has no valid date
 */
hortis.phenologyFilter.toDay = function (eventDate) {
    return Math.floor(Date.parse(eventDate) / hortis.dayMillis);
};

/**
 * Format the number of a day in the style "1 Apr 24".
 * @param {Number} day - The number of the day since the epoch
 * @return {String} The formatted day
 */
hortis.phenologyFilter.formatDay = function (day) {
    const date = new Date(day * hortis.dayMillis);
    return date.getUTCDate() + " " + hortis.shortMonths[date.getUTCMonth()] + " " + String(date.getUTCFullYear()).slice(-2);
};

/**
 * Compute the month and day of each observation, and the range of its days.
 * @param {Object[]} obsRows - The observations, each with an `eventDate`
 * @return {Object} Members `months`, a Map of each observation row to its month, from 0 to 11, `days`, a Map of each
 * observation row with a valid date to the number of its day, and `lower` and `upper` bounding those days
 */
hortis.phenologyFilter.dateCache = function (obsRows) {
    const cache = {months: new Map(), days: new Map(), lower: Number.POSITIVE_INFINITY, upper: Number.NEGATIVE_INFINITY};
    obsRows.forEach(row => {
        cache.months.set(row, new Date(row.eventDate).getMonth());
        const day = hortis.phenologyFilter.toDay(row.eventDate);
        if (!isNaN(day)) {
            cache.days.set(row, day);
            cache.lower = Math.min(day, cache.lower);
            cache.upper = Math.max(day, cache.upper);
        }
    });
    if (cache.days.size === 0) {
        cache.lower = cache.upper = 0;
    }
    return cache;
};

/**
 * Compute the detents of the dual range input - the first day of each month falling within the period of the data.
 * @param {Number} minRange - The first day of the data
 * @param {Number} maxRange - The last day of the data
 * @return {Number[]} The first day of each month within it
 */
hortis.phenologyFilter.monthTicks = function (minRange, maxRange) {
    const ticks = [];
    const first = new Date(minRange * hortis.dayMillis);
    for (let month = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 1)); month.getTime() / hortis.dayMillis <= maxRange;
        month = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1))) {
        ticks.push(month.getTime() / hortis.dayMillis);
    }
    return ticks;
};

hortis.phenologyFilter.monthsActive = function (filterState) {
    return filterState.months.some(range => range.checked);
};

hortis.phenologyFilter.daysActive = function (filterState) {
    return !!filterState.days;
};

/**
 * Compute the period shown by the dual range input from the filter's chosen period.
 * @param {Object|null} days - The chosen period, with members `lower` and `upper`, or null if there is none
 * @param {Number} minRange - The first day of the data
 * @param {Number} maxRange - The last day of the data
 * @return {Object} The period shown, with members `min` and `max`
 */
hortis.phenologyFilter.toRange = function (days, minRange, maxRange) {
    return days ? {min: days.lower, max: days.upper} : {min: minRange, max: maxRange};
};

/**
 * Compute the filter's chosen period from the period chosen with the dual range input.
 * @param {Object} range - The period chosen, with members `min` and `max`
 * @param {Number} minRange - The first day of the data
 * @param {Number} maxRange - The last day of the data
 * @return {Object|null} The chosen period, with members `lower` and `upper`, or null if it is the whole period of
 * the data
 */
hortis.phenologyFilter.toState = function (range, minRange, maxRange) {
    return range.min === minRange && range.max === maxRange ? null : {lower: range.min, upper: range.max};
};

hortis.phenologyFilter.emptyState = function () {
    return {months: hortis.months.map(month => ({month, checked: false})), days: null};
};

/**
 * Format the number of a day as an ISO date, e.g. "2024-04-01".
 * @param {Number} day - The number of the day since the epoch
 * @return {String} The ISO date
 */
hortis.phenologyFilter.isoDay = function (day) {
    return new Date(day * hortis.dayMillis).toISOString().substring(0, 10);
};

// The filter's state as held in the URL - the months selected, as their numbers from 1 to 12 separated by commas, or
// the period chosen, as its first and last days as ISO dates separated by "~", e.g. 2024-04-01~2024-06-15
hortis.phenologyFilter.urlCodec = {
    encode: function (filterState) {
        const months = filterState.months.map((range, index) => range.checked ? index + 1 : 0).filter(month => month);
        const days = filterState.days;
        return days ? hortis.phenologyFilter.isoDay(days.lower) + "~" + hortis.phenologyFilter.isoDay(days.upper) :
            months.length === 0 ? undefined : months.join(",");
    },
    decode: function (text) {
        const state = hortis.phenologyFilter.emptyState();
        const encoded = text === undefined ? "" : String(text);
        if (encoded.includes("~")) {
            const [lower, upper] = encoded.split("~").map(hortis.phenologyFilter.toDay);
            state.days = isNaN(lower) || isNaN(upper) ? null : {lower, upper};
        } else {
            const months = new Set(encoded.split(",").map(Number));
            state.months.forEach((range, index) => {
                range.checked = months.has(index + 1);
            });
        }
        return state;
    }
};

hortis.phenologyFilter.reset = function (that) {
    that.filterState = hortis.phenologyFilter.emptyState();
};

/**
 * Summarise the phenology filter by the number of months selected, or by the period chosen.
 * @param {Object} filterState - The filter state, with members `months` and `days`
 * @return {FilterSummary} The summary of the filter
 */
hortis.phenologyFilter.summarise = function (filterState) {
    return filterState.days ? {
        count: 1,
        dot: true,
        title: "A period is set, from " + hortis.phenologyFilter.formatDay(filterState.days.lower) + " to " +
            hortis.phenologyFilter.formatDay(filterState.days.upper)
    } : hortis.countSummary(filterState.months.filter(range => range.checked).length, ["month", "months"]);
};

hortis.phenologyFilter.doFilter = function (obsRows, filterState, dateCache) {
    const days = filterState.days;
    const selected = new Set(filterState.months.map((range, index) => range.checked ? index : -1).filter(index => index !== -1));
    return days ? obsRows.filter(row => {
        const day = dateCache.days.get(row);
        return day >= days.lower && day <= days.upper;
    }) : selected.size === 0 ? obsRows : obsRows.filter(row => selected.has(dateCache.months.get(row)));
};
</script>

<template>
    <div class="imerss-phenology-filter">
        <div class="imerss-filter-title">Phenology:</div>
        <div class="imerss-phenology-mode imerss-phenology-months" @class="imerss-disabled:@{daysActive}">
            <div class="imerss-phenology-mode-title">By month</div>
            <div class="imerss-filter-body imerss-region-filter-rows" @id="monthRows"></div>
        </div>
        <div class="imerss-phenology-mode imerss-phenology-period" @class="imerss-disabled:@{monthsActive}">
            <div class="imerss-phenology-mode-title">By period</div>
            <div class="imerss-filter-body" @id="dualRangeInput"></div>
        </div>
    </div>
</template>
