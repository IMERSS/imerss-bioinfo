<fluid-import src="hortis-phenologyFilter-row.vue"></fluid-import>
<fluid-import src="../components/hortis-dualRangeInput.vue"></fluid-import>
<script src="../../js/i6/imerss-core.js"></script>
<script src="../../js/i6/filters.js"></script>
<script>
"use strict";

hortis.months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October",
    "November", "December"];

hortis.shortMonths = hortis.months.map(month => month.substring(0, 3));

// The number of milliseconds in a day, by which an observation's date is converted to the number of its day
hortis.dayMillis = 24 * 60 * 60 * 1000;

fluid.registerNamespace("hortis.phenologyFilter");

// The year in which each day of the year is placed, by which it is numbered - a leap year, so that 29 February has a
// day of its own, and an observation made on any day of any year falls on the same day of the year as one made on that
// day of any other
hortis.phenologyFilter.referenceYear = 2000;

/**
 * Number a day of the year, from 0 for 1 January to 365 for 31 December.
 * @param {Number} month - The month, from 0 for January to 11 for December
 * @param {Number} date - The day of the month, from 1
 * @return {Number} The number of the day in the year
 */
hortis.phenologyFilter.dayOfYear = function (month, date) {
    const year = hortis.phenologyFilter.referenceYear;
    return (Date.UTC(year, month, date) - Date.UTC(year, 0, 1)) / hortis.dayMillis;
};

// The number of 31 December, the last day of the year
hortis.phenologyFilter.lastDay = () => hortis.phenologyFilter.dayOfYear(11, 31);

/**
 * Convert the date of an observation to the number of its day in the year. A date without a time, e.g. "2024-04-01",
 * is read as UTC, so that its month and day are read in UTC too.
 * @param {String} eventDate - The date, e.g. "2024-04-01"
 * @return {Number} The number of its day in the year, or NaN if it has no valid date
 */
hortis.phenologyFilter.toDay = function (eventDate) {
    const millis = Date.parse(eventDate);
    const date = new Date(millis);
    return isNaN(millis) ? NaN : hortis.phenologyFilter.dayOfYear(date.getUTCMonth(), date.getUTCDate());
};

/**
 * Format the number of a day of the year in the style "1 Apr".
 * @param {Number} day - The number of the day in the year
 * @return {String} The formatted day
 */
hortis.phenologyFilter.formatDay = function (day) {
    const date = new Date(Date.UTC(hortis.phenologyFilter.referenceYear, 0, 1) + day * hortis.dayMillis);
    return date.getUTCDate() + " " + hortis.shortMonths[date.getUTCMonth()];
};

/**
 * Compute the detents of the dual range input - the first day of each month, and the end of the year, so that the
 * months lie between them.
 * @return {Number[]} The number in the year of the first day of each month, followed by that of 31 December
 */
hortis.phenologyFilter.monthTicks = function () {
    return [...fluid.iota(12).map(month => hortis.phenologyFilter.dayOfYear(month, 1)), hortis.phenologyFilter.lastDay()];
};

// The labels of the months between the detents - their first three letters, or their first letters if space is short
hortis.phenologyFilter.monthLabels = hortis.months.map(month => ({long: month.substring(0, 3), short: month.substring(0, 1)}));

// Filters observations by when in the year they were made, whatever the year, in either of two modes - by the months in
// which they were made, chosen with a checkbox for each month, or by a period of the year between two days, from 1 January
// to 31 December, chosen with a dual range input. The modes are exclusive - once either has been operated, the other is
// disabled until the filter is reset
fluid.def("hortis.phenologyFilter", {
    $layers: ["hortis.obsDrivenFilter", "hortis.urlMappedFilter"],
    urlCodec: "hortis.phenologyFilter.urlCodec",
    // Member `months` holds one record per month - each month's row is a subcomponent whose checkbox is bound two-way
    // to its record's `checked`, which it writes through to this array since the $for source is sited. Member `days`
    // holds the period of the year chosen, with members `lower` and `upper`, the numbers in the year of its first and
    // last days - see hortis.phenologyFilter.dayOfYear - or null if none is chosen
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
    // Month and day of the year of each observation, cached by row rather than written onto it
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
            // The whole year, from 1 January to 31 December
            minRange: 0,
            maxRange: hortis.phenologyFilter.lastDay(),
            formatter: "hortis.phenologyFilter.formatDay",
            thumbLabels: true,
            ticks: hortis.phenologyFilter.monthTicks(),
            tickLabels: hortis.phenologyFilter.monthLabels,
            // The ends of the year are plain, and the period chosen is shown beneath the thumbs
            valueLabels: false,
            disabled: "{phenologyFilter}.monthsActive",
            // The period shown by the input is the filter's chosen period, or the whole year if none is chosen -
            // moving the input to the whole year clears it
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
 * Compute the month and day of the year of each observation.
 * @param {Object[]} obsRows - The observations, each with an `eventDate`
 * @return {Object} Members `months`, a Map of each observation row to its month, from 0 to 11, and `days`, a Map of
 * each observation row with a valid date to the number of its day in the year
 */
hortis.phenologyFilter.dateCache = function (obsRows) {
    const cache = {months: new Map(), days: new Map()};
    obsRows.forEach(row => {
        cache.months.set(row, new Date(row.eventDate).getUTCMonth());
        const day = hortis.phenologyFilter.toDay(row.eventDate);
        if (!isNaN(day)) {
            cache.days.set(row, day);
        }
    });
    return cache;
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
 * @param {Number} minRange - The first day of the year
 * @param {Number} maxRange - The last day of the year
 * @return {Object} The period shown, with members `min` and `max`
 */
hortis.phenologyFilter.toRange = function (days, minRange, maxRange) {
    return days ? {min: days.lower, max: days.upper} : {min: minRange, max: maxRange};
};

/**
 * Compute the filter's chosen period from the period chosen with the dual range input.
 * @param {Object} range - The period chosen, with members `min` and `max`
 * @param {Number} minRange - The first day of the year
 * @param {Number} maxRange - The last day of the year
 * @return {Object|null} The chosen period, with members `lower` and `upper`, or null if it is the whole year
 */
hortis.phenologyFilter.toState = function (range, minRange, maxRange) {
    return range.min === minRange && range.max === maxRange ? null : {lower: range.min, upper: range.max};
};

hortis.phenologyFilter.emptyState = function () {
    return {months: hortis.months.map(month => ({month, checked: false})), days: null};
};

/**
 * Format the number of a day of the year as its month and day, e.g. "04-01" for 1 April.
 * @param {Number} day - The number of the day in the year
 * @return {String} The month and day
 */
hortis.phenologyFilter.monthDay = function (day) {
    return new Date(Date.UTC(hortis.phenologyFilter.referenceYear, 0, 1) + day * hortis.dayMillis).toISOString().substring(5, 10);
};

/**
 * Read a day of the year held in the URL as its month and day, e.g. "04-01". A full date, e.g. "2024-04-01", as
 * held by earlier versions of the filter, is read by its month and day.
 * @param {String} text - The month and day
 * @return {Number} The number of the day in the year, or NaN if it is not a valid one
 */
hortis.phenologyFilter.parseMonthDay = function (text) {
    const match = /(\d{2})-(\d{2})$/.exec(text);
    const month = match ? +match[1] - 1 : NaN, date = match ? +match[2] : NaN;
    const valid = month >= 0 && month <= 11 && date >= 1 &&
        date <= new Date(Date.UTC(hortis.phenologyFilter.referenceYear, month + 1, 0)).getUTCDate();
    return valid ? hortis.phenologyFilter.dayOfYear(month, date) : NaN;
};

// The filter's state as held in the URL - the months selected, as their numbers from 1 to 12 separated by commas, or
// the period of the year chosen, as the months and days of its first and last days separated by "~", e.g. 04-01~06-15
hortis.phenologyFilter.urlCodec = {
    encode: function (filterState) {
        const months = filterState.months.map((range, index) => range.checked ? index + 1 : 0).filter(month => month);
        const days = filterState.days;
        return days ? hortis.phenologyFilter.monthDay(days.lower) + "~" + hortis.phenologyFilter.monthDay(days.upper) :
            months.length === 0 ? undefined : months.join(",");
    },
    decode: function (text) {
        const state = hortis.phenologyFilter.emptyState();
        const encoded = text === undefined ? "" : String(text);
        if (encoded.includes("~")) {
            const [lower, upper] = encoded.split("~").map(hortis.phenologyFilter.parseMonthDay);
            state.days = isNaN(lower) || isNaN(upper) || lower > upper ? null : {lower, upper};
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
        title: "A period of the year is set, from " + hortis.phenologyFilter.formatDay(filterState.days.lower) + " to " +
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
