/* global L */

"use strict";

// noinspection ES6ConvertVarToLetConst // otherwise this is a duplicate on minifying
var hortis = fluid.registerNamespace("hortis");

fluid.defaults("hortis.leafletMap.withRegions", {
    gradeNames: "hortis.leafletMap.withRegionsBase",
    selectors: {
        legendKeys: ".fld-imerss-map-legend-keys"
    },
    modelListeners: {
        legend: {
            path: "selectedRegions.*",
            func: "hortis.legendKey.selectRegion",
            args: ["{that}", "{change}.value", "{change}.path"]
        }
    },

    // See notes about this field in leafletMap
    selectionTransactionSource: "map",
    // legendKey: "@expand:hortis.leafletMap.renderLegendKey({that}.classes)",
    model: {
        // From leafletMap parent grade mapBlockTooltipId: string
        // selectedRegions: classKey -> boolean
        // selectedCommunities: communityKey -> boolean
        // TODO: apparently this field is now disused
        selectionRoute: "map" // either "map" or "taxa"
    },
    members: {
        // Represents actual polygons drawn - for bareRegions these are drawn by HTMLWidgets Leaflet
        features: "{sunburst}.viz.features",
        outerPanel: "{sunburst}.dom.mapOuterPanel"
    },
    listeners: {
        "buildMap.addRegions": "hortis.leafletMap.withRegions.addRegions({that})",
        "buildMap.drawRegions": "hortis.leafletMap.withRegions.drawRegions({that})",
        "buildMap.drawLegend": "hortis.legendKey.drawLegend({that})",

        "onCreate.listenTaxonLinks": "hortis.listenTaxonLinks({sunburst})",
        "onCreate.validateTaxonLinks": "hortis.validateTaxonLinks({sunburst}, {that})",
        "selectRegion.renderOuterPanel": "hortis.leafletMap.renderOuterPanel({that})"
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

hortis.legendKey.rowTemplate = "<div class=\"fld-imerss-legend-row fld-imerss-nodismiss-map %rowClass\">" +
            "<span class=\"fld-imerss-legend-icon\"></span>" +
            "<span class=\"fld-imerss-legend-preview %previewClass\" style=\"%previewStyle\"></span>" +
            "<span class=\"fld-imerss-legend-label\">%keyLabel</span>" +
            "</div>";

hortis.legendKey.blockTemplate = "<div class=\"fld-imerss-legend-block\"><span class=\"fld-imerss-legend-block-name fld-imerss-nodismiss-map\">%community</span>%rows</div>";

hortis.legendKey.renderMarkup = function (markup, clazz, className) {
    const style = hortis.fillColorToStyle(clazz.fillColor || clazz.color);
    const normal = hortis.normaliseToClass(className);
    return fluid.stringTemplate(markup, {
        rowClass: "fld-imerss-legend-row-" + normal,
        previewClass: "fld-imerss-class-" + normal,
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
        const rowSel = ".fld-imerss-legend-row-" + hortis.normaliseToClass(className);
        const row = legendKeys.find(rowSel);
        row.click(function () {
            map.events.selectRegion.fire(className, map.classes[className].community);
        });
    });
};

hortis.legendKey.selectRegion = function (map, value, path) {
    const className = fluid.peek(path);
    const row = map.locate("legendKeys").find(".fld-imerss-legend-row-" + hortis.normaliseToClass(className));
    row.toggleClass("fld-imerss-selected", value);
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
    banner.toggleClass("fld-imerss-banner-" + hortis.normaliseToClass(community), state);
};

hortis.leafletMap.seColumns = ["What", "Where", "Importance", "Protection", "Source"];

hortis.leafletMap.hulqNameTemplate = " / <span aria-label=\"%label\" title=\"%label\" class=\"fl-imerss-hulq-name\">%hulqName</span>";

hortis.leafletMap.outerPanelPhoto = "<div class=\"fl-imerss-photo %photoClass\"></div>";

hortis.leafletMap.outerPanelCommunity = "<div class=\"fld-imerss-map-community\">Community:<br/>%community%hulqBlock</div>";
hortis.leafletMap.outerPanelClass = "<div class=\"fld-imerss-map-class\">%clazz%hulqBlock</div>";

hortis.leafletMap.outerPanelBlock =
    "<div class=\"fld-imerss-map-panel-block fld-taxonDisplay-expandable-header fl-taxonDisplay-runon-header\">%blockName" + hortis.expandButtonMarkup + "</div>" +
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
        return "<a class=\"fld-imerss-taxon-link\" href=\"" + p2 + "\">" + p1 + "</a>";
    });
};

hortis.linkToTaxon = function (sunburst, taxonLink) {
    const targetTaxon = taxonLink.substring("#taxon:".length);
    return sunburst.lookupTaxon(targetTaxon);
};

hortis.validateTaxonLinks = function (sunburst, map) {
    fluid.each(map.communities, function (community, key) {
        const text = community.culturalValues;
        let match;
        do { // Ridiculous syntax from https://stackoverflow.com/a/6323598
            match = hortis.taxonLinkRegex.exec(text);
            if (match) {
                const taxonLink = match[2];
                const taxon = hortis.linkToTaxon(sunburst, taxonLink);
                if (!taxon) {
                    console.log("Failed to look up taxon " + taxonLink + " for community key " + key);
                }
            }
        } while (match);
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
    $(document).on("click", ".fld-imerss-taxon-link", function (e) {
        hortis.withTaxonLink(sunburst, e, function (row) {
            sunburst.events.changeLayoutId.fire(row.id);
        });
    });

    $(document).on("mouseenter", ".fld-imerss-taxon-link", function (e) {
        hortis.withTaxonLink(sunburst, e, function (row) {
            sunburst.mouseEvent = e;
            sunburst.applier.change("hoverId", row.id);
        });
    });
    $(document).on("mouseleave", ".fld-imerss-taxon-link", function () {
        sunburst.applier.change("hoverId", null);
    });
};

hortis.leafletMap.renderMapOuterPanel = function (map) {
    const selectedClazz = fluid.keyForValue(map.model.selectedRegions, true);
    const clazz = map.classes[selectedClazz];
    let topPanel = "";
    if (clazz.hasImage) {
        topPanel += fluid.stringTemplate(hortis.leafletMap.outerPanelPhoto, {
            photoClass: "fld-imerss-class-image-" + hortis.normaliseToClass(selectedClazz)
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
            "<br/><br/><div class=\"fld-imerss-map-class-se-col\">Sources:</div>" +
            hortis.textToMarkup(community.culturalValuesSources);
        const allCultureBlock = fluid.stringTemplate(hortis.leafletMap.outerPanelBlock, {
            blockName: "Cultural Values",
            block: cultureBlock
        });
        bottomPanel += allCultureBlock;
    }
    if (clazz["sE-Tagline"]) {
        let ecoBlock = "<div class=\"fld-imerss-map-class-tagline\">" + clazz["sE-Tagline"] + "</div>";
        hortis.leafletMap.seColumns.forEach(function (col) {
            ecoBlock += "<div class=\"fld-imerss-map-class-se-col\">" + col + ": </div>";
            ecoBlock += "<div class=\"fld-imerss-map-class-se-val\">" + clazz["sE-" + col] + "</div>";
        });
        const allEcoBlock = fluid.stringTemplate(hortis.leafletMap.outerPanelBlock, {
            blockName: "Ecological Values",
            block: ecoBlock
        });
        bottomPanel += allEcoBlock;
    }
    return topPanel + bottomPanel;
};

hortis.leafletMap.renderOuterPanel = function (map) {
    map.outerPanel.html(hortis.leafletMap.renderMapOuterPanel(map));
};

// Most code from here on gets preserved in Howe Sound


hortis.leafletMap.withRegions.addRegions = function (that) {
    that.map.createPane("hortis-regions");
    that.regionGroup = L.layerGroup({pane: "hortis-regions"}).addTo(that.map);
};


hortis.leafletMap.withRegions.drawRegions = function (map) {
    const regionClass = function (className) {
        return "fld-imerss-region-" + hortis.normaliseToClass(className);
    };
    map.applier.change("selectedRegions", hortis.leafletMap.selectedRegions(null, map.classes));

    map.regionGroup.clearLayers();

    // Note nothing currently reads this property
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
        options.className = regionClass(className) + " fld-imerss-region";
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
