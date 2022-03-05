/* global L */

"use strict";

var hortis = fluid.registerNamespace("hortis");

fluid.defaults("hortis.leafletMap.withRegions", {
    selectors: {
        legendKeys: ".fld-bagatelle-map-legend-keys",
        infoPanel: ".fld-bagatelle-infoPanel",
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
        // selectedRegions: currently regionKey -> boolean, will be classKey -> boolean
        selectionRoute: "map" // either "map" or "taxa"
    },
    members: {
        features: "{sunburst}.viz.features",
        classes: "{sunburst}.viz.classes",
        communities: "{sunburst}.viz.communities",
        toPlot: "{sunburst}.viz.communities", // For general contract of hortis.mapBlockToFocusedTaxa - rename this field, e.g. selectableRegions
        regions: "{sunburst}.viz.classes",
        outerPanel: "{sunburst}.dom.mapOuterPanel",
        taxonDisplay: "{sunburst}.dom.taxonDisplay"
    },
    listeners: {
        "buildMap.addRegions": "hortis.leafletMap.withRegions.addRegions({that})",
        "buildMap.drawRegions": "hortis.leafletMap.withRegions.drawRegions({that})",
        "clearMapSelection.regions": "hortis.clearSelectedRegions({that})"
    },
    invokers: {                                                 // class,       community
        selectRegion: "hortis.leafletMap.regionSelection({that}, {arguments}.0, {arguments}.1)"
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

hortis.leafletMap.outerPanelTemplate = "<div class=\"fld-bagatelle-panel-label\">Ecological Habitat</div>" +
   "<div class=\"fld-bagatelle-map-community\">%community</div>" + 
   "<div class=\"fld-bagatelle-map-class\">%clazz</div>"


hortis.leafletMap.renderMapOuterPanel = function (map) {
    var selectedClazz = fluid.keyForValue(map.model.selectedRegions, true);
    return fluid.stringTemplate(hortis.leafletMap.outerPanelTemplate, {
        community: map.model.mapBlockTooltipId,
        clazz: map.classes[selectedClazz].legendLabel
    });
};

hortis.leafletMap.regionSelection = function (map, className, community) {
    map.applier.change("mapBlockTooltipId", community);
    map.applier.change("selectedRegions", hortis.leafletMap.withRegions.selectedRegions(className, map.classes));
    map.outerPanel.html(hortis.leafletMap.renderMapOuterPanel(map));
    map.outerPanel.show();
    map.taxonDisplay.hide();
};

hortis.clearSelectedRegions = function (map) {
    map.applier.change("selectedRegions", hortis.leafletMap.withRegions.selectedRegions(null, map.classes));
    map.outerPanel.hide();
    map.taxonDisplay.show();
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
        },
/*        selectedStyle: { // We can't write this or its modelListener equivalent because of BUG!
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
            listener: "{leafletMap}.selectRegion",
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

hortis.normaliseToClass = function (str) {
    return str.toLowerCase().replace(/ /g, "-");
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
        style.setProperty(hortis.regionOpacity(key), selectedRegions[key] || noSelection ? "1.0" : "0.11");
        style.setProperty(hortis.regionBorder(key), selectedRegions[key] ? "#FEF410" : "none");
    });
};

hortis.leafletMap.withRegions.selectedRegions = function (selectedRegion, regions) {
    return fluid.transform(regions, function (junk, key) {
    // Note simplest way to avoid highlighting all when there is no map selection is to say none are selected
        return selectedRegion ? key === selectedRegion : false;
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
                color: fluid.colour.arrayToString(clazz.color)
            }
        };
        options.className = regionClass(className) + " fld-bagatelle-region";
        var Lpolygon = L.geoJSON(feature, options);
        map.regionGroup.addLayer(Lpolygon);

        Lpolygon.on("click", function () {
            console.log("Map clicked on community ", community, " region ", className);
            map.selectRegion(className, community);
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
