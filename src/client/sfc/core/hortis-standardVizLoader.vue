<fluid-import src="hortis-recordReporter.vue"></fluid-import>
<fluid-import src="../filters/hortis-standardFilterControls.vue"></fluid-import>
<fluid-import src="../filters/hortis-collectorFilter.vue"></fluid-import>
<fluid-import src="../filters/hortis-regionFilter.vue"></fluid-import>
<fluid-import src="hortis-standardChecklist.vue"></fluid-import>
<fluid-import src="hortis-vizLibreMap.vue"></fluid-import>
<fluid-import src="../components/hortis-pageTabs.vue"></fluid-import>
<script src="%papaparse/papaparse.min.js" data-fl-scope="global"></script>
<script src="%pako/dist/pako_inflate.min.js" data-fl-scope="global"></script>
<script src="../../js/i6/imerss-core.js"></script>
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
    // obsFile: String
    // taxaFile: String
    // regionIndirectionFile: String
    gridResolution: 100,
    regionIndirection: {
        $component: {
            $layers: ["hortis.csvReader", "fluid.withPlaceholder"],
            url: "{vizLoader}.regionIndirectionFile",
            placeholderUrl: "{vizLoader}.regionIndirectionPlaceholderFile"
        }
    },
    obsFilters: {
        $component: {
            $layers: "hortis.obsFilters"
        }
    },
    filteredObs: "{self}.obsFilters.allOutput",
    taxaFromObs: "$compute:hortis.taxaFromObs({self}.filteredObs, {self}.taxa.rowById)",
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
            indirectionRows: "{vizLoader}.regionIndirection.rows"
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
            filteredRows: "{vizLoader}.finalFilteredObs",
            allRows: "{vizLoader}.obsRows"
        }
    },
    filterControls: {
        $component: {
            $layers: "hortis.standardFilterControls"
        }
    },
    // Widgets shown beneath the tabs - by default there are none, and the slot is omitted
    records: null,
    // true once the observations shown are the real ones - a rendering from placeholder data, e.g. by a static build
    // of the page, marks the visualisation as loading until the real data has loaded
    loaded: "$compute:hortis.standardVizLoader.loaded({self}.finalFilteredObs, {self}.isPlaceholder, {self}.regionIndirection.isPlaceholder)"
});

// Loaded once the observations are filtered, from genuine data rather than placeholders
hortis.standardVizLoader.loaded = (finalFilteredObs, ...isPlaceholders) => !fluid.withPlaceholder.any(...isPlaceholders);
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
