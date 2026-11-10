<script src="../../js/i6/filters.js"></script>
<script>
"use strict";

// The row for one value of hortis.valueFilter, whose checkbox selects or deselects it
fluid.def("hortis.valueFilter.row", {
    $layers: "fluid.component",
    checked: "$compute:hortis.valueFilter.isChecked({valueFilter}.filterState, {self}.row.value)",
    toggle: "$method:hortis.valueFilter.toggle({valueFilter}, {self}.row.value, {0}:checked)"
});
</script>

<template>
    <div class="imerss-filter-row">
        <div class="imerss-row-checkbox">
            <span class="pretty p-icon">
                <input type="checkbox" class="checklist-check" checked="@{checked}" @onchange="hortis.valueFilter.rowChange({0}, {self})"/>
                <span class="state p-success"><i class="icon mdi mdi-check"></i><label></label></span>
            </span>
        </div>
        <div class="imerss-row-label">@{row.label}</div>
    </div>
</template>
