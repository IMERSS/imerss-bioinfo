/* global L */

"use strict";

const hortis = fluid.registerNamespace("hortis");

fluid.defaults("hortis.leafletMap.withRegions", {
    selectors: {
        legendKeys: ".fld-bagatelle-map-legend-keys"
    },
    modelListeners: {
        selectedRegions: [{
            namespace: "map",
            path: "selectedRegions",
            func: "hortis.leafletMap.withRegions.showSelectedRegions",
            args: ["{that}", "{change}.value"]
        }, {
            namespace: "legend",
            path: "selectedRegions.*",
            func: "hortis.legendKey.selectRegion",
            args: ["{that}", "{change}.value", "{change}.path"]
        }]
    },
    // legendKey: "@expand:hortis.leafletMap.renderLegendKey({that}.classes)",
    model: {
        // selectedRegions: classKey -> boolean
        // selectedCommunities: communityKey -> boolean
        selectionRoute: "map" // either "map" or "taxa"
    },
    members: {
        features: "{sunburst}.viz.features",
        classes: "{sunburst}.viz.classes",
        communities: "{sunburst}.viz.communities",
        toPlot: "{sunburst}.viz.communities", // For general contract of hortis.mapBlockToFocusedTaxa - rename this field, e.g. selectableRegions
        regions: "{sunburst}.viz.classes",
        outerPanel: "{sunburst}.dom.mapOuterPanel"
    },
    listeners: {
        "buildMap.addRegions": "hortis.leafletMap.withRegions.addRegions({that})",
        "buildMap.drawRegions": "hortis.leafletMap.withRegions.drawRegions({that})",
        "buildMap.drawLegend": "hortis.legendKey.drawLegend({that})",
        "clearMapSelection.regions": "hortis.clearSelectedRegions({that})",
        //                                                                          class,       community
        "selectRegion.regionSelection": "hortis.leafletMap.regionSelection({that}, {arguments}.0, {arguments}.1)",
        "onCreate.listenTaxonLinks": "hortis.listenTaxonLinks({sunburst})",
        "onCreate.validateTaxonLinks": "hortis.validateTaxonLinks({that])"
    },
    events: {
        selectRegion: null
    },
    components: {
        bannerManager: {
            type: "hortis.bannerManager",
            container: "body",
            options: {
                model: {
                    selectedCommunities: "{hortis.leafletMap}.model.selectedCommunities"
                }
            }
        }
    }
});

fluid.registerNamespace("hortis.legendKey");

hortis.legendKey.rowTemplate = "<div class=\"fld-bagatelle-legend-row\ %rowClass\">" +
            "<span class=\"fld-bagatelle-legend-icon\"></span>" +
            "<span class=\"fld-bagatelle-legend-preview %previewClass\" style=\"%previewStyle\"></span>" +
            "<span class=\"fld-bagatelle-legend-label\">%keyLabel</span>" +
            "</div>";

hortis.legendKey.blockTemplate = "<div class=\"fld-bagatelle-legend-block\"><span class=\"fld-bagatelle-legend-block-name\">%community</span>%rows</div>";

hortis.legendKey.renderMarkup = function (markup, clazz, className) {
    const style = hortis.fillColorToStyle(clazz.fillColor || clazz.color);
    const normal = hortis.normaliseToClass(className);
    return fluid.stringTemplate(markup, {
        rowClass: "fld-bagatelle-legend-row-" + normal,
        previewClass: "fld-bagatelle-class-" + normal,
        previewStyle: "background-color: " + style.fillColor,
        keyLabel: className
    });
};

hortis.legendKey.drawLegend = function (map) {
    const blocks = fluid.transform(map.communities, function (community, key) {
        const clazzRows = fluid.transform(community.classes, function (troo, className) {
            return hortis.legendKey.renderMarkup(hortis.legendKey.rowTemplate, map.classes[className], className);
        });
        return fluid.stringTemplate(hortis.legendKey.blockTemplate, {
            community: key,
            rows: Object.values(clazzRows).join("\n")
        });
    });
    const markup = Object.values(blocks).join("\n");
    const legendKeys = map.locate("legendKeys");
    legendKeys.html(markup);
    map.clazzToLegendNodes = fluid.transform(map.classes, function (troo, className) {
        const rowSel = ".fld-bagatelle-legend-row-" + hortis.normaliseToClass(className);
        const row = legendKeys.find(rowSel);
        row.click(function () {
            map.events.selectRegion.fire(className, map.classes[className].community);
        });
    });
};

hortis.toggleClass = function (element, clazz, value) {
    element.toggleClass(clazz, value);
};

hortis.legendKey.selectRegion = function (map, value, path) {
    const className = fluid.peek(path);
    const row = map.locate("legendKeys").find(".fld-bagatelle-legend-row-" + hortis.normaliseToClass(className));
    row.toggleClass("fld-bagatelle-selected", value);
};

hortis.fillColorToStyle = function (fillColor) {
    return {
        fillColor: fluid.colour.arrayToString(fillColor),
        fillOpacity: 1
    };
};


fluid.defaults("hortis.bannerManager", {
    gradeNames: "fluid.viewComponent",
    selectors: {
        banner: ".fl-xetthecum-banner"
    },
    modelListeners: {
        "selectedCommunities.*": {
            func: "hortis.bannerManager.toggleClass",
            args: ["{that}.dom.banner", "{change}.value", "{change}.path"]
        }
    }
});

hortis.normaliseToClass = function (str) {
    return str.toLowerCase().replace(/ /g, "-");
};

hortis.bannerManager.toggleClass = function (banner, state, path) {
    const community = fluid.peek(path);
    banner.toggleClass("fld-bagatelle-banner-" + hortis.normaliseToClass(community), state);
};

hortis.leafletMap.seColumns = ["What", "Where", "Importance", "Protection", "Source"];

hortis.leafletMap.hulqNameTemplate = " / <span aria-label=\"%label\" title=\"%label\" class=\"fl-bagatelle-hulq-name\">%hulqName</span>";

hortis.leafletMap.outerPanelPhoto = "<div class=\"fl-bagatelle-photo %photoClass\"></div>";

hortis.leafletMap.outerPanelCommunity = "<div class=\"fld-bagatelle-map-community\">Community:<br/>%community%hulqBlock</div>";
hortis.leafletMap.outerPanelClass = "<div class=\"fld-bagatelle-map-class\">%clazz%hulqBlock</div>";

hortis.leafletMap.outerPanelBlock =
    "<div class=\"fld-bagatelle-map-panel-block fld-taxonDisplay-expandable-header fl-taxonDisplay-runon-header\">%blockName" + hortis.expandButtonMarkup + "</div>" +
    "<div class=\"fld-taxonDisplay-expandable-remainder fl-taxonDisplay-runon-remainder\">%block</div>";


hortis.leafletMap.renderHulqName = function (row) {
    return fluid.stringTemplate(hortis.leafletMap.hulqNameTemplate, {
        hulqName: row.hulqName,
        label: "Meaning: " + hortis.encodeHTML(row.hulqMeaning) + " Source: " + hortis.encodeHTML(row.hulqSource)
    });
};

hortis.textToMarkup = function (text) {
    return hortis.encodeHTML(text).replace(/\n/g, "<br/>");
};

hortis.taxonLinkRegex = /\[([^\[]+)\]\(([^\)]*)\)/gm;

hortis.convertTaxonLinks = function (text) {
    return text.replace(hortis.taxonLinkRegex, function (match, p1, p2) {
        return "<a class=\"fld-bagatelle-taxon-link\" href=\"" + p2 + "\">" + p1 + "</a>";
    });
};

hortis.linkToTaxon = function (sunburst, taxonLink) {
    const targetTaxon = taxonLink.substring("#taxon:".length);
    return sunburst.lookupTaxon(targetTaxon);
};

hortis.validateTaxonLinks = function (map) {
    fluid.each(map.communities, function (community, key) {
        console.log("Validating community key ", key);
    });
};

// Accepts mouse event and function accepting row
hortis.withTaxonLink = function (sunburst, e, func) {
    const target = e.target.getAttribute("href");
    e.preventDefault();
    console.log("Got event target ", target);
    if (target.startsWith("#taxon:")) {
        const row = hortis.linkToTaxon(sunburst, target);
        if (row) {
            func(row);
        }
    }
};

hortis.listenTaxonLinks = function (sunburst) {
    $(document).on("click", ".fld-bagatelle-taxon-link", function (e) {
        hortis.withTaxonLink(sunburst, e, function (row) {
            sunburst.events.changeLayoutId.fire(row.id);
        });
    });

    $(document).on("mouseenter", ".fld-bagatelle-taxon-link", function (e) {
        hortis.withTaxonLink(sunburst, e, function (row) {
            sunburst.mouseEvent = e;
            sunburst.applier.change("hoverId", row.id);
        });
    });
    $(document).on("mouseleave", ".fld-bagatelle-taxon-link", function () {
        sunburst.applier.change("hoverId", null);
    });
};

hortis.leafletMap.renderMapOuterPanel = function (map) {
    const selectedClazz = fluid.keyForValue(map.model.selectedRegions, true);
    const clazz = map.classes[selectedClazz];
    let topPanel = "";
    if (clazz.hasImage) {
        topPanel += fluid.stringTemplate(hortis.leafletMap.outerPanelPhoto, {
            photoClass: "fld-bagatelle-class-image-" + hortis.normaliseToClass(selectedClazz)
        });
    }
    const communityName = map.model.mapBlockTooltipId;
    const community = map.communities[communityName];
    topPanel += fluid.stringTemplate(hortis.leafletMap.outerPanelCommunity, {
        community: map.model.mapBlockTooltipId,
        hulqBlock: community.hulqName ? hortis.leafletMap.renderHulqName(community) : ""
    });
    topPanel += fluid.stringTemplate(hortis.leafletMap.outerPanelClass, {
        clazz: selectedClazz,
        hulqBlock: clazz.hulqName ? hortis.leafletMap.renderHulqName(clazz) : ""
    });
    let bottomPanel = "";
    if (community.culturalValues) {
        const cultureBlock =
            hortis.convertTaxonLinks(hortis.textToMarkup(community.culturalValues)) +
            "<br/><br/><div class=\"fld-bagatelle-map-class-se-col\">Sources:</div>" +
            hortis.textToMarkup(community.culturalValuesSources);
        const allCultureBlock = fluid.stringTemplate(hortis.leafletMap.outerPanelBlock, {
            blockName: "Cultural Values",
            block: cultureBlock
        });
        bottomPanel += allCultureBlock;
    }
    if (clazz["sE-Tagline"]) {
        let ecoBlock = "<div class=\"fld-bagatelle-map-class-tagline\">" + clazz["sE-Tagline"] + "</div>";
        hortis.leafletMap.seColumns.forEach(function (col) {
            ecoBlock += "<div class=\"fld-bagatelle-map-class-se-col\">" + col + ": </div>";
            ecoBlock += "<div class=\"fld-bagatelle-map-class-se-val\">" + clazz["sE-" + col] + "</div>";
        });
        const allEcoBlock = fluid.stringTemplate(hortis.leafletMap.outerPanelBlock, {
            blockName: "Ecological Values",
            block: ecoBlock
        });
        bottomPanel += allEcoBlock;
    }
    return topPanel + bottomPanel;
};

hortis.leafletMap.withRegions.selectedRegions = function (selectedRegion, regions) {
    return fluid.transform(regions, function (junk, key) {
    // Note simplest way to avoid highlighting all when there is no map selection is to say none are selected
        return selectedRegion ? key === selectedRegion : false;
    });
};

hortis.leafletMap.regionSelection = function (map, className, community) {
    map.applier.change("mapBlockTooltipId", community);
    map.applier.change("selectedRegions", hortis.leafletMap.withRegions.selectedRegions(className, map.classes));
    map.applier.change("selectedCommunities", hortis.leafletMap.withRegions.selectedRegions(community, map.communities));
    map.outerPanel.html(hortis.leafletMap.renderMapOuterPanel(map));
};

hortis.clearSelectedRegions = function (map) {
    map.applier.change("selectedRegions", hortis.leafletMap.withRegions.selectedRegions(null, map.classes));
    map.applier.change("selectedCommunities", hortis.leafletMap.withRegions.selectedRegions(null, map.communities));
};


hortis.regionOpacity = function (region) {
    return "--bagatelle-" + hortis.normaliseToClass(region) + "-opacity";
};

hortis.regionBorder = function (region) {
    return "--bagatelle-" + hortis.normaliseToClass(region) + "-stroke";
};

hortis.leafletMap.withRegions.showSelectedRegions = function (map, selectedRegions) {
    const style = map.container[0].style;
    const noSelection = map.model.mapBlockTooltipId === null;
    Object.keys(map.regions).forEach(function (key) {
        const lineFeature = map.classes[key].color;
        style.setProperty(hortis.regionOpacity(key), selectedRegions[key] || noSelection ? "1.0" : "0.4");
        style.setProperty(hortis.regionBorder(key), selectedRegions[key] ? "#FEF410" : (lineFeature ? fluid.colour.arrayToString(lineFeature) : "none"));
    });
};

hortis.leafletMap.withRegions.addRegions = function (that) {
    that.map.createPane("hortis-regions");
    that.regionGroup = L.layerGroup({pane: "hortis-regions"}).addTo(that.map);
};

hortis.addStyle = function (text) {
    const style = document.createElement("style");
    style.type = "text/css";
    style.innerText = text;
    document.getElementsByTagName("head")[0].appendChild(style);
};

hortis.leafletMap.withRegions.drawRegions = function (map) {
    const regionClass = function (className) {
        return "fld-bagatelle-region-" + hortis.normaliseToClass(className);
    };
    map.applier.change("selectedRegions", hortis.leafletMap.withRegions.selectedRegions(null, map.classes));

    map.regionGroup.clearLayers();

    map.liveFeatures = map.features.map(function (feature) {
        const className = feature.properties.clazz;
        const community = feature.properties.COMMUNITY;
        const clazz = map.classes[className];
        const options = clazz.fillColor ? {
            style: hortis.fillColorToStyle(clazz.fillColor),
            weight: 3,
            stroke: "yellow" // Leaflet doesn't listen to weight if there is no initial stroke
        } : {
            style: {
                color: fluid.colour.arrayToString(clazz.color),
                weight: 3
            }
        };
        options.className = regionClass(className) + " fld-bagatelle-region";
        const Lpolygon = L.geoJSON(feature, options);
        map.regionGroup.addLayer(Lpolygon);

        Lpolygon.on("click", function () {
            console.log("Map clicked on community ", community, " region ", className);
            map.events.selectRegion.fire(className, community);
        });
        return {
            Lpolygon: Lpolygon,
            properties: feature.properties
        };
    });
    const highlightStyle = Object.keys(map.regions).map(function (key) {
        return "." + regionClass(key) + " {\n" +
            "  fill-opacity: var(" + hortis.regionOpacity(key) + ");\n" +
            "  stroke: var(" + hortis.regionBorder(key) + ");\n" +
            "}\n";
    });
    hortis.addStyle(highlightStyle.join("\n"));
};
