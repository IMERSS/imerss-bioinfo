/* global QUnit, hortis */

"use strict";

fluid.registerNamespace("hortis.tests");

QUnit.module("BBEA map on Infusion 6 - start-up sequence and grid");

QUnit.config.reorder = false;

/** A fake of the parts of MapLibre used by hortis.libreMap, logging the operations performed on it **/

hortis.tests.maps = [];

hortis.tests.FakeMap = class {
    constructor(options) {
        Object.assign(this, {
            options, events: {}, sources: {}, layers: {}, log: [], controls: [], zoomLevel: 5, isLoaded: false, styleLoaded: false,
            style: {_layers: {}, _order: []},
            dragRotate: {disable: () => {}},
            touchZoomRotate: {disableRotation: () => {}}
        });
        hortis.tests.maps.push(this);
    }
    on(event, listener) {
        fluid.pushArray(this.events, event, {listener});
    }
    once(event, listener) {
        fluid.pushArray(this.events, event, {listener, once: true});
    }
    off(event, listener) {
        fluid.remove_if(this.events[event] || [], rec => rec.listener === listener);
    }
    fire(event, arg) {
        const listeners = this.events[event] || [];
        this.events[event] = listeners.filter(rec => !rec.once);
        listeners.forEach(rec => rec.listener(arg));
    }
    loaded() {
        return this.isLoaded;
    }
    getZoom() {
        return this.zoomLevel;
    }
    async loadImage(url) {
        this.log.push("loadImage " + url);
        await new Promise(resolve => setTimeout(resolve, 1));
        return {data: url};
    }
    addImage(name) {
        this.log.push("addImage " + name);
    }
    setStyle() {
        this.log.push("setStyle");
        this.styleLoaded = false;
        this.sources = {};
        this.layers = {};
        this.style._layers = {};
        // Leave a margin in which the test can observe that the style is applying but has not yet applied
        setTimeout(() => {
            this.styleLoaded = true;
            this.fire("styledata");
        }, 20);
    }
    isStyleLoaded() {
        return this.styleLoaded;
    }
    addSource(id, source) {
        this.log.push("addSource " + id);
        this.sources[id] = {...source, setData: data => this.sources[id].data = data};
    }
    getSource(id) {
        return this.sources[id];
    }
    addLayer(layer) {
        this.log.push("addLayer " + layer.id);
        this.layers[layer.id] = layer;
        this.style._layers[layer.id] = layer;
    }
    getLayer(id) {
        return this.layers[id];
    }
    setPaintProperty(id, prop, value) {
        this.layers[id].paint[prop] = value;
    }
    fitBounds(bounds) {
        this.log.push("fitBounds");
        this.fittedBounds = bounds;
    }
    addControl(control) {
        this.controls.push(control);
    }
    queryRenderedFeatures(point) {
        return point.features || [];
    }
    getCanvas() {
        return {style: {}};
    }
    remove() {
        this.removed = true;
    }
};

window.maplibregl = {
    Map: hortis.tests.FakeMap,
    NavigationControl: class {}
};

hortis.tests.taxaRows = [
    {id: "1", rank: "epifamily", iNaturalistTaxonName: "Anthophila"},
    {id: "10", parentId: "1", rank: "family", iNaturalistTaxonName: "Apidae"},
    {id: "12", parentId: "10", rank: "species", iNaturalistTaxonName: "Bombus mixtus"},
    {id: "47126", rank: "kingdom", iNaturalistTaxonName: "Plantae"},
    {id: "103", parentId: "47126", rank: "species", iNaturalistTaxonName: "Rosa nutkana"}
];

// Two observations near Corvallis and one near Portland, well over a 6km grid cell apart
hortis.tests.obsRows = [
    {pollinatorINatId: "12", plantINatId: "103", decimalLatitude: 44.56, decimalLongitude: -123.26},
    {pollinatorINatId: "12", plantINatId: "103", decimalLatitude: 44.561, decimalLongitude: -123.261},
    {pollinatorINatId: "12", plantINatId: "103", decimalLatitude: 45.52, decimalLongitude: -122.68}
];

fluid.def("hortis.tests.mapLoader", {
    $layers: "hortis.beaVizLoader",
    taxaRows: hortis.tests.taxaRows,
    obsRows: hortis.tests.obsRows,
    // Don't fetch the index of volunteers' reports
    collectorReportLinker: {
        $component: {
            reportIndex: {}
        }
    }
});

hortis.tests.wait = delay => new Promise(resolve => setTimeout(resolve, delay));

/**
 * Wait until a condition holds, since the map's start-up spans several turns of the event loop.
 * @param {Function} predicate - Returns `true` once the condition holds
 * @return {Promise} Resolves once the condition holds, or rejects after a second
 */
hortis.tests.waitFor = async function (predicate) {
    const start = Date.now();
    while (!predicate()) {
        if (Date.now() - start > 1000) {
            throw new Error("Timed out waiting for condition");
        }
        await hortis.tests.wait(1);
    }
};

hortis.tests.indexOfLog = (map, entry) => map.log.indexOf(entry);

QUnit.test("Start-up is sequenced by availability", async function (assert) {
    const that = hortis.tests.mapLoader();
    fluid.cell.stabilize();
    const map = fluid.peek(hortis.tests.maps);
    assert.equal(hortis.tests.maps.length, 1, "Map constructed once");
    assert.equal(map.options.container, document.querySelector(".imerss-map"), "Map constructed in its container from the page markup");
    assert.deepEqual(map.log, [], "Nothing touches the style before the map has loaded");
    assert.equal(map.controls.length, 1, "Zoom controls added at once");

    map.isLoaded = true;
    map.fire("load");
    await hortis.tests.waitFor(() => map.log.includes("setStyle"));
    assert.deepEqual(map.log, ["setStyle"], "Style applied once the map has loaded, but before it has applied");

    await hortis.tests.waitFor(() => map.log.includes("fitBounds"));
    const setStyle = hortis.tests.indexOfLog(map, "setStyle");
    assert.ok(hortis.tests.indexOfLog(map, "addSource baseMap") > setStyle, "Street map tiles added after the style has applied");
    assert.ok(hortis.tests.indexOfLog(map, "addSource ecoL3") > setStyle, "Ecoregion tiles added after the style has applied");
    assert.ok(hortis.tests.indexOfLog(map, "addLayer obsgrid-layer") > setStyle, "Observation grid added after the style has applied");
    assert.ok(hortis.tests.indexOfLog(map, "fitBounds") > setStyle, "Map zoomed to observations after the style has applied");
    assert.equal(map.log.filter(entry => entry === "setStyle").length, 1, "Style applied exactly once");
    assert.deepEqual(map.style._order, ["baseMap", "ecoL3", "obsgrid-layer"], "Layers sorted by their sort keys");
    assert.equal(map.sources["obsgrid-source"].data.features.length, 2, "Observations fall into two grid cells");

    that.destroy();
    fluid.cell.stabilize();
    assert.ok(map.removed, "Map removed when its component is destroyed");
});

QUnit.test("Fill patterns are loaded before the style is applied", async function (assert) {
    const that = hortis.tests.mapLoader({
        map: {
            $component: {
                fillPatternPath: "img/",
                fillPatterns: {stripes: true, dots: true}
            }
        }
    });
    fluid.cell.stabilize();
    const map = fluid.peek(hortis.tests.maps);
    map.isLoaded = true;
    map.fire("load");
    await hortis.tests.waitFor(() => map.log.includes("setStyle"));
    const setStyle = hortis.tests.indexOfLog(map, "setStyle");
    assert.ok(setStyle !== -1, "Style applied");
    assert.ok(hortis.tests.indexOfLog(map, "addImage stripes") < setStyle, "First fill pattern added before the style is applied");
    assert.ok(hortis.tests.indexOfLog(map, "addImage dots") < setStyle, "Second fill pattern added before the style is applied");
    that.destroy();
});

hortis.tests.addMarker = function (map) {
    map.log.push("marker");
    return new Promise(resolve => setTimeout(resolve, 5));
};

QUnit.test("A layer may insert a stage into start-up, and the ready map can be awaited", async function (assert) {
    const that = hortis.tests.mapLoader({
        map: {
            $component: {
                readyMap: {
                    $effect: [{
                        namespace: "marker",
                        priority: "before:applyStyle",
                        func: "hortis.tests.addMarker",
                        args: "{$payload}"
                    }]
                }
            }
        }
    });
    fluid.cell.stabilize();
    const map = fluid.peek(hortis.tests.maps);
    map.isLoaded = true;
    map.fire("load");
    await fluid.cell.settle();
    assert.strictEqual(that.map.readyMap, map, "Ready map available once start-up has settled");
    assert.ok(hortis.tests.indexOfLog(map, "marker") < hortis.tests.indexOfLog(map, "setStyle"), "Inserted stage runs before the style is applied");
    assert.ok(hortis.tests.indexOfLog(map, "fitBounds") > hortis.tests.indexOfLog(map, "setStyle"), "Map zoomed to observations once ready");
    assert.equal(map.log.filter(entry => entry === "setStyle").length, 1, "Style applied exactly once");
    that.destroy();
});

QUnit.test("Clicking a grid cell filters observations, and clicking elsewhere resets it", async function (assert) {
    const that = hortis.tests.mapLoader();
    fluid.cell.stabilize();
    const map = fluid.peek(hortis.tests.maps);
    map.isLoaded = true;
    map.fire("load");
    await hortis.tests.waitFor(() => map.getSource("obsgrid-source"));

    const cellId = that.map.obsQuantiser.cellIds.get(hortis.tests.obsRows[0]);
    const cellFeature = {layer: {paint: {"fill-opacity": 0.6}}, properties: {cellId}};
    map.fire("click", {point: {features: [cellFeature]}});
    fluid.cell.stabilize();
    assert.equal(that.map.gridSelector.filterState, cellId, "Grid cell selected");
    assert.equal(that.filteredObs.length, 2, "Observations filtered to the selected cell");
    assert.equal(map.sources["obsgrid-source"].data.features.length, 1, "Grid redrawn with the one selected cell");

    map.fire("click", {point: {features: []}});
    fluid.cell.stabilize();
    assert.equal(that.map.gridSelector.filterState, null, "Selection reset by a click elsewhere");
    assert.equal(that.filteredObs.length, 3, "All observations restored");
    that.destroy();
});
