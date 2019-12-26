/* global L */

"use strict";

var hortis = fluid.registerNamespace("hortis");

fluid.defaults("hortis.leafletMap", {
    gradeNames: "fluid.viewComponent",
    members: {
        map: "@expand:L.map({that}.container.0, {that}.options.mapOptions)"
    },
    fitBounds: [[48.865,-123.65],[49.005,-123.25]],
    listeners: {
        "onCreate.fitBounds": "hortis.leafletMap.fitBounds({that}.map, {that}.options.fitBounds)"
    },
    invokers: {
        drawGrid: "hortis.leafletMap.drawGrid({that}, {that}.quantiser)"
    },
    dynamicComponents: {
        geoJSONLayers: {
            sources: "{that}.options.geoJSONMapLayers",
            type: "hortis.geoJSONMapLayer",
            options: {
                layer: "{source}"
            }
        }
    },
    mapOptions: {
        zoomSnap: 0.1
    },
    gridStyle: {
        color: "black",
        weight: 2.0,
        fillOpacity: 1
    },
    heatLow: "#ffffff",
    heatHigh: "#ff0000",
    components: {
        quantiser: {
            type: "hortis.quantiser",
            options: {
                listeners: {
                    indexUpdated: "{leafletMap}.drawGrid"
                }
            }
        }
    }
});

fluid.defaults("hortis.geoJSONMapLayer", {
    gradeNames: "fluid.component",
    style: {
        color: "black",
        weight: 1.0
    },
    listeners: {
        "onCreate.applyLayer": "hortis.applyGeoJSONMapLayer({that}, {hortis.leafletMap})"
    }
});

hortis.applyGeoJSONMapLayer = function (mapLayer, map) {
    L.geoJSON(mapLayer.options.layer, {
        style: mapLayer.options.style
    }).addTo(map.map);
};

hortis.leafletMap.fitBounds = function (map, fitBounds) {
    if (fitBounds) {
        map.fitBounds(fitBounds);
    }
};

hortis.squareFromCorner = function (tl, res) {
    return [
        [tl[0], tl[1]],
        [tl[0], tl[1] + res],
        [tl[0] + res, tl[1] + res],
        [tl[0] + res, tl[1]]
    ];
};

hortis.leafletMap.drawGrid = function (map, quantiser) {
    var resolution = quantiser.model.resolution;
    var heatHigh = fluid.colour.hexToArray(map.options.heatHigh);
    var heatLow = fluid.colour.hexToArray(map.options.heatLow);
    fluid.each(quantiser.buckets, function (bucket, key) {
        var topLeft = hortis.quantiser.indexToCoord(key, resolution);
        var polygon = hortis.squareFromCorner(topLeft, resolution);
        var prop = Math.pow(bucket.count / quantiser.maxCount, 0.5);
        var fillColour = fluid.colour.interpolate(prop, heatLow, heatHigh);
        var Lpolygon = L.polygon(polygon, fluid.extend({}, map.options.gridStyle, {fillColor: fluid.colour.arrayToString(fillColour)})).addTo(map.map);
        Lpolygon.bindTooltip("Observation count: " + bucket.count);
    });
};

fluid.defaults("hortis.sunburstLoaderWithMap", {
    gradeNames: "hortis.sunburstLoader",
    selectors: {
        map: ".fld-bagatelle-map"
    },
    events: {
        sunburstLoaded: null
    },
    distributeOptions: {
        sunburstLoaded: {
            target: "{that sunburst}.options.listeners.onCreate",
            record: "{hortis.sunburstLoaderWithMap}.events.sunburstLoaded.fire"
        },
        flatTree: {
            target: "{that quantiser}.options.members.flatTree",
            record: "@expand:fluid.identity({sunburst}.flatTree)"
        }
    },
    components: {
        map: {
            type: "hortis.leafletMap",
            container: "{sunburstLoaderWithMap}.dom.map",
            createOnEvent: "sunburstLoaded",
            options: {
                geoJSONMapLayers: "{sunburstLoaderWithMap}.options.geoJSONMapLayers"
            }
        }
    }
});

fluid.defaults("hortis.quantiser", {
    gradeNames: "fluid.modelComponent",
    model: {
        resolution: 0.005
    },
    maxCount: 0,
    buckets: {},
    events: {
        indexUpdated: null
    },
    invokers: {
        clearIndex: "hortis.quantiser.clearIndex({that})",
        indexObs: "hortis.quantiser.indexObs({that}, {arguments}.0, {arguments}.1)", // coord, id
        indexTree: "hortis.quantiser.indexTree({that})" // flatTree
    },
    modelListeners: {
        "resolution": {
            func: "{that}.indexTree"
        }
    }
});

hortis.quantiser.indexToCoord = function (index, resolution) {
    var coords = index.split("|");
    return [coords[0] * resolution, coords[1] * resolution];
};

hortis.quantiser.coordToIndex = function (coord, resolution) {
    var x = Math.floor(coord[0] / resolution);
    var y = Math.floor(coord[1] / resolution);
    return x + "|" + y;
};

hortis.quantiser.indexObs = function (that, coord, id) {
    var index = hortis.quantiser.coordToIndex(coord, that.model.resolution);
    var existing = that.buckets[index];
    if (!existing) {
        existing = that.buckets[index] = {count: 0, byId: {}};
    }
    ++existing.count;
    that.maxCount = Math.max(that.maxCount, existing.count);
    var existWithin = existing.byId[id];
    if (!existWithin) {
        existWithin = existing.byId[id] = {count: 0};
    }
    ++existWithin.count;
};

hortis.quantiser.clearIndex = function (that) {
    that.maxCount = 0;
    that.buckets = {};
};

hortis.quantiser.indexTree = function (that) {
    that.clearIndex();
    that.flatTree.forEach(function (row) {
        if (row.coords) {
            var coords = JSON.parse(row.coords);
            coords.forEach(function (coord) {
                that.indexObs(coord, row.id);
            });
        }
    });
    that.events.indexUpdated.fire();
};
