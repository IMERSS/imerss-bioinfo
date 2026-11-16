/*
Copyright 2017-2026 Antranig Basman
Licensed under the Educational Community License (ECL), Version 2.0 or the New
BSD license. You may not use this file except in compliance with one these
Licenses.
You may obtain a copy of the ECL 2.0 License and BSD License at
https://github.com/fluid-project/infusion/raw/master/Infusion-LICENSE.txt
*/

"use strict";

// The MapLibre map ported to Infusion 6 - corresponds to the map parts of src/client/js/new/imerss-new.js.
//
// In Infusion 4 the map's start-up was sequenced by events: maplibre's "load" fired the transforming promise event
// onLoad, whose listeners loaded fill patterns, and whose last listener applied the real style and, on "styledata",
// wrote a mapLoaded signal on which every effect touching the style was gated by a throwaway argument.
// Here the same sequence is the composite effect `readyMap`, whose namespaced listener records
//     load -> loadFillPatterns -> applyStyle
// each receive the map as their {$payload}, possibly once a promise resolves - see FLUID-7028. A layer may displace any
// of these stages, or insert one of its own with a priority such as "before:applyStyle". `readyMap` holds the map once
// the chain completes, and is pending before, so that every effect touching the style simply takes it as its argument.

// noinspection ES6ConvertVarToLetConst // otherwise this is a duplicate on minifying
var hortis = fluid.registerNamespace("hortis");

// Basic style: https://github.com/maplibre/maplibre-gl-js/issues/638
hortis.blankMapStyle = {
    version: 8,
    layers: [],
    sources: {}
};

fluid.def("hortis.libreMap", {
    $layers: "fluid.component",
    // The duration in milliseconds of the map's smooth moves, e.g. fitting it to filtered observations
    zoomDuration: 2000,
    // The duration in milliseconds of a zoom by the map's zoom buttons
    controlZoomDuration: 1000,
    zoomControlsPosition: "top-left",
    style: hortis.blankMapStyle,
    fillPatternPath: "",
    fillPatterns: {},
    fillPatternPixelRatio: 6,
    // The map renders into the markup its parent's template places at its @id, which the map then owns
    view: {
        $component: {
            $layers: "fluid.viewComponent"
        }
    },
    mapContainer: "{self}.view.renderedContainer",
    // Constructed exactly once - rebuilding the map would lose its camera, sources and controls
    map: {
        $bindable: {
            bind: "hortis.libreMap.make({self}.mapContainer, {global}.maplibregl)",
            unbind: "hortis.libreMap.destroy({boundValue})",
            onceOnly: true
        }
    },
    // The map once it has loaded and its real style has applied. The style is applied once fill patterns are loaded,
    // since a style referring to them can't be interpreted before
    readyMap: {
        $effect: [{
            namespace: "load",
            func: "hortis.libreMap.whenLoaded",
            args: "{self}.map"
        }, {
            namespace: "loadFillPatterns",
            priority: "after:load",
            func: "hortis.libreMap.loadFillPatterns",
            args: ["{$payload}", "{self}.fillPatternPath", "{self}.fillPatterns", "{self}.fillPatternPixelRatio"]
        }, {
            namespace: "applyStyle",
            priority: "after:loadFillPatterns",
            func: "hortis.libreMap.applyStyle",
            args: ["{$payload}", "{self}.style"]
        }]
    },
    zoom: {
        $bindable: {
            bind: "hortis.libreMap.trackZoom({self}.map)",
            unbind: "hortis.libreMap.untrack({boundValue})"
        }
    },
    zoomControls: {
        $bindable: {
            bind: "hortis.libreMap.zoomControls({self}.map, {global}.maplibregl, {self}.controlZoomDuration, {self}.zoomControlsPosition)",
            onceOnly: true
        }
    },
    // Components contributing to the handling of clicks on the map - the first whose `handle` method returns `true`
    // takes the click, and if none does, each is asked to reset its selection
    clickHandlers: "{self hortis.libreMap.clickHandler}",
    clickDispatch: {
        $bindable: {
            bind: "hortis.libreMap.bindClick({self}, {self}.map)",
            unbind: "hortis.libreMap.unbindClick({boundValue})"
        }
    },
    sortLayers: "$method:hortis.libreMap.sortLayers({0}:map)"
});

/**
 * Create a MapLibre map with a blank style - the real style is applied once the map has loaded and any fill patterns
 * it refers to have been loaded as images.
 * @param {Element} container - The element to hold the map
 * @param {Object} [maplibregl] - The MapLibre library
 * @return {maplibregl.Map|Unavailable} The map, or an unavailable value if the MapLibre library is not loaded
 */
hortis.libreMap.make = function (container, maplibregl) {
    let togo;
    if (maplibregl) {
        togo = new maplibregl.Map({container, style: fluid.copy(hortis.blankMapStyle)});
        const window = container.ownerDocument.defaultView;
        // Only a map drawn by WebGL in a browser has pixels to track
        if (typeof togo.getPixelRatio === "function" && typeof window.matchMedia === "function") {
            hortis.libreMap.trackPixels(togo, window);
        }
    } else {
        togo = fluid.unavailable({message: "The MapLibre library is not loaded", variety: "config"});
    }
    return togo;
};

hortis.libreMap.destroy = function (map) {
    hortis.libreMap.untrackPixels(map);
    map.remove();
};

/**
 * Make each pixel of a map's canvas fall on exactly one pixel of the screen, at any zoom of the browser, so that what is
 * drawn a pixel wide, such as the outlines of the grid's cells, stays a pixel wide. MapLibre sizes the canvas's
 * backing store to the whole number of device pixels beneath the container's width in CSS pixels, but displays it
 * across that width - at a zoom of 125%, a container 801 pixels wide holds a backing store of 1001 device pixels shown
 * across 1001.25, which the browser rescales, smearing a line a pixel wide across two pixels at some places but not at
 * others. Here the canvas is displayed across exactly as many device pixels as it holds, after every resize. The map is
 * also resized whenever the ratio of device pixels to CSS pixels changes, as zooming the browser changes it, since that
 * does not always resize the window, by which MapLibre would see it.
 * @param {maplibregl.Map} map - The map
 * @param {Window} window - The window holding the map
 */
hortis.libreMap.trackPixels = function (map, window) {
    const record = {window, query: null};
    record.fit = () => {
        const canvas = map.getCanvas();
        const ratio = map.getPixelRatio();
        canvas.style.width = canvas.width / ratio + "px";
        canvas.style.height = canvas.height / ratio + "px";
    };
    record.watch = () => {
        record.query = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
        record.query.addEventListener("change", record.change);
    };
    record.change = () => {
        record.query.removeEventListener("change", record.change);
        map.resize();
        record.watch();
    };
    map.on("resize", record.fit);
    record.fit();
    record.watch();
    map.hortisPixelTracker = record;
};

hortis.libreMap.untrackPixels = function (map) {
    const record = map.hortisPixelTracker;
    if (record) {
        record.query.removeEventListener("change", record.change);
        map.off("resize", record.fit);
    }
};

/**
 * Wait for a map to load.
 * @param {maplibregl.Map} map - The map
 * @return {maplibregl.Map|Promise<maplibregl.Map>} The map if it has loaded, or else a promise for it once it has
 */
hortis.libreMap.whenLoaded = function (map) {
    // Very long-standing bugs with mapbox load event: https://github.com/mapbox/mapbox-gl-js/issues/6707
    // and https://github.com/mapbox/mapbox-gl-js/issues/9779
    return map.loaded() ? map : new Promise(resolve => map.once("load", () => resolve(map)));
};

/**
 * Load fill pattern images into a map.
 * @param {maplibregl.Map} map - The loaded map
 * @param {String} fillPatternPath - The path holding the fill pattern images, each named by its fill pattern with suffix .png
 * @param {Object<String, any>} fillPatterns - The fill patterns to be loaded, as keys
 * @param {Number} pixelRatio - The pixel ratio with which the images are to be drawn
 * @return {Promise<maplibregl.Map>} A promise for the map once every image has been added to it
 */
hortis.libreMap.loadFillPatterns = function (map, fillPatternPath, fillPatterns, pixelRatio) {
    const loadOne = async fillPattern => {
        const image = await map.loadImage(fillPatternPath + fillPattern + ".png");
        // Explained in https://github.com/mapbox/mapbox-gl-js/pull/9372
        map.addImage(fillPattern, image.data, {pixelRatio});
    };
    return Promise.all(Object.keys(fillPatterns).map(loadOne)).then(() => map);
};

/**
 * Apply a style to a loaded map.
 * @param {maplibregl.Map} map - The loaded map
 * @param {Object} style - The style to be applied
 * @return {maplibregl.Map|Promise<maplibregl.Map>} The map if the style applied at once, or else a promise for it once
 * the style has applied
 */
hortis.libreMap.applyStyle = function (map, style) {
    const togo = new Promise(resolve => map.once("styledata", () => resolve(map)));
    // Without diff: false, a style identical to the current one, e.g. the blank style of a map whose layers are all added
    // later, is diffed to nothing and no "styledata" event is ever fired
    map.setStyle(fluid.copy(style), {diff: false});
    return map.isStyleLoaded() ? map : togo;
};

/**
 * Track a map's zoom level.
 * @param {maplibregl.Map} map - The map
 * @return {Cell<Number>} A cell holding the map's zoom level, with members `map`, `event` and `listener` recording its
 * listener for `hortis.libreMap.untrack`
 */
hortis.libreMap.trackZoom = function (map) {
    const togo = fluid.cell(map.getZoom(), {name: "Map zoom"});
    Object.assign(togo, {map, event: "zoom", listener: () => togo.set(map.getZoom())});
    map.on("zoom", togo.listener);
    return togo;
};

/**
 * Remove a listener bound to a map.
 * @param {Object} record - A record with members `map`, `event` and `listener`
 */
hortis.libreMap.untrack = function (record) {
    record.map.off(record.event, record.listener);
};

// How long in milliseconds after an area is drawn a click still belongs to the drawing, as the double click which ends a
// shape arrives as several clicks
hortis.libreMap.drawClickGrace = 500;

/**
 * Dispatch clicks on a map to the click handlers currently registered with a map component - except those made while an
 * area is being drawn, e.g. by hortis.libreMap.withPolygonDraw, which are left to the drawing tool. Otherwise each would
 * select the map cell beneath it, narrowing the drawn area to that single cell. Any cell already selected is released
 * when drawing starts, for the same reason.
 * @param {hortis.libreMap} that - The map component
 * @param {maplibregl.Map} map - The map
 * @return {Object} A record of the listeners, to be supplied to `hortis.libreMap.unbindClick`
 */
hortis.libreMap.bindClick = function (that, map) {
    // Times are those of the window's performance clock, which also stamps each event as the browser creates it - a click
    // ending a drawing may only be handled once the page has recomputed everything the drawn area filters, by when far
    // longer than the grace may have passed
    const performance = map.getContainer().ownerDocument.defaultView.performance;
    const record = {map, drawing: false, drawingEnded: -Infinity};
    record.modechange = ({mode}) => {
        // Only while a shape is being drawn: clicking inside a finished shape puts the tool in its editing mode, where cells
        // must still respond
        const nowDrawing = mode.startsWith("draw_");
        if (nowDrawing && !record.drawing) {
            that.gridSelector?.reset();
        }
        if (record.drawing && !nowDrawing) {
            record.drawingEnded = performance.now();
        }
        record.drawing = nowDrawing;
    };
    record.click = e => {
        const clicked = e.originalEvent?.timeStamp ?? performance.now();
        if (!record.drawing && clicked - record.drawingEnded > hortis.libreMap.drawClickGrace) {
            const handlers = that.clickHandlers;
            const handled = handlers.find(handler => handler.handle(e));
            if (!handled) {
                handlers.forEach(handler => handler.resetSelection());
            }
        }
    };
    map.on("draw.modechange", record.modechange);
    map.on("click", record.click);
    return record;
};

hortis.libreMap.unbindClick = function (record) {
    record.map.off("draw.modechange", record.modechange);
    record.map.off("click", record.click);
};

// A component which handles clicks on a map, found by hortis.libreMap
fluid.def("hortis.libreMap.clickHandler", {
    $layers: "fluid.component"
    // handle: $method accepting a MapLibre click event, returning `true` if it handled it
    // resetSelection: $method
});

/**
 * Sort the layers of a map by the `sortKey` in their metadata, so that layers without one, e.g. those added by
 * MapboxDraw, float on top.
 * @param {maplibregl.Map} map - The map
 */
hortis.libreMap.sortLayers = function (map) {
    // Reach into undocumented impl of mapLibre and quickly sort the layers into desired order
    const style = map.style;
    const layers = Object.values(style._layers);
    const sortKey = layer => layer?.metadata?.sortKey ?? Infinity;
    style._order = layers.sort((a, b) => sortKey(a) - sortKey(b)).map(layer => layer.id);
    style._changed = true;
    style._layerOrderChanged = true;
};

hortis.libreMap.zoomControls = function (map, maplibregl, zoomDuration, zoomControlsPosition) {
    const controls = new maplibregl.NavigationControl({showCompass: false, showZoom: true});
    // Apply our own zoom duration to the controls' buttons, which otherwise take maplibre's default
    const zoomBy = (method, e) => map[method]({duration: zoomDuration, essential: true}, {originalEvent: e});
    controls._zoomInButton?.addEventListener("click", e => zoomBy("zoomIn", e), true);
    controls._zoomOutButton?.addEventListener("click", e => zoomBy("zoomOut", e), true);
    map.addControl(controls, zoomControlsPosition);
    // disable map rotation using right click + drag
    map.dragRotate.disable();
    // disable map rotation using touch rotation gesture
    map.touchZoomRotate.disableRotation();
    return controls;
};

/** Tiles **/

fluid.def("hortis.libreMap.withTiles", {
    // tileSets: Object<String, TileSet>
    addTiles: "$effect:hortis.libreMap.addTileLayers({self}, {self}.readyMap, {self}.tileSets)"
});

hortis.libreMap.addTileLayers = function (that, map, tileSets) {
    Object.entries(tileSets).forEach(([key, tileSet]) => {
        if (!map.getSource(key)) {
            map.addSource(key, {
                type: "raster",
                ...fluid.censorKeys(tileSet, ["paint", "metadata"])
            });
            map.addLayer({
                id: key,
                type: "raster",
                source: key,
                paint: tileSet.paint || {},
                metadata: tileSet.metadata || {}
            });
        }
    });
    that.sortLayers(map);
};

fluid.def("hortis.libreMap.streetmapTiles", {
    tileSets: {
        baseMap: {
            tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
            attribution: "&copy; <a href=\"https://www.openstreetmap.org/copyright\">OpenStreetMap</a> contributors",
            tileSize: 256,
            metadata: {
                sortKey: 0
            }
        }
    }
});

fluid.def("hortis.libreMap.esriTiles", {
    tileSets: {
        baseMap: {
            tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
            attribution: "ESRI &copy; <a href='http://www.esri.com'>ESRI</a>",
            tileSize: 256,
            maxzoom: 18,
            metadata: {
                sortKey: 0
            }
        }
    }
});

fluid.def("hortis.libreMap.usEcoL3Tiles", {
    tileSets: {
        ecoL3: {
            tiles: ["https://usda-nifa-b-team.github.io/b-team/tiles/us_eco_l3_tiles/{z}/{x}/{y}.png"],
            tileSize: 512,
            maxzoom: 8,
            paint: {
                "raster-opacity": 0.3
            },
            metadata: {
                sortKey: 1
            }
        }
    }
});

/** Geometry **/

hortis.initBounds = function () {
    return [
        [90, 180],
        [-90, -180]
    ];
};

hortis.updateBounds = function (bounds, lat, long) {
    bounds[0][0] = Math.min(bounds[0][0], lat);
    bounds[0][1] = Math.min(bounds[0][1], long);
    bounds[1][0] = Math.max(bounds[1][0], lat);
    bounds[1][1] = Math.max(bounds[1][1], long);
};

hortis.expandBounds = function (bounds, factor, latMin, longMin) {
    const longSpan = bounds[1][1] - bounds[0][1];
    const latSpan = bounds[1][0] - bounds[0][0];
    const longD = Math.max(longSpan * factor, longMin / 2);
    const latD = Math.max(latSpan * factor, latMin / 2);
    if (longSpan < 360) {
        bounds[1][1] += longD; bounds[0][1] -= longD;
        bounds[1][0] += latD; bounds[0][0] -= latD;
    }
};

// From https://en.wikipedia.org/wiki/Longitude#Length_of_a_degree_of_longitude
hortis.WGS84a = 6378137;
hortis.WGS84b = 6356752.3142;
hortis.WGS84e2 = (hortis.WGS84a * hortis.WGS84a - hortis.WGS84b * hortis.WGS84b) / (hortis.WGS84a * hortis.WGS84a);

/**
 * Compute the length of a degree of longitude.
 * @param {Number} latitude - The latitude at which the length is to be computed
 * @return {Number} The length in metres of a degree of longitude at the latitude
 */
hortis.longitudeLength = function (latitude) {
    const latrad = Math.PI * latitude / 180;
    const sinrad = Math.sin(latrad);
    return Math.PI * hortis.WGS84a * Math.cos(latrad) / (180 * Math.sqrt(1 - hortis.WGS84e2 * sinrad * sinrad));
};

hortis.metresToLong = function (long, latitude) {
    return long / hortis.longitudeLength(latitude);
};

/**
 * Compute the length of a degree of latitude.
 * @param {Number} latitude - The latitude at which the length is to be computed
 * @return {Number} The length in metres of a degree of latitude at the latitude
 */
hortis.latitudeLength = function (latitude) {
    const latrad = Math.PI * latitude / 180;
    const sinrad = Math.sin(latrad);
    return Math.PI * hortis.WGS84a * (1 - hortis.WGS84e2) / (180 * Math.pow(1 - hortis.WGS84e2 * sinrad * sinrad, 1.5));
};

hortis.longToLat = function (lng, lat) {
    return lng * hortis.longitudeLength(lat) / hortis.latitudeLength(lat);
};

hortis.obsBounds = function (rows) {
    const bounds = hortis.initBounds();
    // Observations without a position are passed over - the strings of their empty coordinates would read as zero
    rows.forEach(row => {
        const point = hortis.rowPoint(row);
        if (point) {
            hortis.updateBounds(bounds, point[1], point[0]);
        }
    });
    return bounds;
};

/** Observation grid **/

fluid.def("hortis.obsQuantiser", {
    $layers: "fluid.component",
    /** Grid resolution in metres */
    gridResolution: 100,
    baseLatitude: 49,
    // pkg: VizPackage - the data package
    // selection: Selection - the observations to be gridded
    // The field of the observations holding the taxon counted in each cell, e.g. by a cell's tooltip
    taxonField: "iNaturalistTaxonId",
    // The expression of the query description language computing each observation's cell - see qdl.js
    cellExpr: "$compute:hortis.obsQuantiser.cellExpr({self}.gridResolution, {self}.baseLatitude)",
    longResolution: "$compute:hortis.metresToLong({self}.gridResolution, {self}.baseLatitude)",
    latResolution: "$compute:hortis.longToLat({self}.longResolution, {self}.baseLatitude)",
    maxBounds: "$compute:hortis.obsQuantiser.allBounds({self}.pkg)",
    grid: `$compute:hortis.obsQuantiser.indexObs({self}.pkg, {self}.selection, {self}.cellExpr, {self}.latResolution, {self}.longResolution,
        {self}.maxBounds, {self}.taxonField)`
});

/**
 * The expression of the query description language computing each observation's cell of a grid.
 * @param {Number} gridResolution - The size of a cell in metres
 * @param {Number} baseLatitude - The latitude at which a cell is of that size
 * @return {Object} The expression
 */
hortis.obsQuantiser.cellExpr = (gridResolution, baseLatitude) => ({
    snapToGrid: ["decimalLongitude", "decimalLatitude"], metres: gridResolution, baseLatitude
});

/**
 * Converts a cell ID string to its corresponding latitude and longitude coordinates.
 * @param {String} index - The cell ID in the format "latIndex|longIndex".
 * @param {Number} latres - The grid resolution for latitude.
 * @param {Number} longres - The grid resolution for longitude.
 * @return {Number[]} An array containing the latitude and longitude coordinates [latitude, longitude].
 */
hortis.obsQuantiser.cellIdToCoord = function (index, latres, longres) {
    const coords = index.split("|");
    return [coords[0] * latres, coords[1] * longres];
};

/**
 * Write a cell's number, as the query description language's `snapToGrid` computes it, as its id - the cell's index
 * of latitude and of longitude separated by "|", by which it is held in the URL.
 * @param {Number} cell - The cell's number
 * @return {String} Its id
 */
hortis.obsQuantiser.cellId = cell => hortis.qdl.cellIndices(cell).join("|");

/**
 * Read a cell's id as its number.
 * @param {String} cellId - The cell's id
 * @return {Number} Its number
 */
hortis.obsQuantiser.cellNumber = function (cellId) {
    const [latIndex, longIndex] = String(cellId).split("|").map(Number);
    return hortis.qdl.cellNumber(latIndex, longIndex);
};

/**
 * Compute the bounds of all observations with a position.
 * @param {VizPackage} pkg - The data package
 * @return {Number[][]} The bounds, as [[minLat, minLong], [maxLat, maxLong]]
 */
hortis.obsQuantiser.allBounds = function (pkg) {
    const extent = hortis.query(pkg, {from: "obs", measures: {bounds: {extent: ["decimalLongitude", "decimalLatitude"]}}}).bounds;
    const bounds = hortis.initBounds();
    if (extent) {
        hortis.updateBounds(bounds, extent[0][1], extent[0][0]);
        hortis.updateBounds(bounds, extent[1][1], extent[1][0]);
    }
    return bounds;
};

/**
 * Index observations into grid cells, by one query grouping them by cell.
 * @param {VizPackage} pkg - The data package
 * @param {Selection} selection - The observations to be gridded
 * @param {Object} cellExpr - The expression of each observation's cell
 * @param {Number} latRes - The grid resolution for latitude
 * @param {Number} longRes - The grid resolution for longitude
 * @param {Number[][]} maxBounds - The bounds of all observations, used if there are none to be gridded
 * @param {String} taxonField - The field of the observations holding the taxon counted in each cell
 * @return {Object} The grid, with members `buckets`, a map of cell id to bucket, each with member `obsCount`,
 * `maxObsCount` and `bounds`, and the method `taxaOf`, accepting a cell id and returning a map of each taxon id
 * observed in it to its number of observations
 */
hortis.obsQuantiser.indexObs = function (pkg, selection, cellExpr, latRes, longRes, maxBounds, taxonField) {
    const now = Date.now();
    const bareCellExpr = hortis.bareQuery(cellExpr);
    const result = hortis.query(pkg, {
        from: "obs",
        let: {cell: bareCellExpr},
        groupBy: ["cell"],
        measures: {records: {count: true}, bounds: {extent: ["decimalLongitude", "decimalLatitude"]}}
    }, selection);
    const grid = {bounds: hortis.initBounds(), maxObsCount: 0, buckets: {}};
    for (let g = 0; g < result.groups; ++g) {
        const obsCount = result.measures.records[g];
        const extent = result.measures.bounds[g];
        grid.buckets[hortis.obsQuantiser.cellId(result.keys.cell[g])] = {obsCount};
        grid.maxObsCount = Math.max(grid.maxObsCount, obsCount);
        hortis.updateBounds(grid.bounds, extent[0][1], extent[0][0]);
        hortis.updateBounds(grid.bounds, extent[1][1], extent[1][0]);
    }
    if (result.groups === 0) {
        grid.bounds = fluid.copy(maxBounds);
    }
    hortis.expandBounds(grid.bounds, 0.1, latRes * 6, longRes * 6); // mapBox fitBounds are a bit tight
    const taxaCache = new Map();
    grid.taxaOf = function (cellId, field = taxonField) {
        const key = cellId + "|" + field;
        let togo = taxaCache.get(key);
        if (!togo) {
            togo = Object.fromEntries(hortis.countObsBy(pkg, hortis.selectObs(pkg, [{field: bareCellExpr, op: "=", value: hortis.obsQuantiser.cellNumber(cellId)}], selection), field));
            taxaCache.set(key, togo);
        }
        return togo;
    };
    fluid.log("Gridded " + selection.count + " rows into " + result.groups + " cells in " + (Date.now() - now) + " ms");
    return grid;
};

// Ripped off 6 stops from https://rpubs.com/mjvoss/psc_viridis
hortis.libreMap.viridisStops = [
    [0,   "#440154"],
    [0.2, "#414487"],
    [0.4, "#2a788e"],
    [0.6, "#22a884"],
    [0.8, "#7ad151"],
    [1,   "#fde725"]
];

// Ripped off from Nature paper at https://www.nature.com/articles/s41467-021-24149-x
hortis.libreMap.natureStops = [
    [0, "#ffffff"],
    [1, "#09326d"]
];

// Displays observations as a choropleth grid, allowing a cell to be selected to filter them
fluid.def("hortis.libreMap.withObsGrid", {
    fillStops: hortis.libreMap.viridisStops,
    fillOpacity: 0.6,
    // The colour and opacity of the outline of each cell, drawn exactly one device pixel wide at any zoom by a layer of
    // its own - see hortis.libreMap.gridOutlineLayer
    outlineColour: "black",
    outlineOpacity: 1,
    gridResolution: 100,
    gridVisible: true,
    zoomToObsBounds: true,
    maxObsCountOverride: null, // Override of the choropleth scaling, e.g. from the History pane of a story map
    // Global names of transforms applied to the proportion of the maximum count held by each cell, and its inverse
    countTransform: "fluid.identity",
    inverseCountTransform: "fluid.identity",
    obsQuantiser: {
        $component: {
            $layers: "hortis.obsQuantiser",
            gridResolution: "{libreMap}.gridResolution",
            pkg: "{vizLoader}.pkg",
            selection: "{vizLoader}.finalFilteredObs"
        }
    },
    gridSelector: {
        $component: {
            $layers: ["hortis.libreMap.gridSelector"]
        }
    },
    // Once no more than this many filtered observations fall within the viewport, the grid fades away and each is shown
    // by a marker instead - 0 never shows markers, except of a selected record
    markerThreshold: 20,
    // Markers are shown for observations within this proportion of the viewport's size beyond it, so that panning a
    // little doesn't uncover unmarked observations
    markerPadding: 0.5,
    // The field holding the stable id of an observation, by which a selected record is held in the URL - an
    // observation without one is identified by its index
    recordIdField: "occurrenceID",
    // The template of an observation's tooltip, and the global name of a function accepting (row, rowById) which
    // computes the values of its %terms - by default taxonName, recordedBy, eventDate and linkMarkup. The values of
    // terms ending in "Markup" are markup, and all others are text
    obsTooltipTemplate: `<div class="imerss-tooltip imerss-obs-tooltip">
    <div class="imerss-obs-tooltip-taxon">%taxonName</div>
    <div><b>Recorded by:</b> %recordedBy</div>
    <div><b>Date:</b> %eventDate</div>
    %linkMarkup
</div>`,
    obsTooltipValues: "hortis.libreMap.obsTooltipValues",
    // The map's viewport, written by the listener tracking it
    viewBounds: null,
    viewTracker: {
        $bindable: {
            bind: "hortis.libreMap.trackBounds({self}, {self}.map)",
            unbind: "hortis.libreMap.untrackBounds({boundValue})"
        }
    },
    viewportObs: `$compute:hortis.libreMap.viewportObs({vizLoader}.pkg, {self}.obsQuantiser.selection, {self}.viewBounds, {self}.markerPadding,
        {self}.markerThreshold, {self}.obsQuantiser.maxBounds, {self}.obsQuantiser.grid)`,
    recordSelector: {
        $component: {
            $layers: ["hortis.libreMap.recordSelector"]
        }
    },
    selectedRecord: "{self}.recordSelector.selectedRow",
    showMarkers: "$compute:hortis.libreMap.showMarkers({self}.gridVisible, {self}.viewportObs.inView, {self}.markerThreshold, {self}.selectedRecord)",
    markerRows: "$compute:hortis.libreMap.markerRows({self}.showMarkers, {self}.viewportObs.nearby, {self}.selectedRecord)",
    markerTooltip: {
        $component: {
            $layers: "hortis.withTooltip",
            renderTooltip: "$method:hortis.libreMap.renderObsTooltip({libreMap}.obsTooltipTemplate, {libreMap}.obsTooltipValues, {vizLoader}.taxa.rowById, {0}:row)"
        }
    },
    markerLayer: {
        $bindable: {
            bind: "hortis.libreMap.makeMarkerLayer({self}, {self}.map, {global}.maplibregl)",
            unbind: "hortis.libreMap.destroyMarkerLayer({boundValue})",
            onceOnly: true
        }
    },
    updateMarkers: "$effect:hortis.libreMap.updateMarkers({self}.markerLayer, {self}.readyMap, {self}.markerRows, {self}.selectedRecord)",
    // On a touch screen, a tap on a cell or a marker shows the tooltip which hovering over it would show, and a second tap
    // selects it, as a click would
    tapTooltips: {
        $bindable: {
            bind: "hortis.libreMap.bindTapTooltips({self}, {self}.map, {self}.markerLayer)",
            unbind: "hortis.libreMap.unbindTapTooltips({boundValue})"
        }
    },
    centreRecord: "$effect:hortis.libreMap.centreRecord({self}.readyMap, {self}.selectedRecord, {self}.zoomDuration)",
    // Whether the grid is shown - it fades away whilst markers are shown in its place
    gridShown: "$compute:hortis.libreMap.gridShown({self}.gridVisible, {self}.showMarkers)",
    gridOpacity: "$compute:hortis.libreMap.computeGridOpacity({self}.gridShown, {self}.fillOpacity)",
    gridBounds: "{self}.obsQuantiser.grid.bounds",
    gridFeature: `$compute:hortis.libreMap.obsGridFeature({self}.obsQuantiser.grid, {self}.obsQuantiser.latResolution,
        {self}.obsQuantiser.longResolution, {self}.maxObsCountOverride, {self}.countTransform)`,
    updateObsGrid: "$effect:hortis.libreMap.updateObsGrid({self}, {self}.readyMap, {self}.gridFeature, {self}.gridOpacity)",
    // The camera, with members `center` and `zoom`, to which the map returns once no filter narrows the observations -
    // if null, it is fitted to the bounds of all of them
    homeCamera: null,
    // The fitting of the map to the filtered observations, together with whether it was last fitted to filtered ones -
    // built from its own previous value, so that the map returns to its home camera only once the filters are cleared
    fitState: `$compute:hortis.libreMap.fitState({$oldValue}, {self}.readyMap, {self}.gridBounds, {self}.zoomToObsBounds,
        {self}.zoomDuration, {self}.homeCamera, {self}.obsQuantiser.selection.count, {self}.obsQuantiser.selection.rowCount)`,
    zoomToObsBoundsEffect: "$effect:hortis.libreMap.fitObs({self}.fitState)"
});

hortis.libreMap.computeGridOpacity = function (gridShown, fillOpacity) {
    return gridShown ? fillOpacity : 0;
};

hortis.libreMap.gridShown = (gridVisible, showMarkers) => gridVisible && !showMarkers;

// The duration in milliseconds of the grid's fading in and out as markers replace it
hortis.libreMap.gridFadeDuration = 400;

// GeoJSON-style (long, lat) polygon traversed anticlockwise
hortis.libreMap.rectFromCorner = function (lat, long, latres, longres) {
    return [
        [long, lat],
        [long + longres, lat],
        [long + longres, lat + latres],
        [long, lat + latres],
        [long, lat]
    ];
};

/**
 * Render a grid of observations as GeoJSON, with each cell's proportion of the maximum count as `obsprop`.
 * @param {Object} grid - The grid, as computed by `hortis.obsQuantiser.indexObs`
 * @param {Number} latres - The grid resolution for latitude
 * @param {Number} longres - The grid resolution for longitude
 * @param {Number|null} maxObsCountOverride - A count to be taken as the maximum in place of the grid's own
 * @param {String} countTransform - Global name of a transform applied to each cell's proportion
 * @return {Object} A GeoJSON FeatureCollection holding a polygon for each occupied cell
 */
hortis.libreMap.obsGridFeature = function (grid, latres, longres, maxObsCountOverride, countTransform) {
    const maxObsCount = maxObsCountOverride || grid.maxObsCount;
    const transform = fluid.getGlobalValue(countTransform);
    return {
        type: "FeatureCollection",
        features: Object.entries(grid.buckets).map(function ([key, bucket]) {
            const [lat, long] = hortis.obsQuantiser.cellIdToCoord(key, latres, longres);
            return {
                type: "Feature",
                geometry: {
                    type: "Polygon",
                    coordinates: [hortis.libreMap.rectFromCorner(lat, long, latres, longres)]
                },
                properties: {
                    cellId: key,
                    obsprop: transform(bucket.obsCount / maxObsCount, maxObsCount)
                }
            };
        })
    };
};

/**
 * Draw the grid of cells counting observations, or update it with fresh counts and opacity. The cells are filled by one
 * layer, and outlined by another - see hortis.libreMap.gridOutlineLayer. The fills are drawn without antialiasing,
 * whose partly covered pixels along each edge would otherwise overlap those of the neighbouring cell, so that each
 * pixel along a shared edge is covered by exactly one of the two cells.
 * @param {hortis.libreMap} that - The map component, with members `fillStops`, `outlineColour` and `outlineOpacity`
 * @param {maplibregl.Map} map - The map
 * @param {Object} geojson - The cells, as a GeoJSON FeatureCollection
 * @param {Number} gridOpacity - The opacity of the cells
 */
hortis.libreMap.updateObsGrid = function (that, map, geojson, gridOpacity) {
    const source = map.getSource("obsgrid-source");
    if (source) {
        source.setData(geojson);
    } else {
        map.addSource("obsgrid-source", {
            type: "geojson",
            data: geojson
        });
    }
    if (!map.getLayer("obsgrid-layer")) {
        map.addLayer({
            id: "obsgrid-layer",
            type: "fill",
            source: "obsgrid-source",
            paint: {
                "fill-color": {
                    property: "obsprop",
                    stops: that.fillStops
                },
                "fill-opacity": gridOpacity,
                "fill-opacity-transition": {duration: hortis.libreMap.gridFadeDuration, delay: 0},
                "fill-antialias": false
            },
            metadata: {
                sortKey: 100
            }
        });
        map.addLayer(hortis.libreMap.gridOutlineLayer(map, that.outlineColour));
        // Ensure that the numerous layers inserted by the MapboxDraw plugin, which have no sortKey, float on top of ours
        that.sortLayers(map);
    }
    map.setPaintProperty("obsgrid-layer", "fill-opacity", gridOpacity);
    const outline = map.getLayer("obsgrid-outline-layer")?.implementation;
    if (outline) {
        outline.setEdges(hortis.libreMap.gridEdges(geojson, hortis.libreMap.mercator));
        outline.setOpacity(gridOpacity > 0 ? that.outlineOpacity : 0);
    }
};

/** The outlines of the grid's cells **/

/**
 * Project a longitude and latitude to MapLibre's Web Mercator coordinates, in which the world spans 0 to 1, as
 * maplibregl.MercatorCoordinate.fromLngLat does - in double precision, unlike the 32-bit floats of WebGL.
 */
hortis.libreMap.mercator = {
    fromLngLat: ([lng, lat]) => ({
        x: (180 + lng) / 360,
        y: (180 - (180 / Math.PI) * Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360))) / 360
    })
};

/**
 * Find each edge of the grid's cells once, however many cells share it, as pairs of points in Web Mercator coordinates.
 * An edge shared by two neighbouring cells, drawn by each, would light its pixels twice.
 * @param {Object} geojson - The cells, as a GeoJSON FeatureCollection of polygons
 * @param {Object} MercatorCoordinate - A projection with method `fromLngLat`, e.g. hortis.libreMap.mercator
 * @return {Number[]} The edges, as successive values x1, y1, x2, y2
 */
hortis.libreMap.gridEdges = function (geojson, MercatorCoordinate) {
    const seen = new Set();
    const edges = [];
    const key = point => point[0].toFixed(9) + "," + point[1].toFixed(9);
    geojson.features.forEach(feature => {
        const ring = feature.geometry.coordinates[0];
        for (let i = 0; i + 1 < ring.length; i++) {
            const [a, b] = [key(ring[i]), key(ring[i + 1])];
            const edgeKey = a < b ? a + "|" + b : b + "|" + a;
            if (!seen.has(edgeKey) && a !== b) {
                seen.add(edgeKey);
                const p = MercatorCoordinate.fromLngLat(ring[i]), q = MercatorCoordinate.fromLngLat(ring[i + 1]);
                edges.push(p.x, p.y, q.x, q.y);
            }
        }
    });
    return edges;
};

/**
 * Parse a CSS colour into its red, green, blue and alpha components, each from 0 to 1.
 * @param {String} colour - The colour, e.g. "black" or "#336699"
 * @param {Document} dokkument - A document, whose canvas parses the colour
 * @return {Number[]} The components
 */
hortis.libreMap.parseColour = function (colour, dokkument) {
    const context = dokkument.createElement("canvas").getContext("2d");
    context.fillStyle = colour;
    context.fillRect(0, 0, 1, 1);
    return [...context.getImageData(0, 0, 1, 1).data].map(component => component / 255);
};

hortis.libreMap.outlineVertexShader = `
attribute vec2 a_pos;
uniform mat4 u_matrix;
void main() {
    gl_Position = u_matrix * vec4(a_pos, 0.0, 1.0);
}`;

hortis.libreMap.outlineFragmentShader = `
precision mediump float;
uniform vec4 u_colour;
void main() {
    gl_FragColor = u_colour;
}`;

/**
 * Create the layer outlining the grid's cells, as a MapLibre custom layer drawing WebGL lines. A line drawn by MapLibre
 * as a "line" layer, or as the outline of a "fill", is antialiased, and spread across two pixels in proportions
 * depending on where it falls between them, so that the edges of cells look uneven and blotchy, and doubled where
 * cells meet. WebGL draws its own lines, of width 1, without antialiasing, lighting exactly one pixel of the drawing
 * buffer across each - and, since the map's canvas maps those pixels exactly onto the screen's, see
 * hortis.libreMap.trackPixels, exactly one device pixel at any zoom. Each edge is drawn once - see
 * hortis.libreMap.gridEdges - and WebGL lights no pixel twice where one line ends and the next begins, so that no edge
 * is drawn darker or thicker than another. Its opacity fades with the cells' over hortis.libreMap.gridFadeDuration.
 * The vertices are held relative to the first of them, so that the precision of the 32-bit floats holding them is
 * spent on the grid rather than the world.
 * @param {maplibregl.Map} map - The map
 * @param {String} colour - The outlines' colour, in CSS syntax
 * @return {Object} The layer, a MapLibre CustomLayerInterface, with methods `setEdges` and `setOpacity`
 */
hortis.libreMap.gridOutlineLayer = function (map, colour) {
    const now = () => performance.now();
    const layer = {
        id: "obsgrid-outline-layer",
        type: "custom",
        renderingMode: "2d",
        metadata: {sortKey: 101},
        // Parsed once the layer is added to a map drawn by WebGL, in whose document
        colour: [0, 0, 0, 1],
        edges: [],
        origin: [0, 0],
        dirty: true,
        fade: {from: 0, to: 0, start: 0},
        setEdges(edges) {
            layer.edges = edges;
            layer.dirty = true;
            map.triggerRepaint();
        },
        setOpacity(opacity) {
            if (opacity !== layer.fade.to) {
                layer.fade = {from: layer.opacity(), to: opacity, start: now()};
                map.triggerRepaint();
            }
        },
        // The opacity at this moment of the fade towards that last set
        opacity() {
            const {from, to, start} = layer.fade;
            const progress = Math.min(1, (now() - start) / hortis.libreMap.gridFadeDuration);
            return from + (to - from) * progress;
        },
        onAdd(map, gl) {
            layer.colour = hortis.libreMap.parseColour(colour, gl.canvas.ownerDocument);
            const compile = (type, source) => {
                const shader = gl.createShader(type);
                gl.shaderSource(shader, source);
                gl.compileShader(shader);
                return shader;
            };
            layer.program = gl.createProgram();
            gl.attachShader(layer.program, compile(gl.VERTEX_SHADER, hortis.libreMap.outlineVertexShader));
            gl.attachShader(layer.program, compile(gl.FRAGMENT_SHADER, hortis.libreMap.outlineFragmentShader));
            gl.linkProgram(layer.program);
            layer.aPos = gl.getAttribLocation(layer.program, "a_pos");
            layer.uMatrix = gl.getUniformLocation(layer.program, "u_matrix");
            layer.uColour = gl.getUniformLocation(layer.program, "u_colour");
            layer.buffer = gl.createBuffer();
            layer.dirty = true;
        },
        onRemove(map, gl) {
            gl.deleteBuffer(layer.buffer);
            gl.deleteProgram(layer.program);
        },
        render(gl, matrix) {
            if (layer.dirty) {
                const edges = layer.edges;
                layer.origin = edges.length ? [edges[0], edges[1]] : [0, 0];
                const relative = new Float32Array(edges.length);
                edges.forEach((value, i) => {
                    relative[i] = value - layer.origin[i % 2];
                });
                gl.bindBuffer(gl.ARRAY_BUFFER, layer.buffer);
                gl.bufferData(gl.ARRAY_BUFFER, relative, gl.STATIC_DRAW);
                layer.count = edges.length / 2;
                layer.dirty = false;
            }
            const opacity = layer.opacity();
            if (opacity > 0 && layer.count > 0) {
                // Translate the projection to the vertices' origin, in double precision
                const [ox, oy] = layer.origin;
                const m = Array.from(matrix);
                for (let row = 0; row < 4; row++) {
                    m[12 + row] = matrix[row] * ox + matrix[4 + row] * oy + matrix[12 + row];
                }
                const [r, g, b, a] = layer.colour;
                const alpha = a * opacity;
                gl.useProgram(layer.program);
                gl.uniformMatrix4fv(layer.uMatrix, false, m);
                // MapLibre blends with premultiplied alpha
                gl.uniform4f(layer.uColour, r * alpha, g * alpha, b * alpha, alpha);
                gl.bindBuffer(gl.ARRAY_BUFFER, layer.buffer);
                gl.enableVertexAttribArray(layer.aPos);
                gl.vertexAttribPointer(layer.aPos, 2, gl.FLOAT, false, 0, 0);
                gl.lineWidth(1);
                gl.drawArrays(gl.LINES, 0, layer.count);
            }
            if (opacity !== layer.fade.to) {
                map.triggerRepaint();
            }
        }
    };
    return layer;
};

hortis.libreMap.swapBounds = function (bounds) {
    return bounds.map(coords => [coords[1], coords[0]]);
};

/**
 * @typedef {Object} FitState
 * @property {maplibregl.Map} map - The loaded map
 * @property {Number[][]} bounds - The bounds of the filtered observations, as [[lat, long], [lat, long]]
 * @property {Boolean} zoomToObsBounds - Whether the map follows the observations at all
 * @property {Number} zoomDuration - The duration in milliseconds of the move
 * @property {Object|null} homeCamera - The camera, with members `center` and `zoom`, to return to, if any
 * @property {Boolean} filtered - Whether a filter narrows the observations
 * @property {Boolean|undefined} wasFiltered - Whether the same map was last fitted to filtered observations, or
 * `undefined` if it has not yet been fitted - as the page loads, when its camera is placed by other means, e.g. a story's
 * panes
 */

/**
 * Compute the fitting of a map to the filtered observations, from its previous value - see `{$oldValue}`.
 * @param {FitState|undefined} previous - The previous fitting, if any
 * @param {maplibregl.Map} map - The loaded map
 * @param {Number[][]} bounds - The bounds of the filtered observations, as [[lat, long], [lat, long]]
 * @param {Boolean} zoomToObsBounds - Whether the map follows the observations at all
 * @param {Number} zoomDuration - The duration in milliseconds of the move
 * @param {Object|null} homeCamera - The camera, with members `center` and `zoom`, to return to, if any
 * @param {Number} filteredCount - The number of filtered observations
 * @param {Number} allCount - The number of all observations
 * @return {FitState} The fitting
 */
hortis.libreMap.fitState = function (previous, map, bounds, zoomToObsBounds, zoomDuration, homeCamera, filteredCount, allCount) {
    return {map, bounds, zoomToObsBounds, zoomDuration, homeCamera, filtered: filteredCount !== allCount,
        wasFiltered: previous?.map === map ? previous.filtered : undefined};
};

/**
 * Move a map smoothly to show the filtered observations - fitted to their bounds while a filter narrows them, and back
 * to its home camera once none does, if it has one, or else fitted to the bounds of them all.
 * @param {FitState} fitState - The fitting, as computed by hortis.libreMap.fitState
 */
hortis.libreMap.fitObs = function (fitState) {
    const {map, bounds, zoomToObsBounds, zoomDuration, homeCamera, filtered, wasFiltered} = fluid.unwrapProxy(fitState);
    // A change of filters may change the layout around the map, e.g. a story page's panel describing a chosen taxon -
    // a move begun before the map has taken up its new size lands away from where it was aimed
    hortis.libreMap.afterLayout(map, () => {
        if (filtered || !homeCamera) {
            hortis.libreMap.fitBounds(map, bounds, zoomToObsBounds, zoomDuration);
        } else if (zoomToObsBounds && wasFiltered) {
            map.flyTo({center: homeCamera.center, zoom: homeCamera.zoom, duration: zoomDuration, essential: true});
        }
    });
};

/**
 * Call a function once the layout around a map has settled - after two animation frames, by which time any change of
 * the map's size which the same turn caused has been observed and applied to it.
 * @param {maplibregl.Map} map - The map
 * @param {Function} func - The function to call
 */
hortis.libreMap.afterLayout = function (map, func) {
    const window = map.getContainer().ownerDocument.defaultView;
    window.requestAnimationFrame(() => window.requestAnimationFrame(func));
};

hortis.libreMap.fitBounds = function (map, bounds, zoomToObsBounds, zoomDuration) {
    if (zoomToObsBounds) {
        // MapLibre accepts coordinates in the opposite order (long, lat)
        map.fitBounds(hortis.libreMap.swapBounds(bounds), {
            duration: zoomDuration,
            // Awkward to override the prefersReducedMotion setting but taking OS setting by default seems too severe
            essential: true
        });
    }
};

/**
 * Resolves a map event to a property value of the topmost visible feature at the event's point - looking through any area
 * drawn by MapboxDraw, whose layers are named "gl-draw-...", so that the map cells inside it can still be hovered over and
 * selected.
 * @param {maplibregl.Map} map - The MapLibre map instance.
 * @param {MapMouseEvent} e - A map mouse event containing a `point` property.
 * @param {String} propName - The name of the property to dereference
 * @return {String|null} The property's value, or null if no visible feature was found.
 */
hortis.libreMap.eventToProp = function (map, e, propName) {
    const features = map.queryRenderedFeatures(e.point);
    const visibleFeatures = features.filter(feature => !feature.layer.id.startsWith("gl-draw-") &&
        (feature.layer.paint["fill-opacity"] > 0 || feature.layer.paint["circle-opacity"] > 0));
    return visibleFeatures[0]?.properties[propName] ?? null;
};

// Selects a grid cell when it is clicked, and filters observations to those in the selected cell. Selection of a cell
// stacks with any other selection on the map, e.g. of a region
fluid.def("hortis.libreMap.gridSelector", {
    $layers: ["hortis.libreMap.clickHandler", "hortis.obsFilter", "hortis.withTooltip", "hortis.urlMappedFilter"],
    filterState: null, // The id of the selected cell
    urlKey: "cell",
    // The hovered cell is held at hoverId by hortis.withTooltip - by default no tooltip is shown for it
    renderTooltip: "$method:hortis.tooltip.none",
    filterSummary: "$compute:hortis.libreMap.gridSelector.summarise({self}.filterState)",
    handle: "$method:hortis.libreMap.gridSelector.handle({self}, {libreMap}.map, {0}:event)",
    resetSelection: "$method:hortis.libreMap.gridSelector.reset({self})",
    reset: "$method:hortis.libreMap.gridSelector.reset({self})",
    predicates: "$compute:hortis.libreMap.gridSelector.predicates({self}.filterState, {libreMap}.obsQuantiser.cellExpr)",
    hover: {
        $bindable: {
            bind: "hortis.libreMap.gridSelector.bindHover({self}, {libreMap}, {libreMap}.map)",
            unbind: "hortis.libreMap.gridSelector.unbindHover({boundValue})"
        }
    }
});

hortis.libreMap.gridSelector.handle = function (that, map, e) {
    const cellId = hortis.libreMap.eventToProp(map, e, "cellId");
    if (cellId) {
        that.filterState = cellId;
    }
    return !!cellId;
};

hortis.libreMap.gridSelector.reset = function (that) {
    that.filterState = null;
};

hortis.libreMap.gridSelector.summarise = function (filterState) {
    return {count: filterState ? 1 : 0, dot: true, title: "A map cell is selected"};
};

/**
 * Compute the predicates of the selection of a cell of the grid.
 * @param {String|null} selectedCell - The id of the selected cell, if any
 * @param {Object} cellExpr - The expression of each observation's cell
 * @return {Object[]} The predicates
 */
hortis.libreMap.gridSelector.predicates = (selectedCell, cellExpr) => selectedCell === null ? [] :
    [{field: cellExpr, op: "=", value: hortis.obsQuantiser.cellNumber(selectedCell)}];

hortis.libreMap.gridSelector.bindHover = function (that, libreMap, map) {
    const listener = e => {
        if (libreMap.gridVisible) {
            const cellId = hortis.libreMap.eventToProp(map, e, "cellId");
            that.hoverAt(cellId, e.originalEvent);
            map.getCanvas().style.cursor = cellId ? "default" : "";
        }
    };
    const leave = () => that.hoverAt(null);
    map.on("mousemove", listener);
    map.on("mouseout", leave);
    return {map, event: "mousemove", listener, leave};
};

hortis.libreMap.gridSelector.unbindHover = function (record) {
    record.map.off("mousemove", record.listener);
    record.map.off("mouseout", record.leave);
};

/** Markers of individual observations **/

/**
 * Determine whether an observation has coordinates - one without has none, or the placeholder 0, 0 - see
 * hortis.rowPoint, which parses them once for each observation.
 * @param {Object} row - The observation
 * @return {Boolean} `true` if the observation has coordinates
 */
hortis.libreMap.hasCoords = row => hortis.rowPoint(row) !== null;

/**
 * Track the bounds of a map's viewport, writing them into the map component whenever the map has moved or resized.
 * @param {hortis.libreMap} that - The map component, whose `viewBounds` is written
 * @param {maplibregl.Map} map - The map
 * @return {Object} A record of the listener, to be supplied to `hortis.libreMap.untrackBounds`
 */
hortis.libreMap.trackBounds = function (that, map) {
    const listener = () => {
        const bounds = map.getBounds();
        that.viewBounds = {west: bounds.getWest(), south: bounds.getSouth(), east: bounds.getEast(), north: bounds.getNorth()};
    };
    listener();
    map.on("moveend", listener);
    map.on("resize", listener);
    return {map, listener};
};

hortis.libreMap.untrackBounds = function (record) {
    record.map.off("moveend", record.listener);
    record.map.off("resize", record.listener);
};

/**
 * Find the observations within a map's viewport, and those near it.
 * @param {VizPackage} pkg - The data package
 * @param {Selection} selection - The filtered observations
 * @param {Object|null} bounds - The viewport, with members `west`, `south`, `east` and `north`, or null if unknown
 * @param {Number} padding - The proportion of the viewport's size beyond it within which an observation is near it
 * @param {Number} threshold - The number of observations within the viewport at most which markers are shown - no
 * more than four times as many near ones are collected
 * @param {Number[][]} maxBounds - The bounds of every observation with a position, as [[minLat, minLong], [maxLat, maxLong]]
 * @param {Object} grid - The grid of the filtered observations, as computed by hortis.obsQuantiser.indexObs, whose
 * cells count every one of them with a position
 * @return {Object} Members `inView`, the number of observations within the viewport, and `nearby`, those within or
 * near it, up to the limit, as row objects
 */
hortis.libreMap.viewportObs = function (pkg, selection, bounds, padding, threshold, maxBounds, grid) {
    const togo = {inView: 0, nearby: []};
    if (bounds && threshold > 0) {
        const latPad = (bounds.north - bounds.south) * padding, longPad = (bounds.east - bounds.west) * padding;
        const point = ["decimalLongitude", "decimalLatitude"];
        const padded = {field: point, op: "inBox", value: [[bounds.west - longPad, bounds.south - latPad], [bounds.east + longPad, bounds.north + latPad]]};
        const inView = {field: point, op: "inBox", value: [[bounds.west, bounds.south], [bounds.east, bounds.north]]};
        // A viewport holding the bounds of every observation, as the map's does while it is fitted to them or zoomed
        // out, holds every filtered observation with a position, which the grid has already counted - so that the
        // observations need not be scanned for it
        const holdsAll = bounds.south <= maxBounds[0][0] && bounds.west <= maxBounds[0][1] && bounds.north >= maxBounds[1][0] && bounds.east >= maxBounds[1][1];
        togo.inView = holdsAll ? Object.values(grid.buckets).reduce((sum, bucket) => sum + bucket.obsCount, 0) :
            hortis.query(pkg, {from: "obs", where: [inView], measures: {count: {count: true}}}, selection).count;
        // The nearby observations are needed only once few enough are in view for markers to be shown
        if (togo.inView > 0 && togo.inView <= threshold) {
            const ids = hortis.query(pkg, {from: "obs", where: [padded], select: {rows: true, limit: threshold * 4}}, selection).rows;
            togo.nearby = hortis.qdl.rowObjects(fluid.unwrapProxy(pkg).tables.obs, ids);
        }
    }
    return togo;
};

/**
 * Determine whether markers are shown in place of the grid - whilst a record is selected, or the grid is visible and
 * few enough observations fall within the viewport.
 * @param {Boolean} gridVisible - Whether the grid is visible
 * @param {Number} inView - The number of filtered observations within the viewport
 * @param {Number} threshold - The number of observations within the viewport at most which markers are shown
 * @param {Object|null} selectedRecord - The selected record, if any
 * @return {Boolean} `true` if markers are shown
 */
hortis.libreMap.showMarkers = function (gridVisible, inView, threshold, selectedRecord) {
    return !!selectedRecord || gridVisible && inView > 0 && inView <= threshold;
};

/**
 * Determine the observations shown by markers - the selected record alone if there is one.
 * @param {Boolean} showMarkers - Whether markers are shown
 * @param {Object[]} nearby - The filtered observations within or near the viewport
 * @param {Object|null} selectedRecord - The selected record, if any
 * @return {Object[]} The observations to be marked
 */
hortis.libreMap.markerRows = function (showMarkers, nearby, selectedRecord) {
    const rows = selectedRecord ? [selectedRecord] : showMarkers ? nearby : [];
    return rows.filter(hortis.libreMap.hasCoords);
};

hortis.libreMap.iNatObservationPattern = /^https?:\/\/(www\.)?inaturalist\.org\/observations\/\d+\/?$/;

/**
 * Render the link to an observation's record on iNaturalist, if its occurrence id is the URL of one.
 * @param {Object} row - The observation
 * @return {String} The link's markup, or the empty string if the observation is not from iNaturalist
 */
hortis.libreMap.iNatLinkMarkup = function (row) {
    const url = String(row.occurrenceID ?? "").trim();
    return hortis.libreMap.iNatObservationPattern.test(url) ?
        `<div class="imerss-obs-tooltip-link"><a href="${hortis.encodeHTML(url)}" target="_blank" rel="noopener">View on iNaturalist</a></div>` : "";
};

/**
 * Compute the values of the terms of an observation's tooltip.
 * @param {Object} row - The observation
 * @param {Object<String, TaxonRow>} rowById - Map of taxon id to taxon row
 * @return {Object<String, String>} The values of the terms `taxonName`, `recordedBy` and `eventDate`, and the markup
 * `linkMarkup` linking to the observation on iNaturalist if it is from there
 */
hortis.libreMap.obsTooltipValues = function (row, rowById) {
    const taxon = rowById?.[hortis.rowToLinkTaxonId(row)];
    return {
        taxonName: (taxon ? hortis.rowToScientific(taxon) : null) || row.taxon_name || row.scientificName || "Unknown taxon",
        recordedBy: row.recordedBy || "Unknown",
        eventDate: row.eventDate || "Unknown",
        linkMarkup: hortis.libreMap.iNatLinkMarkup(row)
    };
};

/**
 * Render the tooltip of an observation's marker.
 * @param {String} template - The template of the tooltip, holding %terms
 * @param {String} valuesFunc - The global name of a function accepting (row, rowById), computing the terms' values
 * @param {Object<String, TaxonRow>} rowById - Map of taxon id to taxon row
 * @param {Object} row - The hovered observation
 * @return {String|null} The tooltip's markup
 */
hortis.libreMap.renderObsTooltip = function (template, valuesFunc, rowById, row) {
    const values = fluid.getGlobalValue(valuesFunc)(row, rowById);
    const encoded = Object.fromEntries(Object.entries(values).map(([key, value]) =>
        [key, key.endsWith("Markup") ? String(value) : hortis.encodeHTML(String(value))]));
    return hortis.stringTemplate(template, encoded);
};

// A marker in the traditional form, a circle tapering to a point at its base
hortis.libreMap.markerMarkup = `<svg class="imerss-obs-marker-pin" viewBox="-1.5 -1.5 30 44" width="30" height="44" aria-hidden="true">
    <path d="M13.5 0C6.04 0 0 6.04 0 13.5 0 23.63 13.5 41 13.5 41S27 23.63 27 13.5C27 6.04 20.96 0 13.5 0Z"/>
    <circle cx="13.5" cy="13.5" r="5"/>
</svg>`;

// The duration in milliseconds of a marker's fading in and out - see .imerss-obs-marker in imerss-i6.css
hortis.libreMap.markerFadeDuration = 400;

/**
 * The markers shown on a map, by the observation each marks.
 * @typedef {Object} MarkerLayer
 * @property {hortis.libreMap} that - The map component
 * @property {maplibregl.Map} map - The map
 * @property {Object} maplibregl - The MapLibre library
 * @property {Window} window - The window holding the map
 * @property {Map<Object, Object>} markers - Each observation's record of its marker, with members `marker`,
 * `element` and, whilst it fades away, `removal`
 * @property {Number|null} hideTimer - The timer hiding the tooltip once the pointer has left it and its marker
 * @property {WeakMap<HTMLElement, Object>} rowOfElement - The observation of each marker's element, by which a tap on it
 * is resolved - see `hortis.libreMap.bindTapTooltips`
 * @property {HTMLElement|null} tooltipNode - The tooltip's element, once bound by `hortis.libreMap.bindTooltipNode`
 */

/**
 * Create the empty layer of markers of a map.
 * @param {hortis.libreMap} that - The map component
 * @param {maplibregl.Map} map - The map
 * @param {Object} maplibregl - The MapLibre library
 * @return {MarkerLayer} The layer
 */
hortis.libreMap.makeMarkerLayer = function (that, map, maplibregl) {
    return {that, map, maplibregl, window: map.getContainer().ownerDocument.defaultView, markers: new Map(),
        rowOfElement: new WeakMap(), hideTimer: null, tooltipNode: null};
};

hortis.libreMap.destroyMarkerLayer = function (layer) {
    hortis.libreMap.cancelTooltipHide(layer);
    layer.markers.forEach(record => {
        layer.window.clearTimeout(record.removal);
        record.marker.remove();
    });
    layer.markers.clear();
};

// The time in milliseconds for which a marker's tooltip stays once the pointer has left both it and its marker
hortis.libreMap.tooltipHideDelay = 350;

hortis.libreMap.cancelTooltipHide = function (layer) {
    layer.window.clearTimeout(layer.hideTimer);
    layer.hideTimer = null;
};

/**
 * Hide the tooltip of the markers once the pointer has stayed away from it and its marker for a moment.
 * @param {MarkerLayer} layer - The layer of markers
 */
hortis.libreMap.scheduleTooltipHide = function (layer) {
    hortis.libreMap.cancelTooltipHide(layer);
    layer.hideTimer = layer.window.setTimeout(() => layer.that.markerTooltip.hoverAt(null), hortis.libreMap.tooltipHideDelay);
};

/**
 * Make the tooltip of the markers take the pointer, holding it open whilst the pointer rests on it - once only, the
 * first time a marker is shown, by which time the tooltip's element exists.
 * @param {MarkerLayer} layer - The layer of markers
 */
hortis.libreMap.bindTooltipNode = function (layer) {
    const node = layer.that.markerTooltip.tooltip?.node;
    if (node && !layer.tooltipNode) {
        layer.tooltipNode = node;
        node.classList.add("imerss-tooltip-interactive");
        node.addEventListener("mouseenter", () => hortis.libreMap.cancelTooltipHide(layer));
        node.addEventListener("mouseleave", () => hortis.libreMap.scheduleTooltipHide(layer));
    }
};

/**
 * Create the marker of an observation, fading in, whose hovering shows the observation's tooltip and whose clicking
 * selects it.
 * @param {MarkerLayer} layer - The layer of markers
 * @param {Object} row - The observation
 * @return {Object} The marker's record, with members `marker` and `element`
 */
hortis.libreMap.addMarker = function (layer, row) {
    const {that, map, maplibregl, window} = layer;
    const element = window.document.createElement("div");
    element.className = "imerss-obs-marker";
    element.innerHTML = hortis.libreMap.markerMarkup;
    hortis.libreMap.bindTooltipNode(layer);
    // The tooltip stays where it was first shown, so that the pointer may cross to it, e.g. to follow its link
    element.addEventListener("mouseenter", event => {
        hortis.libreMap.cancelTooltipHide(layer);
        that.markerTooltip.hoverAt(row, event);
    });
    element.addEventListener("mouseleave", () => hortis.libreMap.scheduleTooltipHide(layer));
    element.addEventListener("click", () => that.recordSelector.select(row));
    layer.rowOfElement.set(element, row);
    const marker = new maplibregl.Marker({element, anchor: "bottom"})
        .setLngLat(hortis.rowPoint(row)).addTo(map);
    // Once the marker is in the document with its initial opacity, so that it fades in
    window.requestAnimationFrame(() => element.classList.add("imerss-obs-marker-visible"));
    return {marker, element};
};

/** Tooltips shown by tapping, on touch screens **/

// The furthest in pixels that a touch may travel, and the longest in milliseconds that it may last, to count as a tap
hortis.libreMap.tapSlop = 10;
hortis.libreMap.tapDuration = 500;

/**
 * Show on a tap the tooltip of a cell or marker, which a mouse shows by hovering, and select it on a second tap, as a
 * mouse does by clicking. MapLibre takes the touches made on the map for its own gestures, so that the browser sends
 * none of the mouse events by which it imitates hovering on the rest of the page, nor even a click - the tap is
 * recognised here from the pointer events, which still arrive. A tap on a marker shows the observation's tooltip, a tap
 * on a cell shows the cell's, and a tap on neither, or moving the map, puts both away. A tap on the marker or cell whose
 * tooltip is already shown selects it, as clicking it would, keeping its tooltip. The map's container is marked with
 * `data-hortis-tap-tooltips`, so that `hortis.tooltip.dismissOnTouch` leaves its taps to these listeners.
 * @param {hortis.libreMap} that - The map component
 * @param {maplibregl.Map} map - The map
 * @param {MarkerLayer} layer - The layer of markers
 * @return {Object} A record of the listeners, to be supplied to `hortis.libreMap.unbindTapTooltips`
 */
hortis.libreMap.bindTapTooltips = function (that, map, layer) {
    const record = {map, container: map.getContainer(), start: null};
    record.container.setAttribute("data-hortis-tap-tooltips", "");
    const hideAll = () => {
        hortis.libreMap.cancelTooltipHide(layer);
        that.markerTooltip.hoverAt(null);
        that.gridSelector?.hoverAt(null);
    };
    const tap = event => {
        const markerElement = event.target.closest?.(".imerss-obs-marker");
        const row = markerElement ? layer.rowOfElement.get(markerElement) : undefined;
        hortis.libreMap.cancelTooltipHide(layer);
        if (row) {
            if (that.markerTooltip.hoverId === row) {
                that.recordSelector.select(row);
            }
            that.gridSelector?.hoverAt(null);
            that.markerTooltip.hoverAt(row, event);
        } else {
            const rect = map.getCanvas().getBoundingClientRect();
            const point = [event.clientX - rect.left, event.clientY - rect.top];
            const cellId = that.gridVisible && that.gridSelector ? hortis.libreMap.eventToProp(map, {point}, "cellId") : null;
            if (hortis.isValue(cellId) && that.gridSelector.hoverId === cellId) {
                // Dispatched as MapLibre dispatches a click, to the map's click handlers - see hortis.libreMap.bindClick
                map.fire("click", {point, lngLat: map.unproject(point), originalEvent: event});
            }
            that.markerTooltip.hoverAt(null);
            that.gridSelector?.hoverAt(cellId, event);
        }
    };
    record.down = event => {
        record.start = event.pointerType === "touch" && event.isPrimary ?
            {id: event.pointerId, x: event.clientX, y: event.clientY, time: event.timeStamp} : null;
    };
    record.up = event => {
        const start = record.start;
        record.start = null;
        if (start && event.pointerId === start.id && event.timeStamp - start.time <= hortis.libreMap.tapDuration &&
            Math.hypot(event.clientX - start.x, event.clientY - start.y) <= hortis.libreMap.tapSlop) {
            tap(event);
        }
    };
    record.cancel = () => {
        record.start = null;
    };
    // A move begun by a gesture, rather than by the map's own animation, leaves the tooltip behind its cell or marker
    record.moveStart = event => {
        if (event.originalEvent) {
            hideAll();
        }
    };
    record.container.addEventListener("pointerdown", record.down, true);
    record.container.addEventListener("pointerup", record.up, true);
    record.container.addEventListener("pointercancel", record.cancel, true);
    map.on("movestart", record.moveStart);
    return record;
};

hortis.libreMap.unbindTapTooltips = function (record) {
    record.container.removeAttribute("data-hortis-tap-tooltips");
    record.container.removeEventListener("pointerdown", record.down, true);
    record.container.removeEventListener("pointerup", record.up, true);
    record.container.removeEventListener("pointercancel", record.cancel, true);
    record.map.off("movestart", record.moveStart);
};

/**
 * Fade away the marker of an observation, removing it once it has faded.
 * @param {MarkerLayer} layer - The layer of markers
 * @param {Number|Object} rowKey - The key of the observation's marker - the index of its row
 * @param {Object} record - The marker's record
 */
hortis.libreMap.fadeMarker = function (layer, rowKey, record) {
    record.element.classList.remove("imerss-obs-marker-visible");
    const hovered = layer.that.markerTooltip.hoverId;
    if (hovered && (hovered[hortis.qdl.rowIndexSymbol] ?? hovered) === rowKey) {
        layer.that.markerTooltip.hoverAt(null);
    }
    record.removal = layer.window.setTimeout(() => {
        record.marker.remove();
        layer.markers.delete(rowKey);
    }, hortis.libreMap.markerFadeDuration);
};

/**
 * Bring the markers of a map into line with the observations to be marked - those of observations no longer marked
 * fade away, and those of newly marked ones fade in.
 * @param {MarkerLayer} layer - The layer of markers
 * @param {maplibregl.Map} map - The loaded map, on which the markers wait
 * @param {Object[]} rows - The observations to be marked
 * @param {Object|null} selectedRecord - The selected record, whose marker is distinguished
 */
hortis.libreMap.updateMarkers = function (layer, map, rows, selectedRecord) {
    // Markers are keyed by the index of their row, since a row is read afresh as an object whenever it is wanted
    const key = row => row[hortis.qdl.rowIndexSymbol] ?? row;
    const wanted = new Set(rows.map(key));
    layer.markers.forEach((record, rowKey) => {
        if (!wanted.has(rowKey) && !record.removal) {
            hortis.libreMap.fadeMarker(layer, rowKey, record);
        }
    });
    rows.forEach(row => {
        const existing = layer.markers.get(key(row));
        if (existing) {
            if (existing.removal) {
                // Fading away, but wanted again
                layer.window.clearTimeout(existing.removal);
                existing.removal = null;
                existing.element.classList.add("imerss-obs-marker-visible");
            }
        } else {
            layer.markers.set(key(row), hortis.libreMap.addMarker(layer, row));
        }
    });
    const selectedKey = selectedRecord ? key(selectedRecord) : undefined;
    layer.markers.forEach((record, rowKey) => hortis.toggleClass(record.element, "imerss-obs-marker-selected", rowKey === selectedKey));
};

/**
 * Call a function once a map has stopped moving - after any smooth move begun in the same turn or once the layout has
 * settled, e.g. by fitting the map to newly filtered observations, has finished.
 * @param {maplibregl.Map} map - The map
 * @param {Function} func - The function to call
 */
hortis.libreMap.whenStill = function (map, func) {
    hortis.libreMap.afterLayout(map, () => {
        if (map.isMoving()) {
            map.once("moveend", () => hortis.libreMap.whenStill(map, func));
        } else {
            func();
        }
    });
};

/**
 * Smoothly centre a map, without zooming, on a selected record, once any move in progress has finished.
 * @param {maplibregl.Map} map - The loaded map
 * @param {Object|null} row - The selected record, if any
 * @param {Number} duration - The duration in milliseconds of the move
 */
hortis.libreMap.centreRecord = function (map, row, duration) {
    const point = row && hortis.rowPoint(row);
    if (point) {
        hortis.libreMap.whenStill(map, () => map.easeTo({center: point, duration, essential: true}));
    }
};

// The record selected on the map or in a table of records, whose marker alone is shown. It is a filter, held in the
// URL and reset with the others, but it narrows only the map - it is not among the filters narrowing the observations,
// so that the table it was chosen from keeps its rows, and the map keeps its zoom
fluid.def("hortis.libreMap.recordSelector", {
    $layers: ["hortis.filter", "hortis.summarisedFilter", "hortis.urlMappedFilter", "hortis.libreMap.clickHandler"],
    // The id of the selected record, as computed by hortis.libreMap.recordId
    filterState: null,
    urlKey: "record",
    idField: "{libreMap}.recordIdField",
    // Finds records by id, and the ids of records - see hortis.libreMap.recordIndex
    recordIndex: "$compute:hortis.libreMap.recordIndex({vizLoader}.pkg, {self}.idField)",
    selectedRow: "$compute:hortis.libreMap.recordSelector.selectedRow({self}.recordIndex, {self}.filterState)",
    filterSummary: "$compute:hortis.libreMap.recordSelector.summarise({self}.filterState)",
    // Toggles the selection of a record, or clears it if supplied null
    select: "$method:hortis.libreMap.recordSelector.select({self}, {0}:row)",
    reset: "$method:hortis.libreMap.recordSelector.reset({self})",
    resetSelection: "$method:hortis.libreMap.recordSelector.reset({self})",
    handle: "$method:hortis.libreMap.recordSelector.handle({0}:event)"
});

/**
 * Compute the id of an observation - its value of the id field, or else its index.
 * @param {Object} row - The observation
 * @param {Number} index - Its index amongst all observations
 * @param {String} idField - The field holding its id
 * @return {String} The observation's id
 */
hortis.libreMap.recordId = function (row, index, idField) {
    const id = row[idField];
    return hortis.isValue(id) && id !== "" ? String(id) : "#" + index;
};


/**
 * Index the observations by their ids, lazily - nothing is computed until a record is sought.
 * @param {VizPackage} pkg - The data package
 * @param {String} idField - The field holding an observation's id
 * @return {Object} The index, with members `byId`, whose `get` accepts an id and returns the first observation bearing
 * it in its id field, or that with the index given by an id of the form "#<index>", as a row object, `ids`, whose `get`
 * accepts a row object and returns its id, and the method `recordsOf`, accepting a field and a value and returning a
 * pair of each observation with that value and its id
 */
hortis.libreMap.recordIndex = function (pkg, idField) {
    const obs = fluid.unwrapProxy(pkg).tables.obs;
    return {
        byId: {
            get: function (recordId) {
                const id = String(recordId);
                const index = id.startsWith("#") ? Number(id.substring(1)) : hortis.qdl.findRow(obs, idField, id);
                return index >= 0 && index < obs.rowCount ? hortis.qdl.rowObject(obs, index) : undefined;
            }
        },
        ids: {
            get: row => hortis.libreMap.recordId(row, row[hortis.qdl.rowIndexSymbol], idField)
        },
        recordsOf: function (field, value) {
            const ids = hortis.query(pkg, {from: "obs", where: [{field, op: "=", value}], select: {rows: true}}).rows;
            return hortis.qdl.rowObjects(obs, ids).map(row => [row, hortis.libreMap.recordId(row, row[hortis.qdl.rowIndexSymbol], idField)]);
        }
    };
};

/**
 * Find the record selected by its id.
 * @param {Object} recordIndex - The index of the observations, as computed by hortis.libreMap.recordIndex
 * @param {String|null} filterState - The id of the selected record, if any
 * @return {Object|null} The record, as a row object, or null if none is selected or none has the id
 */
hortis.libreMap.recordSelector.selectedRow = (recordIndex, filterState) => hortis.isValue(filterState) ? recordIndex.byId.get(filterState) ?? null : null;

hortis.libreMap.recordSelector.summarise = function (filterState) {
    return {count: hortis.isValue(filterState) ? 1 : 0, dot: true, title: "A record is selected"};
};

/**
 * Toggle the selection of a record.
 * @param {hortis.libreMap.recordSelector} that - The selector
 * @param {Object|null} row - The record, or null to clear the selection
 */
hortis.libreMap.recordSelector.select = function (that, row) {
    const id = row ? hortis.libreMap.recordId(row, row[hortis.qdl.rowIndexSymbol], that.idField) : null;
    that.filterState = hortis.isValue(id) && id !== that.filterState ? id : null;
};

hortis.libreMap.recordSelector.reset = function (that) {
    that.filterState = null;
};

// A click on a marker is handled by the marker itself - it is claimed here so that it doesn't reset the selection
hortis.libreMap.recordSelector.handle = event => !!event.originalEvent?.target?.closest?.(".imerss-obs-marker");

fluid.def("hortis.libreObsMap", {
    $layers: ["hortis.libreMap.withObsGrid", "hortis.libreMap"]
});

// Adds to a map with an observation grid a legend showing the range of observation counts of each colour of its cells,
// and the width of a cell
fluid.def("hortis.libreMap.withObsGridLegend", {
    legendStops: 5,
    legendPosition: "bottom-right",
    legendMarkup: `$compute:hortis.libreMap.obsGridLegendMarkup({self}.obsQuantiser.grid, {self}.fillStops, {self}.legendStops,
        {self}.maxObsCountOverride, {self}.inverseCountTransform, {self}.obsQuantiser.longResolution, {self}.obsQuantiser.baseLatitude)`,
    legend: {
        $bindable: {
            bind: "hortis.libreMap.addLegend({self}.readyMap, {self}.legendPosition, {global}.document)",
            unbind: "hortis.libreMap.removeLegend({self}.readyMap, {boundValue})",
            onceOnly: true
        }
    },
    renderLegend: "$effect:hortis.libreMap.renderLegend({self}.legend, {self}.legendMarkup, {self}.gridShown)"
});

/**
 * Add an empty legend to a map as a control.
 * @param {maplibregl.Map} map - The map
 * @param {String} legendPosition - The corner of the map holding the legend, e.g. "bottom-left"
 * @param {Document} dokkument - The document holding the map
 * @return {Object} The control, whose `container` is the legend's element
 */
hortis.libreMap.addLegend = function (map, legendPosition, dokkument) {
    const container = dokkument.createElement("div");
    container.classList.add("imerss-legend");
    const control = {container, onAdd: () => container, onRemove: () => container.remove()};
    map.addControl(control, legendPosition);
    return control;
};

hortis.libreMap.removeLegend = function (map, control) {
    map.removeControl(control);
};

hortis.libreMap.renderLegend = function (control, markup, gridVisible) {
    control.container.innerHTML = markup;
    hortis.toggleClass(control.container, "fl-hidden", !gridVisible);
};

hortis.libreMap.legendRowTemplate = `
<div class="imerss-legend-row" title="%rowTitle">
    <span class="imerss-legend-icon"></span>
    <span class="imerss-legend-preview" style="%previewStyle"></span>
    <span class="imerss-legend-label">%keyLabel</span>
</div>`;

/**
 * Render the markup of the legend of an observation grid.
 * @param {Object} grid - The grid, as computed by `hortis.obsQuantiser.indexObs`
 * @param {Array[]} fillStops - The colour stops of the grid's cells
 * @param {Number} legendStops - The number of rows of the legend
 * @param {Number|null} maxObsCountOverride - A count to be taken as the maximum in place of the grid's own
 * @param {String} inverseCountTransform - Global name of the inverse of the transform applied to each cell's proportion
 * @param {Number} longResolution - The width of a cell in degrees of longitude
 * @param {Number} baseLatitude - The latitude at which the width of a cell is measured
 * @return {String} The legend's markup
 */
hortis.libreMap.obsGridLegendMarkup = function (grid, fillStops, legendStops, maxObsCountOverride, inverseCountTransform, longResolution, baseLatitude) {
    const maxObsCount = maxObsCountOverride || grid.maxObsCount;
    const inverse = fluid.getGlobalValue(inverseCountTransform);
    const memoStops = fluid.colour.memoStops(fillStops, 256);
    const props = fluid.iota(legendStops + 1).map(stop => stop / legendStops);
    const propToLevel = prop => prop >= 1 ? maxObsCount : Math.round(inverse(prop, maxObsCount) * maxObsCount);
    const rows = fluid.iota(legendStops).map(stop => {
        const label = propToLevel(props[stop]) + " - " + propToLevel(props[stop + 1]);
        return hortis.stringTemplate(hortis.libreMap.legendRowTemplate, {
            previewStyle: "background-color: " + fluid.colour.lookupStop(memoStops, (props[stop] + props[stop + 1]) / 2),
            keyLabel: label,
            rowTitle: "Grid cells holding " + label + " observations"
        });
    });
    const cellWidth = Math.round(longResolution * hortis.longitudeLength(baseLatitude));
    return "<div class=\"imerss-legend-title\" title=\"Number of observations falling within each grid cell\">Observation count</div>" +
        rows.join("\n") + `<div class="imerss-legend-cell-size" title="Width of each grid cell in metres">Cell size: ${cellWidth}m</div>`;
};

hortis.vizGridTooltipTemplate =
`<div class="imerss-tooltip imerss-grid-tooltip">
    <div><b>Observations:</b> %obsCount</div>
    <div class="text"><b>Taxa:</b> %taxonCount<div>%taxa</div></div>
    %footer
</div>`;

/**
 * Render the tooltip of a grid cell, listing the ten taxa with the most observations in it.
 * @param {Object} grid - The grid, whose `buckets` hold each cell's observations by taxon id
 * @param {Object<String, TaxonRow>} rowById - Map of taxon id to taxon row
 * @param {String} cellId - The id of the hovered cell
 * @return {String|null} The tooltip's markup, or null if the cell holds no observations
 */
hortis.renderVizGridTooltip = function (grid, rowById, cellId) {
    const bucket = grid.buckets[cellId];
    let togo = null;
    if (bucket) {
        const rowTemplate = "<div>%taxonName: %obsCount observation%s</div>";
        const rows = Object.entries(grid.taxaOf(cellId)).map(([taxonId, obsCount]) => ({
            taxonName: rowById[taxonId]?.iNaturalistTaxonName || "Unknown",
            obsCount,
            s: obsCount === 1 ? "" : "s"
        })).sort((rowa, rowb) => rowb.obsCount - rowa.obsCount);
        const shown = rows.slice(0, 10);
        togo = hortis.stringTemplate(hortis.vizGridTooltipTemplate, {
            obsCount: bucket.obsCount,
            taxonCount: rows.length,
            taxa: shown.map(row => hortis.stringTemplate(rowTemplate, row)).join("\n"),
            footer: rows.length > 10 ? "<div class=\"text\">...</div>" : ""
        });
    }
    return togo;
};
