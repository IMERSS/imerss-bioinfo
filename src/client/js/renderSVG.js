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

hortis.renderSVGElement = function (markup, parentContainer) {
    // Approach taken from http://stackoverflow.com/a/36507333
    var container = $.parseXML(markup);
    console.log("markup parsed to ", container.documentElement.nodeName);
    var element = container.documentElement;
    parentContainer.append(element);
    return element;
};

hortis.renderNumber = function (number) {
    if (Math.abs(number) < 1e-5) {
        return "0";
    } else {
        return number.toFixed(6);
    }
};

hortis.emitPath = function (elements) {
    var togo = "";
    elements.forEach(function (elem) {
        if (typeof(elem) === "string") {
            togo += elem;
        } else {
            togo += hortis.renderNumber(elem);
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

hortis.linearTextPath = function (leftAngle, rightAngle, innerRadius, outerRadius) {
    var midAngle = (leftAngle + rightAngle) / 2,
        c = Math.cos(midAngle), s = -Math.sin(midAngle),
        sr = c > 0 ? innerRadius : outerRadius,
        fr = c > 0 ? outerRadius : innerRadius;
    return hortis.emitPath(["M", c * sr, " ", s * sr, "L", c * fr, " ", s * fr]);
};

hortis.segmentTextPath = function (startAngle, endAngle, outerRadius) {
    var cs = Math.cos(startAngle), ss = -Math.sin(startAngle),
        ce = Math.cos(endAngle), se = -Math.sin(endAngle),
        ar = outerRadius - 0.015,
        lfa = (+((endAngle - startAngle) >= Math.PI)).toString();
    return hortis.emitPath(["M", cs * ar, " ", ss * ar,
        "A", ar, " ", ar, " 0 ", lfa, " 0 ", ce * ar, " ", se * ar]);
};

hortis.circularTextPath = function (outerRadius) {
    var ar = outerRadius - 0.015;
    return hortis.emitPath(["M", "-0.0001 ", -ar,
        "A", ar, " ", ar, " 0 1 0 ", "0.0001 ", -ar]);
};
