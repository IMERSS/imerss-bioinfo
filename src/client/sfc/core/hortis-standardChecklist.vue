<fluid-import src="../filters/hortis-taxonSearchFilter.vue"></fluid-import>
<script src="%@popperjs/core/dist/umd/popper-lite.min.js" fluid-client data-fl-scope="global"></script>
<script src="../../js/i6/imerss-core.js"></script>
<script src="../../js/i6/filters.js"></script>
<script src="../../js/i6/tooltip.js"></script>
<script src="../../js/i6/checklist.js"></script>
<script>
"use strict";

// The checklist of the standard visualisation, of the taxa of the observations surviving the filters. Its search
// filters all observations to a single taxon, as does clicking a name, and it can be downloaded as CSV
fluid.def("hortis.standardChecklist", {
    $layers: ["hortis.checklist.withDownload", "hortis.checklist"],
    label: "Species",
    rootId: "48460", // Life
    filterRanks: ["epifamily", "family", "tribe", "genus", "subgenus", "species"],
    copyChecklistRanks: ["genus", "species"],
    unfoldable: true,
    searchControlId: "fli-imerss-checklist-search",
    rowById: "{vizLoader}.taxa.rowById",
    rowFocus: "{vizLoader}.taxaFromObs",
    search: {
        $component: {
            $layers: "hortis.taxonSearchFilter"
        }
    },
    selectName: "$method:hortis.standardChecklist.selectName({self}, {0}:id)"
});

hortis.standardChecklist.selectName = function (that, id) {
    that.search.select(id);
    // The clicked row is about to be rerendered, so it will never receive the mouseleave which would dismiss its tooltip
    that.hoverAt(null);
};
</script>

<template>
    <div class="imerss-main-checklist imerss-checklist-holder">
        <div class="imerss-panel-label"><span>@{label}</span>
            <span class="imerss-download-button imerss-basic-tooltip" title="Download checklist as CSV" @onclick="{self}.download()">
                <svg width="24" height="24"><use href="#imerss-i-download-wide"/></svg>
            </span>
            <span @id="search"></span>
        </div>
        <div class="imerss-checklist" @id="tree"></div>
    </div>
</template>

<symbols>
    <symbol id="imerss-i-download-wide" viewBox="0 -960 960 960">
        <path d="M480-320 280-520l56-58 104 104v-326h80v326l104-104 56 58-200 200ZM240-160q-33 0-56.5-23.5T160-240v-120h80v120h480v-120h80v120q0 33-23.5 56.5T720-160H240Z"/>
    </symbol>
</symbols>
