/* global L */

"use strict";

var hortis = fluid.registerNamespace("hortis");

fluid.defaults("hortis.leafletMap.withRegions", {
    selectors: {
        legendKeys: ".fld-bagatelle-map-legend-keys"
    },
    modelListeners: {
        selectedRegions: {
            path: "selectedRegions",
            func: "hortis.leafletMap.withRegions.showSelectedRegions",
            args: ["{that}", "{change}.value"]
        }
    },
    legendKey: "@expand:hortis.leafletMap.renderLegendKey({that}.classes)",
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
        "clearMapSelection.regions": "hortis.clearSelectedRegions({that})",
        //                                                                          class,       community
        "selectRegion.regionSelection": "hortis.leafletMap.regionSelection({that}, {arguments}.0, {arguments}.1)"
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
    },
    dynamicComponents: {
        legendKeys: {
            sources: "{that}.options.legendKey",
            type: "hortis.legendKey",
            options: {
                clazz: "{source}"
            }
        }
    }
});

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


hortis.leafletMap.outerPanelPhoto = "<div class=\"fl-bagatelle-photo %photoClass\"></div>";

hortis.leafletMap.outerPanelMiddle =
   "<div class=\"fld-bagatelle-map-community\">Community:<br/> %community / Hul'qumi'num<button class=\"fl-xetthecum-small-audio\" type=\"button\"></button></div>" +
   "<div class=\"fld-bagatelle-map-class\">%clazz / Hul'qumi'num<button class=\"fl-xetthecum-small-audio\" type=\"button\"></button></div>";


hortis.leafletMap.renderMapOuterPanel = function (map) {
    var selectedClazz = fluid.keyForValue(map.model.selectedRegions, true);
    var clazz = map.classes[selectedClazz];
    var topPanel = "";
    if (clazz.hasImage) {
        topPanel += fluid.stringTemplate(hortis.leafletMap.outerPanelPhoto, {
            photoClass: "fld-bagatelle-class-image-" + hortis.normaliseToClass(clazz.label)
        });
    }
    topPanel += fluid.stringTemplate(hortis.leafletMap.outerPanelMiddle, {
        community: map.model.mapBlockTooltipId,
        clazz: clazz.label
    });
    var bottomPanel = "";
    if (clazz["sE-Tagline"]) {
        bottomPanel += "<div class=\"fld-bagatelle-map-class-tagline\">" + clazz["sE-Tagline"] + "</div>";
        hortis.leafletMap.seColumns.forEach(function (col) {
            bottomPanel += "<div class=\"fld-bagatelle-map-class-se-col\">" + col + ": </div>";
            bottomPanel += "<div class=\"fld-bagatelle-map-class-se-val\">" + clazz["sE-" + col] + "</div>";
        });
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


hortis.leafletMap.renderLegendKey = function (classes) {
    var array = fluid.hashToArray(classes, "key");
    array.sort(function (a, b) {
        return a.order - b.order;
    });
    return array;
};

fluid.defaults("hortis.legendKey", {
    gradeNames: "fluid.containerRenderingView",
    parentContainer: "{leafletMap}.dom.legendKeys",
    markup: {
        container: "<div class=\"fld-bagatelle-legend-row %rowClass\">" +
            "<span class=\"fld-bagatelle-legend-icon\"></span>" +
            "<span class=\"fld-bagatelle-legend-preview %previewClass\" style=\"%previewStyle\"></span>" +
            "<span class=\"fld-bagatelle-legend-label\">%keyLabel</span>" +
            "</div>"
    },
    modelRelay: {
        selected: {
            source: {
                context: "hortis.leafletMap.withRegions",
                segs: ["selectedRegions", "{that}.options.clazz.key"]
            },
            target: "selected"
        }
        /* selectedStyle: { // We can't write this or its modelListener equivalent because of BUG!
            source: "selected",
            target: {
                segs: ["dom", "container", "class", "fld-bagatelle-selected"]
            },
        }*/
    },
    modelListeners: {
        selectedToStyle: {
            path: "selected",
            listener: "hortis.toggleClass",
            args: ["{that}.container", "fld-bagatelle-selected", "{change}.value"]
        },
        click: {
            path: "dom.container.click",
            listener: "{leafletMap}.events.selectRegion.fire",
            args: ["{that}.options.clazz.key", "{that}.options.clazz.community"]
        }
    },

    invokers: {
        renderMarkup: "hortis.legendKey.renderMarkup({that}.options.markup, {that}.options.clazz)"
    }
});

hortis.toggleClass = function (element, clazz, value) {
    element.toggleClass(clazz, value);
};

hortis.fillColorToStyle = function (fillColor) {
    return {
        fillColor: fluid.colour.arrayToString(fillColor),
        fillOpacity: 1
    };
};

hortis.legendKey.renderMarkup = function (markup, clazz) {
    var style = hortis.fillColorToStyle(clazz.fillColor || clazz.color);
    return fluid.stringTemplate(markup.container, {
        rowClass: clazz.endGroup ? "fl-bagatelle-legend-end-group" : "",
        previewClass: "fld-bagatelle-class-" + hortis.normaliseToClass(clazz.key),
        previewStyle: "background-color: " + style.fillColor,
        keyLabel: clazz.legendLabel
    });
};

hortis.regionOpacity = function (region) {
    return "--bagatelle-" + region + "-opacity";
};

hortis.regionBorder = function (region) {
    return "--bagatelle-" + region + "-stroke";
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
    var regionClass = function (clazz) {
        return "fld-bagatelle-region-" + hortis.normaliseToClass(map.classes[clazz].label);
    };
    map.applier.change("selectedRegions", hortis.leafletMap.withRegions.selectedRegions(null, map.classes));

    map.regionGroup.clearLayers();

    map.liveFeatures = map.features.map(function (feature) {
        var className = feature.properties.CLASS;
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
