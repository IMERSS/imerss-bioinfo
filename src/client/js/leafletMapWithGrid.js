/* global L */

"use strict";

var hortis = fluid.registerNamespace("hortis");

fluid.defaults("hortis.leafletMap.withGrid", {
    selectors: {
        grid: ".fld-bagatelle-map-grid",
        datasetControls: ".fld-bagatelle-dataset-controls"
    },
    baseZoomForOutline: 11.9,
    modelListeners: {
        drawGrid: {
            path: ["indexVersion", "datasetEnabled"],
            func: "{that}.drawGrid"
        },
        zoomToOutline: {
            path: "zoom",
            listener: "hortis.leafletMap.updateOutlineWidth",
            args: ["{change}.value", "{that}.options.baseZoomForOutline", "{that}.container.0"]
        }
    },
    invokers: {
        drawGrid: "hortis.leafletMap.drawGrid({that}, {that}.quantiser, {that}.model.datasetEnabled)"
    },
    gridStyle: {
        className: "fld-bagatelle-map-region"
    },
    listeners: {
        "buildMap.addGrid": "hortis.leafletMap.withGrid.addGrid({that})"
    },
    modelRelay: {
        renderDatasetControls: { // This could be refined someday if we are ever required to produce dataset controls with non-square map regions
            target: "datasetControls",
            func: "hortis.renderDatasetControls",
            args: ["{that}.model.datasetEnabled", "{that}.quantiser.model.squareSide", "{that}.options.datasets", "{that}.quantiser", "{that}.model.indexVersion"]
        }
    },
    components: {
        quantiser: {
            type: "hortis.quantiser",
            options: {
                baseLatitude: "{leafletMap}.options.fitBounds.0.0",
                datasets: "{leafletMap}.options.datasets",
                model: {
                    indexVersion: "{leafletMap}.model.indexVersion"
                }
            }
        }
    },
    dynamicComponents: {
        datasetControls: {
            sources: "{that}.model.datasetControls",
            type: "{source}.type",
            options: {
                model: {
                    datasetControl: "{source}"
                }
            }
        }
    }
});

hortis.leafletMap.updateOutlineWidth = function (zoom, baseZoom, container) {
    var relativeZoom = Math.min(1, Math.pow(2, 2 * (zoom - baseZoom)));
    container.style.setProperty("--bagatelle-stroke-width", 2 * relativeZoom);
};

hortis.leafletMap.withGrid.addGrid = function (that) {
    that.map.createPane("hortis-grid");
    that.gridGroup = L.layerGroup({pane: "hortis-grid"}).addTo(that.map);
};

hortis.rectFromCorner = function (tl, latres, longres) {
    return [
        [tl[0], tl[1]],
        [tl[0], tl[1] + longres],
        [tl[0] + latres, tl[1] + longres],
        [tl[0] + latres, tl[1]]
    ];
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
        bucket.Lpolygon.on("click", function () {
            console.log("Map clicked on key ", key);
            map.applier.change("mapBlockTooltipId", key);
        });
    });
    if (!toPlot[map.model.mapBlockTooltipId]) {
        map.applier.change("mapBlockTooltipId", null);
    }
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
                args: ["{that}", "{that}.options.datasets", "{that}.model.latResolution", "{that}.model.longResolution", "{that}.model.squareSide", "{that}.model.indexVersion"],
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
    if (coord) {
        var lat = Math.floor(coord[0] / latres);
        var lng = Math.floor(coord[1] / longres);
        return lat + "|" + lng;
    } else {
        return "null";
    }
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
        fluid.fail("Found observation with unknown dataset " + datasetId);
    }

    dataset.byTaxonId[rowId] = true;
    dataset.totalCount++;
    if (coordIndex !== "null") {
        var bucket = dataset.buckets[coordIndex];
        if (!bucket) {
            bucket = dataset.buckets[coordIndex] = {count: 0, byTaxonId: {}};
        }
        bucket.count++;
        dataset.maxCount = Math.max(dataset.maxCount, bucket.count);
        var bucketTaxa = bucket.byTaxonId[rowId]; // TODO: use fluid.pushArray?
        if (!bucketTaxa) {
            bucketTaxa = bucket.byTaxonId[rowId] = [];
        }
        bucketTaxa.push(obsId);
    }
};

hortis.quantiser.datasetToSummary = function (dataset, squareSide) {
    var squareArea = squareSide * squareSide / (1000 * 1000);
    dataset.taxaCount = Object.keys(dataset.byTaxonId).length;
    dataset.area = (Object.keys(dataset.buckets).length * squareArea).toFixed(2);
};

hortis.quantiser.indexTree = function (that, datasets, latResolution, longResolution, squareSide, indexVersion) {
    that.datasets = fluid.transform(datasets, hortis.quantiserDataset);
    for (var i = that.flatTree.length - 1; i >= 0; --i) {
        var row = that.flatTree[i];
        if (row.coords) {
            var coords = JSON.parse(row.coords);
            fluid.each(coords, function (coord, obsId) {
                that.indexObs(coord, obsId, row.id, latResolution, longResolution);
            });
        }
    };

    fluid.each(that.datasets, function (dataset) {
        that.datasetToSummary(dataset, squareSide);
    });

    return indexVersion + 1;
};
