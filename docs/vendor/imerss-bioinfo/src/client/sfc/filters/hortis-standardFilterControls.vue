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

<symbols>
    <symbol id="imerss-i-filter-reset" viewBox="0 0 32 32">
        <path d="M22.5,9A7.4522,7.4522,0,0,0,16,12.792V8H14v8h8V14H17.6167A5.4941,5.4941,0,1,1,22.5,22H22v2h.5a7.5,7.5,0,0,0,0-15Z"/>
        <path d="M26,6H4V9.171l7.4142,7.4143L12,17.171V26h4V24h2v2a2,2,0,0,1-2,2H12a2,2,0,0,1-2-2V18L2.5858,10.5853A2,2,0,0,1,2,9.171V6A2,2,0,0,1,4,4H26Z"/>
    </symbol>
</symbols>
