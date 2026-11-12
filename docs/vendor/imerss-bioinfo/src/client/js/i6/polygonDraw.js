/*
Copyright 2017-2026 Antranig Basman
Licensed under the Educational Community License (ECL), Version 2.0 or the New
BSD license. You may not use this file except in compliance with one these
Licenses.
You may obtain a copy of the ECL 2.0 License and BSD License at
https://github.com/fluid-project/infusion/raw/master/Infusion-LICENSE.txt
*/

/* global MapboxDraw */

"use strict";

// Polygon drawing on the map, filtering observations to those within the drawn polygons, ported to Infusion 6 -
// corresponds to the since removed src/client/js/new/polygon-draw.js

// noinspection ES6ConvertVarToLetConst // otherwise this is a duplicate on minifying
var hortis = fluid.registerNamespace("hortis");

if (typeof(MapboxDraw) !== "undefined") {
    // Attested in demos and in https://github.com/maplibre/maplibre-gl-js/issues/2601
    MapboxDraw.constants.classes.CONTROL_BASE = "maplibregl-ctrl";
    MapboxDraw.constants.classes.CONTROL_PREFIX = "maplibregl-ctrl-";
    MapboxDraw.constants.classes.CONTROL_GROUP = "maplibregl-ctrl-group";
}

fluid.def("hortis.libreMap.withPolygonDraw", {
    polygonDraw: {
        $component: {
            $layers: "hortis.libreMap.polygonFilter"
        }
    }
});

fluid.def("hortis.libreMap.polygonFilter", {
    $layers: ["hortis.obsDrivenFilter", "hortis.urlMappedFilter"],
    urlKey: "polygon",
    urlCodec: "hortis.urlCodecs.polygons",
    mapboxDrawOptions: {
        displayControlsDefault: false,
        controls: {
            polygon: true,
            trash: true
        }
    },
    // The "features" array of the GeoJSON FeatureCollection drawn
    filterState: [],
    drawMode: null,
    // The point of each observation, in the form expected by hortis.intersectsAnyFeature, cached by row
    pointCache: "$compute:hortis.libreMap.polygonFilter.pointCache({self}.obsRows)",
    filterSummary: "$compute:hortis.libreMap.polygonFilter.summarise({self}.filterState)",
    doFilter: "$method:hortis.libreMap.polygonFilter.doFilter({0}:obsRows, {1}:filterState, {self}.pointCache)",
    reset: "$method:hortis.libreMap.polygonFilter.reset({self})",
    // Bound to the styled map, since MapboxDraw's layers would not survive the application of the map's style
    mapboxDraw: {
        $bindable: {
            bind: "hortis.libreMap.polygonFilter.makeDraw({self}, {libreMap}.readyMap, {self}.mapboxDrawOptions, {global}.MapboxDraw)",
            unbind: "hortis.libreMap.polygonFilter.removeDraw({boundValue})",
            onceOnly: true
        }
    },
    // Redraws the polygons whenever the state departs from what is drawn, e.g. on navigating back through the URL's
    // history. A state which arose from the drawing itself agrees with it, and is left alone
    syncDraw: "$effect:hortis.libreMap.polygonFilter.syncDraw({self}.filterState, {self}.mapboxDraw)"
});

hortis.libreMap.polygonFilter.pointCache = function (obsRows) {
    return new Map(obsRows.map(row => [row, {[hortis.pointSymbol]: [hortis.parseFloat(row.decimalLongitude), hortis.parseFloat(row.decimalLatitude)]}]));
};

hortis.libreMap.polygonFilter.summarise = function (filterState) {
    return hortis.countSummary(filterState.length, ["polygon", "polygons"]);
};

/**
 * Filter observations to those lying within any of the polygons drawn. The polygons arrive as component material, read
 * through a proxy which tracks each access - since every observation is tested against every vertex of the polygons,
 * their bare values are read instead, which is many times faster.
 * @param {Object[]} obsRows - The observations
 * @param {Object[]} filterState - The polygons drawn, as GeoJSON features, possibly as a proxy
 * @param {Map<Object, Object>} pointCache - Map of each observation to its point, possibly as a proxy
 * @return {Object[]} The observations within any of the polygons
 */
hortis.libreMap.polygonFilter.doFilter = function (obsRows, filterState, pointCache) {
    const features = fluid.unwrapProxy(filterState);
    const points = fluid.unwrapProxy(pointCache);
    return features.length === 0 ? obsRows : obsRows.filter(row => hortis.intersectsAnyFeature(features, points.get(row)));
};

hortis.libreMap.polygonFilter.reset = function (that) {
    that.filterState = [];
};

/**
 * Draw the polygons of a filter's state, unless they agree with those already drawn. Polygons are compared in their
 * encoding for the URL, which is blind to the ids and properties MapboxDraw assigns to them, and are drawn as decoded
 * from it, since MapboxDraw accepts only plain GeoJSON rather than the proxied state.
 * @param {Object[]} filterState - The GeoJSON features of the filter's state
 * @param {Object} record - The record of the bound draw control, as returned by `hortis.libreMap.polygonFilter.makeDraw`
 */
hortis.libreMap.polygonFilter.syncDraw = function (filterState, record) {
    const codec = hortis.urlCodecs.polygons;
    const encoded = codec.encode(filterState);
    if (encoded !== codec.encode(record.draw.getAll().features)) {
        record.draw.set({type: "FeatureCollection", features: codec.decode(encoded)});
    }
};

hortis.libreMap.polygonFilter.makeDraw = function (that, map, mapboxDrawOptions, MapboxDraw) {
    let togo;
    if (MapboxDraw) {
        const draw = new MapboxDraw(fluid.copy(mapboxDrawOptions));
        map.addControl(draw, "top-left");
        const updateArea = () => that.filterState = draw.getAll().features;
        const modeChange = e => that.drawMode = e.mode;
        const listeners = {"draw.create": updateArea, "draw.delete": updateArea, "draw.update": updateArea, "draw.modechange": modeChange};
        Object.entries(listeners).forEach(([event, listener]) => map.on(event, listener));
        // MapboxDraw's trash deletes only the polygons selected, and polygons restored from the URL are drawn unselected
        // - so with none selected, the trash deletes them all. Heard before MapboxDraw's own handler, while the
        // selection is still as the user left it
        const trashButton = map.getContainer().querySelector(".mapbox-gl-draw_trash");
        const trashAll = () => {
            if (draw.getSelectedIds().length === 0 && draw.getAll().features.length > 0) {
                draw.deleteAll();
                updateArea();
            }
        };
        trashButton?.addEventListener("click", trashAll, true);
        togo = {map, draw, listeners, trashButton, trashAll};
    } else {
        togo = fluid.unavailable({message: "The MapboxDraw library is not loaded", variety: "config"});
    }
    return togo;
};

hortis.libreMap.polygonFilter.removeDraw = function (record) {
    Object.entries(record.listeners).forEach(([event, listener]) => record.map.off(event, listener));
    record.trashButton?.removeEventListener("click", record.trashAll, true);
    record.map.removeControl(record.draw);
};

/** Polygons held in the URL **/

// The number of decimal places to which the coordinates of polygons held in the URL are rounded - about a metre
hortis.urlCodecs.polygonPrecision = 5;

/**
 * Render the rings of a polygon as Well-Known Text, without its type.
 * @param {Number[][][]} rings - The polygon's rings, each an array of [longitude, latitude] positions
 * @return {String} The rings, e.g. "((-123.1 49.2,-123.2 49.3,-123.1 49.2))"
 */
hortis.urlCodecs.ringsToWKT = function (rings) {
    const round = value => +value.toFixed(hortis.urlCodecs.polygonPrecision);
    return "(" + rings.map(ring => "(" + ring.map(([lng, lat]) => round(lng) + " " + round(lat)).join(",") + ")").join(",") + ")";
};

/**
 * Parse the rings of a polygon rendered by hortis.urlCodecs.ringsToWKT.
 * @param {String} text - The rings, with their enclosing parentheses
 * @return {Number[][][]} The polygon's rings
 */
hortis.urlCodecs.WKTToRings = function (text) {
    return [...text.matchAll(/\(([^()]+)\)/g)].map(match => match[1].split(",").map(position => position.trim().split(/\s+/).map(Number)));
};

// The polygons drawn on the map, as the features of a GeoJSON FeatureCollection, held as Well-Known Text - a POLYGON
// for one polygon, or a MULTIPOLYGON for several
hortis.urlCodecs.polygons = {
    encode: function (features) {
        const polygons = (features || []).filter(feature => feature.geometry?.type === "Polygon").map(feature => hortis.urlCodecs.ringsToWKT(feature.geometry.coordinates));
        return polygons.length === 0 ? undefined : polygons.length === 1 ? "POLYGON" + polygons[0] : "MULTIPOLYGON(" + polygons.join(",") + ")";
    },
    decode: function (text) {
        let polygons = [];
        if (typeof(text) === "string" && text.startsWith("MULTIPOLYGON(")) {
            polygons = [...text.slice("MULTIPOLYGON(".length, -1).matchAll(/\((\([^()]+\)(?:,\([^()]+\))*)\)/g)].map(match => match[0]);
        } else if (typeof(text) === "string" && text.startsWith("POLYGON(")) {
            polygons = [text.slice("POLYGON".length)];
        }
        return polygons.map((polygon, i) => ({
            id: "url-polygon-" + i,
            type: "Feature",
            properties: {},
            geometry: {type: "Polygon", coordinates: hortis.urlCodecs.WKTToRings(polygon)}
        }));
    }
};
