/*
Copyright 2017-2023 Antranig Basman
Licensed under the Educational Community License (ECL), Version 2.0 or the New
BSD license. You may not use this file except in compliance with one these
Licenses.
You may obtain a copy of the ECL 2.0 License and BSD License at
https://github.com/fluid-project/infusion/raw/master/Infusion-LICENSE.txt
*/

/* global MapboxDraw */

"use strict";

// Attested in demos and in https://github.com/maplibre/maplibre-gl-js/issues/2601
MapboxDraw.constants.classes.CONTROL_BASE  = "maplibregl-ctrl";
MapboxDraw.constants.classes.CONTROL_PREFIX = "maplibregl-ctrl-";
MapboxDraw.constants.classes.CONTROL_GROUP = "maplibregl-ctrl-group";

fluid.defaults("hortis.libreMap.withPolygonDraw", {
    components: {
        polygonDraw: {
            type: "hortis.libreMap.polygonFilter"
        }
    }
});

// Currently combine draw UI and filter, could break apart
fluid.defaults("hortis.libreMap.polygonFilter", {
    gradeNames: ["hortis.filter", "hortis.dataDrivenFilter", "fluid.component"],
    mapboxDrawOptions: {
        displayControlsDefault: false,
        controls: {
            polygon: true,
            trash: true
        }
    },
    invokers: {
        updateArea: "hortis.libreMap.polygonFilter.updateArea({that})",
        doFilter: "hortis.libreMap.polygonFilter.doFilter({arguments}.0, {arguments}.1)",
        reset: "hortis.libreMap.polygonFilter.reset({that})"
    },
    members: {
        // filterState holds "features" array from GeoJSON FeatureCollection
        // Right now just initialises "point" member on each row but could intern and cache in future
        pointCache: "@expand:fluid.effect(hortis.libreMap.polygonFilter.pointCache, {that}.obsRows)",
        filterState: "@expand:signal([])",
        drawMode: "@expand:signal(null)",
        mapboxDraw: "@expand:hortis.libreMap.makeMapboxDraw({hortis.libreMap}.map, {that}.options.mapboxDrawOptions, {that}.updateArea, {that}.drawMode)"
    }
});

hortis.libreMap.polygonFilter.pointCache = function (obsRows) {
    // Taken from landlocked.js which seems to be only historical site feeding into point-in-polygon.js
    obsRows.forEach(row => row.point = [hortis.parseFloat(row.decimalLongitude), hortis.parseFloat(row.decimalLatitude)]);
};

hortis.libreMap.polygonFilter.doFilter = function (obsRows, filterState) {
    const none = filterState.length === 0;

    return none ? obsRows : obsRows.filter(row => hortis.intersectsAnyFeature(filterState, row));
};

hortis.libreMap.polygonFilter.reset = function (that) {
    that.mapboxDraw.deleteAll();
    that.filterState.value = [];
};

hortis.libreMap.polygonFilter.updateArea = function (that) {
    that.filterState.value = that.mapboxDraw.getAll().features;
};

hortis.libreMap.makeMapboxDraw = function (map, mapboxDrawOptions, updateArea, drawMode) {
    const draw = new MapboxDraw(mapboxDrawOptions);
    map.addControl(draw);
    map.on("draw.create", updateArea);
    map.on("draw.delete", updateArea);
    map.on("draw.update", updateArea);
    map.on("draw.modechange", mode => {
        console.log("New mode ", mode);
        drawMode.value = mode;
    });
    return draw;
};