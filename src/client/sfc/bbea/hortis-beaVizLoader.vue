<fluid-import src="../core/hortis-icons.vue"></fluid-import>
<fluid-import src="../core/hortis-recordReporter.vue"></fluid-import>
<fluid-import src="../filters/hortis-filterControls.vue"></fluid-import>
<fluid-import src="../filters/hortis-collectorFilter.vue"></fluid-import>
<fluid-import src="hortis-collectorReportLinker.vue"></fluid-import>
<fluid-import src="../filters/hortis-groupedRegionFilter.vue"></fluid-import>
<fluid-import src="../filters/hortis-phenologyFilter.vue"></fluid-import>
<fluid-import src="../filters/hortis-elevationFilter.vue"></fluid-import>
<fluid-import src="../filters/hortis-sexFilter.vue"></fluid-import>
<fluid-import src="../filters/hortis-filterFacet.vue"></fluid-import>
<fluid-import src="hortis-bbeaChecklist.vue"></fluid-import>
<fluid-import src="hortis-bbeaLibreMap.vue"></fluid-import>
<fluid-import src="hortis-bbeaViewTabs.vue"></fluid-import>
<fluid-import src="hortis-bipartite.vue"></fluid-import>
<fluid-import src="hortis-drawInteractions.vue"></fluid-import>
<fluid-import src="../core/hortis-taxonListView.vue"></fluid-import>
<fluid-import src="hortis-beeAbundance.vue"></fluid-import>
<fluid-import src="hortis-seedMix.vue"></fluid-import>

<script src="%papaparse/papaparse.min.js" data-fl-scope="global"></script>
<script src="%pako/dist/pako_inflate.min.js" data-fl-scope="global"></script>
<script src="../../js/i6/imerss-core.js"></script>
<script src="../../js/i6/filters.js"></script>
<script src="../../js/i6/hashManager.js"></script>
<script src="../../js/i6/bbea/mfShell.js"></script>
<script src="../../js/i6/bbea/imerss-bbea.js"></script>

<style src="https://fonts.googleapis.com/css2?family=Source+Sans+3:ital,wght@0,400;0,600;0,700;1,400&display=swap"></style>
<style src="https://cdn.materialdesignicons.com/2.0.46/css/materialdesignicons.min.css"></style>
<style src="%pretty-checkbox/dist/pretty-checkbox.min.css"></style>
<style src="../../css/imerss-core.css"></style>
<style src="../../css/imerss-bbea-i6.css"></style>
<style src="../../css/imerss-i6.css"></style>

<script>
"use strict";

// The plant-pollinator (BBEA) visualisation. Its template is the whole of the visualisation's markup, into which each
// of its filters, checklists, map and views is rendered at its @id. A page hosts it on an element bearing
// fluid-layers="hortis.beaVizLoader" together with a layer of its own configuring its data files - see
// indexBeasBCBA.html
fluid.def("hortis.beaVizLoader", {
    $layers: ["hortis.icons", "hortis.vizLoader"],
    // obsFile: String
    // taxaFile: String
    // regionIndirectionFile: String
    // The state whose volunteer reports are linked to, if they are to be restricted to one
    stateCode: null,
    // The versions of the software and dataset shown in the colophon
    softwareVersion: "",
    datasetVersion: "",
    regionIndirection: {
        $component: {
            $layers: ["hortis.csvReader", "fluid.withPlaceholder"],
            url: "{vizLoader}.regionIndirectionFile",
            placeholderUrl: "{vizLoader}.regionIndirectionPlaceholderFile"
        }
    },
    // The filters, each held within the body of a section of the filter concertina
    obsFilters: {
        $component: {
            $layers: "hortis.obsFilters"
        }
    },
    filteredObs: "{self}.obsFilters.allOutput",
    // The leading fields of the region filter, by which its regions are grouped
    regionLeadingFields: ["US Ecoregions Level III"],
    collectorFacet: {
        $component: {
            $layers: "hortis.filterFacet",
            facet: "collector",
            name: "Collector",
            body: {
                $component: {
                    template: `<div><div @id="collectorFilter"></div><div @id="collectorReportLinker"></div></div>`,
                    collectorFilter: {
                        $component: {
                            $layers: "hortis.collectorFilter"
                        }
                    },
                    collectorReportLinker: {
                        $component: {
                            $layers: "hortis.collectorReportLinker",
                            collectorName: "{vizLoader}.collectorFacet.body.collectorFilter.filterState",
                            stateCode: "{vizLoader}.stateCode"
                        }
                    }
                }
            }
        }
    },
    regionFacet: {
        $component: {
            $layers: "hortis.filterFacet",
            facet: "region",
            name: "Region",
            body: {
                $component: {
                    template: `<div><div class="imerss-region-filter" @id="regionFilter"></div></div>`,
                    regionFilter: {
                        $component: {
                            $layers: "hortis.groupedRegionFilter",
                            leadingFields: "{vizLoader}.regionLeadingFields",
                            indirectionRows: "{vizLoader}.regionIndirection.rows"
                        }
                    }
                }
            }
        }
    },
    phenologyFacet: {
        $component: {
            $layers: "hortis.filterFacet",
            facet: "phenology",
            name: "Phenology",
            body: {
                $component: {
                    template: `<div><div @id="phenologyFilter"></div></div>`,
                    phenologyFilter: {
                        $component: {
                            $layers: "hortis.phenologyFilter"
                        }
                    }
                }
            }
        }
    },
    elevationFacet: {
        $component: {
            $layers: "hortis.filterFacet",
            facet: "elevation",
            name: "Elevation",
            body: {
                $component: {
                    template: `<div><div @id="elevationFilter"></div></div>`,
                    elevationFilter: {
                        $component: {
                            $layers: "hortis.elevationFilter"
                        }
                    }
                }
            }
        }
    },
    map: {
        $component: {
            $layers: "hortis.bbeaLibreMap"
        }
    },
    taxaFromObs: "$compute:hortis.twoTaxaFromObs({self}.filteredObs, {self}.taxa.rowById)",
    beeFacet: {
        $component: {
            $layers: "hortis.filterFacet",
            facet: "bees",
            name: "Bees",
            body: {
                $component: {
                    template: `<div><div class="imerss-pollinators" @id="pollChecklist"></div></div>`,
                    pollChecklist: {
                        $component: {
                            $layers: "hortis.bbeaChecklist",
                            urlKey: "bees",
                            searchControlId: "fli-imerss-bee-search",
                            rootId: "1",
                            filterRanks: ["epifamily", "family", "tribe", "genus", "subgenus", "species"],
                            disclosableRanks: ["tribe", "genus", "subgenus", "species"],
                            summaryNouns: ["bee taxon", "bee taxa"],
                            rowFocus: "{vizLoader}.taxaFromObs.pollRowFocus",
                            extraFilter: {
                                $component: {
                                    $layers: "hortis.sexFilter"
                                }
                            }
                        }
                    }
                }
            }
        }
    },
    plantFacet: {
        $component: {
            $layers: "hortis.filterFacet",
            facet: "plants",
            name: "Plants",
            body: {
                $component: {
                    template: `<div><div class="imerss-plants" @id="plantChecklist"></div></div>`,
                    plantChecklist: {
                        $component: {
                            $layers: "hortis.bbeaChecklist",
                            urlKey: "plants",
                            searchControlId: "fli-imerss-plant-search",
                            rootId: "47126",
                            filterRanks: ["kingdom", "order", "family", "genus"],
                            disclosableRanks: ["family", "genus"],
                            summaryNouns: ["plant taxon", "plant taxa"],
                            rowFocus: "{vizLoader}.taxaFromObs.plantRowFocus"
                        }
                    }
                }
            }
        }
    },
    interactions: {
        $component: {
            $layers: "hortis.interactions",
            obsRows: "{vizLoader}.filteredObs",
            plantSelection: "{vizLoader}.plantFacet.body.plantChecklist.rowSelection",
            pollSelection: "{vizLoader}.beeFacet.body.pollChecklist.rowSelection",
            rowById: "{vizLoader}.taxa.rowById"
        }
    },
    finalFilteredObs: "{self}.interactions.result.finalFilteredObs",
    // true once the observations to be shown are available, which hides the loading indicator - a rendering from
    // placeholder data, e.g. by a static build of the page, shows it until the real data has loaded
    loaded: "$compute:hortis.beaVizLoader.loaded({self}.finalFilteredObs, {self}.isPlaceholder, {self}.regionIndirection.isPlaceholder)",
    recordReporter: {
        $component: {
            $layers: "hortis.recordReporter",
            filteredRows: "{vizLoader}.finalFilteredObs",
            allRows: "{vizLoader}.obsRows"
        }
    },
    filterControls: {
        $component: {
            $layers: "hortis.filterControls"
        }
    },
    shell: {
        $component: {
            $layers: "hortis.mfShell"
        }
    },
    concertina: {
        $component: {
            $layers: "hortis.filterConcertina"
        }
    },
    bbeaViewTabs: {
        $component: {
            $layers: "hortis.bbeaViewTabs"
        }
    },
    drawInteractions: {
        $component: {
            $layers: "hortis.drawInteractions"
        }
    },
    bipartite: {
        $component: {
            $layers: "hortis.bipartite"
        }
    },
    beeList: {
        $component: {
            $layers: "hortis.taxonListView",
            tabId: "bees",
            idField: "pollinatorINatId",
            colourByFamily: true,
            noun: "bee",
            downloadFile: "bees.csv"
        }
    },
    plantList: {
        $component: {
            $layers: "hortis.taxonListView",
            tabId: "plants",
            idField: "plantINatId",
            colourByFamily: false,
            noun: "plant",
            downloadFile: "plants.csv"
        }
    },
    beeAbundance: {
        $component: {
            $layers: "hortis.beeAbundance"
        }
    },
    seedMix: {
        $component: {
            $layers: "hortis.seedMix"
        }
    }
});

// Loaded once the observations are filtered, from genuine data rather than placeholders
hortis.beaVizLoader.loaded = (finalFilteredObs, ...isPlaceholders) => !fluid.withPlaceholder.any(...isPlaceholders);
</script>

<template>
    <div class="imerss-container mf" @class="mf-dragging:@{shell.dragging}" style="@{shell.rootStyle}">
        <div class="bee-loading-container" @class="bee-loading-container-hidden:@{loaded}">
            <div class="loading-message">Bee Plant Network Visualization Tool Loading</div>
            <div class="bee">
                <div class="bee-body">
                    <div class="line"></div>
                </div>
                <div>
                    <div class="wing-right"></div>
                    <div class="wing-left"></div>
                </div>
                <div class="bee-path">
                    <div class="pollen"></div>
                    <div class="pollen"></div>
                    <div class="pollen"></div>
                    <div class="pollen"></div>
                    <div class="pollen"></div>
                    <div class="pollen"></div>
                    <div class="pollen"></div>
                    <div class="pollen"></div>
                    <div class="pollen"></div>
                    <div class="pollen"></div>
                    <div class="pollen"></div>
                    <div class="pollen"></div>
                </div>
            </div>
        </div>

        <div class="mf-shell" @class="mf-f-closed:@{shell.filtersClosed}">

            <!-- Filters: a concertina of collapsible sections -->
            <section class="mf-pane mf-pane-filters" aria-label="Filters">
                <div class="mf-panehead">
                    <h2>Filters</h2>
                    <span @id="filterControls"></span>
                    <button class="imerss-linkbtn imerss-collapse-facets" type="button" title="Close every filter section"
                        @onclick="{self}.concertina.collapseAll()">Collapse all</button>
                </div>

                <div class="mf-facets imerss-facets">

                    <section @id="collectorFacet"></section>
                    <section @id="regionFacet"></section>
                    <section @id="phenologyFacet"></section>
                    <section @id="elevationFacet"></section>
                    <section @id="beeFacet"></section>
                    <section @id="plantFacet"></section>
                </div>
            </section>

            <div class="mf-grip mf-grip-v" @class="mf-closed:@{shell.filtersClosed}" id="mf-grip-filters" data-axis="x"
                data-min="240" data-max="560" role="separator" aria-orientation="vertical" tabindex="0"
                aria-label="Resize or collapse filters" @onpointerdown="hortis.mfShell.pointerDown({0}, {self}.shell)"
                @onpointermove="hortis.mfShell.pointerMove({0}, {self}.shell)" @onpointerup="hortis.mfShell.pointerUp({0}, {self}.shell)"
                @onkeydown="hortis.mfShell.keyDown({0}, {self}.shell)">
                <button class="mf-grip-tab" type="button" aria-label="@{shell.filtersGripLabel}" title="@{shell.filtersGripLabel}">
                    <svg width="11" height="11" aria-hidden="true"><use href="#imerss-i-chev"/></svg>
                </button>
            </div>

            <!-- Map over the tabbed views -->
            <div class="mf-middle" @class="mf-s-closed:@{shell.viewsClosed}">

                <section class="mf-pane mf-pane-map" aria-label="Map">
                    <div class="mf-panehead">
                        <h2>Map</h2>
                        <div class="imerss-fullscreen">
                            <button class="mf-iconbtn imerss-fullscreen-control" type="button" title="Open in full-screen mode"
                                aria-label="Open in full-screen mode" @onclick="{self}.shell.fullScreen = true">
                                <svg width="18" height="18" aria-hidden="true"><use href="#imerss-i-fullscreen"/></svg>
                            </button>
                            <button class="mf-iconbtn imerss-fullscreen-exit-control" type="button" title="Exit full-screen mode"
                                aria-label="Exit full-screen mode" @onclick="{self}.shell.fullScreen = false">
                                <svg width="18" height="18" aria-hidden="true"><use href="#imerss-i-fullscreen-exit"/></svg>
                            </button>
                        </div>
                    </div>
                    <div class="imerss-mount mf-mount-map imerss-map-holder">
                        <div class="imerss-map" @id="map"></div>
                    </div>
                    <div class="imerss-mobile-warning">
                        This visualisation is best viewed on a desktop browser. Whilst basic mapping and filtering is available in this view,
                        displaying the plant-pollinator interaction network requires more space than is available on a mobile device.
                    </div>
                    <div @id="recordReporter"></div>
                </section>

                <div class="mf-grip mf-grip-h" @class="mf-closed:@{shell.viewsClosed}" id="mf-grip-strata" data-axis="y" role="separator"
                    aria-orientation="horizontal" tabindex="0" aria-label="Resize or collapse views"
                    @onpointerdown="hortis.mfShell.pointerDown({0}, {self}.shell)" @onpointermove="hortis.mfShell.pointerMove({0}, {self}.shell)"
                    @onpointerup="hortis.mfShell.pointerUp({0}, {self}.shell)" @onkeydown="hortis.mfShell.keyDown({0}, {self}.shell)">
                    <button class="mf-grip-tab" type="button" aria-label="@{shell.viewsGripLabel}" title="@{shell.viewsGripLabel}">
                        <svg width="11" height="11" aria-hidden="true"><use href="#imerss-i-chev"/></svg>
                    </button>
                </div>

                <section class="mf-pane mf-pane-views" aria-label="Views">
                    <div @id="bbeaViewTabs"></div>

                    <div class="imerss-mount mf-mount-net" data-panel="net" role="tabpanel" hidden="@{bbeaViewTabs.panelHidden.net}">
                        <div @id="bipartite"></div>
                    </div>

                    <div class="imerss-mount mf-mount-net" data-panel="mtx" role="tabpanel" hidden="@{bbeaViewTabs.panelHidden.mtx}">
                        <div class="imerss-interactions-holder" @id="drawInteractions"></div>
                    </div>

                    <div class="imerss-bee-list" data-panel="bees" @id="beeList"></div>
                    <div class="imerss-plant-list" data-panel="plants" @id="plantList"></div>
                    <div class="imerss-bee-abundance" data-panel="abund" @id="beeAbundance"></div>
                    <div class="imerss-seed-mix" data-panel="seed" @id="seedMix"></div>
                </section>

            </div>
        </div>

        <footer class="mf-colophon">
            <span>@{softwareVersion}</span>
            <span>@{datasetVersion}</span>
        </footer>
    </div>
</template>

<symbols>
    <symbol id="imerss-i-fullscreen" viewBox="0 0 24 24">
        <path d="M9 4H4L4 9M20 9V4L15 4M15 20H20L20 15M4 15L4 20L9.00002 20" fill="none" stroke="#000000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    </symbol>
    <symbol id="imerss-i-fullscreen-exit" viewBox="0 0 32 32" stroke-width="2" fill="none" stroke="currentcolor" stroke-linecap="round" stroke-linejoin="round">
        <path d="M4 12 L12 12 12 4 M20 4 L20 12 28 12 M4 20 L12 20 12 28 M28 20 L20 20 20 28" />
    </symbol>
</symbols>
