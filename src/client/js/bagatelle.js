/*
Copyright 2017 Antranig Basman
Licensed under the Educational Community License (ECL), Version 2.0 or the New
BSD license. You may not use this file except in compliance with one these
Licenses.
You may obtain a copy of the ECL 2.0 License and BSD License at
https://github.com/fluid-project/infusion/raw/master/Infusion-LICENSE.txt
*/
"use strict";

var hortis = fluid.registerNamespace("hortis");

fluid.defaults("hortis.sunburstLoader", {
    gradeNames: ["fluid.newViewComponent", "fluid.resourceLoader"],
    resourceOptions: {
        dataType: "json"
    },
    resources: {
        tree: "{that}.options.treeFile"
    },
    components: {
        sunburst: {
            type: "hortis.sunburst",
            createOnEvent: "onResourcesLoaded",
            options: {
                container: "{sunburstLoader}.container",
                tree: "{sunburstLoader}.resources.tree.resourceText"
            }
        }
    }
});

hortis.combineSelectors = function () {
    return fluid.makeArray(arguments).join(", ");
};

fluid.defaults("hortis.sunburst", {
    gradeNames: ["fluid.newViewComponent"],
    selectors: {
        svg: ".flc-bagatelle-svg",
        taxonDisplay: ".fld-bagatelle-taxonDisplay",
        autocomplete: ".fld-bagatelle-autocomplete",
        segment: ".fld-bagatelle-segment",
        label: ".fld-bagatelle-label",
        segmentAndLabel: "@expand:hortis.combineSelectors({that}.options.selectors.segment, {that}.options.selectors.label)"
    },
    styles: {
        segment: "fld-bagatelle-segment",
        label: "fld-bagatelle-label",
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
        documented: "#9ecae1",
        undocumented: "#e7969c"
    },
    zoomDuration: 1250,
    scaleConfig: {
        innerDepth: 1 / 22,
        outerDepth: 1 - 13 / 22,
        maxNodes: 200
    },
    parsedColours: "@expand:hortis.parseColours({that}.options.colours)",
    model: {
        scale: {
            left: 0,
            right: 0,
            radiusScale: []
        },
        layoutId: null,
        hoverId: null
    },
    markup: {
        segmentHeader: "<g xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\">",
        segment: "<path id=\"%id\" d=\"%path\" visibility=\"%visibility\" class=\"%clazz\" vector-effect=\"non-scaling-stroke\" style=\"%style\"></path>",
        label: "<path id=\"%labelPathId\" d=\"%textPath\" visibility=\"%labelVisibility\" class=\"%labelPathClass\" vector-effect=\"non-scaling-stroke\"></path>"
            + "<text id=\"%labelId\" dominant-baseline=\"middle\" class=\"%labelClass\" visibility=\"%labelVisibility\" style=\"%labelStyle\">"
            + "<textPath xlink:href=\"#%labelPathId\" startOffset=\"50%\" style=\"text-anchor: middle\">%label</textPath></text>",
        segmentFooter: "</g>",
        tooltipHeader: "<div><table>",
        tooltipRow: "<tr><td>%key: </td><td>%value</td>",
        tooltipFooter: "</table></div>"
    },
    invokers: {
        render: "hortis.render({that})",
        renderSegment: "hortis.renderSegment({that}, {arguments}.0, {arguments}.1)",
        angleScale: "hortis.angleScale({arguments}.0, {that}.model.scale)",
        elementToRow: "hortis.elementToRow({that}, {arguments}.0)",
        segmentClicked: "hortis.segmentClicked({that}, {arguments}.0)",
    },
    modelListeners: {
        scale: {
            excludeSource: "init",
            funcName: "hortis.updateScale",
            args: ["{that}", "{change}.value"]
        },
        hoverId: {
            excludeSource: "init",
            funcName: "hortis.updateTooltip",
            args: ["{that}", "{change}.value"]
        }
    },
    events: {
        zoomCompleted: null
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
        "onCreate.render": {
            func: "{that}.render",
            priority: "after:computeInitialScale"
        },
        "onCreate.bindMouse": {
            funcName: "hortis.bindMouse",
            args: ["{that}"]
        }
    },
    tree: null,
    members: {
        visMap: [], // array of visibility aligned with flatTree
        flatTree: "@expand:hortis.flattenTree({that}.options.tree)",
        maxDepth: "@expand:hortis.computeMaxDepth({that}.flatTree)",
        index: "@expand:hortis.indexTree({that}.flatTree)" // map id to row
    }
});


hortis.capitalize = function(string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
};

hortis.tooltipFields = ["species", "commonName", "reporting", "lastCollected", "collector", "collection", "documenter"];

hortis.tooltipLookup = {
    commonName: "Common Name",
    lastCollected: "Last Collected",
    iNaturalist: "Observation",
    taxonLink: "iNaturalist Taxon"
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
    for (var i = 0; i < flatTree.length; ++ i) {
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
        var zoomTo = row.childCount > 1 ? row : row.parent;
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

hortis.renderTooltip = function (row, markup) {
    if (!row) {
        return null;
    }
    var dumpRow = function (key, value) {
        if (value) {
            var keyName = hortis.tooltipLookup[key] || hortis.capitalize(key);
            togo += fluid.stringTemplate(markup.tooltipRow, {key: keyName, value: value});
        }
    };
    var togo = markup.tooltipHeader;
    if (row.rank) {
        dumpRow(row.rank, row.name);
        dumpRow("species", row.childCount);
    } else {
        hortis.tooltipFields.forEach(function (field) {
            dumpRow(field, row[field]);
        });
        if (row.iNaturalistLink) {
            dumpRow("iNaturalist", "<a href=\"" + row.iNaturalistLink + "\">" + row.iNaturalistLink + "</a>");
        }
        if (row.photoLink) {
        // See this nonsense: https://stackoverflow.com/questions/5843035/does-before-not-work-on-img-elements
            dumpRow("photo", "<div><span class=\"fl-bagatelle-imgLoadingOverlay\"></span><img onload=\"hortis.imageLoaded(this)\" class=\"fl-bagatelle-photo fl-bagatelle-imgLoading\" src=\"" + row.photoLink + "\"/></div>");
        }
        if (row.upstreamID) {
            var taxonLink = "http://www.inaturalist.org/taxa/" + row.upstreamID;
            dumpRow("taxonLink", "<a href=\"" + taxonLink + "\">" + taxonLink + "</a>");
        }
    }
    togo += markup.tooltipFooter;
    return togo;
};

hortis.updateTooltip = function (that, id) {
    console.log("updateTooltip for id ", id);
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

hortis.bindMouse = function (that) {
    var svg = that.locate("svg");
    var segmentAndLabel = that.options.selectors.segmentAndLabel;
    svg.on("click", segmentAndLabel, function () {
        var id = hortis.elementToId(this);
        that.segmentClicked(that.index[id]);
    });
    svg.on("mouseenter", segmentAndLabel, function (e) {
        window.clearTimeout(that.leaveTimeout);
        var id = hortis.elementToId(this);
        that.mouseEvent = e;
        that.applier.change("hoverId", id);
    });
    svg.on("mouseleave", segmentAndLabel, function (e) {
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

hortis.makeRadiusScale = function (innerRings, visRings, totalRings, options) {
    console.log("makeRadiusScale with innerRings ", innerRings, " visRings ", visRings);
    // Allocate as many outerRings as we can without making in between rings narrower than innerDepth
    // Total amount available is 1 - innerRadius, in between thickness would be (1 - outerRings * options.outerDepth - innerRadius) / (totalRings - outerRings - innerRings);
    var outerRings = Math.floor((1 - visRings * options.innerDepth) / (options.outerDepth - options.innerDepth));
    console.log("outerRings determined as ", outerRings);
    var middleRings = visRings - outerRings - innerRings;
    var middleDepth = (1 - outerRings * options.outerDepth - innerRings * options.innerDepth) / middleRings;
    var togo = [0];
    hortis.outRings(togo, innerRings, options.innerDepth);
    hortis.outRings(togo, middleRings, middleDepth);
    hortis.outRings(togo, outerRings, options.outerDepth);
    hortis.outRings(togo, totalRings - visRings, 0);
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
    var radiusScale = hortis.makeRadiusScale(layoutRoot.depth, depth + 1, that.maxDepth + 1, that.options.scaleConfig);
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
    return row.childCount > 1 || row.iNaturalistLink;
};

hortis.elementClass = function (row, isLayoutRoot, styles, baseStyle) {
    return styles[baseStyle]
        + (hortis.isClickable(row) ? " " + styles.clickable : "")
        + (isLayoutRoot ? " " + styles.layoutRoot : "");
};

hortis.elementStyle = function (attrs, elementType) {
    var opacity = attrs.opacity === undefined ? "" : " opacity: " + attrs.opacity + ";";
    return elementType === "segment" ? 
        "fill: " + attrs.fillColour + ";" + opacity : opacity
};

hortis.updateScale = function (that) {
    that.flatTree.forEach(function (row, index) {
        if (that.visMap[index] || that.oldVisMap && that.oldVisMap[index]) {
            var attrs = hortis.attrsForRow(that, row);
            attrs.fillColour = hortis.colourForRow(that.options.parsedColours, row);
            var isLayoutRoot = row.id === that.model.layoutId;
            var segment = fluid.byId("hortis-segment:" + row.id);
            if (segment) {
                segment.setAttribute("d", attrs.path);
                segment.setAttribute("visibility", attrs.visibility);
                segment.setAttribute("class", hortis.elementClass(row, isLayoutRoot, that.options.styles, "segment"));
                segment.setAttribute("style", hortis.elementStyle(attrs, "segment"));
            }
            var labelPath = fluid.byId("hortis-labelpath:" + row.id);
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
        }
    });
};

hortis.renderSVGTemplate = function (template, terms) {
    return fluid.stringTemplate(template, terms);
};

hortis.interpolateColour = function (f, c1, c2) {
    return fluid.transform([
        (1 - f) * c1[0] + f * c2[0],
        (1 - f) * c1[1] + f * c2[1],
        (1 - f) * c1[2] + f * c2[2]], Math.round);
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

hortis.colourForRow = function (parsedColours, row) {
    var undocFraction = row.undocumentedCount / row.childCount;
    var interp = hortis.interpolateColour(undocFraction, parsedColours.documented, parsedColours.undocumented);
    return fluid.colour.arrayToString(interp);
};

hortis.elementToId = function (element) {
    var id = element.id;
    return id.substring(id.indexOf(":") + 1);;
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
    if (row.childCount > 1) {
        hortis.beginZoom(that, row);
    } else {
        if (row.iNaturalistLink) {
            window.open(row.iNaturalistLink);
        }
    }
};

hortis.labelForRow = function (row) {
    return row.rank ? (row.rank === "Life" ? "Life" : row.rank + ": " + row.name) : row.species;
};

// This guide is a great one for "bestiary of reuse failures": https://www.visualcinnamon.com/2015/09/placing-text-on-arcs.html
// What the chaining method reduces one to who is unable to allocate any intermediate variables

hortis.attrsForRow = function (that, row) {
    var leftAngle = that.angleScale(row.leftIndex),
        rightAngle = that.angleScale(row.leftIndex + row.childCount),
        innerRadius = that.model.scale.radiusScale[row.depth],
        outerRadius = that.model.scale.radiusScale[row.depth + 1];
    var isComplete = fluid.model.isSameValue(leftAngle, 0) && fluid.model.isSameValue(rightAngle, 2 * Math.PI);
    var isCircle = fluid.model.isSameValue(innerRadius, 0) && isComplete;
    var isVisible = !fluid.model.isSameValue(leftAngle, rightAngle) && !fluid.model.isSameValue(innerRadius, outerRadius);
    var isOuterSegment = fluid.model.isSameValue(outerRadius - innerRadius, that.options.scaleConfig.outerDepth);
    var label = hortis.labelForRow(row);
    var outerLength = outerRadius * (rightAngle - leftAngle);
    if (fluid.model.isSameValue(leftAngle, Math.PI)) {
        // Eliminate Chrome crash bug exhibited in https://amb26.github.io/svg-failure/ but apparently only on Windows 7!
        // Note that 1e-5 will be too small!
        leftAngle += 1e-4;
    }
    var labelVisibility = isOuterSegment ? outerLength > 0.035 : outerLength > label.length * 0.016; // TODO: make a guess of this factor from font size (e.g. 2/3 of it)
    var togo = {
        visibility: isVisible ? "visible" : "hidden",
        labelVisibility: isVisible && labelVisibility ? "visible" : "hidden",
        label: label,
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
        labelPathId: "hortis-labelpath:" + row.id,
        labelId: "hortis-label:" + row.id,
        clazz: hortis.elementClass(row, isLayoutRoot, that.options.styles, "segment"),
        labelPathClass: that.options.styles.labelPath,
        labelClass: hortis.elementClass(row, isLayoutRoot, that.options.styles, "label"),
        fillColour: hortis.colourForRow(that.options.parsedColours, row)
    }, hortis.attrsForRow(that, row));
    terms.style = hortis.elementStyle(terms, "segment");
    terms.labelStyle = hortis.elementStyle(terms, "label");
    return hortis.renderSVGTemplate(that.options.markup.segment, terms)
       + hortis.renderSVGTemplate(that.options.markup.label, terms);
};

fluid.setLogging(false);

hortis.render = function (that) {
    var rootRow = that.index[that.model.layoutId];
    var markup = that.options.markup.segmentHeader;
    for (var i = 0; i < that.flatTree.length; ++i) {
        if (that.visMap[i] || that.oldVisMap && that.oldVisMap[i]) {
            markup += that.renderSegment(that.flatTree[i]);
        }
    }
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

hortis.computeInitialScale = function (that) {
    var root = that.flatTree[0];
    that.applier.change("", {
        layoutId: root.id
    });
};
