<fluid-import src="../core/hortis-icons.vue"></fluid-import>
<script src="../../js/i6/imerss-core.js"></script>
<script src="../../js/i6/filters.js"></script>
<script>
"use strict";

// A region filter presenting every row of the region indirection table, grouped under its region field (e.g.
// "BLM District Boundaries") as a set of unfoldable groups, together with a free text search over region labels.
// Selections are ORed within a group and ANDed between groups. Rendered as a computed tree whose root delegates its
// events, as for hortis.checklist
fluid.def("hortis.groupedRegionFilter", {
    $layers: ["hortis.icons", "hortis.obsFilter", "hortis.urlMappedFilter"],
    urlCodec: "hortis.urlCodecs.keys",
    // indirectionRows: Object[] - rows with members {regionField, id, label}
    controlId: "fli-imerss-region-search",
    filterName: "Region",
    // Region fields whose groups are listed first
    leadingFields: [],
    summaryNouns: ["region", "regions"],
    groups: "$compute:hortis.groupedRegionFilter.computeGroups({self}.indirectionRows, {self}.leadingFields)",
    // Free hash of indirection table row index to true
    filterState: {
        $reactiveRoot: {}
    },
    // Hash of the indices of groups the user has unfolded to true
    openGroups: {
        $reactiveRoot: {}
    },
    // Bound two-way to the search box
    query: "",
    filterSummary: "$compute:hortis.keyCountSummary({self}.filterState, {self}.summaryNouns)",
    doFilter: "$method:hortis.groupedRegionFilter.doFilter({self}.indirectionRows, {0}:obsRows, {1}:filterState)",
    reset: "$method:hortis.groupedRegionFilter.reset({self})",
    view: {
        $component: {
            $layers: "fluid.viewComponent",
            elideParent: false,
            templateTree: `$compute:hortis.groupedRegionFilter.renderTree({$parent}.groups, {$parent}.filterState, {$parent}.openGroups,
                {$parent}.query, {$parent}.filterName, {$parent}.controlId)`
        }
    }
});

/**
 * Arrange the rows of the region indirection table into groups, one for each region field.
 * @param {Object[]} indirectionRows - Rows of the indirection table, each with members `regionField`, `id` and `label`
 * @param {String[]} leadingFields - Region fields whose groups are to be listed first, in this order
 * @return {Object[]} Array of groups, each with members `regionField` and `rows`, where each of `rows` holds
 * the indirection `row` and its `index` in the indirection table
 */
hortis.groupedRegionFilter.computeGroups = function (indirectionRows, leadingFields) {
    const byField = {};
    const fieldOrder = [];
    indirectionRows.forEach((row, index) => {
        if (byField[row.regionField] === undefined) {
            byField[row.regionField] = [];
            fieldOrder.push(row.regionField);
        }
        byField[row.regionField].push({row, index});
    });
    const leading = leadingFields.filter(field => byField[field] !== undefined);
    const trailing = fieldOrder.filter(field => !leading.includes(field));
    return [...leading, ...trailing].map(regionField => ({
        regionField,
        rows: byField[regionField].sort((rowa, rowb) => rowa.row.label.localeCompare(rowb.row.label, undefined, {numeric: true}))
    }));
};

/**
 * Filter observations by the selected regions - ORing within each region field and ANDing between region fields.
 * @param {Object[]} indirectionRows - Rows of the indirection table
 * @param {Object[]} obsRows - The observation rows to be filtered
 * @param {Object<String, Boolean>} filterState - Hash of selected indirection row indices to `true`
 * @return {Object[]} The filtered observation rows
 */
hortis.groupedRegionFilter.doFilter = function (indirectionRows, obsRows, filterState) {
    const selected = Object.keys(filterState);
    let togo = obsRows;
    if (selected.length > 0) {
        const byField = {};
        selected.forEach(index => {
            const iRow = indirectionRows[index];
            fluid.pushArray(byField, iRow.regionField, iRow.id);
        });
        const fieldEntries = Object.entries(byField);
        togo = obsRows.filter(obsRow => fieldEntries.every(([regionField, ids]) => ids.includes(obsRow[regionField])));
    }
    return togo;
};

hortis.groupedRegionFilter.reset = function (that) {
    that.filterState = {};
    that.query = "";
};

/**
 * Split a search query into its lower-cased words.
 * @param {String|null} query - The query
 * @return {String[]} The words of the query
 */
hortis.queryWords = function (query) {
    return (query || "").toLowerCase().split(" ").filter(word => word.trim().length > 0);
};

/**
 * Render a grouped region filter. Whilst a search is in progress, groups with matches are unfolded and those without
 * are hidden, and within each group only those regions whose labels match all of the words in the search are shown.
 * @param {Object[]} groups - The groups as computed by `hortis.groupedRegionFilter.computeGroups`
 * @param {Object<String, Boolean>} filterState - Hash of selected indirection row indices to `true`
 * @param {Object<String, Boolean>} openGroups - Hash of the indices of unfolded groups to `true`
 * @param {String} query - The contents of the search box
 * @param {String} filterName - The label for the search box
 * @param {String} controlId - The id of the search box
 * @return {VNode} The tree to be rendered
 */
hortis.groupedRegionFilter.renderTree = function (groups, filterState, openGroups, query, filterName, controlId) {
    const words = hortis.queryWords(query);
    const searching = words.length > 0;
    const groupNodes = groups.map((group, groupIndex) => {
        const matches = group.rows.map(({row}) => words.every(word => row.label.toLowerCase().includes(word)));
        const matchCount = matches.filter(match => match).length;
        const selectedCount = group.rows.filter(({index}) => filterState[index]).length;
        const open = searching || !!openGroups[groupIndex];
        const rowNodes = group.rows.map(({row, index}, i) => {
            const inputAttrs = {type: "checkbox", "class": "imerss-region-check", "data-row-id": String(index)};
            if (filterState[index]) {
                inputAttrs.checked = "";
            }
            return {tag: "label", attrs: {"class": "imerss-check" + (matches[i] ? "" : " imerss-check-hidden")}, children: [
                {tag: "input", attrs: inputAttrs, children: []},
                {tag: "span", attrs: {}, children: [{text: row.label}]}
            ]};
        });
        const stateAttrs = {"class": "imerss-group-state", title: `${selectedCount} selected region${selectedCount === 1 ? "" : "s"} of type ${group.regionField}`};
        if (selectedCount === 0) {
            stateAttrs.hidden = "";
        }
        const bodyAttrs = {"class": "imerss-group-body"};
        if (!open) {
            bodyAttrs.hidden = "";
        }
        const groupAttrs = {"class": "imerss-group", "data-group": String(groupIndex)};
        if (searching && matchCount === 0) {
            groupAttrs.hidden = "";
        }
        return {tag: "div", attrs: groupAttrs, children: [
            {tag: "button", attrs: {type: "button", "class": "imerss-group-head", "aria-expanded": String(open), "data-group": String(groupIndex)}, children: [
                {tag: "svg", attrs: {"class": "imerss-node-chev", width: "12", height: "12", "aria-hidden": "true"}, children: [
                    {tag: "use", attrs: {href: "#imerss-i-chev"}, children: []}
                ]},
                {tag: "span", attrs: {"class": "imerss-group-name"}, children: [{text: group.regionField}]},
                {tag: "span", attrs: stateAttrs, children: [{text: String(selectedCount)}]},
                {tag: "span", attrs: {"class": "imerss-group-count", title: `${group.rows.length} regions of type ${group.regionField}`},
                    children: [{text: String(group.rows.length)}]}
            ]},
            {tag: "div", attrs: bodyAttrs, children: rowNodes}
        ]};
    });
    const root = {tag: "div", attrs: {"class": "imerss-grouped-region-filter",
        "@onclick": "hortis.groupedRegionFilter.click({0}, {self})",
        "@onchange": "hortis.groupedRegionFilter.change({0}, {self})"}, children: [
        {tag: "label", attrs: {"class": "imerss-filter-title", "for": controlId}, children: [{text: filterName}]},
        {tag: "div", attrs: {"class": "imerss-combo"}, children: [
            {tag: "svg", attrs: {"class": "imerss-combo-icon", width: "14", height: "14", "aria-hidden": "true"}, children: [
                {tag: "use", attrs: {href: "#imerss-i-search"}, children: []}
            ]},
            {tag: "input", attrs: {type: "search", id: controlId, "class": "imerss-combo-input imerss-region-search", placeholder: "Filter by region",
                autocomplete: "off", spellcheck: "false", value: "@{query}"}, children: []}
        ]},
        fluid.markVerbatim({tag: "div", attrs: {"class": "imerss-scroll imerss-groups"}, children: groupNodes})
    ]};
    return {tag: "fragment", children: [root]};
};

hortis.groupedRegionFilter.click = function (event, that) {
    const head = event.target.closest(".imerss-group-head");
    if (head) {
        const groupIndex = head.dataset.group;
        that.openGroups[groupIndex] = !that.openGroups[groupIndex];
    }
};

hortis.groupedRegionFilter.change = function (event, that) {
    const check = event.target.closest(".imerss-region-check");
    if (check) {
        const filterState = {...that.filterState};
        if (check.checked) {
            filterState[check.dataset.rowId] = true;
        } else {
            delete filterState[check.dataset.rowId];
        }
        that.filterState = filterState;
    }
};
</script>
