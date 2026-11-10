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
            unbind: "hortis.libreMap.untrack({boundValue})"
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
    return maplibregl ? new maplibregl.Map({container, style: fluid.copy(hortis.blankMapStyle)}) :
        fluid.unavailable({message: "The MapLibre library is not loaded", variety: "config"});
};

hortis.libreMap.destroy = function (map) {
    map.remove();
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

/**
 * Dispatch clicks on a map to the click handlers currently registered with a map component.
 * @param {hortis.libreMap} that - The map component
 * @param {maplibregl.Map} map - The map
 * @return {Object} A record of the listener for `hortis.libreMap.untrack`
 */
hortis.libreMap.bindClick = function (that, map) {
    const listener = e => {
        const handlers = that.clickHandlers;
        const handled = handlers.find(handler => handler.handle(e));
        if (!handled) {
            handlers.forEach(handler => handler.resetSelection());
        }
    };
    map.on("click", listener);
    return {map, event: "click", listener};
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
    rows.forEach(row => hortis.updateBounds(bounds, row.decimalLatitude, row.decimalLongitude));
    return bounds;
};

/** Observation grid **/

fluid.def("hortis.obsQuantiser", {
    $layers: "fluid.component",
    /** Grid resolution in metres */
    gridResolution: 100,
    baseLatitude: 49,
    // allObs: Object[] - all observations, which are allocated to cells once for each resolution
    // obsRows: Object[] - the observations to be gridded
    // Global name of a function constructing an empty bucket
    newBucket: "hortis.gridBucket",
    // Global name of a function indexing an observation into a bucket, accepting (bucket, row, index)
    indexObs: "hortis.indexObs",
    longResolution: "$compute:hortis.metresToLong({self}.gridResolution, {self}.baseLatitude)",
    latResolution: "$compute:hortis.longToLat({self}.longResolution, {self}.baseLatitude)",
    maxBounds: "$compute:hortis.obsBounds({self}.allObs)",
    // The cell of each observation, cached by row rather than written onto it
    cellIds: "$compute:hortis.obsQuantiser.cellIds({self}.allObs, {self}.latResolution, {self}.longResolution)",
    grid: `$compute:hortis.obsQuantiser.indexObs({self}.obsRows, {self}.cellIds, {self}.latResolution, {self}.longResolution,
        {self}.maxBounds, {self}.newBucket, {self}.indexObs)`
});

hortis.gridBucket = () => ({obsCount: 0, byTaxonId: {}});

hortis.indexObs = function (bucket, row, index) {
    fluid.pushArray(bucket.byTaxonId, hortis.rowToLinkTaxonId(row), index);
};

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
 * Computes a unique cell ID string for a given latitude and longitude, based on grid resolution.
 * @param {Number} lat - The latitude coordinate.
 * @param {Number} long - The longitude coordinate.
 * @param {Number} latres - The grid resolution for latitude.
 * @param {Number} longres - The grid resolution for longitude.
 * @return {String} The cell ID in the format "latIndex|longIndex".
 */
hortis.obsQuantiser.coordToCellId = function (lat, long, latres, longres) {
    return Math.floor(lat / latres) + "|" + Math.floor(long / longres);
};

/**
 * Allocate each observation to a grid cell.
 * @param {Object[]} allObs - The observations
 * @param {Number} latRes - The grid resolution for latitude
 * @param {Number} longRes - The grid resolution for longitude
 * @return {Map<Object, String>} Map of each observation row to its cell id
 */
hortis.obsQuantiser.cellIds = function (allObs, latRes, longRes) {
    return new Map(allObs.map(row => [row, hortis.obsQuantiser.coordToCellId(row.decimalLatitude, row.decimalLongitude, latRes, longRes)]));
};

/**
 * Index observations into grid cells.
 * @param {Object[]} rows - The observations to be gridded
 * @param {Map<Object, String>} cellIds - Map of each observation row to its cell id
 * @param {Number} latRes - The grid resolution for latitude
 * @param {Number} longRes - The grid resolution for longitude
 * @param {Number[][]} maxBounds - The bounds of all observations, used if there are none to be gridded
 * @param {String} newBucket - Global name of a function constructing an empty bucket
 * @param {String} indexObs - Global name of a function indexing an observation into a bucket
 * @return {Object} The grid, with members `buckets`, a map of cell id to bucket, `maxObsCount` and `bounds`
 */
hortis.obsQuantiser.indexObs = function (rows, cellIds, latRes, longRes, maxBounds, newBucket, indexObs) {
    const newBucketFunc = fluid.getGlobalValue(newBucket),
        indexObsFunc = fluid.getGlobalValue(indexObs);
    const grid = {bounds: hortis.initBounds(), maxObsCount: 0, buckets: {}};
    const now = Date.now();
    rows.forEach(function (row, index) {
        const cellId = cellIds.get(row);
        if (cellId !== "0|0") { // TODO: More principled way of detecting obs without coordinates = note that ""/0.5 === 0!
            hortis.updateBounds(grid.bounds, row.decimalLatitude, row.decimalLongitude);
            const bucket = grid.buckets[cellId] || (grid.buckets[cellId] = newBucketFunc());
            bucket.obsCount++;
            grid.maxObsCount = Math.max(grid.maxObsCount, bucket.obsCount);
            indexObsFunc(bucket, row, index);
        }
    });
    if (rows.length === 0) {
        grid.bounds = fluid.copy(maxBounds);
    }
    hortis.expandBounds(grid.bounds, 0.1, latRes * 6, longRes * 6); // mapBox fitBounds are a bit tight
    fluid.log("Gridded " + rows.length + " rows in " + (Date.now() - now) + " ms");
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
    outlineColour: "black",
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
            allObs: "{vizLoader}.obsRows",
            obsRows: "{vizLoader}.finalFilteredObs"
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
    viewportObs: "$compute:hortis.libreMap.viewportObs({self}.obsQuantiser.obsRows, {self}.viewBounds, {self}.markerPadding, {self}.markerThreshold)",
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
    zoomToObsBoundsEffect: `$effect:hortis.libreMap.fitObs({self}.readyMap, {self}.gridBounds, {self}.zoomToObsBounds, {self}.zoomDuration,
        {self}.homeCamera, {self}.obsQuantiser.obsRows.length, {self}.obsQuantiser.allObs.length)`
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
                "fill-outline-color": that.outlineColour
            },
            metadata: {
                sortKey: 100
            }
        });
        // Ensure that the numerous layers inserted by the MapboxDraw plugin, which have no sortKey, float on top of ours
        that.sortLayers(map);
    }
    map.setPaintProperty("obsgrid-layer", "fill-opacity", gridOpacity);
};

hortis.libreMap.swapBounds = function (bounds) {
    return bounds.map(coords => [coords[1], coords[0]]);
};

// Whether each map was last fitted to filtered observations, so that it returns to its home camera only once the
// filters are cleared, and not as the page loads, when its camera is placed by other means, e.g. a story's panes
hortis.libreMap.wasFiltered = new WeakMap();

/**
 * Move a map smoothly to show the filtered observations - fitted to their bounds while a filter narrows them, and back
 * to its home camera once none does, if it has one, or else fitted to the bounds of them all.
 * @param {maplibregl.Map} map - The loaded map
 * @param {Number[][]} bounds - The bounds of the filtered observations, as [[lat, long], [lat, long]]
 * @param {Boolean} zoomToObsBounds - Whether the map follows the observations at all
 * @param {Number} zoomDuration - The duration in milliseconds of the move
 * @param {Object|null} homeCamera - The camera, with members `center` and `zoom`, to return to, if any
 * @param {Number} filteredCount - The number of filtered observations
 * @param {Number} allCount - The number of all observations
 */
hortis.libreMap.fitObs = function (map, bounds, zoomToObsBounds, zoomDuration, homeCamera, filteredCount, allCount) {
    const filtered = filteredCount !== allCount;
    const wasFiltered = hortis.libreMap.wasFiltered.get(map);
    hortis.libreMap.wasFiltered.set(map, filtered);
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
 * Resolves a map event to a property value of the topmost visible feature at the event's point.
 * @param {maplibregl.Map} map - The MapLibre map instance.
 * @param {MapMouseEvent} e - A map mouse event containing a `point` property.
 * @param {String} propName - The name of the property to dereference
 * @return {String|null} The property's value, or null if no visible feature was found.
 */
hortis.libreMap.eventToProp = function (map, e, propName) {
    const features = map.queryRenderedFeatures(e.point);
    const visibleFeatures = features.filter(feature =>
        feature.layer.paint["fill-opacity"] > 0 ||
        feature.layer.paint["circle-opacity"] > 0);
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
    doFilter: "$method:hortis.libreMap.gridSelector.doFilter({0}:obsRows, {1}:filterState, {libreMap}.obsQuantiser.cellIds)",
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

hortis.libreMap.gridSelector.doFilter = function (obsRows, selectedCell, cellIds) {
    return selectedCell === null ? obsRows : obsRows.filter(row => cellIds.get(row) === selectedCell);
};

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
 * Determine whether an observation has coordinates - one without has none, or the placeholder 0, 0.
 * @param {Object} row - The observation
 * @return {Boolean} `true` if the observation has coordinates
 */
hortis.libreMap.hasCoords = function (row) {
    const lat = row.decimalLatitude, long = row.decimalLongitude;
    return hortis.isValue(lat) && hortis.isValue(long) && lat !== "" && long !== "" &&
        Number.isFinite(+lat) && Number.isFinite(+long) && !(+lat === 0 && +long === 0);
};

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
 * @param {Object[]} rows - The filtered observations
 * @param {Object|null} bounds - The viewport, with members `west`, `south`, `east` and `north`, or null if unknown
 * @param {Number} padding - The proportion of the viewport's size beyond it within which an observation is near it
 * @param {Number} threshold - The number of observations within the viewport at most which markers are shown - no
 * more than four times as many near ones are collected
 * @return {Object} Members `inView`, the number of observations within the viewport, and `nearby`, those within or
 * near it, up to the limit
 */
hortis.libreMap.viewportObs = function (rows, bounds, padding, threshold) {
    const togo = {inView: 0, nearby: []};
    if (bounds && threshold > 0) {
        const latPad = (bounds.north - bounds.south) * padding, longPad = (bounds.east - bounds.west) * padding;
        const limit = threshold * 4;
        rows.forEach(row => {
            if (hortis.libreMap.hasCoords(row)) {
                const lat = +row.decimalLatitude, long = +row.decimalLongitude;
                if (lat >= bounds.south - latPad && lat <= bounds.north + latPad && long >= bounds.west - longPad && long <= bounds.east + longPad) {
                    if (lat >= bounds.south && lat <= bounds.north && long >= bounds.west && long <= bounds.east) {
                        togo.inView++;
                    }
                    if (togo.nearby.length < limit) {
                        togo.nearby.push(row);
                    }
                }
            }
        });
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
        hideTimer: null, tooltipNode: null};
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
    const marker = new maplibregl.Marker({element, anchor: "bottom"})
        .setLngLat([+row.decimalLongitude, +row.decimalLatitude]).addTo(map);
    // Once the marker is in the document with its initial opacity, so that it fades in
    window.requestAnimationFrame(() => element.classList.add("imerss-obs-marker-visible"));
    return {marker, element};
};

/**
 * Fade away the marker of an observation, removing it once it has faded.
 * @param {MarkerLayer} layer - The layer of markers
 * @param {Object} row - The observation
 * @param {Object} record - The marker's record
 */
hortis.libreMap.fadeMarker = function (layer, row, record) {
    record.element.classList.remove("imerss-obs-marker-visible");
    if (layer.that.markerTooltip.hoverId === row) {
        layer.that.markerTooltip.hoverAt(null);
    }
    record.removal = layer.window.setTimeout(() => {
        record.marker.remove();
        layer.markers.delete(row);
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
    const wanted = new Set(rows);
    layer.markers.forEach((record, row) => {
        if (!wanted.has(row) && !record.removal) {
            hortis.libreMap.fadeMarker(layer, row, record);
        }
    });
    rows.forEach(row => {
        const existing = layer.markers.get(row);
        if (existing) {
            if (existing.removal) {
                // Fading away, but wanted again
                layer.window.clearTimeout(existing.removal);
                existing.removal = null;
                existing.element.classList.add("imerss-obs-marker-visible");
            }
        } else {
            layer.markers.set(row, hortis.libreMap.addMarker(layer, row));
        }
    });
    layer.markers.forEach((record, row) => hortis.toggleClass(record.element, "imerss-obs-marker-selected", row === selectedRecord));
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
    if (row && hortis.libreMap.hasCoords(row)) {
        hortis.libreMap.whenStill(map, () => map.easeTo({center: [+row.decimalLongitude, +row.decimalLatitude], duration, essential: true}));
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
    recordIndex: "$compute:hortis.libreMap.recordIndex({vizLoader}.obsRows, {self}.idField)",
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
 * Index all observations by their ids.
 * @param {Object[]} obsRows - All observations
 * @param {String} idField - The field holding an observation's id
 * @return {Object} Members `byId`, a Map of id to observation, and `ids`, a Map of observation to id
 */
hortis.libreMap.recordIndex = function (obsRows, idField) {
    const byId = new Map(), ids = new Map();
    obsRows.forEach((row, index) => {
        const id = hortis.libreMap.recordId(row, index, idField);
        // The first of any observations sharing an id wins, so that each id names one observation
        if (!byId.has(id)) {
            byId.set(id, row);
        }
        ids.set(row, id);
    });
    return {byId, ids};
};

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
    const id = row ? that.recordIndex.ids.get(row) : null;
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
        const rows = Object.entries(bucket.byTaxonId).map(([taxonId, obsIds]) => ({
            taxonName: rowById[taxonId]?.iNaturalistTaxonName || "Unknown",
            obsCount: obsIds.length,
            s: obsIds.length === 1 ? "" : "s"
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
