<fluid-import src="hortis-regionFilter-row.vue"></fluid-import>
<script src="../../js/i6/imerss-core.js"></script>
<script src="../../js/i6/filters.js"></script>
<style src="%pretty-checkbox/dist/pretty-checkbox.min.css"></style>
<style src="https://cdn.materialdesignicons.com/2.0.46/css/materialdesignicons.min.css"></style>
<script>
"use strict";

// Filters observations by the regions in which they lie, offering a checkbox for each row of a region indirection
// table, with members `regionField`, the column of the observations holding the region, `id`, the value found there
// and `label`. Rows of the regionFields `fieldNames` are offered - e.g. ["dataset"] for a filter by dataset
fluid.def("hortis.regionFilter", {
    $layers: ["hortis.obsFilter", "hortis.urlMappedFilter"],
    urlCodec: "hortis.urlCodecs.keys",
    filterName: "Region",
    // fieldNames: String[]
    // indirectionRows: Object[]
    summaryNouns: ["region", "regions"],
    filterRows: "$compute:hortis.regionFilter.filterRows({self}.indirectionRows, {self}.fieldNames)",
    // Hash of the index of each selected row of filterRows to true
    filterState: {},
    filterSummary: "$compute:hortis.keyCountSummary({self}.filterState, {self}.summaryNouns)",
    doFilter: "$method:hortis.regionFilter.doFilter({self}.filterRows, {0}:obsRows, {1}:filterState)",
    reset: "$method:hortis.regionFilter.reset({self})",
    regionRows: {
        $component: {
            $layers: "hortis.regionFilter.row",
            $for: {
                source: "{regionFilter}.filterRows",
                valueAs: "region",
                keyAs: "index"
            }
        }
    }
});

hortis.regionFilter.filterRows = function (indirectionRows, fieldNames) {
    return indirectionRows.filter(row => fieldNames.includes(row.regionField));
};

hortis.regionFilter.isChecked = (filterState, index) => !!filterState[index];

hortis.regionFilter.toggle = function (that, index, checked) {
    const filterState = {...that.filterState};
    if (checked) {
        filterState[index] = true;
    } else {
        delete filterState[index];
    }
    that.filterState = filterState;
};

hortis.regionFilter.rowChange = function (event, row) {
    row.toggle(event.target.checked);
};

hortis.regionFilter.reset = function (that) {
    that.filterState = {};
};

hortis.regionFilter.doFilter = function (filterRows, obsRows, filterState) {
    const selected = Object.keys(filterState).map(index => filterRows[index]);
    return selected.length === 0 ? obsRows : obsRows.filter(obsRow => selected.some(iRow => obsRow[iRow.regionField] === iRow.id));
};
</script>

<template>
    <div class="imerss-region-filter">
        <div class="imerss-filter-title">@{filterName}:</div>
        <div class="imerss-filter-body imerss-region-filter-rows" @id="regionRows"></div>
    </div>
</template>
