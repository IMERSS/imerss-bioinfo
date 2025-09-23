"use strict";

/* global preactSignalsCore, imerss, d3 */

// noinspection ES6ConvertVarToLetConst // otherwise this is a duplicate on minifying
var hortis = fluid.registerNamespace("hortis");

// noinspection ES6ConvertVarToLetConst // otherwise this is a duplicate on minifying
var {} = preactSignalsCore;

fluid.setLogging(true);

fluid.defaults("hortis.beaVizLoader", {
    mapGrades: ["hortis.bbeaLibreMap"],
    selectors: {
        interactions: ".imerss-interactions-holder",
        bipartite: ".imerss-bipartite",
        recordReporter: ".imerss-record-reporter",
        filterControls: ".imerss-filter-controls",
        filters: ".imerss-main-filters",
        loadingIndicator: ".bee-loading-container",
        bbeaFilters: ".imerss-bbea-filters",
        fullScreen: ".imerss-fullscreen",
        collectorReport: ".imerss-collector-report"
    },
    members: {
        filteredObs: "{obsFilters}.allOutput",
        taxaFromObs: "@expand:fluid.computed(hortis.twoTaxaFromObs, {that}.filteredObs, {taxa}.rowById)",
        allTaxaFromObs: "@expand:fluid.computed(hortis.twoTaxaFromObs, {that}.obsRows, {taxa}.rowById)",
        // Funny hack since this is computed in an effect by interactions - review this
        finalFilteredObs: "@expand:signal()",
        hideLoadingIndicator: "@expand:fluid.effect(hortis.beaVizLoader.hideLoadingIndicator, {that}.rendered)"
    },
    components: {
        regionIndirection: {
            type: "hortis.csvReader",
            options: {
                url: "{vizLoader}.options.regionIndirectionFile"
            }
        },
        collectorReportLinker: {
            type: "hortis.collectorReportLinker",
            container: "{that}.dom.collectorReport",
            options: {
                members: {
                    collectorName: "{obsFilters}.collectorFilter.filterState"
                }
            }
        },
        filterControls: {
            type: "hortis.filterControls",
            container: "{that}.dom.filterControls"
        },
        recordReporter: {
            type: "hortis.recordReporter",
            container: "{that}.dom.recordReporter",
            options: {
                members: {
                    filteredRows: "{vizLoader}.finalFilteredObs",
                    allRows: "{vizLoader}.obsRows"
                }
            }
        },
        obsFilters: {
            type: "hortis.bbeaFilters",
            container: "{that}.dom.filters",
            options: {
                members: {
                    allInput: "{vizLoader}.obsRows",
                    rendered: "{hortis.vizLoader}.rendered",
                    idle: "{hortis.vizLoader}.idle"
                }
            }
        },
        pollChecklist: {
            type: "hortis.checklist.withHolder",
            container: ".imerss-pollinators",
            options: {
                gradeNames: ["hortis.checklist.withOBA", "hortis.checklist.withDownload", "hortis.checklist.withSearch"],
                rootId: 1,
                filterRanks: ["epifamily", "family", "tribe", "genus", "subgenus", "species"],
                disclosableRanks: ["tribe", "genus", "subgenus", "species"],
                copyChecklistRanks: ["genus", "species"],
                selectable: true,
                unfoldable: true,
                copyButtonMessage: "Copy %rows bee taxa to clipboard",
                searchControlId: "fli-imerss-bee-search",
                members: {
                    rowById: "{taxa}.rowById",
                    rowFocus: "@expand:fluid.derefSignal({vizLoader}.taxaFromObs, pollRowFocus)"
                }
            }
        },
        bbeaFilters: {
            container: "{that}.dom.bbeaFilters",
            type: "hortis.bbeaBbeaFilters"
        },
        plantChecklist: {
            type: "hortis.checklist.withHolder",
            container: ".imerss-plants",
            options: {
                gradeNames: ["hortis.checklist.withOBA", "hortis.checklist.withDownload", "hortis.checklist.withSearch"],
                rootId: 47126,
                filterRanks: ["kingdom", "order", "family", "genus"],
                disclosableRanks: ["family", "genus"],
                copyChecklistRanks: ["genus"],
                selectable: true,
                unfoldable: true,
                copyButtonMessage: "Copy %rows plant taxa to clipboard",
                searchControlId: "fli-imerss-plant-search",
                members: {
                    rowById: "{taxa}.rowById",
                    rowFocus: "@expand:fluid.derefSignal({vizLoader}.taxaFromObs, plantRowFocus)"
                }
            }
        },
        interactionTabs: {
            type: "hortis.tabs",
            container: ".imerss-interactions .imerss-tabs",
            options: {
                tabIds: {
                    bipartite: "fli-tab-bipartite",
                    matrix: "fli-tab-matrix"
                },
                model: {
                    selectedTab: "bipartite"
                }
            }
        },
        interactions: {
            type: "hortis.interactions",
            options: {
                members: {
                    obsRows: "{vizLoader}.filteredObs",
                    plantSelection: "{plantChecklist}.rowSelection",
                    pollSelection: "{pollChecklist}.rowSelection",
                    rowById: "{taxa}.rowById",
                    finalFilteredObs: "{vizLoader}.finalFilteredObs"
                }
            }
        },
        drawInteractions: {
            type: "hortis.drawInteractions",
            container: "{that}.dom.interactions"
        },
        bipartite: {
            type: "hortis.bipartite",
            container: "{that}.dom.bipartite",
            options: {
                members: {
                    // TODO: Split drawInteractions render prepare back out into interactions
                    bipartiteRows: "{drawInteractions}.bipartiteRows",
                    beeSelection: "{pollChecklist}.rowSelection",
                    beeIdToEntry: "{pollChecklist}.idToEntry",
                    plantSelection: "{plantChecklist}.rowSelection",
                    plantIdToEntry: "{plantChecklist}.idToEntry"
                }
            }
        },
        fullScreenControl: {
            type: "hortis.fullScreenControl",
            container: "{that}.dom.fullScreen",
            options: {
                fullScreenElement: "{vizLoader}.container.0"
            }
        }
    }
});

hortis.beaVizLoader.hideLoadingIndicator = function () {
    const container = document.querySelector(".bee-loading-container");
    container.classList.add("bee-loading-container-hidden");
    window.setTimeout(() => container.remove(), 1000);
};

fluid.defaults("hortis.fullScreenControl", {
    gradeNames: "fluid.viewComponent",
    members: {
        enabled: "@expand:signal()",
        fullScreenEffect: "@expand:fluid.effect(hortis.fullScreenEffect, {that}.enabled, {that}.options.fullScreenElement)"
    },
    listeners: {
        "onCreate.bind": "hortis.fullScreenControl.bind({that}.container, {that}.enabled)"
    }
});

hortis.fullScreenEffect = async function (enabled, fullScreenElement) {
    if (enabled) {
        await fullScreenElement.requestFullscreen();
    } else {
        try {
            await document.exitFullscreen();
        } catch (e) {}
    }
};

hortis.fullScreenControl.bind = function (container, enabled) {
    const body = document.querySelector("body");
    container.click(() => {
        enabled.value = !enabled.value;
        hortis.toggleClass(body, "imerss-fullscreen-mode", enabled.value);
    });
};

fluid.defaults("hortis.collectorReportLinker", {
    gradeNames: "fluid.stringTemplateRenderingView",
    markup: {
        container: `
        <div>
            <div>A volunteer report is available:</div><a href="%target" target="_blank">%linkText</a><span class="external-link"></span>
        </div>
        `,
        linkText: "%collectorName Summary (2023)",
        linkTarget: "https://oregon-bee-project.github.io/melittoflora/reports/%collectorNameCond_Summary_2023.pdf"
    },
    members: {
        collectorLink: "@expand:fluid.computed(hortis.collectorReportLinker.nameToLink, {that}.collectorName, {that}.options.markup.linkTarget)",
        collectorLinkValid: "@expand:signal(false)",
        // Prime case for "&" syntax ?
        checkCollectorLinkValid: "@expand:fluid.effect(hortis.collectorReportLinker.checkLinkValid, {that}.collectorName, {that}.collectorLink, {that})",
        showControl: "@expand:fluid.effect(hortis.toggleClass, {that}.container.0, imerss-hidden, {that}.collectorLinkValid, true)",
        renderModel: "@expand:fluid.computed(hortis.collectorReportLinker.renderModel, {that}.collectorName, {that}.collectorLink, {that}.options.markup.linkText)"
    }
});

hortis.collectorReportLinker.nameToLink = function (collectorName, linkTargetTemplate) {
    return collectorName && fluid.stringTemplate(linkTargetTemplate, {collectorNameCond: collectorName.replaceAll(" ", "_").replaceAll("|", "and")});
};

hortis.collectorReportLinker.checkLinkValid = async function (collectorName, collectorLink, that) {
    const collectorLinkValid = that.collectorLinkValid;
    collectorLinkValid.value = false;
    try {
        if (collectorLink) {
            const response = await fetch(collectorLink);
            if (response.ok) {
                collectorLinkValid.value = true;
            }
        }
    } catch (e) {}
};

hortis.collectorReportLinker.renderModel = (collectorName, collectorLink, linkTextTemplate) => ({
    target: collectorLink,
    linkText: fluid.stringTemplate(linkTextTemplate, {collectorName})
});

hortis.twoTaxaFromObs = function (filteredObs, rowById) {
    const plantIds = {},
        pollIds = {};
    const now = Date.now();
    filteredObs.forEach(row => {
        plantIds[row.plantINatId] = true;
        pollIds[row.pollinatorINatId] = true;
    });
    const togo = {
        plantRowFocus: hortis.closeParentTaxa(plantIds, rowById),
        pollRowFocus: hortis.closeParentTaxa(pollIds, rowById)
    };
    const delay = Date.now() - now;
    return togo;
};

// TODO: Why is this disused
hortis.filterObsByTwoTaxa = function (obsRows, plantRowFocus, pollRowFocus) {
    const filteredObs = [];
    obsRows.forEach(function (row) {
        const accept = plantRowFocus[row.plantINatId] && pollRowFocus[row.pollinatorINatId];
        if (accept) {
            filteredObs.push(row);
        }
    });
    return filteredObs;
};


fluid.defaults("hortis.interactions", {
    gradeNames: "fluid.modelComponent",
    members: {
        obsRows: "@expand:signal()",
        plantSelection: "@expand:signal()",
        pollSelection: "@expand:signal()",
        // keys are plantId|pollId, values ints
        crossTable: "@expand:fluid.computed(hortis.interactions.count, {that}, {that}.obsRows, {that}.plantSelection, {that}.pollSelection)",
        // Accessing crossTable.value will populate these three by a hideous side-effect
        plantCounts: {},
        pollCounts: {}
    }
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
    if (table[key] === undefined) {
        table[key] = 0;
    }
    table[key] += count;
};

hortis.max = function (hash) {
    let max = Number.NEGATIVE_INFINITY;
    fluid.each(hash, function (val) {
        max = Math.max(val, max);
    });
    return max;
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


hortis.findAncestor = function (row, selection) {
    let move = row;
    while (move !== undefined) {
        if (selection[move.id] !== undefined) {
            return move.id;
        }
        move = move.parent;
    }
};

hortis.ancestorHitCache = function (selection, rowById) {
    const taxonToAncestor = {};
    return {
        taxonToAncestor,
        get: function (taxonId) {
            const existing = taxonToAncestor[taxonId];
            if (existing !== undefined) {
                return existing;
            } else {
                // eslint-disable-next-line eqeqeq
                const row = taxonId == 0 ? hortis.checklist.NO_TAXON_ROW : rowById[taxonId];
                const computed = hortis.findAncestor(row, selection);
                taxonToAncestor[taxonId] = computed;
                return computed;
            }
        }
    };
};

/** Count plant-pollinator interactions for the current taxonomic selection
 *
 * @param {hortis.interactions} that - The interactions component
 * @param {obsRow[]} rows - The full set of observation rows
 * @param {Object<key, true>} plantSelection - The currently selected plant taxa
 * @param {Object<key, true>} pollSelection - The currently selected pollinator taxa
 * @return {Object<int, int>} - Hash bins keyed by integer cross key to interaction count.
 */
hortis.interactions.count = function (that, rows, plantSelection, pollSelection) {
    const rowById = that.rowById.peek();
    const plantCache = hortis.ancestorHitCache(plantSelection, rowById);
    const pollCache = hortis.ancestorHitCache(pollSelection, rowById);

    const crossTable = {};
    const plantCounts = {counts: {}, max: 0};
    const pollCounts = {counts: {}, max: 0};

    const now = Date.now();
    const f = hash => Object.keys(hash).length;

    const finalFilteredObs = [];

    // Currently get several notifications during startup, turn checklist's rowSelection into a computed rather than effect
    if (f(plantSelection) && f(pollSelection)) {
        rows.forEach(function (row) {
            const {pollinatorINatId: pollId, plantINatId: plantId} = row;
            if (plantId && pollId) {
                const plantCountKey = plantCache.get(plantId);
                const pollCountKey = pollCache.get(pollId);
                if (plantCountKey && pollCountKey) {
                    const key = hortis.intIdsToKey(plantCountKey, pollCountKey);

                    hortis.addCount(crossTable, key);
                    hortis.addCount(plantCounts.counts, plantCountKey);
                    hortis.addCount(pollCounts.counts, pollCountKey);
                    finalFilteredObs.push(row);
                }
            }
        });
    }

    plantCounts.max = hortis.max(plantCounts.counts);
    pollCounts.max = hortis.max(pollCounts.counts);

    const cells = Object.keys(crossTable).length;
    const plants = Object.keys(plantCounts.counts).length;
    const polls = Object.keys(pollCounts.counts).length;
    fluid.log("Counted ", rows.length + " obs into " + cells + " interaction cells for " + plants + " plants and " + polls + " pollinators");
    fluid.log("Occupancy: " + (100 * (cells / (plants * polls))).toFixed(2) + "%");
    const delay = Date.now() - now;
    fluid.log("Computed interactions in " + delay + " ms");

    that.plantCounts = plantCounts;
    that.pollCounts = pollCounts;
    // Hack since we are in a computation - in fact count should make a multiple return
    fluid.invokeLater(() => that.finalFilteredObs.value = finalFilteredObs);
    return crossTable;
};

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

fluid.defaults("hortis.bipartite", {
    gradeNames: "fluid.viewComponent",
    selectors: {
        svg: "svg",
        downloadButton: ".imerss-download-button"
    },
    members: {
        bipartiteRows: "@expand:signal()",
        beeSelection: "@expand:signal()",
        plantSelection: "@expand:signal()",
        rendered: "@expand:signal()",
        // beeIdToEntry: {}, - injected from checklist
        // plantIdToEntry: {}
        containerWidth: "@expand:signal()",
        render: "@expand:fluid.effect(hortis.bipartite.render, {that}, {that}.dom.svg.0, {that}.containerWidth, {that}.bipartiteRows, {that}.beeIdToEntry, {that}.plantIdToEntry)"
    },
    listeners: {
        "onCreate.listenWidth": "hortis.bipartite.listenWidth({that}.container.0, {that}.containerWidth)",
        "onCreate.downloadButton": "hortis.bipartite.downloadButton({that}, {that}.dom.downloadButton, {that}.dom.svg)"
    }
});

hortis.bipartite.listenWidth = function (containerNode, widthSignal) {
    const observer = new ResizeObserver(entries => {
        entries.forEach(entry => {
            const width = entry.contentRect.width;
            if (width > 0) {
                widthSignal.value = entry.contentRect.width;
            }
        });
    });
    observer.observe(containerNode);
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

hortis.bipartite.downloadButton = function (bipartite, button, svg) {
    button.on("click", async () => {
        const dataHeader = "data:image/svg+xml;charset=utf-8";
        const serializeAsXML = $e => (new XMLSerializer()).serializeToString($e);
        const encodeAsUTF8 = s => {
            return `${dataHeader},${encodeURIComponent(injectSvgStyle(s, hortis.bipartite.css))}`;
        };
        const $svg = svg[0];
        const svgURL = encodeAsUTF8(serializeAsXML($svg));

        const blob = await hortis.getCanvasBlob(svgURL, {format: "png", scale: 4});
        hortis.triggerDownload(blob, "image/png", "bipartite.png");
    });
};

hortis.bipartite.render = function (that, svgNode, containerWidth, bipartiteRows, beeIdToEntry, plantIdToEntry) {
    const svg = d3.select(svgNode);
    fluid.log("Bipartite render with containerWidth of ", containerWidth);

    // Read this directly so we don't get an extra notification - bipartiteRows is computed by an effect upstream in drawInteractions
    const beeSelection = that.beeSelection.peek();
    const plantSelection = that.plantSelection.peek();
    const containerHeight = that.container[0].clientHeight;
    const {rows: beeRows, colours: beeColours} = hortis.computeRankColours(beeSelection, hortis.pollColours, beeIdToEntry);
    const {rows: plantRows} = hortis.computeRankColours(plantSelection, hortis.plantColours, plantIdToEntry);
    const {
        renderedWidth,
        renderedHeight
    } = imerss.bipartitePP(bipartiteRows, svg, containerWidth, containerHeight, {
        FigureLabel: "",
        sortedBeeNames: beeRows.map(row => row.iNaturalistTaxonName),
        sortedPlantNames: plantRows.map(row => row.iNaturalistTaxonName),
        beeColors: beeColours
    });

    svgNode.setAttribute("height", renderedHeight);
    svgNode.setAttribute("width", renderedWidth);
};

hortis.interactionMarkup =
`
    <div class="imerss-interactions-holder">
        <div class="imerss-int-top imerss-int-row">
            <div class="imerss-int-left imerss-int-plant-label">Plants</div>
            <div class="imerss-poll-counts imerss-int-h-middle"></div>
            <div class="imerss-int-right"></div>
        </div>
        <div class="imerss-int-v-middle imerss-int-row">
            <div class="imerss-plant-names imerss-int-left"></div>
            <div class="imerss-int-h-middle imerss-int-scroll">
                <canvas class="imerss-interactions-canvas"></canvas>
            </div>
            <div class="imerss-plant-counts imerss-int-right"></div>
        </div>
        <div class="imerss-int-bottom imerss-int-row">
            <div class="imerss-int-left imerss-int-poll-label">Bees</div>
            <div class="imerss-poll-names imerss-int-h-middle imerss-int-sideways"></div>
            <div class="imerss-int-right"></div>
        </div>
    </div>`;

fluid.defaults("hortis.drawInteractions", {
    gradeNames: "fluid.stringTemplateRenderingView",
    tooltipKey: "hoverCellKey",
    selectors: {
        plantNames: ".imerss-plant-names",
        plantCounts: ".imerss-plant-counts",
        pollNames: ".imerss-poll-names",
        pollCounts: ".imerss-poll-counts",
        interactions: ".imerss-interactions-canvas",
        scroll: ".imerss-int-scroll",
        hoverable: ".imerss-int-label"
    },
    markup: {
        container: hortis.interactionMarkup
    },
    squareSize: 16,
    squareMargin: 2,
    fillStops: hortis.libreMap.natureStops,
    fillOpacity: 0.7,
    memoStops: "@expand:fluid.colour.memoStops({that}.options.fillStops, 32)",
    outlineColour: "black",
    listeners: {
        "onCreate.bindEvents": "hortis.drawInteractions.bindEvents",
        // TODO: We now have one layoutHolder for each checklist, need to complexify this
        "onCreate.bindTaxonHover": "hortis.bindTaxonHover({that}, {layoutHolder})"
    },
    invokers: {
        renderTooltip: "hortis.renderInteractionTooltip({that}, {arguments}.0)"
    },
    members: {
        hoverCellKey: "@expand:signal()",
        // plantSelection, pollSelection: injected
        subscribeRender: `@expand:fluid.effect(hortis.drawInteractions.render, {that}, {interactions},
            {interactions}.crossTable, {taxa}.rowById)`,
        subscribeHover: "@expand:hortis.subscribeHover({that})",
        bipartiteRows: "@expand:signal()"
    },
    components: {
        pollTooltips: {
            container: "{that}.dom.pollCounts",
            type: "hortis.histoTooltips",
            options: {
                counts: "pollCounts"
            }
        },
        plantTooltips: {
            container: "{that}.dom.plantCounts",
            type: "hortis.histoTooltips",
            options: {
                counts: "plantCounts"
            }
        }
    }
});

fluid.defaults("hortis.histoTooltips", {
    gradeNames: "fluid.viewComponent",
    tooltipKey: "hoverId",
    // counts - an index into nteractions
    selectors: {
        hoverable: ".imerss-int-count"
    },
    members: {
        hoverId: "@expand:signal()",
        subscribeHover: "@expand:hortis.subscribeHover({that})"
    },
    invokers: {
        renderTooltip: "hortis.renderHistoTooltip({that}, {arguments}.0, {interactions})"
    },
    listeners: {
        "onCreate.bindHistoHover": "hortis.bindHistoHover"
    }
});

hortis.bindHistoHover = function (that) {
    const hoverable = that.options.selectors.hoverable;
    that.container.on("mouseenter", hoverable, function (e) {
        const id = this.dataset.rowId;
        that.hoverEvent = e;
        that.hoverId.value = id;
    });
    that.container.on("mouseleave", hoverable, function () {
        that.hoverId.value = null;
    });
};

hortis.renderHistoTooltip = function (that, id, interactions) {
    const counts = interactions[that.options.counts];
    const count = counts.counts[id];
    const row = interactions.rowById.value[id];
    const name = row.iNaturalistTaxonName;
    return `<div class="imerss-int-tooltip"><div><i>${name}</i>:</div><div>Observation count: ${count}</div></div>`;
};


hortis.drawInteractions.render = function (that, interactions, crossTable, rowById) {
    const {plantCounts, pollCounts} = interactions;

    const now = Date.now();

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

    // Read by bindEvents, tooltips, etc.
    Object.assign(that, {crossTable, selectedPlantIds, selectedPollIds, rowById});

    const taxonIndices = {},
        idIt = (id, index) => taxonIndices[id] = index;
    selectedPlantIds.forEach(idIt);
    selectedPollIds.forEach(idIt);

    const cellTable = [],
        cellMax = hortis.maxReducer(),
        cellMin = hortis.minReducer();

    const bipartiteRows = [];

    Object.entries(crossTable).forEach(([key, count]) => {
        const {plantId, pollId} = hortis.keyToIntIds(key);
        const plantIndex = taxonIndices[plantId];
        const pollIndex = taxonIndices[pollId];

        const scaled = count / Math.sqrt((plantCounts.counts[plantId] * pollCounts.counts[pollId]));
        cellMax.reduce(scaled);
        cellMin.reduce(scaled);
        cellTable.push({scaled, plantIndex, pollIndex});

        const plantRow = rowById[plantId];
        const pollRow = rowById[pollId];
        if (plantRow && pollRow) {
            bipartiteRows.push([pollRow.iNaturalistTaxonName, plantRow.iNaturalistTaxonName, count]);
        }
    });

    const delay = Date.now() - now;
    fluid.log("Computed celltable in " + delay + " ms");
    that.bipartiteRows.value = bipartiteRows;

    // From here on we read selectedPollIds, selectedPlantIds, cellTable - should be separate function

    const now2 = Date.now();

    const {squareSize, squareMargin} = that.options;
    const canvas = that.locate("interactions")[0];
    const ctx = canvas.getContext("2d");
    const side = squareSize - 2 * squareMargin;

    ctx.lineWidth = 10;

    const width = selectedPollIds.length * squareSize + 2 * squareMargin;
    const height = selectedPlantIds.length * squareSize + 2 * squareMargin;
    canvas.width = width;
    canvas.height = height;
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, width, height);

    const xPos = index => index * squareSize + squareMargin;
    const yPos = index => index * squareSize + squareMargin;

    cellTable.forEach(function (cell) {
        const {scaled, plantIndex, pollIndex} = cell;
        const prop = (scaled - cellMin.value) / (cellMax.value - cellMin.value);

        const colour = fluid.colour.lookupStop(that.options.memoStops, prop);
        const xywh = [xPos(pollIndex), yPos(plantIndex), side, side];

        ctx.fillStyle = colour;
        ctx.fillRect.apply(ctx, xywh);

        ctx.strokeStyle = that.options.outlineColour;
        ctx.strokeRect.apply(ctx, xywh);
    });

    fluid.log("Celltable draw at  " + (Date.now() - now2) + " ms");

    const yoffset = 0; // offset currently disused
    const xoffset = -0.75;
    const countDimen = 48; // Need to hack bars slightly smaller to avoid clipping
    const countScale = 100 * (1 - 2 / countDimen);

    const plantNames = that.locate("plantNames")[0];
    plantNames.style.height = height;
    const plantMark = selectedPlantIds.map(function (plantId, plantIndex) {
        const row = rowById[plantId];
        const top = yPos(plantIndex);
        return `<div class="imerss-int-label" data-row-id="${plantId}" style="top: ${top + yoffset}px">${row.iNaturalistTaxonName}</div>`;
    });
    plantNames.innerHTML = plantMark.join("\n");

    const plantCountNode = that.locate("plantCounts")[0];
    plantCountNode.style.height = height;
    const plantCountMark = selectedPlantIds.map(function (plantId, plantIndex) {
        const count = plantCounts.counts[plantId];
        const prop = fluid.roundToDecimal(countScale * count / plantCounts.max, 2);
        const top = yPos(plantIndex);
        // noinspection CssInvalidPropertyValue
        return `<div class="imerss-int-count" data-row-id="${plantId}" style="top: ${top + yoffset}px; width: ${prop}%; height: ${side}px;"></div>`;
    });
    plantCountNode.innerHTML = plantCountMark.join("\n");

    const pollNames = that.locate("pollNames")[0];
    pollNames.style.width = width;
    const pollMark = selectedPollIds.map(function (pollId, pollIndex) {
        const row = rowById[pollId];
        const left = xPos(pollIndex);
        return `<div class="imerss-int-label" data-row-id="${pollId}" style="left: ${left + xoffset}px">${row.iNaturalistTaxonName}</div>`;
    });
    pollNames.innerHTML = pollMark.join("\n");

    const pollCountNode = that.locate("pollCounts")[0];
    pollCountNode.style.width = `${width}px`;
    const pollCountMark = selectedPollIds.map(function (pollId, pollIndex) {
        const count = pollCounts.counts[pollId];
        const prop = fluid.roundToDecimal(countScale * count / pollCounts.max, 2);
        const left = xPos(pollIndex);
        // noinspection CssInvalidPropertyValue
        return `<div class="imerss-int-count" data-row-id="${pollId}" style="left: ${left + xoffset}px; height: ${prop}%; width: ${side}px;"></div>`;
    });
    pollCountNode.innerHTML = pollCountMark.join("\n");

    const delay2 = Date.now() - now2;
    fluid.log("Rendered in " + delay2 + " ms");
};

// TODO unused
hortis.interactionTooltipTemplate = `<div class="imerss-tooltip">
    <div class="imerss-photo" style="background-image: url(%imgUrl)"></div>
    <div class="text"><b>%taxonRank:</b> %taxonNames</div>
</div>`;

hortis.renderInteractionTooltip = function (that, cellKey) {
    const {plantId, pollId} = hortis.keyToIntIds(cellKey);
    const plantRow = that.rowById[plantId];
    const plantName = plantRow.iNaturalistTaxonName;
    const pollRow = that.rowById[pollId];
    const pollName = pollRow.iNaturalistTaxonName;
    const count = that.crossTable[cellKey];
    return `<div class="imerss-int-tooltip"><div><i>${pollName}</i> on </div><div><i>${plantName}</i>:</div><div>Count: ${count}</div></div>`;
};

hortis.drawInteractions.bindEvents = function (that) {
    const plantNames = that.locate("plantNames")[0];
    const plantCounts = that.locate("plantCounts")[0];
    const pollNames = that.locate("pollNames")[0];
    const pollCounts = that.locate("pollCounts")[0];

    const scroll = that.locate("scroll")[0];
    scroll.addEventListener("scroll", function () {
        const scrollTop = scroll.scrollTop;
        plantNames.scrollTop = scrollTop;
        plantCounts.scrollTop = scrollTop;
        const scrollLeft = scroll.scrollLeft;
        pollNames.scrollLeft = scrollLeft;
        pollCounts.scrollLeft = scrollLeft;
    });

    plantNames.addEventListener("scroll", function () {
        scroll.scrollTop = plantNames.scrollTop;
    });

    const canvas = that.locate("interactions")[0];

    const {squareSize, squareMargin} = that.options;
    const buff = squareMargin / squareSize;

    canvas.addEventListener("mousemove", function (e) {
        const xc = e.offsetX / squareSize,
            yc = e.offsetY / squareSize;
        const xb = xc % 1, yb = yc % 1;
        if (xb >= buff && xb <= 1 - buff && yb >= buff && yb <= 1 - buff) {
            const pollId = that.selectedPollIds?.[Math.floor(xc)],
                plantId = that.selectedPlantIds?.[Math.floor(yc)];
            const key = hortis.intIdsToKey(plantId, pollId);
            const crossCount = that.crossTable[key];
            that.hoverEvent = e;
            that.hoverCellKey.value = crossCount ? key : null;
        } else {
            that.hoverCellKey.value = null;
        }
    });

    canvas.addEventListener("mouseleave", () => that.hoverCellKey.value = null);
};

hortis.bbeaGridBucket = () => ({obsCount: 0, byTaxonId: {}, plantByTaxonId: {}});

hortis.indexBbeaObs = function (bucket, row, index) {
    fluid.pushArray(bucket.byTaxonId, row.pollinatorINatId, index);
    fluid.pushArray(bucket.plantByTaxonId, row.plantINatId, index);
};

fluid.defaults("hortis.bbeaObsQuantiser", {
    members: {
        // Not invokers for performance
        newBucket: hortis.bbeaGridBucket,
        indexObs: hortis.indexBbeaObs
    }
});

hortis.bbeaGridTooltipTemplate =
`<div class="imerss-tooltip imerss-bbea-grid-tooltip">
    <div><b>Observations:</b> %obsCount</div>
    <div class="text"><b>Bees:</b> %beeCount<div>%beeTaxa</div></div>
    %footer
</div>`;

fluid.defaults("hortis.bbeaLibreMap", {
    gradeNames: ["hortis.libreObsMap", "hortis.libreMap.withTiles", "hortis.libreMap.streetmapTiles", "hortis.libreMap.usEcoL3Tiles", "hortis.libreMap.withPolygonDraw"],
    invokers: {
        renderTooltip: "hortis.renderBbeaGridTooltip({that}, {obsQuantiser}.grid.value, {taxa}.rowById.value, {arguments}.0)"
    },
    gridResolution: 6000,
    components: {
        obsQuantiser: {
            type: "hortis.obsQuantiser",
            options: {
                gradeNames: "hortis.bbeaObsQuantiser"
            }
        }
    }
});


hortis.renderBbeaGridTooltip = function (that, grid, rowById, cellId) {
    const bucket = grid.buckets[cellId];

    const rowTemplate = "<div>%beeName: %obsCount observation%s</div>";

    const rows = Object.entries(bucket.byTaxonId).map(([taxonId, obsIds]) => ({
        beeName: rowById[taxonId].iNaturalistTaxonName,
        obsCount: obsIds.length,
        s: obsIds.length === 1 ? "" : "s"
    }));
    const sorted = rows.sort((rowa, rowb) => rowb.obsCount - rowa.obsCount);
    let footer = "";
    if (sorted.length > 10) {
        footer = `<div class="text">...</div>`;
        sorted.length = 10;
    }

    const terms = {
        obsCount: bucket.obsCount,
        beeCount: rows.length,
        beeTaxa: sorted.map(row => fluid.stringTemplate(rowTemplate, row)).join("\n"),
        footer
    };
    return fluid.stringTemplate(hortis.bbeaGridTooltipTemplate, terms);
};

fluid.defaults("hortis.sexFilter", {
    gradeNames: ["hortis.filter", "fluid.stringTemplateRenderingView"],
    markup: {
        container: `
        <div class="imerss-sex-filter">
            <div class="imerss-filter-title">Sex selection:</div>
            <div class="imerss-filter-body imerss-sex-filter-checks"> 
            Male: <div class="imerss-male-check"></div>
            Female: <div class="imerss-female-check"></div>
            </div>
        </div>
        `
    },
    members: {
        male: "@expand:signal(false)",
        female: "@expand:signal(false)",
        filterState: "@expand:fluid.computed(hortis.sexFilter.toState, {that}.male, {that}.female)"
    },
    invokers: {
        doFilter: "hortis.sexFilter.doFilter",
        reset: "hortis.sexFilter.reset({that})"
    },
    selectors: {
        male: ".imerss-male-check",
        female: ".imerss-female-check"
    },
    components: {
        maleCheckbox: {
            type: "hortis.checkbox",
            container: "{that}.dom.male",
            options: {
                members: {
                    value: "{sexFilter}.male"
                }
            }
        },
        femaleCheckbox: {
            type: "hortis.checkbox",
            container: "{that}.dom.female",
            options: {
                members: {
                    value: "{sexFilter}.female"
                }
            }
        }
    }
});

// Roll on applier-style signalisation
hortis.sexFilter.reset = function (that) {
    that.male.value = false;
    that.female.value = false;
};

hortis.sexFilter.toState = function (male, female) {
    return {male, female};
};

hortis.sexFilter.doFilter = function (obsRows, filterState) {
    const now = Date.now();
    const all = !(filterState.female || filterState.male);

    const togo = all ? obsRows :
        obsRows.filter(row => row.sex === "F" && filterState.female || row.sex === "M" && filterState.male);
    const delay = Date.now() - now;
    fluid.log("Filtered " + obsRows.length + " obs to " + togo.length + " in " + delay + " ms");
    return togo;
};



fluid.defaults("hortis.phenologyFilter", {
    gradeNames: ["hortis.filter", "hortis.obsDrivenFilter", "fluid.stringTemplateRenderingView"],
    ranges: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
    markup: {
        container: `
        <div class="imerss-phenology-filter">
            <div class="imerss-filter-title">Phenology:</div>
            <div class="imerss-filter-body imerss-region-filter-rows">%rows</div>
        </div>
        `,
        row: `
        <div class="imerss-filter-row">
            <div class="imerss-row-checkbox">%checkbox</div>
            <div class="imerss-phenology-label">%rowLabel</div>
        </div>
        `
    },
    // fieldName
    // filterName
    members: {
        // Dummy value to cache months on rows
        rangeCache: "@expand:fluid.computed(hortis.phenologyFilter.rangeCache, {that}.obsRows)",
        filterState: "@expand:signal([])",
        renderModel: `@expand:fluid.computed(hortis.phenologyFilter.renderModel, {that}.options.ranges, {that}.options.markup)`
    },
    invokers: {
        doFilter: "hortis.phenologyFilter.doFilter({arguments}.0, {arguments}.1, {that}.rangeCache.value)",
        reset: "hortis.phenologyFilter.reset({that})"
    },
    listeners: {
        "onCreate.bindClick": "hortis.phenologyFilter.bindClick"
    }
});

hortis.phenologyFilter.reset = function (that) {
    that.filterState.value = [];
    hortis.resetChecks(that.container[0]);
};

hortis.phenologyFilter.renderRow = function (template, rowLabel, rowId) {
    return fluid.stringTemplate(template, {
        rowLabel,
        checkbox: hortis.rowCheckbox(rowId)
    });
};

hortis.phenologyFilter.renderModel = function (ranges, markup) {
    return {
        rows: ranges.map((range, i) => hortis.phenologyFilter.renderRow(markup.row, range, i)).join("\n")
    };
};


// Compute cache of millisecond range bounds for each year in range found in data (necessary because leap years may disturb)
// side-effect: initialises row with "timestamp" in milliseconds
hortis.phenologyFilter.rangeCache = function (obsRows) {
    obsRows.forEach(row => {
        const date = new Date(row.eventDate);
        const month = date.getMonth();
        // OCTOPOKHO: Side effect initialising month
        row.month = month;
    });
    return true;
};

hortis.phenologyFilter.doFilter = function (obsRows, filterState) {
    const none = filterState.every(oneFilter => !oneFilter);
    const passFilter = (row, monthIndex) => row.month === monthIndex;

    return none ? obsRows : obsRows.filter(row => filterState.some((checked, rangeIndex) => checked ? passFilter(row, rangeIndex) : false));
};

// cf. hortis.checklist.bindCheckboxClick
hortis.phenologyFilter.bindClick = function (that) {
    that.container.on("click", ".pretty input", function () {
        const id = this.dataset.rowId;
        fluid.log("Filter clicked with row " + id);
        const filterState = [...that.filterState.value];
        filterState[id] = this.checked;
        that.filterState.value = filterState;
    });
};

fluid.defaults("hortis.elevationFilter", {
    gradeNames: ["hortis.filter", "hortis.obsDrivenFilter", "fluid.stringTemplateRenderingView"],
    markup: {
        container: `
        <div class="imerss-elevation-filter">
            <div class="imerss-filter-title">Elevation:</div>
            <div class="imerss-filter-body"></div>
        </div>
        `
    },
    selectors: {
        filterBody: ".imerss-filter-body"
    },
    // fieldName
    // filterName
    members: {
        rangeCache: "@expand:fluid.computed(hortis.elevationFilter.rangeCache, {that}.obsRows, {that}.options.fieldName)",
        filterState: {
            // So perverse! Hopefully in new framework this is simply filterState: {lower: {dualRangeInput}.min, upper: {dualRangeInput}.max}
            expander: { // So perverse!!
                func: (minSignal, maxSignal) => fluid.computed( (min, max) => ({lower: min, upper: max}), minSignal, maxSignal),
                args: ["{dualRangeInput}.min", "{dualRangeInput}.max"]
            }
        }
    },
    components: {
        dualRangeInput: {
            type: "hortis.dualRangeInput",
            container: "{that}.dom.filterBody",
            options: {
                members: {
                    minRange: "@expand:fluid.derefSignal({elevationFilter}.rangeCache, lower)",
                    maxRange: "@expand:fluid.derefSignal({elevationFilter}.rangeCache, upper)"
                },
                markup: {
                    valuesTemplate: `
            <span>%minRange m</span>
            <span>%min - %max m</span>
            <span>%maxRange m</span>`
                }
            }
        }
    },
    invokers: {
        doFilter: "hortis.elevationFilter.doFilter({arguments}.0, {arguments}.1, {that}.options.fieldName, {that}.rangeCache.value)",
        reset: {
            func: "{dualRangeInput}.reset"
        }
    }

});

hortis.elevationFilter.rangeCache = function (obsRows, fieldName) {
    const range = {lower: Number.POSITIVE_INFINITY, upper: Number.NEGATIVE_INFINITY};
    obsRows.forEach(row => {
        const elevation = +row[fieldName];
        // OCTOPOKHO: Side effect converting type
        row[fieldName] = elevation;

        range.lower = Math.min(elevation, range.lower);
        range.upper = Math.max(elevation, range.upper);
    });
    return range;
};

hortis.elevationFilter.doFilter = function (obsRows, filterState, fieldName, rangeCache) {
    const none = filterState.lower === rangeCache.lower && filterState.upper === rangeCache.upper;

    return none ? obsRows : obsRows.filter(row => {
        const elevation = row[fieldName];
        return elevation >= filterState.lower && elevation <= filterState.upper;
    });
};

hortis.bbeaFiltersTemplate = `
    <div class="imerss-filters">
        <div class="imerss-filter"></div>
        <div class="imerss-collector-filter imerss-filter"></div>
        <div class="imerss-free-region-filter imerss-filter">
            <div class="imerss-filter-title">Filter by region:</div>
            <div class="imerss-free-region-filter-holder">
                <input class="imerss-free-region-input autocomplete__input autocomplete__input--default" aria-autocomplete="list" autocomplete="off" placeholder="" type="text" role="combobox" spellcheck="false">
                <div class="imerss-filter-clear imerss-basic-tooltip imerss-hidden" title="Reset this filter"><svg width="24" height="24">
                       <use href="#x-circle-close" />
                    </svg>
                </div>
            </div>
            <div class="imerss-free-region-control"></div>
        </div>
        <div class="imerss-l3eco-filter imerss-filter"></div>
        <div class="imerss-phenology-filter imerss-filter"></div>
        <div class="imerss-elevation-filter imerss-filter"></div>
    </div>
`;

fluid.defaults("hortis.bbeaFilters", {
    gradeNames: ["hortis.obsFilters", "fluid.stringTemplateRenderingView"],
    markup: { // Clearly unsatisfactory, have to move over to preactish rendering before long
        container: hortis.bbeaFiltersTemplate,
        fallbackContainer: hortis.bbeaFiltersTemplate
    },
    members: {
        obsRows: "{vizLoader}.obsRows"
    },
    selectors: {
        collectorFilter: ".imerss-collector-filter",
        freeRegionFilter: ".imerss-free-region-filter",
        l3ecoFilter: ".imerss-l3eco-filter",
        phenologyFilter: ".imerss-phenology-filter",
        elevationFilter: ".imerss-elevation-filter"
    },
    components: {
        filterRoot: "{vizLoader}",
        collectorFilter: {
            type: "hortis.collectorFilter",
            container: "{that}.dom.collectorFilter",
            options: {
                filterName: "Collector",
                fieldName: "recordedBy"
            }
        },
        freeRegionFilter: {
            type: "hortis.freeRegionFilter",
            container: "{that}.dom.freeRegionFilter",
            options: {
                fieldNames: ["US Ecoregions Level III"],
                filterName: "Filter by regions",
                members: {
                    indirectionRows: "{regionIndirection}.rows"
                }
            }
        },
        l3ecoFilter: {
            type: "hortis.regionFilter",
            container: "{that}.dom.l3ecoFilter",
            options: {
                filterName: "L3 ecoregion",
                fieldNames: ["US Ecoregions Level III"],
                members: {
                    indirectionRows: "{regionIndirection}.rows"
                }
            }
        },
        phenologyFilter: {
            type: "hortis.phenologyFilter",
            container: "{that}.dom.phenologyFilter"
        },
        elevationFilter: {
            type: "hortis.elevationFilter",
            container: "{that}.dom.elevationFilter",
            options: {
                fieldName: "verbatimElevation"
            }
        }
    }
});

// A fake 1-element "filters" block currently just to relocate the sex filter to above the bee checklist as
// requested by Michael O'Laughlin

hortis.bbeaBbeaFiltersTemplate = `
    <div>
        <div class="imerss-sex-filter imerss-filter"></div>
    </div>
`;

fluid.defaults("hortis.bbeaBbeaFilters", {
    gradeNames: ["fluid.stringTemplateRenderingView"],
    markup: { // Clearly unsatisfactory, have to move over to preactish rendering before long
        container: hortis.bbeaBbeaFiltersTemplate,
        fallbackContainer: hortis.bbeaBbeaFiltersTemplate
    },
    selectors: {
        sexFilter: ".imerss-sex-filter"
    },
    components: {
        sexFilter: {
            type: "hortis.sexFilter",
            container: "{that}.dom.sexFilter"
        }
    }
});
