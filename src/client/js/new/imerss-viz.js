"use strict";

/* global preactSignalsCore */

// noinspection ES6ConvertVarToLetConst // otherwise this is a duplicate on minifying
var hortis = fluid.registerNamespace("hortis");

// noinspection ES6ConvertVarToLetConst // otherwise this is a duplicate on minifying
var {} = preactSignalsCore;


fluid.defaults("hortis.standardVizLoader", {
    gradeNames: "hortis.vizLoaderWithMap",
    selectors: {
        recordReporter: ".imerss-record-reporter",
        filterControls: ".imerss-filter-controls",
        filters: ".imerss-main-filters",
        checklist: ".imerss-main-checklist"
    },
    gridResolution: 100,
    members: {
        filteredObs: "{obsFilters}.allOutput",
        taxaFromObs: "@expand:fluid.computed(hortis.taxaFromObs, {that}.filteredObs, {taxa}.rowById)",
        allTaxaFromObs: "@expand:fluid.computed(hortis.taxaFromObs, {that}.obsRows, {taxa}.rowById)"
    },
    components: {
        map: {
            options: {
                gridResolution: "{vizLoader}.options.gridResolution"
            }
        },
        regionIndirection: {
            type: "hortis.csvReader",
            options: {
                url: "{vizLoader}.options.regionIndirectionFile"
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
        filters: {
            type: "hortis.blitzFilters",
            container: "{that}.dom.filters",
            options: {
                members: {
                    allInput: "{vizLoader}.obsRows",
                    rendered: "{hortis.vizLoader}.rendered",
                    idle: "{hortis.vizLoader}.idle"
                }
            }
        },
        tabs: {
            type: "hortis.tabs",
            container: ".imerss-main-tabs",
            options: {
                tabIds: {
                    map: "fli-tab-map",
                    checklist: "fli-tab-checklist",
                    grid: "fli-tab-grid",
                    wol: "fli-tab-wol"
                },
                model: {
                    selectedTab: "map"
                }
            }
        },
        checklist: {
            type: "hortis.checklist.withHolder",
            container: "{that}.dom.checklist",
            options: {
                gradeNames: ["hortis.checklist.withCopy"],
                rootId: 48460, // Life
                filterRanks: ["epifamily", "family", "tribe", "genus", "subgenus", "species"],
                disclosableRanks: [],
                // disclosableRanks: ["tribe", "genus", "subgenus", "species"],
                copyChecklistRanks: ["genus", "species"],
                selectable: false,
                unfoldable: true,
                copyButtonMessage: "Copy %rows taxa to clipboard",
                members: {
                    rowById: "{taxa}.rowById",
                    rowFocus: "{vizLoader}.taxaFromObs"
                }
            }
        }
    }
});

hortis.taxaFromObs = function (filteredObs, rowById) {
    const taxonIds = {};
    const now = Date.now();
    filteredObs.forEach(row => {
        taxonIds[row.iNaturalistTaxonId] = true;
    });
    const togo = hortis.closeParentTaxa(taxonIds, rowById);
    const delay = Date.now() - now;
    fluid.log("taxaFromObs for " + filteredObs.length + " in " + delay + " ms");
    return togo;
};

hortis.mapGridTooltipTemplate =
    `<div class="imerss-tooltip imerss-bbea-grid-tooltip">
    <div><b>Observations:</b> %obsCount</div>
    <div class="text"><b>Taxa:</b> %taxonCount<div>%taxa</div></div>
    %footer
</div>`;

fluid.defaults("hortis.vizLibreMap", {
    gradeNames: ["hortis.libreObsMap", "hortis.libreMap.withTiles", "hortis.libreMap.streetmapTiles", "hortis.libreMap.withPolygonDraw"],
    invokers: {
        renderTooltip: "hortis.renderVizGridTooltip({that}, {obsQuantiser}.grid.value, {taxa}.rowById.value, {arguments}.0)"
    },
    gridResolution: 30,
    legendPosition: "bottom-left"
});


hortis.renderVizGridTooltip = function (that, grid, rowById, cellId) {
    const bucket = grid.buckets[cellId];

    const rowTemplate = "<div>%taxonName: %obsCount observation%s</div>";

    const rows = Object.entries(bucket.byTaxonId).map(([taxonId, obsIds]) => ({
        taxonName: rowById[taxonId].iNaturalistTaxonName,
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
        taxonCount: rows.length,
        taxa: sorted.map(row => fluid.stringTemplate(rowTemplate, row)).join("\n"),
        footer
    };
    return fluid.stringTemplate(hortis.mapGridTooltipTemplate, terms);
};
