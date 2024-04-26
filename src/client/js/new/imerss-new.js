/*
Copyright 2017-2023 Antranig Basman
Licensed under the Educational Community License (ECL), Version 2.0 or the New
BSD license. You may not use this file except in compliance with one these
Licenses.
You may obtain a copy of the ECL 2.0 License and BSD License at
https://github.com/fluid-project/infusion/raw/master/Infusion-LICENSE.txt
*/

/* global Papa, maplibregl, preactSignalsCore */

"use strict";

// noinspection ES6ConvertVarToLetConst // otherwise this is a duplicate on minifying
var hortis = fluid.registerNamespace("hortis");

// TODO: Hoist this into some kind of core library
// noinspection ES6ConvertVarToLetConst // otherwise this is a duplicate on minifying
var {effect, computed, batch} = preactSignalsCore;

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

hortis.toggleClass = function (container, clazz, value, inverse) {
    container.classList[value ^ inverse ? "add" : "remove"](clazz);
};

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
                members: {
                    rows: "{vizLoader}.taxaRows"
                }
            }
        }
    },
    members: {
        resourcesLoaded: "@expand:signal()",
        taxaRows: "@expand:signal([])",
        obsRows: "@expand:signal([])",
        // Overridden by overall loader def to equal {filters}.allOutput
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

fluid.defaults("hortis.filter", {
    // gradeNames: "fluid.component",
    members: {
        filterInput: null, // must be overridden
        filterOutput: null // must be overridden
    }
});

fluid.defaults("hortis.filters", {
    // gradeNames: "fluid.component",
    listeners: {
        "onCreate.wireFilters": "hortis.wireObsFilters"
    },
    members: {
        allInput: "{vizLoader}.obsRows",
        allOutput: "@expand:signal([])"
    }
});

hortis.wireObsFilters = function (that) {
    const filterComps = fluid.queryIoCSelector(that, "hortis.filter", true);
    let prevOutput = that.allInput;

    filterComps.forEach(filterComp => {
        filterComp.filterInput = prevOutput;
        filterComp.filterOutput = computed( () => {
            return filterComp.doFilter(filterComp.filterInput.value, filterComp.filterState.value);
        });
        prevOutput = filterComp.filterOutput;
    });
    effect( () => that.allOutput.value = prevOutput.value);
};

// Do this by hand since we will have compressed viz one day
hortis.vizLoader.bindResources = async function (that) {
    const resourceLoaders = fluid.queryIoCSelector(that, "hortis.bareResourceLoader", true);
    const promises = resourceLoaders.map(resourceLoader => resourceLoader.completionPromise);
    const [taxa, obs] = await Promise.all(promises);
    batch( () => {
        that.taxaRows.value = taxa;
        that.obsRows.value = obs;
        that.resourcesLoaded.value = true;
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
    const state = value ? hortis.SELECTED : hortis.UNSELECTED;
    node.checked = state === hortis.SELECTED;
    node.indeterminate = state === hortis.INDETERMINATE;
    const holder = node.closest(".p-icon");
    const ui = holder.querySelector(".icon");
    $(ui).toggleClass("mdi-check", state !== hortis.INDETERMINATE);
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
        rowById:  "@expand:fluid.computed(hortis.taxa.map, {that}.rows, {that}.rowByIdPre)",
        entries:   "@expand:fluid.computed(hortis.computeEntries, {that}.rows, {that}.acceptRow)",
        entryById: "@expand:fluid.computed(hortis.indexEntries, {that}.entries)"
    },
    invokers: {
        acceptRow: "hortis.acceptRow({that}, {arguments}.0)"
    }
});

hortis.acceptRow = function (/*that, row*/) {
    // TODO: in Sunburst used to check nativeData
    return true;
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

// cf. hortis.flattenTreeRecurse - the tree now comes in flat
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
    const assignDepth = function (node, depth) {
        node.depth = depth;
        node.children.forEach(child => assignDepth(child, depth + 1));
    };
    if (rows.length > 0) {
        assignDepth(rows[0], 0);
    }
    return byId;
};

// Holds model state shared with checklist and index - TODO rename after purpose, "layout" used to refer to sunburst root
fluid.defaults("hortis.layoutHolder", {
    gradeNames: "fluid.modelComponent",
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
        rowFocus: "@expand:signal({})", // non-taxon based selection external to the checklist, e.g. incoming from a map?
        rowSelection: "@expand:signal({})", // taxon-based selection from the checklist - will be subset of rowFocus

        selectedId: "@expand:signal()",
        hoverId: "@expand:signal()",

        subscribeHover: "@expand:hortis.subscribeHover({that})"
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
    zoomDuration: 1000,
    mapOptions: {
        style: {
            version: 8,
            layers: [],
            sources: {}
        }
    },
    members: {
        map: "@expand:hortis.libreMap.make({that}.container.0, {that}.options.mapOptions, {that}.mapLoaded)",
        mapLoaded: "@expand:signal()"
    }
});

fluid.defaults("hortis.libreMap.withTiles", {
    // TODO: Syntax for throwing away arguments
    addTiles: "@expand:fluid.effect(hortis.libreMap.addTileLayers, {that}.map, {that}.options.tileSets, {that}.mapLoaded)"
});

hortis.libreMap.make = function (container, mapOptions, mapLoaded) {
    const togo = new maplibregl.Map({container, ...mapOptions});
    togo.on("load", function () {
        console.log("Map loaded");
        mapLoaded.value = 1;
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
    fillStops: hortis.libreMap.viridisStops,
    fillOpacity: 0.7,
    outlineColour: "black",
    members: {
        // TODO: "Trundling dereferencer" in the framework
        gridBounds: "@expand:fluid.derefSignal({obsQuantiser}.grid, bounds)",
        updateObsGrid: "@expand:fluid.effect(hortis.libreMap.updateObsGrid, {that}, {obsQuantiser}, {obsQuantiser}.grid, {that}.mapLoaded)",
        fitBounds: "@expand:fluid.effect(hortis.libreMap.fitBounds, {that}, {that}.gridBounds, {that}.mapLoaded)"
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
                    obsprop: bucket.count / grid.maxCount
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
            }
        };
        map.map.addLayer(layer);
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
    grid.maxCount = 0;
    grid.buckets = {}; // hash of id to {count, byId}
    return grid;
};

hortis.gridBucket = () => ({count: 0, byTaxonId: {}});

hortis.indexObs = function (bucket, row, index) {
    // TODO: some kind of mapping for standard rows, lightweight version of readCSVWithMap - current standard is for
    // "iNaturalist taxon ID" as seen in "assigned" data in Xetthecum story map
    fluid.pushArray(bucket.byTaxonId, row.iNatTaxonId, index);
};

fluid.defaults("hortis.obsQuantiser", {
    gradeNames: "fluid.modelComponent",
    members: {
        // Not invokers for performance
        newBucket: hortis.gridBucket,
        indexObs: hortis.indexObs,
        baseLatitude: "@expand:signal(37.5)",
        longResolution: "@expand:signal(0.005)",
        latResolution: "@expand:fluid.computed(hortis.longToLat, {that}.longResolution, {that}.baseLatitude)",
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
        bucket.count++;
        grid.maxCount = Math.max(grid.maxCount, bucket.count);
        that.indexObs(bucket, row, index);
    });
    if (rows.length > 0) {
        hortis.expandBounds(grid.bounds, 0.1); // mapBox fitBounds are a bit tight
    }
    const delay = Date.now() - now;
    fluid.log("Gridded " + rows.length + " rows in " + delay + " ms: " + 1000 * (delay / rows.length) + " us/row");

    return grid;
};

fluid.defaults("hortis.libreObsMap", {
    gradeNames: ["hortis.libreMap", "hortis.libreMap.withObsGrid"],
    components: {
        obsQuantiser: {
            type: "hortis.obsQuantiser",
            options: {
                members: {
                    longResolution: "@expand:signal(0.075)"
                }
            }
        }
    }
});


