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
// Here each stage of readiness is a bindable holding the map once that stage is reached, and unavailable before -
//     map -> loadedMap -> fillPatternsLoaded -> styledMap
// so that every effect touching the style simply takes `styledMap` as its argument, and ordering falls out of
// availability rather than listener priorities.

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
    // selector: String - the selector of the map's container in the page markup
    zoomDuration: 1000,
    zoomControlsPosition: "top-left",
    style: hortis.blankMapStyle,
    fillPatternPath: "",
    fillPatterns: {},
    fillPatternPixelRatio: 6,
    mapContainer: "$compute:hortis.locateContainer({self}.selector, {global}.document)",
    // Constructed exactly once - rebuilding the map would lose its camera, sources and controls
    map: {
        $bindable: {
            bind: "hortis.libreMap.make({self}.mapContainer, {global}.maplibregl)",
            unbind: "hortis.libreMap.destroy({boundValue})",
            onceOnly: true
        }
    },
    loadedMap: {
        $bindable: {
            bind: "hortis.libreMap.whenLoaded({self}.map)"
        }
    },
    fillPatternsLoaded: {
        $bindable: {
            bind: "hortis.libreMap.loadFillPatterns({self}.loadedMap, {self}.fillPatternPath, {self}.fillPatterns, {self}.fillPatternPixelRatio)"
        }
    },
    // The real style is applied once fill patterns are loaded, since a style referring to them can't be interpreted
    // before. It is applied only once, since applying it again would remove every source and layer added since
    styledMap: {
        $bindable: {
            bind: "hortis.libreMap.applyStyle({self}.loadedMap, {self}.style, {self}.fillPatternsLoaded)",
            onceOnly: true
        }
    },
    zoom: {
        $bindable: {
            bind: "hortis.libreMap.trackZoom({self}.map)",
            unbind: "hortis.libreMap.untrack({boundValue})"
        }
    },
    zoomControls: {
        $bindable: {
            bind: "hortis.libreMap.zoomControls({self}.map, {global}.maplibregl, {self}.zoomDuration, {self}.zoomControlsPosition)",
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
 * @return {Cell<maplibregl.Map>} A cell holding the map once it has loaded
 */
hortis.libreMap.whenLoaded = function (map) {
    const togo = fluid.cell(fluid.unavailable({message: "Map is loading", variety: "pending"}), {name: "Loaded map"});
    if (map.loaded()) {
        togo.set(map);
    } else {
        // Very long-standing bugs with mapbox load event: https://github.com/mapbox/mapbox-gl-js/issues/6707
        // and https://github.com/mapbox/mapbox-gl-js/issues/9779
        map.once("load", () => togo.set(map));
    }
    return togo;
};

/**
 * Load fill pattern images into a map.
 * @param {maplibregl.Map} map - The loaded map
 * @param {String} fillPatternPath - The path holding the fill pattern images, each named by its fill pattern with suffix .png
 * @param {Object<String, any>} fillPatterns - The fill patterns to be loaded, as keys
 * @param {Number} pixelRatio - The pixel ratio with which the images are to be drawn
 * @return {Cell<Boolean>} A cell holding `true` once every image has been added to the map
 */
hortis.libreMap.loadFillPatterns = function (map, fillPatternPath, fillPatterns, pixelRatio) {
    const togo = fluid.cell(fluid.unavailable({message: "Fill patterns are loading", variety: "pending"}), {name: "Fill patterns loaded"});
    const loadOne = async fillPattern => {
        const image = await map.loadImage(fillPatternPath + fillPattern + ".png");
        // Explained in https://github.com/mapbox/mapbox-gl-js/pull/9372
        map.addImage(fillPattern, image.data, {pixelRatio});
    };
    Promise.all(Object.keys(fillPatterns).map(loadOne)).then(
        () => togo.set(true),
        err => togo.set(fluid.unavailable({message: "Error loading fill patterns: " + err, variety: "error"})));
    return togo;
};

/**
 * Apply a style to a loaded map.
 * @param {maplibregl.Map} map - The loaded map
 * @param {Object} style - The style to be applied
 * @return {Cell<maplibregl.Map>} A cell holding the map once the style has been applied
 */
hortis.libreMap.applyStyle = function (map, style) {
    const togo = fluid.cell(fluid.unavailable({message: "Map style is being applied", variety: "pending"}), {name: "Styled map"});
    map.once("styledata", () => togo.set(map));
    // Without diff: false, a style identical to the current one, e.g. the blank style of a map whose layers are all added
    // later, is diffed to nothing and no "styledata" event is ever fired
    map.setStyle(fluid.copy(style), {diff: false});
    if (map.isStyleLoaded()) {
        togo.set(map);
    }
    return togo;
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
    addTiles: "$effect:hortis.libreMap.addTileLayers({self}, {self}.styledMap, {self}.tileSets)"
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
    gridOpacity: "$compute:hortis.libreMap.computeGridOpacity({self}.gridVisible, {self}.fillOpacity)",
    gridBounds: "{self}.obsQuantiser.grid.bounds",
    gridFeature: `$compute:hortis.libreMap.obsGridFeature({self}.obsQuantiser.grid, {self}.obsQuantiser.latResolution,
        {self}.obsQuantiser.longResolution, {self}.maxObsCountOverride, {self}.countTransform)`,
    updateObsGrid: "$effect:hortis.libreMap.updateObsGrid({self}, {self}.styledMap, {self}.gridFeature, {self}.gridOpacity)",
    zoomToObsBoundsEffect: "$effect:hortis.libreMap.fitBounds({self}.styledMap, {self}.gridBounds, {self}.zoomToObsBounds, {self}.zoomDuration)"
});

hortis.libreMap.computeGridOpacity = function (gridVisible, fillOpacity) {
    return gridVisible ? fillOpacity : 0;
};

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
    $layers: ["hortis.libreMap.clickHandler", "hortis.obsFilter", "hortis.withTooltip"],
    filterState: null, // The id of the selected cell
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

fluid.def("hortis.libreObsMap", {
    $layers: ["hortis.libreMap.withObsGrid", "hortis.libreMap"]
});
