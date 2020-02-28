/*
Copyright 2017 Antranig Basman
Licensed under the Educational Community License (ECL), Version 2.0 or the New
BSD license. You may not use this file except in compliance with one these
Licenses.
You may obtain a copy of the ECL 2.0 License and BSD License at
https://github.com/fluid-project/infusion/raw/master/Infusion-LICENSE.txt
*/
"use strict";
/* eslint space-infix-ops: "off"*/

fluid.registerNamespace("fluid.colour");

fluid.colour.hexIndirect = {
    3: "001122",
    4: "00112233",
    6: "012345",
    8: "01234567"
};

fluid.colour.hexToArray = function (hex) {
    if (hex.charAt(0) !== "#") {
        fluid.fail("hex colour must begin with # - " + hex);
    }
    hex = hex.substring(1);
    var digits = fluid.transform(hex.split(""), function (ch) {
        return parseInt(ch, 16);
    });
    var indirect = fluid.colour.hexIndirect[hex.length];
    if (!indirect) {
        fluid.fail("Unsupported number of hex digits in " + hex + ": can only supply " + Object.keys(fluid.colour.hexIndirect).join(", ") + " digits");
    }
    var array = [];
    for (var i = 0; i < indirect.length; i += 2) {
        var colour = (digits[indirect[i]] * 16 + digits[indirect[i + 1]]) / (i === 6 ? 255 : 1);
        array.push(colour);
    }
    return array;
};

fluid.colour.arrayToString = function (array) {
    return (array.length === 3 ? "rgb(" : "rgba(") + array.join(", ") + ")";
};

fluid.colour.interpolate = function (f, c1, c2) {
    return fluid.transform([
        (1 - f) * c1[0] + f * c2[0],
        (1 - f) * c1[1] + f * c2[1],
        (1 - f) * c1[2] + f * c2[2]], Math.round);
};

fluid.colour.average = function (ca) {
    var sum = ca.reduce(function (total, c) {
        total[0] += c[0];
        total[1] += c[1];
        total[2] += c[2];
        return total;
    }, [0, 0, 0]);
    return sum.map(function (e) {
        return e / ca.length;
    });
};

/**
 * Converts an RGB color value to HSL. Conversion formula
 * adapted from http://en.wikipedia.org/wiki/HSL_color_space.
 * Assumes r, g, and b are contained in the range [0, 255] and
 * returns h, s, and l in the range [0, 1].
 *
 * @param {Number[]} c - The RGB representation
 * @return {Number[]} The HSL representation
 */
fluid.colour.rgbToHsl = function (c) {
    var r = c[0] / 255,
        g = c[1] / 255,
        b = c[2] / 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b);
    var h, s, l = (max + min) / 2;

    if (max === min) {
        h = s = 0; // achromatic
    } else {
        var d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        if (max === r) {
            h = (g - b)/d + (g < b ? 6 : 0);
        } else if (max === g) {
            h = (b - r)/d + 2;
        } else {
            h = (r - g)/d + 4;
        }
        h /= 6;
    }
    return [h, s, l];
};


fluid.colour.hue2rgb = function (p, q, t) {
    if (t < 0) {
        t += 1;
    } else if (t > 1) {
        t -= 1;
    }
    if (t < 1/6) {
        return p + (q - p) * 6 * t;
    } else if (t < 1/2) {
        return q;
    } else if (t < 2/3) {
        return p + (q - p) * (2/3 - t) * 6;
    } else {
        return p;
    }
};

/**
 * Converts an HSL color value to RGB. Conversion formula
 * adapted from http://en.wikipedia.org/wiki/HSL_color_space.
 * Assumes h, s, and l are contained in the set [0, 1] and
 * returns r, g, and b in the set [0, 255].
 *
 * @param {Number[]} hsl - The HSL representation
 * @return {Number[]} The RGB representation
 */
fluid.colour.hslToRgb = function (hsl) {
    var h = hsl[0], s = hsl[1], l = hsl[2];
    var r, g, b;

    if (s === 0) {
        r = g = b = l; // achromatic
    } else {
        var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        var p = 2*l - q;
        r = fluid.colour.hue2rgb(p, q, h + 1/3);
        g = fluid.colour.hue2rgb(p, q, h);
        b = fluid.colour.hue2rgb(p, q, h - 1/3);
    }

    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
};
