/*
Copyright 2023-2026 Antranig Basman
Licensed under the Educational Community License (ECL), Version 2.0 or the New
BSD license. You may not use this file except in compliance with one these
Licenses.
You may obtain a copy of the ECL 2.0 License and BSD License at
https://github.com/fluid-project/infusion/raw/master/Infusion-LICENSE.txt
*/

"use strict";

// The data model of the plant-pollinator (BBEA) visualisation ported to Infusion 6 - corresponds to
// the since removed src/client/js/new/imerss-bbea.js. The visualisation itself is defined by hortis-beaVizLoader.vue in src/client/sfc.
//
// The dataflow "diamond" at the heart of this visualisation runs:
//     obsRows -> obsFilters.allOutput = filteredObs -> taxaFromObs -> each checklist's rowFocus -> its rowSelection
//     -> interactions.result <- filteredObs
// where interactions.result.finalFilteredObs then feeds the map, the record count and the views. Since the reactive
// graph is glitch-free, interactions.result is evaluated once per change, with consistent inputs, however many paths
// a change takes to reach it.

// noinspection ES6ConvertVarToLetConst // otherwise this is a duplicate on minifying
var hortis = fluid.registerNamespace("hortis");

/**
 * Compute the plant and pollinator taxa, and all their ancestors, which are recorded in a set of observations.
 * @param {Object[]} filteredObs - The observations
 * @param {Object<String, TaxonRow>} rowById - Map of taxon id to taxon row
 * @return {Object} Members `plantRowFocus` and `pollRowFocus`, each a hash of taxon ids to `true`
 */
hortis.twoTaxaFromObs = function (filteredObs, rowById) {
    const plantIds = {},
        pollIds = {};
    filteredObs.forEach(row => {
        plantIds[row.plantINatId] = true;
        pollIds[row.pollinatorINatId] = true;
    });
    return {
        plantRowFocus: hortis.closeParentTaxa(plantIds, rowById),
        pollRowFocus: hortis.closeParentTaxa(pollIds, rowById)
    };
};

/** Interactions **/

// Counts plant-pollinator interactions in the filtered observations for the current taxonomic selections
fluid.def("hortis.interactions", {
    $layers: "fluid.component",
    // obsRows: Object[]
    // plantSelection: Object<String, Boolean>
    // pollSelection: Object<String, Boolean>
    // rowById: Object<String, TaxonRow>
    result: "$compute:hortis.interactions.count({self}.obsRows, {self}.plantSelection, {self}.pollSelection, {self}.rowById)",
    crossTable: "{self}.result.crossTable",
    plantCounts: "{self}.result.plantCounts",
    pollCounts: "{self}.result.pollCounts"
});

// Note that we can't use bitwise operators since they are defined to work on 32 bit operands!!
// https://stackoverflow.com/questions/63697853/js-bitwise-shift-operator-not-returning-the-correct-result
hortis.SHIFT = 2 ** 22;
hortis.MASK = hortis.SHIFT - 1;

hortis.intIdsToKey = function (plantId, pollId) {
    return ((+plantId) * hortis.SHIFT) + (+pollId);
};

hortis.keyToIntIds = function (key) {
    return {
        plantId: Math.floor(key / hortis.SHIFT),
        pollId: key & hortis.MASK
    };
};

hortis.addCount = function (table, key, count = 1) {
    table[key] = (table[key] || 0) + count;
};

hortis.max = function (hash) {
    return Object.values(hash).reduce((max, val) => Math.max(max, val), Number.NEGATIVE_INFINITY);
};

/**
 * Find the nearest ancestor of a taxon, including the taxon itself, which is a member of a selection.
 * @param {TaxonRow} row - The taxon row
 * @param {Object<String, Boolean>} selection - The selection
 * @return {String|undefined} The id of the nearest selected ancestor, or `undefined` if there is none
 */
hortis.findAncestor = function (row, selection) {
    let move = row;
    while (move !== undefined && selection[move.id] === undefined) {
        move = move.parent;
    }
    return move?.id;
};

/**
 * Construct a cache of the nearest selected ancestor of each taxon looked up.
 * @param {Object<String, Boolean>} selection - The selection
 * @param {Object<String, TaxonRow>} rowById - Map of taxon id to taxon row
 * @return {Function} Accepts a taxon id, returning the id of its nearest selected ancestor, if any
 */
hortis.ancestorHitCache = function (selection, rowById) {
    const taxonToAncestor = new Map();
    return function (taxonId) {
        let togo = taxonToAncestor.get(taxonId);
        if (!taxonToAncestor.has(taxonId)) {
            // eslint-disable-next-line eqeqeq
            const row = taxonId == 0 ? hortis.checklist.NO_TAXON_ROW : rowById[taxonId];
            togo = hortis.findAncestor(row, selection);
            taxonToAncestor.set(taxonId, togo);
        }
        return togo;
    };
};

/**
 * Count plant-pollinator interactions for the current taxonomic selection. Each observation is counted against the
 * nearest selected ancestor of its plant and of its pollinator.
 * @param {Object[]} rows - The observations surviving the filters
 * @param {Object<String, Boolean>} plantSelection - The currently selected plant taxa
 * @param {Object<String, Boolean>} pollSelection - The currently selected pollinator taxa
 * @param {Object<String, TaxonRow>} rowById - Map of taxon id to taxon row
 * @return {Object} Members `crossTable`, mapping the integer key of each plant and pollinator pair to its count,
 * `plantCounts` and `pollCounts`, each holding `counts` mapping taxon id to count and their `max`, and
 * `finalFilteredObs`, the observations counted
 */
hortis.interactions.count = function (rows, plantSelection, pollSelection, rowById) {
    const plantAncestor = hortis.ancestorHitCache(plantSelection, rowById);
    const pollAncestor = hortis.ancestorHitCache(pollSelection, rowById);

    const crossTable = {};
    const plantCounts = {counts: {}, max: 0};
    const pollCounts = {counts: {}, max: 0};
    const finalFilteredObs = [];
    const now = Date.now();

    rows.forEach(function (row) {
        const {pollinatorINatId: pollId, plantINatId: plantId} = row;
        if (plantId && pollId) {
            const plantCountKey = plantAncestor(plantId);
            const pollCountKey = pollAncestor(pollId);
            if (plantCountKey && pollCountKey) {
                hortis.addCount(crossTable, hortis.intIdsToKey(plantCountKey, pollCountKey));
                hortis.addCount(plantCounts.counts, plantCountKey);
                hortis.addCount(pollCounts.counts, pollCountKey);
                finalFilteredObs.push(row);
            }
        }
    });

    plantCounts.max = hortis.max(plantCounts.counts);
    pollCounts.max = hortis.max(pollCounts.counts);
    fluid.log("Counted " + rows.length + " obs into " + Object.keys(crossTable).length + " interaction cells in " + (Date.now() - now) + " ms");
    return {crossTable, plantCounts, pollCounts, finalFilteredObs};
};

/** The map **/

hortis.bbeaGridBucket = () => ({obsCount: 0, byTaxonId: {}, plantByTaxonId: {}});

hortis.indexBbeaObs = function (bucket, row, index) {
    fluid.pushArray(bucket.byTaxonId, row.pollinatorINatId, index);
    fluid.pushArray(bucket.plantByTaxonId, row.plantINatId, index);
};

hortis.bbeaGridTooltipTemplate =
`<div class="imerss-tooltip imerss-bbea-grid-tooltip">
    <div><b>Observations:</b> %obsCount</div>
    <div class="text"><b>Bees:</b> %beeCount<div>%beeTaxa</div></div>
    %footer
</div>`;

/**
 * Render the tooltip for a cell of the observation grid, listing the bees observed within it.
 * @param {Object} grid - The grid, as computed by `hortis.obsQuantiser.indexObs`
 * @param {Object<String, TaxonRow>} rowById - Map of taxon id to taxon row
 * @param {String} cellId - The id of the hovered cell
 * @return {String|null} The tooltip's markup, or null if the cell is empty
 */
hortis.renderBbeaGridTooltip = function (grid, rowById, cellId) {
    const bucket = grid.buckets[cellId];
    let togo = null;
    if (bucket) {
        const rowTemplate = "<div>%beeName: %obsCount observation%s</div>";
        const rows = Object.entries(bucket.byTaxonId).map(([taxonId, obsIds]) => ({
            beeName: rowById[taxonId]?.iNaturalistTaxonName || "Unknown",
            obsCount: obsIds.length,
            s: obsIds.length === 1 ? "" : "s"
        })).sort((rowa, rowb) => rowb.obsCount - rowa.obsCount);
        togo = hortis.stringTemplate(hortis.bbeaGridTooltipTemplate, {
            obsCount: bucket.obsCount,
            beeCount: rows.length,
            beeTaxa: rows.slice(0, 10).map(row => hortis.stringTemplate(rowTemplate, row)).join("\n"),
            footer: rows.length > 10 ? "<div class=\"text\">...</div>" : ""
        });
    }
    return togo;
};

/** The views pane **/

// A view in the views pane, which need only render whilst its tab is selected
fluid.def("hortis.bbeaView", {
    $layers: "hortis.downloadableView",
    // tabId: String
    active: "$compute:hortis.bbeaViewTabs.isSelected({bbeaViewTabs}.selectedTab, {self}.tabId)",
    inactive: "$compute:hortis.negate({self}.active)"
});

// The colours of bee families and plant phyla in the views
hortis.pollColours = {
    family: {
        "Andrenidae": "#E41A1C",
        "Apidae": "#377EB8",
        "Colletidae": "#4DAF4A",
        "Megachilidae": "#FF7F00",
        "Halictidae": "#984EA3",
        "Melittidae": "#ECC846"
    }
};

hortis.plantColours = {
    phylum: {
        "Tracheophyta": "#4DAF4A"
    }
};

hortis.computeRankColours = function (selection, colourIndex, idToEntry) {
    const entries = Object.keys(selection).map(id => idToEntry[id]).filter(entry => entry);
    const rows = entries.sort((a, b) => a.index - b.index).map(entry => entry.row);
    const colourEntries = rows.map(row => {
        let togo = [row.iNaturalistTaxonName, null];
        while (row) {
            const entry = colourIndex[row.rank]?.[row.iNaturalistTaxonName];
            if (entry) {
                togo[1] = entry;
                break;
            }
            row = row.parent;
        }
        return togo;
    });
    const colours = Object.fromEntries(colourEntries);
    return {rows, colours};
};
