<fluid-import src="hortis-recordReporter.vue"></fluid-import>
<fluid-import src="../filters/hortis-standardFilterControls.vue"></fluid-import>
<fluid-import src="../filters/hortis-collectorFilter.vue"></fluid-import>
<fluid-import src="../filters/hortis-regionFilter.vue"></fluid-import>
<fluid-import src="hortis-standardChecklist.vue"></fluid-import>
<fluid-import src="hortis-vizLibreMap.vue"></fluid-import>
<fluid-import src="../components/hortis-pageTabs.vue"></fluid-import>
<script src="%papaparse/papaparse.min.js" data-fl-scope="global"></script>
<script src="%pako/dist/pako_inflate.min.js" data-fl-scope="global"></script>
<script src="../../js/i6/vizPackage.js"></script>
<script src="../../js/i6/qdl.js"></script>
<script src="../../js/i6/imerss-core.js"></script>
<script src="%@popperjs/core/dist/umd/popper-lite.min.js" fluid-client data-fl-scope="global"></script>
<script src="../../js/i6/tooltip.js"></script>
<script src="../../js/i6/filters.js"></script>
<script src="../../js/i6/hashManager.js"></script>
<style src="%infusion/src/framework/core/css/fluid.css"></style>
<style src="%infusion/src/lib/jquery/ui/css/default-theme/tooltip.css"></style>
<style src="../../css/imerss-core.css"></style>
<style src="../../css/imerss-blitz.css"></style>
<style src="../../css/imerss-i6.css"></style>
<script>
"use strict";

// The standard visualisation of a set of observations - a map and checklist in tabs, beside filters by recorder and
// dataset. Its template is the whole of the visualisation's markup, into which each of its parts is rendered at its
// @id. A page hosts it on an element bearing fluid-layers together with a layer of its own configuring its title and
// data files - see indexDiatoms.html
fluid.def("hortis.standardVizLoader", {
    $layers: "hortis.vizLoader",
    title: "",
    // The columnar data package, holding the tables obs, taxa and regionIndirection - by default the placeholder
    // declared below, from which a test fixture renders. A page which is a runnable application overrides it with its
    // real data - see FLUID-7032
    vizFile: "placeholder://hortis.standardVizLoader/viz",
    gridResolution: 100,
    obsFilters: {
        $component: {
            $layers: "hortis.obsFilters"
        }
    },
    filteredObs: "{self}.obsFilters.allOutput",
    taxaFromObs: "$compute:hortis.taxaFromObs({self}.pkg, {self}.filteredObs, {self}.taxa.rowById)",
    collectorFilter: {
        $component: {
            $layers: "hortis.collectorFilter",
            filterName: "Recorder"
        }
    },
    datasetFilter: {
        $component: {
            $layers: "hortis.regionFilter",
            filterName: "Dataset",
            fieldNames: ["dataset"],
            summaryNouns: ["dataset", "datasets"],
            indirectionRows: "{vizLoader}.regionIndirectionRows"
        }
    },
    map: {
        $component: {
            $layers: "hortis.vizLibreMap",
            gridResolution: "{vizLoader}.gridResolution"
        }
    },
    checklist: {
        $component: {
            $layers: "hortis.standardChecklist"
        }
    },
    tabs: {
        $component: {
            $layers: "hortis.pageTabs",
            selectedTab: "map",
            tabs: [
                {id: "map", label: "Map", panelId: "fli-tab-map"},
                {id: "checklist", label: "Checklist", panelId: "fli-tab-checklist"},
                {id: "grid", label: "Grid", panelId: "fli-tab-grid"},
                {id: "wol", label: "Web of Life", panelId: "fli-tab-wol"}
            ]
        }
    },
    recordReporter: {
        $component: {
            $layers: "hortis.recordReporter",
            filtered: "{vizLoader}.finalFilteredObs",
            all: "{vizLoader}.allObs"
        }
    },
    filterControls: {
        $component: {
            $layers: "hortis.standardFilterControls"
        }
    },
    // Widgets shown beneath the tabs - by default there are none, and the slot is omitted
    records: null,
    // true once the observations to be shown are available
    loaded: "$compute:hortis.standardVizLoader.loaded({self}.finalFilteredObs)"
});

// Loaded once the observations are filtered - whether from real data or, in a test fixture, from the placeholder
hortis.standardVizLoader.loaded = () => true;
</script>

<template>
    <div class="imerss-container" @class="imerss-loading:!@{loaded}">
        <div class="imerss-blitz-left">
            <h2>@{title}</h2>
            <div class="imerss-main-tabs imerss-tabs ui-tabs ui-widget ui-widget-content">
                <div @id="tabs"></div>
                <div id="fli-tab-map" class="imerss-tab-panel ui-tabs-panel" role="tabpanel" hidden="@{tabs.panelHidden.map}">
                    <div class="imerss-map-holder imerss-nodismiss-map">
                        <div class="imerss-map" @id="map"></div>
                    </div>
                </div>
                <div id="fli-tab-checklist" class="imerss-tab-panel ui-tabs-panel" role="tabpanel" hidden="@{tabs.panelHidden.checklist}">
                    <div @id="checklist"></div>
                </div>
                <div id="fli-tab-grid" class="imerss-tab-panel ui-tabs-panel" role="tabpanel" hidden="@{tabs.panelHidden.grid}"></div>
                <div id="fli-tab-wol" class="imerss-tab-panel ui-tabs-panel" role="tabpanel" hidden="@{tabs.panelHidden.wol}"></div>
                <div @id="records"></div>
            </div>
        </div>
        <div class="imerss-blitz-right">
            <div class="imerss-filter-panel">
                <div class="imerss-filters imerss-main-filters">
                    <div class="imerss-filter"></div>
                    <div class="imerss-filter" @id="collectorFilter"></div>
                    <div class="imerss-dataset-filter imerss-filter" @id="datasetFilter"></div>
                </div>
                <div @id="filterControls"></div>
                <div @id="recordReporter"></div>
            </div>
            <div class="imerss-blitz-content"></div>
            <div class="imerss-blitz-widgets"></div>
        </div>
    </div>
</template>
<placeholder name="viz" type="application/octet-stream" encoding="base64">
    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
</placeholder>
