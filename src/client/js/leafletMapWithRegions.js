/* global L */

"use strict";

var hortis = fluid.registerNamespace("hortis");

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
        "onCreate.listenTaxonLinks": "hortis.listenTaxonLinks({sunburst})"
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
    var style = hortis.fillColorToStyle(clazz.fillColor || clazz.color);
    var normal = hortis.normaliseToClass(className);
    return fluid.stringTemplate(markup, {
        rowClass: "fld-bagatelle-legend-row-" + normal,
        previewClass: "fld-bagatelle-class-" + normal,
        previewStyle: "background-color: " + style.fillColor,
        keyLabel: className
    });
};

hortis.legendKey.drawLegend = function (map) {
    var blocks = fluid.transform(map.communities, function (community, key) {
        var clazzRows = fluid.transform(community.classes, function (troo, className) {
            return hortis.legendKey.renderMarkup(hortis.legendKey.rowTemplate, map.classes[className], className);
        });
        return fluid.stringTemplate(hortis.legendKey.blockTemplate, {
            community: key,
            rows: Object.values(clazzRows).join("\n")
        });
    });
    var markup = Object.values(blocks).join("\n");
    var legendKeys = map.locate("legendKeys");
    legendKeys.html(markup);
    map.clazzToLegendNodes = fluid.transform(map.classes, function (troo, className) {
        var rowSel = ".fld-bagatelle-legend-row-" + hortis.normaliseToClass(className);
        var row = legendKeys.find(rowSel);
        row.click(function () {
            map.events.selectRegion.fire(className, map.classes[className].community);
        });
    });
};

hortis.toggleClass = function (element, clazz, value) {
    element.toggleClass(clazz, value);
};

hortis.legendKey.selectRegion = function (map, value, path) {
    var className = fluid.peek(path);
    var row = map.locate("legendKeys").find(".fld-bagatelle-legend-row-" + hortis.normaliseToClass(className));
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
    var community = fluid.peek(path);
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

hortis.convertTaxonLinks = function (text) {
    return text.replace(/\[([^\[]+)\]\(([^\)]*)\)/gm, function (match, p1, p2) {
        return "<a class=\"fld-bagatelle-taxon-link\" href=\"" + p2 + "\">" + p1 + "</a>";
    });
};

hortis.listenTaxonLinks = function (sunburst) {
    $(document).on("click", ".fld-bagatelle-taxon-link", function (e) {
        var target = e.target.getAttribute("href");
        e.preventDefault();
        console.log("Got click target ", target);
        if (target.startsWith("#taxon:")) {
            var targetTaxon = target.substring("#taxon:".length);
            sunburst.autocomplete.query(targetTaxon, function (rows) {
                hortis.confirmAutocomplete(sunburst, rows[0]);
            });
        }
    });
};

hortis.leafletMap.renderMapOuterPanel = function (map) {
    var selectedClazz = fluid.keyForValue(map.model.selectedRegions, true);
    var clazz = map.classes[selectedClazz];
    var topPanel = "";
    if (clazz.hasImage) {
        topPanel += fluid.stringTemplate(hortis.leafletMap.outerPanelPhoto, {
            photoClass: "fld-bagatelle-class-image-" + hortis.normaliseToClass(selectedClazz)
        });
    }
    var communityName = map.model.mapBlockTooltipId;
    var community = map.communities[communityName];
    topPanel += fluid.stringTemplate(hortis.leafletMap.outerPanelCommunity, {
        community: map.model.mapBlockTooltipId,
        hulqBlock: community.hulqName ? hortis.leafletMap.renderHulqName(community) : ""
    });
    topPanel += fluid.stringTemplate(hortis.leafletMap.outerPanelClass, {
        clazz: selectedClazz,
        hulqBlock: clazz.hulqName ? hortis.leafletMap.renderHulqName(clazz) : ""
    });
    var bottomPanel = "";
    if (community.culturalValues) {
        var cultureBlock =
            hortis.convertTaxonLinks(hortis.textToMarkup(community.culturalValues)) +
            "<div class=\"fld-bagatelle-map-class-se-col\">Sources:</div>" +
            hortis.textToMarkup(community.culturalValuesSources);
        var allCultureBlock = fluid.stringTemplate(hortis.leafletMap.outerPanelBlock, {
            blockName: "Cultural Values",
            block: cultureBlock
        });
        bottomPanel += allCultureBlock;
    }
    if (clazz["sE-Tagline"]) {
        var ecoBlock = "<div class=\"fld-bagatelle-map-class-tagline\">" + clazz["sE-Tagline"] + "</div>";
        hortis.leafletMap.seColumns.forEach(function (col) {
            ecoBlock += "<div class=\"fld-bagatelle-map-class-se-col\">" + col + ": </div>";
            ecoBlock += "<div class=\"fld-bagatelle-map-class-se-val\">" + clazz["sE-" + col] + "</div>";
        });
        var allEcoBlock = fluid.stringTemplate(hortis.leafletMap.outerPanelBlock, {
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
    var style = map.container[0].style;
    var noSelection = map.model.mapBlockTooltipId === null;
    Object.keys(map.regions).forEach(function (key) {
        var lineFeature = map.classes[key].color;
        style.setProperty(hortis.regionOpacity(key), selectedRegions[key] || noSelection ? "1.0" : "0.4");
        style.setProperty(hortis.regionBorder(key), selectedRegions[key] ? "#FEF410" : (lineFeature ? fluid.colour.arrayToString(lineFeature) : "none"));
    });
};

hortis.leafletMap.withRegions.addRegions = function (that) {
    that.map.createPane("hortis-regions");
    that.regionGroup = L.layerGroup({pane: "hortis-regions"}).addTo(that.map);
};

hortis.addStyle = function (text) {
    var style = document.createElement("style");
    style.type = "text/css";
    style.innerText = text;
    document.getElementsByTagName("head")[0].appendChild(style);
};

hortis.leafletMap.withRegions.drawRegions = function (map) {
    var regionClass = function (className) {
        return "fld-bagatelle-region-" + hortis.normaliseToClass(className);
    };
    map.applier.change("selectedRegions", hortis.leafletMap.withRegions.selectedRegions(null, map.classes));

    map.regionGroup.clearLayers();

    map.liveFeatures = map.features.map(function (feature) {
        var className = feature.properties.clazz;
        var community = feature.properties.COMMUNITY;
        var clazz = map.classes[className];
        var options = clazz.fillColor ? {
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
        var Lpolygon = L.geoJSON(feature, options);
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
    var highlightStyle = Object.keys(map.regions).map(function (key) {
        return "." + regionClass(key) + " {\n" +
           "  fill-opacity: var(" + hortis.regionOpacity(key) + ");\n" +
           "  stroke: var(" + hortis.regionBorder(key) + ");\n" +
           "}\n";
    });
    hortis.addStyle(highlightStyle.join("\n"));
};
