/* global L */

"use strict";

var hortis = fluid.registerNamespace("hortis");

// Workaround taken from https://github.com/Leaflet/Leaflet/issues/4745 to prevent coordinates being rounded to
// integers during rendering
L.Map.include({
    latLngToLayerPoint: function (latlng) {
        var projectedPoint = this.project(L.latLng(latlng));
        var togo = projectedPoint._subtract(this.getPixelOrigin());
        togo.x = fluid.roundToDecimal(togo.x, 3);
        togo.y = fluid.roundToDecimal(togo.y, 3);
        return togo;
    }
});

fluid.defaults("hortis.leafletMap", {
    gradeNames: ["fluid.viewComponent", "{sunburstLoader}.options.mapFlavourGrade"], // Not a distribution because of FLUID-5836
    selectors: {
        map: ".fld-bagatelle-map",
        tooltip: ".fld-bagatelle-map-tooltip"
    },
    members: {
        toPlot: {}, // General contract from grid map - indexed by "mapBlockId" to "bucket" - contains byTaxonId, count, Lpolygon (colours only used in drawGrid)
        // byTaxonId is hash of rowId to array of obsId as built in hortis.quantiser.indexObs - so count is equal to # of keys
        map: "@expand:L.map({that}.dom.map.0, {that}.options.mapOptions)"
    },
    datasets: {},
    model: {
        mapInitialised: "@expand:{that}.events.buildMap.fire()",
        // zoom: Number (0 - whole world -> 18 - maximal zoom)
        datasetEnabled: "@expand:hortis.datasetEnabledModel({that}.options.datasets)",
        mapBlockTooltipId: null
    },
    events: {
        buildMap: null
    },
    markup: {
        tooltip: "<div class=\"fld-bagatelle-map-tooltip\"></div>",
        grid: "<div class=\"fld-bagatelle-map-grid\"></div>",
        tooltipHeader: "<table>",
        tooltipRow: "<tr><td class=\"fl-taxonDisplay-key\">%key: </td><td class=\"fl-taxonDisplay-value\">%value</td>",
        tooltipFooter: "</table>"
    },
    // fitBounds: [[48.855,-123.65],[49.005,-123.25]],
    listeners: {
        "buildMap.bindZoom": "hortis.leafletMap.bindZoom({that})",
        "buildMap.fitBounds": "hortis.leafletMap.fitBounds({that}, {that}.options.fitBounds)",
        "buildMap.createTooltip": "hortis.leafletMap.createTooltip({that}, {that}.options.markup)",
        "buildMap.addTiles": "hortis.leafletMap.addTileLayer({that}.map, {that}.options.tileOptions)"
    },
    invokers: {
        // Perhaps this will one day be a "materialiser registration" and we will instead call applier.pullModel("zoom")
        acquireZoom: "hortis.leafletMap.acquireZoom({that})",
        fitBounds: "hortis.leafletMap.fitBounds({that}, {arguments}.0, {arguments}.1)"
    },
    dynamicComponents: {
        geoJSONLayers: { // Dumb, "global" geoJSON layers that are not interactive. Only historical example is json_Galiano_map_0, as per qgis2web exports
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
    heatLow: "#ffffff"
    // heatHigh: "#ff0000",
});

hortis.leafletMap.acquireZoom = function (map) {
    map.applier.change("zoom", map.map.getZoom());
};

hortis.leafletMap.bindZoom = function (map) {
    var leafletMap = map.map;
    // Note that we can't apply the change at startup because of FLUID-5498
    leafletMap.on("zoomend", function () {
        map.acquireZoom();
    });
};

// Mixin grades for leafletMap selecting different tile layers
fluid.defaults("hortis.streetmapTiles", {
    tileOptions: {
        tileUrl: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        tileAttribution: "&copy; <a href=\"https://www.openstreetmap.org/copyright\">OpenStreetMap</a> contributors"
    }
});

fluid.defaults("hortis.GBIFTiles", {
    tileOptions: {
        tileUrl: "https://tile.gbif.org/3857/omt/{z}/{x}/{y}@1x.png?style=gbif-classic",
        tileAttribution: "&copy <a href=\"https://www.openstreetmap.org/copyright\">OpenStreetMap</a> contributors, © <a href=\"https://openmaptiles.org/\">OpenMapTiles</a>, <a href=\"/citation-guidelines\">GBIF</a>"
    }
});

hortis.leafletMap.addTileLayer = function (map, tileOptions) {
    if (tileOptions && tileOptions.tileUrl) {
        L.tileLayer(tileOptions.tileUrl, {
            attribution: tileOptions.tileAttribution
        }).addTo(map);
    }
};

hortis.datasetEnabledModel = function (datasets) {
    return fluid.transform(datasets, function () {
        return true;
    });
};

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
        map.map.fitBounds(fitBounds);
        map.acquireZoom();
    }
};

hortis.leafletMap.createTooltip = function (that, markup) {
    var tooltip = $(markup.tooltip).appendTo(that.container);
    tooltip.hide();
    that.map.createPane("hortis-tooltip", tooltip[0]);
    var container = that.map.getContainer();
    var clearMapSelection = function () {
        that.applier.change("mapBlockTooltipId", null);
    };
    $(container).on("click", function (event) {
        if (event.target === container) {
            clearMapSelection();
        }
    });
    $(document).on("click", function (event) {
        var closest = event.target.closest(".fld-bagatelle-nodismiss-map");
        // Mysteriously SVG paths are not in the document
        if (!closest && event.target.closest("body")) {
            clearMapSelection();
        }
    });
};


hortis.projectBounds = {
    Galiano: [[48.855, -123.65], [49.005, -123.25]],
    Valdes: [[49.000, -123.798], [49.144, -123.504]],
    Xetthecum: [[48.93713, -123.5110], [48.9511, -123.4980]]
};

fluid.defaults("hortis.sunburstLoaderWithMap", {
    gradeNames: "hortis.sunburstLoader",
    selectors: {
        mapHolder: ".fld-bagatelle-map-holder"
    },
    events: {
        sunburstLoaded: null
    },
    mapBounds: hortis.projectBounds.Galiano,
    mapGrades: [],
    mapFlavourGrade: "hortis.leafletMap.withGrid", // swap out for "withRegions" for Xetthecum style map
    markupTemplate: "%resourceBase/html/bagatelle-map.html",
    distributeOptions: {
        sunburstLoaded: {
            target: "{that sunburst}.options.listeners.onCreate",
            record: "{hortis.sunburstLoaderWithMap}.events.sunburstLoaded.fire"
        },
        flatTree: {
            target: "{that quantiser}.options.members.flatTree",
            record: "@expand:fluid.identity({sunburst}.flatTree)"
        },
        mapGrades: {
            target: "{that map}.options.gradeNames",
            source: "{that}.options.mapGrades"
        }
    },
    components: {
        map: {
            type: "hortis.leafletMap",
            container: "{sunburstLoaderWithMap}.dom.mapHolder",
            createOnEvent: "sunburstLoaded",
            options: {
                gradeNames: "hortis.mapWithSunburst",
                fitBounds: "{hortis.configHolder}.options.mapBounds",
                showObsListInTooltip: "{hortis.configHolder}.options.showObsListInTooltip"
            }
        }
    }
});

// Mixin grade for sunburstLoader, currently used in Xetthecum driver
fluid.defaults("hortis.svgPatternLoader", {
    svgPatterns: "%resourceBase/html/xetthecum-patterns.html",
    resources: {
        svgPatterns: {
            url: "{that}.options.svgPatterns",
            dataType: "text"
        }
    },
    listeners: {
        "onResourcesLoaded.injectPatterns": {
            funcName: "hortis.injectSvgPatterns",
            args: ["{svgPatternLoader}.resources.svgPatterns.resourceText", "{that}.options.resourceBase", "{that}.container"]
        }
    }
});

hortis.injectSvgPatterns = function (patternText, resourceBase, container) {
    var expanded = patternText.replace(/%resourceBase/g, resourceBase);
    var patterns = $(expanded);
    container.append(patterns);
};

fluid.defaults("hortis.mapLoaderWithoutSunburst", {
    // TODO: Refactor this obvious insanity
    gradeNames: "hortis.sunburstLoaderWithMap",
    markupTemplate: "%resourceBase/html/bagatelle-map-only.html",
    components: {
        sunburst: {
            options: {
                model: {
                    visible: false
                },
                components: {
                    autocomplete: {
                        type: "fluid.emptySubcomponent"
                    },
                    tabs: {
                        type: "fluid.emptySubcomponent"
                    },
                    checklist: {
                        type: "fluid.emptySubcomponent"
                    }
                }
            }
        }
    }
});

fluid.defaults("hortis.mapWithSunburst", {
    modelListeners: {
        mapFocusedTooltipToSunburst: {
            path: "{map}.model.mapBlockTooltipId",
            func: "hortis.mapBlockToFocusedTaxa",
            args: ["{change}.value", "{map}", "{sunburst}"]
        }
    },
    datasets: "{sunburst}.viz.datasets",
    geoJSONMapLayers: "{sunburstLoaderWithMap}.options.geoJSONMapLayers"
});

// Can't use modelRelay because of https://issues.fluidproject.org/browse/FLUID-6208
hortis.mapBlockToFocusedTaxa = function (mapBlockTooltipId, map, sunburst) {
    var togo = {};
    if (mapBlockTooltipId) {
        var bucket = map.toPlot[mapBlockTooltipId];
        if (bucket) {
            fluid.each(bucket.byTaxonId, function (obs, taxonId) {
                togo[taxonId] = true;
            });
        }
    }
    // As transaction to avoid triggering hortis.updateRowFocus twice which then invokes beginZoom
    var trans = sunburst.applier.initiate();
    trans.change("rowFocus", null, "DELETE");
    trans.change("rowFocus", togo);
    trans.commit();
};

// From https://en.wikipedia.org/wiki/Longitude#Length_of_a_degree_of_longitude
hortis.WGS84a = 6378137;
hortis.WGS84b = 6356752.3142;
hortis.WGS84e2 = (hortis.WGS84a * hortis.WGS84a - hortis.WGS84b * hortis.WGS84b) / (hortis.WGS84a * hortis.WGS84a);

/** Length in metres for a degree of longitude at given latitude **/

hortis.longitudeLength = function (latitude) {
    var latrad = Math.PI * latitude / 180;
    var sinrad = Math.sin(latrad);
    return Math.PI * hortis.WGS84a * Math.cos(latrad) / (180 * Math.sqrt(1 - hortis.WGS84e2 * sinrad * sinrad));
};

/** Length in metres for a degree of latitude at given latitude **/

hortis.latitudeLength = function (latitude) {
    var latrad = Math.PI * latitude / 180;
    var sinrad = Math.sin(latrad);
    return Math.PI * hortis.WGS84a * (1 - hortis.WGS84e2) / (180 * Math.pow(1 - hortis.WGS84e2 * sinrad * sinrad, 1.5));
};

hortis.longToLat = function (lng, lat) {
    var longLength = hortis.longitudeLength(lat);
    var latLength = hortis.latitudeLength(lat);
    return lng * longLength / latLength;
};

hortis.quantiserDataset = function () {
    return {maxCount: 0, totalCount: 0, buckets: {}, byTaxonId: {}};
};
