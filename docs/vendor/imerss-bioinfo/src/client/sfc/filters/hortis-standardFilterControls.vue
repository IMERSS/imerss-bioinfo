<fluid-import src="hortis-filterControls.vue"></fluid-import>
<script>
"use strict";

// The button resetting every filter of the standard visualisation, in its own style
fluid.def("hortis.standardFilterControls", {
    $layers: "hortis.filterControls",
    // The text beside the button - the story page shows the button alone
    label: "Reset filters"
});
</script>

<template>
    <div class="imerss-filter-controls" @onclick="{self}.resetAll()">
        <svg width="24" height="24" class="imerss-reset-filter"><title>Reset all filters</title><use href="#imerss-i-filter-reset"/></svg>
        <div>@{label}</div>
    </div>
</template>
