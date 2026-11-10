<fluid-import src="../core/hortis-icons.vue"></fluid-import>
<script>
"use strict";

// The button resetting every filter and checklist beneath the visualisation loader
fluid.def("hortis.filterControls", {
    $layers: ["hortis.icons", "fluid.component"],
    filters: "{vizLoader hortis.filter}",
    checklists: "{vizLoader hortis.checklist}",
    resetAll: "$method:hortis.filterControls.resetAll({self}.filters, {self}.checklists)"
});

hortis.filterControls.resetAll = function (filters, checklists) {
    filters.forEach(filter => filter.reset());
    checklists.forEach(checklist => checklist.reset());
};
</script>

<template>
    <span class="imerss-filter-controls">
        <button class="imerss-linkbtn imerss-reset-filter" type="button" title="Reset all filters and selections" @onclick="{self}.resetAll()">
            <svg width="13" height="13" aria-hidden="true"><use href="#imerss-i-reset"/></svg> Reset
        </button>
    </span>
</template>
