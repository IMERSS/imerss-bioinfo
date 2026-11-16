<script src="../../js/i6/imerss-core.js"></script>
<script src="../../js/i6/filters.js"></script>
<script>
"use strict";

// Filters observations by the sex of the bee
fluid.def("hortis.sexFilter", {
    $layers: ["hortis.obsFilter", "hortis.urlMappedFilter"],
    urlKey: "sex",
    urlCodec: "hortis.sexFilter.urlCodec",
    // Bound two-way to the checkboxes in the template
    filterState: {
        $reactiveRoot: {
            male: false,
            female: false
        }
    },
    filterSummary: "$compute:hortis.sexFilter.summarise({self}.filterState)",
    predicates: "$compute:hortis.sexFilter.predicates({self}.filterState)",
    reset: "$method:hortis.sexFilter.reset({self})"
});

hortis.sexFilter.urlCodec = hortis.urlCodecs.flags(["male", "female"]);

hortis.sexFilter.reset = function (that) {
    that.filterState = {male: false, female: false};
};

/**
 * Summarise the sex filter by the number of sexes selected.
 * @param {Object} filterState - The filter state, with Boolean members `male` and `female`
 * @return {FilterSummary} The summary of the filter
 */
hortis.sexFilter.summarise = function (filterState) {
    return hortis.countSummary((filterState.male ? 1 : 0) + (filterState.female ? 1 : 0), ["sex", "sexes"]);
};

/**
 * Compute the predicates of the sex filter - every observation is selected unless just one sex is chosen.
 * @param {Object} filterState - The filter state, with Boolean members `male` and `female`
 * @return {Object[]} The predicates
 */
hortis.sexFilter.predicates = function (filterState) {
    const sexes = [filterState.female ? "F" : null, filterState.male ? "M" : null].filter(sex => sex);
    return sexes.length === 0 ? [] : [{field: "sex", op: "in", value: sexes}];
};
</script>

<template>
    <div class="imerss-sex-filter imerss-inline">
        <span class="imerss-inline-label">Sex</span>
        <label class="imerss-inline-check">
            <span class="pretty p-icon">
                <input type="checkbox" class="checklist-check" checked="@{filterState.female}"/>
                <span class="state p-success"><i class="icon mdi mdi-check"></i><label></label></span>
            </span>Female</label>
        <label class="imerss-inline-check">
            <span class="pretty p-icon">
                <input type="checkbox" class="checklist-check" checked="@{filterState.male}"/>
                <span class="state p-success"><i class="icon mdi mdi-check"></i><label></label></span>
            </span>Male</label>
    </div>
</template>
