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
 * @param {VizPackage} pkg - The data package
 * @param {Selection} selection - The observations
 * @param {Object<String, TaxonRow>} rowById - Map of taxon id to taxon row
 * @return {Object} Members `plantRowFocus` and `pollRowFocus`, each a hash of taxon ids to `true`
 */
hortis.twoTaxaFromObs = function (pkg, selection, rowById) {
    return {
        plantRowFocus: hortis.taxaFromObs(pkg, selection, rowById, "plantINatId"),
        pollRowFocus: hortis.taxaFromObs(pkg, selection, rowById, "pollinatorINatId")
    };
};

/** Interactions **/

// Counts plant-pollinator interactions in the filtered observations for the current taxonomic selections
fluid.def("hortis.interactions", {
    $layers: "fluid.component",
    // pkg: VizPackage
    // selection: Selection - the observations surviving the filters
    // plantSelection: Object<String, Boolean>
    // pollSelection: Object<String, Boolean>
    // rowById: Object<String, TaxonRow>
    // Each pair of plant and pollinator observed together, with its count - which the taxonomic selections only regroup
    plantField: "plantINatId",
    pollField: "pollinatorINatId",
    pairs: "$compute:hortis.countObsByPair({self}.pkg, {self}.selection, {self}.plantField, {self}.pollField)",
    result: "$compute:hortis.interactions.count({self}.pkg, {self}.selection, {self}.pairs, {self}.plantSelection, {self}.pollSelection, {self}.rowById)",
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
 * nearest selected ancestor of its plant and of its pollinator - which, since all the observations of a pair of plant
 * and pollinator are counted alike, is computed for each pair rather than each observation.
 * @param {VizPackage} pkg - The data package
 * @param {Selection} selection - The observations surviving the filters
 * @param {Array[]} pairs - Each pair of plant and pollinator ids observed, with its count, as by hortis.countObsByPair
 * @param {Object<String, Boolean>} plantSelection - The currently selected plant taxa
 * @param {Object<String, Boolean>} pollSelection - The currently selected pollinator taxa
 * @param {Object<String, TaxonRow>} rowById - Map of taxon id to taxon row
 * @return {Object} Members `crossTable`, mapping the integer key of each plant and pollinator pair to its count,
 * `plantCounts` and `pollCounts`, each holding `counts` mapping taxon id to count and their `max`, and
 * `finalFilteredObs`, the observations counted, as a Selection
 */
hortis.interactions.count = function (pkg, selection, pairs, plantSelection, pollSelection, rowById) {
    const bareRowById = fluid.unwrapProxy(rowById);
    const plantAncestor = hortis.ancestorHitCache(fluid.unwrapProxy(plantSelection), bareRowById);
    const pollAncestor = hortis.ancestorHitCache(fluid.unwrapProxy(pollSelection), bareRowById);

    const crossTable = {};
    const plantCounts = {counts: {}, max: 0};
    const pollCounts = {counts: {}, max: 0};
    const plantIds = new Set(), pollIds = new Set();
    const now = Date.now();

    fluid.unwrapProxy(pairs).forEach(function ([plantId, pollId, count]) {
        const plantCountKey = plantAncestor(plantId);
        const pollCountKey = pollAncestor(pollId);
        if (plantCountKey && pollCountKey) {
            hortis.addCount(crossTable, hortis.intIdsToKey(plantCountKey, pollCountKey), count);
            hortis.addCount(plantCounts.counts, plantCountKey, count);
            hortis.addCount(pollCounts.counts, pollCountKey, count);
            plantIds.add(plantId);
            pollIds.add(pollId);
        }
    });

    plantCounts.max = hortis.max(plantCounts.counts);
    pollCounts.max = hortis.max(pollCounts.counts);
    // An observation is counted if both its plant and its pollinator lie within the selections, independently
    const finalFilteredObs = hortis.selectObs(pkg, [
        {field: "plantINatId", op: "in", value: [...plantIds]},
        {field: "pollinatorINatId", op: "in", value: [...pollIds]}
    ], selection);
    fluid.log("Counted " + selection.count + " obs into " + Object.keys(crossTable).length + " interaction cells in " + (Date.now() - now) + " ms");
    return {crossTable, plantCounts, pollCounts, finalFilteredObs};
};

/** The map **/

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
        const rows = Object.entries(grid.taxaOf(cellId)).map(([taxonId, obsCount]) => ({
            beeName: rowById[taxonId] ? hortis.rowToScientific(rowById[taxonId]) : "Unknown",
            obsCount,
            s: obsCount === 1 ? "" : "s"
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
// The colours of the bee families - ColorBrewer's Set1 adjusted as little as possible in hue and lightness so that
// no two are confused under protanopia or deuteranopia - see notes/deuteranopia-bee-families.md
hortis.pollColours = {
    family: {
        "Andrenidae": "#E60916",
        "Apidae": "#0178DF",
        "Colletidae": "#18B97F",
        "Megachilidae": "#FC7900",
        "Halictidae": "#9B4D9B",
        "Melittidae": "#EDC947"
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
        // Named as the checklists and the bipartite diagram name it, though looked up in the colour index by its
        // iNaturalist name
        let togo = [hortis.rowToScientific(row), null];
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
