<fluid-import src="hortis-checklist-search.vue"></fluid-import>
<script src="%@popperjs/core/dist/umd/popper-lite.min.js" fluid-client data-fl-scope="global"></script>
<script src="../../js/i6/imerss-core.js"></script>
<script src="../../js/i6/filters.js"></script>
<script src="../../js/i6/tooltip.js"></script>
<script src="../../js/i6/checklist.js"></script>
<script>
"use strict";

// A checklist of the bees or plants of the BBEA visualisation, with a search box, controls folding its rows to a rank,
// and room for a further filter shown alongside it
fluid.def("hortis.bbeaChecklist", {
    $layers: ["hortis.checklist.withSearch", "hortis.checklist.withRankFold", "hortis.checklist.withFilterSummary", "hortis.checklist.withOBA",
        "hortis.checklist", "hortis.urlMappedFilter"],
    urlCodec: "hortis.urlCodecs.keys",
    selectable: true,
    unfoldable: true,
    rowById: "{vizLoader}.taxa.rowById",
    // A filter shown alongside the checklist - by default there is none, and its slot is omitted
    extraFilter: null
});
</script>

<template>
    <div class="imerss-checklist-holder">
        <span @id="search"></span>
        <div @id="extraFilter"></div>
        <div class="mf-rankfold imerss-rank-fold" @id="rankFold"></div>
        <div class="imerss-scroll mf-tree imerss-checklist" @id="tree"></div>
    </div>
</template>
