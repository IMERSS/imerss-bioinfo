<script src="%d3/dist/d3.js" fluid-client data-fl-scope="global"></script>
<script src="../../../lib/vizjs.js" fluid-client data-fl-scope="global"></script>
<script src="../../js/i6/bbea/bipartitePP.js" fluid-client data-fl-scope="global"></script>
<script src="%@popperjs/core/dist/umd/popper-lite.min.js" fluid-client data-fl-scope="global"></script>
<script src="../../js/colour.js" data-fl-scope="global"></script>
<script src="../../js/i6/imerss-core.js"></script>
<script src="../../js/i6/tooltip.js"></script>
<script src="../../js/i6/bbea/mfShell.js"></script>
<script src="../../js/i6/libreMap.js"></script>
<script src="../../js/i6/bbea/imerss-bbea.js"></script>
<script>
/* global d3, imerss */
"use strict";

// The bipartite network of bees and plants, drawn by d3 into the svg of its template
fluid.def("hortis.bipartite", {
    $layers: "hortis.bbeaView",
    tabId: "net",
    bipartiteRows: "{drawInteractions}.bipartiteRows",
    beeSelection: "{vizLoader}.beeFacet.body.pollChecklist.rowSelection",
    beeIdToEntry: "{vizLoader}.beeFacet.body.pollChecklist.idToEntry",
    plantSelection: "{vizLoader}.plantFacet.body.plantChecklist.rowSelection",
    plantIdToEntry: "{vizLoader}.plantFacet.body.plantChecklist.idToEntry",
    width: {
        $bindable: {
            bind: "hortis.widthCell({self}.view.renderedContainer, {global})",
            unbind: "hortis.unobserveWidth({boundValue})"
        }
    },
    render: `$effect:hortis.bipartite.render({self}.view.renderedContainer, {self}.active, {self}.width, {self}.bipartiteRows, {self}.beeSelection,
        {self}.beeIdToEntry, {self}.plantSelection, {self}.plantIdToEntry)`,
    download: "$method:hortis.bipartite.downloadFrom({self}.view.renderedContainer)"
});

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

hortis.bipartite.injectSvgStyle = function (svgText, style) {
    return svgText.replace(/(<svg[^>]*>)/, `$1${style}`);
};

hortis.bipartite.download = async function (svgNode) {
    const dataHeader = "data:image/svg+xml;charset=utf-8";
    const serializeAsXML = $e => (new XMLSerializer()).serializeToString($e);
    const encodeAsUTF8 = s => {
        return `${dataHeader},${encodeURIComponent(hortis.bipartite.injectSvgStyle(s, hortis.bipartite.css))}`;
    };
    const svgURL = encodeAsUTF8(serializeAsXML(svgNode));

    const blob = await hortis.getCanvasBlob(svgURL, {format: "png", scale: 4});
    hortis.triggerDownload(blob, "image/png", "bipartite.png");
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
</script>

<template>
    <div class="imerss-bipartite">
        <svg width="32" height="2048"></svg>
    </div>
</template>
