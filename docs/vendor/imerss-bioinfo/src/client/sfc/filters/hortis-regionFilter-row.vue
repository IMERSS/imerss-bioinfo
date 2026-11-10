<script>
"use strict";

// The row for one region of hortis.regionFilter, whose checkbox selects or deselects it
fluid.def("hortis.regionFilter.row", {
    $layers: "fluid.component",
    checked: "$compute:hortis.regionFilter.isChecked({regionFilter}.filterState, {self}.index)",
    toggle: "$method:hortis.regionFilter.toggle({regionFilter}, {self}.index, {0}:checked)"
});
</script>

<template>
    <div class="imerss-filter-row">
        <div class="imerss-row-checkbox">
            <span class="pretty p-icon">
                <input type="checkbox" class="checklist-check" checked="@{checked}" @onchange="hortis.regionFilter.rowChange({0}, {self})"/>
                <span class="state p-success"><i class="icon mdi mdi-check"></i><label></label></span>
            </span>
        </div>
        <div class="imerss-row-label">@{region.label}</div>
    </div>
</template>
