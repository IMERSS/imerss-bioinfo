<fluid-import src="../components/hortis-autocomplete.vue"></fluid-import>
<fluid-import src="hortis-collectorFilter.vue"></fluid-import>
<script src="../../js/i6/imerss-core.js"></script>
<script src="../../js/i6/filters.js"></script>
<script src="../../js/i6/checklist.js"></script>
<script>
"use strict";

// A search box over a checklist's displayed taxa, whose chosen taxon becomes a filter of all observations to those of
// that taxon and the taxa beneath it - as used by the standard visualisation, whose checklist selects nothing itself.
// Clicking a name in the checklist chooses its taxon, as if it had been picked from the search
fluid.def("hortis.taxonSearchFilter", {
    $layers: ["hortis.autocompleteHost", "hortis.obsFilter", "hortis.urlMappedFilter"],
    urlKey: "taxon",
    urlCodec: "hortis.urlCodecs.taxonRow",
    controlId: "{checklist}.searchControlId",
    placeholder: "Search taxa ...",
    minLength: 2,
    renderSuggestion: "hortis.autocompleteSuggestionForTaxonRow",
    renderInputValue: "hortis.autocompleteInputForTaxonRow",
    rowById: "{vizLoader}.taxa.rowById",
    // The chosen taxon row, or null if none is chosen
    filterState: null,
    rows: "$compute:hortis.checklist.entryRows({checklist}.idToEntry)",
    filterName: "Taxon",
    filterSummary: "$compute:hortis.collectorFilter.summarise({self}.filterState, {self}.filterName)",
    queryAutocomplete: "$method:hortis.checklist.querySearch({self}.rows, {0}:query, {1}:callback, {self}.maxSuggestions)",
    confirmAutocomplete: "$method:hortis.collectorFilter.confirm({self}, {0}:selection)",
    select: "$method:hortis.taxonSearchFilter.select({self}, {0}:id, {global}.document)",
    doFilter: "$method:hortis.taxonSearchFilter.doFilter({0}:obsRows, {1}:filterState, {self}.rowById)",
    reset: "$method:hortis.collectorFilter.reset({self}, {global}.document)"
});

/**
 * Choose a taxon as if it had been picked from the search, writing its name into the search box
 * @param {hortis.taxonSearchFilter} that - The filter
 * @param {String} id - The taxon's id
 * @param {Document} dokkument - The document holding the search box
 */
hortis.taxonSearchFilter.select = function (that, id, dokkument) {
    const row = that.rowById[id];
    if (row) {
        that.filterState = row;
        const input = dokkument.getElementById(that.controlId);
        if (input) {
            input.value = hortis.autocompleteInputForTaxonRow(row);
        }
    }
};

/**
 * Filter observations to those of a taxon, or of any taxon beneath it.
 * @param {Object[]} obsRows - The observations
 * @param {TaxonRow|null} filterState - The chosen taxon, or null if none is chosen
 * The taxa arrive as component material, read through a proxy which tracks each access - since the filter visits
 * every observation and climbs the taxonomy for each, the bare values are read instead, which is many times faster.
 * @param {Object[]} obsRows - The observations
 * @param {TaxonRow|null} filterState - The chosen taxon, or null if none is chosen
 * @param {Object<String, TaxonRow>} rowById - Map of taxon id to indexed taxon row, possibly as a proxy
 * @return {Object[]} The observations surviving the filter
 */
hortis.taxonSearchFilter.doFilter = function (obsRows, filterState, rowById) {
    const bareRowById = fluid.unwrapProxy(rowById);
    const filterId = filterState?.id;
    const includeRow = function (obsRow) {
        let taxonRow = bareRowById[obsRow.iNaturalistTaxonId];
        while (taxonRow && taxonRow.id !== filterId) {
            taxonRow = taxonRow.parent;
        }
        return !!taxonRow;
    };
    return filterState ? obsRows.filter(includeRow) : obsRows;
};
</script>

<template>
    <span class="imerss-search-checklist">
        <span class="imerss-filter-autocomplete">
            <div @id="autocomplete"></div>
            <div class="imerss-filter-clear imerss-basic-tooltip" @class="fl-hidden:!@{filterState}" title="Reset this filter"
                @onclick="{self}.reset()">
                <svg width="24" height="24"><use href="#imerss-i-x-circle-close"/></svg>
            </div>
        </span>
        <svg width="32" height="32"><use href="#imerss-i-search-wide"/></svg>
    </span>
</template>

<symbols>
    <symbol id="imerss-i-search-wide" viewBox="0 0 24 24" stroke="currentColor" fill="none">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
    </symbol>
</symbols>
