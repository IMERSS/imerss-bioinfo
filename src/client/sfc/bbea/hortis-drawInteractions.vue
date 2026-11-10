<script src="%@popperjs/core/dist/umd/popper-lite.min.js" fluid-client data-fl-scope="global"></script>
<script src="../../js/colour.js" data-fl-scope="global"></script>
<script src="../../js/i6/imerss-core.js"></script>
<script src="../../js/i6/tooltip.js"></script>
<script src="../../js/i6/bbea/mfShell.js"></script>
<script src="../../js/i6/libreMap.js"></script>
<script src="../../js/i6/bbea/imerss-bbea.js"></script>
<script>
"use strict";

// The interaction matrix of the BBEA visualisation, a computed tree of labels and count bars around a canvas
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
            $layers: "fluid.viewComponent",
            // The tree's root bears the container's own class, and is elided onto it
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
</script>
