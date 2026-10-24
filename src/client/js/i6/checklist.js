/*
Copyright 2023-2026 Antranig Basman
Licensed under the Educational Community License (ECL), Version 2.0 or the New
BSD license. You may not use this file except in compliance with one these
Licenses.
You may obtain a copy of the ECL 2.0 License and BSD License at
https://github.com/fluid-project/infusion/raw/master/Infusion-LICENSE.txt
*/

"use strict";

// The taxonomic checklist ported to Infusion 6 - corresponds to src/client/js/new/newChecklist.js.
//
// Unlike the Infusion 4/preact-signals version, the checklist's state is split as for fluid.substrateTree:
// - `defaultFolds` is computed from the filtered tree alone,
// - `userState` holds only what the user has done - the set of selected rows, and any rows they have folded or unfolded,
// - `idToState` is computed from both, deriving each row's indeterminate and hidden states.
// No computation needs to know which of its inputs changed, nothing writes back into its own inputs, and the user's
// selection survives any change in the rows in focus. The tree is rendered as a computed tree of VNodes rather than
// one component per row.

// noinspection ES6ConvertVarToLetConst // otherwise this is a duplicate on minifying
var hortis = fluid.registerNamespace("hortis");

/**
 * A row of the taxon table, as indexed by `hortis.taxa.index`.
 * @typedef {Object} TaxonRow
 * @property {String} id - The row's taxon id
 * @property {String} [rank] - The row's taxonomic rank
 * @property {TaxonRow} [parent] - The row's parent
 * @property {TaxonRow[]} children - The row's children
 */

/**
 * An entry in the filtered tree displayed by a checklist.
 * @typedef {Object} ChecklistEntry
 * @property {TaxonRow} row - The taxon row displayed by this entry
 * @property {ChecklistEntry[]} children - The entry's displayed children
 * @property {ChecklistEntry} parent - The entry's parent, which is the root entry for a top-level entry
 * @property {Number} index - The entry's index in a depth-first traversal of the tree
 */

/**
 * The state of one row of a checklist.
 * @typedef {Object} RowState
 * @property {String} selected - One of "selected", "unselected" or "indeterminate"
 * @property {String} folded - One of "fixed" (has no children, or may not be folded), "folded", "unfolded", or
 * "hidden" (some ancestor is folded)
 */

hortis.alwaysRejectRanks = [];

// Variety of acceptChecklistRow following work with Andrew Simon where the importance is on the number of resolved
// entities - as a result there are rules such as not producing a genus level entry if any are resolved to species level
hortis.acceptChecklistRowAS = function (row, filterRanks, rowFocus) {
    const acceptBasic = !filterRanks || filterRanks.includes(row.rank) || row.species;
    const alwaysReject = hortis.alwaysRejectRanks.includes(row.rank);
    // Special request from AS - suppress any checklist entry at species level if there are any ssp
    const rejectSpecies = row.rank === "species" && row.children.length > 0;
    // "taxonName" being set will be a proxy for "there is an entry in the curated summary" so we always accept
    const acceptChecklist = row.taxonName;
    return rowFocus[row.id] && (acceptBasic && !rejectSpecies && !alwaysReject || acceptChecklist);
};

hortis.acceptChecklistRowOBA = function (row, filterRanks, rowFocus) {
    const acceptBasic = !filterRanks || filterRanks.includes(row.rank);
    const alwaysReject = hortis.alwaysRejectRanks.includes(row.rank);
    return rowFocus[row.id] && acceptBasic && !alwaysReject;
};

hortis.scientificComparator = function (entrya, entryb) {
    return hortis.rowToScientific(entrya.row) > hortis.rowToScientific(entryb.row) ? 1 : -1;
};

fluid.def("hortis.checklist", {
    $layers: "hortis.withTaxonTooltip",
    // rowById: Object<String, TaxonRow>
    // rowFocus: Object<String, Boolean> - the rows which may be displayed, e.g. those with observations surviving filters
    // rootId: String
    filterRanks: false, // or array of ranks to include - if set, counts as "simple"
    disclosableRanks: null, // array of ranks whose rows are folded away by default
    showRoot: false,
    selectable: false,
    unfoldable: false,
    // Global name of the function deciding whether a row is displayed, accepting (row, filterRanks, rowFocus)
    acceptRow: "hortis.acceptChecklistRowAS",
    selectedId: null,
    entries: "$compute:hortis.checklist.computeEntries({self}.rowById, {self}.rootId, {self}.rowFocus, {self}.filterRanks, {self}.showRoot, {self}.acceptRow)",
    rootEntry: "{self}.entries.rootEntry",
    idToEntry: "{self}.entries.idToEntry",
    defaultFolds: "$compute:hortis.checklist.defaultFolds({self}.rootEntry, {self}.unfoldable, {self}.disclosableRanks)",
    userState: {
        $reactiveRoot: {
            selected: {},
            folded: {}
        }
    },
    idToState: "$compute:hortis.checklist.idToState({self}.rootEntry, {self}.defaultFolds, {self}.userState)",
    // The selection seen by the rest of the visualisation - all displayed rows if none is selected
    rowSelection: "$compute:hortis.checklist.checksToSelection({self}.idToState)",
    check: "$method:hortis.checklist.check({self}, {0}:id, {1}:checked)",
    toggleFold: "$method:hortis.checklist.toggleFold({self}, {0}:id)",
    foldToRank: "$method:hortis.checklist.foldToRank({self}, {0}:rank, {1}:expand)",
    reset: "$method:hortis.checklist.reset({self})",
    view: {
        $component: {
            $layers: "hortis.selectorContainerView",
            templateTree: "$compute:hortis.checklist.renderTree({$parent}, {$parent}.rootEntry, {$parent}.idToState, {$parent}.selectedId)"
        }
    }
});

// A row standing for observations with no taxon, e.g. a bee recorded on no plant
hortis.checklist.NO_TAXON_ROW = Object.freeze({id: "0", taxonName: "None", children: []});

/**
 * Filter the taxonomy beneath a row into the tree of entries displayed by a checklist. A row which is not accepted is
 * elided, its accepted descendants taking its place. Each level is sorted by scientific name.
 * @param {TaxonRow[]} rows - The rows at this level
 * @param {Number} depth - The depth of this level
 * @param {Function} accept - Accepts a row, returning `true` if it is to be displayed
 * @param {Boolean} showRoot - If `true`, rows at depth 0 are always displayed
 * @return {Object[]} The entries at this level, each with members `row` and `children`
 */
hortis.checklist.filterTaxonomy = function (rows, depth, accept, showRoot) {
    const togo = [];
    rows.forEach(row => {
        const children = hortis.checklist.filterTaxonomy(row.children, depth + 1, accept, showRoot);
        if (accept(row) || depth === 0 && showRoot || row.id === "0") {
            togo.push({row, children});
        } else {
            togo.push(...children);
        }
    });
    return togo.sort(hortis.scientificComparator);
};

/**
 * Compute the tree of entries displayed by a checklist.
 * @param {Object<String, TaxonRow>} rowById - Map of taxon id to taxon row
 * @param {String} rootId - The id of the root of the taxonomy to be displayed
 * @param {Object<String, Boolean>} rowFocus - The rows which may be displayed
 * @param {String[]|Boolean} filterRanks - The ranks to be displayed, or `false` for all
 * @param {Boolean} showRoot - If `true`, the root is always displayed
 * @param {String} acceptRow - Global name of the function deciding whether a row is displayed
 * @return {Object} Members `rootEntry`, a synthetic entry holding the top-level entries as its children, and
 * `idToEntry`, a map of taxon id to each displayed entry
 */
hortis.checklist.computeEntries = function (rowById, rootId, rowFocus, filterRanks, showRoot, acceptRow) {
    const acceptFunc = fluid.getGlobalValue(acceptRow);
    const accept = row => acceptFunc(row, filterRanks, rowFocus);
    const rootRow = rowById[rootId];
    const topRows = rootRow ? [rootRow, hortis.checklist.NO_TAXON_ROW] : [hortis.checklist.NO_TAXON_ROW];
    const rootEntry = {children: hortis.checklist.filterTaxonomy(topRows, 0, accept, showRoot)};
    const idToEntry = {};
    let entryIndex = 0;
    const indexEntry = function (entry, parent) {
        idToEntry[entry.row.id] = entry;
        entry.index = entryIndex++;
        entry.parent = parent;
        entry.children.forEach(child => indexEntry(child, entry));
    };
    rootEntry.children.forEach(entry => indexEntry(entry, rootEntry));
    return {rootEntry, idToEntry};
};

/**
 * Compute the default fold state of each entry, before any action by the user. Top-level entries and those without
 * children are "fixed". An entry all of whose children are of disclosable ranks is "folded", and others are "unfolded".
 * @param {ChecklistEntry} rootEntry - The root entry
 * @param {Boolean} unfoldable - `true` if the user may fold and unfold entries
 * @param {String[]|null} disclosableRanks - Ranks whose entries are folded away by default
 * @return {Object<String, String>} Map of taxon id to default fold state
 */
hortis.checklist.defaultFolds = function (rootEntry, unfoldable, disclosableRanks) {
    const togo = {};
    const isDisclosable = entry => !!disclosableRanks && disclosableRanks.includes(entry.row.rank);
    const visit = function (entry, isTop) {
        const hasChildren = entry.children.length > 0;
        togo[entry.row.id] = isTop || !hasChildren || !unfoldable ? "fixed" :
            entry.children.every(isDisclosable) ? "folded" : "unfolded";
        entry.children.forEach(child => visit(child, false));
    };
    rootEntry.children.forEach(entry => visit(entry, true));
    return togo;
};

/**
 * Compute the state of every displayed row from its default fold state and what the user has done. A row is
 * "selected" if the user's selection includes it, else "indeterminate" if any of its descendants is selected. It is
 * "hidden" if any of its ancestors is folded.
 * @param {ChecklistEntry} rootEntry - The root entry
 * @param {Object<String, String>} defaultFolds - Map of taxon id to default fold state
 * @param {Object} userState - Members `selected`, a hash of selected taxon ids to `true`, and `folded`, a map of taxon id
 * to the fold state the user has chosen for it
 * @return {Object<String, RowState>} Map of taxon id to row state
 */
hortis.checklist.idToState = function (rootEntry, defaultFolds, userState) {
    const togo = {};
    const visit = function (entry, ancestorFolded) {
        const id = entry.row.id;
        const ownFold = defaultFolds[id] === "fixed" ? "fixed" : userState.folded[id] || defaultFolds[id];
        const hidden = ancestorFolded || id === "0";
        const childFolded = hidden || ownFold === "folded";
        const childSelected = entry.children.map(child => visit(child, childFolded));
        const selected = userState.selected[id] ? "selected" :
            childSelected.some(state => state !== "unselected") ? "indeterminate" : "unselected";
        togo[id] = {selected, folded: hidden ? "hidden" : ownFold};
        return selected;
    };
    rootEntry.children.forEach(entry => visit(entry, false));
    return togo;
};

/**
 * Compute the effective selection of a checklist from the states of its rows, according to the idiom that "no
 * selection is all selection". Hidden rows are not counted.
 * @param {Object<String, RowState>} idToState - Map of taxon id to row state
 * @return {Object<String, Boolean>} Hash of selected taxon ids to `true` - every displayed row, and the NO_TAXON row,
 * if none is selected
 */
hortis.checklist.checksToSelection = function (idToState) {
    const selection = {};
    const selectAll = {"0": true};
    let selected = 0;
    Object.entries(idToState).forEach(([id, state]) => {
        if (state.folded !== "hidden") {
            if (state.selected === "selected") {
                ++selected;
                selection[id] = true;
            }
            selectAll[id] = true;
        }
    });
    return selected === 0 ? selectAll : selection;
};

/**
 * Respond to the user checking or unchecking a row. The row's descendants follow it, and each of its ancestors becomes
 * selected exactly when all of its children are. When a row is selected, any folded ancestor is unfolded so that it
 * remains visible.
 * @param {hortis.checklist} that - The checklist
 * @param {String} id - The id of the row
 * @param {Boolean} checked - `true` if the row was checked
 */
hortis.checklist.check = function (that, id, checked) {
    const idToEntry = that.idToEntry;
    const userState = that.userState;
    const selected = {...userState.selected};
    const folded = {...userState.folded};
    const entry = idToEntry[id];
    const setState = function (entry) {
        if (checked) {
            selected[entry.row.id] = true;
        } else {
            delete selected[entry.row.id];
        }
        entry.children.forEach(setState);
    };
    setState(entry);
    let parent = entry.parent;
    while (parent.row) {
        const parentId = parent.row.id;
        if (parent.children.every(child => selected[child.row.id])) {
            selected[parentId] = true;
        } else {
            delete selected[parentId];
        }
        // Test the ancestor's own fold, since an ancestor beneath a folded one is "hidden" in idToState
        const defaultFold = that.defaultFolds[parentId];
        const ownFold = defaultFold === "fixed" ? "fixed" : folded[parentId] || defaultFold;
        if (checked && ownFold === "folded") {
            folded[parentId] = "unfolded";
        }
        parent = parent.parent;
    }
    that.userState = {selected, folded};
};

/**
 * Fold or unfold a row. When a row is unfolded, those of its children which have children of their own are shown
 * folded.
 * @param {hortis.checklist} that - The checklist
 * @param {String} id - The id of the row
 */
hortis.checklist.toggleFold = function (that, id) {
    const userState = that.userState;
    const folded = {...userState.folded};
    const newFolded = that.idToState[id].folded === "folded" ? "unfolded" : "folded";
    folded[id] = newFolded;
    if (newFolded === "unfolded") {
        that.idToEntry[id].children.forEach(child => {
            if (child.children.length > 0) {
                folded[child.row.id] = "folded";
            }
        });
    }
    that.userState = {selected: userState.selected, folded};
};

/**
 * Fold or unfold every row of a checklist so that it is displayed down to a particular taxonomic rank.
 * When expanding, every row ranked above the target rank is unfolded so that rows at the target rank become visible.
 * When collapsing, every row ranked at or below the target rank is folded so that no deeper rows are visible. Rows
 * which the operation does not address keep their current fold state.
 * @param {hortis.checklist} that - The checklist to be updated
 * @param {String} rank - The target rank, which must be one of the checklist's `filterRanks`
 * @param {Boolean} expand - `true` to expand all rows to the target rank, `false` to collapse all rows to it
 */
hortis.checklist.foldToRank = function (that, rank, expand) {
    const ranks = that.filterRanks;
    const targetIndex = ranks.indexOf(rank);
    const idToState = that.idToState;
    const userState = that.userState;
    const folded = {...userState.folded};
    Object.values(that.idToEntry).forEach(entry => {
        const id = entry.row.id;
        const state = idToState[id];
        if (state && state.folded !== "fixed" && entry.children.length > 0) {
            const rankIndex = ranks.indexOf(entry.row.rank);
            if (expand && rankIndex < targetIndex) {
                folded[id] = "unfolded";
            } else if (!expand && rankIndex >= targetIndex) {
                folded[id] = "folded";
            }
        }
    });
    that.userState = {selected: userState.selected, folded};
};

hortis.checklist.reset = function (that) {
    that.userState = {selected: {}, folded: that.userState.folded};
};

/**
 * Count the rows which the user has explicitly selected in a checklist - that is, selected rows whose parent is
 * not itself selected.
 * @param {Object<String, RowState>} idToState - Map of taxon id to row state
 * @param {Object<String, ChecklistEntry>} idToEntry - Map of taxon id to entry
 * @return {Number} The number of explicitly selected rows
 */
hortis.checklist.countSelected = function (idToState, idToEntry) {
    return Object.entries(idToState).filter(([id, state]) => {
        const parentRow = idToEntry[id]?.parent?.row;
        return state.selected === "selected" && !(parentRow && idToState[parentRow.id]?.selected === "selected");
    }).length;
};

// Allows a selectable checklist to summarise its selection as a filter - see hortis.summarisedFilter
fluid.def("hortis.checklist.withFilterSummary", {
    $layers: "hortis.summarisedFilter",
    summaryNouns: ["taxon", "taxa"],
    filterSummary: "$compute:hortis.checklist.filterSummary({self}.idToState, {self}.idToEntry, {self}.summaryNouns)"
});

hortis.checklist.filterSummary = function (idToState, idToEntry, summaryNouns) {
    return hortis.countSummary(hortis.checklist.countSelected(idToState, idToEntry), summaryNouns);
};

fluid.def("hortis.checklist.withOBA", {
    acceptRow: "hortis.acceptChecklistRowOBA"
});

/** Rendering **/

hortis.accessRowHulq = function (row) {
    const togo = {
        nativeName: row.hulquminumName,
        scientificName: hortis.rowToScientific(row),
        commonName: row.commonName
    };
    togo.featuredName = togo.nativeName || togo.commonName;
    return togo;
};

/**
 * Render the control folding or unfolding a row.
 * @param {String} id - The row's taxon id
 * @param {String} folded - The row's fold state
 * @return {VNode} The fold control
 */
hortis.checklist.foldNode = function (id, folded) {
    const foldChar = folded === "folded" ? "chevron-right" : folded === "unfolded" ? "chevron-down" : "none";
    const active = foldChar === "none" ? "" : " active";
    return {tag: "span", attrs: {"data-row-id": id, "class": "pretty p-icon checklist-fold-control" + active}, children: [
        {tag: "span", attrs: {"class": "state"}, children: [
            {tag: "i", attrs: {"class": "icon mdi mdi-" + foldChar}, children: []},
            {tag: "label", attrs: {}, children: []}
        ]}
    ]};
};

/**
 * Render a row's checkbox. Its checked and indeterminate states are written as literal attributes, which the
 * reconciler also writes to the corresponding live properties.
 * @param {String} id - The row's taxon id
 * @param {String} selected - The row's selection state
 * @return {VNode} The checkbox
 */
hortis.checklist.checkboxNode = function (id, selected) {
    const attrs = {type: "checkbox", "class": "checklist-check", "data-row-id": id};
    if (selected === "selected") {
        attrs.checked = "";
    } else if (selected === "indeterminate") {
        attrs.indeterminate = "";
    }
    return {tag: "span", attrs: {"class": "pretty p-icon"}, children: [
        {tag: "input", attrs, children: []},
        {tag: "span", attrs: {"class": "state p-success"}, children: [
            {tag: "i", attrs: {"class": "icon mdi" + (selected === "indeterminate" ? "" : " mdi-check")}, children: []},
            {tag: "label", attrs: {}, children: []}
        ]}
    ]};
};

/**
 * Render one entry of a checklist and, unless it is folded, its children.
 * @param {ChecklistEntry} entry - The entry to be rendered
 * @param {Object} options - Rendering options, with members `simple`, `selectable`, `unfoldable` and `selectedId`
 * @param {Object<String, RowState>} idToState - Map of taxon id to row state
 * @return {VNode} The rendered entry, an `li` element
 */
hortis.checklist.entryNode = function (entry, options, idToState) {
    const row = entry.row;
    const id = row.id;
    const rowState = idToState[id];
    // Note: "species" really means "has obs " and could be a higher taxon - in the case of a simple checklist
    // we promote e.g. a genus-level obs to species level so it appears inline
    const rank = row.rank && !(options.simple && row.taxonName) ? row.rank : "species";
    const selectedClass = rank === "species" && id === options.selectedId ? " checklist-selected" : "";
    const accessed = hortis.accessRowHulq(row);
    const nameNode = (clazz, children) => ({tag: "p", attrs: {"data-row-id": id, "class": clazz}, children});
    const names = [];
    if (accessed.nativeName) {
        names.push(nameNode("checklist-hulq-name", [{tag: "em", attrs: {}, children: [{text: accessed.nativeName}]}]));
    }
    if (accessed.scientificName) {
        names.push(nameNode("checklist-scientific-name",
            rank === "species" ? hortis.speciesNameNodes(accessed.scientificName) : [{text: accessed.scientificName}]));
    }
    if (accessed.commonName) {
        names.push(nameNode("checklist-common-name", [{text: accessed.commonName}]));
    }
    const separated = names.flatMap((name, i) => i === 0 ? [name] : [{text: " - "}, name]);
    const subList = rowState.folded === "folded" ? null : hortis.checklist.listNode(entry.children, options, idToState);
    return {tag: "li", attrs: {"class": "checklist-row checklist-rank-" + rank + selectedClass}, children: [
        ...(options.unfoldable ? [hortis.checklist.foldNode(id, rowState.folded)] : []),
        ...(options.selectable ? [hortis.checklist.checkboxNode(id, rowState.selected)] : []),
        ...separated,
        ...(subList ? [subList] : [])
    ]};
};

/**
 * Render a list of checklist entries, omitting hidden ones.
 * @param {ChecklistEntry[]} entries - The entries to be rendered
 * @param {Object} options - Rendering options, as for `hortis.checklist.entryNode`
 * @param {Object<String, RowState>} idToState - Map of taxon id to row state
 * @return {VNode|null} The rendered list, a `ul` element, or `null` if no entry is showing
 */
hortis.checklist.listNode = function (entries, options, idToState) {
    const showing = entries.filter(entry => idToState[entry.row.id].folded !== "hidden");
    return showing.length > 0 ? {tag: "ul", attrs: {}, children: showing.map(entry => hortis.checklist.entryNode(entry, options, idToState))} : null;
};

/**
 * Render the tree of a checklist. The root, which is elided onto the view's container, delegates clicks to
 * `hortis.checklist.click`. Everything beneath it is marked verbatim so that it is not scanned for template bindings.
 * @param {hortis.checklist} that - The checklist
 * @param {ChecklistEntry} rootEntry - The root entry
 * @param {Object<String, RowState>} idToState - Map of taxon id to row state
 * @param {String|null} selectedId - The id of the currently selected taxon, if any
 * @return {VNode} The tree to be rendered
 */
hortis.checklist.renderTree = function (that, rootEntry, idToState, selectedId) {
    const options = {
        simple: !!that.filterRanks,
        selectable: that.selectable,
        unfoldable: that.unfoldable,
        selectedId
    };
    const list = hortis.checklist.listNode(rootEntry.children, options, idToState);
    const hover = "hortis.checklist.hover({0}, {self})";
    const root = {tag: "div", attrs: {
        "@onclick": "hortis.checklist.click({0}, {self})",
        "@onmouseover": hover,
        "@onmousemove": hover,
        "@onmouseleave": hover
    }, children: list ? [fluid.markVerbatim(list)] : []};
    return {tag: "fragment", children: [root]};
};

/**
 * Dispatch a click within a checklist to a fold control or a checkbox.
 * @param {Event} event - The click event
 * @param {hortis.checklist} that - The checklist
 */
hortis.checklist.click = function (event, that) {
    const fold = event.target.closest(".checklist-fold-control.active");
    const check = event.target.closest("input.checklist-check");
    if (fold) {
        that.toggleFold(fold.dataset.rowId);
    } else if (check) {
        that.check(check.dataset.rowId, check.checked);
    }
};

/**
 * Show a tooltip for the taxon whose name is under the pointer, if any.
 * @param {Event} event - A mouse event within the checklist
 * @param {hortis.checklist} that - The checklist
 */
hortis.checklist.hover = function (event, that) {
    const name = event.type === "mouseleave" ? null : event.target.closest?.("p[data-row-id]");
    that.hoverAt(name ? name.dataset.rowId : null, event);
};

/**
 * Bind a checklist's rank fold controls, which fold or unfold every row to a chosen rank.
 * @param {hortis.checklist} checklist - The checklist
 * @param {String[]} foldRanks - The ranks offered
 * @return {VNode} The controls
 */
hortis.checklist.rankFoldTree = function (checklist, foldRanks) {
    const options = foldRanks.map(rank => ({tag: "option", attrs: {value: rank}, children: [{text: hortis.capitalize(rank)}]}));
    const select = (clazz, label, prompt) => ({tag: "select", attrs: {"class": "mf-select " + clazz, "aria-label": label,
        "@onchange": "hortis.checklist.rankFoldChange({0}, {checklist})"}, children: [
        {tag: "option", attrs: {value: "", selected: "", disabled: ""}, children: [{text: prompt}]},
        ...options
    ]});
    return {tag: "fragment", children: [{tag: "div", attrs: {}, children: [
        select("imerss-expand-to", "Expand all rows to a taxonomic rank", "Expand all to…"),
        select("imerss-collapse-to", "Collapse all rows to a taxonomic rank", "Collapse all to…")
    ]}]};
};

hortis.checklist.rankFoldChange = function (event, checklist) {
    const select = event.target;
    checklist.foldToRank(select.value, select.classList.contains("imerss-expand-to"));
    select.value = "";
};

// Adds a pair of controls allowing all rows of the checklist to be expanded or collapsed to a chosen taxonomic rank
fluid.def("hortis.checklist.withRankFold", {
    // The ranks offered by the controls - defaults to all filterRanks other than the topmost
    foldRanks: "$compute:hortis.checklist.defaultFoldRanks({self}.filterRanks)",
    rankFold: {
        $component: {
            $layers: "fluid.component",
            view: {
                $component: {
                    $layers: "hortis.selectorContainerView",
                    selector: "{checklist}.rankFoldSelector",
                    templateTree: "$compute:hortis.checklist.rankFoldTree({checklist}, {checklist}.foldRanks)"
                }
            }
        }
    }
});

hortis.checklist.defaultFoldRanks = filterRanks => filterRanks.slice(1);

/** Search **/

// A search box over a checklist's displayed taxa - choosing a taxon selects it in the checklist, accreting a
// multiple selection
fluid.def("hortis.checklist.withSearch", {
    // searchSelector: String - the selector of the search box's container in the page markup
    // searchControlId: String - the id of the search box
    search: {
        $component: {
            $layers: "hortis.checklist.search"
        }
    }
});

fluid.def("hortis.checklist.search", {
    $layers: "hortis.autocompleteHost",
    controlId: "{checklist}.searchControlId",
    placeholder: "Search taxa ...",
    minLength: 2,
    renderSuggestion: "hortis.autocompleteSuggestionForTaxonRow",
    renderInputValue: "hortis.autocompleteInputForTaxonRow",
    rows: "$compute:hortis.checklist.entryRows({checklist}.idToEntry)",
    queryAutocomplete: "$method:hortis.checklist.querySearch({self}.rows, {0}:query, {1}:callback, {self}.maxSuggestions)",
    confirmAutocomplete: "$method:hortis.checklist.confirmSearch({checklist}, {self}.controlId, {0}:selection, {global}.document)",
    view: {
        $component: {
            $layers: "hortis.selectorTemplateView",
            selector: "{checklist}.searchSelector",
            template: `<span>
                <span class="imerss-filter-autocomplete"><div @id="autocomplete"></div></span>
                <svg width="32" height="32"><use href="#search-icon"/></svg>
            </span>`
        }
    }
});

/**
 * Find the taxon rows displayed by a checklist, which are offered by its search.
 * @param {Object<String, ChecklistEntry>} idToEntry - Map of taxon id to entry
 * @return {TaxonRow[]} The displayed rows, apart from the NO_TAXON row
 */
hortis.checklist.entryRows = function (idToEntry) {
    return Object.values(idToEntry).map(entry => entry.row).filter(row => row.id !== "0");
};

hortis.checklist.querySearch = function (rows, query, callback, maxSuggestions) {
    callback(hortis.lookupTaxon(rows, query, maxSuggestions));
};

hortis.checklist.confirmSearch = function (checklist, controlId, selection, dokkument) {
    if (selection) {
        checklist.check(selection.id, true);
        // Clear the box once the widget has finished writing the confirmed value into it
        setTimeout(() => hortis.autocomplete.clear(dokkument, controlId), 0);
    }
};
