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
        labelPath: "fld-bagatelle-labelPath"
    },
    colours: {
        documented: "#9ecae1",
        undocumented: "#e7969c"
    },
    zoomDuration: 750,
    parsedColours: "@expand:hortis.parseColours({that}.options.colours)",
    model: {
        scale: {
            left: 0,
            right: 0,
            startDepth: 0,
            endDepth: 0
        },
        hoverId: null
    },
    markup: {
        segmentHeader: "<g xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\">",
        segment: "<path id=\"%id\" d=\"%path\" visibility=\"visibility\" class=\"%clazz\" vector-effect=\"non-scaling-stroke\" style=\"fill: %fillColour;\"></path>",
        label: "<path id=\"%labelPathId\" d=\"%textPath\" visibility=\"%labelVisibility\" class=\"%textPathClass\" vector-effect=\"non-scaling-stroke\"></path>"
            + "<text id=\"%labelId\" clas=\"%textClass\" visibility=\"%labelVisibility\"><textPath xlink:href=\"#%labelPathId\" startOffset=\"50%\" style=\"text-anchor: middle\">%label</textPath></text>",
        segmentFooter: "</g>",
        tooltipHeader: "<div><table>",
        tooltipRow: "<tr><td>%key: </td><td>%value</td>",
        tooltipFooter: "</table></div>"
    },
    invokers: {
        renderSegment: "hortis.renderSegment({that}, {arguments}.0)",
        angleScale: "hortis.angleScale({arguments}.0, {that}.model.scale)",
        radiusScale: "hortis.radiusScale({arguments}.0, {that}.model.scale)",
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
    listeners: {
        "onCreate.doLayout": {
            funcName: "hortis.doLayout",
            args: ["{that}.flatTree"]
        },
        "onCreate.computeInitialScale": {
            funcName: "hortis.computeInitialScale",
            args: ["{that}"],
            priority: "after:doLayout"
        },
        "onCreate.render": {
            funcName: "hortis.render",
            args: ["{that}"],
            priority: "after:computeInitialScale"
        },
        "onCreate.bindMouse": {
            funcName: "hortis.bindMouse",
            args: ["{that}"]
        }
    },
    tree: null,
    members: {
        flatTree: "@expand:hortis.flattenTree({that}.options.tree)",
        index: "@expand:hortis.indexTree({that}.flatTree)"
    }
});
hortis.tooltipFields = ["species", "commonName", "reporting", "lastCollected", "collector", "documenter", "collection"];

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
    var content = id ? hortis.renderTooltip(that.index[id], that.options.markup) : null;
    if (that.tooltipTarget) {
        that.tooltipTarget.tooltip("destroy");
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

hortis.renderSVGElement = function (markup, parentContainer) {
    // Approach taken from http://stackoverflow.com/a/36507333
    var container = $.parseXML(markup);
    var element = container.documentElement;
    parentContainer.append(element);
    return element;
};

hortis.angleScale = function (index, scale) {
    var angle = 2 * Math.PI * (index - scale.left) / (scale.right - scale.left);
    return fluid.transforms.limitRange(angle, {min: 0, max: 2 * Math.PI});
};

hortis.radiusScale = function (depth, scale) {
    return Math.max(0, depth - scale.startDepth) / (scale.endDepth - scale.startDepth);
};

hortis.emitPath = function (elements) {
    var togo = "";
    elements.forEach(function (elem) {
        if (typeof(elem) === "string") {
            togo += elem;
        } else {
            togo += elem.toFixed(6);
        }
    });
    return togo;
};

hortis.circularPath = function (radius) {
    var r = radius;
    return hortis.emitPath(["M", -r, " ", 0,
        "A", r, " ", r, " 0 1 0 ", r, " ", 0,
        "A", r, " ", r, " 0 1 0 ", -r, " ", 0
    ]);
};

hortis.annularPath = function (innerRadius, outerRadius) {
    var ir = innerRadius, or = outerRadius;
    return hortis.emitPath(["M", -or, " ", 0,
        "A", or, " ", or, " 0 1 0 ", or, " ", 0,
        "A", or, " ", or, " 0 1 0 ", -or, " ", 0,
        "Z",
        "M", -ir, " ", 0,
        "A", ir, " ", ir, " 0 1 1 ", ir, " ", 0,
        "A", ir, " ", ir, " 0 1 1 ", -ir, " ", 0,
        "Z"
    ]);
};

hortis.segmentPath = function (startAngle, endAngle, innerRadius, outerRadius) {
    var cs = Math.cos(startAngle), ss = -Math.sin(startAngle),
        ce = Math.cos(endAngle), se = -Math.sin(endAngle),
        i = innerRadius, o = outerRadius,
        lfa = (+((endAngle - startAngle) >= Math.PI)).toString();
    // https://developer.mozilla.org/en-US/docs/Web/SVG/Tutorial/Paths#Arcs
    return hortis.emitPath(["M", cs * i, " ", ss * i,
            "A", i, " ", i, " 0 ", lfa, " 0 ", ce * i, " ", se * i,
            "L", ce * o, " ", se * o,
            "A", o, " ", o, " 0 ", lfa, " 1 ", cs * o, " ", ss * o,
            "Z"]);
};

hortis.segmentTextPath = function (startAngle, endAngle, outerRadius) {
    var cs = Math.cos(startAngle), ss = -Math.sin(startAngle),
        ce = Math.cos(endAngle), se = -Math.sin(endAngle),
        ar = outerRadius - 0.01,
        lfa = (+((endAngle - startAngle) >= Math.PI)).toString();
    return hortis.emitPath(["M", cs * ar, " ", ss * ar,
        "A", ar, " ", ar, " 0 ", lfa, " 0 ", ce * ar, " ", se * ar]);
};

hortis.circularTextPath = function (outerRadius) {
    var ar = outerRadius - 0.01;
    return hortis.emitPath(["M", "-0.0001 ", -ar,
        "A", ar, " ", ar, " 0 1 0 ", "0.0001 ", -ar]);
};

hortis.updateScale = function (that) {
    that.flatTree.forEach(function (row) {
        var attrs = hortis.attrsForRow(that, row);
        var segment = fluid.byId("hortis-segment-" + row.id);
        if (segment) {
            segment.setAttribute("d", attrs.path);
            segment.setAttribute("visibility", attrs.visibility);
        }
        var labelPath = fluid.byId("hortis-labelpath-" + row.id);
        if (labelPath) {
            labelPath.setAttribute("d", attrs.textPath);
            labelPath.setAttribute("visibility", attrs.labelVisibility);
        }
        var label = fluid.byId("hortis-label-" + row.id);
        if (label) {
            label.setAttribute("visibility", attrs.labelVisibility);
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

hortis.interpolateFlatModels = function (f, m1, m2) {
    return fluid.transform(m1, function (value, key) {
        return (1 - f) * value + f * m2[key];
    });
};

hortis.colourForRow = function (parsedColours, row) {
    var undocFraction = row.undocumentedCount / row.childCount;
    var interp = hortis.interpolateColour(undocFraction, parsedColours.documented, parsedColours.undocumented);
    return fluid.colour.arrayToString(interp);
};

hortis.elementToId = function (element) {
    return element.id.substring("hortis-segment-".length);
};

hortis.elementToRow = function (that, element) {
    var id = hortis.elementToId(element);
    return that.index[id];
};

hortis.beginZoom = function (that, element) {
    that.container.stop(true, true);
    var initialScale = fluid.copy(that.model.scale);
    var finalScale = {
        left: element.leftIndex,
        right: element.leftIndex + element.childCount,
        startDepth: Math.max(element.depth - 1, 0),
        endDepth: initialScale.endDepth
    };
    that.container.animate({"zoomProgress": 1}, {
        easing: "linear",
        duration: that.options.zoomDuration,
        step: function (progress) {
            var interpScale = hortis.interpolateFlatModels(progress, initialScale, finalScale);
            that.applier.change("scale", interpScale);
        },
        complete: function () {
            that.container[0].zoomProgress = 0;
        }
    });
};

hortis.segmentClicked = function (that, element) {
    if (element.childCount > 1) {
        hortis.beginZoom(that, element);
    } else {
        if (element.iNaturalistLink) {
            window.open(element.iNaturalistLink);
        }
    }

};

// This guide is a great one for "bestiary of reuse failures": https://www.visualcinnamon.com/2015/09/placing-text-on-arcs.html
// What the chaining method reduces one to who is unable to allocate any intermediate variables

hortis.attrsForRow = function (that, row) {
    var leftAngle = that.angleScale(row.leftIndex),
        rightAngle = that.angleScale(row.leftIndex + row.childCount),
        innerRadius = that.radiusScale(row.depth),
        outerRadius = that.radiusScale(row.depth + 1);
    var isComplete = fluid.model.isSameValue(leftAngle, 0) && fluid.model.isSameValue(rightAngle, 2 * Math.PI);
    var isCircle = fluid.model.isSameValue(innerRadius, 0) && isComplete;
    var isVisible = !fluid.model.isSameValue(leftAngle, rightAngle) && !fluid.model.isSameValue(innerRadius, outerRadius);
    var label = row.rank ? (row.rank + ": " + row.name) : row.species;
    var availableLength = outerRadius * (rightAngle - leftAngle);
    var labelVisibility = availableLength > label.length * 0.02; // TODO: make a guess of this factor from font size (e.g. 2/3 of it)
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
        togo.textPath = hortis.segmentTextPath(leftAngle, rightAngle, outerRadius);
        togo.path = hortis.segmentPath(leftAngle, rightAngle, innerRadius, outerRadius);
    }
    return togo;
};

hortis.renderSegment = function (that, row) {
    var terms = $.extend({
        id: "hortis-segment-" + row.id,
        labelPathId: "hortis-labelpath-" + row.id,
        labelId: "hortis-label-" + row.id,
        clazz: that.options.styles.segment,
        textPathClass: that.options.styles.label,
        fillColour: hortis.colourForRow(that.options.parsedColours, row)
    }, hortis.attrsForRow(that, row));
    return hortis.renderSVGTemplate(that.options.markup.segment, terms)
       + hortis.renderSVGTemplate(that.options.markup.label, terms);
};

fluid.setLogging(false);

hortis.render = function (that) {
    fluid.log("Begin render");
    var markup = that.options.markup.segmentHeader;
    for (var i = 0; i < that.flatTree.length; ++i) {
        markup += that.renderSegment(that.flatTree[i]);
    }
    markup += that.options.markup.segmentFooter;
    hortis.renderSVGElement(markup, that.locate("svg"));
};


hortis.depthComparator = function (rowa, rowb) {
    return rowa.depth - rowb.depth;
};

hortis.flattenTree = function (tree) {
    var flat = [];
    flat.push(tree);
    hortis.flattenTreeRecurse(tree, flat);
    flat.sort(hortis.depthComparator);
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
    fluid.each(tree.children, function (child) {
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
        fluid.each(node.children, function (child) {
            child.leftIndex = thisLeft;
            thisLeft += child.childCount;
        });
    });
};

hortis.computeInitialScale = function (that) {
    var maxDepth = that.flatTree[that.flatTree.length - 1].depth;
    var childCount = that.flatTree[0].childCount;
    that.applier.change("scale", {
        left: 0,
        right: childCount,
        startDepth: 0,
        endDepth: maxDepth
    });
};
