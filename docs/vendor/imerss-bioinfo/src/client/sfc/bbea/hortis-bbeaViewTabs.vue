<fluid-import src="../core/hortis-icons.vue"></fluid-import>
<script src="../../js/i6/bbea/mfShell.js"></script>
<script>
"use strict";

// The tabs heading the views pane, which let each view know whether it is showing, so that it need only render when it
// is, together with the button downloading the contents of the selected view
fluid.def("hortis.bbeaViewTabs", {
    $layers: ["hortis.icons", "fluid.component"],
    tabIds: ["net", "mtx", "bees", "plants", "abund", "seed"],
    selectedTab: "net",
    downloadTitles: {
        net: "Download the network as a PNG image",
        mtx: "Download the interaction counts as CSV",
        bees: "Download the bee list as CSV",
        plants: "Download the plant list as CSV",
        abund: "Download bee abundance counts as CSV",
        seed: "Download the seed mix as CSV"
    },
    tabOn: "$compute:hortis.bbeaViewTabs.tabOn({self}.tabIds, {self}.selectedTab)",
    tabIndex: "$compute:hortis.bbeaViewTabs.tabIndex({self}.tabOn)",
    panelHidden: "$compute:hortis.bbeaViewTabs.panelHidden({self}.tabOn)",
    downloadTitle: "$compute:fluid.get({self}.downloadTitles, {self}.selectedTab)",
    // Components bearing hortis.downloadableView, each holding the `tabId` of its view and a `download` method
    views: "{vizLoader hortis.downloadableView}",
    download: "$method:hortis.bbeaViewTabs.download({self}.views, {self}.selectedTab)"
});

hortis.bbeaViewTabs.tabOn = (tabIds, selectedTab) => Object.fromEntries(tabIds.map(tabId => [tabId, tabId === selectedTab]));

hortis.bbeaViewTabs.tabIndex = tabOn => fluid.transform(tabOn, on => on ? 0 : -1);

hortis.bbeaViewTabs.panelHidden = tabOn => fluid.transform(tabOn, on => !on);

/**
 * Determine whether a particular tab of the views pane is selected.
 * @param {String} selectedTab - The id of the currently selected tab
 * @param {String} tabId - The id of the tab of interest
 * @return {Boolean} `true` if the tab is selected
 */
hortis.bbeaViewTabs.isSelected = (selectedTab, tabId) => selectedTab === tabId;

hortis.bbeaViewTabs.download = function (views, selectedTab) {
    views.find(view => view.tabId === selectedTab)?.download();
};

/**
 * Move the selection between tabs with the arrow keys.
 * @param {KeyboardEvent} event - A keydown event within the tab list
 * @param {hortis.bbeaViewTabs} that - The tabs
 */
hortis.bbeaViewTabs.keyDown = function (event, that) {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    const tab = event.target.closest(".mf-tab");
    if (step !== 0 && tab) {
        event.preventDefault();
        const tabs = [...event.currentTarget.querySelectorAll(".mf-tab")];
        const next = tabs[(tabs.indexOf(tab) + step + tabs.length) % tabs.length];
        that.selectedTab = next.dataset.tab;
        next.focus();
    }
};
</script>

<template>
    <div class="mf-tabstrip">
        <div class="mf-tabs" role="tablist" @onkeydown="hortis.bbeaViewTabs.keyDown({0}, {self})">
            <button class="mf-tab" @class="mf-tab-on:@{tabOn.net}" type="button" role="tab" aria-selected="@{tabOn.net}"
                tabindex="@{tabIndex.net}" data-tab="net" @onclick="{self}.selectedTab = net">Network</button>
            <button class="mf-tab" @class="mf-tab-on:@{tabOn.mtx}" type="button" role="tab" aria-selected="@{tabOn.mtx}"
                tabindex="@{tabIndex.mtx}" data-tab="mtx" @onclick="{self}.selectedTab = mtx">Matrix</button>
            <button class="mf-tab" @class="mf-tab-on:@{tabOn.bees}" type="button" role="tab" aria-selected="@{tabOn.bees}"
                tabindex="@{tabIndex.bees}" data-tab="bees" @onclick="{self}.selectedTab = bees">Bee list</button>
            <button class="mf-tab" @class="mf-tab-on:@{tabOn.plants}" type="button" role="tab" aria-selected="@{tabOn.plants}"
                tabindex="@{tabIndex.plants}" data-tab="plants" @onclick="{self}.selectedTab = plants">Plant list</button>
            <button class="mf-tab" @class="mf-tab-on:@{tabOn.abund}" type="button" role="tab" aria-selected="@{tabOn.abund}"
                tabindex="@{tabIndex.abund}" data-tab="abund" @onclick="{self}.selectedTab = abund">Bee abundance</button>
            <button class="mf-tab" @class="mf-tab-on:@{tabOn.seed}" type="button" role="tab" aria-selected="@{tabOn.seed}"
                tabindex="@{tabIndex.seed}" data-tab="seed" @onclick="{self}.selectedTab = seed">Seed mix evaluator</button>
        </div>
        <button class="mf-iconbtn imerss-view-download" type="button" title="@{downloadTitle}" aria-label="@{downloadTitle}"
            @onclick="{self}.download()">
            <svg width="15" height="15" aria-hidden="true"><use href="#imerss-i-download"/></svg>
        </button>
    </div>
</template>
