/*
Copyright 2017 Antranig Basman
Licensed under the Educational Community License (ECL), Version 2.0 or the New
BSD license. You may not use this file except in compliance with one these
Licenses.
You may obtain a copy of the ECL 2.0 License and BSD License at
https://github.com/fluid-project/infusion/raw/master/Infusion-LICENSE.txt
*/
"use strict";

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
