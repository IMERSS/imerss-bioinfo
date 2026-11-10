<fluid-import src="hortis-valueFilter-row.vue"></fluid-import>
<script src="../../js/i6/imerss-core.js"></script>
<script src="../../js/i6/filters.js"></script>
<style src="%pretty-checkbox/dist/pretty-checkbox.min.css"></style>
<script>
"use strict";

// Filters taxon rows by the value of one of their fields, offering a checkbox for each value - or by a value computed
// from each row by the global function named by `valueOf`, e.g. hortis.graminoidValue
fluid.def("hortis.valueFilter", {
    $layers: ["hortis.taxaFilter", "hortis.urlMappedFilter"],
    // Several value filters may be held in a list, and so each is keyed in the URL by its field
    urlKey: "{self}.fieldName",
    urlCodec: "hortis.urlCodecs.keys",
    // filterName: String
    // fieldName: String
    // fieldValues: String[]
    fieldLabels: null,
    valueOf: null,
    // Hash of each selected value to true
    filterState: {},
    rows: "$compute:hortis.valueFilter.rows({self}.fieldValues, {self}.fieldLabels)",
    filterSummary: "$compute:hortis.keyCountSummary({self}.filterState, {self}.summaryNouns)",
    summaryNouns: ["value", "values"],
    doFilter: "$method:hortis.valueFilter.doFilter({0}:rows, {1}:filterState, {self}.fieldName, {self}.valueOf)",
    reset: "$method:hortis.valueFilter.reset({self})",
    valueRows: {
        $component: {
            $layers: "hortis.valueFilter.row",
            $for: {
                source: "{valueFilter}.rows",
                valueAs: "row"
            }
        }
    }
});
</script>

<template>
    <div class="imerss-value-filter imerss-filter">
        <div class="imerss-filter-title">@{filterName}:</div>
        <div class="imerss-filter-body imerss-value-filter-rows" @id="valueRows"></div>
    </div>
</template>
