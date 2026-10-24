/* global QUnit, hortis */

"use strict";

fluid.registerNamespace("hortis.tests");

QUnit.module("BBEA visualisation on Infusion 6 - shell and views");

QUnit.config.reorder = false;

fluid.def("hortis.tests.viewsLoader", {
    $layers: "hortis.beaVizLoader",
    taxaRows: hortis.tests.taxaRows,
    obsRows: hortis.tests.obsRows,
    regionIndirection: {
        $component: {
            rows: hortis.tests.regionIndirectionRows
        }
    },
    collectorReportLinker: {
        $component: {
            reportIndex: {
                "Charles Babbage": [{state: "OR", year: 2024, report: "babbage-2024.html"}]
            }
        }
    }
});

const qs = (sel, parent) => (parent || document).querySelector(sel);
const qsa = (sel, parent) => [...(parent || document).querySelectorAll(sel)];

hortis.tests.dispatch = function (element, type, init) {
    element.dispatchEvent(new MouseEvent(type, {bubbles: true, ...init}));
    fluid.cell.stabilize();
};

hortis.tests.selectTab = function (tabId) {
    hortis.tests.dispatch(qs(`.mf-tab[data-tab="${tabId}"]`), "click");
};

hortis.tests.panel = tabId => qs(`[data-panel="${tabId}"]`);

QUnit.test("Filter concertina", function (assert) {
    const that = hortis.tests.viewsLoader();
    fluid.cell.stabilize();
    const head = qs(".mf-facet[data-facet=\"bees\"] .mf-facet-head");
    const body = qs("#mf-f-bees");
    assert.ok(body.hidden, "Section initially closed");
    hortis.tests.dispatch(head, "click");
    assert.notOk(body.hidden, "Clicking its head opens a section");
    assert.equal(head.getAttribute("aria-expanded"), "true", "Head reports the section open");
    hortis.tests.dispatch(qs(".imerss-collapse-facets"), "click");
    assert.ok(body.hidden, "Collapse all closes every section");

    const badge = qs(".mf-facet[data-facet=\"bees\"] [data-state]");
    assert.ok(badge.hidden, "No badge whilst no bee filter is active");
    that.obsFilters.sexFilter.filterState.female = true;
    that.pollChecklist.check("10", true);
    fluid.cell.stabilize();
    assert.notOk(badge.hidden, "Badge shown once filters within the section are active");
    assert.equal(badge.textContent, "2", "Badge sums the sex filter and the bee checklist's selections");
    const elevationBadge = qs(".mf-facet[data-facet=\"elevation\"] [data-state]");
    that.obsFilters.elevationFilter.dualRangeInput.range.max = 500;
    fluid.cell.stabilize();
    assert.ok(elevationBadge.classList.contains("mf-facet-state-dot"), "The elevation filter's badge is a plain marker");
    that.destroy();
});

QUnit.test("View tabs and download", function (assert) {
    const that = hortis.tests.viewsLoader();
    fluid.cell.stabilize();
    assert.notOk(hortis.tests.panel("net").hidden, "Network panel shown initially");
    assert.ok(hortis.tests.panel("mtx").hidden, "Matrix panel hidden initially");
    hortis.tests.selectTab("mtx");
    assert.equal(that.viewTabs.selectedTab, "mtx", "Tab selected");
    assert.ok(hortis.tests.panel("net").hidden, "Network panel hidden");
    assert.notOk(hortis.tests.panel("mtx").hidden, "Matrix panel shown");
    assert.equal(qs(".imerss-view-download").getAttribute("title"), "Download the interaction counts as CSV", "Download button retitled");

    const downloads = [];
    const original = hortis.downloadCSV;
    hortis.downloadCSV = (headers, rows, filename) => downloads.push({headers, rows, filename});
    hortis.tests.selectTab("bees");
    hortis.tests.dispatch(qs(".imerss-view-download"), "click");
    hortis.downloadCSV = original;
    assert.equal(downloads.length, 1, "Download button downloads the selected view");
    assert.equal(downloads[0].filename, "bees.csv", "The bee list is downloaded");
    assert.deepEqual(downloads[0].rows.map(row => row[0]).sort(), ["Andrena nigrihirta", "Bombus mixtus", "Bombus vosnesenskii"],
        "The download lists each bee species");
    that.destroy();
});

QUnit.test("Interaction matrix and its tooltips", function (assert) {
    const that = hortis.tests.viewsLoader();
    fluid.cell.stabilize();
    hortis.tests.selectTab("mtx");
    const labels = qsa(".imerss-plant-names .imerss-int-label").map(node => node.textContent);
    // With nothing selected, observations are counted against the displayed rows, beneath which the species are folded away
    assert.deepEqual(labels, ["Rosales", "Asterales"], "Plant orders labelled in order of their counts");
    assert.deepEqual(qsa(".imerss-poll-names .imerss-int-label").map(node => node.textContent), ["Apidae", "Andrenidae"], "Bee families labelled");
    assert.equal(that.drawInteractions.bipartiteRows.length, 4, "One bipartite row per plant-pollinator pair");

    hortis.tests.dispatch(qs(".imerss-plant-names .imerss-int-label"), "mouseover", {clientX: 10, clientY: 10});
    const tooltip = qsa(".imerss-tooltip-holder").find(node => !node.hidden);
    assert.ok(tooltip, "A tooltip is shown when hovering a taxon's label");
    assert.ok(tooltip.textContent.includes("Rosales"), "Tooltip names the taxon");
    hortis.tests.dispatch(qs(".imerss-plant-counts .imerss-int-count"), "mouseover", {clientX: 10, clientY: 10});
    assert.ok(tooltip.textContent.includes("Observation count: 3"), "Hovering a count bar shows its count");
    hortis.tests.dispatch(qs(".imerss-interactions-holder"), "mouseleave");
    assert.ok(tooltip.hidden, "Tooltip hidden when the pointer leaves the matrix");

    that.pollChecklist.check("10", true);
    fluid.cell.stabilize();
    assert.equal(qsa(".imerss-poll-names .imerss-int-label").length, 1, "Selecting Apidae counts its interactions against the family");
    that.destroy();
});

QUnit.test("Taxon lists", function (assert) {
    const that = hortis.tests.viewsLoader();
    fluid.cell.stabilize();
    hortis.tests.selectTab("bees");
    const bees = qs(".imerss-bee-list");
    assert.deepEqual(qsa(".mf-famhead span", bees).map(node => node.textContent), ["Apidae", "Andrenidae"],
        "Families ordered by their numbers of observations");
    assert.equal(qsa(".mf-taxon-name", bees).length, 3, "Each bee species listed");
    assert.ok(qs(".mf-listbar-count", bees).textContent.includes("5 observations"), "Totals rendered");
    hortis.tests.dispatch(qs(".mf-seg-btn[data-arrange=\"flat\"]", bees), "click");
    assert.equal(that.beeList.arrange, "flat", "Arrangement switched");
    assert.equal(qsa(".mf-famhead", bees).length, 0, "No family headings in the flat arrangement");
    assert.deepEqual(qsa(".mf-taxon-name", bees).map(node => node.textContent), ["Andrena nigrihirta", "Bombus mixtus", "Bombus vosnesenskii"],
        "Species listed alphabetically");

    that.obsFilters.sexFilter.filterState.male = true;
    fluid.cell.stabilize();
    assert.equal(qsa(".mf-taxon-name", bees).length, 2, "List follows the filters");
    assert.equal(qs(".imerss-plant-list .mf-listbody").textContent, "", "The plant list, not showing, has not rendered");
    that.destroy();
});

QUnit.test("Bee abundance", function (assert) {
    const that = hortis.tests.viewsLoader();
    fluid.cell.stabilize();
    hortis.tests.selectTab("abund");
    assert.equal(qsa(".imerss-bee-abundance svg.mf-chart").length, 3, "Charts drawn for families, genera and species");
    assert.deepEqual(qsa(".imerss-bee-abundance .mf-key > span > span").map(node => node.textContent), ["Apidae", "Andrenidae"],
        "Family key drawn");
    that.destroy();
});

QUnit.test("Seed mix evaluator", function (assert) {
    const that = hortis.tests.viewsLoader();
    fluid.cell.stabilize();
    hortis.tests.selectTab("seed");
    const seed = qs(".imerss-seed-mix");
    assert.ok(qs(".mf-seednote", seed).textContent.startsWith("No site is defined"), "With no filters there is no site");
    assert.equal(qsa("input[data-seed]", seed).length, 2, "Both plants are candidates");
    const rosa = qs("input[data-seed=\"103\"]", seed);
    rosa.checked = true;
    rosa.dispatchEvent(new Event("change", {bubbles: true}));
    fluid.cell.stabilize();
    assert.deepEqual({...that.seedMix.added}, {"103": true}, "Ticking a plant adds it to the mix");
    assert.ok(qs(".mf-seedread", seed).textContent.startsWith("3 of 3 bee species supported"), "Rosa nutkana supports every bee");

    that.obsFilters.regionFilter.filterState = {2: true}; // Cascades
    fluid.cell.stabilize();
    assert.ok(qs(".mf-seednote", seed).textContent.startsWith("Plants recorded under the current filters"), "A region defines a site");
    assert.ok(qs("input[data-seed=\"203\"]", seed).hasAttribute("checked"), "The plant recorded there is established and ticked");
    hortis.tests.dispatch(qs(".imerss-seed-reset", seed), "click");
    assert.deepEqual({...that.seedMix.added}, {}, "Reset clears the added plants");
    that.destroy();
});

QUnit.test("Collector reports and grips", function (assert) {
    const that = hortis.tests.viewsLoader();
    fluid.cell.stabilize();
    const report = qs(".imerss-collector-report");
    assert.ok(report.classList.contains("fl-hidden"), "Reports hidden whilst no collector is chosen");
    that.obsFilters.collectorFilter.confirmAutocomplete("Charles Babbage");
    fluid.cell.stabilize();
    assert.notOk(report.classList.contains("fl-hidden"), "Reports shown for a collector who has them");
    assert.equal(qs("a", report).getAttribute("href"), "https://oregon-bee-project.github.io/melittoflora/reports/babbage-2024.html",
        "Report linked");
    assert.equal(qs("a", report).textContent, "Charles Babbage OR Summary (2024)", "Report link labelled");

    const grip = qs("#mf-grip-filters");
    grip.dispatchEvent(new KeyboardEvent("keydown", {key: "Enter", bubbles: true}));
    assert.ok(qs(".mf-shell").classList.contains("mf-f-closed"), "Enter on a grip collapses its pane");
    assert.equal(qs(".mf-grip-tab", grip).getAttribute("aria-label"), "Expand filters", "Grip's tab relabelled");
    that.destroy();
    fluid.cell.stabilize();
    grip.dispatchEvent(new KeyboardEvent("keydown", {key: "Enter", bubbles: true}));
    assert.ok(qs(".mf-shell").classList.contains("mf-f-closed"), "Grip unbound on destruction");
});
