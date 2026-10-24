/*
Copyright 2023-2026 Antranig Basman
Licensed under the Educational Community License (ECL), Version 2.0 or the New
BSD license. You may not use this file except in compliance with one these
Licenses.
You may obtain a copy of the ECL 2.0 License and BSD License at
https://github.com/fluid-project/infusion/raw/master/Infusion-LICENSE.txt
*/

/* global d3, imerss */

"use strict";

// The views pane of the BBEA visualisation ported to Infusion 6 from src/client/js/new/imerss-bbea.js - the
// interaction matrix, the bipartite network, the bee and plant lists, bee abundance and the seed mix evaluator.
// Their containers are supplied by the page. Each view renders by an effect only whilst its tab is selected, and
// none writes values into the reactive graph from its rendering, as the matrix's rendering used to for the network.

// noinspection ES6ConvertVarToLetConst // otherwise this is a duplicate on minifying
var hortis = fluid.registerNamespace("hortis");


// A view in the views pane, rendering into a container supplied by the page
fluid.def("hortis.bbeaView", {
    $layers: ["hortis.downloadableView", "hortis.pageMarkupComponent"],
    // tabId: String
    // selector: String
    active: "$compute:hortis.viewTabs.isSelected({viewTabs}.selectedTab, {self}.tabId)"
});

/** Interaction matrix **/

fluid.def("hortis.drawInteractions", {
    $layers: ["hortis.downloadableView", "hortis.withTooltip"],
    tabId: "mtx",
    squareSize: 16,
    squareMargin: 2,
    fillStops: hortis.libreMap.natureStops,
    outlineColour: "black",
    memoStops: "$compute:fluid.colour.memoStops({self}.fillStops, 32)",
    crossTable: "{interactions}.crossTable",
    plantCounts: "{interactions}.plantCounts",
    pollCounts: "{interactions}.pollCounts",
    rowById: "{vizLoader}.taxa.rowById",
    layout: "$compute:hortis.drawInteractions.layout({self}.crossTable, {self}.plantCounts, {self}.pollCounts, {self}.rowById)",
    // Rows of (bee, plant, count) for the bipartite network and the matrix's download
    bipartiteRows: "{self}.layout.bipartiteRows",
    view: {
        $component: {
            $layers: "hortis.selectorContainerView",
            selector: ".imerss-interactions-holder",
            // The tree's root bears the container's own class, so may be elided onto it
            elideParent: true,
            templateTree: "$compute:hortis.drawInteractions.renderTree({$parent}, {$parent}.layout)"
        }
    },
    // Only the canvas is drawn imperatively - the labels and count bars are rendered as part of the view's tree
    drawCanvas: "$effect:hortis.drawInteractions.drawCanvas({self}, {self}.view.renderedContainer, {self}.layout, {self}.memoStops)",
    domBinding: {
        $bindable: {
            bind: "hortis.drawInteractions.bindEvents({self}, {self}.view.renderedContainer)",
            unbind: "hortis.unbindDomListeners({boundValue})"
        }
    },
    renderTooltip: "$method:hortis.drawInteractions.renderTooltip({self}.layout, {0}:hoverId)",
    download: "$method:hortis.drawInteractions.download({self}.bipartiteRows)"
});

/** Bipartite network **/

fluid.def("hortis.bipartite", {
    $layers: "hortis.bbeaView",
    tabId: "net",
    selector: ".imerss-bipartite",
    bipartiteRows: "{drawInteractions}.bipartiteRows",
    beeSelection: "{vizLoader}.pollChecklist.rowSelection",
    beeIdToEntry: "{vizLoader}.pollChecklist.idToEntry",
    plantSelection: "{vizLoader}.plantChecklist.rowSelection",
    plantIdToEntry: "{vizLoader}.plantChecklist.idToEntry",
    width: {
        $bindable: {
            bind: "hortis.widthCell({self}.container, {global})",
            unbind: "hortis.unobserveWidth({boundValue})"
        }
    },
    render: `$effect:hortis.bipartite.render({self}.container, {self}.active, {self}.width, {self}.bipartiteRows, {self}.beeSelection,
        {self}.beeIdToEntry, {self}.plantSelection, {self}.plantIdToEntry)`,
    download: "$method:hortis.bipartite.downloadFrom({self}.container)"
});

/** Taxon lists **/

fluid.def("hortis.taxonListView", {
    $layers: ["hortis.bbeaView", "hortis.withTaxonTooltip"],
    // idField: String - the observation field holding the taxon id listed
    // colourByFamily: Boolean - whether family headings carry a colour chip
    // noun: String - "bee" or "plant"
    // downloadFile: String
    obsRows: "{vizLoader}.finalFilteredObs",
    rowById: "{vizLoader}.taxa.rowById",
    arrange: "family",
    listRows: "$compute:hortis.taxonListView.computeRows({self}.obsRows, {self}.rowById, {self}.idField)",
    render: "$effect:hortis.taxonListView.render({self}.container, {self}.active, {self}.arrange, {self}.listRows, {self}.noun, {self}.colourByFamily)",
    domBinding: {
        $bindable: {
            bind: "hortis.taxonListView.bindEvents({self}, {self}.container)",
            unbind: "hortis.unbindDomListeners({boundValue})"
        }
    },
    download: "$method:hortis.taxonListView.download({self}.listRows, {self}.downloadFile)"
});

/** Bee abundance **/

fluid.def("hortis.beeAbundance", {
    $layers: "hortis.bbeaView",
    tabId: "abund",
    selector: ".imerss-bee-abundance",
    // Maximum number of bars drawn in each chart
    chartLimits: {
        family: 50,
        genus: 40,
        species: 40
    },
    // Minimum width in pixels allotted to each bar - charts wider than the pane scroll horizontally
    minBand: 16,
    // Maximum width in pixels allotted to each bar
    maxBand: 80,
    obsRows: "{vizLoader}.finalFilteredObs",
    rowById: "{vizLoader}.taxa.rowById",
    charts: "$compute:hortis.querySelectorIn({self}.container, .mf-charts)",
    width: {
        $bindable: {
            bind: "hortis.widthCell({self}.charts, {global})",
            unbind: "hortis.unobserveWidth({boundValue})"
        }
    },
    abundance: "$compute:hortis.beeAbundance.compute({self}.obsRows, {self}.rowById)",
    render: "$effect:hortis.beeAbundance.render({self}, {self}.container, {self}.active, {self}.width, {self}.abundance)",
    download: "$method:hortis.beeAbundance.download({self}.container)"
});

/** Seed mix evaluator **/

fluid.def("hortis.seedMix", {
    $layers: "hortis.bbeaView",
    tabId: "seed",
    selector: ".imerss-seed-mix",
    // Number of candidate plants listed before the user asks to see them all
    shortListLength: 60,
    allObs: "{vizLoader}.obsRows",
    // Observations passing the filters but not the bee and plant selections - these define the site
    siteObs: "{vizLoader}.filteredObs",
    rowById: "{vizLoader}.taxa.rowById",
    network: "$compute:hortis.seedMix.computeNetwork({self}.allObs, {self}.rowById)",
    established: "$compute:hortis.seedMix.computeEstablished({self}.siteObs, {self}.allObs, {self}.rowById)",
    // Hashes to true of the ids of established plants which the user has unticked, and of further plants they have ticked
    removed: {
        $reactiveRoot: {}
    },
    added: {
        $reactiveRoot: {}
    },
    query: "",
    showAll: false,
    // Bumped to force the plant list to rerender when the selection is reset
    listVersion: 0,
    renderList: `$effect:hortis.seedMix.renderList({self}, {self}.container, {self}.active, {self}.network, {self}.established, {self}.query,
        {self}.showAll, {self}.listVersion)`,
    renderOutput: "$effect:hortis.seedMix.renderOutput({self}.container, {self}.active, {self}.network, {self}.established, {self}.removed, {self}.added)",
    domBinding: {
        $bindable: {
            bind: "hortis.seedMix.bindEvents({self}, {self}.container)",
            unbind: "hortis.unbindDomListeners({boundValue})"
        }
    },
    download: "$method:hortis.seedMix.download({self}.network, {self}.established, {self}.removed, {self}.added)"
});

/** Functions carried over unchanged from src/client/js/new/imerss-bbea.js **/

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

// This gets injected into a rendered bipartite diagram - keep in step with imerss-bbea.css etc.
hortis.bipartite.css = `
<style>
    svg {
        font-size: 14px;
        font-family: Arial,Helvetica,sans-serif;
    }
    .bipartite-label {
        font-size: 18px;
        font-weight: 500;
    }
</style>
`;

hortis.loadImage = async url => {
    const $img = document.createElement("img");
    $img.src = url;
    return new Promise((resolve) => {
        $img.onload = () => resolve($img);
        $img.onerror = e => {
            console.log("Got error ", e);
        };
        $img.src = url;
    });
};

hortis.getCanvasBlob = async (svgURL, { format, quality, scale }) => {
    const img = await hortis.loadImage(svgURL);

    const $canvas = document.createElement("canvas");
    $canvas.width = img.naturalWidth * scale;
    $canvas.height = img.naturalHeight * scale;
    $canvas.getContext("2d").drawImage(img, 0, 0, img.naturalWidth * scale, img.naturalHeight * scale);

    const blob = await new Promise(resolve => $canvas.toBlob(resolve, `image/${format}`, quality));
    return blob;
};

function injectSvgStyle(svgText, style) {
    return svgText.replace(/(<svg[^>]*>)/, `$1${style}`);
}

hortis.bipartite.download = async function (svgNode) {
    const dataHeader = "data:image/svg+xml;charset=utf-8";
    const serializeAsXML = $e => (new XMLSerializer()).serializeToString($e);
    const encodeAsUTF8 = s => {
        return `${dataHeader},${encodeURIComponent(injectSvgStyle(s, hortis.bipartite.css))}`;
    };
    const svgURL = encodeAsUTF8(serializeAsXML(svgNode));

    const blob = await hortis.getCanvasBlob(svgURL, {format: "png", scale: 4});
    hortis.triggerDownload(blob, "image/png", "bipartite.png");
};

hortis.maxReducer = function () {
    const togo = {
        value: Number.NEGATIVE_INFINITY,
        reduce: next => {togo.value = Math.max(next, togo.value);}
    };
    return togo;
};

hortis.minReducer = function () {
    const togo = {
        value: Number.POSITIVE_INFINITY,
        reduce: next => {togo.value = Math.min(next, togo.value);}
    };
    return togo;
};

/** Taxonomic helpers for the views pane **/

/**
 * Find the nearest ancestor of a taxon, including the taxon itself, at a particular rank.
 * @param {Object} row - A taxon row, with `parent` assigned by `hortis.taxa.map`
 * @param {String} rank - The rank sought
 * @return {Object|undefined} The ancestor row at that rank, or `undefined` if there is none
 */
hortis.ancestorAtRank = function (row, rank) {
    let move = row;
    while (move && move.rank !== rank) {
        move = move.parent;
    }
    return move;
};

/**
 * Find the species to which a taxon belongs, so that infraspecific taxa are counted with their species. A taxon
 * identified only above species level stands for itself.
 * @param {Object} row - A taxon row
 * @return {Object} The row for the taxon's species, or the row itself if it has no species
 */
hortis.speciesRowOf = function (row) {
    return hortis.ancestorAtRank(row, "species") || row;
};

/**
 * Find the name of the family to which a taxon belongs.
 * @param {Object} row - A taxon row
 * @return {String} The family's name, or "Unplaced" if the taxon has no family
 */
hortis.familyNameOf = function (row) {
    return hortis.ancestorAtRank(row, "family")?.iNaturalistTaxonName || "Unplaced";
};

/**
 * Label a taxon by its scientific name, noting its rank if it was not identified to species.
 * @param {Object} row - A taxon row
 * @return {String} The label, e.g. "Bombus mixtus" or "Nomada (genus)"
 */
hortis.taxonLabel = function (row) {
    const name = hortis.rowToScientific(row);
    return row.rank && row.rank !== "species" ? `${name} (${row.rank})` : name;
};

/**
 * Render a taxon's scientific name as markup, followed by its rank in Roman type if it was not identified to species.
 * @param {Object} row - A taxon row
 * @return {String} The markup
 */
hortis.taxonNameMarkup = function (row) {
    const name = `<em>${hortis.renderSpeciesName(hortis.encodeHTML(hortis.rowToScientific(row)))}</em>`;
    return row.rank && row.rank !== "species" ? `${name} <span class="mf-rank">${row.rank}</span>` : name;
};

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
 * Count the observations of each taxon in a set of observations, rolling infraspecific taxa up into their species.
 * Records for intermediate taxa such as a genus or subgenus are marked as not `listed` unless no other taxon is
 * recorded within them - see `hortis.taxonListView.isListable`.
 * @param {Object[]} obsRows - The observations
 * @param {Object<String, Object>} rowById - Map of taxon id to taxon row
 * @param {String} idField - The observation field holding the taxon id to be counted
 * @return {Object[]} One record per taxon with members `id`, `row`, `label`, `family`, `count` and `listed`
 */
hortis.taxonListView.computeRows = function (obsRows, rowById, idField) {
    const byId = new Map();
    obsRows.forEach(obsRow => {
        const row = rowById[obsRow[idField]];
        if (row) {
            const speciesRow = hortis.speciesRowOf(row);
            const existing = byId.get(speciesRow.id);
            if (existing) {
                ++existing.count;
            } else {
                byId.set(speciesRow.id, {row: speciesRow, count: 1});
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

hortis.taxonListView.rowMarkup = function (listRow, noun) {
    const count = hortis.formatInt(listRow.count);
    const tip = `${hortis.plural(listRow.count, "observation")} of this ${noun} in the current selection`;
    return `<div class="mf-taxon"><span class="mf-taxon-name" data-row-id="${listRow.id}">${hortis.taxonNameMarkup(listRow.row)}</span>` +
        `<i title="${tip}">${count}</i></div>`;
};

/** Bar charts drawn as SVG markup **/

/**
 * Choose a round step and upper bound for a count axis with about four intervals.
 * @param {Number} max - The largest value to be plotted
 * @return {Object} Members `step`, a whole number, and `top`, the smallest multiple of `step` at least `max`
 */
hortis.niceScale = function (max) {
    const bounded = Math.max(max, 1);
    const raw = bounded / 4;
    const magnitude = Math.pow(10, Math.floor(Math.log10(raw)));
    const normal = raw / magnitude;
    const nice = normal <= 1 ? 1 : normal <= 2 ? 2 : normal <= 5 ? 5 : 10;
    const step = Math.max(1, nice * magnitude);
    return {step, top: step * Math.ceil(bounded / step)};
};

/**
 * Truncate a label to a maximum length, marking the truncation with an ellipsis.
 * @param {String} label - The label
 * @param {Number} maxLength - The maximum length of the returned label
 * @return {String} The possibly truncated label
 */
hortis.truncateLabel = function (label, maxLength) {
    return label.length > maxLength ? label.substring(0, maxLength - 1) + "…" : label;
};

/**
 * Render a vertical bar chart of counts, one bar per row, as SVG markup.
 * @param {Object[]} rows - Records each with members `label` and `count`, in display order
 * @param {Object} opts - Chart options:
 *     width, height: Number - dimensions in pixels
 *     foot: Number - height in pixels reserved below the plot for bar labels and the x axis label
 *     angle: Number - rotation of bar labels in degrees
 *     title, titleTip: String - the chart heading and its tooltip
 *     xLabel, xTip, yLabel, yTip: String - the axis labels and their tooltips
 *     colourOf: Function - maps a row to its bar colour
 *     rowTip: Function - maps a row to the tooltip for its bar
 * @return {String} The chart's SVG markup
 */
hortis.barChartMarkup = function (rows, opts) {
    const enc = hortis.encodeHTML;
    const left = 58, right = opts.width - 10, top = 34;
    const base = opts.height - opts.foot;
    const {step, top: scaleTop} = hortis.niceScale(rows.reduce((max, row) => Math.max(max, row.count), 0));
    const band = (right - left) / Math.max(rows.length, 1);
    const barWidth = Math.min(30, band * 0.7);
    const yOf = value => base - value / scaleTop * (base - top);
    const parts = [];
    parts.push(`<text x="${left}" y="18" class="mf-chart-title">${enc(opts.title)}<title>${enc(opts.titleTip)}</title></text>`);
    for (let value = 0; value <= scaleTop; value += step) {
        const y = yOf(value);
        parts.push(`<line x1="${left}" y1="${y}" x2="${right}" y2="${y}" class="mf-chart-grid"/>`);
        parts.push(`<text x="${left - 7}" y="${y + 4}" text-anchor="end" class="mf-chart-tick">${hortis.formatInt(value)}<title>${enc(hortis.formatInt(value) + " " + opts.yLabel.toLowerCase())}</title></text>`);
    }
    rows.forEach((row, i) => {
        const height = base - yOf(row.count);
        const x = left + band * i + (band - barWidth) / 2;
        const tip = enc(opts.rowTip(row));
        parts.push(`<rect x="${x}" y="${base - height}" width="${barWidth}" height="${height}" fill="${opts.colourOf(row)}" class="mf-chart-bar"><title>${tip}</title></rect>`);
        parts.push(`<text x="0" y="0" text-anchor="end" class="mf-chart-label" transform="translate(${x + barWidth / 2 + 3} ${base + 9}) rotate(${opts.angle})">` +
            `${enc(hortis.truncateLabel(row.label, 30))}<title>${tip}</title></text>`);
    });
    parts.push(`<line x1="${left}" y1="${base}" x2="${right}" y2="${base}" class="mf-chart-axis-line"/>`);
    parts.push(`<text x="0" y="0" text-anchor="middle" class="mf-chart-axis" transform="translate(16 ${(top + base) / 2}) rotate(-90)">${enc(opts.yLabel)}<title>${enc(opts.yTip)}</title></text>`);
    parts.push(`<text x="${(left + right) / 2}" y="${opts.height - 6}" text-anchor="middle" class="mf-chart-axis">${enc(opts.xLabel)}<title>${enc(opts.xTip)}</title></text>`);
    return `<svg class="mf-chart" width="${opts.width}" height="${opts.height}" viewBox="0 0 ${opts.width} ${opts.height}" role="img" aria-label="${enc(opts.title)}">${parts.join("")}</svg>`;
};

/**
 * Count bee observations by family, genus and species.
 * @param {Object[]} obsRows - The observations
 * @param {Object<String, Object>} rowById - Map of taxon id to taxon row
 * @return {Object} Members `family`, `genus` and `species`, each an array of records with members `label`, `family`
 * and `count` sorted by descending count
 */
hortis.beeAbundance.compute = function (obsRows, rowById) {
    const tallies = {family: new Map(), genus: new Map(), species: new Map()};
    const tally = (map, key, label, family) => {
        const existing = map.get(key);
        if (existing) {
            ++existing.count;
        } else {
            map.set(key, {label, family, count: 1});
        }
    };
    obsRows.forEach(obsRow => {
        const row = rowById[obsRow.pollinatorINatId];
        if (row) {
            const family = hortis.familyNameOf(row);
            const genusRow = hortis.ancestorAtRank(row, "genus");
            const speciesRow = hortis.speciesRowOf(row);
            tally(tallies.family, family, family, family);
            if (genusRow) {
                tally(tallies.genus, genusRow.id, genusRow.iNaturalistTaxonName, family);
            }
            tally(tallies.species, speciesRow.id, hortis.taxonLabel(speciesRow), family);
        }
    });
    const sorted = map => [...map.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
    return fluid.transform(tallies, sorted);
};

// Presentational properties copied from the page's stylesheet onto each element of an SVG exported as a standalone file
hortis.svgInlinedProperties = ["fill", "stroke", "stroke-width", "font-family", "font-size", "font-weight"];

/**
 * Copy the computed values of the presentational properties of each element of a rendered SVG onto the
 * corresponding element of its clone, so that the clone renders identically without the page's stylesheet.
 * @param {SVGElement} source - The SVG element as rendered in the page
 * @param {SVGElement} clone - A deep clone of `source`, which will be modified
 */
hortis.inlineSVGStyles = function (source, clone) {
    const sources = [source, ...source.querySelectorAll("*")];
    const clones = [clone, ...clone.querySelectorAll("*")];
    sources.forEach((node, i) => {
        const computed = getComputedStyle(node);
        clones[i].setAttribute("style", hortis.svgInlinedProperties.map(prop => `${prop}: ${computed.getPropertyValue(prop)}`).join("; "));
    });
};

/**
 * Index the whole dataset's plant-pollinator network at the level of species.
 * @param {Object[]} obsRows - All observations in the dataset
 * @param {Object<String, Object>} rowById - Map of taxon id to taxon row
 * @return {Object} Members `plants`, a Map of plant id to `{id, label, bees}` where `bees` is the Set of ids of bee
 * species recorded visiting it, and `beeFamily`, a Map of the id of each bee species recorded on any plant to its family
 */
hortis.seedMix.computeNetwork = function (obsRows, rowById) {
    const plants = new Map();
    const beeFamily = new Map();
    obsRows.forEach(obsRow => {
        const plantRow = rowById[obsRow.plantINatId];
        const beeRow = rowById[obsRow.pollinatorINatId];
        if (plantRow && beeRow) {
            const plant = hortis.speciesRowOf(plantRow);
            const bee = hortis.speciesRowOf(beeRow);
            let entry = plants.get(plant.id);
            if (!entry) {
                entry = {id: plant.id, row: plant, label: hortis.taxonLabel(plant), bees: new Set()};
                plants.set(plant.id, entry);
            }
            entry.bees.add(bee.id);
            if (!beeFamily.has(bee.id)) {
                beeFamily.set(bee.id, hortis.familyNameOf(bee));
            }
        }
    });
    return {plants, beeFamily};
};

/**
 * Determine which plants are already established on the site - those recorded in observations passing the current
 * filters. If no filter is active there is no site, and no plant is established.
 * @param {Object[]} siteObs - Observations passing the current filters
 * @param {Object[]} allObs - All observations in the dataset
 * @param {Object<String, Object>} rowById - Map of taxon id to taxon row
 * @return {Set<String>} The ids of established plant species
 */
hortis.seedMix.computeEstablished = function (siteObs, allObs, rowById) {
    const togo = new Set();
    if (siteObs.length < allObs.length) {
        siteObs.forEach(obsRow => {
            const plantRow = rowById[obsRow.plantINatId];
            if (plantRow && rowById[obsRow.pollinatorINatId]) {
                togo.add(hortis.speciesRowOf(plantRow).id);
            }
        });
    }
    return togo;
};

/**
 * Compute the plants currently making up the seed mix.
 * @param {Set<String>} established - Ids of plants established on the site
 * @param {Set<String>} removed - Ids of established plants the user has unticked
 * @param {Set<String>} added - Ids of further plants the user has ticked
 * @return {Set<String>} Ids of the plants in the mix
 */
hortis.seedMix.mix = function (established, removed, added) {
    const mix = new Set([...established].filter(id => !removed.has(id)));
    added.forEach(id => mix.add(id));
    return mix;
};

hortis.seedMix.plantMarkup = function (plant, checked) {
    const beeCount = plant.bees.size;
    return `<label class="mf-taxon"><input type="checkbox" data-seed="${plant.id}"${checked ? " checked" : ""}>` +
        `<span>${hortis.taxonNameMarkup(plant.row)}</span>` +
        `<i title="Visited by ${hortis.plural(beeCount, "bee species", "bee species")} across the whole dataset">${beeCount}</i></label>`;
};

/**
 * Render the chart of the share of each bee family's species supported by the seed mix, as SVG markup.
 * @param {String[]} families - The bee families, in display order
 * @param {Map<String, Number>} totals - Number of species of each family recorded on plants in the dataset
 * @param {Map<String, Number>} reached - Number of species of each family supported by the mix
 * @return {String} The chart's SVG markup
 */
hortis.seedMix.familyChart = function (families, totals, reached) {
    const width = 340, height = 230, left = 44, right = width - 8, top = 22, base = 150;
    const band = (right - left) / Math.max(families.length, 1);
    const barWidth = band * 0.6;
    const parts = [];
    [0, 50, 100].forEach(percent => {
        const y = base - percent / 100 * (base - top);
        parts.push(`<line x1="${left}" y1="${y}" x2="${right}" y2="${y}" class="mf-chart-grid"/>`);
        parts.push(`<text x="${left - 6}" y="${y + 4}" text-anchor="end" class="mf-chart-tick">${percent}%<title>${percent}% of the family's species supported</title></text>`);
    });
    families.forEach((family, i) => {
        const total = totals.get(family);
        const count = reached.get(family) || 0;
        const x = left + band * i + (band - barWidth) / 2;
        const full = base - top;
        const h = count / total * full;
        const tip = `${family}: ${count} of ${hortis.plural(total, "species", "species")} supported by the mix`;
        parts.push(`<rect x="${x}" y="${top}" width="${barWidth}" height="${full}" class="mf-chart-track"><title>${tip}</title></rect>`);
        parts.push(`<rect x="${x}" y="${base - h}" width="${barWidth}" height="${h}" fill="${hortis.pollColours.family[family] || "#999"}"><title>${tip}</title></rect>`);
        parts.push(`<text x="${x + barWidth / 2}" y="${top - 5}" text-anchor="middle" class="mf-chart-tick">${count}/${total}<title>${tip}</title></text>`);
        parts.push(`<text x="0" y="0" text-anchor="end" class="mf-chart-label" transform="translate(${x + barWidth / 2 + 3} ${base + 9}) rotate(-40)">${hortis.encodeHTML(family)}<title>${tip}</title></text>`);
    });
    parts.push(`<line x1="${left}" y1="${base}" x2="${right}" y2="${base}" class="mf-chart-axis-line"/>`);
    parts.push(`<text x="0" y="0" text-anchor="middle" class="mf-chart-axis" transform="translate(12 ${(top + base) / 2}) rotate(-90)">Species supported<title>Share of each family's species recorded visiting a plant in the mix</title></text>`);
    parts.push(`<text x="${(left + right) / 2}" y="${height - 4}" text-anchor="middle" class="mf-chart-axis">Bee family<title>Bee families recorded on plants in this dataset</title></text>`);
    return `<svg class="mf-seedchart" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Share of each bee family supported">${parts.join("")}</svg>`;
};

/** Functions adapted to the port **/

hortis.querySelectorIn = (container, selector) => container.querySelector(selector) || fluid.unavailable({message: "No element for " + selector, variety: "config"});

/**
 * Arrange the interaction table for display as a matrix - the plants and pollinators with counts, ordered by count and
 * cut off below a minimum count once there are many, each cell's count scaled by its marginal counts, and the rows
 * for the bipartite network.
 * @param {Object<Number, Number>} crossTable - Map of the integer key of each plant and pollinator pair to its count
 * @param {Object} plantCounts - Members `counts`, mapping plant taxon id to count, and `max`
 * @param {Object} pollCounts - Members `counts`, mapping pollinator taxon id to count, and `max`
 * @param {Object<String, TaxonRow>} rowById - Map of taxon id to taxon row
 * @return {Object} The layout, with members `selectedPlantIds`, `selectedPollIds`, `cellTable`, `cellMin`, `cellMax`,
 * `bipartiteRows`, and the arguments
 */
hortis.drawInteractions.layout = function (crossTable, plantCounts, pollCounts, rowById) {
    const filterZero = function (taxonIds, counts) {
        // eslint-disable-next-line eqeqeq
        fluid.remove_if(taxonIds, id => counts[id] === undefined || id == 0);
        taxonIds.sort((ea, eb) => counts[eb] - counts[ea]);
    };
    const filterCutoff = function (taxonIds, counts, sizeLimit, countLimit) {
        if (taxonIds.length >= sizeLimit) {
            const cutIndex = taxonIds.findIndex(id => counts[id] < countLimit);
            if (cutIndex !== -1 && cutIndex >= sizeLimit) {
                taxonIds.length = cutIndex;
            }
        }
    };
    const selectedPlantIds = Object.keys(plantCounts.counts);
    const selectedPollIds = Object.keys(pollCounts.counts);
    filterZero(selectedPlantIds, plantCounts.counts);
    filterZero(selectedPollIds, pollCounts.counts);
    filterCutoff(selectedPlantIds, plantCounts.counts, 100, 5);
    filterCutoff(selectedPollIds, pollCounts.counts, 100, 5);

    const taxonIndices = {};
    selectedPlantIds.forEach((id, index) => taxonIndices[id] = index);
    selectedPollIds.forEach((id, index) => taxonIndices[id] = index);

    const cellTable = [],
        cellMax = hortis.maxReducer(),
        cellMin = hortis.minReducer(),
        bipartiteRows = [];
    Object.entries(crossTable).forEach(([key, count]) => {
        const {plantId, pollId} = hortis.keyToIntIds(key);
        const scaled = count / Math.sqrt((plantCounts.counts[plantId] * pollCounts.counts[pollId]));
        cellMax.reduce(scaled);
        cellMin.reduce(scaled);
        cellTable.push({scaled, plantIndex: taxonIndices[plantId], pollIndex: taxonIndices[pollId]});
        const plantRow = rowById[plantId];
        const pollRow = rowById[pollId];
        if (plantRow && pollRow) {
            bipartiteRows.push([pollRow.iNaturalistTaxonName, plantRow.iNaturalistTaxonName, count]);
        }
    });
    return {selectedPlantIds, selectedPollIds, cellTable, cellMin: cellMin.value, cellMax: cellMax.value, bipartiteRows,
        crossTable, plantCounts, pollCounts, rowById};
};

hortis.drawInteractions.drawCanvas = function (that, container, layout, memoStops) {
    const {selectedPlantIds, selectedPollIds, cellTable, cellMin, cellMax} = layout;
    const {squareSize, squareMargin, outlineColour} = that;
    const canvas = container.querySelector(".imerss-interactions-canvas");
    const side = squareSize - 2 * squareMargin;
    const pos = index => index * squareSize + squareMargin;
    canvas.width = selectedPollIds.length * squareSize + 2 * squareMargin;
    canvas.height = selectedPlantIds.length * squareSize + 2 * squareMargin;
    const ctx = canvas.getContext?.("2d");
    if (ctx) {
        // The Infusion 4 implementation set a lineWidth of 10 here, but before resizing the canvas, which reset it to 1
        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        cellTable.forEach(function ({scaled, plantIndex, pollIndex}) {
            const prop = (scaled - cellMin) / (cellMax - cellMin);
            const xywh = [pos(pollIndex), pos(plantIndex), side, side];
            ctx.fillStyle = fluid.colour.lookupStop(memoStops, prop);
            ctx.fillRect(...xywh);
            ctx.strokeStyle = outlineColour;
            ctx.strokeRect(...xywh);
        });
    }
};

/**
 * Render the interaction matrix's markup - its taxon labels and count bars, around the canvas onto which its cells are
 * drawn by `hortis.drawInteractions.drawCanvas`.
 * @param {hortis.drawInteractions} that - The matrix component
 * @param {Object} layout - The matrix's layout, as computed by `hortis.drawInteractions.layout`
 * @return {VNode} The tree to be rendered
 */
hortis.drawInteractions.renderTree = function (that, layout) {
    const {selectedPlantIds, selectedPollIds, plantCounts, pollCounts, rowById} = layout;
    const {squareSize, squareMargin} = that;
    const side = squareSize - 2 * squareMargin;
    const pos = index => index * squareSize + squareMargin;
    const width = selectedPollIds.length * squareSize + 2 * squareMargin;
    const height = selectedPlantIds.length * squareSize + 2 * squareMargin;
    const xoffset = -0.75;
    const countDimen = 48; // Need to hack bars slightly smaller to avoid clipping
    const countScale = 100 * (1 - 2 / countDimen);
    const percent = (count, max) => Math.round(countScale * count / max * 100) / 100;
    const div = (clazz, attrs, children) => ({tag: "div", attrs: {"class": clazz, ...attrs}, children: children || []});
    const label = (id, style) => div("imerss-int-label", {"data-row-id": id, style}, [{text: rowById[id].iNaturalistTaxonName}]);
    const plantLabels = selectedPlantIds.map((id, index) => label(id, `top: ${pos(index)}px`));
    const plantBars = selectedPlantIds.map((id, index) => div("imerss-int-count", {"data-row-id": id,
        style: `top: ${pos(index)}px; width: ${percent(plantCounts.counts[id], plantCounts.max)}%; height: ${side}px;`}));
    const pollLabels = selectedPollIds.map((id, index) => label(id, `left: ${pos(index) + xoffset}px`));
    const pollBars = selectedPollIds.map((id, index) => div("imerss-int-count", {"data-row-id": id,
        style: `left: ${pos(index) + xoffset}px; height: ${percent(pollCounts.counts[id], pollCounts.max)}%; width: ${side}px;`}));
    const root = div("imerss-interactions-holder", {}, [
        div("imerss-int-top imerss-int-row", {}, [
            div("imerss-int-left imerss-int-plant-label", {}, [{text: "Plants"}]),
            div("imerss-poll-counts imerss-int-h-middle", {style: `width: ${width}px`}, pollBars),
            div("imerss-int-right")
        ]),
        div("imerss-int-v-middle imerss-int-row", {}, [
            div("imerss-plant-names imerss-int-left", {style: `height: ${height}px`}, plantLabels),
            div("imerss-int-h-middle imerss-int-scroll", {}, [{tag: "canvas", attrs: {"class": "imerss-interactions-canvas"}, children: []}]),
            div("imerss-plant-counts imerss-int-right", {style: `height: ${height}px`}, plantBars)
        ]),
        div("imerss-int-bottom imerss-int-row", {}, [
            div("imerss-int-left imerss-int-poll-label", {}, [{text: "Bees"}]),
            div("imerss-poll-names imerss-int-h-middle imerss-int-sideways", {style: `width: ${width}px`}, pollLabels),
            div("imerss-int-right")
        ])
    ]);
    return {tag: "fragment", children: [fluid.markVerbatim(root)]};
};

/**
 * Find the key of the cell of the interaction matrix under a mouse event on its canvas.
 * @param {MouseEvent} event - The mouse event
 * @param {Object} layout - The matrix's layout
 * @param {Number} squareSize - The size in pixels of each cell
 * @param {Number} squareMargin - The margin in pixels within each cell
 * @return {Number|null} The key of the cell, or null if the pointer is not over an occupied cell
 */
hortis.drawInteractions.eventToCell = function (event, layout, squareSize, squareMargin) {
    const buff = squareMargin / squareSize;
    const xc = event.offsetX / squareSize,
        yc = event.offsetY / squareSize;
    const xb = xc % 1, yb = yc % 1;
    let togo = null;
    if (xb >= buff && xb <= 1 - buff && yb >= buff && yb <= 1 - buff) {
        const pollId = layout.selectedPollIds[Math.floor(xc)],
            plantId = layout.selectedPlantIds[Math.floor(yc)];
        const key = hortis.intIdsToKey(plantId, pollId);
        togo = layout.crossTable[key] ? key : null;
    }
    return togo;
};

hortis.drawInteractions.bindEvents = function (that, container) {
    const q = selector => container.querySelector(selector);
    const scroll = q(".imerss-int-scroll"), plantNames = q(".imerss-plant-names"), plantCounts = q(".imerss-plant-counts"),
        pollNames = q(".imerss-poll-names"), pollCounts = q(".imerss-poll-counts");
    return hortis.bindDomListeners(container, [{
        event: "scroll",
        selector: ".imerss-int-scroll",
        listener: () => {
            plantNames.scrollTop = plantCounts.scrollTop = scroll.scrollTop;
            pollNames.scrollLeft = pollCounts.scrollLeft = scroll.scrollLeft;
        }
    }, {
        event: "mousemove",
        selector: ".imerss-interactions-canvas",
        listener: event => {
            const key = hortis.drawInteractions.eventToCell(event, that.layout, that.squareSize, that.squareMargin);
            that.hoverAt(key === null ? null : "cell:" + key, event);
        }
    }, {
        event: "mouseover",
        listener: event => {
            const label = event.target.closest(".imerss-int-label");
            const count = event.target.closest(".imerss-int-count");
            if (label) {
                that.hoverAt("taxon:" + label.dataset.rowId, event);
            } else if (count) {
                const kind = count.closest(".imerss-plant-counts") ? "plantCount:" : "pollCount:";
                that.hoverAt(kind + count.dataset.rowId, event);
            } else if (!event.target.closest(".imerss-interactions-canvas")) {
                that.hoverAt(null);
            }
        }
    }, {
        event: "mouseleave",
        listener: () => that.hoverAt(null)
    }]);
};

/**
 * Render the tooltip for an item of the interaction matrix - a cell, a taxon's label, or a bar of its counts.
 * @param {Object} layout - The matrix's layout
 * @param {String} hoverId - The hovered item, as kind:id
 * @return {String|null} The tooltip's markup
 */
hortis.drawInteractions.renderTooltip = function (layout, hoverId) {
    const [kind, id] = hoverId.split(":");
    const name = taxonId => layout.rowById[taxonId]?.iNaturalistTaxonName;
    let togo = null;
    if (kind === "cell") {
        const {plantId, pollId} = hortis.keyToIntIds(+id);
        togo = `<div class="imerss-int-tooltip"><div><i>${name(pollId)}</i> on </div><div><i>${name(plantId)}</i>:</div><div>Count: ${layout.crossTable[id]}</div></div>`;
    } else if (kind === "taxon") {
        togo = hortis.renderTaxonTooltip(layout.rowById, id);
    } else {
        const counts = kind === "plantCount" ? layout.plantCounts : layout.pollCounts;
        togo = `<div class="imerss-int-tooltip"><div><i>${name(id)}</i>:</div><div>Observation count: ${counts.counts[id]}</div></div>`;
    }
    return togo;
};

hortis.drawInteractions.download = function (bipartiteRows) {
    hortis.downloadCSV(["bee", "plant", "observations"], bipartiteRows, "interactions.csv");
};

hortis.bipartite.render = function (container, active, containerWidth, bipartiteRows, beeSelection, beeIdToEntry, plantSelection, plantIdToEntry) {
    const svgNode = container.querySelector("svg");
    if (active && typeof(d3) !== "undefined" && typeof(imerss) !== "undefined") {
        const svg = d3.select(svgNode);
        const {rows: beeRows, colours: beeColours} = hortis.computeRankColours(beeSelection, hortis.pollColours, beeIdToEntry);
        const {rows: plantRows} = hortis.computeRankColours(plantSelection, hortis.plantColours, plantIdToEntry);
        const {renderedWidth, renderedHeight} = imerss.bipartitePP(bipartiteRows, svg, containerWidth, container.clientHeight, {
            FigureLabel: "",
            sortedBeeNames: beeRows.map(row => row.iNaturalistTaxonName),
            sortedPlantNames: plantRows.map(row => row.iNaturalistTaxonName),
            beeColors: beeColours
        });
        // Explain each bar and its count - these titles are not drawn into the downloaded image
        svg.selectAll(".mainBars").append("title").text(d => {
            const partner = d.part === "primary" ? "plants" : "bees";
            return `${d.key}: ${d.value} observation${d.value === 1 ? "" : "s"} on the ${partner} shown`;
        });
        svg.selectAll(".bipartite-label").each(function () {
            const noun = this.textContent === "Bees" ? "Bee" : "Plant";
            d3.select(this).append("title").text(`${noun} taxa, each bar's height proportional to its number of observations`);
        });
        svgNode.setAttribute("height", renderedHeight);
        svgNode.setAttribute("width", renderedWidth);
    }
};

hortis.bipartite.downloadFrom = function (container) {
    hortis.bipartite.download(container.querySelector("svg"));
};

hortis.taxonListView.render = function (container, active, arrange, listRows, noun, colourByFamily) {
    container.querySelectorAll(".mf-seg-btn").forEach(button => button.classList.toggle("mf-seg-on", button.dataset.arrange === arrange));
    if (active) {
        // Totals count every observation, including those of intermediate taxa which have no row of their own
        const total = listRows.reduce((sum, listRow) => sum + listRow.count, 0);
        const listed = rows => rows.filter(listRow => listRow.listed);
        const shownCount = listed(listRows).length;
        container.querySelector(".mf-listbar-count").innerHTML =
            `<span title="Number of distinct ${noun} taxa listed - species, or coarser where nothing more specific was recorded">${hortis.plural(shownCount, "taxon", "taxa")}</span>` +
            ` &middot; <span title="Number of observation records in the current selection, including those identified only to genus or subgenus">${hortis.plural(total, "observation")}</span>`;
        let markup;
        if (listRows.length === 0) {
            markup = `<p class="mf-empty">No ${noun}s match the current filters and selections.</p>`;
        } else if (arrange === "family") {
            markup = hortis.taxonListView.byFamily(listRows).map(family => {
                const familyRows = listed(family.rows);
                const colour = hortis.pollColours.family[family.family];
                const chip = colourByFamily ? `<b style="background: ${colour || "#999"}"></b>` : "";
                const tip = `${hortis.plural(familyRows.length, noun + " taxon", noun + " taxa")} listed, with ${hortis.plural(family.count, "observation")} in ${family.family}`;
                return `<div class="mf-famhead">${chip}<span>${hortis.encodeHTML(family.family)}</span><i title="${tip}">${hortis.plural(familyRows.length, "taxon", "taxa")}</i></div>` +
                    familyRows.map(listRow => hortis.taxonListView.rowMarkup(listRow, noun)).join("");
            }).join("");
        } else {
            markup = listed(listRows).sort((a, b) => a.label.localeCompare(b.label))
                .map(listRow => hortis.taxonListView.rowMarkup(listRow, noun)).join("");
        }
        container.querySelector(".mf-listbody").innerHTML = `<div class="mf-taxa">${markup}</div>`;
    }
};

hortis.taxonListView.bindEvents = function (that, container) {
    return hortis.bindDomListeners(container, [{
        event: "click",
        selector: ".mf-seg-btn",
        listener: (event, button) => that.arrange = button.dataset.arrange
    }, {
        event: "mouseover",
        listener: event => {
            const name = event.target.closest(".mf-taxon-name");
            that.hoverAt(name ? name.dataset.rowId : null, event);
        }
    }, {
        event: "mouseleave",
        listener: () => that.hoverAt(null)
    }]);
};

hortis.taxonListView.download = function (listRows, downloadFile) {
    const rows = hortis.taxonListView.byFamily(listRows).flatMap(family => family.rows.map(listRow => [listRow.label, listRow.family, listRow.count]));
    hortis.downloadCSV(["taxon", "family", "observations"], rows, downloadFile);
};

hortis.beeAbundance.render = function (that, container, active, width, abundance) {
    if (active) {
        const colours = hortis.pollColours.family;
        const colourOf = row => colours[row.family] || "#999";
        container.querySelector(".mf-key").innerHTML = abundance.family.map(row =>
            `<span><b style="background: ${colourOf(row)}"></b><span>${hortis.encodeHTML(row.label)}</span></span>`).join("");
        const limits = that.chartLimits;
        const chart = (key, plural, foot, angle) => {
            const all = abundance[key];
            const rows = all.slice(0, limits[key]);
            // Fill the pane, but don't spread a few bars too thinly, nor squeeze many bars below their minimum width
            const chartWidth = Math.max(Math.min(Math.floor(width), 70 + rows.length * that.maxBand), 70 + rows.length * that.minBand);
            const shown = rows.length < all.length ? `top ${rows.length} of ${all.length}` : `${all.length} total`;
            return hortis.barChartMarkup(rows, {
                width: chartWidth,
                height: 150 + foot,
                foot,
                angle,
                title: `Bee ${plural} (${shown})`,
                titleTip: `Number of distinct bee ${plural} in the current selection` +
                    (rows.length < all.length ? `, of which the ${rows.length} most observed are shown` : ""),
                xLabel: hortis.capitalize(key),
                xTip: `Bee ${plural}, coloured by family and ordered by number of observations`,
                yLabel: "Observations",
                yTip: "Number of observation records in the current selection",
                colourOf,
                rowTip: row => `${row.label} (${row.family}): ${hortis.plural(row.count, "observation")}`
            });
        };
        container.querySelector(".mf-charts").innerHTML = abundance.family.length === 0 ? "<p class=\"mf-empty\">No bees match the current filters and selections.</p>" :
            chart("family", "families", 110, -40) + chart("genus", "genera", 120, -45) + chart("species", "species", 190, -55);
    }
};

/**
 * Download the bee abundance charts as a single standalone SVG file, with the family colour key drawn above them as
 * it is laid out on the page.
 * @param {HTMLElement} container - The bee abundance view's container, whose charts are currently rendered
 */
hortis.beeAbundance.download = function (container) {
    const enc = hortis.encodeHTML;
    const key = container.querySelector(".mf-key");
    const charts = container.querySelector(".mf-charts");
    const gap = parseFloat(getComputedStyle(charts).rowGap) || 0;
    const keyBox = key.getBoundingClientRect();
    const keyStyle = getComputedStyle(key);
    const keyParts = [...key.children].map(item => {
        const swatch = item.querySelector("b");
        const swatchBox = swatch.getBoundingClientRect();
        const labelBox = item.querySelector("span").getBoundingClientRect();
        return `<rect x="${swatchBox.left - keyBox.left}" y="${swatchBox.top - keyBox.top}" width="${swatchBox.width}" height="${swatchBox.height}" rx="2" ` +
            `fill="${getComputedStyle(swatch).backgroundColor}"/>` +
            `<text x="${labelBox.left - keyBox.left}" y="${labelBox.top - keyBox.top + labelBox.height / 2}" dominant-baseline="central" ` +
            `fill="${getComputedStyle(item).color}">${enc(item.textContent)}</text>`;
    });
    const serializer = new XMLSerializer();
    let y = keyBox.height + gap;
    let width = keyBox.width;
    const chartParts = [...charts.querySelectorAll("svg.mf-chart")].map(svg => {
        const clone = svg.cloneNode(true);
        hortis.inlineSVGStyles(svg, clone);
        clone.removeAttribute("class");
        clone.setAttribute("x", "0");
        clone.setAttribute("y", String(y));
        y += svg.height.baseVal.value + gap;
        width = Math.max(width, svg.width.baseVal.value);
        return serializer.serializeToString(clone);
    });
    const height = Math.max(y - gap, 0);
    const content = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
        `<rect width="100%" height="100%" fill="#fff"/>` +
        `<g style="font-family: ${enc(keyStyle.fontFamily)}; font-size: ${keyStyle.fontSize}">${keyParts.join("")}</g>` +
        chartParts.join("") + "</svg>";
    hortis.triggerDownload(content, "image/svg+xml", "bee-abundance.svg");
};

hortis.seedMix.keySet = hash => new Set(Object.keys(hash));

hortis.seedMix.renderList = function (that, container, active, network, established, query, showAll) {
    if (active) {
        // Read the user's ticks without depending on them, so that ticking a plant doesn't rerender the list beneath the pointer
        const {removed, added} = fluid.cell.untracked(() => ({removed: hortis.seedMix.keySet(that.removed), added: hortis.seedMix.keySet(that.added)}));
        container.querySelector(".mf-seednote").textContent = established.size > 0 ?
            "Plants recorded under the current filters are treated as already established on the site, and start ticked - " +
            "untick any which will be removed. Tick further plants to model a seed mix." :
            "No site is defined. Use the Region filter, draw a polygon on the map or click a map cell to define one, " +
            "and plants recorded there will be listed as already established. Meanwhile, tick plants to model a seed mix.";
        const words = hortis.queryWords(query);
        const matches = plant => words.every(word => plant.label.toLowerCase().includes(word));
        const byBees = (a, b) => b.bees.size - a.bees.size || a.label.localeCompare(b.label);
        const establishedPlants = [...established].map(id => network.plants.get(id)).filter(plant => plant && matches(plant)).sort(byBees);
        const candidates = [...network.plants.values()].filter(plant => !established.has(plant.id) && matches(plant)).sort(byBees);
        const limit = showAll || words.length > 0 ? candidates.length : that.shortListLength;
        const groupHead = (title, tip) => `<p class="mf-seedgroup" title="${tip}">${title}</p>`;
        let markup = "";
        if (establishedPlants.length > 0) {
            markup += groupHead(`Already established on site (${establishedPlants.length})`,
                `${hortis.plural(establishedPlants.length, "plant species", "plant species")} recorded under the current filters`) +
                `<div class="mf-taxa mf-taxa-cols">${establishedPlants.map(plant => hortis.seedMix.plantMarkup(plant, !removed.has(plant.id))).join("")}</div>`;
        }
        markup += groupHead(`Available for seed mixes (${candidates.length})`,
            `${hortis.plural(candidates.length, "further plant species", "further plant species")} recorded in the dataset, ordered by the number of bee species visiting them`) +
            `<div class="mf-taxa mf-taxa-cols">${candidates.slice(0, limit).map(plant => hortis.seedMix.plantMarkup(plant, added.has(plant.id))).join("")}</div>`;
        if (limit < candidates.length) {
            markup += `<button type="button" class="mf-linkbtn imerss-seed-more">Show all ${hortis.formatInt(candidates.length)} plants</button>`;
        }
        container.querySelector(".mf-seed-list").innerHTML = markup;
    }
};

hortis.seedMix.renderOutput = function (container, active, network, established, removedHash, addedHash) {
    if (active) {
        const mix = hortis.seedMix.mix(established, hortis.seedMix.keySet(removedHash), hortis.seedMix.keySet(addedHash));
        const supported = new Set();
        mix.forEach(id => network.plants.get(id)?.bees.forEach(bee => supported.add(bee)));
        const all = network.beeFamily.size;
        const share = all > 0 ? Math.round(supported.size / all * 100) : 0;
        container.querySelector(".mf-meter-fill").style.width = share + "%";
        container.querySelector(".mf-meter").setAttribute("title", `${share}% of the bee species recorded on plants in this dataset visit a plant in the mix`);
        container.querySelector(".mf-seedread").innerHTML =
            `<b title="Bee species recorded visiting at least one plant in the mix">${hortis.formatInt(supported.size)}</b> of ` +
            `<span title="All bee species recorded visiting plants anywhere in this dataset">${hortis.formatInt(all)}</span> bee species supported` +
            ` &mdash; <span title="Share of the dataset's bee species supported by the mix">${share}%</span>` +
            `<br/><span title="Number of plant species currently ticked">${hortis.plural(mix.size, "plant species", "plant species")} in the mix</span>`;
        const totals = new Map();
        network.beeFamily.forEach(family => totals.set(family, (totals.get(family) || 0) + 1));
        const reached = new Map();
        supported.forEach(bee => {
            const family = network.beeFamily.get(bee);
            reached.set(family, (reached.get(family) || 0) + 1);
        });
        const families = [...totals.keys()].sort((a, b) => totals.get(b) - totals.get(a));
        container.querySelector(".mf-seedchart-holder").innerHTML = hortis.seedMix.familyChart(families, totals, reached);
    }
};

/**
 * Add or remove a key of a hash held in a reactive root, writing a fresh hash.
 * @param {Object<String, Boolean>} hash - The current hash
 * @param {String} id - The key to be added or removed
 * @param {Boolean} present - `true` to add the key, `false` to remove it
 * @return {Object<String, Boolean>} The updated hash
 */
hortis.seedMix.updateHash = function (hash, id, present) {
    const togo = {...hash};
    if (present) {
        togo[id] = true;
    } else {
        delete togo[id];
    }
    return togo;
};

hortis.seedMix.bindEvents = function (that, container) {
    return hortis.bindDomListeners(container, [{
        event: "change",
        selector: "input[data-seed]",
        listener: (event, input) => {
            const id = input.dataset.seed;
            if (that.established.has(id)) {
                that.removed = hortis.seedMix.updateHash(that.removed, id, !input.checked);
            } else {
                that.added = hortis.seedMix.updateHash(that.added, id, input.checked);
            }
        }
    }, {
        event: "input",
        selector: ".mf-seed-search",
        listener: (event, input) => that.query = input.value
    }, {
        event: "click",
        selector: ".imerss-seed-more",
        listener: () => that.showAll = true
    }, {
        event: "click",
        selector: ".imerss-seed-reset",
        listener: () => {
            that.removed = {};
            that.added = {};
            that.listVersion = that.listVersion + 1;
        }
    }]);
};

hortis.seedMix.download = function (network, established, removedHash, addedHash) {
    const mix = hortis.seedMix.mix(established, hortis.seedMix.keySet(removedHash), hortis.seedMix.keySet(addedHash));
    const ids = new Set([...established, ...mix]);
    const rows = [...ids].map(id => network.plants.get(id)).filter(plant => plant).map(plant => [
        plant.label,
        established.has(plant.id) ? "established" : "added",
        mix.has(plant.id) ? "yes" : "no",
        plant.bees.size
    ]);
    hortis.downloadCSV(["plant", "status", "inMix", "beeSpeciesVisiting"], rows, "seed-mix.csv");
};
