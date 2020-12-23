/*
Copyright 2017 Antranig Basman
Licensed under the Educational Community License (ECL), Version 2.0 or the New
BSD license. You may not use this file except in compliance with one these
Licenses.
You may obtain a copy of the ECL 2.0 License and BSD License at
https://github.com/fluid-project/infusion/raw/master/Infusion-LICENSE.txt
*/

/* global Uint8Array, lz4 */

"use strict";

var hortis = fluid.registerNamespace("hortis");

fluid.setLogging(true);

fluid.defaults("hortis.configHolder", {
    gradeNames: "fluid.component"
});

fluid.defaults("hortis.sunburstLoader", {
    gradeNames: ["fluid.newViewComponent", "fluid.resourceLoader", "hortis.configHolder"],
    sunburstPixels: 1002,
    markupTemplate: "%resourceBase/html/bagatelle.html",
    phyloMap: "%resourceBase/json/phyloMap.json",
    resourceBase: "src/client",
    queryOnStartup: "",
    selectOnStartup: "",
    showObsListInTooltip: true,
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
                queryOnStartup: "{sunburstLoader}.options.queryOnStartup",
                selectOnStartup: "{sunburstLoader}.options.selectOnStartup",
                members: {
                    viz: "@expand:hortis.decompressLZ4({sunburstLoader}.resources.viz.resourceText)",
                    tree: "{that}.viz.tree"
                },
                model: {
                    commonNames: "{sunburstLoader}.options.commonNames"
                }
            }
        }
    }
});

hortis.resolveResources = function (resources, terms) {
    var mapped = fluid.transform(resources, function (oneResource) {
        return fluid.extend(true, {}, oneResource, {
            url: fluid.stringTemplate(oneResource.url, terms)
        });
    });
    return mapped;
};

hortis.decompressLZ4 = function (arrayBuffer) {
    var uint8in = new Uint8Array(arrayBuffer);
    var uint8out = lz4.decompress(uint8in);
    var text = new TextDecoder("utf-8").decode(uint8out);
    return JSON.parse(text);
};

hortis.combineSelectors = function () {
    return fluid.makeArray(arguments).join(", ");
};

hortis.sunburstLoader.renderMarkup = function (container, template, renderMarkup, terms) {
    if (renderMarkup) {
        var rendered = fluid.stringTemplate(template, terms);
        container.html(rendered);
    }
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

fluid.defaults("hortis.sunburst", {
    gradeNames: ["fluid.newViewComponent"],
    selectors: {
        svg: ".flc-bagatelle-svg",
        taxonDisplay: ".fld-bagatelle-taxonDisplay",
        autocomplete: ".fld-bagatelle-autocomplete",
        segment: ".fld-bagatelle-segment",
        label: ".fld-bagatelle-label",
        phyloPic: ".fld-bagatelle-phyloPic"
        // No longer supportable under FLUID-6145: BUG
        // mousable: "@expand:hortis.combineSelectors({that}.options.selectors.segment, {that}.options.selectors.label, {that}.options.selectors.phyloPic)"
    },
    styles: {
        segment: "fld-bagatelle-segment",
        label: "fld-bagatelle-label",
        phyloPic: "fld-bagatelle-phyloPic",
        layoutRoot: "fl-bagatelle-layoutRoot",
        labelPath: "fld-bagatelle-labelPath",
        clickable: "fl-bagatelle-clickable"
    },
    components: {
        autocomplete: {
            type: "hortis.autocomplete",
            options: {
                container: "{sunburst}.dom.autocomplete",
                id: "fli-bagatelle-autocomplete",
                listeners: {
                    onConfirm: "hortis.confirmAutocomplete({sunburst}, {arguments}.0)"
                },
                invokers: {
                    query: "hortis.queryAutocomplete({sunburst}.flatTree, {arguments}.0, {arguments}.1)",
                    renderInputValue: "hortis.autocompleteInputForRow",
                    renderSuggestion: "hortis.autocompleteSuggestionForRow"
                }
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
    model: {
        scale: {
            left: 0,
            right: 0,
            radiusScale: []
        },
        rowFocus: {},
        layoutId: null,
        hoverId: null,
        commonNames: true
    },
    markup: {
        segmentHeader: "<g xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\">",
        segment: "<path id=\"%id\" d=\"%path\" visibility=\"%visibility\" class=\"%clazz\" vector-effect=\"non-scaling-stroke\" style=\"%style\"></path>",
        // dominant-baseline fails on some old Chromium and AS machines
        label: "<path id=\"%labelPathId\" d=\"%textPath\" visibility=\"%labelVisibility\" class=\"%labelPathClass\" vector-effect=\"non-scaling-stroke\"></path>"
            + "<text id=\"%labelId\" dy=\"0.25em\" class=\"%labelClass\" visibility=\"%labelVisibility\" style=\"%labelStyle\">"
            + "<textPath xlink:href=\"#%labelPathId\" startOffset=\"50%\" style=\"text-anchor: middle\">%label</textPath></text>",
        phyloPic: "<image id=\"%phyloPicId\" class=\"%phyloPicClass fl-bagatelle-clickable\" xlink:href=\"%phyloPicUrl\" height=\"%diameter\" width=\"%diameter\" x=\"%phyloPicX\" y=\"%phyloPicY\" />",
        segmentFooter: "</g>",
        tooltipHeader: "<div><table>",
        tooltipRow: "<tr><td class=\"fl-taxonDisplay-key\">%key: </td><td class=\"fl-taxonDisplay-value\">%value</td>",
        tooltipFooter: "</table></div>"
    },
    invokers: {
        render: "hortis.render({that})",
        renderLight: "hortis.renderLight({that})",
        renderSegment: "hortis.renderSegment({that}, {arguments}.0, {arguments}.1)",
        angleScale: "hortis.angleScale({arguments}.0, {that}.model.scale)",
        elementToRow: "hortis.elementToRow({that}, {arguments}.0)",
        segmentClicked: "hortis.segmentClicked({that}, {arguments}.0)",
        fillColourForRow: "hortis.undocColourForRow({that}.options.parsedColours, {arguments}.0)",
        getMousable: "hortis.combineSelectors({that}.options.selectors.segment, {that}.options.selectors.label, {that}.options.selectors.phyloPic)"
    },
    modelListeners: {
        scale: {
            excludeSource: "init",
            func: "{that}.renderLight"
        },
        hoverId: {
            excludeSource: "init",
            funcName: "hortis.updateTooltip",
            args: ["{that}", "{change}.value"]
        },
        rowFocus: {
            funcName: "hortis.updateRowFocus",
            args: ["{that}", "{change}.value"]
        }
    },
    listeners: {
        "onCreate.doLayout": {
            func: "hortis.doLayout",
            args: ["{that}.flatTree"]
        },
        "onCreate.computeInitialScale": {
            funcName: "hortis.computeInitialScale",
            args: ["{that}"],
            priority: "after:doLayout"
        },
        "onCreate.boundNodes": {
            funcName: "hortis.boundNodes",
            args: ["{that}", "{that}.model.layoutId", true],
            priority: "before:render"
        },
        "onCreate.applyPhyloMap": {
            funcName: "hortis.applyPhyloMap",
            args: ["{sunburstLoader}.resources.phyloMap.parsed", "{that}.flatTree", "{sunburstLoader}.options.resourceOptions.terms"],
            priority: "before:computeInitialScale"
        },
        "onCreate.render": {
            func: "{that}.render",
            priority: "after:computeInitialScale"
        },
        "onCreate.bindMouse": {
            funcName: "hortis.bindMouse",
            args: ["{that}"]
        }
    },
    members: {
        visMap: [], // array of visibility aligned with flatTree
        tree: null,
        flatTree: "@expand:hortis.flattenTree({that}.tree)",
        maxDepth: "@expand:hortis.computeMaxDepth({that}.flatTree)",
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

hortis.queryAutocomplete = function (flatTree, query, callback) {
    var output = [];
    query = query.toLowerCase();
    for (var i = 0; i < flatTree.length; ++i) {
        var row = flatTree[i];
        var display = hortis.autocompleteInputForRow(row);
        if (display.toLowerCase().indexOf(query) !== -1) {
            output.push(row);
        }
        if (output.length >= 20) {
            break;
        }
    };
    callback(output);
};

hortis.confirmAutocomplete = function (that, row) {
    if (row) { // on blur it may send nothing
        var zoomTo = row.children.length > 0 ? row : row.parent;
        var zoomAction = hortis.beginZoom(that, zoomTo);
        zoomAction.then(function () {
            hortis.updateTooltip(that, row.id);
        });
    }
};

// Lifted from Infusion Tooltip.js
hortis.isInDocument = function (node) {
    var dokkument = fluid.getDocument(node),
        container = node[0];
    // jQuery UI framework will throw a fit if we have instantiated a widget on a DOM element and then
    // removed it from the DOM. This apparently can't be detected via the jQuery UI API itself.
    return $.contains(dokkument, container) || dokkument === container;
};

hortis.imageLoaded = function (element) {
    $(element).removeClass("fl-bagatelle-imgLoading");
    var parent = $(element).closest("div");
    var overlay = parent.find(".fl-bagatelle-imgLoadingOverlay");
    overlay.remove();
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
    var parsedMap = fluid.transform(phyloMap, function (onePhylo) {
        var togo = {};
        if (onePhylo.pic) {
            togo.phyloPicUrl = fluid.stringTemplate(onePhylo.pic, terms);
        }
        if (onePhylo.taxonPic) {
            togo.taxonPic = fluid.stringTemplate(onePhylo.taxonPic, terms);
        }
        togo.taxonPicDescription = onePhylo.taxonPicDescription;
        if (onePhylo.colour) {
            var parsedColour = fluid.colour.hexToArray(onePhylo.colour);
            var hsl = fluid.colour.rgbToHsl(parsedColour);
            togo.lowColour = fluid.colour.hslToRgb([hsl[0], hsl[1], hsl[2] * 0.2 + 0.8]);
            togo.highColour = fluid.colour.hslToRgb([hsl[0], hsl[1], hsl[2] * 0.8 + 0.2]);
        }
        return togo;
    });
    rows.forEach(function (row) {
        var phyloIndex = hortis.rowToPhyloIndex(row);
        var parsed = parsedMap[phyloIndex];
        if (parsed) {
            row.phyloPicUrl = parsed.phyloPicUrl;
            row.taxonPic    = parsed.taxonPic;
            row.taxonPicDescription = parsed.taxonPicDescription;
            hortis.colourChildren(row, parsed);
        }
    });
};

// hortis.tooltipFields = ["species", "iNaturalistTaxonName", "commonName", "reporting", "lastCollected", "collector", "collection", "observer", "firstObserved", "placeName"];

hortis.tooltipLookup = {
    iNaturalistTaxonName: "Taxon Name",
    lastCollected: "Last Collected",
    firstObserved: "First Observed",
    observer: "Observer",
    placeName: "Place Name",
    observationCount: "Observation Count",
    iNaturalistObsLink: "Observation",
    taxonLink: "iNaturalist Taxon",
    wikipediaSummary: "Wikipedia Summary",
    iNaturalistTaxonImage: "iNaturalist Taxon Image",
    phyloPic: "Taxon Icon",
    taxonPic: "Taxon Picture",
    taxonPicDescription: "Taxon Picture Description",
    commonName: "Common Name"
};

hortis.specialRows = {
    collected: {
        key: "Collected",
        value: [{collected: "%x"}, {collector: " by %x"}]
    },
    observed: {
        key: "Observed",
        value: [{firstObserved: "%x"}, {observer: " by %x"}]
    }
};

hortis.commonFields = ["wikipediaSummary", "commonName"];

hortis.dumpRow = function (key, value, markup) {
    if (value) {
        var keyName = hortis.tooltipLookup[key] || hortis.capitalize(key);
        return fluid.stringTemplate(markup.tooltipRow, {key: keyName, value: value});
    } else {
        return "";
    }
};

hortis.renderSpecialRow = function (row, rowEntry, markup) {
    var values = rowEntry.value.map(function (oneEntry) {
        var key = Object.keys(oneEntry)[0];
        return {
            x: row[key],
            template: oneEntry[key]
        };
    });
    var valueText = "";
    values.forEach(function (oneValue) {
        valueText += oneValue.x ? fluid.stringTemplate(oneValue.template, oneValue) : "";
    });
    return hortis.dumpRow(rowEntry.key, valueText, markup);
};

hortis.renderTooltip = function (row, markup) {
    if (!row) {
        return null;
    }
    var togo = markup.tooltipHeader;
    var dumpRow = function (keyName, value) {
        togo += hortis.dumpRow(keyName, value, markup);
    };
    var dumpImage = function (keyName, url) {
        togo += hortis.dumpRow(keyName, "<div><span class=\"fl-bagatelle-imgLoadingOverlay\"></span><img onload=\"hortis.imageLoaded(this)\" class=\"fl-bagatelle-photo fl-bagatelle-imgLoading\" src=\"" + url + "\"/></div>", markup);
    };
    var dumpPhyloPic = function (keyName, url) {
        togo += hortis.dumpRow(keyName, "<div><img height=\"150\" width=\"150\" class=\"fl-bagatelle-photo\" src=\"" + url + "\"/></div>", markup);
    };
    if (row.rank) {
        if (row.phyloPicUrl) {
            dumpPhyloPic("phyloPic", row.phyloPicUrl);
        }
        dumpRow(row.rank, row.iNaturalistTaxonName);
        hortis.commonFields.forEach(function (field) {
            dumpRow(field, row[field]);
        });
        if (row.iNaturalistTaxonImage && !row.taxonPic) {
            dumpImage("iNaturalistTaxonImage", row.iNaturalistTaxonImage);
        } else if (row.taxonPic) {
            dumpImage("taxonPic", row.taxonPic);
        }
        dumpRow("taxonPicDescription", row.taxonPicDescription);
        dumpRow("species", row.childCount);
        dumpRow("observationCount", row.observationCount);
    } else {
        if (row.iNaturalistTaxonImage && !row.obsPhotoLink) {
            dumpImage("iNaturalistTaxonImage", row.iNaturalistTaxonImage);
        }
        if (row.species) {
            dumpRow("species", row.species + (row.authority ? (" " + row.authority) : ""));
        } else {
            dumpRow("iNaturalistTaxonName", row.iNaturalistTaxonName);
        }
        hortis.commonFields.forEach(function (field) {
            dumpRow(field, row[field]);
        });
        togo += hortis.renderSpecialRow(row, hortis.specialRows.collected, markup);
        dumpRow("collection", row.collection);
        dumpRow("reporting", row.reporting);
        togo += hortis.renderSpecialRow(row, hortis.specialRows.observed, markup);
        if (row.iNaturalistObsLink) {
            dumpRow("iNaturalistObsLink", "<a href=\"" + row.iNaturalistObsLink + "\">" + row.iNaturalistObsLink + "</a>");
        }
        if (row.obsPhotoLink) {
        // See this nonsense: https://stackoverflow.com/questions/5843035/does-before-not-work-on-img-elements
            dumpImage("Observation photo", row.obsPhotoLink);
        }
        var iNatId = row.iNaturalistTaxonId;
        if (iNatId) {
            var taxonLink = "http://www.inaturalist.org/taxa/" + iNatId;
            dumpRow("taxonLink", "<a href=\"" + taxonLink + "\">" + taxonLink + "</a>");
        }
    }
    togo += markup.tooltipFooter;
    return togo;
};

hortis.updateTooltip = function (that, id) {
    var content = id ? hortis.renderTooltip(that.index[id], that.options.markup) : null;
    var taxonDisplay = that.locate("taxonDisplay");
    if (content) {
        taxonDisplay.empty();
        taxonDisplay.html(content);
    }
/*
    if (that.tooltipTarget) {
        if (hortis.isInDocument(that.tooltipTarget)) {
            that.tooltipTarget.tooltip("destroy");
        } else {
            console.log("Tooltip target lost from document");
        }
        that.tooltipTarget = null;
    }
    var target = $(that.mouseEvent.target);
    if (content) {
        console.log("Opening tooltip");
        target.tooltip({
            items: target
        });
        target.tooltip("option", "content", content || "");
        target.tooltip("open", that.mouseEvent);
        that.tooltipTarget = target;
    } else {
        if (that.tooltipTarget) {
            that.tooltipTarget.tooltip("destroy");
            that.tooltipTarget = null;
        }
    }*/
};

hortis.isAtRoot = function (that, layoutId) {
    return (layoutId || that.model.layoutId) === that.flatTree[0].id;
};

hortis.bindMouse = function (that) {
    var svg = that.locate("svg");
    // var mousable = that.options.selectors.mousable;
    var mousable = that.getMousable();
    svg.on("click", mousable, function () {
        var id = hortis.elementToId(this);
        var row = that.index[id];
        if (!hortis.isAboveLayoutRoot(row, that) && that.index[id].phyloPicUrl) {
            row = that.flatTree[0];
        }
        that.segmentClicked(row);
    });
    svg.on("mouseenter", mousable, function (e) {
        window.clearTimeout(that.leaveTimeout);
        var id = hortis.elementToId(this);
        that.mouseEvent = e;
        that.applier.change("hoverId", id);
    });
    svg.on("mouseleave", mousable, function (e) {
        that.leaveTimeout = window.setTimeout(function () {
            that.mouseEvent = e;
            that.applier.change("hoverId", null);
        }, 50);
    });
};

hortis.parseColours = function (colours) {
    return fluid.transform(colours, function (colour) {
        return fluid.colour.hexToArray(colour);
    });
};


hortis.angleScale = function (index, scale) {
    var angle = 2 * Math.PI * (index - scale.left) / (scale.right - scale.left);
    return fluid.transforms.limitRange(angle, {min: 0, max: 2 * Math.PI});
};

hortis.outRings = function (array, count, width) {
    var lastRing = array[array.length - 1];
    for (var i = 0; i < count; ++i) {
        lastRing += width;
        array.push(lastRing);
    }
};

hortis.makeRadiusScale = function (innerRings, visRings, totalRings, scaleConfig, isAtRoot) {
    console.log("makeRadiusScale with innerRings ", innerRings, " visRings ", visRings);
    var togo = [0];
    if (isAtRoot && scaleConfig.rootRadii) {
        scaleConfig.rootRadii.forEach(function (radius) {
            hortis.outRings(togo, 1, 1000 * radius);
        });
        hortis.outRings(togo, 1 + totalRings - togo.length, 0);
    } else {
        // Allocate as many outerRings as we can without making in between rings narrower than innerDepth
        // Total amount available is 1 - innerRadius, in between thickness would be (1 - outerRings * options.outerDepth - innerRadius) / (totalRings - outerRings - innerRings);
        var outerRings = Math.floor((1 - visRings * scaleConfig.innerDepth) / (scaleConfig.outerDepth - scaleConfig.innerDepth));
        console.log("outerRings determined as ", outerRings);
        var middleRings = visRings - outerRings - innerRings;
        var middleDepth = (1 - outerRings * scaleConfig.outerDepth - innerRings * scaleConfig.innerDepth) / middleRings;

        hortis.outRings(togo, innerRings, 1000 * scaleConfig.innerDepth);
        hortis.outRings(togo, middleRings, 1000 * middleDepth);
        hortis.outRings(togo, outerRings, 1000 * scaleConfig.outerDepth);
        hortis.outRings(togo, totalRings - visRings, 0);
    }
    console.log("makeRadiusScale returning ", togo);
    return togo;
};

hortis.boundNodes = function (that, layoutId, isInit) {
    console.log("boundNodes beginning for node ", layoutId);
    var layoutRoot = that.index[layoutId],
        visMap = [];
    for (var i = 0; i < that.flatTree.length; ++i) {
        visMap[i] = 0;
    }
    for (var visUp = layoutRoot; visUp; visUp = visUp.parent) {
        visMap[visUp.flatIndex] = 1;
    }
    var totalNodes = 1, parents = [layoutRoot], depth;
    for (depth = layoutRoot.depth; depth < that.maxDepth; ++depth) {
        var directChildren = 0;
        parents.forEach(function (parent) {
            directChildren += parent.children.length;
        });
        if (directChildren > 0 && totalNodes + directChildren < that.options.scaleConfig.maxNodes) {
            var newParents = [];
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
    var isAtRoot = hortis.isAtRoot(that, layoutId);
    var radiusScale = hortis.makeRadiusScale(layoutRoot.depth, depth + 1, that.maxDepth + 1, that.options.scaleConfig, isAtRoot);
    var togo = {
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

hortis.isClickable = function (row) {
    return row.children.length > 0 || row.iNaturalistLink || row.iNaturalistTaxonId;
};

hortis.elementClass = function (row, isLayoutRoot, styles, baseStyle) {
    return styles[baseStyle]
        + (hortis.isClickable(row) ? " " + styles.clickable : "")
        + (isLayoutRoot ? " " + styles.layoutRoot : "");
};

hortis.elementStyle = function (attrs, elementType) {
    var opacity = attrs.opacity === undefined ? "" : " opacity: " + attrs.opacity + ";";
    return elementType === "segment" ? "fill: " + attrs.fillColour + ";" + opacity : opacity;
};

hortis.phyloPicAttrMap = {
    visibility: "visibility",
    x: "phyloPicX",
    y: "phyloPicY",
    height: "diameter",
    width: "diameter"
};

hortis.renderLight = function (that) {
    that.flatTree.forEach(function (row, index) {
        if (that.visMap[index] || that.oldVisMap && that.oldVisMap[index]) {
            var attrs = hortis.attrsForRow(that, row);
            attrs.fillColour = that.fillColourForRow(row);
            var isLayoutRoot = row.id === that.model.layoutId;
            var segment = fluid.byId("hortis-segment:" + row.id);
            if (segment) {
                segment.setAttribute("d", attrs.path);
                segment.setAttribute("visibility", attrs.visibility);
                segment.setAttribute("class", hortis.elementClass(row, isLayoutRoot, that.options.styles, "segment"));
                segment.setAttribute("style", hortis.elementStyle(attrs, "segment"));
            }
            var labelPath = fluid.byId("hortis-labelPath:" + row.id);
            if (labelPath) {
                labelPath.setAttribute("d", attrs.textPath);
                labelPath.setAttribute("visibility", attrs.labelVisibility);
            }
            var label = fluid.byId("hortis-label:" + row.id);
            if (label) {
                label.setAttribute("visibility", attrs.labelVisibility);
                label.setAttribute("class", hortis.elementClass(row, isLayoutRoot, that.options.styles, "label"));
                label.setAttribute("style", hortis.elementStyle(attrs, "label"));
            }
            var pic = fluid.byId("hortis-phyloPic:" + row.id);
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

hortis.undocColourForRow = function (parsedColours, row) {
    var undocFraction = 1 - row.undocumentedCount / row.childCount;
    var interp = fluid.colour.interpolate(undocFraction, row.highColour || parsedColours.highColour, row.lowColour || parsedColours.lowColour);
    return fluid.colour.arrayToString(interp);
};

hortis.obsColourForRow = function (parsedColours, row, rootRow) {
    var fraction = Math.pow(row.observationCount / rootRow.observationCount, 0.2);
    var interp = fluid.colour.interpolate(fraction, row.lowColour || parsedColours.lowColour, row.highColour || parsedColours.highColour);
    var focusProp = row.focusCount / row.childCount;
    var interp2 = fluid.colour.interpolate(focusProp, parsedColours.unfocusedColour, interp);
    return fluid.colour.arrayToString(interp2);
};

hortis.pathFromRoot = function (row) {
    var togo = [];
    while (row) {
        togo.unshift(row);
        row = row.parent;
    }
    return togo;
};

hortis.lcaRoot = function (parents) {
    var lcaRoot;
    for (var i = 0; ; ++i) {
        var commonValue = null;
        for (var key in parents) {
            var seg = parents[key][i];
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

hortis.updateRowFocus = function (that, rowFocus) {
    var flatTree = that.flatTree;
    var focusAll = $.isEmptyObject(rowFocus);
    for (var i = flatTree.length - 1; i >= 0; --i) {
        var row = flatTree[i];
        var focusCount;
        if (focusAll || rowFocus[row.id]) {
            focusCount = row.childCount;
        } else {
            focusCount = row.children.reduce(function (sum, child) {
                return sum + child.focusCount;
            }, 0);
        }
        row.focusCount = focusCount;
    }
    if (focusAll) {
        that.renderLight();
    } else {
        var parents = fluid.transform(rowFocus, function (troo, key) {
            return hortis.pathFromRoot(that.index[key]);
        });
        var lca = hortis.lcaRoot(parents);
        var target = Object.keys(parents).length === 1 ? lca.parent : lca;
        hortis.beginZoom(that, target);
    }
};

hortis.elementToId = function (element) {
    var id = element.id;
    return id.substring(id.indexOf(":") + 1);
};

hortis.elementToRow = function (that, element) {
    var id = hortis.elementToId(element);
    return that.index[id];
};

hortis.beginZoom = function (that, row) {
    that.container.stop(true, true);
    var initialScale = fluid.copy(that.model.scale);
    var newBound = hortis.boundNodes(that, row.id);
    newBound.scale.zoomProgress = 1;
    console.log("Begin zoom");
    var togo = fluid.promise();
    that.oldVisMap = that.visMap;
    that.visMap = newBound.visMap;
    that.render();
    that.container.animate({"zoomProgress": 1}, {
        easing: "swing",
        duration: that.options.zoomDuration,
        step: function (zoomProgress) {
            var interpScale = hortis.interpolateModels(zoomProgress, initialScale, newBound.scale);
            that.applier.change("scale", interpScale);
        },
        complete: function () {
            console.log("Zoom complete");
            delete that.oldVisMap;
            that.container[0].zoomProgress = 0;
            that.applier.change("layoutId", row.id);
            that.applier.change("scale.zoomProgress", 0); // TODO: suppress render here
            that.render();
            togo.resolve();
        }
    });
    return togo;
};

hortis.segmentClicked = function (that, row) {
    if (row.children.length > 0) {
        hortis.beginZoom(that, row);
    } else {
        if (row.iNaturalistLink) {
            window.open(row.iNaturalistLink);
        } else if (row.iNaturalistTaxonId) {
            window.open("http://www.inaturalist.org/taxa/" + row.iNaturalistTaxonId);
        }
    }
};

hortis.nameOverrides = {
    "Chromista": "Chromists"
};

hortis.labelForRow = function (row, commonNames) {
    var name = commonNames && row.commonName ? row.commonName : row.iNaturalistTaxonName;
    name = hortis.nameOverrides[row.iNaturalistTaxonName] || name;
    return hortis.capitalize(name);
    // return row.rank ? (row.rank === "Life" ? "Life" : row.rank + ": " + name) : name;
};

// Returns true if the supplied row is either at the layout root or above it. Alternatively - can we get to the
// global root from the layout root without hitting this row - if so it is not "shadowing" us (and hence its phylopic
// should not go to the centre)
hortis.isAboveLayoutRoot = function (row, that) {
    var layoutId = that.model.layoutId;
    var layoutRow = that.index[layoutId];
    while (layoutRow) {
        if (layoutRow.id === row.id) {
            return false;
        }
        layoutRow = layoutRow.parent;
    }
    return true;
};

// This guide is a great one for "bestiary of reuse failures": https://www.visualcinnamon.com/2015/09/placing-text-on-arcs.html
// What the chaining method reduces one to who is unable to allocate any intermediate variables

hortis.attrsForRow = function (that, row) {
    var leftAngle = that.angleScale(row.leftIndex),
        rightAngle = that.angleScale(row.leftIndex + row.childCount),
        midAngle = (leftAngle + rightAngle) / 2,
        innerRadius = that.model.scale.radiusScale[row.depth],
        outerRadius = that.model.scale.radiusScale[row.depth + 1];
    var isAboveLayoutRoot = hortis.isAboveLayoutRoot(row, that);
    var isComplete = fluid.model.isSameValue(leftAngle, 0) && fluid.model.isSameValue(rightAngle, 2 * Math.PI);
    var isCircle = fluid.model.isSameValue(innerRadius, 0) && isComplete;
    var isVisible = !fluid.model.isSameValue(leftAngle, rightAngle) && !fluid.model.isSameValue(innerRadius, outerRadius);
    var isOuterSegment = fluid.model.isSameValue(outerRadius - innerRadius, that.options.scaleConfig.outerDepth * 1000);
    var label = hortis.labelForRow(row, that.model.commonNames);
    var outerLength = outerRadius * (rightAngle - leftAngle);
    // Note that only purpose of midRadius is to position phylopic
    var midRadius = (isCircle || !isAboveLayoutRoot) ? 0 : (innerRadius + outerRadius) / 2;
    var radius = outerRadius - midRadius;
    if (fluid.model.isSameValue(leftAngle, Math.PI)) {
        // Eliminate Chrome crash bug exhibited in https://amb26.github.io/svg-failure/ but apparently only on Windows 7!
        // Note that 1e-5 will be too small!
        leftAngle += 1e-4;
    }
    var labelVisibility = isOuterSegment ? outerLength > 35 : outerLength > label.length * 16; // TODO: make a guess of this factor from font size (e.g. 2/3 of it)
    var togo = {
        visibility: isVisible ? "visible" : "hidden",
        labelVisibility: isVisible && labelVisibility ? "visible" : "hidden",
        label: label,
        phyloPicX: Math.cos(midAngle) * midRadius - radius,
        phyloPicY: -Math.sin(midAngle) * midRadius - radius,
        phyloPicUrl: row.phyloPicUrl,
        diameter: 2 * radius
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
        var index = row.flatIndex;
        if (!that.oldVisMap[index] && that.visMap[index]) {
            togo.opacity = that.model.scale.zoomProgress;
        } else if (that.oldVisMap[index] && !that.visMap[index]) {
            togo.opacity = 1 - that.model.scale.zoomProgress;
        }
    }
    return togo;
};

hortis.renderSegment = function (that, row) {
    var isLayoutRoot = row.id === that.model.layoutId;
    var terms = $.extend({
        id: "hortis-segment:" + row.id,
        labelPathId: "hortis-labelPath:" + row.id,
        labelId: "hortis-label:" + row.id,
        phyloPicId: "hortis-phyloPic:" + row.id,
        clazz: hortis.elementClass(row, isLayoutRoot, that.options.styles, "segment"),
        labelPathClass: that.options.styles.labelPath,
        phyloPicClass: that.options.styles.phyloPic,
        labelClass: hortis.elementClass(row, isLayoutRoot, that.options.styles, "label"),
        fillColour: that.fillColourForRow(row)
    }, hortis.attrsForRow(that, row));
    terms.style = hortis.elementStyle(terms, "segment");
    terms.labelStyle = hortis.elementStyle(terms, "label");
    var togo = [{
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
    var markup = that.options.markup.segmentHeader;
    var elements = [];
    for (var i = 0; i < that.flatTree.length; ++i) {
        if (that.visMap[i] || that.oldVisMap && that.oldVisMap[i]) {
            elements = elements.concat(that.renderSegment(that.flatTree[i]));
        }
    }
    elements.sort(hortis.elementComparator);
    markup += fluid.getMembers(elements, "markup").join("");
    markup += that.options.markup.segmentFooter;
    var container = that.locate("svg");
    container.empty();
    hortis.renderSVGElement(markup, container);
};


hortis.depthComparator = function (rowa, rowb) {
    return rowa.depth - rowb.depth;
};

hortis.flattenTree = function (tree) {
    var flat = [];
    flat.push(tree);
    hortis.flattenTreeRecurse(tree, flat);
    flat.sort(hortis.depthComparator);
    flat.forEach(function (row, flatIndex) {
        row.flatIndex = flatIndex;
    });
    return flat;
};

hortis.indexTree = function (flatTree) {
    var index = {};
    flatTree.forEach(function (row) {
        index[row.id] = row;
    });
    return index;
};

hortis.flattenTreeRecurse = function (tree, toAppend) {
    tree.children.forEach(function (child) {
        child.parent = tree;
        toAppend.push(child);
        hortis.flattenTreeRecurse(child, toAppend);
    });
};

hortis.doLayout = function (flatTree) {
    fluid.each(flatTree, function (node) {
        if (node.depth === 0) {
            node.leftIndex = 0;
        }
        var thisLeft = node.leftIndex;
        node.children.forEach(function (child) {
            child.leftIndex = thisLeft;
            thisLeft += child.childCount;
        });
    });
};

hortis.computeMaxDepth = function (flatTree) {
    return flatTree[flatTree.length - 1].depth;
};

hortis.doInitialQuery = function (that) {
    var togo = that.flatTree[0];
    var storeQueryResult = function (result) {
        togo = result[0];
    };
    if (that.options.queryOnStartup) {
        hortis.queryAutocomplete(that.flatTree, that.options.queryOnStartup, storeQueryResult);
    }
    if (that.options.selectOnStartup) {
        hortis.queryAutocomplete(that.flatTree, that.options.selectOnStartup, function (result) {
            hortis.updateTooltip(that, result[0].id);
        });
    }
    return togo;
};

hortis.computeInitialScale = function (that) {
    var root = hortis.doInitialQuery(that);
    that.applier.change("", {
        layoutId: root.id
    });
};
