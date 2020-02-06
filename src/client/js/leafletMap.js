/* global L */

"use strict";

var hortis = fluid.registerNamespace("hortis");

fluid.defaults("hortis.leafletMap", {
    gradeNames: "fluid.viewComponent",
    selectors: {
        datasetControls: ".fld-bagatelle-dataset-controls",
        map: ".fld-bagatelle-map",
        tooltip: ".fld-bagatelle-map-tooltip"
    },
    members: {
        map: "@expand:L.map({that}.dom.map.0, {that}.options.mapOptions)"
    },
    markup: {
        tooltip: "<div class=\"fld-bagatelle-map-tooltip\"></div>",
        tooltipHeader: "<table>",
        tooltipRow: "<tr><td class=\"fl-taxonDisplay-key\">%key: </td><td class=\"fl-taxonDisplay-value\">%value</td>",
        tooltipFooter: "</table>"
    },
    fitBounds: [[48.865,-123.65],[49.005,-123.25]],
    listeners: {
        "onCreate.fitBounds": "hortis.leafletMap.fitBounds({that}.map, {that}.options.fitBounds)",
        "onCreate.createTooltip": "hortis.leafletMap.createTooltip"
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
        },
        datasetPanes: {
            sources: "{that}.options.datasets",
            type: "hortis.datasetPane",
            options: {
                members: {
                    map: "{leafletMap}.map"
                },
                datasetId: "{sourcePath}"
            }
        },
        datasetControls: {
            sources: "{that}.options.datasets",
            type: "hortis.datasetControl",
            options: {
                parentContainer: "{leafletMap}.dom.datasetControls",
                dataset: "{source}",
                datasetId: "{sourcePath}"
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
    // heatHigh: "#ff0000",
    components: {
        quantiser: {
            type: "hortis.quantiser",
            options: {
                baseLatitude: "{leafletMap}.options.fitBounds.0.0",
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

hortis.leafletMap.createTooltip = function (that) {
    var tooltip = $(that.options.markup.tooltip).appendTo(that.container);
    tooltip.hide();
    that.map.createPane("hortis-tooltip", tooltip[0]);
};

hortis.rectFromCorner = function (tl, latres, longres) {
    return [
        [tl[0], tl[1]],
        [tl[0], tl[1] + longres],
        [tl[0] + latres, tl[1] + longres],
        [tl[0] + latres, tl[1]]
    ];
};

fluid.defaults("hortis.datasetPane", {
    gradeNames: "fluid.component",
    // datasetId
    listeners: {
        "onCreate.createPane": "hortis.datasetPane.createPane"
    }
});

hortis.datasetPane.createPane = function (that) {
    that.map.createPane(that.options.datasetId);
};


fluid.defaults("hortis.datasetControl", {
    gradeNames: "fluid.author.containerRenderingView",
    selectors: {
        legend: ".fld-bagatelle-dataset-legend",
        enable: ".fld-bagatelle-dataset-checkbox",
        name: ".fld-bagatelle-dataset-name"
    },
    // dataset, datasetId
    markup: {
        container: "<div class=\"fld-bagatelle-dataset-control\">" +
                 "<span class=\"fld-bagatelle-dataset-legend\"></span>" +
                 "<input class=\"fld-bagatelle-dataset-checkbox\" type=\"checkbox\"/>" +
                 "<span class=\"fld-bagatelle-dataset-name\"></span>" +
             "</div>"
    },
    invokers: {
        togglePane: "hortis.datasetControl.togglePane({map}.map, {arguments}.0, {arguments}.1)"
    },
    listeners: {
        "onCreate.renderControl": "hortis.datasetControl.render"
    }
});

hortis.datasetControl.togglePane = function (map, pane, state) {
    var paneElement = map.getPane(pane);
    $(paneElement).toggle(state);
};

hortis.datasetControl.render = function (that) {
    that.locate("legend").css("background-color", that.options.dataset.colour);
    that.locate("name").text(that.options.dataset.name);
    var checkbox = that.locate("enable");
    checkbox.prop("checked", true);
    checkbox.change(function () {
        that.togglePane(that.options.datasetId, checkbox.prop("checked"));
    });
};

hortis.leafletMap.tooltipRow = function (map, key, value) {
    return fluid.stringTemplate(map.options.markup.tooltipRow, {key: key, value: value});
};

hortis.leafletMap.renderObsId = function (obsId) {
    var dataset = hortis.datasetIdFromObs(obsId);
    if (dataset === "iNat") {
        var localId = hortis.localIdFromObs(obsId);
        return fluid.stringTemplate("iNaturalist: <a target=\"_blank\" href=\"https://www.inaturalist.org/observations/%obsId\">%obsId</a>", {
            obsId: localId
        });
    } else {
        return obsId;
    }
};

hortis.leafletMap.updateTooltip = function (map, bucket, polygon) {
    var text = map.options.markup.tooltipHeader;
    var dumpRow = function (key, value) {
        text += hortis.leafletMap.tooltipRow(map, key, value);
    };
    var c = function (value) {
        return value.toFixed(3);
    };
    var tooltip = map.locate("tooltip");
    dumpRow("Observation Count", bucket.count);
    var lat0 = polygon[0][0], lat1 = polygon[2][0];
    var lng0 = polygon[0][1], lng1 = polygon[1][1];
    dumpRow("Latitude", c(lat0) + " to " + c(lat1));
    dumpRow("Longitude", c(lng0) + " to " + c(lng1));
    dumpRow("Dimensions", ((lat1 - lat0) * hortis.latitudeLength(lat0)).toFixed(0) + "m x " +
        ((lng1 - lng0) * hortis.longitudeLength(lat0)).toFixed(0) + "m");
    if (bucket.count < 5) {
        var obs = fluid.flatten(Object.values(bucket.byTaxonId));
        var obsString = fluid.transform(obs, hortis.leafletMap.renderObsId).join("<br/>");
        dumpRow("Observations", obsString);
    }
    text += map.options.markup.tooltipFooter;
    tooltip[0].innerHTML = text;
    tooltip.show();
};

hortis.leafletMap.drawGrid = function (map, quantiser) {
    var latres = quantiser.model.latResolution, longres = quantiser.model.longResolution;
    var heatLow = fluid.colour.hexToArray(map.options.heatLow);
    fluid.each(quantiser.datasets, function (dataset, datasetId) {
        var mapDataset = map.options.datasets[datasetId];
        var heatHigh = fluid.colour.hexToArray(mapDataset.colour);
        fluid.each(dataset.buckets, function (bucket, key) {
            var topLeft = hortis.quantiser.indexToCoord(key, latres, longres);
            var polygon = hortis.rectFromCorner(topLeft, latres, longres);
            var prop = Math.pow(bucket.count / dataset.maxCount, 0.25);
            var fillColour = fluid.colour.interpolate(prop, heatLow, heatHigh);
            var Lpolygon = L.polygon(polygon, fluid.extend({}, map.options.gridStyle, {
                fillColor: fluid.colour.arrayToString(fillColour),
                fillOpacity: .5,
                pane: datasetId
            })).addTo(map.map);
            Lpolygon.on("mouseover", function () {
                hortis.leafletMap.updateTooltip(map, bucket, polygon);
            });
        });
    });
};

fluid.defaults("hortis.sunburstLoaderWithMap", {
    gradeNames: "hortis.sunburstLoader",
    selectors: {
        mapHolder: ".fld-bagatelle-map-holder"
    },
    events: {
        sunburstLoaded: null
    },
    markupTemplate: "%resourceBase/html/bagatelle-map.html",
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
            container: "{sunburstLoaderWithMap}.dom.mapHolder",
            createOnEvent: "sunburstLoaded",
            options: {
                datasets: "{sunburst}.options.viz.datasets",
                geoJSONMapLayers: "{sunburstLoaderWithMap}.options.geoJSONMapLayers"
            }
        }
    }
});

// From https://en.wikipedia.org/wiki/Longitude#Length_of_a_degree_of_longitude
hortis.WGS84a = 6378137;
hortis.WGS84b = 6356752.3142;
hortis.WGS84e2 = (hortis.WGS84a * hortis.WGS84a - hortis.WGS84b * hortis.WGS84b) / (hortis.WGS84a * hortis.WGS84a);

hortis.longitudeLength = function (latitude) {
    var latrad = Math.PI * latitude / 180;
    var sinrad = Math.sin(latrad);
    return Math.PI * hortis.WGS84a * Math.cos(latrad) / (180 * Math.sqrt(1 - hortis.WGS84e2 * sinrad * sinrad));
};

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

fluid.defaults("hortis.quantiser", {
    gradeNames: "fluid.modelComponent",
    baseLatitude: 51,
    model: {
        longResolution: 0.005
    },
    modelRelay: {
        latResolution: {
            target: "latResolution",
            singleTransform: {
                type: "fluid.transforms.free",
                args: ["{that}.model.longResolution", "{that}.options.baseLatitude"],
                func: "hortis.longToLat"
            }
        }
    },
    members: {
        datasets: {
           // hash of datasetId to {maxCount, buckets}
           // where buckets is hash of id to {count, byId}
        }
    },
    events: {
        indexUpdated: null
    },
    invokers: {
        indexObs: "hortis.quantiser.indexObs({that}, {arguments}.0, {arguments}.1, {arguments}.2)", // coord, obsId, id
        indexTree: "hortis.quantiser.indexTree({that})" // flatTree
    },
    modelListeners: {
        "latResolution": {
            func: "{that}.indexTree"
        }
    }
});

hortis.quantiser.indexToCoord = function (index, latres, longres) {
    var coords = index.split("|");
    return [coords[0] * latres, coords[1] * longres];
};

hortis.quantiser.coordToIndex = function (coord, latres, longres) {
    var lat = Math.floor(coord[0] / latres);
    var lng = Math.floor(coord[1] / longres);
    return lat + "|" + lng;
};

hortis.datasetIdFromObs = function (obsId) {
    var colpos = obsId.indexOf(":");
    return obsId.substring(0, colpos);
};

hortis.localIdFromObs = function (obsId) {
    var colpos = obsId.indexOf(":");
    return obsId.substring(colpos + 1);
};

hortis.quantiser.indexObs = function (that, coord, obsId, rowId) {
    var coordIndex = hortis.quantiser.coordToIndex(coord, that.model.latResolution, that.model.longResolution);
    var datasetId = hortis.datasetIdFromObs(obsId);
    var dataset = that.datasets[datasetId];
    if (!dataset) {
        that.datasets[datasetId] = dataset = {maxCount: 0, buckets: {}};
    }
    var existing = dataset.buckets[coordIndex];
    if (!existing) {
        existing = dataset.buckets[coordIndex] = {count: 0, byTaxonId: {}};
    }
    ++existing.count;
    dataset.maxCount = Math.max(dataset.maxCount, existing.count);
    var existWithin = existing.byTaxonId[rowId];
    if (!existWithin) {
        existWithin = existing.byTaxonId[rowId] = [];
    }
    existWithin.push(obsId);
};

hortis.quantiser.indexTree = function (that) {
    that.flatTree.forEach(function (row) {
        if (row.coords) {
            var coords = JSON.parse(row.coords);
            fluid.each(coords, function (coord, obsId) {
                that.indexObs(coord, obsId, row.iNaturalistTaxonId);
            });
        }
    });
    // Just so we don't run ahead of subcomponent construction. Probably remove this once we upgrade framework
    fluid.invokeLater(that.events.indexUpdated.fire);
};
