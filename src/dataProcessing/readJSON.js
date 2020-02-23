/* eslint-env node */

"use strict";

var fluid = require("infusion");
var kettle = require("kettle");

var hortis = fluid.registerNamespace("hortis");

hortis.readJSONSync = function (fileName, message) {
    var promise = kettle.JSON.readFileSync(fileName, message + " " + fileName);
    var togo;
    promise.then(function (parsed) {
        togo = parsed;
    }, function (err) {
        throw err;
    });
    return togo;
};
