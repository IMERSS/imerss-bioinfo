<script>
"use strict";

// The row for one month of hortis.phenologyFilter. Its checkbox's live state is written back through the $for
// iteration variable to the filter's state. It is disabled whilst the filter chooses a period instead
fluid.def("hortis.phenologyFilter.row", {
    $layers: "fluid.component",
    disabled: false
});
</script>

<template>
    <div class="imerss-filter-row">
        <div class="imerss-row-checkbox">
            <span class="pretty p-icon">
                <input type="checkbox" class="checklist-check" checked="@{range.checked}" disabled="@{disabled}"/>
                <span class="state p-success"><i class="icon mdi mdi-check"></i><label></label></span>
            </span>
        </div>
        <div class="imerss-phenology-label">@{range.month}</div>
    </div>
</template>
