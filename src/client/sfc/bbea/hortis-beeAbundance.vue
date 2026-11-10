<script src="%@popperjs/core/dist/umd/popper-lite.min.js" fluid-client data-fl-scope="global"></script>
<script src="../../js/colour.js" data-fl-scope="global"></script>
<script src="../../js/i6/imerss-core.js"></script>
<script src="../../js/i6/bbea/barChart.js"></script>
<script src="../../js/i6/tooltip.js"></script>
<script src="../../js/i6/bbea/mfShell.js"></script>
<script src="../../js/i6/libreMap.js"></script>
<script src="../../js/i6/bbea/imerss-bbea.js"></script>
<script>
"use strict";

// Charts of the abundance of bee families, genera and species in the current selection
fluid.def("hortis.beeAbundance", {
    $layers: "hortis.bbeaView",
    tabId: "abund",
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
    charts: "$compute:hortis.querySelectorIn({self}.view.renderedContainer, .mf-charts)",
    // Zero until the charts are first laid out, which they are only once the view's tab is selected
    width: {
        $bindable: {
            bind: "hortis.widthCell({self}.charts, {global}, 0)",
            unbind: "hortis.unobserveWidth({boundValue})"
        }
    },
    abundance: "$compute:hortis.beeAbundance.compute({self}.obsRows, {self}.rowById)",
    keySlot: {
        $component: {
            $layers: "hortis.verbatimSlot",
            markup: "$compute:hortis.beeAbundance.keyMarkup({beeAbundance}.active, {beeAbundance}.abundance)"
        }
    },
    chartsSlot: {
        $component: {
            $layers: "hortis.verbatimSlot",
            markup: "$compute:hortis.beeAbundance.chartsMarkup({beeAbundance}, {beeAbundance}.active, {beeAbundance}.width, {beeAbundance}.abundance)"
        }
    },
    download: "$method:hortis.beeAbundance.download({self}.view.renderedContainer)"
});

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
    const chartParts = [...charts.querySelectorAll("svg.imerss-chart")].map(svg => {
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

/** Markup of bee abundance **/

hortis.beeAbundance.colourOf = row => hortis.pollColours.family[row.family] || "#999";

/**
 * Render the key of family colours above the bee abundance charts.
 * @param {Boolean} active - `true` if the view's tab is selected - otherwise nothing is rendered
 * @param {Object} abundance - The abundance of bees, as computed by `hortis.beeAbundance.compute`
 * @return {String} The markup of the key
 */
hortis.beeAbundance.keyMarkup = function (active, abundance) {
    return active ? abundance.family.map(row =>
        `<span><b style="background: ${hortis.beeAbundance.colourOf(row)}"></b><span>${hortis.encodeHTML(row.label)}</span></span>`).join("") : "";
};

/**
 * Render the bee abundance charts.
 * @param {hortis.beeAbundance} that - The view, holding its chart configuration
 * @param {Boolean} active - `true` if the view's tab is selected - otherwise nothing is rendered
 * @param {Number} width - The width available to the charts
 * @param {Object} abundance - The abundance of bees, as computed by `hortis.beeAbundance.compute`
 * @return {String} The markup of the charts
 */
hortis.beeAbundance.chartsMarkup = function (that, active, width, abundance) {
    let togo = "";
    if (active) {
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
                colourOf: hortis.beeAbundance.colourOf,
                rowTip: row => `${row.label} (${row.family}): ${hortis.plural(row.count, "observation")}`
            });
        };
        togo = abundance.family.length === 0 ? "<p class=\"imerss-empty\">No bees match the current filters and selections.</p>" :
            chart("family", "families", 110, -40) + chart("genus", "genera", 120, -45) + chart("species", "species", 190, -55);
    }
    return togo;
};
</script>

<template>
    <div class="imerss-mount imerss-mount-pad" role="tabpanel" hidden="@{inactive}">
        <div class="imerss-listbar">
            <span class="mf-key" title="Bee families, as coloured throughout" @id="keySlot"></span>
        </div>
        <div class="imerss-listbody mf-charts" @id="chartsSlot"></div>
    </div>
</template>
