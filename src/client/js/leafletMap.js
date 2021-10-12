/* global L */

"use strict";

var hortis = fluid.registerNamespace("hortis");

fluid.defaults("hortis.leafletMap", {
    gradeNames: "fluid.viewComponent",
    selectors: {
        datasetControls: ".fld-bagatelle-dataset-controls",
        map: ".fld-bagatelle-map",
        tooltip: ".fld-bagatelle-map-tooltip",
        grid: ".fld-bagatelle-map-grid"
    },
    members: {
        map: "@expand:L.map({that}.dom.map.0, {that}.options.mapOptions)"
    },
    datasets: {},
    model: {
        mapInitialised: "@expand:{that}.events.buildMap.fire()",
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
        "buildMap.fitBounds": "hortis.leafletMap.fitBounds({that}.map, {that}.options.fitBounds)",
        "buildMap.createTooltip": "hortis.leafletMap.createTooltip({that}, {that}.options.markup)"
    },
    modelListeners: {
        drawGrid: {
            path: ["indexVersion", "datasetEnabled"],
            func: "{that}.drawGrid"
        },
        updateTooltip: {
            path: ["mapBlockTooltipId", "indexVersion", "datasetEnabled"],
            priority: "after:drawGrid",
            excludeSource: "init",
            func: "hortis.leafletMap.updateTooltip",
            args: ["{that}", "{that}.model.mapBlockTooltipId"]
        },
        updateTooltipHighlight: {
            path: "mapBlockTooltipId",
            excludeSource: "init",
            func: "hortis.leafletMap.updateTooltipHighlight",
            args: ["{that}", "{change}.oldValue"]
        },
        drawScale: {
            path: "{quantiser}.model.squareSide",
            func: "hortis.leafletMap.drawScale",
            args: ["{that}", "{change}.value"]
        }
    },
    modelRelay: {
        renderDatasetControls: {
            target: "datasetControls",
            func: "hortis.renderDatasetControls",
            args: ["{that}.model.datasetEnabled", "{that}.quantiser.model.squareSide", "{that}.options.datasets", "{that}.quantiser", "{that}.model.indexVersion"]
        }
    },
    invokers: {
        drawGrid: "hortis.leafletMap.drawGrid({that}, {that}.quantiser, {that}.model.datasetEnabled)"
    },
    dynamicComponents: {
        geoJSONLayers: {
            sources: "{that}.options.geoJSONMapLayers",
            type: "hortis.geoJSONMapLayer",
            options: {
                layer: "{source}"
            }
        },
        datasetControls: {
            sources: "{that}.model.datasetControls",
            type: "{source}.type",
            options: {
                model: {
                    datasetControl: "{source}"
                }
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
                model: {
                    indexVersion: "{leafletMap}.model.indexVersion"
                }
            }
        }
    }
});


hortis.datasetEnabledModel = function (datasets) {
    return fluid.transform(datasets, function () {
        return true;
    });
};

hortis.intersect = function (target, source) {
    fluid.each(target, function (value, key) {
        if (!(key in source)) {
            delete target[key];
        }
    });
};

hortis.combineDatasets = function (enabledList, quantiserDatasets) {
    var intersect;
    var union = {
        obsCount: 0,
        buckets: {},
        byTaxonId: {}
    };
    enabledList.forEach(function (enabled) {
        var dataset = quantiserDatasets[enabled];
        if (!intersect) {
            intersect = {
                buckets: fluid.extend({}, dataset.buckets),
                byTaxonId: fluid.extend({}, dataset.byTaxonId)
            };
        } else {
            hortis.intersect(intersect.buckets, dataset.buckets);
            hortis.intersect(intersect.byTaxonId, dataset.byTaxonId);
        }
        fluid.extend(union.buckets, dataset.buckets);
        fluid.extend(union.byTaxonId, dataset.byTaxonId);
        union.obsCount += dataset.totalCount;
    });
    return {
        intersect: intersect,
        union: union
    };
};

hortis.renderDatasetControls = function (datasetEnabled, squareSide, datasets, quantiser, indexVersion) {
    console.log("renderDatasetControls executing for indexVersion " + indexVersion);
    var togo = [{
        type: "hortis.datasetControlHeader"
    }];

    fluid.each(datasets, function (dataset, datasetId) {
        togo.push({
            type: "hortis.datasetControl",
            datasetId: datasetId,
            dataset: dataset,
            quantiserDataset: quantiser.datasets[datasetId]
        });
    });
    var enabledList = fluid.transforms.setMembershipToArray(datasetEnabled);

    var createFooter = function (prefix, dataset) {
        if (prefix) {
            hortis.quantiser.datasetToSummary(dataset, squareSide);
            dataset.obsCount = (prefix === "Union" ? dataset.obsCount : "");
        } else {
            dataset.taxaCount = dataset.area = dataset.obsCount = "";
        }
        togo.push(fluid.extend({
            type: "hortis.datasetControlFooter",
            text: prefix ? prefix + " of " + enabledList.length + " datasets" : ""
        }, dataset));
    };
    if (enabledList.length > 1 && Object.keys(quantiser.datasets).length > 0) { // TODO: Ensure that relay pulls quantiser on startup!
        var combinedDatasets = hortis.combineDatasets(enabledList, quantiser.datasets);
        createFooter("Intersection", combinedDatasets.intersect);
        createFooter("Union", combinedDatasets.union);
    } else {
        createFooter("", {});
        createFooter("", {});
    }
    return togo;
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
        map.fitBounds(fitBounds);
    }
};

hortis.leafletMap.createTooltip = function (that, markup) {
    var tooltip = $(markup.tooltip).appendTo(that.container);
    tooltip.hide();
    that.map.createPane("hortis-tooltip", tooltip[0]);
    that.map.createPane("hortis-grid");
    that.gridGroup = L.layerGroup({pane: "hortis-grid"}).addTo(that.map);
    var container = that.map.getContainer();
    $(container).on("click", function (event) {
        if (event.target === container) {
            that.applier.change("mapBlockTooltipId", null);
        }
    });
};

hortis.rectFromCorner = function (tl, latres, longres) {
    return [
        [tl[0], tl[1]],
        [tl[0], tl[1] + longres],
        [tl[0] + latres, tl[1] + longres],
        [tl[0] + latres, tl[1]]
    ];
};

fluid.defaults("hortis.datasetControlBase", {
    gradeNames: "fluid.containerRenderingView",
    parentContainer: "{leafletMap}.dom.datasetControls"
});

fluid.defaults("hortis.datasetControlHeader", {
    gradeNames: "hortis.datasetControlBase",
    markup: {
        container: "<tr class=\"fld-bagatelle-dataset-control\">" +
                 "<td fl-bagatelle-dataset-legend-column></td>" +
                 "<td fl-bagatelle-dataset-checkbox-column></td>" +
                 "<td fl-bagatelle-dataset-name-column></td>" +
                 "%extraColumns</tr>",
        cell: "<td class=\"%columnClass\">%text</td>"
    },
    invokers: {
        renderMarkup: "hortis.datasetControl.renderMarkup({that}.options.markup, true)"
    }
});

fluid.defaults("hortis.datasetControl", {
    gradeNames: "hortis.datasetControlBase",
    selectors: {
        legend: ".fld-bagatelle-dataset-legend",
        enable: ".fld-bagatelle-dataset-checkbox",
        name: ".fld-bagatelle-dataset-name"
    },
    datasetId: "{source}.datasetId", // Stupid, creates circularity if we try to resolve model segment from model on line 274
    model: {
        datasetEnabled: true
    },
    modelRelay: {
        checkbox: { // TODO: avoid the footgun where the user has not written "value" on the checkbox markup
            source: "dom.enable.value",
            target: "datasetEnabled"
        },
        name: {
            source: "datasetControl.dataset.name",
            target: "dom.name.text"
        },
        // TODO: bind legend using integral style
        datasetEnabled: {
            target: "datasetEnabled",
            source: {
                context: "hortis.leafletMap",
                segs: ["datasetEnabled", "{that}.options.datasetId"]
            }
        },
        colour: {
            source: "datasetControl.dataset.colour",
            target: "dom.legend.style.backgroundColor"
        }
    },
    invokers: {
        renderMarkup: "hortis.datasetControl.renderMarkup({that}.options.markup, false, {that}.model.dataset, {quantiser}.datasets, {that}.options.datasetId)"
    },
    markup: {
        container: "<tr class=\"fld-bagatelle-dataset-control\">" +
                 "<td fl-bagatelle-dataset-legend-column><span class=\"fld-bagatelle-dataset-legend\"></span></td>" +
                 "<td fl-bagatelle-dataset-checkbox-column><input class=\"fld-bagatelle-dataset-checkbox\" type=\"checkbox\" value=\"true\"/></td>" +
                 "<td fl-bagatelle-dataset-name-column><span class=\"fld-bagatelle-dataset-name\"></span></td>" +
                 "%extraColumns</tr>",
        cell: "<td class=\"%columnClass\">%text</td>"
    }
});

fluid.defaults("hortis.datasetControlFooter", {
    gradeNames: "hortis.datasetControlBase",
    selectors: {
        text: ".fl-bagatelle-dataset-text",
        obsCount: ".fl-bagatelle-dataset-obs",
        taxaCount: ".fl-bagatelle-dataset-taxa",
        area: ".fl-bagatelle-dataset-area"
    },
    markup: {
        container: "<tr><td></td><td></td><td class=\"fl-bagatelle-dataset-text\"></td><td class=\"fl-bagatelle-dataset-obs\"></td><td class=\"fl-bagatelle-dataset-taxa\"></td><td class=\"fl-bagatelle-dataset-area\"></td></tr>"
    },
    modelRelay: {
        text: {
            source: "datasetControl.text",
            target: "dom.text.text"
        },
        obsCount: {
            source: "datasetControl.obsCount",
            target: "dom.obsCount.text"
        },
        taxaCount: {
            source: "datasetControl.taxaCount",
            target: "dom.taxaCount.text"
        },
        area: {
            source: "datasetControl.area",
            target: "dom.area.text"
        }
    }
});


hortis.datasetControl.columnNames = {
    totalCount: {
        name: "Obs count",
        clazz: "fl-bagatelle-obs-count-column"
    },
    taxaCount: {
        name: "Richness",
        clazz: "fl-bagatelle-taxa-count-column"
    },
    area: {
        name: "Area (km²)",
        clazz: "fl-bagatelle-area-column"
    }
};

hortis.datasetControl.renderExtraColumns = function (markup, isHeader, dataset, quantiserDataset) {
    var extraColumns = fluid.transform(hortis.datasetControl.columnNames, function (columnInfo, key) {
        return fluid.stringTemplate(markup, {
            columnClass: columnInfo.clazz,
            text: isHeader ? columnInfo.name : quantiserDataset[key]
        });
    });
    return Object.values(extraColumns).join("\n");
};

hortis.datasetControl.renderMarkup = function (markup, isHeader, dataset, quantiserDatasets, datasetId) {
    // Whilst we believe we have stuck this into the "source" model, it never actually arrives in the parent relay before rendering starts
    var quantiserDataset = quantiserDatasets && quantiserDatasets[datasetId];
    var extraColumns = hortis.datasetControl.renderExtraColumns(markup.cell, isHeader, dataset, quantiserDataset);
    return fluid.stringTemplate(markup.container, {
        extraColumns: extraColumns
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

hortis.leafletMap.updateTooltipHighlight = function (map, oldKey) {
    if (oldKey) {
        var oldBucket = map.toPlot[oldKey];
        if (oldBucket) {
            var element = oldBucket.Lpolygon.getElement();
            element.classList.remove("fl-bagatelle-highlightBlock");
        }
    }
};

hortis.leafletMap.drawScale = function (map, squareSide) {
    var dimText = squareSide.toFixed(0) + "m";
    map.container.find(".leaflet-bottom.leaflet-left").text("Block size: " + dimText + " x " + dimText);
};

hortis.leafletMap.updateTooltip = function (map, key) {
    var tooltip = map.locate("tooltip");
    var bucket = map.toPlot[key];
    if (bucket) {
        var text = map.options.markup.tooltipHeader;
        var dumpRow = function (key, value) {
            text += hortis.leafletMap.tooltipRow(map, key, value);
        };
        var c = function (value) {
            return value.toFixed(3);
        };
        dumpRow("Observation Count", bucket.count);
        dumpRow("Species Richness", Object.values(bucket.byTaxonId).length);
        var p = bucket.polygon;
        var lat0 = p[0][0], lat1 = p[2][0];
        var lng0 = p[0][1], lng1 = p[1][1];
        dumpRow("Latitude", c(lat0) + " to " + c(lat1));
        dumpRow("Longitude", c(lng0) + " to " + c(lng1));
        if (bucket.count < 5 && map.options.showObsListInTooltip) {
            var obs = fluid.flatten(Object.values(bucket.byTaxonId));
            var obsString = fluid.transform(obs, hortis.leafletMap.renderObsId).join("<br/>");
            dumpRow("Observations", obsString);
        }
        text += map.options.markup.tooltipFooter;
        tooltip[0].innerHTML = text;
        tooltip.show();
        var element = bucket.Lpolygon.getElement();
        element.classList.add("fl-bagatelle-highlightBlock");
        var parent = element.parentNode;
        parent.insertBefore(element, null);
    } else {
        tooltip.hide();
    }
};

hortis.leafletMap.drawGrid = function (map, quantiser, datasetEnabled) {
    map.gridGroup.clearLayers();

    var latres = quantiser.model.latResolution, longres = quantiser.model.longResolution;
    var heatLow = fluid.colour.hexToArray(map.options.heatLow);
    var toPlot = map.toPlot = {};
    fluid.each(quantiser.datasets, function (dataset, datasetId) {
        if (datasetEnabled[datasetId]) {
            var mapDataset = map.options.datasets[datasetId];
            var heatHigh = fluid.colour.hexToArray(mapDataset.colour);
            fluid.each(dataset.buckets, function (bucket, key) {
                var prop = Math.pow(bucket.count / dataset.maxCount, 0.25);
                var fillColour = fluid.colour.interpolate(prop, heatLow, heatHigh);
                fluid.model.setSimple(toPlot, [key, "colours", datasetId], fillColour);
                var plotBucket = toPlot[key];
                plotBucket.count = plotBucket.count || 0;
                plotBucket.count += bucket.count;
                plotBucket.byTaxonId = fluid.extend({}, plotBucket.byTaxonId, bucket.byTaxonId);
            });
        }
    });
    fluid.each(toPlot, function (bucket, key) {
        var colours = fluid.values(bucket.colours);
        var colour = fluid.colour.average(colours);
        var topLeft = hortis.quantiser.indexToCoord(key, latres, longres);
        bucket.polygon = hortis.rectFromCorner(topLeft, latres, longres);
        bucket.Lpolygon = L.polygon(bucket.polygon, fluid.extend({}, map.options.gridStyle, {
            fillColor: fluid.colour.arrayToString(colour),
            pane: "hortis-grid"
        }));
        map.gridGroup.addLayer(bucket.Lpolygon);
        bucket.Lpolygon.on("mouseover", function () {
            map.applier.change("mapBlockTooltipId", key);
        });
    });
    if (!toPlot[map.model.mapBlockTooltipId]) {
        map.applier.change("mapBlockTooltipId", null);
    }
};


hortis.projectBounds = {
    Galiano: [[48.855,-123.65],[49.005,-123.25]],
    Valdes: [[49.000, -123.798],[49.144,-123.504]]
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
                gradeNames: "hortis.mapWithSunburst",
                fitBounds: "{hortis.configHolder}.options.mapBounds",
                showObsListInTooltip: "{hortis.configHolder}.options.showObsListInTooltip"
            }
        }
    }
});

fluid.defaults("hortis.mapLoaderWithoutSunburst", {
    // TODO: Refactor this obvious insanity
    gradeNames: "hortis.sunburstLoaderWithMap",
    markupTemplate: "%resourceBase/html/bagatelle-map-only.html"
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

fluid.defaults("hortis.quantiser", {
    gradeNames: "fluid.modelComponent",
    baseLatitude: 51,
    model: {
        longResolution: 0.005,
        indexVersion: 0
    },
    modelRelay: {
        latResolution: {
            target: "latResolution",
            singleTransform: {
                type: "fluid.transforms.free",
                args: ["{that}.model.longResolution", "{that}.options.baseLatitude"],
                func: "hortis.longToLat"
            }
        },
        squareSide: {
            target: "squareSide",
            singleTransform: {
                type: "fluid.transforms.free",
                func: "hortis.quantiser.squareSide",
                args: ["{that}.options.baseLatitude", "{that}.model.latResolution"]
            }
        },
        index: {
            target: "indexVersion",
            singleTransform: {
                type: "fluid.transforms.free",
                args: ["{that}", "{that}.model.latResolution", "{that}.model.longResolution", "{that}.model.squareSide", "{that}.model.indexVersion"],
                func: "hortis.quantiser.indexTree"
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
        datasetToSummary: "hortis.quantiser.datasetToSummary({arguments}.0, {arguments}.1)", // bucket - will be modified
        indexObs: "hortis.quantiser.indexObs({that}, {arguments}.0, {arguments}.1, {arguments}.2, {arguments}.3, {arguments}.4)" // coord, obsId, id, latRes, longRes
    }
});

hortis.quantiser.squareSide = function (baseLatitude, latResolution) {
    return hortis.latitudeLength(baseLatitude) * latResolution;
};

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

hortis.quantiser.indexObs = function (that, coord, obsId, rowId, latResolution, longResolution) {
    var coordIndex = hortis.quantiser.coordToIndex(coord, latResolution, longResolution);
    var datasetId = hortis.datasetIdFromObs(obsId);
    var dataset = that.datasets[datasetId];
    if (!dataset) {
        that.datasets[datasetId] = dataset = {maxCount: 0, totalCount: 0, buckets: {}, byTaxonId: {}};
    }
    dataset.byTaxonId[rowId] = true;
    dataset.totalCount++;
    var bucket = dataset.buckets[coordIndex];
    if (!bucket) {
        bucket = dataset.buckets[coordIndex] = {count: 0, byTaxonId: {}};
    }
    bucket.count++;
    dataset.maxCount = Math.max(dataset.maxCount, bucket.count);
    var bucketTaxa = bucket.byTaxonId[rowId];
    if (!bucketTaxa) {
        bucketTaxa = bucket.byTaxonId[rowId] = [];
    }
    bucketTaxa.push(obsId);
};

hortis.quantiser.datasetToSummary = function (dataset, squareSide) {
    var squareArea = squareSide * squareSide / (1000 * 1000);
    dataset.taxaCount = Object.keys(dataset.byTaxonId).length;
    dataset.area = (Object.keys(dataset.buckets).length * squareArea).toFixed(2);
};

hortis.quantiser.indexTree = function (that, latResolution, longResolution, squareSide, indexVersion) {
    var withcoords = 0;
    for (var i = that.flatTree.length - 1; i >= 0; --i) {
        var row = that.flatTree[i];
        if (row.coords) {
            var coords = JSON.parse(row.coords);
            fluid.each(coords, function (coord, obsId) {
                ++withcoords;
                that.indexObs(coord, obsId, row.id, latResolution, longResolution);
            });
            row.ownCoordCount = Object.keys(coords).length;

        } else {
            row.ownCoordCount = 0;
        }
    };
    console.log("Total coordinate count: " + withcoords );

    fluid.each(that.datasets, function (dataset) {
        that.datasetToSummary(dataset, squareSide);
    });

    return indexVersion + 1;
};
