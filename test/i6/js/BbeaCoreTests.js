/* global QUnit, hortis */

"use strict";

fluid.registerNamespace("hortis.tests");

QUnit.module("BBEA visualisation on Infusion 6 - core dataflow");

QUnit.config.reorder = false;

// Counts evaluations of the interactions table, to verify that the dataflow diamond is evaluated once per change
hortis.tests.interactionCounts = 0;

hortis.tests.countingCount = function (...args) {
    ++hortis.tests.interactionCounts;
    return hortis.interactions.count(...args);
};

fluid.def("hortis.tests.bbeaLoader", {
    $layers: "hortis.beaVizLoader",
    taxaRows: hortis.tests.taxaRows,
    obsRows: hortis.tests.obsRows,
    // Don't fetch the index of volunteers' reports
    collectorReportLinker: {
        $component: {
            reportIndex: {}
        }
    },
    regionIndirection: {
        $component: {
            rows: hortis.tests.regionIndirectionRows
        }
    },
    obsFilters: {
        $component: {
            regionFilter: {
                $component: {
                    leadingFields: ["ecoregion"]
                }
            }
        }
    },
    interactions: {
        $component: {
            result: "$compute:hortis.tests.countingCount({self}.obsRows, {self}.plantSelection, {self}.pollSelection, {self}.rowById)"
        }
    }
});

const qs = (sel, parent) => (parent || document).querySelector(sel);
const qsa = (sel, parent) => [...(parent || document).querySelectorAll(sel)];

/**
 * Find the names of the rows displayed by a checklist.
 * @param {String} holderSelector - The selector of the checklist's holder
 * @return {String[]} The scientific names of the displayed rows, in document order
 */
hortis.tests.displayedNames = function (holderSelector) {
    return qsa(holderSelector + " .checklist-scientific-name").map(node => node.textContent);
};

hortis.tests.checkboxFor = function (holderSelector, id) {
    return qs(`${holderSelector} input.checklist-check[data-row-id="${id}"]`);
};

hortis.tests.click = function (element) {
    element.dispatchEvent(new Event("click", {bubbles: true}));
    fluid.cell.stabilize();
};

hortis.tests.change = function (element) {
    element.dispatchEvent(new Event("change", {bubbles: true}));
    fluid.cell.stabilize();
};

hortis.tests.reporterText = () => qs(".imerss-record-reporter").textContent.replace(/\s+/g, " ").trim();

QUnit.test("Initial dataflow and rendering", function (assert) {
    const that = hortis.tests.bbeaLoader();
    fluid.cell.stabilize();

    assert.equal(that.filteredObs.length, 5, "All observations pass the filters initially");
    assert.equal(that.finalFilteredObs.length, 5, "All observations pass the empty taxon selections");
    assert.equal(Object.keys(that.interactions.crossTable).length, 4, "Four distinct plant-pollinator pairs are counted");
    assert.equal(hortis.tests.reporterText(), "Displaying 5 of 5 records", "Record reporter rendered");

    assert.deepEqual(hortis.tests.displayedNames(".imerss-pollinators"), ["Anthophila", "Andrenidae", "Apidae"],
        "Bee checklist shows its root and families, with genera folded away");
    assert.deepEqual(hortis.tests.displayedNames(".imerss-plants"), ["Plantae", "Asterales", "Rosales"],
        "Plant checklist shows its root and orders");
    assert.equal(qsa(".imerss-pollinators .imerss-rank-fold option").length, 12, "Rank fold controls rendered");
    that.destroy();
});

QUnit.test("Checking a family selects its descendants and filters the interactions", function (assert) {
    const that = hortis.tests.bbeaLoader();
    fluid.cell.stabilize();

    const apidae = hortis.tests.checkboxFor(".imerss-pollinators", "10");
    apidae.checked = true;
    hortis.tests.click(apidae);

    assert.deepEqual(Object.keys(that.pollChecklist.rowSelection).sort(), ["10"],
        "Selection holds the checked family - its descendants are hidden by folding");
    assert.equal(that.pollChecklist.idToState["12"].selected, "selected", "A species within the family is selected");
    assert.equal(that.pollChecklist.idToState["1"].selected, "indeterminate", "The root is indeterminate");
    assert.equal(that.finalFilteredObs.length, 3, "Only observations of Apidae survive");
    assert.equal(hortis.tests.reporterText(), "Displaying 3 of 5 records", "Record reporter updated");

    const root = hortis.tests.checkboxFor(".imerss-pollinators", "1");
    assert.ok(root.hasAttribute("indeterminate"), "Root checkbox is rendered indeterminate");
    assert.notOk(root.hasAttribute("checked"), "Root checkbox is not rendered checked");
    assert.ok(hortis.tests.checkboxFor(".imerss-pollinators", "10").checked, "Family checkbox is checked");
    that.destroy();
});

QUnit.test("Folding", function (assert) {
    const that = hortis.tests.bbeaLoader();
    fluid.cell.stabilize();

    hortis.tests.click(qs(".imerss-pollinators .checklist-fold-control.active[data-row-id=\"10\"]"));
    assert.deepEqual(hortis.tests.displayedNames(".imerss-pollinators"), ["Anthophila", "Andrenidae", "Apidae", "Bombus"],
        "Unfolding Apidae reveals its genus");
    hortis.tests.click(qs(".imerss-pollinators .checklist-fold-control.active[data-row-id=\"11\"]"));
    assert.deepEqual(hortis.tests.displayedNames(".imerss-pollinators"),
        ["Anthophila", "Andrenidae", "Apidae", "Bombus", "Bombus mixtus", "Bombus vosnesenskii"], "Unfolding Bombus reveals its species");
    assert.equal(Object.keys(that.pollChecklist.rowSelection).length, 7, "With nothing selected, every displayed row and NO_TAXON is selected");

    that.pollChecklist.foldToRank("family", false);
    fluid.cell.stabilize();
    assert.deepEqual(hortis.tests.displayedNames(".imerss-pollinators"), ["Anthophila", "Andrenidae", "Apidae"],
        "Collapsing to family hides the genera");
    that.destroy();
});

QUnit.test("Filters narrow the checklists, which keep their selections", function (assert) {
    const that = hortis.tests.bbeaLoader();
    fluid.cell.stabilize();

    const apidae = hortis.tests.checkboxFor(".imerss-pollinators", "10");
    apidae.checked = true;
    hortis.tests.click(apidae);

    // The sex filter's checkboxes are bound two-way to its filterState - female is the first
    const female = qsa(".imerss-bbea-filters input")[0];
    female.checked = true;
    hortis.tests.change(female);
    assert.deepEqual(that.obsFilters.sexFilter.filterState, {male: false, female: true}, "Sex filter state written back from the DOM");
    assert.equal(that.filteredObs.length, 3, "Three observations are of females");
    assert.equal(that.finalFilteredObs.length, 2, "Two of them are of Apidae");

    // Each month's checkbox is bound two-way to its record in the phenology filter's state, through its $for
    const june = qsa(".imerss-phenology-filter input")[5];
    june.checked = true;
    hortis.tests.change(june);
    assert.equal(that.obsFilters.phenologyFilter.filterState[5].checked, true, "June written through to the phenology filter's state");
    assert.equal(that.filteredObs.length, 1, "One female observation in June");
    assert.deepEqual(hortis.tests.displayedNames(".imerss-pollinators"), ["Anthophila", "Apidae"], "Andrenidae has left the bee checklist");
    assert.equal(that.finalFilteredObs.length, 1, "The June observation is of Apidae");

    hortis.tests.interactionCounts = 0;
    june.checked = false;
    hortis.tests.change(june);
    assert.equal(hortis.tests.interactionCounts, 1, "The interactions table, reached by several paths, is evaluated once for the change");
    assert.deepEqual(hortis.tests.displayedNames(".imerss-pollinators"), ["Anthophila", "Andrenidae", "Apidae"], "Andrenidae has returned");
    assert.equal(that.pollChecklist.idToState["10"].selected, "selected", "Apidae is still selected");
    assert.equal(that.finalFilteredObs.length, 2, "Selection of Apidae still applies");
    assert.equal(that.obsFilters.sexFilter.filterSummary.count, 1, "Sex filter summarises one selected sex");
    that.destroy();
});

QUnit.test("Reset control", function (assert) {
    const that = hortis.tests.bbeaLoader();
    fluid.cell.stabilize();

    const apidae = hortis.tests.checkboxFor(".imerss-pollinators", "10");
    apidae.checked = true;
    hortis.tests.click(apidae);
    that.obsFilters.sexFilter.filterState.male = true;
    fluid.cell.stabilize();
    assert.equal(that.finalFilteredObs.length, 1, "One observation of a male of Apidae");

    hortis.tests.click(qs(".imerss-reset-filter"));
    assert.equal(that.finalFilteredObs.length, 5, "Every observation survives after reset");
    assert.notOk(hortis.tests.checkboxFor(".imerss-pollinators", "10").checked, "Family checkbox is unchecked");
    assert.notOk(qsa(".imerss-bbea-filters input")[1].checked, "Male checkbox is unchecked");
    that.destroy();
});

hortis.tests.input = function (element, value) {
    element.value = value;
    element.dispatchEvent(new Event("input", {bubbles: true}));
    fluid.cell.stabilize();
};

QUnit.test("Grouped region filter", function (assert) {
    const that = hortis.tests.bbeaLoader();
    fluid.cell.stabilize();
    const groupNames = () => qsa(".imerss-region-filter .mf-group-name").map(node => node.textContent);
    assert.deepEqual(groupNames(), ["ecoregion", "county"], "Leading field's group listed first");
    const groupBody = index => qs(`.imerss-region-filter .mf-group[data-group="${index}"] .mf-group-body`);
    assert.ok(groupBody(0).hidden, "Groups are initially folded");

    hortis.tests.click(qs(".imerss-region-filter .mf-group-head[data-group=\"0\"]"));
    assert.notOk(groupBody(0).hidden, "Clicking a group's head unfolds it");

    const cascades = qs(".imerss-region-filter .imerss-region-check[data-row-id=\"2\"]");
    cascades.checked = true;
    hortis.tests.change(cascades);
    assert.equal(that.filteredObs.length, 2, "Two observations in the Cascades");
    const benton = qs(".imerss-region-filter .imerss-region-check[data-row-id=\"0\"]");
    benton.checked = true;
    hortis.tests.change(benton);
    assert.equal(that.filteredObs.length, 1, "Selections in different groups are ANDed");
    assert.equal(qs(".imerss-region-filter .mf-group[data-group=\"1\"] .mf-group-state").textContent, "1", "Group badge counts its selections");
    assert.equal(that.obsFilters.regionFilter.filterSummary.count, 2, "Filter summarises two selected regions");

    hortis.tests.input(qs(".imerss-region-filter .imerss-region-search"), "lin");
    assert.equal(that.obsFilters.regionFilter.query, "lin", "Search box written back to the query");
    assert.ok(qs(".imerss-region-filter .mf-group[data-group=\"0\"]").hidden, "A group without matches is hidden whilst searching");
    assert.notOk(groupBody(1).hidden, "A group with matches is unfolded whilst searching");
    const visibleRows = qsa(".imerss-region-filter .mf-group[data-group=\"1\"] .mf-check:not(.mf-check-hidden)").map(node => node.textContent);
    assert.deepEqual(visibleRows, ["Linn"], "Only matching regions are shown");

    that.obsFilters.regionFilter.reset();
    fluid.cell.stabilize();
    assert.equal(that.filteredObs.length, 5, "Reset restores every observation");
    assert.equal(qs(".imerss-region-filter .imerss-region-search").value, "", "Reset clears the search box");
    that.destroy();
});

QUnit.test("Collector filter", function (assert) {
    const that = hortis.tests.bbeaLoader();
    fluid.cell.stabilize();
    const collector = that.obsFilters.collectorFilter;
    let suggestions;
    collector.queryAutocomplete("bab", results => suggestions = results);
    assert.deepEqual(suggestions, ["Charles Babbage"], "Collectors split from multiple recorders are suggested");
    collector.queryAutocomplete("ba", results => suggestions = results);
    assert.deepEqual(suggestions, [], "No suggestions for fewer than three characters");

    const clear = qs(".imerss-collector-filter .imerss-filter-clear");
    assert.ok(clear.classList.contains("fl-hidden"), "Clear control hidden whilst no collector is chosen");
    collector.confirmAutocomplete("Charles Babbage");
    fluid.cell.stabilize();
    assert.equal(that.filteredObs.length, 2, "Observations filtered to the chosen collector");
    assert.notOk(clear.classList.contains("fl-hidden"), "Clear control shown");
    hortis.tests.click(clear);
    assert.equal(that.filteredObs.length, 5, "Clear control resets the filter");
    that.destroy();
});

QUnit.test("Elevation filter", function (assert) {
    const that = hortis.tests.bbeaLoader();
    fluid.cell.stabilize();
    const elevation = that.obsFilters.elevationFilter;
    assert.deepEqual({...elevation.dualRangeInput.range}, {min: 100, max: 1500}, "Range tracks the elevations in the data");
    assert.deepEqual(qsa(".imerss-elevation-filter .dual-range-values span").map(node => node.textContent), ["100 m", "100 - 1500 m", "1500 m"],
        "Range rendered");
    assert.equal(elevation.filterSummary.count, 0, "Filter is inactive over the full range");

    hortis.tests.input(qs(".imerss-elevation-filter .dual-range-max"), "950");
    assert.equal(elevation.dualRangeInput.range.max, 950, "Moving the upper input narrows the range");
    assert.equal(that.filteredObs.length, 4, "Observations above 950 m are excluded");
    assert.equal(elevation.filterSummary.count, 1, "Filter summarises its narrowed range");

    elevation.reset();
    fluid.cell.stabilize();
    assert.equal(that.filteredObs.length, 5, "Reset restores the full range");
    that.destroy();
});

QUnit.test("Checklist search selects the chosen taxon", function (assert) {
    const that = hortis.tests.bbeaLoader();
    fluid.cell.stabilize();
    const search = that.pollChecklist.search;
    let suggestions;
    search.queryAutocomplete("bombus", results => suggestions = results);
    assert.deepEqual(suggestions.map(row => row.id), ["11", "12", "13"], "Displayed taxa matching the query are suggested");
    search.confirmAutocomplete(suggestions[1]);
    fluid.cell.stabilize();
    assert.equal(that.pollChecklist.idToState["12"].selected, "selected", "Chosen taxon is selected");
    assert.notEqual(that.pollChecklist.idToState["11"].folded, "folded", "Its genus is unfolded to show it");
    assert.equal(that.finalFilteredObs.length, 2, "Observations filtered to the chosen taxon");
    that.destroy();
});
