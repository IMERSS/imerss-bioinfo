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
<script src="../../js/i6/vizPackage.js"></script>
<script src="../../js/i6/qdl.js"></script>
<script src="../../js/i6/imerss-core.js"></script>
<script src="%@popperjs/core/dist/umd/popper-lite.min.js" fluid-client data-fl-scope="global"></script>
<script src="../../js/i6/tooltip.js"></script>
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
    // The columnar data package, holding the tables obs, taxa and regionIndirection - by default the placeholder
    // declared below, from which a test fixture renders. A page which is a runnable application overrides it with its
    // real data - see FLUID-7032
    vizFile: "placeholder://hortis.beaVizLoader/viz",
    // The state whose volunteer reports are linked to, if they are to be restricted to one
    stateCode: null,
    // The versions of the software and dataset shown in the colophon
    softwareVersion: "",
    datasetVersion: "",
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
                            indirectionRows: "{vizLoader}.regionIndirectionRows"
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
    taxaFromObs: "$compute:hortis.twoTaxaFromObs({self}.pkg, {self}.filteredObs, {self}.taxa.rowById)",
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
                            // Subspecies are shown beneath their species, named as community standards write them,
                            // e.g. Anthidiellum notatum ssp. robertsoni - see hortis.rowToScientific
                            filterRanks: ["epifamily", "family", "tribe", "genus", "subgenus", "species", "subspecies"],
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
            pkg: "{vizLoader}.pkg",
            selection: "{vizLoader}.filteredObs",
            plantSelection: "{vizLoader}.plantFacet.body.plantChecklist.rowSelection",
            pollSelection: "{vizLoader}.beeFacet.body.pollChecklist.rowSelection",
            rowById: "{vizLoader}.taxa.rowById"
        }
    },
    finalFilteredObs: "{self}.interactions.result.finalFilteredObs",
    // true once the observations to be shown are available, which hides the loading indicator
    loaded: "$compute:hortis.beaVizLoader.loaded({self}.finalFilteredObs)",
    recordReporter: {
        $component: {
            $layers: "hortis.recordReporter",
            filtered: "{vizLoader}.finalFilteredObs",
            all: "{vizLoader}.allObs"
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

// Loaded once the observations are filtered - whether from real data or, in a test fixture, from the placeholder
hortis.beaVizLoader.loaded = () => true;
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
        <path d="M9 4H4L4 9M20 9V4L15 4M15 20H20L20 15M4 15L4 20L9.00002 20" fill="none" stroke="#000000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path>
    </symbol>
    <symbol id="imerss-i-fullscreen-exit" viewBox="0 0 32 32" stroke-width="2" fill="none" stroke="currentcolor" stroke-linecap="round" stroke-linejoin="round">
        <path d="M4 12 L12 12 12 4 M20 4 L20 12 28 12 M4 20 L12 20 12 28 M28 20 L20 20 20 28"></path>
    </symbol>
</symbols>
<placeholder name="viz" type="application/octet-stream" encoding="base64">
    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
    GqrI8P//AYJQTT5QLgAA
</placeholder>
