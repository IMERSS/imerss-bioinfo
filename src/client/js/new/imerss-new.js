/*
Copyright 2017-2023 Antranig Basman
Licensed under the Educational Community License (ECL), Version 2.0 or the New
BSD license. You may not use this file except in compliance with one these
Licenses.
You may obtain a copy of the ECL 2.0 License and BSD License at
https://github.com/fluid-project/infusion/raw/master/Infusion-LICENSE.txt
*/

/* global Papa, maplibregl, HashTable, preactSignalsCore */

"use strict";

// noinspection ES6ConvertVarToLetConst // otherwise this is a duplicate on minifying
var hortis = fluid.registerNamespace("hortis");

// TODO: Hoist this into some kind of core library
// noinspection ES6ConvertVarToLetConst // otherwise this is a duplicate on minifying
var {signal, computed, effect} = preactSignalsCore;

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
            that.completionPromise.resolve(that.data);
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

fluid.computed = function (funcName, ...args) {
    return computed( () => {
        return fluid.invokeGlobalFunction(funcName, args);
    });
};

fluid.defaults("hortis.vizLoader", {
    gradeNames: ["fluid.component"],
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
            options: {
                model: {
                    rows: "{vizLoader}.model.taxa"
                }
            }
        }
    },
    // Currently not a resourceLoader, but the name fits
    events: {
        onResourcesLoaded: null
    },
    members: {
        taxaRows: "@expand:signal([])",
        obsRows: "@expand:signal([])",
        obsFilterVersion: "@expand:signal(0)",
        filteredObs: "@expand:computed({that}.obs, {that}.obsFilter, {that}.obsFilterVersion)",
        // Not an invoker for performance reasons
        obsFilter: fluid.identity
    },
    model: {
        taxa: [],
        obs: [],
        filteredObs: new fluid.ImmutableArray()
        // obsFilterVersion: 0
    },
    modelListeners: {
        filterObs: {
            path: "obsFilterVersion",
            funcName: "hortis.filterObs",
            args: ["{that}", "{that}.model.obs", "{that}.obsFilter"]
        }
    },
    invokers: { // Deal with global selection model for taxa, e.g. via map selections
        filterEntries: "fluid.identity"
    },

    listeners: {
        "onCreate.bindResources": "hortis.vizLoader.bindResources"
    }
});

// Do this by hand since we will have compressed viz one day
hortis.vizLoader.bindResources = async function (that) {
    const promises = [that.taxaLoader.completionPromise, that.obsLoader.completionPromise];
    const [taxa, obs] = await Promise.all(promises);
    that.applier.change([], {taxa, obs, obsFilterVersion: 0});
    that.events.onResourcesLoaded.fire();
};

hortis.filterObs = function (that, obs, obsFilter) {
    const filteredObs = new fluid.ImmutableArray();

    let dropped = 0;
    obs.forEach(function (row) {
        const accept = obsFilter(row);
        if (accept) {
            filteredObs.push(row);
        } else {
            ++dropped;
        }
    });
    that.applier.change(["filteredObs"], filteredObs);
};

hortis.taxonTooltipTemplate =
`<div class="fl-imerss-tooltip">
    <div class="fl-imerss-photo" style="background-image: url(%imgUrl)"></div>
    <div class="fl-text"><b>%taxonRank:</b> %taxonNames</div>
</div>`;

hortis.capitalize = function (string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
};

hortis.renderTaxonTooltip = function (that, hoverId) {
    const row = that.model.entryById[hoverId].row;
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
    return fluid.stringTemplate(hortis.taxonTooltipTemplate, terms);
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
    that.applier.change(that.options.tooltipKey, null);
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
    const content = id ? that.renderTooltip(id) : null;
    hortis.clearTooltip(that);

    if (content) {
        const target = $(that.hoverEvent.target);
        target.tooltip({
            items: target
        });
        target.tooltip("option", "content", content || "");
        target.tooltip("option", "track", true);
        target.tooltip("open", that.hoverEvent);
        that.tooltipTarget = target;
    } else {
        that.hoverEvent = null;
    }
};


fluid.defaults("fluid.stringTemplateRenderingView", {
    gradeNames: "fluid.containerRenderingView",
    invokers: {
        renderMarkup: "fluid.stringTemplate({that}.options.markup.container, {that}.model)"
    },
    modelListeners: {
        render: {
            path: "",
            func: "fluid.renderToDocument",
            args: "{that}"
        }
    }
});

fluid.conditionalStringTemplate = function (container, fallbackContainer, model) {
    return model ? fluid.stringTemplate(container, model) : fallbackContainer;
};

// Perhaps one day could be Preactish!
fluid.renderToDocument = function (that) {
    const markup = that.renderMarkup();
    that.container[0].innerHTML = markup;
};

fluid.defaults("hortis.recordReporter", {
    gradeNames: "fluid.stringTemplateRenderingView",
    invokers: {
        renderMarkup: "hortis.recordReporter.renderMarkup({that}, {that}.options.markup)"
    },
    markup: {
        fallbackContainer: "<div></div>",
        container: "<div>Displaying %filteredRows of %allRows records</div>"
    },
    // BUG: Accessing model with undefined initial value during evaluateContainers causes circular exception
    // Apparently even null will do it!
    model: 0
});

hortis.recordReporter.renderMarkup = function (that, markup) {
    const model = that.model;
    return model.filteredRows ? fluid.stringTemplate(markup.container, model) : markup.fallbackContainer;
};

hortis.filteredToReport = function (vizLoader, recordReporter) {
    const model = {
        filteredRows: vizLoader.model.filteredObs.length,
        allRows: vizLoader.model.obs.length
    };
    recordReporter.applier.change("", model);
};

fluid.defaults("hortis.beaVizLoader", {
    selectors: {
        interactions: ".fld-imerss-interactions-holder",
        recordReporter: ".fld-record-reporter"
    },
    components: {
        recordReporter: {
            type: "hortis.recordReporter",
            container: "{that}.dom.recordReporter",
            options: {
                model: {
                    filteredRows: "{vizLoader}.model.filteredObs.length",
                    allRows: "{vizLoader}.model.obs.length"
                }
            }
        },
        pollinatorChecklist: {
            type: "hortis.checklist.withHolder",
            container: ".fl-imerss-pollinators",
            options: {
                gradeNames: "hortis.checklist.inLoader",
                rootId: 1,
                filterRanks: ["epifamily", "family"],
                model: {
                    rowById: "{taxa}.model.rowById"
                }
            }
        },
        plantChecklist: {
            type: "hortis.checklist.withHolder",
            container: ".fl-imerss-plants",
            options: {
                gradeNames: "hortis.checklist.inLoader",
                rootId: 47126,
                filterRanks: ["class", "order", "family", "kingdom"],
                model: {
                    rowById: "{taxa}.model.rowById"
                }
            }
        },
        interactions: {
            type: "hortis.interactions",
            options: {
                model: {
                    plantSelection: "{plantChecklist}.model.rowSelection",
                    pollinatorSelection: "{pollinatorChecklist}.model.rowSelection"
                }
            }
        },
        drawInteractions: {
            type: "hortis.drawInteractions",
            container: "{that}.dom.interactions",
            options: {
                components: {
                    interactions: "{interactions}",
                    taxa: "{taxa}"
                }
            }
        }
    },
    members: {
        obsFilter: "@expand:hortis.makeBeaObsFilter({that})"
    }
});

fluid.defaults("hortis.checklist.inLoader", {
    modelListeners: {
        obsFilterChange: {
            path: "{that}.model.rowSelection",
            funcName: "fluid.incrementModel",
            args: ["{that}", "obsFilterVersion"],
            excludeSource: "init"
        }
    }
});

hortis.makeBeaObsFilter = function (beaVizLoader) {
    const plantChecklist = beaVizLoader.plantChecklist;
    const pollinatorChecklist = beaVizLoader.pollinatorChecklist;
    return function beaObsFilter(obsRow) {
        return plantChecklist.model.rowSelection[obsRow.plantINatId] &&
            pollinatorChecklist.model.rowSelection[obsRow.pollinatorINatId];
    };
};

// TODO: This does both hover and click - for interactions we just want hover
hortis.bindTaxonHover = function (that, layoutHolder) {
    const hoverable = that.options.selectors.hoverable;
    that.container.on("mouseenter", hoverable, function (e) {
        const id = this.dataset.rowId;
        layoutHolder.hoverEvent = e;
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

fluid.defaults("hortis.taxa", {
    gradeNames: "fluid.modelComponent",
    model: {
        entries: new fluid.ImmutableArray(),
        entryById: new fluid.ImmutableObject()
    },
    modelRelay: {
        indexTaxa: {
            target: "rowById",
            source: "rows",
            func: "hortis.indexTree",
            // Crucial point where one relay needs to operate first - signals might do this naturally
            priority: "first"
        },
        flatTree: {
            target: "flatTree",
            // Note, actually just fills in entries in rows
            func: "hortis.taxa.map",
            args: ["{that}.model.rows", "{that}.model.rowById)"]
        },
        entries: {
            target: "entries",
            func: "hortis.computeEntries",
            args: ["{that}.model.flatTree", "{that}.acceptRow"]
        },
        entryById: {
            target: "entryById",
            func: "hortis.indexEntries",
            args: "{that}.model.entries"

        }
    },
    invokers: {
        acceptRow: "hortis.acceptRow({that}, {arguments}.0)"
    }
});

hortis.acceptRow = function (/*that, row*/) {
    // TODO: in Sunburst used to check nativeData
    return true;
};

// Since these functions got modellised the all have to return the strange new fluid.ImmutableX objects to avoid being
// copied whenever models update.

// Accepts array of rows and returns array of "entries", where entry is {row, children: array of entry}
// Identical algorithm as for hortis.filterRanks - no doubt a functional programmer would fold this up
// Was hortis.computeSunburstEntries
hortis.computeEntries = function (rows, acceptRow) {
    const togo = new fluid.ImmutableArray();
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
    const index = new fluid.ImmutableObject();
    (entries || []).forEach(function (entry) {
        index[entry.row.id] = entry;
    });
    return index;
};

// Copied from imerss-viz.js
hortis.indexTree = function (flatTree) {
    const index = new fluid.ImmutableObject();
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
    if (rows.length > 0) {
        assignDepth(rows[0], 0);
    }
    return rows;
};


// Holds model state shared with checklist and index - TODO rename after purpose, "layout" used to refer to sunburst root
fluid.defaults("hortis.layoutHolder", {
    gradeNames: "fluid.modelComponent",
    tooltipKey: "hoverId",
    members: {
        taxonHistory: []
    },
    events: {
        changeLayoutId: null
    },
    // rootId
    model: {
        // isAtRoot
        // entryById -> rowById now
        rowFocus: {}, // non-taxon based selection external to the checklist, e.g. incoming from a map? TODO currently checklist computes initial value
        rowSelection: {}, // taxon-based selection from the checklist - will be subset of rowFocus
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
        renderTooltip: "hortis.renderTaxonTooltip({that}, {arguments}.0)",
        filterEntries: "fluid.notImplemented"
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

hortis.initBounds = function () {
    const bounds = [
        [90,  180],
        [-90, -180]
    ];
    return bounds;
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
    // Note we've forgotten to add ResourceLoader so in practice this machinery is ignored. Also we want map generation
    // to be properly asynchronous as layer updates.
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
            tiles: ["https://usda-nifa-b-team.github.io/b-team/tiles/us_eco_l3_tiles/{z}/{x}/{y}.png"],
            tileSize: 512,
            maxzoom: 8,
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
        "{obsQuantiser}.model.grid": {
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
        "buildMap.fitBounds": "hortis.libreMap.fitBounds({that}, {obsQuantiser}.model.grid.bounds)"
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
    const grid = obsQuantiser.model.grid,
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
    if (source) { // init model transaction from checklists may come in early
        source.setData(geojson);
    }
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
    gradeNames: "fluid.modelComponent",
    modelRelay: {
        target: "crossTable",
        func: "hortis.interactions.count",
        args: ["{that}", "{vizLoader}.model.obs"]
    },
    model: {
        // keys are plantId|pollId, values ints
        // crossTable
    },
    members: {
        plantTable: {},
        pollTable: {}
    }
});

// Note that we can't use bitwise operators since they are defined to work on 32 bit operands!!
// https://stackoverflow.com/questions/63697853/js-bitwise-shift-operator-not-returning-the-correct-result
hortis.SHIFT = 2 ** 22;
hortis.MASK = hortis.SHIFT - 1;

hortis.intIdsToKey = function (plantId, pollId) {
    return ((+plantId) * hortis.SHIFT) + (+pollId);
};

hortis.keyToIntIds = function (key) {
    return {
        plantId: Math.floor(key / hortis.SHIFT),
        pollId: key & hortis.MASK
    };
};

hortis.addCount = function (table, key, count = 1) {
    if (table[key] === undefined) {
        table[key] = 0;
    }
    table[key] += count;
};

hortis.max = function (hash) {
    let max = Number.NEGATIVE_INFINITY;
    fluid.each(hash, function (val) {
        max = Math.max(val, max);
    });
    return max;
};

hortis.maxReducer = function () {
    const togo = {
        value: Number.NEGATIVE_INFINITY,
        reduce: next => {togo.value = Math.max(next, togo.value);}
    };
    return togo;
};

hortis.minReducer = function () {
    const togo = {
        value: Number.POSITIVE_INFINITY,
        reduce: next => {togo.value = Math.min(next, togo.value);}
    };
    return togo;
};

hortis.intKey = new Uint8Array(8);
hortis.intValue = new Uint8Array(4);

// Adapted from https://stackoverflow.com/a/12965194 by reversing bytes
hortis.writeLong = function (target, long) {
    for (let index = target.length - 1; index >= 0; --index) {
        const byte = long & 0xff;
        target [ index ] = byte;
        long = (long - byte) / 256;
    }
};

hortis.readLong = function (source) {
    let value = 0;
    for (let i = 0; i < source.length; ++i) {
        value = (value * 256) + source[i];
    }
    return value;
};

hortis.getHashCount = function (hash, key) {
    hortis.writeLong(hortis.intKey, key);
    const found = hash.get(hortis.intKey, 0, hortis.intValue, 0);
    return found === 1 ? hortis.readLong(hortis.intValue) : undefined;
};

hortis.addHashCount = function (hash, key) {
    const count = hortis.getHashCount(hash, key);
    hortis.writeLong(hortis.intValue, count === undefined ? 1 : count + 1);
    hortis.writeLong(hortis.intKey, key);
    hash.set(hortis.intKey, 0, hortis.intValue, 0);
};

hortis.interactions.count = function (that, obsRows) {
    const rows = obsRows;
    const {plantTable, pollTable} = that;
    const crossTable = {};
    const crossTableHash = new HashTable(8, 4, 1024, 32768);

    rows.forEach(function (row) {
        const {pollinatorINatId: pollId, plantINatId: plantId} = row;
        if (plantId && pollId) {
            const key = hortis.intIdsToKey(plantId, pollId);
            hortis.addCount(crossTable, key);
            hortis.addHashCount(crossTableHash, key);
            hortis.addCount(plantTable, plantId);
            hortis.addCount(pollTable, pollId);
        }
    });

    const cells = Object.keys(crossTable).length;
    const plants = Object.keys(plantTable).length;
    const polls = Object.keys(pollTable).length;
    console.log("Counted ", rows.length + " obs into " + cells + " interaction cells for " + plants + " plants and " + polls + " pollinators");
    console.log("Occupancy: " + (100 * (cells / (plants * polls))).toFixed(2) + "%");
    that.crossTableHash = crossTableHash;

    return crossTable;
};

fluid.defaults("hortis.drawInteractions", {
    gradeNames: "fluid.viewComponent",
    tooltipKey: "hoverCellKey",
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
    squareMargin: 2,
    fillStops: hortis.libreMap.natureStops,
    fillOpacity: 0.7,
    memoStops: "@expand:fluid.colour.memoStops({that}.options.fillStops, 32)",
    outlineColour: "black",
    listeners: {
        "onCreate.bindEvents": "hortis.drawInteractions.bindEvents",
        // "onCreate.render": "hortis.drawInteractions.render",
        // TODO: We now have one layoutHolder for each checklist, need to complexify this
        "onCreate.bindTaxonHover": "hortis.bindTaxonHover({that}, {layoutHolder})"
    },
    invokers: {
        renderTooltip: "hortis.renderInteractionTooltip({that}, {arguments}.0)"
    },
    model: {
        hoverCellKey: null
    },
    modelListeners: {
        render: {
            path: "{interactions}.model",
            func: "hortis.drawInteractions.render",
            args: ["{that}"]
        },
        hover: {
            path: "hoverCellKey",
            excludeSource: "init",
            funcName: "hortis.updateTooltip",
            args: ["{that}", "{change}.value"]
        }
    },
    components: {
        pollTooltips: {
            container: "{that}.dom.pollCounts",
            type: "hortis.histoTooltips",
            options: {
                counts: "pollCounts"
            }
        },
        plantTooltips: {
            container: "{that}.dom.plantCounts",
            type: "hortis.histoTooltips",
            options: {
                counts: "plantCounts"
            }
        }
    }
});

fluid.defaults("hortis.histoTooltips", {
    gradeNames: "fluid.viewComponent",
    tooltipKey: "hoverId",
    selectors: {
        hoverable: ".fl-imerss-int-count"
    },
    model: {
        hoverId: null
    },
    modelListeners: {
        hover: {
            path: "hoverId",
            excludeSource: "init",
            funcName: "hortis.updateTooltip",
            args: ["{that}", "{change}.value"]
        }
    },
    invokers: {
        renderTooltip: "hortis.renderHistoTooltip({that}, {arguments}.0, {drawInteractions})"
    },
    listeners: {
        "onCreate.bindHistoHover": "hortis.bindHistoHover"
    }
});

hortis.bindHistoHover = function (that) {
    const hoverable = that.options.selectors.hoverable;
    that.container.on("mouseenter", hoverable, function (e) {
        const id = this.dataset.rowId;
        that.hoverEvent = e;
        that.applier.change("hoverId", id);
    });
    that.container.on("mouseleave", hoverable, function () {
        that.applier.change("hoverId", null);
    });
};

hortis.renderHistoTooltip = function (that, id, interactions) {
    const counts = interactions[that.options.counts];
    const count = counts.counts[id];
    const row = interactions.taxa.rowById[id];
    const name = row.iNaturalistTaxonName;
    return `<div class="fl-imerss-int-tooltip"><div><i>${name}</i>:</div><div>Observation count: ${count}</div></div>`;
};

hortis.makePerm = function (table) {
    const tEntries = Object.entries(table);
    const entries = tEntries.map((entry, index) => ({
        id: entry[0],
        count: entry[1],
        index: index
    }));
    return entries;
};

hortis.drawInteractions.render = function (that) {
    const {crossTableHash, plantTable, pollTable} = that.interactions;
    const {squareSize, squareMargin} = that.options;

    const now = Date.now();

    const plantSelection = that.interactions.model.plantSelection;
    const filteredPlant = plantSelection ? fluid.filterKeys(plantTable, Object.keys(plantSelection)) : plantTable;
    const plantPerm = hortis.makePerm(filteredPlant);
    const pollSelection = that.interactions.model.pollinatorSelection;
    const filteredPoll = pollSelection ? fluid.filterKeys(pollTable, Object.keys(pollSelection)) : pollTable;
    const pollPerm = hortis.makePerm(filteredPoll);

    const canvas = that.locate("interactions")[0];
    const ctx = canvas.getContext("2d");
    const side = squareSize - 2 * squareMargin;

    ctx.lineWidth = 10;

    const plantCounts = {counts: {}, max: 0};
    const pollCounts = {counts: {}, max: 0};

    plantPerm.forEach(function (plantRec) {
        const plantId = plantRec.id;
        pollPerm.forEach(function (pollRec) {
            const pollId = pollRec.id;
            const key = hortis.intIdsToKey(plantId, pollId);
            const count = hortis.getHashCount(crossTableHash, key);
            if (count !== undefined) {
                hortis.addCount(plantCounts.counts, plantId, count);
                hortis.addCount(pollCounts.counts, pollId, count);
            }
        });
    });

    plantCounts.max = hortis.max(plantCounts.counts);
    pollCounts.max = hortis.max(pollCounts.counts);

    const filterZero = function (perm, counts) {
        fluid.remove_if(perm, rec => counts[rec.id] === undefined);
        perm.sort((ea, eb) => counts[eb.id] - counts[ea.id]);
    };

    const filterCutoff = function (perm, counts, sizeLimit, countLimit) {
        if (perm.length >= sizeLimit) {
            const cutIndex = perm.findIndex(entry => counts[entry.id] < countLimit);
            if (cutIndex !== -1 && cutIndex >= sizeLimit) {
                perm.length = cutIndex;
            }
        }
    };

    filterZero(plantPerm, plantCounts.counts);
    filterZero(pollPerm, pollCounts.counts);

    filterCutoff(plantPerm, plantCounts.counts, 100, 5);
    filterCutoff(pollPerm, pollCounts.counts, 100, 5);

    that.plantPerm = plantPerm;
    that.pollPerm = pollPerm;
    that.plantCounts = plantCounts;
    that.pollCounts = pollCounts;

    const cellTable = [],
        cellMax = hortis.maxReducer(),
        cellMin = hortis.minReducer();

    plantPerm.forEach(function (plantRec, plantIndex) {
        const plantId = plantRec.id;
        pollPerm.forEach(function (pollRec, pollIndex) {
            const pollId = pollRec.id;
            const key = hortis.intIdsToKey(plantId, pollId);
            const count = hortis.getHashCount(crossTableHash, key);
            if (count !== undefined) {
                const scaled = count / Math.sqrt((plantCounts.counts[plantId] * pollCounts.counts[pollId]));
                cellMax.reduce(scaled);
                cellMin.reduce(scaled);
                cellTable.push({scaled, plantIndex, pollIndex});
            }
        });
    });

    const delay = Date.now() - now;
    console.log("Computed celltable in " + delay + " ms");
    const now2 = Date.now();

    const width = pollPerm.length * squareSize + 2 * squareMargin;
    const height = plantPerm.length * squareSize + 2 * squareMargin;
    canvas.width = width;
    canvas.height = height;
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, width, height);

    const xPos = index => index * squareSize + squareMargin;
    const yPos = index => index * squareSize + squareMargin;

    cellTable.forEach(function (cell) {
        const {scaled, plantIndex, pollIndex} = cell;
        const prop = (scaled - cellMin.value) / (cellMax.value - cellMin.value);

        const colour = fluid.colour.lookupStop(that.options.memoStops, prop);
        const xywh = [xPos(pollIndex), yPos(plantIndex), side, side];

        ctx.fillStyle = colour;
        ctx.fillRect.apply(ctx, xywh);

        ctx.strokeStyle = that.options.outlineColour;
        ctx.strokeRect.apply(ctx, xywh);
    });

    console.log("Celltable draw at  " + (Date.now() - now2) + " ms");

    const yoffset = 0; // offset currently disused
    const xoffset = -0.75;
    const countDimen = 48; // Need to hack bars slightly smaller to avoid clipping
    const countScale = 100 * (1 - 2 / countDimen);

    const plantNames = that.locate("plantNames")[0];
    plantNames.style.height = height;
    const plantMark = plantPerm.map(function (rec, plantIndex) {
        const plantId = rec.id;
        const row = that.taxa.rowById[plantId];
        const top = yPos(plantIndex);
        return `<div class="fl-imerss-int-label" data-row-id="${plantId}" style="top: ${top + yoffset}px">${row.iNaturalistTaxonName}</div>`;
    });
    plantNames.innerHTML = plantMark.join("\n");

    const plantCountNode = that.locate("plantCounts")[0];
    plantCountNode.style.height = height;
    const plantCountMark = plantPerm.map(function (rec, plantIndex) {
        const plantId = rec.id;
        const count = plantCounts.counts[plantId];
        const prop = fluid.roundToDecimal(countScale * count / plantCounts.max, 2);
        const top = yPos(plantIndex);
        // noinspection CssInvalidPropertyValue
        return `<div class="fl-imerss-int-count" data-row-id="${plantId}" style="top: ${top + yoffset}px; width: ${prop}%; height: ${side}px;"></div>`;
    });
    plantCountNode.innerHTML = plantCountMark.join("\n");

    const pollNames = that.locate("pollNames")[0];
    pollNames.style.width = width;
    const pollMark = pollPerm.map(function (rec, pollIndex) {
        const pollId = rec.id;
        const row = that.taxa.rowById[pollId];
        const left = xPos(pollIndex);
        return `<div class="fl-imerss-int-label" data-row-id="${pollId}" style="left: ${left + xoffset}px">${row.iNaturalistTaxonName}</div>`;
    });
    pollNames.innerHTML = pollMark.join("\n");

    const pollCountNode = that.locate("pollCounts")[0];
    pollCountNode.style.width = `${width}px`;
    const pollCountMark = pollPerm.map(function (rec, pollIndex) {
        const pollId = rec.id;
        const count = pollCounts.counts[pollId];
        const prop = fluid.roundToDecimal(countScale * count / pollCounts.max, 2);
        const left = xPos(pollIndex);
        // noinspection CssInvalidPropertyValue
        return `<div class="fl-imerss-int-count" data-row-id="${pollId}" style="left: ${left + xoffset}px; height: ${prop}%; width: ${side}px;"></div>`;
    });
    pollCountNode.innerHTML = pollCountMark.join("\n");

    const delay2 = Date.now() - now2;
    console.log("Rendered in " + delay2 + " ms");
};

hortis.interactionTooltipTemplate = `<div class="fl-imerss-tooltip">
    <div class="fl-imerss-photo" style="background-image: url(%imgUrl)"></div>" +
    <div class="fl-text"><b>%taxonRank:</b> %taxonNames</div>" +
    </div>`;

hortis.renderInteractionTooltip = function (that, cellKey) {
    const {plantId, pollId} = hortis.keyToIntIds(cellKey);
    const plantRow = that.taxa.rowById[plantId];
    const plantName = plantRow.iNaturalistTaxonName;
    const pollRow = that.taxa.rowById[pollId];
    const pollName = pollRow.iNaturalistTaxonName;
    const count = that.interactions.crossTable[cellKey];
    return `<div class="fl-imerss-int-tooltip"><div><i>${pollName}</i> on </div><div><i>${plantName}</i>:</div><div>Count: ${count}</div></div>`;
};

hortis.drawInteractions.bindEvents = function (that) {
    const crossTable = that.interactions.crossTable;
    const plantNames = that.locate("plantNames")[0];
    const plantCounts = that.locate("plantCounts")[0];
    const pollNames = that.locate("pollNames")[0];
    const pollCounts = that.locate("pollCounts")[0];

    const scroll = that.locate("scroll")[0];
    scroll.addEventListener("scroll", function () {
        const scrollTop = scroll.scrollTop;
        plantNames.scrollTop = scrollTop;
        plantCounts.scrollTop = scrollTop;
        const scrollLeft = scroll.scrollLeft;
        pollNames.scrollLeft = scrollLeft;
        pollCounts.scrollLeft = scrollLeft;
    });

    plantNames.addEventListener("scroll", function () {
        scroll.scrollTop = plantNames.scrollTop;
    });

    const canvas = that.locate("interactions")[0];

    const {squareSize, squareMargin} = that.options;
    const buff = squareMargin / squareSize;

    canvas.addEventListener("mousemove", function (e) {
        const xc = e.offsetX / squareSize,
            yc = e.offsetY / squareSize;
        const xb = xc % 1, yb = yc % 1;
        if (xb >= buff && xb <= 1 - buff && yb >= buff && yb <= 1 - buff) {
            const pollId = that.pollPerm?.[Math.floor(xc)]?.id,
                plantId = that.plantPerm?.[Math.floor(yc)]?.id;
            const key = hortis.intIdsToKey(plantId, pollId);
            const crossCount = crossTable[key];
            that.hoverEvent = e;
            that.applier.change("hoverCellKey", crossCount ? key : null);
        } else {
            that.applier.change("hoverCellKey", null);
        }
    });

    canvas.addEventListener("mouseleave", () => that.applier.change("hoverCellKey", null));
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

fluid.registerNamespace("hortis.obsQuantiser");

hortis.obsQuantiser.initGrid = function () {
    const grid = new fluid.ImmutableObject();
    grid.bounds = hortis.initBounds();
    grid.maxCount = 0;
    grid.buckets = {}; // hash of id to {count, byId}
    return grid;
};

fluid.defaults("hortis.obsQuantiser", {
    gradeNames: "fluid.modelComponent",
    baseLatitude: 37.5,
    model: {
        // latResolution - relay from long
        longResolution: 0.005,
        grid: hortis.obsQuantiser.initGrid()
    },
    modelRelay: {
        latResolution: {
            target: "latResolution",
            func: "hortis.longToLat",
            args: ["{that}.model.longResolution", "{that}.options.baseLatitude"]
        },
        obsToGrid: {
            target: "grid",
            func: "hortis.obsQuantiser.indexObs",
            args: ["{that}", "{vizLoader}.model.filteredObs", "{that}.model.latResolution", "{that}.model.longResolution"]
        }
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

hortis.obsQuantiser.indexObs = function (that, filteredObs, latResolution, longResolution) {
    const grid = hortis.obsQuantiser.initGrid();

    const now = Date.now();
    const rows = filteredObs;
    rows.forEach(function (row, index) {
        const coordIndex = hortis.obsQuantiser.coordToIndex(row.decimalLatitude, row.decimalLongitude, latResolution, longResolution);
        hortis.updateBounds(grid.bounds, row.decimalLatitude, row.decimalLongitude);

        let bucket = grid.buckets[coordIndex];
        if (!bucket) {
            bucket = grid.buckets[coordIndex] = {count: 0, byTaxonId: {}, plantByTaxonId: {}};
        }
        bucket.count++;
        grid.maxCount = Math.max(grid.maxCount, bucket.count);
        fluid.pushArray(bucket.byTaxonId, row.pollinatorINatId, index);
        fluid.pushArray(bucket.plantByTaxonId, row.plantINatId, index);
    });
    if (rows.length > 0) {
        hortis.expandBounds(grid.bounds, 0.1); // mapBox fitBounds are a bit tight
    }
    const delay = Date.now() - now;
    console.log("Gridded " + rows.length + " rows in " + delay + " ms: " + 1000 * (delay / rows.length) + " us/row");

    return grid;

    // that.applier.change(["grid"], grid);
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
