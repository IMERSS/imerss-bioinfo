/* global QUnit, hortis */

"use strict";

fluid.registerNamespace("hortis.tests");

QUnit.module("BBEA visualisation on Infusion 6 - shell and views", {before: hortis.tests.loadAllImports});

QUnit.config.reorder = false;

fluid.def("hortis.tests.viewsLoader", {
    $layers: "hortis.beaVizLoader",
    // The test's data, as a columnar data package made in memory - see hortis.viz.fromRows
    pkg: "$compute:hortis.tests.makePackage()",
    taxaRows: hortis.tests.taxaRows,
    regionIndirectionRows: hortis.tests.regionIndirectionRows || [],
    collectorFacet: {
        $component: {
            body: {
                $component: {
                    collectorReportLinker: {
                        $component: {
                            reportIndex: {
                                "Charles Babbage": [{state: "OR", year: 2024, report: "babbage-2024.html"}]
                            }
                        }
                    }
                }
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
    const that = hortis.tests.viewsLoader({container: hortis.tests.root()});
    fluid.cell.stabilize();
    const head = qs(".imerss-facet[data-facet=\"bees\"] .imerss-facet-head");
    const body = qs("#imerss-facet-bees");
    assert.ok(body.hidden, "Section initially closed");
    hortis.tests.dispatch(head, "click");
    assert.notOk(body.hidden, "Clicking its head opens a section");
    assert.equal(head.getAttribute("aria-expanded"), "true", "Head reports the section open");
    hortis.tests.dispatch(qs(".imerss-collapse-facets"), "click");
    assert.ok(body.hidden, "Collapse all closes every section");

    const badge = qs(".imerss-facet[data-facet=\"bees\"] [data-state]");
    assert.ok(badge.hidden, "No badge whilst no bee filter is active");
    that.beeFacet.body.pollChecklist.extraFilter.filterState.female = true;
    that.beeFacet.body.pollChecklist.check("10", true);
    fluid.cell.stabilize();
    assert.notOk(badge.hidden, "Badge shown once filters within the section are active");
    assert.equal(badge.textContent, "2", "Badge sums the sex filter and the bee checklist's selections");
    const elevationBadge = qs(".imerss-facet[data-facet=\"elevation\"] [data-state]");
    that.elevationFacet.body.elevationFilter.dualRangeInput.range.max = 500;
    fluid.cell.stabilize();
    assert.ok(elevationBadge.classList.contains("imerss-facet-state-dot"), "The elevation filter's badge is a plain marker");
    that.destroy();
});

QUnit.test("View tabs and download", function (assert) {
    const that = hortis.tests.viewsLoader({container: hortis.tests.root()});
    fluid.cell.stabilize();
    assert.notOk(hortis.tests.panel("net").hidden, "Network panel shown initially");
    assert.ok(hortis.tests.panel("mtx").hidden, "Matrix panel hidden initially");
    hortis.tests.selectTab("mtx");
    assert.equal(that.bbeaViewTabs.selectedTab, "mtx", "Tab selected");
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
    const that = hortis.tests.viewsLoader({container: hortis.tests.root()});
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

    that.beeFacet.body.pollChecklist.check("10", true);
    fluid.cell.stabilize();
    assert.equal(qsa(".imerss-poll-names .imerss-int-label").length, 1, "Selecting Apidae counts its interactions against the family");
    that.destroy();
});

QUnit.test("Taxon lists", function (assert) {
    const that = hortis.tests.viewsLoader({container: hortis.tests.root()});
    fluid.cell.stabilize();
    hortis.tests.selectTab("bees");
    const bees = qs(".imerss-bee-list");
    assert.deepEqual(qsa(".imerss-famhead span", bees).map(node => node.textContent), ["Apidae", "Andrenidae"],
        "Families ordered by their numbers of observations");
    assert.equal(qsa(".imerss-taxon-name", bees).length, 3, "Each bee species listed");
    assert.ok(qs(".imerss-listbar-count", bees).textContent.includes("5 observations"), "Totals rendered");
    hortis.tests.dispatch(qs(".imerss-seg-btn[data-arrange=\"flat\"]", bees), "click");
    assert.equal(that.beeList.arrange, "flat", "Arrangement switched");
    assert.equal(qsa(".imerss-famhead", bees).length, 0, "No family headings in the flat arrangement");
    assert.deepEqual(qsa(".imerss-taxon-name", bees).map(node => node.textContent), ["Andrena nigrihirta", "Bombus mixtus", "Bombus vosnesenskii"],
        "Species listed alphabetically");

    that.beeFacet.body.pollChecklist.extraFilter.filterState.male = true;
    fluid.cell.stabilize();
    assert.equal(qsa(".imerss-taxon-name", bees).length, 2, "List follows the filters");
    assert.equal(qs(".imerss-plant-list .imerss-listbody").textContent, "", "The plant list, not showing, has not rendered");
    that.destroy();
});

QUnit.test("Bee abundance", function (assert) {
    const that = hortis.tests.viewsLoader({container: hortis.tests.root()});
    fluid.cell.stabilize();
    hortis.tests.selectTab("abund");
    assert.equal(qsa(".imerss-bee-abundance svg.imerss-chart").length, 3, "Charts drawn for families, genera and species");
    assert.deepEqual(qsa(".imerss-bee-abundance .mf-key > span > span").map(node => node.textContent), ["Apidae", "Andrenidae"],
        "Family key drawn");
    that.destroy();
});

QUnit.test("Seed mix evaluator", function (assert) {
    const that = hortis.tests.viewsLoader({container: hortis.tests.root()});
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
    const beeList = qs(".mf-seed-bees", seed);
    assert.deepEqual(qsa(".imerss-famhead span", beeList).map(node => node.textContent), ["Apidae", "Andrenidae"],
        "The bees supported are listed by family, the family with most observations on the mix first");
    assert.deepEqual(qsa(".imerss-taxon-name", beeList).map(node => node.textContent),
        ["Bombus mixtus", "Bombus vosnesenskii", "Andrena nigrihirta"], "Each bee supported is listed, alphabetically within its family");
    assert.equal(qsa(".imerss-listbar", beeList).length, 0, "The list is not offered for rearrangement");

    that.regionFacet.body.regionFilter.filterState = {"ecoregion:Cascades": true};
    fluid.cell.stabilize();
    assert.ok(qs(".mf-seednote", seed).textContent.startsWith("Plants recorded under the current filters"), "A region defines a site");
    assert.ok(qs("input[data-seed=\"203\"]", seed).hasAttribute("checked"), "The plant recorded there is established and ticked");
    hortis.tests.dispatch(qs(".imerss-seed-reset", seed), "click");
    assert.deepEqual({...that.seedMix.added}, {}, "Reset clears the added plants");

    // Clearing the mix unticks every plant, even one established on the site
    rosa.checked = true;
    rosa.dispatchEvent(new Event("change", {bubbles: true}));
    fluid.cell.stabilize();
    hortis.tests.dispatch(qs(".imerss-seed-clear", seed), "click");
    fluid.cell.stabilize();
    assert.deepEqual([{...that.seedMix.removed}, {...that.seedMix.added}], [{"203": true}, {}], "Clearing removes the established plant and the added one");
    assert.deepEqual(qsa("input[data-seed]", seed).filter(input => input.checked), [], "No plant is ticked once the mix is cleared");
    assert.ok(qs(".mf-seedread", seed).textContent.startsWith("0 of 3 bee species supported"), "A cleared mix supports no bee");
    assert.equal(qs(".mf-seed-bees .imerss-empty", seed).textContent, "No bees are supported by the plants in the mix.", "The list of bees is emptied");
    hortis.tests.dispatch(qs(".imerss-seed-reset", seed), "click");
    fluid.cell.stabilize();
    assert.ok(qs("input[data-seed=\"203\"]", seed).checked, "Resetting restores the established plant");
    that.destroy();
});

QUnit.test("Seed mix evaluator answers to every filter, though only those of place define its site", function (assert) {
    const that = hortis.tests.viewsLoader({container: hortis.tests.root()});
    fluid.cell.stabilize();
    hortis.tests.selectTab("seed");
    const seed = qs(".imerss-seed-mix");
    // Only one observation is in July - of bee 12 on plant 203, in the Cascades
    const july = qsa(".imerss-phenology-filter input")[6];
    july.checked = true;
    july.dispatchEvent(new Event("change", {bubbles: true}));
    fluid.cell.stabilize();
    assert.ok(qs(".mf-seednote", seed).textContent.startsWith("No site is defined"), "A filter of phenology alone defines no site");
    assert.deepEqual(qsa("input[data-seed]", seed).map(input => input.dataset.seed), ["203"],
        "Only the plant recorded in July is a candidate");
    assert.ok(qs(".mf-seedread", seed).textContent.includes("of 1 bee species supported"), "Only the bee recorded in July is counted");

    that.regionFacet.body.regionFilter.filterState = {"ecoregion:Cascades": true};
    fluid.cell.stabilize();
    assert.ok(qs(".mf-seednote", seed).textContent.startsWith("Plants recorded under the current filters"), "A region defines a site");
    assert.ok(qs("input[data-seed=\"203\"]", seed).hasAttribute("checked"), "The plant recorded there in July is established and ticked");
    assert.ok(qs(".mf-seedread", seed).textContent.startsWith("1 of 1 bee species supported"), "It supports the bee recorded in July");
    that.destroy();
});

QUnit.test("Collector reports and grips", function (assert) {
    const that = hortis.tests.viewsLoader({container: hortis.tests.root()});
    fluid.cell.stabilize();
    const report = qs(".imerss-collector-report");
    assert.ok(report.classList.contains("fl-hidden"), "Reports hidden whilst no collector is chosen");
    that.collectorFacet.body.collectorFilter.confirmAutocomplete("Charles Babbage");
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

QUnit.test("Seed mix evaluator lists apart the plants introduced in the states of the site", function (assert) {
    const pkg = hortis.viz.fromRows({
        obs: [
            {state: "OR", plantINatId: "103", pollinatorINatId: "12"},
            {state: "BC", plantINatId: "203", pollinatorINatId: "12"}
        ],
        taxa: [{id: "1"}]
    });
    const orObs = hortis.selectObs(pkg, [{field: "state", op: "in", value: ["OR"]}]);
    const allObs = hortis.selectObs(pkg, []);
    const plant = (id, name, bees, means) => ({id, label: name, bees: new Set(bees),
        row: {id, rank: "species", iNaturalistTaxonName: name, ...means}});
    const network = {plants: new Map([
        ["103", plant("103", "Rosa nutkana", ["12", "13"], {establishmentOR: "native", establishmentBC: "native"})],
        ["203", plant("203", "Solidago lepida", ["12"], {establishmentOR: "introduced", establishmentBC: ""})],
        ["303", plant("303", "Taraxacum officinale", ["12", "13", "22"], {establishmentOR: "", establishmentBC: "introduced"})]
    ])};
    const ids = set => [...set].sort();
    assert.deepEqual(ids(hortis.seedMix.computeIntroduced(pkg, network, true, orObs, allObs)), ["203"],
        "On an Oregon site, a plant is introduced if Oregon's checklist says so - one it does not list is native");
    assert.deepEqual(ids(hortis.seedMix.computeIntroduced(pkg, network, false, orObs, allObs)), ["203", "303"],
        "With no site, a plant is introduced if it is so in any state of the observations");
    const singleState = hortis.viz.fromRows({obs: [{plantINatId: "103", pollinatorINatId: "12"}], taxa: [{id: "1"}]});
    assert.deepEqual(ids(hortis.seedMix.computeIntroduced(singleState, network, false, null, hortis.selectObs(singleState, []))), [],
        "A data set not of several states has no plant introduced");

    const that = {removed: {}, added: {"303": true}, shortListLength: 60};
    const markup = hortis.seedMix.listMarkup(that, true, network, new Set(["203"]), new Set(["203", "303"]), {}, "", false);
    const holder = document.createElement("div");
    holder.innerHTML = markup;
    assert.deepEqual(qsa(".mf-seedgroup", holder).map(node => node.textContent),
        ["Available for seed mixes (1)", "Introduced plants (2)"], "The introduced plants are listed last, in a section of their own");
    assert.deepEqual(qsa(".mf-seed-introduced input[data-seed]", holder).map(input => [input.dataset.seed, input.hasAttribute("checked")]),
        [["303", true], ["203", true]], "Introduced plants keep their ticks - one added, one established on the site");
});

// A loader of a data set of two states, of which the plant Rosa nutkana is available from Oregon's nurseries, with
// hortis.oregonNursery laid over it, as by the page of the combined atlas
fluid.def("hortis.tests.nurseryLoader", {
    $layers: ["hortis.tests.viewsLoader", "hortis.oregonNursery"],
    pkg: "$compute:hortis.tests.makeNurseryPackage()",
    taxaRows: "$compute:hortis.tests.nurseryTaxaRows()",
    regionIndirectionRows: "$compute:hortis.tests.nurseryRegionRows()"
});

hortis.tests.nurseryTaxaRows = () => hortis.tests.taxaRows.map(row => row.id === "103" ? {...row, oregonNurseries: "Echo Valley Natives"} : row);

hortis.tests.nurseryRegionRows = () => [
    {regionField: "state", id: "OR", label: "Oregon", state: "OR"},
    {regionField: "state", id: "WA", label: "Washington", state: "WA"}
];

hortis.tests.makeNurseryPackage = () => hortis.viz.fromRows({
    obs: hortis.tests.obsRows.map((row, i) => ({...row, state: i < 3 ? "OR" : "WA"})),
    taxa: hortis.tests.nurseryTaxaRows(),
    regionIndirection: hortis.tests.nurseryRegionRows()
});

QUnit.test("Plants available from Oregon's nurseries are marked whilst Oregon is selected", function (assert) {
    const that = hortis.tests.nurseryLoader({container: hortis.tests.root()});
    fluid.cell.stabilize();
    hortis.tests.selectTab("seed");
    const seed = qs(".imerss-seed-mix");
    assert.equal(qsa(".mf-oregon-nursery", seed).length, 0, "No plant is marked whilst Oregon is not selected");

    that.regionFacet.body.regionFilter.filterState = {"Oregon": true};
    fluid.cell.stabilize();
    const marks = qsa(".mf-oregon-nursery", seed);
    assert.equal(marks.length, 1, "Once Oregon is selected, the one plant available is marked");
    assert.equal(marks[0].closest("label").querySelector("input").dataset.seed, "103", "The mark is beside Rosa nutkana");
    assert.equal(marks[0].getAttribute("href"), "https://oregonflora.org/taxa/search.php?search=Rosa%20nutkana", "It links to OregonFlora's search for the plant");
    assert.equal(marks[0].getAttribute("title"), "Seeds available from Oregon Nursery Native Plants", "It bears its tooltip");

    that.regionFacet.body.regionFilter.filterState = {"Washington": true};
    fluid.cell.stabilize();
    assert.equal(qsa(".mf-oregon-nursery", seed).length, 0, "Selecting another state removes the marks");
    that.destroy();
});
