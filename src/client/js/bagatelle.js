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
    colours: {
        documented: "#9ecae1",
        undocumented: "#e7969c"
    },
    zoomDuration: 750,
    scaleConfig: {
        innerDepth: 1 / 22,
        outerDepth: 1 - 14 / 22,
        maxNodes: 300
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
        segment: "<path id=\"%id\" d=\"%path\" visibility=\"%visibility\" class=\"%clazz\" vector-effect=\"non-scaling-stroke\" style=\"fill: %fillColour;\"></path>",
        label: "<path id=\"%labelPathId\" d=\"%textPath\" visibility=\"%labelVisibility\" class=\"%labelPathClass\" vector-effect=\"non-scaling-stroke\"></path>"
            + "<text id=\"%labelId\" dominant-baseline=\"middle\" class=\"%labelClass\" visibility=\"%labelVisibility\"><textPath xlink:href=\"#%labelPathId\" startOffset=\"50%\" style=\"text-anchor: middle\">%label</textPath></text>",
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
        segmentClicked: "hortis.segmentClicked({that}, {arguments}.0)"
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
hortis.tooltipFields = ["species", "commonName", "reporting", "lastCollected", "collector", "documenter", "collection"];

// Lifted from Infusion Tooltip.js
hortis.isInDocument = function (node) {
    var dokkument = fluid.getDocument(node),
        container = node[0];
    // jQuery UI framework will throw a fit if we have instantiated a widget on a DOM element and then
    // removed it from the DOM. This apparently can't be detected via the jQuery UI API itself.
    return $.contains(dokkument, container) || dokkument === container;
};

hortis.renderTooltip = function (row, markup) {
    if (!row) {
        return null;
    }
    var dumpRow = function (key, value) {
        if (value) {
            togo += fluid.stringTemplate(markup.tooltipRow, {key: key, value: value});
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
    }
    togo += markup.tooltipFooter;
    return togo;
};

hortis.updateTooltip = function (that, id) {
    console.log("updateTooltip for id ", id);
    var content = id ? hortis.renderTooltip(that.index[id], that.options.markup) : null;
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
    }
};

hortis.bindMouse = function (that) {
    var svg = that.locate("svg");
    var segmentAndLabel = that.options.selectors.segmentAndLabel;
    svg.on("click", segmentAndLabel, function () {
        var id = hortis.elementToId(this);
        that.segmentClicked(that.index[id]);
    });
    svg.on("mouseenter", segmentAndLabel, function (e) {
        var id = hortis.elementToId(this);
        that.mouseEvent = e;
        that.applier.change("hoverId", id);
    });
    svg.on("mouseleave", segmentAndLabel, function (e) {
        that.mouseEvent = e;
        that.applier.change("hoverId", null);
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

hortis.updateScale = function (that) {
    that.flatTree.forEach(function (row, index) {
        if (that.visMap[index]) {
            var attrs = hortis.attrsForRow(that, row);
            var isLayoutRoot = row.id === that.model.layoutId;
            var segment = fluid.byId("hortis-segmentz" + row.id);
            if (segment) {
                segment.setAttribute("d", attrs.path);
                segment.setAttribute("visibility", attrs.visibility);
                segment.setAttribute("class", hortis.elementClass(row, isLayoutRoot, that.options.styles, "segment"));
            }
            var labelPath = fluid.byId("hortis-labelpathz" + row.id);
            if (labelPath) {
                labelPath.setAttribute("d", attrs.textPath);
                labelPath.setAttribute("visibility", attrs.labelVisibility);
            }
            var label = fluid.byId("hortis-labelz" + row.id);
            if (label) {
                label.setAttribute("visibility", attrs.labelVisibility);
                label.setAttribute("class", hortis.elementClass(row, isLayoutRoot, that.options.styles, "label"));
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
    return id.substring(id.indexOf("z") + 1);;
};

hortis.elementToRow = function (that, element) {
    var id = hortis.elementToId(element);
    return that.index[id];
};

hortis.beginZoom = function (that, row) {
    that.container.stop(true, true);
    hortis.updateTooltip(that, null);
    var initialScale = fluid.copy(that.model.scale);
    var newBound = hortis.boundNodes(that, row.id);
    that.container.animate({"zoomProgress": 1}, {
        easing: "linear",
        duration: that.options.zoomDuration,
        step: function (progress) {
            var interpScale = hortis.interpolateModels(progress, initialScale, newBound.scale);
            that.applier.change("scale", interpScale);
        },
        complete: function () {
            console.log("Zoom complete");
            that.container[0].zoomProgress = 0;
            that.applier.change("layoutId", row.id);
            that.visMap = newBound.visMap;
            that.render();
        }
    });
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
    var label = row.rank ? (row.rank === "Life" ? "Life" : row.rank + ": " + row.name) : row.species;
    var outerLength = outerRadius * (rightAngle - leftAngle);
    if (fluid.model.isSameValue(leftAngle, Math.PI)) {
        // leftAngle += 1e-4;
        console.log("ADJUSTED LEFTANGLE");
    }
    var labelVisibility = isOuterSegment ? outerLength > 0.035 : outerLength > label.length * 0.016; // TODO: make a guess of this factor from font size (e.g. 2/3 of it)
    var togo = {
        visibility: isVisible ? "visible" : "hidden",
        labelVisibility: isVisible && labelVisibility ? "visible" : "hidden",
        label: label
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
    return togo;
};

hortis.renderSegment = function (that, row, aster) {
    var isLayoutRoot = row.id === that.model.layoutId;
    var terms = $.extend({
        id: "hortis-segmentz" + row.id,
        labelPathId: "hortis-labelpathz" + row.id,
        labelId: "hortis-labelz" + row.id,
        clazz: hortis.elementClass(row, isLayoutRoot, that.options.styles, "segment"),
        labelPathClass: that.options.styles.labelPath,
        labelClass: hortis.elementClass(row, isLayoutRoot, that.options.styles, "label"),
        fillColour: hortis.colourForRow(that.options.parsedColours, row)
    }, hortis.attrsForRow(that, row));
    return hortis.renderSVGTemplate(that.options.markup.segment, terms)
       + (aster ? "" : hortis.renderSVGTemplate(that.options.markup.label, terms));
};

fluid.setLogging(false);

hortis.render = function (that) {
    console.log("Begin render");
    var rootRow = that.index[that.model.layoutId];
    var aster = rootRow.name === "Asterozoa";
    var rows = 0;
    var markup = that.options.markup.segmentHeader;
    for (var i = 0; i < that.flatTree.length; ++i) {
        if (that.visMap[i]) {
            if (!aster || rows >= 20) {
                markup += that.renderSegment(that.flatTree[i], aster);
            }
            ++rows;
            if (aster && rows === 21) {
                console.log("BREAKING AT " + rows);
                break;
            }
        }
    }
    markup += that.options.markup.segmentFooter;
    console.log("Composed markup ", markup);
    var container = that.locate("svg");
    container.empty();
    window.setTimeout(function () {
        console.log("Begin render");
        hortis.renderSVGElement(markup, container);
    }, 5000);
    console.log("Render complete");
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
