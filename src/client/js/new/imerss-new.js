/*
Copyright 2017-2023 Antranig Basman
Licensed under the Educational Community License (ECL), Version 2.0 or the New
BSD license. You may not use this file except in compliance with one these
Licenses.
You may obtain a copy of the ECL 2.0 License and BSD License at
https://github.com/fluid-project/infusion/raw/master/Infusion-LICENSE.txt
*/

/* global Papa, maplibregl */

"use strict";

// noinspection ES6ConvertVarToLetConst // otherwise this is a duplicate on minifying
var hortis = fluid.registerNamespace("hortis");

fluid.defaults("hortis.csvReader", {
    gradeNames: "fluid.component",
    members: {
        completionPromise: "@expand:fluid.promise()"
    // beginParse: "@expand:hortis.csvReader.parse({that}, {that}.options.csvOptions, {that}.options.url)"
    },
    // url: null,
    csvOptions: {
        header: true,
        skipEmptyLines: true
    },
    events: {
    },
    listeners: {
        "onCreate.parse": "hortis.csvReader.parse({that}, {that}.options.csvOptions, {that}.options.url)"
    }
});

hortis.csvReader.parse = function (that, csvOptions, url) {
    const options = {
        ...csvOptions,
        complete: function (results) {
            that.parsed = results;
            that.data = results.data;
            that.headers = results.meta.fields;
            that.completionPromise.resolve(true);
        },
        error: function (err) {
            that.completionPromise.reject();
            fluid.fail("Error parsing CSV file ", url, ": ", err);
        }
    };
    Papa.parse(url, options);
};

fluid.defaults("hortis.urlCsvReader", {
    gradeNames: "hortis.csvReader",
    csvOptions: {
        download: true
    }
});



fluid.defaults("hortis.vizLoader", {
    gradeNames: ["fluid.resourceLoader"],
    // obsFile,
    // taxaFile
    components: {
        taxaLoader: {
            type: "hortis.urlCsvReader",
            options: {
                url: "{vizLoader}.options.taxaFile"
            }
        },
        obsLoader: {
            type: "hortis.urlCsvReader",
            options: {
                url: "{vizLoader}.options.obsFile"
            }
        },
        taxa: {
            type: "hortis.taxa",
            createOnEvent: "onResourcesLoaded",
            options: {
                members: {
                    rows: "{taxaLoader}.data"
                }
            }
        }
    },
    model: {
    //        taxaLoaded: "{that}.resources.taxa.parsed",
    //        obsLoaded: "{that}.resources.obs.parsed",
    },
    invokers: { // Deal with global selection model, e.g. via map selections
        filterEntries: "fluid.identity"
    },
    resources: {
        taxa: {
            promiseFunc: "fluid.identity",
            promiseArgs: "{that}.taxaLoader.completionPromise"
        },
        obs: {
            promiseFunc: "fluid.identity",
            promiseArgs: "{that}.obsLoader.completionPromise"
        }
    }
});

hortis.tooltipTemplate = "<div class=\"fl-imerss-tooltip\">" +
    "<div class=\"fl-imerss-photo\" style=\"background-image: url(%imgUrl)\"></div>" +
    "<div class=\"fl-text\"><b>%taxonRank:</b> %taxonNames</div>" +
    "</div>";

hortis.capitalize = function (string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
};

hortis.renderTooltip = function (row) {
    const terms = {
        imgUrl: row.iNaturalistTaxonImage || ""
    };
    if (row.rank) {
        terms.taxonRank = hortis.capitalize(row.rank);
    } else {
        terms.taxonRank = "Species";
    }
    const names = [(row.taxonName || row.iNaturalistTaxonName), row.commonName, row.hulqName].filter(name => name);
    terms.taxonNames = names.join(" / ");
    return fluid.stringTemplate(hortis.tooltipTemplate, terms);
};


// Lifted from Infusion Tooltip.js
hortis.isInDocument = function (node) {
    const dokkument = fluid.getDocument(node),
        container = node[0];
    // jQuery UI framework will throw a fit if we have instantiated a widget on a DOM element and then
    // removed it from the DOM. This apparently can't be detected via the jQuery UI API itself.
    return $.contains(dokkument, container) || dokkument === container;
};

hortis.clearAllTooltips = function (that) {
    hortis.clearTooltip(that);
    $(".ui-tooltip").remove();
    that.applier.change("hoverId", null);
};

hortis.clearTooltip = function (that) {
    const tooltipTarget = that.tooltipTarget;
    if (tooltipTarget) {
        that.tooltipTarget = null;
        if (hortis.isInDocument(tooltipTarget)) {
            tooltipTarget.tooltip("destroy");
        } else {
            hortis.clearAllTooltips(that);
        }
    }
};

hortis.updateTooltip = function (that, id) {
    const content = id ? hortis.renderTooltip(that.entryById[id].row, that.options.markup) : null;
    const target = $(that.mouseEvent.target);

    hortis.clearTooltip(that);

    if (content) {
        target.tooltip({
            items: target
        });
        target.tooltip("option", "content", content || "");
        target.tooltip("option", "track", true);
        target.tooltip("open", that.mouseEvent);
        that.tooltipTarget = target;
    } else {
        that.mouseEvent = null;
    }
};


fluid.defaults("hortis.taxa", {
    gradeNames: "fluid.component",
    members: {
        rowById: "@expand:hortis.indexTree({that}.rows)",
        flatTree: "@expand:hortis.taxa.map({that}.rows, {that}.rowById)",
        // TODO: These will be somehow modellised in the end
        entries: "@expand:hortis.computeEntries({that}.flatTree, {that}.acceptRow)",
        entryById: "@expand:hortis.indexEntries({that}.entries)"
    },
    invokers: {
        acceptRow: "hortis.acceptRow({that}, {arguments}.0)"
    }
});

hortis.acceptRow = function (/*that, row*/) {
    // TODO: in Sunburst used to check nativeData
    return true;
};

fluid.defaults("hortis.beaVizLoader", {
    selectors: {
        interactions: ".fl-imerss-interactions-holder"
    },
    components: {
        pollinatorChecklist: {
            type: "hortis.checklistWithHolder",
            createOnEvent: "onResourcesLoaded",
            container: ".fl-imerss-pollinators",
            options: {
                rootId: 1,
                filterRanks: ["order", "family"],
                members: {
                    entryById: "{taxa}.entryById"
                }
            }
        },
        plantChecklist: {
            type: "hortis.checklistWithHolder",
            createOnEvent: "onResourcesLoaded",
            container: ".fl-imerss-plants",
            options: {
                rootId: 47126,
                filterRanks: ["class", "order", "family"],
                members: {
                    entryById: "{taxa}.entryById"
                }
            }
        },
        interactions: {
            type: "hortis.interactions",
            createOnEvent: "onResourcesLoaded"
        },
        drawInteractions: {
            type: "hortis.drawInteractions",
            createOnEvent: "onResourcesLoaded",
            container: "{that}.dom.interactions",
            options: {
                components: {
                    interactions: "{interactions}",
                    taxa: "{taxa}"
                }
            }
        }
    }
});

hortis.bindTaxonHover = function (that, layoutHolder) {
    const hoverable = that.options.selectors.hoverable;
    that.container.on("mouseenter", hoverable, function (e) {
        const id = this.dataset.rowId;
        layoutHolder.mouseEvent = e;
        layoutHolder.applier.change("hoverId", id);
    });
    that.container.on("mouseleave", hoverable, function () {
        layoutHolder.applier.change("hoverId", null);
    });
    that.container.on("click", hoverable, function () {
        const id = this.dataset.rowId;
        layoutHolder.events.changeLayoutId.fire(id);
    });
};

// Accepts array of rows and returns array of "entries", where entry is {row, children: array of entry}
// Identical algorithm as for hortis.filterRanks - no doubt a functional programmer would fold this up
// Was hortis.computeSunburstEntries
hortis.computeEntries = function (rows, acceptRow) {
    const togo = [];
    fluid.each(rows, function (row) {
        if (acceptRow(row)) {
            togo.push({
                row: row,
                children: hortis.computeEntries(row.children, acceptRow)
            });
        } else {
            const dChildren = hortis.computeEntries(row.children, acceptRow);
            Array.prototype.push.apply(togo, dChildren);
        }
    });
    return hortis.sortChecklistLevel(togo);
};

hortis.indexEntries = function (entries) {
    const index = {};
    entries.forEach(function (entry) {
        index[entry.row.id] = entry;
    });
    return index;
};

// Copied from imerss-viz.js
hortis.indexTree = function (flatTree) {
    const index = {};
    flatTree.forEach(function (row) {
        index[row.id] = row;
    });
    return index;
};

// cf. hortis.flattenTreeRecurse - the tree now comes in flat and in the right order
hortis.taxa.map = function (rows, byId) {
    rows.forEach((row, i) => {
        row.flatIndex = i;
        row.children = []; // conform to standard of imerss-viz.js
        if (row.parentId) {
            const parent = byId[row.parentId];
            row.parent = parent;
            fluid.pushArray(parent, "children", row);
        }
    });
    const assignDepth = function (node, depth) {
        node.depth = depth;
        node.children.forEach(child => assignDepth(child, depth + 1));
    };
    assignDepth(rows[0], 0);
    return rows;
};


// Holds model state shared with checklist and index
fluid.defaults("hortis.layoutHolder", {
    gradeNames: "fluid.modelComponent",
    members: {
        taxonHistory: [],
        // entryById
    },
    events: {
        changeLayoutId: null
    },
    // rootId
    model: {
        // isAtRoot
        rowFocus: {},
        layoutId: "{that}.options.rootId",
        selectedId: null,
        hoverId: null,
        historyIndex: 0
    },
    modelListeners: {
        hoverId: {
            excludeSource: "init",
            funcName: "hortis.updateTooltip",
            args: ["{that}", "{change}.value"]
        }
    },
    modelRelay: {
        isAtRoot: {
            target: "isAtRoot",
            args: ["{that}.model.layoutId", "{that}.options.rootId"],
            func: (x, y) => x === y
        }
    },
    invokers: {
        filterEntries: "fluid.notImplemented"
    }
});

fluid.defaults("hortis.checklistWithHolder", {
    gradeNames: ["hortis.layoutHolder", "hortis.checklist"],
    invokers: {
        filterEntries: "{vizLoader}.filterEntries"
    }
});

fluid.defaults("hortis.vizLoaderWithMap", {
    gradeNames: ["fluid.viewComponent", "hortis.vizLoader"],
    selectors: {
        map: ".fld-imerss-map"
    },
    components: {
        map: {
            type: "hortis.libreMap",
            container: "{that}.dom.map",
            createOnEvent: "onResourcesLoaded",
            options: {
                gradeNames: "{vizLoader}.options.mapGrades"
            }
        }
    }
    // obsFile,
    // taxaFile
});

hortis.projectBounds = {
    Galiano: [[48.855, -123.65], [49.005, -123.25]],
    Valdes: [[49.000, -123.798], [49.144, -123.504]],
    Xetthecum: [[48.93713, -123.5110], [48.9511, -123.4980]],
    Pepiowelh: [[48.5650, -123.1575], [48.5980, -123.1266]],
    HoweSound: [[49.160, -124.281], [50.170, -122.050]],
    SalishSea: [[47.568, -124.200], [49.134, -122.059]]
};

hortis.initBounds = function (bounds) {
    bounds[0] = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
    bounds[1] = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
};

hortis.updateBounds = function (bounds, lat, long) {
    bounds[0][0] = Math.min(bounds[0][0], lat);
    bounds[0][1] = Math.min(bounds[0][1], long);
    bounds[1][0] = Math.max(bounds[1][0], lat);
    bounds[1][1] = Math.max(bounds[1][1], long);
};

hortis.expandBounds = function (bounds, factor) {
    const width = bounds[1][1] - bounds[0][1];
    const height = bounds[1][0] - bounds[0][0];
    const he = width * factor;
    const ve = height * factor;
    bounds[0][0] -= ve; bounds[0][1] -= he;
    bounds[1][0] += ve; bounds[1][1] += he;
};

// Basic style: https://github.com/maplibre/maplibre-gl-js/issues/638
fluid.defaults("hortis.libreMap", {
    gradeNames: "fluid.viewComponent",
    mapOptions: {
        style: {
            version: 8,
            layers: [],
            sources: {}
        }
    },
    members: {
        map: "@expand:hortis.libreMap.make({that}.container.0, {that}.options.mapOptions, {that}.events.loadMap)"
    },
    // Note that LeafletMap has buildMap fired from a mapInitialised model field - we're going to end up in the usual
    // loops here if we do the same.
    model: {
        mapLoaded: "{that}.resources.mapLoaded.parsed"
    },
    resources: {
        mapLoaded: {
            promiseFunc: "fluid.identity",
            promiseArgs: "{that}.events.loadMap"
        }
    },
    events: {
        buildMap: null,
        loadMap: "promise"
    },
    listeners: {
        "loadMap.build": "{that}.events.buildMap.fire",
        // "buildMap.bindZoom": "hortis.leafletMap.bindZoom({that})",
        "buildMap.fitBounds": "hortis.libreMap.fitBounds({that}, {that}.options.fitBounds)",
        // "buildMap.createTooltip": "hortis.leafletMap.createTooltip({that}, {that}.options.markup)",
        "buildMap.addTiles": "hortis.libreMap.addTileLayers({that}.map, {that}.options.tileSets)"
    }
});

hortis.libreMap.make = function (container, mapOptions, loadEvent) {
    const togo = new maplibregl.Map({container, ...mapOptions});
    togo.on("load", function () {
        console.log("Map loaded");
        loadEvent.fire(true);
    });
    return togo;
};

fluid.defaults("hortis.libreMap.streetmapTiles", {
    tileSets: {
        baseMap: {
            tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
            attribution: "&copy; <a href=\"https://www.openstreetmap.org/copyright\">OpenStreetMap</a> contributors",
            tileSize: 256
        }
    }
});

fluid.defaults("hortis.libreMap.usEcoL3Tiles", {
    tileSets: {
        ecoL3: {
            // TODO: Commit this to GitHub and see how it performs
            tiles: ["data/b-team/us_eco_l3_tiles/{z}/{x}/{y}.png"],
            tileSize: 512,
            paint: {
                "raster-opacity": 0.5
            }
        }
    }
});

hortis.libreMap.addTileLayers = function (map, tileSets) {
    const tileKeys = Object.keys(tileSets);
    tileKeys.reverse().forEach(function (key) {
        const tileSet = tileSets[key];
        const paint = tileSet.paint || {};
        map.addSource(key, {
            type: "raster",
            ...fluid.censorKeys(tileSet, ["paint"]) // TODO: "layout" too - https://docs.mapbox.com/style-spec/reference/layers/
        });
        map.addLayer({
            id: key,
            type: "raster",
            source: key,
            paint: paint
        });
    });
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

// TODO: Convert into subcomponent, possibly of something completely different - we may want one layer for each map, etc.
fluid.defaults("hortis.libreMap.withObsGrid", {
    modelListeners: {
        "{obsQuantiser}.model.indexVersion": {
            func: "{that}.updateObsGrid",
            excludeSource: "init"
        }
    },
    fillStops: hortis.libreMap.viridisStops,
    fillOpacity: 0.7,
    outlineColour: "black",
    invokers: {
        addObsGrid: {
            funcName: "hortis.libreMap.addObsGrid",
            args: ["{that}", "{obsQuantiser}"]
        },
        updateObsGrid: {
            funcName: "hortis.libreMap.updateObsGrid",
            args: ["{that}", "{obsQuantiser}"]
        }
    },
    listeners: {
        // Depends that buildMap fired async by mapLibre
        "buildMap.addObsGrid": "{that}.addObsGrid",
        "buildMap.fitBounds": "hortis.libreMap.fitBounds({that}, {obsQuantiser}.grid.bounds)"
    }
});

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

hortis.libreMap.obsGridFeature = function (map, obsQuantiser) {
    const grid = obsQuantiser.grid,
        buckets = grid.buckets,
        latres = obsQuantiser.model.latResolution,
        longres = obsQuantiser.model.longResolution;
    return {
        type: "FeatureCollection",
        features: Object.entries(buckets).map(function ([key, bucket]) {
            const [lat, long] = hortis.obsQuantiser.indexToCoord(key, latres, longres);
            return {
                type: "Feature",
                geometry: {
                    type: "Polygon",
                    coordinates: [hortis.libreMap.rectFromCorner(lat, long, latres, longres)]
                },
                properties: {
                    obsprop: bucket.count / grid.maxCount
                }
            };
        })
    };
};


hortis.libreMap.addObsGrid = function (map, obsQuantiser) {
    const geojson = hortis.libreMap.obsGridFeature(map, obsQuantiser);
    map.map.addSource("obsgrid-source", {
        type: "geojson",
        data: geojson
    });
    const layer = {
        id: "obsgrid-layer",
        type: "fill",
        source: "obsgrid-source",
        paint: {
            "fill-color": {
                property: "obsprop",
                stops: map.options.fillStops
            },
            "fill-opacity": map.options.fillOpacity,
            "fill-outline-color": map.options.outlineColour
        }
    };
    map.map.addLayer(layer);
};

hortis.libreMap.updateObsGrid = function (map, obsQuantiser) {
    const geojson = hortis.libreMap.obsGridFeature(map, obsQuantiser);
    const source = map.map.getSource("obsgrid-source");
    source.setData(geojson);
};

hortis.libreMap.swapCoords = function (coords) {
    return [coords[1], coords[0]];
};

hortis.libreMap.swapBounds = function (bounds) {
    return bounds.map(hortis.libreMap.swapCoords);
};

hortis.libreMap.fitBounds = function (that, fitBounds) {
    // MapLibre accepts coordinates in the opposite order (long, lat)
    const swapped = hortis.libreMap.swapBounds(fitBounds);
    that.map.fitBounds(swapped);
};

fluid.defaults("hortis.interactions", {
    gradeNames: "fluid.component",
    members: {
        crossTable: {}, // keys are plantId|pollId, values ints
        plantTable: {},
        pollinatorTable: {},
        maxCount: "@expand:hortis.interactions.count({that}, {obsLoader})"
    }
});

hortis.intIdsToKey = function (plantId, pollId) {
    return plantId + "|" + pollId;
};

hortis.addCount = function (table, key) {
    if (table[key] === undefined) {
        table[key] = 0;
    }
    ++table[key];
};

hortis.interactions.count = function (that, obsLoader) {
    const rows = obsLoader.data;
    let maxCrossCount = 0;
    const {crossTable, plantTable, pollinatorTable} = that;

    rows.forEach(function (row) {
        const {pollinatorINatId: pollId, plantINatId: plantId} = row;
        if (plantId && pollId) {
            const key = hortis.intIdsToKey(plantId, pollId);
            hortis.addCount(crossTable, key);
            hortis.addCount(plantTable, plantId);
            hortis.addCount(pollinatorTable, pollId);
            maxCrossCount = Math.max(maxCrossCount, ++crossTable[key]);
        }
    });
    const cells = Object.keys(crossTable).length;
    const plants = Object.keys(plantTable).length;
    const polls = Object.keys(pollinatorTable).length;
    console.log("Counted ", rows.length + " obs into " + cells + " cells for " + plants + " plants and " + polls + " pollinators");
    console.log("Maximum count: " + maxCrossCount);
    console.log("Occupancy: " + (100 * (cells / (plants * polls))).toFixed(2) + "%");

    return maxCrossCount;
};

fluid.defaults("hortis.drawInteractions", {
    gradeNames: "fluid.viewComponent",
    selectors: {
        plantNames: ".fld-imerss-plant-names",
        plantCounts: ".fld-imerss-plant-counts",
        pollNames: ".fld-imerss-poll-names",
        pollCounts: ".fld-imerss-poll-counts",
        interactions: ".fld-imerss-interactions",
        scroll: ".fld-imerss-int-scroll",
        hoverable: ".fl-imerss-int-label"
    },
    squareSize: 16,
    squareMargin: 4,
    fillStops: hortis.libreMap.natureStops,
    fillOpacity: 0.7,
    outlineColour: "black",
    listeners: {
        "onCreate.render": "hortis.drawInteractions.render",
        "onCreate.bindTaxonHover": "hortis.bindTaxonHover({that}, {layoutHolder})"
    }
});



hortis.drawInteractions.render = function (that) {
    const {crossTable, plantTable, pollinatorTable, maxCount} = that.interactions;
    const {squareSize, squareMargin} = that.options;

    const plants = Object.keys(plantTable);
    const polls = Object.keys(pollinatorTable);

    const canvas = that.locate("interactions")[0];
    const ctx = canvas.getContext("2d");
    const side = squareSize - squareMargin;

    ctx.lineWidth = 10;

    const width = polls.length * squareSize + squareMargin;
    const height = plants.length * squareSize + squareMargin;
    canvas.width = width;
    canvas.height = height;

    const xPos = index => index * squareSize + squareMargin / 2;
    const yPos = index => index * squareSize + squareMargin / 2;

    plants.forEach(function (plantId, plantIndex) {
        polls.forEach(function (pollId, pollIndex) {
            const key = hortis.intIdsToKey(plantId, pollId);
            const count = crossTable[key];
            if (count !== undefined) {
                const scaled = count / maxCount;
                const colour = fluid.colour.interpolateStops(that.options.fillStops, scaled);
                const xywh = [xPos(pollIndex), yPos(plantIndex), side, side];

                ctx.fillStyle = colour;
                ctx.fillRect.apply(ctx, xywh);

                ctx.strokeStyle = that.options.outlineColour;
                ctx.strokeRect.apply(ctx, xywh);
            }
        });
    });

    const yoffset = -4; // TODO: relative to label font

    const plantNames = that.locate("plantNames")[0];
    plantNames.style.height = height;
    const plantMark = plants.map(function (plantId, plantIndex) {
        const row = that.taxa.rowById[plantId];
        const top = yPos(plantIndex);
        return `<div class="fl-imerss-int-label" data-row-id="${plantId}" style="top: ${top+yoffset}px">${row.iNaturalistTaxonName}</div>`;
    });
    plantNames.innerHTML = plantMark.join("\n");

    const pollNames = that.locate("pollNames")[0];
    plantNames.style.width = width;
    const pollMark = polls.map(function (pollId, pollIndex) {
        const row = that.taxa.rowById[pollId];
        const left = xPos(pollIndex);
        return `<div class="fl-imerss-int-label" data-row-id="${pollId}" style="left:${left}px">${row.iNaturalistTaxonName}</div>`;
    });
    pollNames.innerHTML = pollMark.join("\n");

    const scroll = that.locate("scroll")[0];
    scroll.addEventListener("scroll", function () {
        const scrollTop = scroll.scrollTop;
        plantNames.scrollTop = scrollTop;
        const scrollLeft = scroll.scrollLeft;
        pollNames.scrollLeft = scrollLeft;
    });

    plantNames.addEventListener("scroll", function () {
        scroll.scrollTop = plantNames.scrollTop;
    });

};


// TODO: Factor into geom.js

// From https://en.wikipedia.org/wiki/Longitude#Length_of_a_degree_of_longitude
hortis.WGS84a = 6378137;
hortis.WGS84b = 6356752.3142;
hortis.WGS84e2 = (hortis.WGS84a * hortis.WGS84a - hortis.WGS84b * hortis.WGS84b) / (hortis.WGS84a * hortis.WGS84a);

/** Length in metres for a degree of longitude at given latitude **/

hortis.longitudeLength = function (latitude) {
    const latrad = Math.PI * latitude / 180;
    const sinrad = Math.sin(latrad);
    return Math.PI * hortis.WGS84a * Math.cos(latrad) / (180 * Math.sqrt(1 - hortis.WGS84e2 * sinrad * sinrad));
};

/** Length in metres for a degree of latitude at given latitude **/

hortis.latitudeLength = function (latitude) {
    const latrad = Math.PI * latitude / 180;
    const sinrad = Math.sin(latrad);
    return Math.PI * hortis.WGS84a * (1 - hortis.WGS84e2) / (180 * Math.pow(1 - hortis.WGS84e2 * sinrad * sinrad, 1.5));
};

hortis.longToLat = function (lng, lat) {
    const longLength = hortis.longitudeLength(lat);
    const latLength = hortis.latitudeLength(lat);
    return lng * longLength / latLength;
};

fluid.defaults("hortis.obsQuantiser", {
    gradeNames: "fluid.modelComponent",
    baseLatitude: 37.5,
    model: {
        // latResolution - relay from long
        longResolution: 0.005,
        indexVersion: 0
    },
    modelRelay: {
        latResolution: {
            target: "latResolution",
            func: "hortis.longToLat",
            args: ["{that}.model.longResolution", "{that}.options.baseLatitude"],
        },
        index: {
            target: "indexVersion",
            func: "hortis.obsQuantiser.indexObs",
            args: ["{that}", "{obsLoader}", "{that}.model.latResolution", "{that}.model.longResolution", "{that}.model.indexVersion"],
        }
    },
    members: {
        grid: {
            bounds: [],
            maxCount: 0,
            buckets: {}
            // hash of id to {count, byId}
        }
    },
    events: {
        indexUpdated: null
    }
});

hortis.obsQuantiser.indexToCoord = function (index, latres, longres) {
    const coords = index.split("|");
    return [coords[0] * latres, coords[1] * longres];
};

hortis.obsQuantiser.coordToIndex = function (lat, long, latres, longres) {
    const latq = Math.floor(lat / latres);
    const longq = Math.floor(long / longres);
    return latq + "|" + longq;
};

hortis.obsQuantiser.indexObs = function (that, obsLoader, latResolution, longResolution, indexVersion) {
    const grid = that.grid;
    const now = Date.now();
    const rows = obsLoader.data.length;
    hortis.initBounds(grid.bounds);
    obsLoader.data.forEach(function (row, index) {
        const coordIndex = hortis.obsQuantiser.coordToIndex(row.decimalLatitude, row.decimalLongitude, latResolution, longResolution);
        hortis.updateBounds(grid.bounds, row.decimalLatitude, row.decimalLongitude);
        if (coordIndex.includes("NaN")) {
            console.log("Warning - invalid coordinates at line " + index);
        }
        let bucket = grid.buckets[coordIndex];
        if (!bucket) {
            bucket = grid.buckets[coordIndex] = {count: 0, byTaxonId: {}, plantByTaxonId: {}};
        }
        bucket.count++;
        grid.maxCount = Math.max(grid.maxCount, bucket.count);
        fluid.pushArray(bucket.byTaxonId, row.pollinatorINatId, index);
        fluid.pushArray(bucket.plantByTaxonId, row.plantINatId, index);
    });
    hortis.expandBounds(grid.bounds, 0.1); // mapBox fitBounds are a bit tight
    const delay = Date.now() - now;
    console.log(rows + " rows in " + delay + " ms: " + 1000 * (delay / rows) + " us/row");
    return indexVersion + 1;
};

fluid.defaults("hortis.libreObsMap", {
    gradeNames: ["hortis.libreMap", "hortis.libreMap.withObsGrid"],
    components: {
        quantiser: {
            type: "hortis.obsQuantiser",
            options: {
                model: {
                    longResolution: 0.075
                }
            }
        }
    }
});

fluid.defaults("hortis.demoLibreMap", {
    gradeNames: ["hortis.libreObsMap", "hortis.libreMap.streetmapTiles", "hortis.libreMap.usEcoL3Tiles"]
});
