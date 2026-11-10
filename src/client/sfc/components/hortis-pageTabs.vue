<fluid-import src="hortis-pageTabs-tab.vue"></fluid-import>
<style src="%jquery-ui/themes/base/tabs.css"></style>
<style src="%infusion/src/lib/jquery/ui/css/default-theme/core.css"></style>
<style src="%infusion/src/lib/jquery/ui/css/default-theme/theme.css"></style>
<script>
"use strict";

// A strip of tabs in the style of jQuery UI's, choosing which of a set of panels is shown. The panels are placed by
// the parent's template, each hidden by binding to this component's `panelHidden`, e.g.
// hidden="@{tabs.panelHidden.map}"
fluid.def("hortis.pageTabs", {
    $layers: "fluid.component",
    // tabs: Object[] - one record per tab, with members `id`, `label` and `panelId`, the id of its panel
    // selectedTab: String - the id of the selected tab
    panelHidden: "$compute:hortis.pageTabs.panelHidden({self}.tabs, {self}.selectedTab)",
    tabRows: {
        $component: {
            $layers: "hortis.pageTabs.tab",
            $for: {
                source: "{pageTabs}.tabs",
                valueAs: "tab"
            }
        }
    }
});

hortis.pageTabs.panelHidden = (tabs, selectedTab) => Object.fromEntries(tabs.map(tab => [tab.id, tab.id !== selectedTab]));

hortis.pageTabs.isSelected = (selectedTab, tabId) => selectedTab === tabId;

hortis.pageTabs.select = function (that, tabId) {
    that.selectedTab = tabId;
};

hortis.pageTabs.click = function (event, tab) {
    event.preventDefault();
    tab.select();
};
</script>

<template>
    <ul class="ui-tabs-nav ui-corner-all ui-helper-reset ui-helper-clearfix ui-widget-header" role="tablist" @id="tabRows"></ul>
</template>
