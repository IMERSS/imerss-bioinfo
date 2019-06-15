/* eslint-env node */

"use strict";

var fluid = require("infusion");

var hortis = fluid.registerNamespace("hortis");

// Implementation taken from https://github.com/substack/point-in-polygon/blob/master/index.js

/** Determines whether a point is within a polygon by a quick, short but numerically unstable algorithm.
 * @param {Number[]} point - 2-element array of doubles determining the point
 * @param {Number[][] vs - Array of 2-element array of polygon vertices
 * @return {Boolean} `true` if the supplied point is within the supplied polygon
 */
hortis.pointInPolygon = function (point, vs) {
    // ray-casting algorithm based on
    // http://www.ecse.rpi.edu/Homepages/wrf/Research/Short_Notes/pnpoly.html
    
    var x = point[0], y = point[1];
    
    var inside = false;
    for (var i = 0, j = vs.length - 1; i < vs.length; j = i++) {
        var xi = vs[i][0], yi = vs[i][1];
        var xj = vs[j][0], yj = vs[j][1];
        
        var intersect = ((yi > y) != (yj > y))
            && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    
    return inside;
};