/*
Copyright 2017-2023 Antranig Basman
Licensed under the Educational Community License (ECL), Version 2.0 or the New
BSD license. You may not use this file except in compliance with one these
Licenses.
You may obtain a copy of the ECL 2.0 License and BSD License at
https://github.com/fluid-project/infusion/raw/master/Infusion-LICENSE.txt
*/

/* global Papa, maplibregl, preactSignalsCore, pako */

"use strict";

// noinspection ES6ConvertVarToLetConst // otherwise this is a duplicate on minifying
var hortis = fluid.registerNamespace("hortis");

// TODO: Hoist this into some kind of core library
// noinspection ES6ConvertVarToLetConst // otherwise this is a duplicate on minifying
var {effect, batch} = preactSignalsCore;

fluid.defaults("hortis.bareResourceLoader", {
    gradeNames: "fluid.component",
    members: {
        completionPromise: "@expand:fluid.promise()"
    }
});

fluid.defaults("hortis.csvReader", {
    gradeNames: "hortis.bareResourceLoader",
    // url: null,
    csvOptions: {
        header: true,
        skipEmptyLines: true
    },
    members: {
        rows: "@expand:signal()"
    },
    events: {
    },
    listeners: {
        "onCreate.parse": "hortis.csvReader.parse({that}, {that}.options.csvOptions, {that}.options.url)"
    }
});

// Override fluid.log to preserve line numbers
// Splendid answer from https://stackoverflow.com/a/66415531/1381443
Object.defineProperty(fluid, "log", {
    get: function () {
        return fluid.isLogging() ? console.log.bind(window.console, fluid.renderTimestamp(new Date()) + ":  ")
            : function () {};
    }
});

hortis.inflateUint8Array = async function (url) {
    const response = await fetch(url);

    const arrayBuffer = await response.arrayBuffer();
    const byteArray = new Uint8Array(arrayBuffer);

    const inflated = pako.inflate(byteArray, { to: "string" });
    return inflated;
};

hortis.toggleClass = function (container, clazz, value, inverse) {
    container.classList[value ^ inverse ? "add" : "remove"](clazz);
};

hortis.csvReader.parse = async function (that, csvOptions, url) {
    const complete = function (results) {
        that.parsed = results;
        that.data = results.data;
        that.headers = results.meta.fields;
        that.completionPromise.resolve(that.data);
        that.rows.value = that.data;
    };
    const error = function (err) {
        that.completionPromise.reject();
        fluid.fail("Error parsing CSV file ", url, ": ", err);
    };
    const download = {download: true};
    const downloadOptions = {...csvOptions, ...download, complete, error};
    if (url.endsWith(".csv")) {
        Papa.parse(url, downloadOptions);
    } else if (url.endsWith(".viz")) {
        const data = await hortis.inflateUint8Array(url);
        const results = Papa.parse(data, {...csvOptions});
        complete(results);
    } else {
        fluid.fail("Unrecognised CSV URL suffix for ", url);
    }
};

fluid.defaults("hortis.vizLoader", {
    gradeNames: ["fluid.component"],
    // obsFile,
    // taxaFile
    components: {
        taxaLoader: {
            type: "hortis.csvReader",
            options: {
                url: "{vizLoader}.options.taxaFile"
            }
        },
        obsLoader: {
            type: "hortis.csvReader",
            options: {
                url: "{vizLoader}.options.obsFile"
            }
        },
        taxa: {
            type: "hortis.taxa",
            options: {
                members: {
                    rows: "{vizLoader}.taxaRows"
                }
            }
        }
    },
    events: {
        onResourcesLoaded: null
    },
    members: {
        rendered: "@expand:signal()",
        idle: "@expand:signal(true)",
        resourcesLoaded: "@expand:signal()",
        taxaRows: "@expand:signal()",
        obsRows: "@expand:signal()",
        // Don't put filters here - Xetthecum doesn't have any and hortis.filters doesn't have any base grades
        filteredObs: "{that}.obsRows",
        // Proposed syntax: @compute:hortis.filterObs(*{that}.obs, {that}.obsFilter, *{that}.obsFilterVersion)
        finalFilteredObs: "@expand:fluid.computed({that}.filterObsByTaxa, {that}.filteredObs)"
    },
    invokers: {
        // Deal with global selection model for taxa, e.g. via map selections
        filterObs: fluid.identity,
        // override for taxon-based filters
        filterObsByTaxa: fluid.identity
    },

    listeners: {
        "onCreate.bindResources": "hortis.vizLoader.bindResources"
    }
});

// Do this by hand since we will have all-in-one compressed viz one day
hortis.vizLoader.bindResources = async function (that) {
    const resourceLoaders = fluid.queryIoCSelector(that, "hortis.bareResourceLoader", true);
    const promises = resourceLoaders.map(resourceLoader => resourceLoader.completionPromise);
    const [taxa, obs] = await Promise.all(promises);
    batch( () => {
        that.taxaRows.value = taxa;
        that.obsRows.value = obs;
        that.resourcesLoaded.value = true;
        that.events.onResourcesLoaded.fire();
        $(".imerss-container").tooltip({
            position: {
                my: "left top+5"
            }
        });
    });
};


hortis.taxonTooltipTemplate =
`<div class="imerss-tooltip">
    <div class="imerss-photo" style="background-image: url(%imgUrl)"></div>
    <div class="text"><b>%taxonRank:</b> %taxonNames</div>
</div>`;

hortis.capitalize = function (string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
};

hortis.renderTaxonTooltip = function (that, hoverId) {
    const row = that.rowById.value[hoverId];
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
    that[that.options.tooltipKey].value = null;
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

// This used to read:
// hover: {
// path: "hoverId",
//     excludeSource: "init",
//     funcName: "hortis.updateTooltip",
//     args: ["{that}", "{change}.value"]

hortis.subscribeHover = function (that) {
    const tooltipKey = that.options.tooltipKey;
    return effect( () => {
        // Note that we didn't used to be able to make a programmatically variable modelListener like this
        hortis.updateTooltip(that, that[tooltipKey].value);
    });
};

fluid.defaults("hortis.withTooltip", {
    // tooltipKey,
    invokers: {
        renderTooltip: "fluid.notImplemented"
    },
    members: {
        // hoverEvent applied manually
        subscribeHover: "@expand:hortis.subscribeHover({that})"
    }
});



fluid.defaults("hortis.checkbox", {
    gradeNames: "fluid.stringTemplateRenderingView",
    members: {
        value: "@expand:signal()",
        valueToDom: "@expand:fluid.effect(hortis.checkbox.valueToDom, {that}.value, {that}.dom.control.0)"
    },
    selectors: {
        control: "input"
    },
    elideParent: false,
    markup: {
        container: `
        <span class="pretty p-icon">
            <input type="checkbox" class="checklist-check"/>
            <span class="state p-success">
                <i class="icon mdi mdi-check"></i>
                <label></label>
            </span>
        </span>`
    },
    listeners: {
        "onCreate.listenCheck": "hortis.checkbox.listenCheck"
    }
});

hortis.checkbox.valueToDom = function (value, node) {
    const state = value ? "selected" : "unselected";
    node.checked = state === "selected";
    // State currently unused
    node.setAttribute("indeterminate", state === "indeterminate");
    const holder = node.closest(".p-icon");
    const ui = holder.querySelector(".icon");
    $(ui).toggleClass("mdi-check", state !== "indeterminate");
};

hortis.checkbox.listenCheck = function (that) {
    that.dom.locate("control").on("click", function () {
        that.value.value = this.checked;
    });
};


hortis.closeParentTaxa = function (rowFocus, rowById) {
    Object.keys(rowFocus).forEach(function (id) {
        let row = rowById[id];
        while (row) {
            rowFocus[row.id] = true;
            row = row.parent;
        }
    });
    return rowFocus;
};

hortis.taxaFromObs = function (filteredObs, rowById) {
    const taxonIds = {};
    filteredObs.forEach(row => {
        taxonIds[row["iNaturalist taxon ID"]] = true;
    });
    return hortis.closeParentTaxa(taxonIds, rowById);
};


// TODO: This does both hover and click - for interactions we just want hover
hortis.bindTaxonHover = function (that, layoutHolder) {
    const hoverable = that.options.selectors.hoverable;
    that.container.on("mouseenter", hoverable, function (e) {
        const id = this.dataset.rowId;
        layoutHolder.hoverEvent = e;
        layoutHolder.hoverId.value = id;
    });
    that.container.on("mouseleave", hoverable, function () {
        layoutHolder.hoverId.value = null;
    });
    that.container.on("click", hoverable, function () {
        const id = this.dataset.rowId;
        layoutHolder.events.taxonSelect.fire(id);
    });
};

fluid.defaults("hortis.taxa", {
    gradeNames: "fluid.component",
    members: {
        // rows: injected
        rowByIdPre:   "@expand:fluid.computed(hortis.indexTree, {that}.rows)",
        // Note, actually just fills in entries in rows - we claim the output is rowById because it is what is consumed everywhere
        rowById:   "@expand:fluid.computed(hortis.taxa.map, {that}.rows, {that}.rowByIdPre)",
        entries:   "@expand:fluid.computed(hortis.computeEntries, {that}.rows, {that}.acceptRow)",
        entryById: "@expand:fluid.computed(hortis.indexEntries, {that}.entries)"
    },
    invokers: {
        // Currently disused - we may one day want to support pre-filtering of taxa - perhaps we will supply "entries" as an argument to lookupTaxon
        acceptRow: "hortis.acceptTaxonRow({that}, {arguments}.0)",
        //                                                     query, maxSuggestions
        lookupTaxon: "hortis.lookupTaxon({that}.entries.value, {arguments}.0, {arguments}.1)"
    }
});

hortis.acceptTaxonRow = function (/*that, row*/) {
    // TODO: in Sunburst used to check nativeData
    return true;
};

hortis.nameOverrides = {
    "Chromista": "Chromists"
};

hortis.labelForRow = function (row, commonNames) {
    let name = commonNames && row.commonName ? row.commonName : row.iNaturalistTaxonName;
    if (row.hulqName) {
        name += " - " + row.hulqName;
    }
    name = hortis.nameOverrides[row.iNaturalistTaxonName] || name;
    return hortis.capitalize(name);
    // return row.rank ? (row.rank === "Life" ? "Life" : row.rank + ": " + name) : name;
};

hortis.autocompleteInputForTaxonRow = function (row) {
    return row ? hortis.labelForRow(row) + (row.commonName ? " (" + row.commonName + ")" : "") : row;
};

hortis.autocompleteSuggestionForTaxonRow = function (row) {
    return hortis.autocompleteInputForTaxonRow(row) + (row.childCount > 1 ? " (" + row.childCount + " species)" : "");
};

hortis.lookupTaxon = function (entries, query, maxSuggestions) {
    maxSuggestions = maxSuggestions || 1;
    const output = [];
    query = query.toLowerCase();
    for (let i = 0; i < entries.length; ++i) {
        const entry = entries[i],
            row = entry.row;
        const display = hortis.autocompleteInputForTaxonRow(row);
        if (display.toLowerCase().indexOf(query) !== -1) {
            output.push(row);
        }
        if (output.length >= maxSuggestions) {
            break;
        }
    }
    return maxSuggestions === 1 ? output[0] : output;
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

// cf. hortis.flattenTreeRecurse - the tree now comes in flat and sorted
hortis.taxa.map = function (rows, byId) {
    rows.forEach((row, i) => {
        row.flatIndex = i;
        if (!row.children) {
            row.children = []; // conform to standard of imerss-viz.js, this may get initialised by fluid.pushArray
        }
        if (row.parentId) {
            const parent = byId[row.parentId];
            row.parent = parent;
            fluid.pushArray(parent, "children", row);
        }
    });
    const assignDepth = function (node, childCount, depth) {
        node.depth = depth;
        // TODO: source this from summary properly
        const isLeaf = node.children.length === 0;
        node.childCount = node.children.reduce((childCount, child) => assignDepth(child, childCount, depth + 1), isLeaf ? 1 : 0);
        return node.childCount + childCount;
    };
    if (rows.length > 0) {
        assignDepth(rows[0], 0, 0);
    }
    return byId;
};

// Holds model state shared with checklist and index - TODO rename after purpose, "layout" used to refer to sunburst root
fluid.defaults("hortis.layoutHolder", {
    gradeNames: ["fluid.modelComponent", "hortis.withTooltip"],
    tooltipKey: "hoverId",
    events: {
        taxonSelect: null
    },
    members: {
        // isAtRoot computed
        // entryById -> rowById now injected
        taxonHistory: "@expand:signal([])", // currently unused, inherit from blitz etc.
        historyIndex: "@expand:signal(0)",

        rootId: "@expand:signal({that}.options.rootId)",
        rowFocus: "@expand:signal({})", // non-taxon based selection external to the checklist, e.g. derived from filtered Obs
        rowSelection: "@expand:signal({})", // taxon-based selection from the checklist - will be subset of rowFocus

        selectedId: "@expand:signal(null)",
        hoverId: "@expand:signal(null)"
    },
    // rootId
    modelRelay: {
        isAtRoot: {
            target: "isAtRoot",
            args: ["{that}.model.layoutId", "{that}.options.rootId"],
            func: (x, y) => x === y
        }
    },
    invokers: {
        renderTooltip: "hortis.renderTaxonTooltip({that}, {arguments}.0)"
    }
});


fluid.defaults("hortis.vizLoaderWithMap", {
    gradeNames: ["fluid.viewComponent", "hortis.vizLoader"],
    selectors: {
        map: ".imerss-map"
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

hortis.expandBounds = function (bounds, factor, latMin, longMin) {
    const longSpan = bounds[1][1] - bounds[0][1];
    const latSpan = bounds[1][0] - bounds[0][0];
    const longD = Math.max(longSpan * factor, longMin / 2);
    const latD = Math.max(latSpan * factor, latMin / 2);
    if (longSpan < 360) {
        bounds[1][1] += longD; bounds[0][1] -= longD;
        bounds[1][0] += latD; bounds[0][0] -= latD;
    }
};

// Basic style: https://github.com/maplibre/maplibre-gl-js/issues/638
fluid.defaults("hortis.libreMap", {
    gradeNames: "fluid.viewComponent",
    zoomDuration: 1000,
    zoomControlsPosition: "top-left",
    mapOptions: {
        style: {
            version: 8,
            layers: [],
            sources: {}
        }
    },
    events: {
        onLoad: null
    },
    listeners: {
        "onLoad.setStyle": {
            priority: "last",
            listener: "hortis.libreMap.setStyle",
            args: ["{that}.map", "{that}.options.mapOptions", "{that}.mapLoaded"]
        }
    },
    invokers: {
        sortLayers: "hortis.libreMap.sortLayers({that}.map)"
    },
    members: {
        map: "@expand:hortis.libreMap.make({that}, {that}.events.onLoad, {that}.container.0)",
        mapLoaded: "@expand:signal()",
        zoomControls: "@expand:hortis.libreMap.zoomControls({that}.map, {that}.options.zoomDuration, {that}.options.zoomControlsPosition)"
    }
});

hortis.libreMap.setStyle = function (map, mapOptions, mapLoaded) {
    // Have to do this after fill patterns are loaded otherwise images are not resolved
    map.setStyle(mapOptions.style);
    map.once("styledata", () => {
        mapLoaded.value = 1;
    });
};

hortis.libreMap.make = function (that, onLoad, container) {
    // Apply some blank options to start with just to get the map going - will need to wait for e.g. fillPatterns
    // to load before the real ones can be interpreted
    const emptyOptions = fluid.copy(fluid.defaults("hortis.libreMap").mapOptions);
    const map = new maplibregl.Map({container, ...emptyOptions});
    // Very long-standing bugs with mapbox load event: https://github.com/mapbox/mapbox-gl-js/issues/6707
    // and https://github.com/mapbox/mapbox-gl-js/issues/9779
    map.on("load", function () {
        console.log("Map loaded");
        fluid.promise.fireTransformEvent(onLoad, null, {that});
    });
    return map;
};

hortis.libreMap.sortLayers = function (map) {
    // Reach into undocumented impl of mapLibre and quickly sort the layers into desired order
    const style = map.style;
    const layers = Object.values(style._layers);
    console.log("Sorting layers ", layers);
    const sorted = layers.sort((a, b) => {
        const sortKeyA = a?.metadata?.sortKey ?? Infinity;
        const sortKeyB = b?.metadata?.sortKey ?? Infinity;
        return sortKeyA - sortKeyB;
    });
    const newOrder = sorted.map(sorted => sorted.id);
    style._order = newOrder;
    style._changed = true;
    style._layerOrderChanged = true;
};

const initNavigationControl = function (options) {
    this.options = options;
    this._container = fluid.h("div", {class: "maplibregl-ctrl maplibregl-ctrl-group"});
    this._zoomInButton = this._createButton("maplibregl-ctrl-zoom-in", (e) =>
        this._map.zoomIn({
            duration: options.zoomDuration,
            essential: true
        }, {originalEvent: e})
    );
    this._zoomInButton.appendChild(fluid.h("span", {
        class: "maplibregl-ctrl-icon",
        "aria-hidden": true
    }));
    this._zoomOutButton = this._createButton("maplibregl-ctrl-zoom-out", (e) =>
        this._map.zoomOut({
            duration: options.zoomDuration,
            essential: true
        }, {originalEvent: e})
    );
    this._zoomOutButton.appendChild(fluid.h("span", {
        class: "maplibregl-ctrl-icon",
        "aria-hidden": true
    }));
    // These two methods need to be copied in because bizarrely the ES6 class -> prototype mangling process sticks these
    // into the constructor - perhaps this is part of TS
    this._updateZoomButtons = () => {
        const zoom = this._map.getZoom();
        const isMax = zoom === this._map.getMaxZoom();
        const isMin = zoom === this._map.getMinZoom();
        this._zoomInButton.disabled = isMax;
        this._zoomOutButton.disabled = isMin;
        this._zoomInButton.setAttribute("aria-disabled", isMax.toString());
        this._zoomOutButton.setAttribute("aria-disabled", isMin.toString());
    };
    this._setButtonTitle = (button, title) => {
        const str = this._map._getUIString(`NavigationControl.${title}`);
        button.title = str;
        button.setAttribute("aria-label", str);
    };
};

const makeNavigationControl = function (options) {
    const inst = Object.create(maplibregl.NavigationControl.prototype);
    initNavigationControl.bind(inst)(options);
    return inst;
};


hortis.libreMap.zoomControls = function (map, zoomDuration, zoomControlsPosition) {
    const controls = makeNavigationControl({showCompass: false, showZoom: true, zoomDuration});
    map.addControl(controls, zoomControlsPosition);
    // disable map rotation using right click + drag
    map.dragRotate.disable();
    // disable map rotation using touch rotation gesture
    map.touchZoomRotate.disableRotation();
};

fluid.defaults("hortis.libreMap.withFillPatterns", {
    fillPatternPixelRatio: 6,
    invokers: {
        urlForFillPattern: {
            args: ["{that}.options.fillPatternPath", "{arguments}.0"],
            func: (fillPatternPath, fillPattern) => fillPatternPath + fillPattern + ".png"
        },
        loadFillPatterns: "hortis.libreMap.loadFillPatterns({that}, {that}.options.fillPatternPath, {that}.options.fillPatterns)"
    },
    listeners: {
        "onLoad.loadFillPatterns": "{that}.loadFillPatterns"
    }
});

hortis.libreMap.loadFillPatterns = function (map, fillPatternPath, fillPatterns) {
    return hortis.asyncForEach(Object.keys(fillPatterns || {}), async fillPattern => {
        const url = map.urlForFillPattern(fillPattern);
        const image = await map.map.loadImage(url);
        console.log("Loaded image ", url);
        // Explained in https://github.com/mapbox/mapbox-gl-js/pull/9372
        // Drawn in here: https://github.com/mapbox/mapbox-gl-js/blob/3f1d023894f1fa4d0d2dae0f9ca284a8bab19eaf/js/render/draw_fill.js#L139
        // Or maybe in here, looks very different in libre: https://github.com/maplibre/maplibre-gl-js/blob/main/src/render/draw_fill.ts#L112
        map.map.addImage(fillPattern, image.data, {pixelRatio: map.options.fillPatternPixelRatio});
    });
};

fluid.defaults("hortis.libreMap.withTiles", {
    // TODO: Syntax for throwing away arguments
    addTiles: "@expand:fluid.effect(hortis.libreMap.addTileLayers, {that}.map, {that}.options.tileSets, {that}.mapLoaded)"
});

fluid.defaults("hortis.libreMap.streetmapTiles", {
    tileSets: {
        baseMap: {
            tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
            attribution: "&copy; <a href=\"https://www.openstreetmap.org/copyright\">OpenStreetMap</a> contributors",
            tileSize: 256,
            metadata: {
                sortKey: 0
            }
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
                "raster-opacity": 0.3
            },
            metadata: {
                sortKey: 1
            }
        }
    }
});

hortis.libreMap.addTileLayers = function (map, tileSets) {
    const tileKeys = Object.keys(tileSets);
    tileKeys.forEach(function (key) {
        const tileSet = tileSets[key];
        const paint = tileSet.paint || {};
        const metadata = tileSet.metadata || {};
        console.log("Add tiles");
        map.addSource(key, {
            type: "raster",
            ...fluid.censorKeys(tileSet, ["paint"]) // TODO: "layout" too - https://docs.mapbox.com/style-spec/reference/layers/
        });
        map.addLayer({
            id: key,
            type: "raster",
            source: key,
            paint, metadata
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
    gradeNames: ["hortis.withTooltip"],
    tooltipKey: "hoverCell",
    fillStops: hortis.libreMap.viridisStops,
    fillOpacity: 0.5,
    outlineColour: "black",
    legendStops: 5,
    legendPosition: "bottom-right",
    gridResolution: 100,
    components: {
        obsQuantiser: {
            type: "hortis.obsQuantiser",
            options: {
                gridResolution: "{hortis.libreMap}.options.gridResolution"
            }
        }
    },
    members: {
        // TODO: "Trundling dereferencer" in the framework
        gridBounds: "@expand:fluid.derefSignal({obsQuantiser}.grid, bounds)",
        updateObsGrid: "@expand:fluid.effect(hortis.libreMap.updateObsGrid, {that}, {obsQuantiser}, {obsQuantiser}.grid, {that}.mapLoaded)",
        fitBounds: "@expand:fluid.effect(hortis.libreMap.fitBounds, {that}, {that}.gridBounds, {that}.mapLoaded)",

        memoStops: "@expand:fluid.colour.memoStops({that}.options.fillStops, 256)",
        // cf. maxwell.legendKey.addLegendControl in reknit-client.js - produces a DOM node immediately, renders as effect
        control: "@expand:hortis.libreMap.withObsGrid.addLegendControl({map}, {that}.options.legendPosition)",

        hoverCell: "@expand:signal(null)",
        gridVisible: "@expand:signal(true)"
    },
    invokers: {
        drawObsGridLegend: "hortis.libreMap.withObsGrid.drawLegend({map}, {obsQuantiser}.grid, {that}.gridVisible)"
        // Client needs to override renderTooltip
    },
    listeners: {
        "onCreate.bindGridSelect": "hortis.libreMap.bindGridSelect({that})"
    }
});

fluid.registerNamespace("hortis.legend");

hortis.legend.rowTemplate = `
<div class="imerss-legend-row">
    <span class="imerss-legend-icon"></span>
    <span class="imerss-legend-preview %previewClass" style="%previewStyle"></span>
    <span class="imerss-legend-label">%keyLabel</span>
</div>`;

// Very similar to maxwell.legendKey.addLegendControl and in practice generic, see if we can fold up - parameterised by
// rendering function, whatever signal args it has, and also visibility func
hortis.libreMap.withObsGrid.addLegendControl = function (map, legendPosition) {
    const control = map.drawObsGridLegend();
    control.onAdd = () => control.container;
    control.onRemove = () => {
        console.log("Cleaning up legend attached to ", control.container);
        control.cleanup();
    };

    map.map.addControl(control, legendPosition);

    return control;
};

hortis.libreMap.withObsGrid.drawLegend = function (map, gridSignal, gridVisibleSignal) {
    const quant = map.obsQuantiser;
    const container = document.createElement("div");
    container.classList.add("imerss-legend");
    const cstops = map.options.legendStops;
    const stops = fluid.iota(cstops);
    // Proportions from 0 to 1 at which legend entries are generated
    const legendStopProps = fluid.iota(cstops + 1).map(stop => stop / cstops);

    const renderLegend = function (grid) {
        // TODO: parameterise what the legend is with respect to
        const propToLevel = prop => Math.floor(prop * grid.maxObsCount);
        const regionMarkupRows = stops.map(function (stop) {
            const midProp = (legendStopProps[stop] + legendStopProps[stop + 1]) / 2;
            const colour = fluid.colour.lookupStop(map.memoStops, midProp);
            const label = propToLevel(legendStopProps[stop]) + " - " + propToLevel(legendStopProps[stop + 1]);
            return fluid.stringTemplate(hortis.legend.rowTemplate, {
                previewStyle: "background-color: " + colour,
                keyLabel: label
            });
        });
        const longRes = quant.longResolution.value;
        const baseLat = quant.baseLatitude.value;
        const longLen = Math.round(longRes * hortis.longitudeLength(baseLat));

        const markup = `<div class="imerss-legend-title">Observation count</div>` +
            regionMarkupRows.join("\n") +
            `<div class="imerss-legend-cell-size">Cell size: ${longLen}m</div>`;
        container.innerHTML = markup;
    };

    fluid.effect(renderLegend, gridSignal);
    fluid.effect(isVisible => hortis.toggleClass(container, "imerss-hidden", !isVisible), gridVisibleSignal);

    return {container};
};

// cf. hortis.libreMap.bindRegionSelect in reknit-client.js
hortis.libreMap.bindGridSelect = function (that) {
    const map = that.map;

    map.on("mousemove", (e) => {
        const features = map.queryRenderedFeatures(e.point);
        const visibleFeatures = features.filter(feature => feature.properties.cellId);
        that.hoverEvent = e.originalEvent;
        const cellId = visibleFeatures[0]?.properties.cellId || null;
        that.hoverCell.value = cellId;
        map.getCanvas().style.cursor = cellId ? "default" : "";
    });

    map.getCanvas().addEventListener("mouseleave", () => hortis.clearAllTooltips(that));
};

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

hortis.libreMap.obsGridFeature = function (map, obsQuantiser, grid) {
    const buckets = grid.buckets,
        latres = obsQuantiser.latResolution.value,
        longres = obsQuantiser.longResolution.value;
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
                    cellId: key,
                    obsprop: bucket.obsCount / grid.maxObsCount
                }
            };
        })
    };
};

hortis.libreMap.updateObsGrid = function (map, obsQuantiser, grid) {
    const geojson = hortis.libreMap.obsGridFeature(map, obsQuantiser, grid);

    let source = map.map.getSource("obsgrid-source");
    if (source) {
        source.setData(geojson);
    } else {
        map.map.addSource("obsgrid-source", {
            type: "geojson",
            data: geojson
        });
    }

    const layer = map.map.getLayer("obsgrid-layer");
    if (!layer) {
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
            },
            metadata: {
                sortKey: 100
            }
        };
        map.map.addLayer(layer);
        // TODO: Rather unsatisfactory, but we assume that this is the point we have all layers we are expecting to
        // Really need a dedicated addLayer wrapper
        map.sortLayers();
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
    that.map.fitBounds(swapped, {
        duration: that.options.zoomDuration,
        // Awkward to override the prefersReducedMotion setting but taking OS setting by default seems too severe
        essential: true}
    );
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

hortis.metresToLong = function (long, latitude) {
    return long / hortis.longitudeLength(latitude);
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
    const grid = {};
    grid.bounds = hortis.initBounds();
    grid.maxObsCount = 0;
    grid.buckets = {}; // hash of id to {count, byId}
    return grid;
};

hortis.gridBucket = () => ({obsCount: 0, byTaxonId: {}});

hortis.indexObs = function (bucket, row, index) {
    // TODO: some kind of mapping for standard rows, lightweight version of readCSVWithMap - current standard is for
    // "iNaturalist taxon ID" as seen in "assigned" data in Xetthecum story map
    fluid.pushArray(bucket.byTaxonId, row.iNaturalistTaxonId, index);
};

fluid.defaults("hortis.obsQuantiser", {
    gradeNames: "fluid.modelComponent",
    gridResolution: 100,
    members: {
        // Not invokers for performance
        newBucket: hortis.gridBucket,
        indexObs: hortis.indexObs,
        // Contains unbound references to vizLoader - in time we want to break this and inject these manually:
        // obsRows
        // filteredObsRows
        baseLatitude: "@expand:signal(37.5)",
        longResolution: "@expand:fluid.computed(hortis.metresToLong, {that}.options.gridResolution, {that}.baseLatitude)",
        latResolution: "@expand:fluid.computed(hortis.longToLat, {that}.longResolution, {that}.baseLatitude)",
        maxBounds: "@expand:fluid.computed(hortis.obsBounds, {vizLoader}.obsRows)",
        grid: {
            expander: {
                funcName: "fluid.computed",
                args: ["hortis.obsQuantiser.indexObs", "{that}", "{vizLoader}.finalFilteredObs", "{that}.latResolution", "{that}.longResolution"]
            }
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

hortis.obsBounds = function (rows) {
    const bounds = hortis.initBounds();
    rows.forEach(function (row) {
        hortis.updateBounds(bounds, row.decimalLatitude, row.decimalLongitude);
    });
    return bounds;
};

hortis.obsQuantiser.indexObs = function (that, rows, latRes, longRes) {
    const grid = hortis.obsQuantiser.initGrid();

    const now = Date.now();
    rows.forEach(function (row, index) {
        const coordIndex = hortis.obsQuantiser.coordToIndex(row.decimalLatitude, row.decimalLongitude, latRes, longRes);
        hortis.updateBounds(grid.bounds, row.decimalLatitude, row.decimalLongitude);

        let bucket = grid.buckets[coordIndex];
        if (!bucket) {
            bucket = grid.buckets[coordIndex] = that.newBucket();
        }
        bucket.obsCount++;
        grid.maxObsCount = Math.max(grid.maxObsCount, bucket.obsCount);
        that.indexObs(bucket, row, index);
    });
    if (rows.length === 0) {
        grid.bounds = [...that.maxBounds.value];
    }

    hortis.expandBounds(grid.bounds, 0.1, latRes * 6, longRes * 6); // mapBox fitBounds are a bit tight

    const delay = Date.now() - now;
    fluid.log("Gridded " + rows.length + " rows in " + delay + " ms: " + 1000 * (delay / rows.length) + " us/row");

    return grid;
};

fluid.defaults("hortis.libreObsMap", {
    gradeNames: ["hortis.libreMap", "hortis.libreMap.withObsGrid"]
});
