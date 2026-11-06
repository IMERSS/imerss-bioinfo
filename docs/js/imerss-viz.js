"use strict";

/* global preactSignalsCore */

// noinspection ES6ConvertVarToLetConst // otherwise this is a duplicate on minifying
var hortis = fluid.registerNamespace("hortis");

// noinspection ES6ConvertVarToLetConst // otherwise this is a duplicate on minifying
var {} = preactSignalsCore;


fluid.defaults("hortis.standardVizLoader", {
    gradeNames: "hortis.vizLoaderWithMap",
    selectors: {
        recordReporter: ".imerss-filter-panel .imerss-record-reporter",
        // Refine this so we could have another .imerss-filter-controls elsewhere
        filterControls: ".imerss-filter-panel .imerss-filter-controls",
        filters: ".imerss-filter-panel .imerss-main-filters",
        // Not scoped to the filter panel since some pages hold the checklist in its own tab
        checklist: ".imerss-main-checklist"
    },
    gridResolution: 100,
    members: {
        filteredObs: "{obsFilters}.allOutput",
        taxaFromObs: "@expand:fluid.computed(hortis.taxaFromObs, {that}.filteredObs, {taxa}.rowById)",
        allTaxaFromObs: "@expand:fluid.computed(hortis.taxaFromObs, {that}.obsRows, {taxa}.rowById)"
    },
    components: {
        map: {
            options: {
                gridResolution: "{vizLoader}.options.gridResolution"
            }
        },
        regionIndirection: {
            type: "hortis.csvReader",
            options: {
                url: "{vizLoader}.options.regionIndirectionFile"
            }
        },
        filterControls: {
            type: "hortis.filterControls",
            container: "{that}.dom.filterControls"
        },
        recordReporter: {
            type: "hortis.recordReporter",
            container: "{that}.dom.recordReporter",
            options: {
                members: {
                    filteredRows: "{vizLoader}.finalFilteredObs",
                    allRows: "{vizLoader}.obsRows"
                }
            }
        },
        filters: {
            type: "hortis.blitzFilters",
            container: "{that}.dom.filters",
            options: {
                members: {
                    allInput: "{vizLoader}.obsRows",
                    rendered: "{hortis.vizLoader}.rendered",
                    idle: "{hortis.vizLoader}.idle"
                }
            }
        },
        tabs: {
            type: "hortis.tabs",
            container: ".imerss-main-tabs",
            options: {
                tabIds: {
                    map: "fli-tab-map",
                    checklist: "fli-tab-checklist",
                    grid: "fli-tab-grid",
                    wol: "fli-tab-wol"
                },
                model: {
                    selectedTab: "map"
                }
            }
        },
        checklist: {
            type: "hortis.checklist.withHolder",
            container: "{that}.dom.checklist",
            options: {
                gradeNames: ["hortis.checklist.withDownload", "hortis.checklist.withSearch", "hortis.checklist.withSingleSearch"],
                rootId: 48460, // Life
                filterRanks: ["epifamily", "family", "tribe", "genus", "subgenus", "species"],
                disclosableRanks: [],
                // disclosableRanks: ["tribe", "genus", "subgenus", "species"],
                copyChecklistRanks: ["genus", "species"],
                selectable: false,
                unfoldable: true,
                searchControlId: "fli-imerss-checklist-search",
                copyButtonMessage: "Copy %rows taxa to clipboard",
                members: {
                    rowById: "{taxa}.rowById",
                    rowFocus: "{vizLoader}.taxaFromObs"
                }
            }
        }
    }
});

hortis.taxaFromObs = function (filteredObs, rowById) {
    const taxonIds = {};
    const now = Date.now();
    filteredObs.forEach(row => {
        taxonIds[row.iNaturalistTaxonId] = true;
    });
    const togo = hortis.closeParentTaxa(taxonIds, rowById);
    const delay = Date.now() - now;
    fluid.log("taxaFromObs for " + filteredObs.length + " in " + delay + " ms");
    return togo;
};

hortis.mapGridTooltipTemplate =
    `<div class="imerss-tooltip imerss-grid-tooltip">
    <div><b>Observations:</b> %obsCount</div>
    <div class="text"><b>Taxa:</b> %taxonCount<div>%taxa</div></div>
    %footer
</div>`;

fluid.defaults("hortis.libreMap.withCartoKeys", {
    listeners: {
        // Patch of onLoad.setStyle in hortis.libreMap in imerss-new.js
        "onLoad.setStyle": {
            priority: "last",
            listener: "hortis.libreMap.setStyleWithCartoKeys",
            args: ["{that}.map", "{that}.options.mapOptions", "{that}.mapLoaded", "{that}.options.cartoKeys"]
        }
    },
    cartoKeys: {
        localhost: "cb1_4hrx_2_3dcc491b6c32aa8e72a242f0",
        imerss: "cb1_4hrx_1_114bebb1982ec5829bdf5497"
    }
});

/**
 * Creates a shallow copy of an object or array.
 *
 * @param {Object|Array} source - The object or array to copy.
 * @return {Object|Array} A shallow copy.
 */
fluid.shallowCopy = function (source) {
    return Array.isArray(source) ? source.slice() : {...source};
};

/**
 * Set a value at a given path within an object or array, without mutating the original structure.
 * Containers along the path are shallow-copied only if the value at the path actually changes - if it is
 * already identical (by `Object.is`), the original `root` is returned unchanged.
 *
 * @param {any} root - The root object to copy and modify.
 * @param {Array<String>} segs - A path expressed as  an Array of segments.
 * @param {any} newValue - The new value to set at the specified path.
 * @return {any} `root` if nothing changed, otherwise a new structure sharing all unaffected branches with `root`.
 */
fluid.setImmutable = function (root, segs, newValue) {
    const setAt = (node, i) => {
        if (i === segs.length) {
            return newValue;
        }
        const seg = segs[i];
        const container = fluid.isPlainObject(node);
        const oldChild = container ? node[seg] : undefined;
        const newChild = setAt(oldChild, i + 1);
        if (container && Object.is(newChild, oldChild) && seg in node) {
            return node; // Nothing changed beneath here - share the original
        }
        const copy = container ? fluid.shallowCopy(node) : {};
        copy[seg] = newChild;
        return copy;
    };

    return setAt(root, 0);
};

/**
 * Patched version of hortis.libreMap.setStyle which substitutes the appropriate Carto API key into the tile URLs
 * of any style whose key begins with "carto-" before applying the style to the map.
 *
 * @param {maplibregl.Map} map - The map to which the style should be applied.
 * @param {Object} mapOptions - The map options, whose `style` member holds a hash of style names to style declarations.
 * @param {Signal} mapLoaded - A signal which will be set to 1 once the style data has loaded.
 * @param {Object<String, String>} cartoKeys - A map of key names ("localhost", "imerss") to Carto API keys.
 */
hortis.libreMap.setStyleWithCartoKeys = function (map, mapOptions, mapLoaded, cartoKeys) {
    const keyNameToUse = document.location.href.includes("//localhost") ? "localhost" : "imerss";
    const terms = {
        CARTO_API_KEY: cartoKeys[keyNameToUse]
    };
    const cartoTileKeys = Object.keys(mapOptions.style.sources).filter(key => key.includes("carto-"));
    const mappedStyle = cartoTileKeys.reduce((style, tileKey) => {
        const source = style.sources[tileKey];
        const url = source.tiles[0];
        return fluid.setImmutable(style, ["sources", tileKey, "tiles", 0], hortis.stringTemplate(url, terms));
    }, mapOptions.style);

    // Have to do this after fill patterns are loaded otherwise images are not resolved
    map.setStyle(mappedStyle);
    map.once("styledata", () => {
        mapLoaded.value = 1;
    });
};

fluid.defaults("hortis.vizLibreMap", {
    gradeNames: ["hortis.libreObsMap", "hortis.libreMap.withTiles", "hortis.libreMap.streetmapTiles",
        "hortis.libreMap.withCartoKeys", "hortis.libreMap.withPolygonDraw"],
    components: {
        gridTooltip: {
            options: {
                invokers: {
                    renderTooltip: "hortis.renderVizGridTooltip({that}, {obsQuantiser}.grid.value, {taxa}.rowById.value, {arguments}.0)"
                }
            }
        }
    },
    gridResolution: 30,
    legendPosition: "bottom-left"
});


hortis.renderVizGridTooltip = function (that, grid, rowById, cellId) {
    const bucket = grid.buckets[cellId];

    const rowTemplate = "<div>%taxonName: %obsCount observation%s</div>";

    const rows = Object.entries(bucket.byTaxonId).map(([taxonId, obsIds]) => ({
        taxonName: rowById[taxonId].iNaturalistTaxonName,
        obsCount: obsIds.length,
        s: obsIds.length === 1 ? "" : "s"
    }));
    const sorted = rows.sort((rowa, rowb) => rowb.obsCount - rowa.obsCount);
    let footer = "";
    if (sorted.length > 10) {
        footer = `<div class="text">...</div>`;
        sorted.length = 10;
    }

    const terms = {
        obsCount: bucket.obsCount,
        taxonCount: rows.length,
        taxa: sorted.map(row => fluid.stringTemplate(rowTemplate, row)).join("\n"),
        footer
    };
    return fluid.stringTemplate(hortis.mapGridTooltipTemplate, terms);
};
