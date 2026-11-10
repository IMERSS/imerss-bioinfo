<fluid-import src="../components/hortis-autocomplete.vue"></fluid-import>
<script src="../../js/i6/imerss-core.js"></script>
<script src="../../js/i6/filters.js"></script>
<script src="../../js/i6/checklist.js"></script>
<script>
"use strict";

// A search box over a checklist's displayed taxa - choosing a taxon selects it in the checklist, accreting a
// multiple selection. Its functions are defined in checklist.js
fluid.def("hortis.checklist.search", {
    $layers: "hortis.autocompleteHost",
    controlId: "{checklist}.searchControlId",
    placeholder: "Search taxa ...",
    minLength: 2,
    renderSuggestion: "hortis.autocompleteSuggestionForTaxonRow",
    renderInputValue: "hortis.autocompleteInputForTaxonRow",
    rows: "$compute:hortis.checklist.entryRows({checklist}.idToEntry)",
    queryAutocomplete: "$method:hortis.checklist.querySearch({self}.rows, {0}:query, {1}:callback, {self}.maxSuggestions)",
    confirmAutocomplete: "$method:hortis.checklist.confirmSearch({checklist}, {self}.controlId, {0}:selection, {global}.document)"
});
</script>

<template>
    <span class="imerss-search-checklist">
        <span class="imerss-filter-autocomplete"><div @id="autocomplete"></div></span>
        <svg width="32" height="32"><use href="#imerss-i-search-wide"/></svg>
    </span>
</template>

<symbols>
    <symbol id="imerss-i-search-wide" viewBox="0 0 24 24" stroke="currentColor" fill="none">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
    </symbol>
</symbols>
