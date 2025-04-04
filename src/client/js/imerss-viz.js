/*
Copyright 2017-2022 Antranig Basman
Licensed under the Educational Community License (ECL), Version 2.0 or the New
BSD license. You may not use this file except in compliance with one these
Licenses.
You may obtain a copy of the ECL 2.0 License and BSD License at
https://github.com/fluid-project/infusion/raw/master/Infusion-LICENSE.txt
*/

/* global lz4 */

"use strict";
// noinspection ES6ConvertVarToLetConst // otherwise this is a duplicate on minifying
var hortis = fluid.registerNamespace("hortis");

fluid.setLogging(true);

fluid.defaults("hortis.configHolder", {
    gradeNames: "fluid.component"
});

fluid.defaults("hortis.sunburstLoader", {
    gradeNames: ["fluid.viewComponent", "fluid.resourceLoader", "hortis.configHolder"],
    sunburstPixels: 1002,
    markupTemplate: "%resourceBase/html/imerss-viz.html",
    phyloMap: "%resourceBase/json/phyloMap.json",
    resourceBase: "src/client",
    queryOnStartup: "",
    selectOnStartup: "",
    showObsListInTooltip: true,
    gridResolution: undefined,
    friendlyNames: undefined,
    initialTab: "simpleChecklist",
    distributeOptions: {
        gridResolution: {
            source: "{that}.options.gridResolution",
            target: "{that hortis.quantiser}.options.model.longResolution"
        },
        friendlyNames: {
            source: "{that}.options.friendlyNames",
            target: "{that hortis.sunburst}.options.friendlyNames"
        },
        initialTab: {
            source: "{that}.options.initialTab",
            target: "{that hortis.imerssTabs}.options.model.selectedTab"
        }
    },
    resourceOptions: {
        terms: {
            resourceBase: "{that}.options.resourceBase"
        }
    },
    resources: {
        viz: {
            url: "{that}.options.vizFile",
            dataType: "binary",
            options: {
                processData: false,
                responseType: "arraybuffer"
            }
        },
        markup: {
            url: "{that}.options.markupTemplate",
            dataType: "text"
        },
        phyloMap: {
            url: "{that}.options.phyloMap",
            dataType: "json"
        }
    },
    invokers: {
        resolveColourStrategy: "hortis.resolveColourStrategy({that}.options.colourCount)"
    },
    listeners: {
        "onResourcesLoaded.renderMarkup": {
            priority: "first",
            listener: "hortis.sunburstLoader.renderMarkup",
            args: ["{that}.container", "{that}.resources.markup.resourceText", "{that}.options.renderMarkup", {
                sunburstPixels: "{that}.options.sunburstPixels"
            }]
        }
    },
    components: {
        sunburst: {
            type: "hortis.sunburst",
            createOnEvent: "onResourcesLoaded",
            options: {
                container: "{sunburstLoader}.container",
                gradeNames: "{sunburstLoader}.resolveColourStrategy",
                colourCount: "{sunburstLoader}.options.colourCount",
                culturalValues: "{sunburstLoader}.options.culturalValues",
                suppressObsAuthors: "{sunburstLoader}.options.suppressObsAuthors",
                queryOnStartup: "{sunburstLoader}.options.queryOnStartup",
                selectOnStartup: "{sunburstLoader}.options.selectOnStartup",
                members: {
                    viz: "@expand:hortis.decompressLZ4({sunburstLoader}.resources.viz.resourceText)",
                    tree: "{that}.viz.tree"
                },
                model: {
                    commonNames: "{sunburstLoader}.options.commonNames",
                    nativeDataOnly: "{sunburstLoader}.options.nativeDataOnly"
                }
            }
        }
    }
});

hortis.resolveResources = function (resources, terms) {
    const mapped = fluid.transform(resources, function (oneResource) {
        return fluid.extend(true, {}, oneResource, {
            url: fluid.stringTemplate(oneResource.url, terms)
        });
    });
    return mapped;
};

hortis.decompressLZ4 = function (arrayBuffer) {
    const uint8in = new Uint8Array(arrayBuffer);
    const uint8out = lz4.decompress(uint8in);
    const text = new TextDecoder("utf-8").decode(uint8out);
    return JSON.parse(text);
};

hortis.combineSelectors = function () {
    return fluid.makeArray(arguments).join(", ");
};

hortis.sunburstLoader.renderMarkup = function (container, template, renderMarkup, terms) {
    if (renderMarkup) {
        const rendered = fluid.stringTemplate(template, terms);
        const fragment = document.createRange().createContextualFragment(rendered);
        const root = fragment.firstElementChild;
        while (root.firstChild) {
            container[0].appendChild(root.firstChild);
        }
    }
    // WordPress is ancient and still uses the 2nd
    $(".imerss-container, .fl-imerss-container").tooltip({
        position: {
            my: "left top+5"
        }
    });
};

hortis.colouringGrades = {
    undocumentedCount: "fluid.component",
    observationCount: "hortis.sunburstWithObsColour"
};

hortis.resolveColourStrategy = function (countField) {
    return hortis.colouringGrades[countField];
};

fluid.defaults("hortis.sunburstWithObsColour", {
    gradeNames: "fluid.component",
    invokers: {
        fillColourForRow: "hortis.obsColourForRow({that}.options.parsedColours, {arguments}.0, {that}.flatTree.0)"
    }
});

fluid.defaults("hortis.imerssTabs", {
    gradeNames: "hortis.tabs",
    tabIds: {
        simpleChecklist: "fli-tab-simple-checklist",
        sunburst: "fli-tab-sunburst"
    },
    model: {
        // selectedTab: "checklist"
    }
});

// Holds model state shared with checklist and index
fluid.defaults("hortis.layoutHolder", {
    gradeNames: "fluid.modelComponent",
    members: {
        taxonHistory: []
    },
    events: {
        changeLayoutId: null // Used from checklists
    },
    model: {
        rowFocus: {},
        layoutId: null,
        selectedId: null,
        hoverId: null,
        historyIndex: 0
    },
    invokers: {
        filterEntries: "fluid.notImplemented"
    }
});

fluid.defaults("hortis.withPanelLabel", {
    gradeNames: "fluid.viewComponent",
    selectors: {
        panelLabel: ".imerss-panel-label"
    },
    model: {
        panelLabel: ""
    },
    modelRelay: {
        panelLabel: {
            source: "panelLabel",
            target: "dom.panelLabel.text"
        }
    }
});

// Note that sunburst's container is the overall imerss-container, all of its contents related to the
// sunburst itself really need to be demoted
fluid.defaults("hortis.sunburst", {
    gradeNames: ["hortis.layoutHolder", "hortis.withPanelLabel", "fluid.viewComponent"],
    selectors: {
        panelLabel: "#fli-tab-sunburst .imerss-panel-label", // irregularity due to faulty container level
        svg: ".imerss-svg",
        back: ".imerss-back",
        tabs: ".imerss-tabs",
        taxonDisplay: ".imerss-taxonDisplay",
        autocomplete: ".imerss-autocomplete",
        checklist: ".imerss-full-checklist-holder",
        simpleChecklist: ".imerss-simple-checklist-holder",
        segment: ".imerss-segment",
        label: ".imerss-label",
        phyloPic: ".imerss-phyloPic"
        // No longer supportable under FLUID-6145: BUG
        // mousable: "@expand:hortis.combineSelectors({that}.options.selectors.segment, {that}.options.selectors.label, {that}.options.selectors.phyloPic)"
    },
    styles: {
        segment: "imerss-segment",
        label: "imerss-label",
        phyloPic: "imerss-phyloPic",
        layoutRoot: "imerss-layoutRoot",
        labelPath: "imerss-labelPath",
        clickable: "imerss-clickable"
    },
    openTaxonPanels: {
        observationData: true,
        media: true
    },
    components: {
        autocomplete: {
            type: "hortis.autocomplete",
            options: {
                container: "{sunburst}.dom.autocomplete",
                id: "fli-imerss-autocomplete",
                listeners: {
                    onConfirm: "hortis.confirmAutocomplete({sunburst}, {arguments}.0)"
                },
                invokers: {
                    //                                                   query,         callback
                    query: "hortis.queryAutocomplete({that}.lookupTaxon, {arguments}.0, {arguments}.1)",
                    lookupTaxon: "{sunburst}.lookupTaxon({arguments}.0, {that}.options.maxSuggestions)",
                    renderInputValue: "hortis.autocompleteInputForRow",
                    renderSuggestion: "hortis.autocompleteSuggestionForRow"
                }
            }
        },
        tabs: {
            type: "hortis.imerssTabs",
            options: {
                container: "{sunburst}.dom.tabs",
                modelRelay: {
                    sunburstVisible: {
                        target: "{sunburst}.model.visible",
                        func: tab => tab === "sunburst",
                        args: "{tabs}.model.selectedTab"
                    }
                }
            }
        },
        simpleChecklist: {
            type: "hortis.checklist",
            options: {
                container: "{sunburst}.dom.simpleChecklist",
                filterRanks: ["phylum", "class", "order", "family", "species"]
            }
        }
    },
    colours: {
        lowColour: "#9ecae1",
        highColour: "#e7969c",
        unfocusedColour: "#ddd"
    },
    zoomDuration: 1250,
    scaleConfig: {
        // original settings 1 and 12
        innerDepth: 1 / 22,
        outerDepth: 13 / 22,
        rootRadii: [3 / 22,
            3 / 22,
            3 / 22,
            13 / 22],
        maxNodes: 200
    },
    parsedColours: "@expand:hortis.parseColours({that}.options.colours)",
    colourCount: "undocumentedCount",
    culturalValues: true,
    // Use public-friendly names such as "species" rather than "taxon"
    friendlyNames: false,
    suppressObsAuthors: false,
    model: {
        scale: {
            left: 0,
            right: 0,
            radiusScale: []
        },
        // From layoutHolder base grade:
        // layoutId: id of segment at layout root
        // hoverId: id of segment being hovered, giving rise to tooltip
        // selectedId: id of row for taxon display
        // rowFocus: {} - hash of row id to true for rows "focused" as a result of, e.g. map
        visible: false,
        commonNames: true,
        // Filter out taxa from all views which don't have native cultural data
        nativeDataOnly: false
    },
    modelRelay: {
        isAtRoot: {
            target: "isAtRoot",
            func: "hortis.isAtRoot",
            args: ["{that}", "{that}.model.layoutId"]
        },
        backEnabled: {
            target: "dom.back.attr.aria-disabled",
            func: index => index < 2,
            args: "{that}.model.historyIndex"
        }
    },
    markup: {
        segmentHeader: "<g xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\">",
        segment: "<path id=\"%id\" d=\"%path\" visibility=\"%visibility\" class=\"%clazz\" vector-effect=\"non-scaling-stroke\" style=\"%style\"></path>",
        // dominant-baseline fails on some old Chromium and AS machines
        label: "<path id=\"%labelPathId\" d=\"%textPath\" visibility=\"%labelVisibility\" class=\"%labelPathClass\" vector-effect=\"non-scaling-stroke\"></path>"
            + "<text id=\"%labelId\" dy=\"0.25em\" class=\"%labelClass\" visibility=\"%labelVisibility\" style=\"%labelStyle\">"
            + "<textPath xlink:href=\"#%labelPathId\" startOffset=\"50%\" style=\"text-anchor: middle\">%label</textPath></text>",
        phyloPic: "<image id=\"%phyloPicId\" class=\"%phyloPicClass imerss-clickable\" xlink:href=\"%phyloPicUrl\" height=\"%picDiameter\" width=\"%picDiameter\" x=\"%phyloPicX\" y=\"%phyloPicY\" />",
        segmentFooter: "</g>",
        taxonDisplayHeader: "<div>",
        taxonDisplayRow: "<div %rootAttrs><p><span class=\"taxonDisplay-key\">%key</span><span class=\"taxonDisplay-value %valueClazz\">%value</span></p></div>",
        taxonDisplayFooter: "</div>"
    },
    events: {
        changeLayoutId: null,
        doLayout: null
    },
    invokers: {
        render: "hortis.render({that})",
        renderLight: "hortis.renderLight({that})",
        renderSegment: "hortis.renderSegment({that}, {arguments}.0)",
        angleScale: "hortis.angleScale({arguments}.0, {that}.model.scale)",
        segmentClicked: "hortis.segmentClicked({that}, {arguments}.0)",
        fillColourForRow: "hortis.undocColourForRow({that}.options.parsedColours, {arguments}.0)",
        getMousable: "hortis.combineSelectors({that}.options.selectors.segment, {that}.options.selectors.label, {that}.options.selectors.phyloPic)",
        lookupTaxon: "hortis.lookupTaxon({that}.entries, {arguments}.0, {arguments}.1)",
        applyPhyloMap: {
            funcName: "hortis.applyPhyloMap",
            // flatTree - we moved this inline to computation of flatTree to avoid making another event
            args: ["{sunburstLoader}.resources.phyloMap.parsed", "{arguments}.0", "{sunburstLoader}.options.resourceOptions.terms"]
        },
        filterEntries: "hortis.filterEntries({that}, {arguments}.0)"
    },
    modelListeners: {
        scale: {
            excludeSource: "init",
            func: "{that}.renderLight"
        },
        selectedId: [{
            namespace: "updateTaxonDisplay",
            excludeSource: "init",
            funcName: "hortis.updateTaxonDisplay",
            args: ["{that}", "{change}.value"]
        }, {
            namespace: "renderLight",
            excludeSource: "init",
            func: "{that}.renderLight"
        }],
        hoverId: {
            excludeSource: "init",
            funcName: "hortis.updateTooltip",
            args: ["{that}", "{change}.value"]
        },
        rowFocus: {
            // Currently only the map updates rowFocus and it needs to read entries, etc.
            excludeSource: "init",
            funcName: "hortis.updateRowFocus",
            args: ["{that}", "{change}.value", "{change}.transaction"]
        },
        backClick: {
            path: "dom.back.click",
            funcName: "hortis.backTaxon",
            args: ["{that}"]
        },
        nativeDataOnly: {
            namespace: "computeSunburstEntries",
            funcName: "hortis.computeSunburstEntriesAndRender",
            args: "{that}"
        }
    },
    listeners: {
        "onCreate.doLayout": {
            func: "{that}.events.doLayout.fire"
        },
        "doLayout.impl": {
            func: "hortis.doLayout",
            args: ["{that}.entries"]
        },
        "doLayout.computeInitialScale": {
            funcName: "hortis.computeInitialScale",
            args: ["{that}"],
            priority: "after:doLayout"
        },
        "doLayout.boundNodes": {
            funcName: "hortis.boundNodes",
            args: ["{that}", "{that}.model.layoutId", true],
            priority: "before:render"
        },
        "doLayout.render": {
            func: "{that}.render",
            priority: "after:computeInitialScale"
        },
        "onCreate.bindSunburstMouse": {
            funcName: "hortis.bindSunburstMouse",
            args: ["{that}"]
        },
        "onCreate.bindRowExpander": {
            funcName: "hortis.bindRowExpander",
            args: ["{that}"]
        },
        // Naturally in "future Infusion" this would be a single chain event with beginZoom as the last listener
        //                                                            layoutId,      source
        "changeLayoutId.updateModel": "hortis.changeLayoutId({that}, {arguments}.0, {arguments}.1)"
    },
    members: {
        visMap: [], // array of visibility aligned with entries
        tree: null,
        flatTree: "@expand:hortis.flattenTree({that}, {that}.tree)",
        index: "@expand:hortis.indexTree({that}.flatTree)" // map id to row
    }
});


hortis.capitalize = function (string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
};

hortis.autocompleteInputForRow = function (row) {
    return row ? hortis.labelForRow(row) + (row.commonName ? " (" + row.commonName + ")" : "") : row;
};

hortis.autocompleteSuggestionForRow = function (row) {
    return hortis.autocompleteInputForRow(row) + (row.childCount > 1 ? " (" + row.childCount + " species)" : "");
};

hortis.lookupTaxon = function (entries, query, maxSuggestions) {
    maxSuggestions = maxSuggestions || 1;
    const output = [];
    query = query.toLowerCase();
    for (let i = 0; i < entries.length; ++i) {
        const entry = entries[i],
            row = entry.row;
        const display = hortis.autocompleteInputForRow(row);
        if (display.toLowerCase().indexOf(query) !== -1) {
            output.push(row);
        }
        if (output.length >= maxSuggestions) {
            break;
        }
    }
    return maxSuggestions === 1 ? output[0] : output;
};

hortis.queryAutocomplete = function (lookupTaxon, query, callback) {
    const output = lookupTaxon(query);
    callback(output);
};

hortis.confirmAutocomplete = function (that, row) {
    if (row) { // on blur it may send nothing
        that.events.changeLayoutId.fire(row.id, "autocomplete");
    }
};

hortis.rowToPhyloIndex = function (row) {
    return row.rank + ":" + row.iNaturalistTaxonName;
};

hortis.colourChildren = function (row, parsed) {
    row.lowColour = parsed.lowColour;
    row.highColour = parsed.highColour;
    row.children.forEach(function (child) {
        hortis.colourChildren(child, parsed);
    });
};

hortis.applyPhyloMap = function (phyloMap, rows, terms) {
    const parsedMap = fluid.transform(phyloMap, function (onePhylo) {
        const togo = {};
        if (onePhylo.pic) {
            togo.phyloPicUrl = fluid.stringTemplate(onePhylo.pic, terms);
        }
        if (onePhylo.taxonPic) {
            togo.taxonPic = fluid.stringTemplate(onePhylo.taxonPic, terms);
        }
        togo.taxonPicDescription = onePhylo.taxonPicDescription;
        if (onePhylo.colour) {
            const parsedColour = fluid.colour.hexToArray(onePhylo.colour);
            const hsl = fluid.colour.rgbToHsl(parsedColour);
            togo.lowColour = fluid.colour.hslToRgb([hsl[0], hsl[1], hsl[2] * 0.2 + 0.8]);
            togo.highColour = fluid.colour.hslToRgb([hsl[0], hsl[1], hsl[2] * 0.8 + 0.2]);
        }
        return togo;
    });
    rows.forEach(function (row) {
        const phyloIndex = hortis.rowToPhyloIndex(row);
        const parsed = parsedMap[phyloIndex];
        if (parsed) {
            row.phyloPicUrl = parsed.phyloPicUrl;
            row.taxonPic    = parsed.taxonPic;
            row.taxonPicDescription = parsed.taxonPicDescription;
            hortis.colourChildren(row, parsed);
        }
    });
};

hortis.taxonDisplayLookup = {
    iNaturalistTaxonName: "Taxon Name:",
    observationCount: "Observation Count:",
    iNaturalistObsLink: "Observation:",
    taxonLink: "iNaturalist Taxon:",
    commonName: "Common Name:",
    reportingStatus: "Status:",
    hulqName: "Hul'qumi'num name:",
    wikipediaSummary: "Wikipedia Summary",
    media: "Media",
    observationData: "Observation Data",
    iNaturalistTaxonImage: "iNaturalist Taxon Image:",
    phyloPic: "Taxon Icon:",
    taxonPic: "Taxon Picture:",
    taxonPicDescription: "Taxon Picture Description:"
};

hortis.friendlyDisplayLookup = {
    ...hortis.taxonDisplayLookup,
    iNaturalistTaxonName: "Species:"
};

hortis.commonFields = ["commonName", "wikipediaSummary"];

hortis.dumpRow = function (key, value, markup, extraClazz, valueClazz, options) {
    if (value) {
        const toLook = options?.friendlyNames ? hortis.friendlyDisplayLookup : hortis.taxonDisplayLookup;
        const keyName = key ? (toLook[key] || hortis.capitalize(key)) : "";
        valueClazz = valueClazz || "";
        const openPanel = options?.openTaxonPanels[key];
        const isRemainder = extraClazz && extraClazz.includes("taxonDisplay-expandable-remainder");
        const clazz = "taxonDisplay-row " + (extraClazz || "") + (openPanel ? " taxonDisplay-expanded" : " taxonDisplay-unexpanded");
        return fluid.stringTemplate(markup.taxonDisplayRow, {
            key: isRemainder ? "" : keyName,
            value: value,
            rootAttrs: "class=\"" + clazz + "\"",
            valueClazz: valueClazz
        });
    } else {
        return "";
    }
};

hortis.renderDate = function (date) {
    return new Date(date).toISOString().substring(0, 10);
};

hortis.expandButtonMarkup = "<span class=\"taxonDisplay-expand\"></span>";

hortis.expandableBlock =
    "<div class=\"%blockClazz taxonDisplay-expandable-header taxonDisplay-runon-header %state\">%blockName" + hortis.expandButtonMarkup + "</div>" +
    "<div class=\"taxonDisplay-expandable-remainder taxonDisplay-runon-remainder %state\">%block</div>";


hortis.sourceTable = { // TODO: get this from marmalised.json but the names currently there are too long
    iNat: "iNaturalist",
    PMLS: "Pacific Marine Life Surveys",
    RBCM: "Royal British Columbia Museum",
    CMN: "Canadian Museum of Nature",
    BCCSN: "British Columbia Cetacean Sightings Network",
    "Gal-Salm": "Erickson",
    CHU2010: "Chu and Leys (2010)",
    CHU2012: "Chu and Leys (2012)",
    Hunterston: "Hunterston Farms BioBlitz 2010"
};

/** Decode data collection from an observation id from a colon-separated prefix
 * @param {String} obsId - The observation id to be decoded
 * @return {String|null} The observation's collection if the observation id was qualified with a prefix, else null
 */
hortis.sourceFromId = function (obsId) {
    const colpos = obsId ? obsId.indexOf(":") : -1;
    return colpos === -1 ? null : obsId.substring(0, colpos);
};

hortis.datasetIdFromObs = function (obsId) {
    const colpos = obsId.indexOf(":");
    return obsId.substring(0, colpos);
};

hortis.localIdFromObs = function (obsId) {
    const colpos = obsId.indexOf(":");
    return obsId.substring(colpos + 1);
};

hortis.renderObsId = function (obsId) {
    const dataset = hortis.datasetIdFromObs(obsId);
    if (dataset === "iNat") {
        const localId = hortis.localIdFromObs(obsId);
        return fluid.stringTemplate(" (<a target=\"_blank\" href=\"https://www.inaturalist.org/observations/%obsId\">%obsId</a>)", {
            obsId: localId
        });
    } else {
        return obsId;
    }
};

// Render a set of fields derived from an "observation range" - group of fields prefixed by "first" and "last"
// including date/time/recordedBy/collection
hortis.renderObsBound = function (row, prefix, markup, options) {
    const date = row[prefix + "Timestamp"];
    if (date) {
        const capPrefix = prefix === "since" ? "" : hortis.capitalize(prefix);
        const recordedBy = row[prefix + "RecordedBy"];
        const catalogueNumber = row[prefix + "CatalogueNumber"];
        const value = hortis.renderDate(row[prefix + "Timestamp"]) + (recordedBy && !options.suppressObsAuthors ? " by " + recordedBy : "");

        const row1 = hortis.dumpRow(capPrefix + (prefix === "since" ? "First Observed:" : " Reported:"), value, markup);

        const obsId = row[prefix + "ObservationId"];

        // old-fashioned data used to use "Collection" - note that obsIds for Howe are currently screwed up so we use institutionCode
        // in prefewrence
        const collection = row[prefix + "Collection"];
        const institutionCode = row[prefix + "InstitutionCode"];

        const obsIdCollection = hortis.sourceFromId(row[prefix + "ObservationId"]);
        const renderedCollection = institutionCode || hortis.sourceTable[obsIdCollection || collection] || collection;

        let source = renderedCollection + (catalogueNumber && institutionCode !== "iNaturalist" ? " (" + catalogueNumber + ")" : "");
        // Two alternative routes to identifying an iNaturalist observation old-style and GBIF-style
        if (obsId && obsIdCollection === "iNat") {
            source += hortis.renderObsId(obsId);
        }
        if (catalogueNumber && institutionCode === "iNaturalist") {
            source += hortis.renderObsId("iNat:" + catalogueNumber);
        }

        const row2 = hortis.dumpRow("Source:", source, markup);

        return row1 + row2;
    } else {
        return "";
    }
};

hortis.mediaBlock =
    "<div class=\"imerss-media-name\">%mediaName</div>" +
    "<div class=\"imerss-media-image\"><a href=\"%mediaTarget\"><img src=\"%mediaImage\"/></a></div>" +
    "<div class=\"imerss-media-text\">%mediaText</div>";

hortis.renderOneMedium = function (medium) {
    return fluid.stringTemplate(hortis.mediaBlock, {
        mediaName: medium.Name,
        mediaTarget: medium.URL,
        mediaImage: medium.Thumbnail,
        mediaText: medium.Description
    });
};

hortis.renderExpandable = function (terms, expanded) {
    const allTerms = {
        ...terms,
        state: expanded ? "taxonDisplay-expanded" : "taxonDisplay-unexpanded"
    };
    return fluid.stringTemplate(hortis.expandableBlock, allTerms);
};

hortis.renderMedia = function (media) {
    const mediaBlocks = media.map(oneMedium => hortis.renderOneMedium(oneMedium));
    return mediaBlocks.join("\n");
};

hortis.drivePlayerTemplate = "<iframe frameborder=\"0\" width=\"360\" height=\"55\" src=\"%url\"></iframe>";

hortis.audioPlayerTemplate = `<audio controls><source src="%url" type="audio/mpeg"></audio>`;

hortis.driveToPreview = function (url) {
    const lastSlash = url.lastIndexOf("/");
    return url.substring(0, lastSlash) + "/preview";
};

// TODO: Backport of Phase III-style audio links so that we can still view Phase II viz with media
hortis.renderAudioLinkBackport = function (audioLink) {
    return audioLink ? fluid.stringTemplate(hortis.audioPlayerTemplate, {
        url: "https://imerss.github.io/xetthecum-storymap-story/" + audioLink
    }) : "";
};

hortis.hulqValues = ["food", "medicinal", "spiritual", "material", "trade", "indicator"];

hortis.hulqValueItem = "<div class=\"imerss-cultural-value\"><div role=\"img\" class=\"imerss-value-%img imerss-cultural-value-img\"></div><div class=\"imerss-cultural-value-text\">%label</div></div>";

hortis.hulqValueBlock = "<div class=\"imerss-cultural-values\">%valueBlocks</div>";

hortis.dumpHulqName = function (row, markup) {
    const player = hortis.renderAudioLinkBackport(row.audioLink);
    const nameRow = hortis.dumpRow("hulqName", row.hulqName + player, markup);
    return nameRow;
};

hortis.dumpHulqValues = function (row, markup) {
    const valueBlocks = hortis.hulqValues.map(function (value) {
        return row[value + "Value"] === "1" ? value : "missing";
    }).map(function (img, index) {
        return fluid.stringTemplate(hortis.hulqValueItem, {
            img: img,
            label: hortis.hulqValues[index]
        });
    });
    const valueBlock = fluid.stringTemplate(hortis.hulqValueBlock, {
        valueBlocks: valueBlocks.join("\n")
    });

    const valueRow1 = hortis.dumpRow("Cultural values", " ", markup, "taxonDisplay-empty-header");
    const valueRow2 = hortis.dumpRow("", valueBlock, markup, "taxonDisplay-empty-row");
    return valueRow1 + valueRow2;
};

hortis.iNatExtern = "<a href=\"%iNatLink\" target=\"_blank\" class=\"taxonDisplay-iNat-extern\">iNaturalist<span class=\"external-link\"></span></a>";


hortis.imageTemplate =
    "<div class=\"taxonDisplay-image-holder\">" +
        "<div class=\"imerss-photo\" style=\"background-image: url(%imgUrl)\"/>" +
        "%iNatExtern" +
    "</div></div>";

hortis.idToTaxonLink = function (taxonId) {
    return "https://www.inaturalist.org/taxa/" + taxonId;
};

hortis.rowToScientific = function (row) {
    return row.taxonName || row.iNaturalistTaxonName;
};

hortis.renderTaxonDisplay = function (row, markup, options) {
    if (!row) {
        return null;
    }
    let togo = markup.taxonDisplayHeader;
    const dumpRow = function (keyName, value, extraClazz, options) {
        if (keyName === "wikipediaSummary" && value) {
            // TODO: currently wikipediaSummary hard-defaults to closed on render
            // TODO: move to hortis.expandableBlock
            const stripped = value.replaceAll("<p", "<span").replaceAll("</p", "</span");
            const row1 = hortis.dumpRow("Wikipedia Summary", hortis.expandButtonMarkup, markup, "taxonDisplay-expandable-header taxonDisplay-unexpanded taxonDisplay-runon-header");
            const row2 = hortis.dumpRow("", stripped, markup, "taxonDisplay-expandable-remainder taxonDisplay-unexpanded taxonDisplay-runon-remainder", "taxonDisplay-wikipediaSummary");
            togo += row1 + row2;
        } else {
            togo += hortis.dumpRow(keyName, value, markup, extraClazz, undefined, options);
        }
    };
    const dumpImage = function (keyName, url, taxonId) {

        const imageMarkup = fluid.stringTemplate(hortis.imageTemplate, {
            imgUrl: url,
            iNatExtern: taxonId ? fluid.stringTemplate(hortis.iNatExtern, {
                iNatLink: hortis.idToTaxonLink(taxonId)
            }) : ""
        });
        // TODO: key name is currently ignored - other types of images, e.g. phylopics, and obs images, can't be distinguished
        togo += imageMarkup;
    };
    const dumpPhyloPic = function (keyName, url) {
        togo += hortis.dumpRow(keyName, "<div><img alt=\"Taxon photo\" height=\"150\" width=\"150\" class=\"imerss-photo\" src=\"" + url + "\"/></div>", markup);
    };
    if (row.rank) {
        if (row.iNaturalistTaxonImage && !row.taxonPic) {
            dumpImage("iNaturalistTaxonImage", row.iNaturalistTaxonImage, row.iNaturalistTaxonId);
        } else if (row.taxonPic) {
            dumpImage("taxonPic", row.taxonPic);
        }
        if (row.phyloPicUrl) {
            dumpPhyloPic("phyloPic", row.phyloPicUrl);
        }
        dumpRow(row.rank, hortis.rowToScientific(row), "taxonDisplay-rank");
        hortis.commonFields.forEach(function (field) {
            dumpRow(field, row[field]);
        });
        dumpRow("taxonPicDescription", row.taxonPicDescription);
        dumpRow("Species:", row.childCount);
        dumpRow("observationCount", row.observationCount);
    } else {
        if (row.iNaturalistTaxonImage && !row.obsPhotoLink) {
            dumpImage("iNaturalistTaxonImage", row.iNaturalistTaxonImage, row.iNaturalistTaxonId);
        }
        if (row.species) { // TODO: Barentsia sp. does not have species - presumably we should just dump anything here?
            // TODO: Need to revisit nutty system whereby we don't write "rank" for leaves. Need a special signal to
            // determine "there are any obs at this level".
            // Used to read:
            // dumpRow("Species:", row.species + (row.authority ? (" " + row.authority) : ""), "taxonDisplay-rank");
            // "species" now just holds raw species name. In the long term we should support our own normalised species name
            // composed of taxon and infrataxon name but this is at least now complete and agrees with what is shown in the tooltip
            dumpRow("iNaturalistTaxonName", (row.taxonName || row.iNaturalistTaxonName) + (row.authority ? (" " + row.authority) : ""), "taxonDisplay-rank", options);
        }
        if (row.hulqName) { // wot no polymorphism?
            togo += hortis.dumpHulqName(row, markup);
        }
        dumpRow("commonName", row.commonName && hortis.capitalize(row.commonName));

        if (row.hulqName && options.culturalValues) { // wot no polymorphism?
            togo += hortis.dumpHulqValues(row, markup);
        }

        if (row.media) {
            const mediaPanel = hortis.renderMedia(row.media, "");
            togo += hortis.dumpRow("media", hortis.expandButtonMarkup, markup, "taxonDisplay-expandable-header", null, options);
            togo += hortis.dumpRow("media", mediaPanel, markup, "taxonDisplay-expandable-remainder taxonDisplay-runon-remainder", null, options);
        }

        dumpRow("wikipediaSummary", row.wikipediaSummary);
        let obsPanel = "";

        obsPanel += hortis.dumpRow("reportingStatus", row.reportingStatus && hortis.capitalize(row.reportingStatus), markup);
        obsPanel += hortis.renderObsBound(row, "first", markup, options);
        obsPanel += hortis.renderObsBound(row, "last", markup, options);
        obsPanel += hortis.renderObsBound(row, "since", markup, options);

        if (row.iNaturalistObsLink) {
            obsPanel += hortis.dumpRow("iNaturalistObsLink", "<a href=\"" + row.iNaturalistObsLink + "\">" + row.iNaturalistObsLink + "</a>", markup);
        }
        obsPanel += hortis.dumpRow("observationCount", row.observationCount, markup);

        // TODO: Move to hortis.expandableBlock - hard since taxonDisplay-key and taxonDisplay-value
        // are nested inside here, but they are not in the outer map panels
        togo += hortis.dumpRow("observationData", hortis.expandButtonMarkup, markup, "taxonDisplay-expandable-header", null, options);
        togo += hortis.dumpRow("observationData", obsPanel, markup, "taxonDisplay-expandable-remainder taxonDisplay-runon-remainder taxonDisplay-group", null, options);

        if (row.obsPhotoLink) {
        // See this nonsense: https://stackoverflow.com/questions/5843035/does-before-not-work-on-img-elements
            dumpImage("Observation photo", row.obsPhotoLink);
        }

        /** Axed per AS email 16/10/21
        var iNatId = row.iNaturalistTaxonId;
        if (iNatId) {
            var taxonLink = "http://www.inaturalist.org/taxa/" + iNatId;
            dumpRow("taxonLink", "<a href=\"" + taxonLink + "\">" + taxonLink + "</a>");
        }*/
    }

    togo += markup.taxonDisplayFooter;
    return togo;
};

hortis.bindRowExpander = function (that) {
    that.container.on("click", ".taxonDisplay-expand", function (e) {
        const target = $(e.target);
        const header = target.closest(".taxonDisplay-expandable-header");
        header.toggleClass("taxonDisplay-expanded");
        header.toggleClass("taxonDisplay-unexpanded");
        const showing = header.hasClass("taxonDisplay-expanded");
        const siblings = header.parent().children();
        const ownIndex = header.index();
        const next = $(siblings[ownIndex + 1]);
        if (next.hasClass("taxonDisplay-expandable-remainder")) { // sanity check, we should not render ones without this
            next.toggleClass("taxonDisplay-expanded", showing);
            next.toggleClass("taxonDisplay-unexpanded", !showing);
        }
    });
};

hortis.updateTaxonDisplay = function (that, id) {
    const content = id ? hortis.renderTaxonDisplay(that.index[id], that.options.markup, that.options) : null;
    const taxonDisplay = that.locate("taxonDisplay");
    if (content) {
        taxonDisplay[0].innerHTML = content;
    }
};

hortis.tooltipTemplate = "<div class=\"imerss-tooltip\">" +
    "<div class=\"imerss-photo\" style=\"background-image: url(%imgUrl)\"></div>" +
    "<div class=\"text\"><b>%taxonRank:</b> %taxonNames</div>" +
    "</div>";

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
    const content = id ? hortis.renderTooltip(that.index[id], that.options.markup) : null;
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

hortis.isAtRoot = function (that, layoutId) {
    return layoutId === that.flatTree[0].id;
};

hortis.bindSunburstMouse = function (that) {
    const svg = that.locate("svg");
    // var mousable = that.options.selectors.mousable;
    const mousable = that.getMousable();
    svg.on("click", mousable, function () {
        const id = hortis.elementToId(this);
        let entry = that.entryIndex[id];
        if (!hortis.isAboveLayoutRoot(entry, that) && entry.row.phyloPicUrl) {
            entry = that.entries[0];
        }
        that.segmentClicked(entry.row);
    });
    svg.on("mouseenter", mousable, function (e) {
        const id = hortis.elementToId(this);
        that.mouseEvent = e;
        that.applier.change("hoverId", id);
    });
    svg.on("mouseleave", mousable, function () {
        that.applier.change("hoverId", null);
    });
};

hortis.parseColours = function (colours) {
    return fluid.transform(colours, function (colour) {
        return fluid.colour.hexToArray(colour);
    });
};


hortis.angleScale = function (index, scale) {
    const angle = 2 * Math.PI * (index - scale.left) / (scale.right - scale.left);
    return fluid.transforms.limitRange(angle, {min: 0, max: 2 * Math.PI});
};

hortis.outRings = function (array, count, width) {
    let lastRing = array[array.length - 1];
    for (let i = 0; i < count; ++i) {
        lastRing += width;
        array.push(lastRing);
    }
};

hortis.makeRadiusScale = function (innerRings, visRings, totalRings, scaleConfig, isAtRoot) {
    console.log("makeRadiusScale with innerRings ", innerRings, " visRings ", visRings);
    const togo = [0];
    if (isAtRoot && scaleConfig.rootRadii) {
        scaleConfig.rootRadii.forEach(function (radius) {
            hortis.outRings(togo, 1, 1000 * radius);
        });
        hortis.outRings(togo, 1 + totalRings - togo.length, 0);
    } else {
        // Allocate as many outerRings as we can without making in between rings narrower than innerDepth
        // Total amount available is 1 - innerRadius, in between thickness would be (1 - outerRings * options.outerDepth - innerRadius) / (totalRings - outerRings - innerRings);
        const outerRings = Math.floor((1 - visRings * scaleConfig.innerDepth) / (scaleConfig.outerDepth - scaleConfig.innerDepth));
        console.log("outerRings determined as ", outerRings);
        const middleRings = visRings - outerRings - innerRings;
        const middleDepth = (1 - outerRings * scaleConfig.outerDepth - innerRings * scaleConfig.innerDepth) / middleRings;

        hortis.outRings(togo, innerRings, 1000 * scaleConfig.innerDepth);
        hortis.outRings(togo, middleRings, 1000 * middleDepth);
        hortis.outRings(togo, outerRings, 1000 * scaleConfig.outerDepth);
        hortis.outRings(togo, totalRings - visRings, 0);
    }
    console.log("makeRadiusScale returning ", togo);
    return togo;
};

// Computes new visMap and sunburst geometry
hortis.boundNodes = function (that, layoutId, isInit) {
    console.log("boundNodes beginning for node ", layoutId);
    const layoutRoot = that.entryIndex[layoutId],
        visMap = [];
    for (let i = 0; i < that.entries.length; ++i) {
        visMap[i] = 0;
    }
    for (let visUp = layoutRoot; visUp; visUp = visUp.parent) {
        visMap[visUp.flatIndex] = 1;
    }
    const maxDepth = fluid.peek(that.entries).depth;
    let totalNodes = 1, parents = [layoutRoot], depth;
    for (depth = layoutRoot.depth; depth < maxDepth; ++depth) {
        let directChildren = 0;
        parents.forEach(function (parent) {
            directChildren += parent.children.length;
        });
        if (directChildren > 0 && totalNodes + directChildren < that.options.scaleConfig.maxNodes) {
            const newParents = [];
            parents.forEach(function (parent) {
                parent.children.forEach(function (child) {
                    visMap[child.flatIndex] = 1;
                });
                newParents.push.apply(newParents, parent.children);
            });
            parents = newParents;
            totalNodes += directChildren;
        } else {
            break;
        }
    }
    const isAtRoot = hortis.isAtRoot(that, layoutId);
    const radiusScale = hortis.makeRadiusScale(layoutRoot.depth, depth + 1, maxDepth + 1, that.options.scaleConfig, isAtRoot);
    const togo = {
        visMap: visMap,
        scale: {
            left: layoutRoot.leftIndex,
            right: layoutRoot.leftIndex + layoutRoot.childCount,
            radiusScale: radiusScale
        }
    };
    console.log("boundNodes returning ", togo);
    if (isInit) {
        that.visMap = visMap;
        that.applier.change("scale", togo.scale);
    }
    return togo;
};

hortis.isClickable = function (entry) {
    const row = entry.row;
    return entry.children.length > 0 || row.iNaturalistLink || row.iNaturalistTaxonId;
};

hortis.elementClass = function (entry, isSelected, styles, baseStyle) {
    return styles[baseStyle]
        + (hortis.isClickable(entry) ? " " + styles.clickable : "")
        + (isSelected ? " " + styles.layoutRoot : "");
};

hortis.elementStyle = function (attrs, elementType) {
    const opacity = attrs.opacity === undefined ? "" : " opacity: " + attrs.opacity + ";";
    return elementType === "segment" ? "fill: " + attrs.fillColour + ";" + opacity : opacity;
};

hortis.phyloPicAttrMap = {
    visibility: "visibility",
    x: "phyloPicX",
    y: "phyloPicY",
    height: "picDiameter",
    width: "pidDiameter"
};

hortis.renderLight = function (that) {
    that.entries.forEach(function (entry, index) {
        if (that.visMap[index] || that.oldVisMap && that.oldVisMap[index]) {
            const row = entry.row;
            const attrs = hortis.attrsForEntry(that, entry);
            attrs.fillColour = that.fillColourForRow(row);
            const isSelected = row.id === that.model.selectedId;
            const segment = fluid.byId("hortis-segment:" + row.id);
            if (segment) {
                segment.setAttribute("d", attrs.path);
                segment.setAttribute("visibility", attrs.visibility);
                segment.setAttribute("class", hortis.elementClass(entry, isSelected, that.options.styles, "segment"));
                segment.setAttribute("style", hortis.elementStyle(attrs, "segment"));
            }
            const labelPath = fluid.byId("hortis-labelPath:" + row.id);
            if (labelPath) {
                labelPath.setAttribute("d", attrs.textPath);
                labelPath.setAttribute("visibility", attrs.labelVisibility);
            }
            const label = fluid.byId("hortis-label:" + row.id);
            if (label) {
                label.setAttribute("visibility", attrs.labelVisibility);
                label.setAttribute("class", hortis.elementClass(entry, isSelected, that.options.styles, "label"));
                label.setAttribute("style", hortis.elementStyle(attrs, "label"));
            }
            const pic = fluid.byId("hortis-phyloPic:" + row.id);
            if (pic) {
                fluid.each(hortis.phyloPicAttrMap, function (source, target) {
                    pic.setAttribute(target, attrs[source]);
                });
            }
        }
    });
};

hortis.renderSVGTemplate = function (template, terms) {
    return fluid.stringTemplate(template, terms);
};

hortis.interpolateModels = function (f, m1, m2) {
    return fluid.transform(m1, function (value, key) {
        if (typeof(value) === "number") {
            return (1 - f) * value + f * m2[key];
        } else if (fluid.isPlainObject(value)) {
            return hortis.interpolateModels(f, value, m2[key]);
        } else {
            return value;
        }
    });
};

// These continue to use rows rather than entires since undocumentedCount etc. is computed in marmaliser and
// can't easily be updated. In future if we carry these colouring schemes forwards we'll do everything on
// the fly from rows.
// Note that the "focus colour" system was only ever a stopgap for the fact that we couldn't filter the
// sunburst - so we'll probably discontinue this and keep these using rows in the meantime.

hortis.undocColourForRow = function (parsedColours, row) {
    const undocFraction = 1 - row.undocumentedCount / row.childCount;
    const interp = fluid.colour.interpolate(undocFraction, row.highColour || parsedColours.highColour, row.lowColour || parsedColours.lowColour);
    return fluid.colour.arrayToString(interp);
};

hortis.obsColourForRow = function (parsedColours, row, rootRow) {
    const fraction = Math.pow(row.observationCount / rootRow.observationCount, 0.2);
    const interp = fluid.colour.interpolate(fraction, row.lowColour || parsedColours.lowColour, row.highColour || parsedColours.highColour);
    const focusProp = row.focusCount / row.childCount;
    const interp2 = fluid.colour.interpolate(focusProp, parsedColours.unfocusedColour, interp);
    return fluid.colour.arrayToString(interp2);
};

hortis.pathFromRoot = function (row) {
    const togo = [];
    while (row) {
        togo.unshift(row);
        row = row.parent;
    }
    return togo;
};

hortis.lcaRoot = function (parents) {
    let lcaRoot;
    for (let i = 0; ; ++i) {
        let commonValue = null;
        for (const key in parents) {
            const seg = parents[key][i];
            if (seg === undefined) {
                commonValue = null;
                break;
            } else if (commonValue === null) {
                commonValue = seg;
            } else if (commonValue !== seg) {
                commonValue = null;
                break;
            }
        }
        if (commonValue === null) {
            break;
        } else {
            lcaRoot = commonValue;
        }
    }
    return lcaRoot;
};

hortis.updateRowFocus = function (that, rowFocus, transaction) {
    const entries = that.entries;
    const focusAll = $.isEmptyObject(rowFocus);
    for (let i = entries.length - 1; i >= 0; --i) {
        const entry = entries[i];
        let focusCount;
        if (focusAll || rowFocus[entry.row.id]) {
            focusCount = entry.childCount;
        } else {
            focusCount = entry.children.reduce(function (sum, child) {
                return sum + child.focusCount;
            }, 0);
        }
        entry.focusCount = focusCount;
    }
    // The new entry root of layout computed to cover those rows focused
    let target;
    if (focusAll) {
        target = entries[0];
    } else {
        const parents = fluid.transform(rowFocus, function (troo, key) {
            const entry = that.entryIndex[key];
            return entry ? hortis.pathFromRoot(entry) : fluid.NO_VALUE;
        });
        const lca = hortis.lcaRoot(parents);
        target = Object.keys(parents).length === 1 ? lca.parent : lca;
    }
    if (target.leftIndex !== undefined) { // Avoid trying to render before onCreate
        // We signal this to regions - need to avoid mutual action of resetting map and taxa, and we assume that
        // map is the only source of updateRowFocus
        // TODO: Used to read || !focusAll - try to recall why, perhaps wrt. Xetthecum
        if (!transaction.fullSources.map || !focusAll) {
            that.events.changeLayoutId.fire(target.row.id, "rowFocus");
        }
    }
};

hortis.elementToId = function (element) {
    const id = element.id;
    return id.substring(id.indexOf(":") + 1);
};

hortis.backTaxon = function (that) {
    if (that.model.historyIndex > 1) {
        that.applier.change("historyIndex", that.model.historyIndex - 1);
        that.events.changeLayoutId.fire(that.taxonHistory[that.model.historyIndex - 1], "history");
    }
};

hortis.changeLayoutId = function (that, layoutId, source) {
    console.log("changeLayoutId to layoutId ", layoutId);
    that.applier.change("selectedId", layoutId);
    if (source !== "history") {
        that.taxonHistory[that.model.historyIndex] = layoutId;
        that.applier.change("historyIndex", that.model.historyIndex + 1);
    }
    const entry = that.entryIndex[layoutId];
    if (entry.children.length === 0) {
        // Don't change layout parent if the taxon selected by direct manipulation
        layoutId = source === "autocomplete" ? entry.parent.row.id : that.model.layoutId;
    }
    if (layoutId !== that.model.layoutId || source) {
        if (!that.model.layoutId) { // Can't render without some initial valid layout
            that.applier.change("layoutId", layoutId);
        } else {
            return hortis.beginZoom(that, layoutId);
        }
    }
    return fluid.promise().resolve();
};

// TODO: Consider whether we should always update layoutId at the start of the interaction in case there's any
// collateral state that depends on this. Note that we defeat async interaction when sunburst is not visible
hortis.beginZoom = function (that, rowId) {
    that.container.stop(true, true);
    hortis.clearAllTooltips(that);
    const initialScale = fluid.copy(that.model.scale);
    const newBound = hortis.boundNodes(that, rowId);
    newBound.scale.zoomProgress = 1;
    console.log("Begin zoom to rowId " + rowId);
    const togo = fluid.promise();
    that.oldVisMap = that.visMap;
    that.visMap = newBound.visMap;
    that.render();
    that.container.animate({"zoomProgress": 1}, {
        easing: "swing",
        duration: that.model.visible ? that.options.zoomDuration : 0,
        step: function (zoomProgress) {
            const interpScale = hortis.interpolateModels(zoomProgress, initialScale, newBound.scale);
            that.applier.change("scale", interpScale);
        },
        complete: function () {
            console.log("Zoom complete");
            delete that.oldVisMap;
            that.container[0].zoomProgress = 0;
            that.applier.change("layoutId", rowId);
            that.applier.change("scale.zoomProgress", 0); // TODO: suppress render here
            that.render();
            togo.resolve();
        }
    });
    return togo;
};

hortis.segmentClicked = function (that, row) {
    that.events.changeLayoutId.fire(row.id);
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

// Returns true if the supplied row is either at the layout root or above it. Alternatively - can we get to the
// global root from the layout root without hitting this row - if so it is not "shadowing" us (and hence its phylopic
// should not go to the centre)
hortis.isAboveLayoutRoot = function (entry, that) {
    const layoutId = that.model.layoutId;
    let layoutEntry = that.entryIndex[layoutId];
    while (layoutEntry) {
        if (layoutEntry.row.id === entry.row.id) {
            return false;
        }
        layoutEntry = layoutEntry.parent;
    }
    return true;
};

hortis.truncateLabel = function (label, chars) {
    return label.length > chars ? (label.substring(0, chars) + "…") : label;
};

// This guide is a great one for "bestiary of reuse failures": https://www.visualcinnamon.com/2015/09/placing-text-on-arcs.html
// What the chaining method reduces one to who is unable to allocate any intermediate variables

hortis.attrsForEntry = function (that, entry) {
    let leftAngle = that.angleScale(entry.leftIndex),
        rightAngle = that.angleScale(entry.leftIndex + entry.childCount),
        midAngle = (leftAngle + rightAngle) / 2,
        innerRadius = that.model.scale.radiusScale[entry.depth],
        outerRadius = that.model.scale.radiusScale[entry.depth + 1];
    const isAboveLayoutRoot = hortis.isAboveLayoutRoot(entry, that);
    const isComplete = fluid.model.isSameValue(leftAngle, 0) && fluid.model.isSameValue(rightAngle, 2 * Math.PI);
    const isCircle = fluid.model.isSameValue(innerRadius, 0) && isComplete;
    const isVisible = !fluid.model.isSameValue(leftAngle, rightAngle) && !fluid.model.isSameValue(innerRadius, outerRadius);
    const isOuterSegment = fluid.model.isSameValue(outerRadius - innerRadius, that.options.scaleConfig.outerDepth * 1000);
    const label = hortis.labelForRow(entry.row, that.model.commonNames);
    const outerLength = outerRadius * (rightAngle - leftAngle);
    // Note that only purpose of midRadius is to position phylopic
    const midRadius = (isCircle || !isAboveLayoutRoot) ? 0 : (innerRadius + outerRadius) / 2;
    const picRadius = outerRadius - midRadius;
    const radiusSpan = outerRadius - innerRadius;
    if (fluid.model.isSameValue(leftAngle, Math.PI)) {
        // Eliminate Chrome crash bug exhibited in https://amb26.github.io/svg-failure/ but apparently only on Windows 7!
        // Note that 1e-5 will be too small!
        leftAngle += 1e-4;
    }
    const outerLabelChars = isOuterSegment ? radiusSpan / 22 : Math.INFINITY;
    const labelVisibility = isOuterSegment ? outerLength > 45 : outerLength > label.length * 22; // TODO: make a guess of this factor from font size (e.g. 2/3 of it)
    const togo = {
        visibility: isVisible ? "visible" : "hidden",
        labelVisibility: isVisible && labelVisibility ? "visible" : "hidden",
        label: hortis.encodeHTML(hortis.truncateLabel(label, outerLabelChars)),
        phyloPicX: Math.cos(midAngle) * midRadius - picRadius,
        phyloPicY: -Math.sin(midAngle) * midRadius - picRadius,
        phyloPicUrl: entry.row.phyloPicUrl,
        picDiameter: 2 * picRadius
    };
    if (isComplete) {
        togo.textPath = hortis.circularTextPath(outerRadius);
        if (isCircle) {
            togo.path = hortis.circularPath(outerRadius);
        } else {
            togo.path = hortis.annularPath(innerRadius, outerRadius);
        }
    } else {
        togo.textPath = isOuterSegment ? hortis.linearTextPath(leftAngle, rightAngle, innerRadius, outerRadius) : hortis.segmentTextPath(leftAngle, rightAngle, outerRadius);
        togo.path = hortis.segmentPath(leftAngle, rightAngle, innerRadius, outerRadius);
    }
    if (that.oldVisMap) {
        const index = entry.flatIndex;
        if (!that.oldVisMap[index] && that.visMap[index]) {
            togo.opacity = that.model.scale.zoomProgress;
        } else if (that.oldVisMap[index] && !that.visMap[index]) {
            togo.opacity = 1 - that.model.scale.zoomProgress;
        }
    }
    return togo;
};

hortis.renderSegment = function (that, entry) {
    const row = entry.row;
    const isSelected = row.id === that.model.selectedId;
    const terms = $.extend({
        id: "hortis-segment:" + row.id,
        labelPathId: "hortis-labelPath:" + row.id,
        labelId: "hortis-label:" + row.id,
        phyloPicId: "hortis-phyloPic:" + row.id,
        clazz: hortis.elementClass(entry, isSelected, that.options.styles, "segment"),
        labelPathClass: that.options.styles.labelPath,
        phyloPicClass: that.options.styles.phyloPic,
        labelClass: hortis.elementClass(entry, isSelected, that.options.styles, "label"),
        fillColour: that.fillColourForRow(row)
    }, hortis.attrsForEntry(that, entry));
    terms.style = hortis.elementStyle(terms, "segment");
    terms.labelStyle = hortis.elementStyle(terms, "label");
    const togo = [{
        position: 0,
        markup: hortis.renderSVGTemplate(that.options.markup.segment, terms)
    }, {
        position: 2,
        markup: hortis.renderSVGTemplate(that.options.markup.label, terms)
    }];
    if (terms.phyloPicUrl) {
        togo.push({
            position: 1,
            markup: hortis.renderSVGTemplate(that.options.markup.phyloPic, terms)
        });
    }
    return togo;
};

hortis.elementComparator = function (element1, element2) {
    return element1.position - element2.position;
};

hortis.render = function (that) {
    let markup = that.options.markup.segmentHeader;
    let elements = [];
    for (let i = 0; i < that.entries.length; ++i) {
        if (that.visMap[i] || that.oldVisMap && that.oldVisMap[i]) {
            const entry = that.entries[i];
            elements = elements.concat(that.renderSegment(entry));
        }
    }
    elements.sort(hortis.elementComparator);
    markup += fluid.getMembers(elements, "markup").join("");
    markup += that.options.markup.segmentFooter;
    const container = that.locate("svg");
    container.empty();
    hortis.renderSVGElement(markup, container);
};


hortis.depthComparator = function (rowa, rowb) {
    return rowa.depth - rowb.depth;
};

hortis.hasNativeData = function (row) {
    return row.hulqName || row.culturalValues;
};

hortis.assignNativeDataFlags = function (flatTree) {
    flatTree.forEach(function (row) {
        if (hortis.hasNativeData(row)) {
            let move = row;
            while (move) {
                move.hasNativeData = true;
                move = move.parent;
            }
        } else {
            row.hasNativeData = false; // May be overwritten by recursion
        }
    });
};

// Cribbed from hortis.blitzRecords.render in js/new/imerss-blitz.js
// This field is read in checklist.js hortis.checklistItem
hortis.assignFilterReportingStatus = function (flatTree) {
    flatTree.forEach(row => {
        if (row.reportingStatus === "confirmed") {
            row.filterReportingStatus = "confirmed";
        } else if (row.reportingStatus === "reported") {
            row.filterReportingStatus = "unconfirmed";
        } else if (row.reportingStatus?.startsWith("new")) {
            // OCTOPOKHO: Side effect initialising filterReportingStatus
            row.filterReportingStatus = "new";
        }
    });
};

hortis.flattenTreeRecurse = function (tree, toAppend, depth) {
    let childCount = 0;
    tree.children.forEach(function (child) {
        child.parent = tree;
        toAppend.push(child);
        hortis.flattenTreeRecurse(child, toAppend, depth + 1);
        childCount += child.childCount;
    });
    if (tree.childCount === undefined) {
        tree.childCount = childCount ? childCount : 1;
    }
    // We used to assign initial focusCount during startup in updateRowFocus which could be depended on model init -
    // but we can't usefully depend on two model values.
    tree.focusCount = tree.childCount;
    if (tree.depth === undefined) {
        tree.depth = depth;
    }
};

hortis.flattenTree = function (that, tree) {
    const flat = [];
    flat.push(tree);
    hortis.flattenTreeRecurse(tree, flat, 0);
    flat.sort(hortis.depthComparator);
    flat.forEach(function (row, flatIndex) {
        row.flatIndex = flatIndex;
    });
    // Again - wot no polymorphism?
    // One day, again some kind of "data access event chain"
    hortis.assignNativeDataFlags(flat);
    hortis.assignFilterReportingStatus(flat);
    that.applyPhyloMap(flat);
    return flat;
};

hortis.indexTree = function (flatTree) {
    const index = {};
    flatTree.forEach(function (row) {
        index[row.id] = row;
    });
    return index;
};

hortis.indexEntries = function (entries) {
    const index = {};
    entries.forEach(function (entry) {
        index[entry.row.id] = entry;
    });
    return index;
};

// Accepts array of entry and returns array of entry - used from checklists
hortis.filterEntries = function (that, entries) {
    const togo = fluid.transform(entries, function (entry) {
        const id = entry.row.id;
        const ourEntry = that.entryIndex[id];
        // ourEntry may be undefined if it was filtered out via computeSunburstEntries
        if (ourEntry && ourEntry.focusCount > 0) {
            return {
                row: entry.row,
                children: hortis.filterEntries(that, entry.children)
            };
        } else {
            return fluid.NO_VALUE;
        }
    }) || [];
    return togo;
};

hortis.acceptSunburstRow = function (row, nativeDataOnly) {
    return !nativeDataOnly || row.hasNativeData;
};

// Accepts array of rows and returns array of "entries", where entry is {row, children: array of entry}
// Identical algorithm as for hortis.filterRanks - no doubt a functional programmer would fold this up
hortis.computeSunburstEntries = function (rows, nativeDataOnly) {
    const togo = [];
    fluid.each(rows, function (row) {
        if (hortis.acceptSunburstRow(row, nativeDataOnly)) {
            togo.push({
                row: row,
                children: hortis.computeSunburstEntries(row.children, nativeDataOnly)
            });
        } else {
            const dChildren = hortis.computeSunburstEntries(row.children, nativeDataOnly);
            Array.prototype.push.apply(togo, dChildren);
        }
    });
    return hortis.sortChecklistLevel(togo);
};

hortis.flattenEntries = function (rootEntry) {
    const flat = [];
    flat.push(rootEntry);
    hortis.flattenTreeRecurse(rootEntry, flat, 0);
    // Sort these primarily so that maxDepth is depth of last element
    // TODO: Looks like this comparator use is faulty, must have been depending on sorting of rows before
    flat.sort(hortis.depthComparator);
    flat.forEach(function (row, flatIndex) {
        row.flatIndex = flatIndex;
    });
    return flat;
};

hortis.computeSunburstEntriesAndRender = function (that) {
    that.entryRoot = hortis.computeSunburstEntries([that.flatTree[0]], that.model.nativeDataOnly)[0];
    that.entries = hortis.flattenEntries(that.entryRoot);
    that.entryIndex = hortis.indexEntries(that.entries);

    that.events.doLayout.fire(that);

    hortis.doLayout(that.entries);
    // fire doLayout event
};

hortis.doLayout = function (flatTree) {
    fluid.each(flatTree, function (node) {
        if (node.depth === 0) {
            node.leftIndex = 0;
        }
        let thisLeft = node.leftIndex;
        node.children.forEach(function (child) {
            child.leftIndex = thisLeft;
            thisLeft += child.childCount;
        });
    });
};

hortis.doInitialQuery = function (that) {
    // These used to be different but are now the same since we no longer select taxon on hover. Should be able to axe "selectOnStartup" as disused
    const toSelect = that.options.queryOnStartup || that.options.selectOnStartup;
    return toSelect ? that.lookupTaxon(toSelect) : that.flatTree[0];
};

hortis.computeInitialScale = function (that) {
    const root = hortis.doInitialQuery(that);
    that.events.changeLayoutId.fire(root.id);
};
