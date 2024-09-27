
fluid.defaults("hortis.phenologyFilter", {
    gradeNames: ["hortis.filter", "hortis.dataDrivenFilter", "fluid.stringTemplateRenderingView"],
    ranges: [{
        label: "Early",
        start: "April 1",
        end: "June 15"
    }, {
        label: "Mid",
        start: "June 15",
        end: "August 1"
    }, {
        label: "Late",
        start: "August 1",
        end: "October 1"
    }, {
        label: "Winter",
        start: "October 1",
        end: "April 1"
    }],
    markup: {
        container: `
        <div class="imerss-phenology-filter">
            <div class="imerss-filter-title">Phenology:</div>
            <div class="imerss-filter-body imerss-region-filter-rows">%rows</div>
        </div>
        `,
        row: `
        <div class="imerss-filter-row">
            <div class="imerss-row-checkbox">%checkbox</div>
            <div class="imerss-phenology-label">%rowLabel:</div>
            <div class="imerss-phenology-range">%rowRange</div>
        </div>
        `
    },
    // fieldName
    // filterName
    members: {
        // [year, rangeIndex] => {start, end} in milliseconds for that year
        rangeCache: "@expand:fluid.computed(hortis.phenologyFilter.rangeCache, {that}.obsRows, {that}.options.ranges)",
        values: "@expand:fluid.computed(hortis.regionFilter.computeValues, {that}.obsRows, {that}.options.fieldName)",
        filterState: "@expand:signal([])",
        renderModel: `@expand:fluid.computed(hortis.phenologyFilter.renderModel, {that}.options.ranges, {that}.options.markup)`
    },
    invokers: {
        doFilter: "hortis.phenologyFilter.doFilter({arguments}.0, {arguments}.1, {that}.rangeCache.value)",
        reset: "hortis.phenologyFilter.reset({that})"
    },
    listeners: {
        "onCreate.bindClick": "hortis.phenologyFilter.bindClick"
    }
});

hortis.phenologyFilter.reset = function (that) {
    that.filterState.value = [];
    hortis.resetChecks(that.container[0]);
};

hortis.phenologyFilter.renderRow = function (template, rowLabel, rowRange, rowId) {
    return fluid.stringTemplate(template, {
        rowLabel,
        rowRange,
        checkbox: hortis.rowCheckbox(rowId)
    });
};

hortis.phenologyFilter.renderModel = function (ranges, markup) {
    const renderRange = ({start, end}) => `${start} - ${end}`;
    return {
        rows: ranges.map((range, i) => hortis.phenologyFilter.renderRow(markup.row, range.label, renderRange(range), i)).join("\n")
    };
};

hortis.dayInMs = 24 * 60 * 60 * 1000;

// Compute cache of millisecond range bounds for each year in range found in data (necessary because leap years may disturb)
// side-effect: initialises row with "timestamp" in milliseconds
hortis.phenologyFilter.rangeCache = function (obsRows, ranges) {
    const [minYear, maxYear] = obsRows.reduce(([min, max], row) => {
        const date = new Date(row.eventDate);
        const year = date.getFullYear();
        // OCTOPOKHO: Side effect initialising year, timestamp on obs rows
        row.year = year;
        row.timestamp = date.getTime();
        return isNaN(year) ? [min, max] : [Math.min(min, year), Math.max(max, year)];
    }, [Number.MAX_VALUE, Number.MIN_VALUE]);
    const years = fluid.iota(1 + maxYear - minYear, minYear);
    const values = years.map(year => {
        return ranges.map(({start, end}) =>
            ({
                start: Date.parse(`${start} ${year}`),
                end: Date.parse(`${end} ${year}`) + hortis.dayInMs
            })
        ).map(({start, end}) => start > end ? {
            start, end,
            wrapped: true,
            yearStart: Date.parse(`January 1 ${year}`),
            yearEnd: Date.parse(`December 31 ${year}`) + hortis.dayInMs
        } : {start, end});
    });
    return Object.fromEntries(years.map((year, index) => [year, values[index]]));
};

hortis.phenologyFilter.doFilter = function (obsRows, filterState, rangeCache) {
    const none = filterState.every(oneFilter => !oneFilter);
    const passCache = (timestamp, cache) => cache.wrapped ?
        timestamp >= cache.start && timestamp <= cache.yearEnd || timestamp >= cache.yearStart && timestamp < cache.end :
        timestamp >= cache.start && timestamp < cache.end;
    const passFilter = (row, rangeIndex) => {
        const cache = !isNaN(row.year) && rangeCache[row.year][rangeIndex];
        return cache ? passCache(row.timestamp, cache) : false;
    };

    return none ? obsRows : obsRows.filter(row => filterState.some((checked, rangeIndex) => checked ? passFilter(row, rangeIndex) : false));
};

// cf. hortis.checklist.bindCheckboxClick
hortis.phenologyFilter.bindClick = function (that) {
    that.container.on("click", ".pretty input", function () {
        const id = this.dataset.rowId;
        fluid.log("Filter clicked with row " + id);
        const filterState = [...that.filterState.value];
        filterState[id] = this.checked;
        that.filterState.value = filterState;
    });
};