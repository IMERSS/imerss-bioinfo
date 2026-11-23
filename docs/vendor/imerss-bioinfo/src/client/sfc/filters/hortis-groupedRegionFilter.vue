<fluid-import src="../core/hortis-icons.vue"></fluid-import>
<script src="../../js/i6/imerss-core.js"></script>
<script src="../../js/i6/filters.js"></script>
<script>
"use strict";

// A region filter presenting every row of the region indirection table, grouped under its region field (e.g.
// "BLM District Boundaries") as a set of unfoldable groups, together with a free text search over region labels.
// Selections are ORed within a group and ANDed between groups. Rendered as a computed tree whose root delegates its
// events, as for hortis.checklist.
// A data set combining the atlases of several states, whose observations name their atlas in the column "state", has
// rows of the indirection table of regionField "state", one naming each state, whose `id` is its code as held in that
// column, and every other row bears in its member `state` the code of the state whose regions it is among. Its groups
// are then nested one level further, beneath a selector for each state, which selects all of that state's records,
// and a selection of the regions of one state selects records of that state alone. Selections of different states
// are ORed.
// A region is selected by its name, as held in the URL - see hortis.groupedRegionFilter.regionKeys - which, unlike
// its index in the indirection table, is stable as the data set is revised.
fluid.def("hortis.groupedRegionFilter", {
    $layers: ["hortis.icons", "hortis.obsFilter", "hortis.siteFilter", "hortis.urlMappedFilter"],
    urlCodec: "hortis.urlCodecs.names",
    // indirectionRows: Object[] - rows with members {regionField, id, label}
    controlId: "fli-imerss-region-search",
    filterName: "Region",
    // Region fields whose groups are listed first
    leadingFields: [],
    summaryNouns: ["region", "regions"],
    groups: "$compute:hortis.groupedRegionFilter.computeGroups({self}.indirectionRows, {self}.leadingFields)",
    // The states beneath which the groups are nested, or `null` if the data set is not of several states
    states: "$compute:hortis.groupedRegionFilter.computeStates({self}.indirectionRows, {self}.leadingFields)",
    // Free hash of the name of each selected region, as computed by hortis.groupedRegionFilter.regionKeys, to true
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
    predicates: "$compute:hortis.groupedRegionFilter.predicates({self}.indirectionRows, {self}.filterState)",
    reset: "$method:hortis.groupedRegionFilter.reset({self})",
    view: {
        $component: {
            $layers: "fluid.viewComponent",
            elideParent: false,
            templateTree: `$compute:hortis.groupedRegionFilter.renderTree({$parent}.groups, {$parent}.states, {$parent}.filterState, {$parent}.openGroups,
                {$parent}.query, {$parent}.filterName, {$parent}.controlId)`
        }
    }
});

/**
 * Arrange the rows of the region indirection table into groups, one for each region field.
 * @param {Object[]} indirectionRows - Rows of the indirection table, each with members `regionField`, `id` and `label`
 * @param {String[]} leadingFields - Region fields whose groups are to be listed first, in this order
 * @return {Object[]} Array of groups, each with members `regionField` and `rows`, where each of `rows` holds
 * the indirection `row`, its `index` in the indirection table and its `key`, its name - see
 * hortis.groupedRegionFilter.regionKeys
 */
hortis.groupedRegionFilter.computeGroups = function (indirectionRows, leadingFields) {
    return hortis.groupedRegionFilter.groupEntries(hortis.groupedRegionFilter.entries(indirectionRows), leadingFields);
};

/**
 * Compute the name by which each row of the region indirection table is selected, and held in the URL - its region
 * field and label, e.g. "USA Counties:Benton County", preceded in a data set of several states by the label of its
 * state, e.g. "Oregon:USA Counties:Benton County". A row naming a state is selected by the state's label alone.
 * @param {Object[]} indirectionRows - Rows of the indirection table
 * @return {String[]} The name of each row
 */
hortis.groupedRegionFilter.regionKeys = function (indirectionRows) {
    const stateField = hortis.groupedRegionFilter.stateField;
    const stateLabels = Object.fromEntries(indirectionRows.filter(row => row.regionField === stateField).map(row => [row.id, row.label]));
    return indirectionRows.map(function (row) {
        let togo;
        if (row.regionField === stateField) {
            togo = row.label;
        } else {
            const regionKey = row.regionField + ":" + row.label;
            togo = row.state && stateLabels[row.state] ? stateLabels[row.state] + ":" + regionKey : regionKey;
        }
        return togo;
    });
};

/**
 * Hold each row of the region indirection table together with its index and its name.
 * @param {Object[]} indirectionRows - Rows of the indirection table
 * @return {Object[]} An entry for each row, with members `row`, `index` and `key`, its name - see
 * hortis.groupedRegionFilter.regionKeys
 */
hortis.groupedRegionFilter.entries = function (indirectionRows) {
    const keys = hortis.groupedRegionFilter.regionKeys(indirectionRows);
    return indirectionRows.map((row, index) => ({row, index, key: keys[index]}));
};

// The regionField of the rows of the indirection table naming the states of a data set of several states, and the
// column of the observations holding the code of each one's state
hortis.groupedRegionFilter.stateField = "state";

/**
 * Arrange some rows of the region indirection table into groups, one for each region field.
 * @param {Object[]} entries - The rows, each as members `row`, the row, `index`, its index in the table, and `key`,
 * its name
 * @param {String[]} leadingFields - Region fields whose groups are to be listed first, in this order
 * @return {Object[]} Array of groups, as for hortis.groupedRegionFilter.computeGroups
 */
hortis.groupedRegionFilter.groupEntries = function (entries, leadingFields) {
    const byField = {};
    const fieldOrder = [];
    entries.forEach(entry => {
        const row = entry.row;
        if (byField[row.regionField] === undefined) {
            byField[row.regionField] = [];
            fieldOrder.push(row.regionField);
        }
        byField[row.regionField].push(entry);
    });
    const leading = leadingFields.filter(field => byField[field] !== undefined);
    const trailing = fieldOrder.filter(field => !leading.includes(field));
    return [...leading, ...trailing].map(regionField => ({
        regionField,
        rows: byField[regionField].sort((rowa, rowb) => rowa.row.label.localeCompare(rowb.row.label, undefined, {numeric: true}))
    }));
};

/**
 * Arrange the rows of the region indirection table of a data set of several states into the states, each holding the
 * groups of its own regions - see the comment on hortis.groupedRegionFilter.
 * @param {Object[]} indirectionRows - Rows of the indirection table, each with members `regionField`, `id`, `label`
 * and, for a data set of several states, `state`
 * @param {String[]} leadingFields - Region fields whose groups are to be listed first within each state, in this order
 * @return {Object[]|null} Array of states, in the order of their rows in the table, each with members `row`, `index` and
 * `key`, its row of the table, the index of that row and its name, and `groups`, as computed by
 * hortis.groupedRegionFilter.computeGroups - or `null` if the table has no rows naming states
 */
hortis.groupedRegionFilter.computeStates = function (indirectionRows, leadingFields) {
    const stateField = hortis.groupedRegionFilter.stateField;
    const entries = hortis.groupedRegionFilter.entries(indirectionRows);
    const stateEntries = entries.filter(({row}) => row.regionField === stateField);
    let togo = null;
    if (stateEntries.length > 0) {
        togo = stateEntries.map(({row, index, key}) => ({
            row,
            index,
            key,
            groups: hortis.groupedRegionFilter.groupEntries(entries.filter(entry => entry.row.regionField !== stateField
                && entry.row.state === row.id), leadingFields)
        }));
    }
    return togo;
};

/**
 * Compute the predicates of a filter of the observations to those in a selected region of each field of regions with
 * any selection - the regions of one field are alternatives, the fields are all required. In a data set of several
 * states, this holds within each state with any selection, of itself or of its regions, whose records are selected
 * alone, and the states are alternatives.
 * @param {Object[]} indirectionRows - Rows of the indirection table
 * @param {Object<String, Boolean>} filterState - Hash of the names of selected regions to `true`
 * @return {Object[]} The predicates
 */
hortis.groupedRegionFilter.predicates = function (indirectionRows, filterState) {
    const stateField = hortis.groupedRegionFilter.stateField;
    // Map of the code of each state with any selection - or "" for regions of no state - to a hash of the region
    // fields selected within it to the ids of their selected regions
    const byState = new Map();
    const keys = hortis.groupedRegionFilter.regionKeys(indirectionRows);
    const indexByKey = new Map(keys.map((key, index) => [key, index]));
    Object.keys(filterState).forEach(key => {
        const iRow = indirectionRows[indexByKey.get(key)];
        // A name held in the URL may be of no region of this table, e.g. one since withdrawn from the data set
        if (iRow) {
            const isState = iRow.regionField === stateField;
            const state = isState ? String(iRow.id) : (iRow.state || "");
            if (!byState.has(state)) {
                byState.set(state, {});
            }
            if (!isState) {
                fluid.pushArray(byState.get(state), iRow.regionField, iRow.id);
            }
        }
    });
    const terms = [...byState.entries()].map(([state, byField]) => [
        ...(state === "" ? [] : [{field: stateField, op: "in", value: [state]}]),
        ...Object.entries(byField).map(([regionField, ids]) => ({field: regionField, op: "in", value: ids}))
    ]);
    return terms.length <= 1 ? (terms[0] || []) : [{any: terms.map(all => ({all}))}];
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
 * Render one group of a grouped region filter, of the regions of one region field.
 * @param {Object} group - The group, as computed by `hortis.groupedRegionFilter.computeGroups`
 * @param {String} groupKey - The key of the group in `openGroups`
 * @param {Object<String, Boolean>} filterState - Hash of the names of selected regions to `true`
 * @param {Object<String, Boolean>} openGroups - Hash of the keys of unfolded groups and states to `true`
 * @param {String[]} words - The words of the search in progress, if any
 * @return {Object} Members `node`, the tree rendering the group, `matchCount`, the number of its regions matching the
 * search, and `selectedCount`, the number of its regions selected
 */
hortis.groupedRegionFilter.renderGroup = function (group, groupKey, filterState, openGroups, words) {
    const searching = words.length > 0;
    const matches = group.rows.map(({row}) => words.every(word => row.label.toLowerCase().includes(word)));
    const matchCount = matches.filter(match => match).length;
    const selectedCount = group.rows.filter(({key}) => filterState[key]).length;
    const open = searching || !!openGroups[groupKey];
    const rowNodes = group.rows.map(({row, key}, i) => {
        const inputAttrs = {type: "checkbox", "class": "imerss-region-check", "data-region-key": key};
        if (filterState[key]) {
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
    const groupAttrs = {"class": "imerss-group", "data-group": groupKey};
    if (searching && matchCount === 0) {
        groupAttrs.hidden = "";
    }
    const node = {tag: "div", attrs: groupAttrs, children: [
        {tag: "button", attrs: {type: "button", "class": "imerss-group-head", "aria-expanded": String(open), "data-group": groupKey}, children: [
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
    return {node, matchCount, selectedCount};
};

/**
 * Render one state of a grouped region filter of a data set of several states - a checkbox selecting all of its
 * records, beside the head unfolding the groups of its regions.
 * @param {Object} state - The state, as computed by `hortis.groupedRegionFilter.computeStates`
 * @param {Object<String, Boolean>} filterState - Hash of the names of selected regions to `true`
 * @param {Object<String, Boolean>} openGroups - Hash of the keys of unfolded groups and states to `true`
 * @param {String[]} words - The words of the search in progress, if any
 * @return {Object} The tree rendering the state
 */
hortis.groupedRegionFilter.renderState = function (state, filterState, openGroups, words) {
    const searching = words.length > 0;
    const code = String(state.row.id), label = state.row.label;
    const stateKey = "state:" + code;
    const rendered = state.groups.map((group, groupIndex) =>
        hortis.groupedRegionFilter.renderGroup(group, code + ":" + groupIndex, filterState, openGroups, words));
    const matchCount = rendered.reduce((sum, one) => sum + one.matchCount, 0);
    const selectedCount = rendered.reduce((sum, one) => sum + one.selectedCount, 0);
    const labelMatches = words.every(word => label.toLowerCase().includes(word));
    const open = searching ? matchCount > 0 : !!openGroups[stateKey];
    const checkAttrs = {type: "checkbox", "class": "imerss-region-check imerss-state-check", "data-region-key": state.key,
        "aria-label": `All records of ${label}`, title: `All records of ${label}`};
    if (filterState[state.key]) {
        checkAttrs.checked = "";
    }
    const badgeAttrs = {"class": "imerss-group-state", title: `${selectedCount} selected region${selectedCount === 1 ? "" : "s"} of ${label}`};
    if (selectedCount === 0) {
        badgeAttrs.hidden = "";
    }
    const bodyAttrs = {"class": "imerss-group-body imerss-state-body"};
    if (!open) {
        bodyAttrs.hidden = "";
    }
    const stateAttrs = {"class": "imerss-group imerss-state", "data-state": code};
    if (searching && matchCount === 0 && !labelMatches) {
        stateAttrs.hidden = "";
    }
    return {tag: "div", attrs: stateAttrs, children: [
        {tag: "div", attrs: {"class": "imerss-state-head"}, children: [
            {tag: "input", attrs: checkAttrs, children: []},
            {tag: "button", attrs: {type: "button", "class": "imerss-group-head", "aria-expanded": String(open), "data-group": stateKey}, children: [
                {tag: "svg", attrs: {"class": "imerss-node-chev", width: "12", height: "12", "aria-hidden": "true"}, children: [
                    {tag: "use", attrs: {href: "#imerss-i-chev"}, children: []}
                ]},
                {tag: "span", attrs: {"class": "imerss-group-name"}, children: [{text: label}]},
                {tag: "span", attrs: badgeAttrs, children: [{text: String(selectedCount)}]},
                {tag: "span", attrs: {"class": "imerss-group-count", title: `${state.groups.length} types of region in ${label}`},
                    children: [{text: String(state.groups.length)}]}
            ]}
        ]},
        {tag: "div", attrs: bodyAttrs, children: rendered.map(one => one.node)}
    ]};
};

/**
 * Render a grouped region filter. Whilst a search is in progress, groups with matches are unfolded and those without
 * are hidden, and within each group only those regions whose labels match all of the words in the search are shown.
 * In a data set of several states, the groups are nested beneath their states, which are unfolded and hidden likewise.
 * @param {Object[]} groups - The groups as computed by `hortis.groupedRegionFilter.computeGroups`
 * @param {Object[]|null} states - The states as computed by `hortis.groupedRegionFilter.computeStates`, or `null` if
 * the data set is not of several states
 * @param {Object<String, Boolean>} filterState - Hash of the names of selected regions to `true`
 * @param {Object<String, Boolean>} openGroups - Hash of the keys of unfolded groups and states to `true`
 * @param {String} query - The contents of the search box
 * @param {String} filterName - The label for the search box
 * @param {String} controlId - The id of the search box
 * @return {VNode} The tree to be rendered
 */
hortis.groupedRegionFilter.renderTree = function (groups, states, filterState, openGroups, query, filterName, controlId) {
    const words = hortis.queryWords(query);
    let topNodes;
    if (states) {
        topNodes = states.map(state => hortis.groupedRegionFilter.renderState(state, filterState, openGroups, words));
    } else {
        topNodes = groups.map((group, groupIndex) =>
            hortis.groupedRegionFilter.renderGroup(group, String(groupIndex), filterState, openGroups, words).node);
    }
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
        fluid.markVerbatim({tag: "div", attrs: {"class": "imerss-scroll imerss-groups"}, children: topNodes})
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

/**
 * Respond to a region's checkbox being ticked or unticked. The browser has already ticked the box, but the filter's
 * state is written only in a later task, by fluid.invokeLater, so that the browser may paint the tick first, since
 * filtering the observations afresh, and redrawing all that depends on them, takes long enough to delay its appearing. Each change is applied to the state current when
 * it is written, so that changes made in quick succession compose.
 * @param {Event} event - The change event
 * @param {hortis.groupedRegionFilter} that - The filter
 */
hortis.groupedRegionFilter.change = function (event, that) {
    const check = event.target.closest(".imerss-region-check");
    if (check) {
        const key = check.dataset.regionKey, checked = check.checked;
        fluid.invokeLater(() => {
            that.filterState = hortis.groupedRegionFilter.updateState(that.filterState, key, checked);
        });
    }
};

/**
 * Add or remove a region's name in a filter's state, writing a fresh state.
 * @param {Object<String, Boolean>} filterState - The current state
 * @param {String} key - The region's name
 * @param {Boolean} checked - `true` if the region is to be selected
 * @return {Object<String, Boolean>} The updated state
 */
hortis.groupedRegionFilter.updateState = function (filterState, key, checked) {
    const togo = {...filterState};
    if (checked) {
        togo[key] = true;
    } else {
        delete togo[key];
    }
    return togo;
};
</script>
