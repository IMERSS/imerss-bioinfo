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
// corresponds to src/client/js/new/polygon-draw.js

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
    $layers: "hortis.obsDrivenFilter",
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
            bind: "hortis.libreMap.polygonFilter.makeDraw({self}, {libreMap}.styledMap, {self}.mapboxDrawOptions, {global}.MapboxDraw)",
            unbind: "hortis.libreMap.polygonFilter.removeDraw({boundValue})",
            onceOnly: true
        }
    }
});

hortis.libreMap.polygonFilter.pointCache = function (obsRows) {
    return new Map(obsRows.map(row => [row, {[hortis.pointSymbol]: [hortis.parseFloat(row.decimalLongitude), hortis.parseFloat(row.decimalLatitude)]}]));
};

hortis.libreMap.polygonFilter.summarise = function (filterState) {
    return hortis.countSummary(filterState.length, ["polygon", "polygons"]);
};

hortis.libreMap.polygonFilter.doFilter = function (obsRows, filterState, pointCache) {
    return filterState.length === 0 ? obsRows : obsRows.filter(row => hortis.intersectsAnyFeature(filterState, pointCache.get(row)));
};

hortis.libreMap.polygonFilter.reset = function (that) {
    const record = that.mapboxDraw;
    // The draw control is unavailable if MapboxDraw is not loaded or the map has not yet styled
    if (typeof(record?.draw?.deleteAll) === "function") {
        record.draw.deleteAll();
    }
    that.filterState = [];
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
        togo = {map, draw, listeners};
    } else {
        togo = fluid.unavailable({message: "The MapboxDraw library is not loaded", variety: "config"});
    }
    return togo;
};

hortis.libreMap.polygonFilter.removeDraw = function (record) {
    Object.entries(record.listeners).forEach(([event, listener]) => record.map.off(event, listener));
    record.map.removeControl(record.draw);
};
