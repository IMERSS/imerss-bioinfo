/* eslint-env node */

"use strict";

const fluid = require("infusion");
const kettle = require("kettle");

const hortis = fluid.registerNamespace("hortis");

hortis.readJSONSync = function (fileName, message) {
    const promise = kettle.JSON.readFileSync(fileName, message + " " + fileName);
    let togo;
    promise.then(function (parsed) {
        togo = parsed;
    }, function (err) {
        throw err;
    });
    return togo;
};

hortis.readModuleJSONSync = function (fileName, message) {
    return hortis.readJSONSync(fluid.module.resolvePath(fileName), message);
};
