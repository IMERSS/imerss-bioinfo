/* global L */

"use strict";

var hortis = fluid.registerNamespace("hortis");

fluid.defaults("hortis.leafletMap.withRegions", {
    selectors: {
        selectedRegion: ".fld-bagatelle-map-selected-region",
        unselectedRegion: ".fld-bagatelle-map-unselected-region"
    },
    modelListeners: {
        selectedRegions: {
            path: "selectedRegions",
            func: "hortis.leafletMap.withRegions.showSelectedRegions",
            args: ["{that}", "{change}.value"]
        }
    },
    modelRelay: {
        selectedRegions: {
            target: "selectedRegions",
            func: "hortis.leafletMap.withRegions.selectedRegions",
            args: ["{that}.model.mapBlockTooltipId", "{that}.regions"]
        }
    },
    members: {
        features: "{sunburst}.viz.features",
        regions: "{sunburst}.viz.regions",
        toPlot: "{sunburst}.viz.regions", // For general contract of hortis.mapBlockToFocusedTaxa - rename this field, e.g. selectableRegions
        classes: "{sunburst}.viz.classes"
    },
    gridStyle: {
        className: "fld-bagatelle-map-region"
    },
    listeners: {
        "buildMap.addRegions": "hortis.leafletMap.withRegions.addRegions({that})",
        "buildMap.drawRegions": "hortis.leafletMap.withRegions.drawRegions({that})"
    }
});

hortis.regionOpacity = function (region) {
    return "--bagatelle-" + region + "-opacity";
};

hortis.leafletMap.withRegions.showSelectedRegions = function (map, selectedRegions) {
    Object.keys(map.regions).forEach(function (key) {
        map.container[0].style.setProperty(hortis.regionOpacity(key),
            selectedRegions[key] ? "1.0" : "0.11");
    });
};

hortis.leafletMap.withRegions.selectedRegions = function (selectedRegion, regions) {
    return fluid.transform(regions, function (junk, key) {
        return selectedRegion ? key === selectedRegion : true;
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
    var normalise = function (str) {
        return str.toLowerCase().replace(/ /g, "-");
    };
    var regionClass = function (region) {
        return "fld-bagatelle-region-" + normalise(region);
    };
    var classClass = function (label) {
        return "fld-bagatelle-class-" + normalise(label);
    };

    map.regionGroup.clearLayers();

    map.liveFeatures = map.features.map(function (feature) {
        var className = feature.properties.CLASS;
        var region = feature.properties.region;
        var clazz = map.classes[className];
        var options = clazz.fillColor ? {
            style: {
                fillColor: fluid.colour.arrayToString(clazz.fillColor),
                fillOpacity: 1
            },
            stroke: false
        } : {
            style: {
                color: fluid.colour.arrayToString(clazz.color)
            }
        };
        options.className = regionClass(region) + " " + classClass(clazz.label) + " fld-bagatelle-region";
        var Lpolygon = L.geoJSON(feature, options);
        map.regionGroup.addLayer(Lpolygon);

        Lpolygon.on("click", function () {
            console.log("Map clicked on region ", region);
            map.applier.change("mapBlockTooltipId", region);
        });
        return {
            Lpolygon: Lpolygon,
            properties: feature.properties
        };
    });
    var highlightStyle = Object.keys(map.regions).map(function (key) {
        return "." + regionClass(key) + " {\n  fill-opacity: var(" + hortis.regionOpacity(key) + ");\n}\n";
    });
    hortis.addStyle(highlightStyle.join("\n"));
};
