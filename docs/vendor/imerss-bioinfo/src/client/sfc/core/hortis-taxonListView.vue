<script src="%@popperjs/core/dist/umd/popper-lite.min.js" fluid-client data-fl-scope="global"></script>
<script src="../../js/colour.js" data-fl-scope="global"></script>
<script src="../../js/i6/imerss-core.js"></script>
<script src="../../js/i6/tooltip.js"></script>
<script src="../../js/i6/bbea/mfShell.js"></script>
<script src="../../js/i6/libreMap.js"></script>
<script src="../../js/i6/bbea/imerss-bbea.js"></script>
<script>
"use strict";

// A list of the bee or plant taxa in the current selection, arranged by family or alphabetically
fluid.def("hortis.taxonListView", {
    $layers: ["hortis.bbeaView", "hortis.withTaxonTooltip"],
    // idField: String - the observation field holding the taxon id listed
    // colourByFamily: Boolean - whether family headings carry a colour chip
    // noun: String - "bee" or "plant"
    // downloadFile: String
    pkg: "{vizLoader}.pkg",
    selection: "{vizLoader}.finalFilteredObs",
    rowById: "{vizLoader}.taxa.rowById",
    arrange: "family",
    // Where the observations counted beside each taxon were made, as described in its tooltip
    countScope: "in the current selection",
    emptyText: "$compute:hortis.taxonListView.emptyText({self}.noun)",
    arrangeOn: "$compute:hortis.taxonListView.arrangeOn({self}.arrange)",
    listRows: "$compute:hortis.taxonListView.computeRows({self}.pkg, {self}.selection, {self}.rowById, {self}.idField)",
    countSlot: {
        $component: {
            $layers: "hortis.verbatimSlot",
            markup: "$compute:hortis.taxonListView.countMarkup({taxonListView}.active, {taxonListView}.listRows, {taxonListView}.noun)"
        }
    },
    bodySlot: {
        $component: {
            $layers: "hortis.verbatimSlot",
            markup: `$compute:hortis.taxonListView.bodyMarkup({taxonListView}.active, {taxonListView}.arrange, {taxonListView}.listRows,
                {taxonListView}.noun, {taxonListView}.colourByFamily, {taxonListView}.countScope, {taxonListView}.emptyText)`
        }
    },
    download: "$method:hortis.taxonListView.download({self}.listRows, {self}.downloadFile)"
});

// Ranks at or below species, whose taxa are always listed
hortis.taxonListView.terminalRanks = ["species", "subspecies", "variety", "form", "hybrid"];

/**
 * Determine whether a taxon should have its own row in the display of a taxon list - its observations are counted
 * in the list's totals regardless. Taxa at or below species are always listed.
 * An intermediate taxon such as a genus, subgenus, section or complex is listed only if no other taxon is recorded
 * within it. Since the taxa table attaches species directly to their genus even when a subgenus is recorded, an
 * intermediate taxon below genus is judged by its genus - it is listed only if the genus holds no other taxon.
 * @param {Object} row - A taxon row
 * @return {Boolean} `true` if the taxon should be listed
 */
hortis.taxonListView.isListable = function (row) {
    const scope = hortis.ancestorAtRank(row, "genus") || row;
    const othersWithin = scope === row ? row.children.length > 0 : scope.children.some(child => child !== row);
    return hortis.taxonListView.terminalRanks.includes(row.rank) || !othersWithin;
};

/**
 * Compute the rows of the list - one for each species, or taxon not identified to species, with its count of
 * observations.
 * @param {VizPackage} pkg - The data package
 * @param {Selection} selection - The observations
 * @param {Object<String, TaxonRow>} rowById - Map of taxon id to taxon row
 * @param {String} idField - The observation field holding the taxon id listed
 * @return {Object[]} The rows
 */
hortis.taxonListView.computeRows = function (pkg, selection, rowById, idField) {
    const bareRowById = fluid.unwrapProxy(rowById);
    const byId = new Map();
    hortis.countObsBy(pkg, selection, idField).forEach((count, taxonId) => {
        const row = bareRowById[taxonId];
        if (row) {
            const speciesRow = hortis.speciesRowOf(row);
            const existing = byId.get(speciesRow.id);
            if (existing) {
                existing.count += count;
            } else {
                byId.set(speciesRow.id, {row: speciesRow, count});
            }
        }
    });
    return [...byId.values()].map(({row, count}) => ({
        id: row.id,
        row,
        label: hortis.taxonLabel(row),
        family: hortis.familyNameOf(row),
        count,
        listed: hortis.taxonListView.isListable(row)
    }));
};

/**
 * Group list records by family, families being ordered by their total number of observations, and records within
 * each family alphabetically.
 * @param {Object[]} listRows - Records as produced by `hortis.taxonListView.computeRows`
 * @return {Object[]} One record per family with members `family`, `count` and `rows`
 */
hortis.taxonListView.byFamily = function (listRows) {
    const families = new Map();
    listRows.forEach(listRow => {
        const existing = families.get(listRow.family);
        if (existing) {
            existing.count += listRow.count;
            existing.rows.push(listRow);
        } else {
            families.set(listRow.family, {family: listRow.family, count: listRow.count, rows: [listRow]});
        }
    });
    const togo = [...families.values()].sort((a, b) => b.count - a.count || a.family.localeCompare(b.family));
    togo.forEach(family => family.rows.sort((a, b) => a.label.localeCompare(b.label)));
    return togo;
};

hortis.taxonListView.emptyText = noun => `No ${noun}s match the current filters and selections.`;

/**
 * Render the row of one taxon of a list.
 * @param {Object} listRow - The taxon's record, as computed by `hortis.taxonListView.computeRows`
 * @param {String} noun - "bee" or "plant"
 * @param {String} countScope - Where the observations counted were made, e.g. "in the current selection"
 * @return {String} The row's markup
 */
hortis.taxonListView.rowMarkup = function (listRow, noun, countScope) {
    const count = hortis.formatInt(listRow.count);
    const tip = `${hortis.plural(listRow.count, "observation")} of this ${noun} ${countScope}`;
    return `<div class="imerss-taxon"><span class="imerss-taxon-name" data-row-id="${listRow.id}">${hortis.taxonNameMarkup(listRow.row)}</span>` +
        `<i title="${tip}">${count}</i></div>`;
};

hortis.taxonListView.download = function (listRows, downloadFile) {
    const rows = hortis.taxonListView.byFamily(listRows).flatMap(family => family.rows.map(listRow => [listRow.label, listRow.family, listRow.count]));
    hortis.downloadCSV(["taxon", "family", "observations"], rows, downloadFile);
};

/** Markup of the taxon lists **/

/**
 * Render the counts in a taxon list's bar.
 * @param {Boolean} active - `true` if the list's tab is selected - otherwise nothing is rendered
 * @param {Object[]} listRows - The rows of the list, as computed by `hortis.taxonListView.computeRows`
 * @param {String} noun - "bee" or "plant"
 * @return {String} The markup of the counts
 */
hortis.taxonListView.countMarkup = function (active, listRows, noun) {
    let togo = "";
    if (active) {
        // Totals count every observation, including those of intermediate taxa which have no row of their own
        const total = listRows.reduce((sum, listRow) => sum + listRow.count, 0);
        const shownCount = listRows.filter(listRow => listRow.listed).length;
        togo = `<span title="Number of distinct ${noun} taxa listed - species, or coarser where nothing more specific was recorded">${hortis.plural(shownCount, "taxon", "taxa")}</span>` +
            ` &middot; <span title="Number of observation records in the current selection, including those identified only to genus or subgenus">${hortis.plural(total, "observation")}</span>`;
    }
    return togo;
};

/**
 * Render the body of a taxon list.
 * @param {Boolean} active - `true` if the list's tab is selected - otherwise nothing is rendered
 * @param {String} arrange - "family" to arrange the list by family, or "flat" to list it alphabetically
 * @param {Object[]} listRows - The rows of the list, as computed by `hortis.taxonListView.computeRows`
 * @param {String} noun - "bee" or "plant"
 * @param {Boolean} colourByFamily - Whether family headings carry a colour chip
 * @param {String} countScope - Where the observations counted were made, e.g. "in the current selection"
 * @param {String} emptyText - The message shown when the list is empty
 * @return {String} The markup of the list
 */
hortis.taxonListView.bodyMarkup = function (active, arrange, listRows, noun, colourByFamily, countScope, emptyText) {
    let togo = "";
    if (active) {
        const listed = rows => rows.filter(listRow => listRow.listed);
        let markup;
        if (listRows.length === 0) {
            markup = `<p class="imerss-empty">${hortis.encodeHTML(emptyText)}</p>`;
        } else if (arrange === "family") {
            markup = hortis.taxonListView.byFamily(listRows).map(family => {
                const familyRows = listed(family.rows);
                const colour = hortis.pollColours.family[family.family];
                const chip = colourByFamily ? `<b style="background: ${colour || "#999"}"></b>` : "";
                const tip = `${hortis.plural(familyRows.length, noun + " taxon", noun + " taxa")} listed, with ${hortis.plural(family.count, "observation")} in ${family.family}`;
                return `<div class="imerss-famhead">${chip}<span>${hortis.encodeHTML(family.family)}</span><i title="${tip}">${hortis.plural(familyRows.length, "taxon", "taxa")}</i></div>` +
                    familyRows.map(listRow => hortis.taxonListView.rowMarkup(listRow, noun, countScope)).join("");
            }).join("");
        } else {
            markup = listed(listRows).sort((a, b) => a.label.localeCompare(b.label))
                .map(listRow => hortis.taxonListView.rowMarkup(listRow, noun, countScope)).join("");
        }
        togo = `<div class="imerss-taxon-list">${markup}</div>`;
    }
    return togo;
};

hortis.taxonListView.arrangeOn = arrange => ({family: arrange === "family", flat: arrange === "flat"});

/**
 * Show a tooltip for the taxon whose name is under the pointer, if any.
 * @param {Event} event - A mouse event within the list
 * @param {hortis.taxonListView} that - The list
 */
hortis.taxonListView.hover = function (event, that) {
    const name = event.type === "mouseleave" ? null : event.target.closest?.(".imerss-taxon-name");
    that.hoverAt(name ? name.dataset.rowId : null, event);
};
</script>

<template>
    <div class="imerss-mount imerss-mount-pad" role="tabpanel" hidden="@{inactive}"
        @onmouseover="hortis.taxonListView.hover({0}, {self})" @onmouseleave="hortis.taxonListView.hover({0}, {self})">
        <div class="imerss-listbar">
            <span class="imerss-listbar-label">Arrange</span>
            <div class="imerss-seg" role="group" aria-label="Arrange @{noun} list">
                <button class="imerss-seg-btn" @class="imerss-seg-on:@{arrangeOn.family}" type="button" data-arrange="family"
                    @onclick="{self}.arrange = family">By family</button>
                <button class="imerss-seg-btn" @class="imerss-seg-on:@{arrangeOn.flat}" type="button" data-arrange="flat"
                    @onclick="{self}.arrange = flat">A &ndash; Z</button>
            </div>
            <span class="imerss-listbar-count" @id="countSlot"></span>
        </div>
        <div class="imerss-listbody" @id="bodySlot"></div>
    </div>
</template>
