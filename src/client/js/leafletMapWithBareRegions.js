/* global L */

"use strict";

// noinspection ES6ConvertVarToLetConst // otherwise this is a duplicate on minifying
var hortis = fluid.registerNamespace("hortis");

hortis.addStyle = function (text) {
    const style = document.createElement("style");
    style.type = "text/css";
    style.innerText = text;
    document.getElementsByTagName("head")[0].appendChild(style);
};

fluid.defaults("hortis.leafletMap.withBareRegions", {
    modelListeners: {
        selectedRegions: [{
            namespace: "map",
            path: "selectedRegions",
            func: "hortis.leafletMap.showSelectedRegions",
            args: ["{that}", "{change}.value"]
        }]
    },
    model: {
        // selectedRegions: classKey -> boolean
        // selectedCommunities: communityKey -> boolean
    },
    members: {
        classes: "{sunburst}.viz.classes",
        communities: "{sunburst}.viz.communities",
        toPlot: "{sunburst}.viz.communities", // For general contract of hortis.mapBlockToFocusedTaxa - rename this field, e.g. selectableRegions
        // The unit of what is drawn - for Xetthecum and scrolly, is the same as classes
        regions: "{sunburst}.viz.classes"
    },
    events: {
        selectRegion: null
        // Defined in leafletMap:
        // buildMap: null,
        // clearMapSelection: null
    },
    listeners: {
        "clearMapSelection.regions": "hortis.clearSelectedRegions({that})",
        //                                                                          class,       community
        "selectRegion.regionSelection": "hortis.leafletMap.regionSelection({that}, {arguments}.0, {arguments}.1)"
    }

});

hortis.regionOpacity = function (region) {
    return "--imerss-" + hortis.normaliseToClass(region) + "-opacity";
};

hortis.regionBorder = function (region) {
    return "--imerss-" + hortis.normaliseToClass(region) + "-stroke";
};

hortis.leafletMap.showSelectedRegions = function (map, selectedRegions) {
    const style = map.container[0].style;
    const noSelection = map.model.mapBlockTooltipId === null;
    Object.keys(map.regions).forEach(function (key) {
        const lineFeature = map.classes[key].color;
        style.setProperty(hortis.regionOpacity(key), selectedRegions[key] || noSelection ? "1.0" : "0.4");
        style.setProperty(hortis.regionBorder(key), selectedRegions[key] ? "#FEF410" : (lineFeature ? fluid.colour.arrayToString(lineFeature) : "none"));
    });
};


/** Computes a set of flags based on a selected region key and hash of regions
 * @param {String|Null} selectedRegion - The currently selected region or null
 * @param {Object} regions - Hash of regions
 * @return {Object<String, Boolean>} - Hash of regions to flags
 */
hortis.leafletMap.selectedRegions = function (selectedRegion, regions) {
    return fluid.transform(regions, function (junk, key) {
        // Note simplest way to avoid highlighting all when there is no map selection is to say none are selected
        return selectedRegion ? key === selectedRegion : false;
    });
};

// TODO: This gets preserved but we need to split off the outerPanel update
hortis.leafletMap.regionSelection = function (map, className, community) {
    map.applier.change("mapBlockTooltipId", community);
    map.applier.change("selectedRegions", hortis.leafletMap.selectedRegions(className, map.classes));
    map.applier.change("selectedCommunities", hortis.leafletMap.selectedRegions(community, map.communities));

};

hortis.clearSelectedRegions = function (map) {
    map.applier.change("selectedRegions", hortis.leafletMap.selectedRegions(null, map.classes));
    map.applier.change("selectedCommunities", hortis.leafletMap.selectedRegions(null, map.communities));
};
