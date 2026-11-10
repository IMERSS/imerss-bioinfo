/* global QUnit, hortis */

"use strict";

fluid.registerNamespace("hortis.tests");

QUnit.module("BBEA visualisation on Infusion 6 - core dataflow", {before: hortis.tests.loadAllImports});

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
    collectorFacet: {
        $component: {
            body: {
                $component: {
                    collectorReportLinker: {
                        $component: {
                            reportIndex: {}
                        }
                    }
                }
            }
        }
    },
    regionIndirection: {
        $component: {
            rows: hortis.tests.regionIndirectionRows
        }
    },
    regionLeadingFields: ["ecoregion"],
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
    const that = hortis.tests.bbeaLoader({container: hortis.tests.root()});
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
    const that = hortis.tests.bbeaLoader({container: hortis.tests.root()});
    fluid.cell.stabilize();

    const apidae = hortis.tests.checkboxFor(".imerss-pollinators", "10");
    apidae.checked = true;
    hortis.tests.click(apidae);

    assert.deepEqual(Object.keys(that.beeFacet.body.pollChecklist.rowSelection).sort(), ["10"],
        "Selection holds the checked family - its descendants are hidden by folding");
    assert.equal(that.beeFacet.body.pollChecklist.idToState["12"].selected, "selected", "A species within the family is selected");
    assert.equal(that.beeFacet.body.pollChecklist.idToState["1"].selected, "indeterminate", "The root is indeterminate");
    assert.equal(that.finalFilteredObs.length, 3, "Only observations of Apidae survive");
    assert.equal(hortis.tests.reporterText(), "Displaying 3 of 5 records", "Record reporter updated");

    const root = hortis.tests.checkboxFor(".imerss-pollinators", "1");
    assert.ok(root.hasAttribute("indeterminate"), "Root checkbox is rendered indeterminate");
    assert.notOk(root.hasAttribute("checked"), "Root checkbox is not rendered checked");
    assert.ok(hortis.tests.checkboxFor(".imerss-pollinators", "10").checked, "Family checkbox is checked");
    that.destroy();
});

QUnit.test("Folding", function (assert) {
    const that = hortis.tests.bbeaLoader({container: hortis.tests.root()});
    fluid.cell.stabilize();

    hortis.tests.click(qs(".imerss-pollinators .checklist-fold-control.active[data-row-id=\"10\"]"));
    assert.deepEqual(hortis.tests.displayedNames(".imerss-pollinators"), ["Anthophila", "Andrenidae", "Apidae", "Bombus"],
        "Unfolding Apidae reveals its genus");
    hortis.tests.click(qs(".imerss-pollinators .checklist-fold-control.active[data-row-id=\"11\"]"));
    assert.deepEqual(hortis.tests.displayedNames(".imerss-pollinators"),
        ["Anthophila", "Andrenidae", "Apidae", "Bombus", "Bombus mixtus", "Bombus vosnesenskii"], "Unfolding Bombus reveals its species");
    assert.equal(Object.keys(that.beeFacet.body.pollChecklist.rowSelection).length, 7, "With nothing selected, every displayed row and NO_TAXON is selected");

    that.beeFacet.body.pollChecklist.foldToRank("family", false);
    fluid.cell.stabilize();
    assert.deepEqual(hortis.tests.displayedNames(".imerss-pollinators"), ["Anthophila", "Andrenidae", "Apidae"],
        "Collapsing to family hides the genera");
    that.destroy();
});

QUnit.test("Filters narrow the checklists, which keep their selections", function (assert) {
    const that = hortis.tests.bbeaLoader({container: hortis.tests.root()});
    fluid.cell.stabilize();

    const apidae = hortis.tests.checkboxFor(".imerss-pollinators", "10");
    apidae.checked = true;
    hortis.tests.click(apidae);

    // The sex filter's checkboxes are bound two-way to its filterState - female is the first
    const female = qsa(".imerss-sex-filter input")[0];
    female.checked = true;
    hortis.tests.change(female);
    assert.deepEqual(that.beeFacet.body.pollChecklist.extraFilter.filterState, {male: false, female: true}, "Sex filter state written back from the DOM");
    assert.equal(that.filteredObs.length, 3, "Three observations are of females");
    assert.equal(that.finalFilteredObs.length, 2, "Two of them are of Apidae");

    // Each month's checkbox is bound two-way to its record in the phenology filter's state, through its $for
    const june = qsa(".imerss-phenology-filter input")[5];
    june.checked = true;
    hortis.tests.change(june);
    assert.equal(that.phenologyFacet.body.phenologyFilter.filterState.months[5].checked, true, "June written through to the phenology filter's state");
    assert.equal(that.filteredObs.length, 1, "One female observation in June");
    assert.deepEqual(hortis.tests.displayedNames(".imerss-pollinators"), ["Anthophila", "Apidae"], "Andrenidae has left the bee checklist");
    assert.equal(that.finalFilteredObs.length, 1, "The June observation is of Apidae");

    hortis.tests.interactionCounts = 0;
    june.checked = false;
    hortis.tests.change(june);
    assert.equal(hortis.tests.interactionCounts, 1, "The interactions table, reached by several paths, is evaluated once for the change");
    assert.deepEqual(hortis.tests.displayedNames(".imerss-pollinators"), ["Anthophila", "Andrenidae", "Apidae"], "Andrenidae has returned");
    assert.equal(that.beeFacet.body.pollChecklist.idToState["10"].selected, "selected", "Apidae is still selected");
    assert.equal(that.finalFilteredObs.length, 2, "Selection of Apidae still applies");
    assert.equal(that.beeFacet.body.pollChecklist.extraFilter.filterSummary.count, 1, "Sex filter summarises one selected sex");
    that.destroy();
});

QUnit.test("Reset control", function (assert) {
    const that = hortis.tests.bbeaLoader({container: hortis.tests.root()});
    fluid.cell.stabilize();

    const apidae = hortis.tests.checkboxFor(".imerss-pollinators", "10");
    apidae.checked = true;
    hortis.tests.click(apidae);
    that.beeFacet.body.pollChecklist.extraFilter.filterState.male = true;
    fluid.cell.stabilize();
    assert.equal(that.finalFilteredObs.length, 1, "One observation of a male of Apidae");

    hortis.tests.click(qs(".imerss-reset-filter"));
    assert.equal(that.finalFilteredObs.length, 5, "Every observation survives after reset");
    assert.notOk(hortis.tests.checkboxFor(".imerss-pollinators", "10").checked, "Family checkbox is unchecked");
    assert.notOk(qsa(".imerss-sex-filter input")[1].checked, "Male checkbox is unchecked");
    that.destroy();
});

hortis.tests.input = function (element, value) {
    element.value = value;
    element.dispatchEvent(new Event("input", {bubbles: true}));
    fluid.cell.stabilize();
};

QUnit.test("Grouped region filter", function (assert) {
    const that = hortis.tests.bbeaLoader({container: hortis.tests.root()});
    fluid.cell.stabilize();
    const groupNames = () => qsa(".imerss-region-filter .imerss-group-name").map(node => node.textContent);
    assert.deepEqual(groupNames(), ["ecoregion", "county"], "Leading field's group listed first");
    const groupBody = index => qs(`.imerss-region-filter .imerss-group[data-group="${index}"] .imerss-group-body`);
    assert.ok(groupBody(0).hidden, "Groups are initially folded");

    hortis.tests.click(qs(".imerss-region-filter .imerss-group-head[data-group=\"0\"]"));
    assert.notOk(groupBody(0).hidden, "Clicking a group's head unfolds it");

    const cascades = qs(".imerss-region-filter .imerss-region-check[data-row-id=\"2\"]");
    cascades.checked = true;
    hortis.tests.change(cascades);
    assert.equal(that.filteredObs.length, 2, "Two observations in the Cascades");
    const benton = qs(".imerss-region-filter .imerss-region-check[data-row-id=\"0\"]");
    benton.checked = true;
    hortis.tests.change(benton);
    assert.equal(that.filteredObs.length, 1, "Selections in different groups are ANDed");
    assert.equal(qs(".imerss-region-filter .imerss-group[data-group=\"1\"] .imerss-group-state").textContent, "1", "Group badge counts its selections");
    assert.equal(that.regionFacet.body.regionFilter.filterSummary.count, 2, "Filter summarises two selected regions");

    hortis.tests.input(qs(".imerss-region-filter .imerss-region-search"), "lin");
    assert.equal(that.regionFacet.body.regionFilter.query, "lin", "Search box written back to the query");
    assert.ok(qs(".imerss-region-filter .imerss-group[data-group=\"0\"]").hidden, "A group without matches is hidden whilst searching");
    assert.notOk(groupBody(1).hidden, "A group with matches is unfolded whilst searching");
    const visibleRows = qsa(".imerss-region-filter .imerss-group[data-group=\"1\"] .imerss-check:not(.imerss-check-hidden)").map(node => node.textContent);
    assert.deepEqual(visibleRows, ["Linn"], "Only matching regions are shown");

    that.regionFacet.body.regionFilter.reset();
    fluid.cell.stabilize();
    assert.equal(that.filteredObs.length, 5, "Reset restores every observation");
    assert.equal(qs(".imerss-region-filter .imerss-region-search").value, "", "Reset clears the search box");
    that.destroy();
});

QUnit.test("Collector filter", function (assert) {
    const that = hortis.tests.bbeaLoader({container: hortis.tests.root()});
    fluid.cell.stabilize();
    const collector = that.collectorFacet.body.collectorFilter;
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
    const that = hortis.tests.bbeaLoader({container: hortis.tests.root()});
    fluid.cell.stabilize();
    const elevation = that.elevationFacet.body.elevationFilter;
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
    const that = hortis.tests.bbeaLoader({container: hortis.tests.root()});
    fluid.cell.stabilize();
    const search = that.beeFacet.body.pollChecklist.search;
    let suggestions;
    search.queryAutocomplete("bombus", results => suggestions = results);
    assert.deepEqual(suggestions.map(row => row.id), ["11", "12", "13"], "Displayed taxa matching the query are suggested");
    search.confirmAutocomplete(suggestions[1]);
    fluid.cell.stabilize();
    assert.equal(that.beeFacet.body.pollChecklist.idToState["12"].selected, "selected", "Chosen taxon is selected");
    assert.notEqual(that.beeFacet.body.pollChecklist.idToState["11"].folded, "folded", "Its genus is unfolded to show it");
    assert.equal(that.finalFilteredObs.length, 2, "Observations filtered to the chosen taxon");
    that.destroy();
});

QUnit.test("Filter states are held in the URL", function (assert) {
    const that = hortis.tests.bbeaLoader({container: hortis.tests.root()});
    fluid.cell.stabilize();
    const hashManager = fluid.hashManager.instance;
    const hash = () => ({...hashManager.hash});
    assert.deepEqual(hash(), {}, "Nothing is held in the URL whilst no filter is active");

    const checklist = that.beeFacet.body.pollChecklist;
    checklist.check("10", true);
    fluid.cell.stabilize();
    assert.deepEqual(hash(), {bees: "10"}, "Selecting a family holds its id alone, and not those of its descendants");
    checklist.check("13", false);
    fluid.cell.stabilize();
    assert.equal(hash().bees, "12", "Deselecting a species within the family holds its selected sibling in place of the family");
    checklist.reset();

    const elevation = that.elevationFacet.body.elevationFilter;
    hortis.tests.input(qs(".imerss-elevation-filter .dual-range-max"), "950");
    assert.equal(hash().elevation, "100,950", "Moving the dual range input writes the elevation range through its lens to the URL");
    assert.deepEqual(elevation.filterState, {lower: 100, upper: 950}, "The filter's state is a view of its entry in the URL");
    elevation.reset();
    fluid.cell.stabilize();
    assert.equal(hash().elevation, undefined, "Resetting the filter removes its entry from the URL");
    assert.deepEqual({...elevation.dualRangeInput.range}, {min: 100, max: 1500}, "Input returns to the full range");

    const june = qsa(".imerss-phenology-filter input")[5];
    june.checked = true;
    hortis.tests.change(june);
    assert.equal(hash().phenology, "6", "Checking a month holds its number in the URL");
    checklist.extraFilter.filterState.female = true;
    fluid.cell.stabilize();
    assert.equal(hash().sex, "female", "Checking a sex holds its name in the URL");
    that.collectorFacet.body.collectorFilter.confirmAutocomplete("Charles Babbage");
    fluid.cell.stabilize();
    assert.equal(hash().collector, "Charles Babbage", "Choosing a collector holds the name in the URL");

    // As when the user navigates the URL's history
    hashManager.hash = {region: "2", elevation: "200,800", plants: "103"};
    fluid.cell.stabilize();
    assert.deepEqual({...that.regionFacet.body.regionFilter.filterState}, {2: true}, "Region filter follows the URL");
    assert.deepEqual({...elevation.dualRangeInput.range}, {min: 200, max: 800}, "Elevation filter's input follows the URL through both lenses");
    assert.deepEqual({...that.plantFacet.body.plantChecklist.filterState}, {103: true}, "Plant checklist follows the URL");
    assert.equal(that.collectorFacet.body.collectorFilter.filterState, null, "Filter absent from the URL reverts to its empty state");
    assert.equal(that.phenologyFacet.body.phenologyFilter.filterState.months[5].checked, false, "Month absent from the URL is unchecked");
    that.destroy();
});

QUnit.test("Phenology filter chooses months or a period, exclusively", function (assert) {
    const that = hortis.tests.bbeaLoader({container: hortis.tests.root()});
    fluid.cell.stabilize();
    const hashManager = fluid.hashManager.instance;
    const hash = () => ({...hashManager.hash});
    const phenology = that.phenologyFacet.body.phenologyFilter;
    const toDay = hortis.phenologyFilter.toDay;
    const months = () => qsa(".imerss-phenology-months input");
    const minInput = qs(".imerss-phenology-period .dual-range-min"),
        maxInput = qs(".imerss-phenology-period .dual-range-max");

    assert.deepEqual({...phenology.dualRangeInput.range}, {min: toDay("2024-04-20"), max: toDay("2024-07-03")},
        "The period spans the observations' days");
    assert.deepEqual([...qsa(".imerss-phenology-period .dual-range-thumb-label")].map(label => label.textContent),
        ["20 Apr 24", "3 Jul 24"], "Each end of the period is shown as its day");
    assert.deepEqual(phenology.dualRangeInput.ticks, [toDay("2024-05-01"), toDay("2024-06-01"), toDay("2024-07-01")],
        "A detent is marked at the first day of each month within the period");
    assert.ok(!minInput.disabled && !months()[5].disabled, "Neither mode is disabled before either is operated");

    hortis.tests.input(maxInput, String(toDay("2024-06-15")));
    assert.deepEqual(phenology.filterState.days, {lower: toDay("2024-04-20"), upper: toDay("2024-06-15")},
        "Moving the input chooses a period, written through its lens to the filter's state");
    assert.equal(hash().phenology, "2024-04-20~2024-06-15", "The period is held in the URL as its first and last days");
    assert.equal(that.filteredObs.length, 4, "Four observations fall within the period");
    assert.equal(qs(".imerss-phenology-period .dual-range-thumb-max").textContent, "15 Jun 24", "The end slid shows its day");
    assert.ok(months().every(input => input.disabled), "Choosing a period disables the months");
    assert.ok(!minInput.disabled, "The period's input is not disabled");
    assert.equal(phenology.filterSummary.count, 1, "The filter summarises its period");

    phenology.reset();
    fluid.cell.stabilize();
    assert.equal(hash().phenology, undefined, "Resetting the filter removes its period from the URL");
    assert.ok(months().every(input => !input.disabled), "Resetting the filter enables the months");

    const june = months()[5];
    june.checked = true;
    hortis.tests.change(june);
    assert.ok(minInput.disabled && maxInput.disabled, "Checking a month disables the period's input");
    assert.equal(hash().phenology, "6", "The month is held in the URL");

    // As when the user navigates the URL's history
    hashManager.hash = {phenology: "2024-05-01~2024-06-30"};
    fluid.cell.stabilize();
    assert.deepEqual({...phenology.dualRangeInput.range}, {min: toDay("2024-05-01"), max: toDay("2024-06-30")},
        "The period's input follows the URL through both lenses");
    assert.ok(!june.checked && june.disabled, "The month is cleared and disabled by a period in the URL");
    assert.equal(that.filteredObs.length, 2, "Two observations fall within the period from the URL");
    that.destroy();
});

QUnit.test("Codecs of filter states", function (assert) {
    const codecs = hortis.urlCodecs;
    assert.deepEqual(codecs.keys.decode(codecs.keys.encode({a: true, b: false, c: true})), {a: true, c: true}, "Keys round trip");
    assert.equal(codecs.keys.encode({}), undefined, "Empty hash of keys is held as nothing");
    assert.deepEqual(hortis.sexFilter.urlCodec.decode(undefined), {male: false, female: false}, "Flags decode to every flag");
    assert.deepEqual(codecs.range.decode("1,2"), {lower: 1, upper: 2}, "Range decodes");
    assert.equal(codecs.range.decode("junk"), null, "Malformed range decodes to none");
    const features = [{geometry: {type: "Polygon", coordinates: [[[-123.1234567, 49.1], [-123.2, 49.3], [-123, 49.2], [-123.1234567, 49.1]]]}},
        {geometry: {type: "Polygon", coordinates: [[[1, 2], [3, 4], [5, 6], [1, 2]]]}}];
    const wkt = codecs.polygons.encode(features);
    assert.equal(wkt, "MULTIPOLYGON(((-123.12346 49.1,-123.2 49.3,-123 49.2,-123.12346 49.1)),((1 2,3 4,5 6,1 2)))", "Polygons encoded as WKT");
    assert.deepEqual(codecs.polygons.decode(wkt).map(feature => feature.geometry.coordinates),
        [[[[-123.12346, 49.1], [-123.2, 49.3], [-123, 49.2], [-123.12346, 49.1]]], [[[1, 2], [3, 4], [5, 6], [1, 2]]]], "WKT decoded to polygons");
    assert.equal(codecs.polygons.encode([features[1]]), "POLYGON((1 2,3 4,5 6,1 2))", "A single polygon is a POLYGON");
    assert.deepEqual(hortis.phenologyFilter.urlCodec.decode("1,12").months.filter(range => range.checked).map(range => range.month),
        ["January", "December"], "Months decoded by number");
    const period = hortis.phenologyFilter.urlCodec.decode("2024-04-01~2024-06-15");
    assert.equal(hortis.phenologyFilter.urlCodec.encode(period), "2024-04-01~2024-06-15", "Period round trips");
    assert.ok(period.months.every(range => !range.checked), "A period checks no month");
    assert.equal(hortis.phenologyFilter.urlCodec.decode("junk~").days, null, "Malformed period decodes to none");
    assert.equal(hortis.phenologyFilter.formatDay(hortis.phenologyFilter.toDay("2024-04-01")), "1 Apr 24", "Days formatted as 1 Apr 24");
});
