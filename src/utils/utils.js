/* eslint-env node */

"use strict";

const fluid = require("infusion");

const hortis = fluid.registerNamespace("hortis");

hortis.capitalize = function (string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
};

hortis.pluralise = function (number, noun) {
    return number + " " + noun + (number === 1 ? "" : "s");
};

// Helpful answer: https://stackoverflow.com/a/35759874
hortis.parseFloat = function (str) {
    return isNaN(str) ? NaN : parseFloat(str);
};

// https://stackoverflow.com/a/24457420
hortis.isInteger = function isNumeric(value) {
    return /^-?\d+$/.test(value);
};

/** Upgrades a promise rejection payload (or Error) by suffixing an additional "while" reason into its "message" field
 * @param {Object|Error} originError - A rejection payload. This should (at least) have the member `isError: true` set, as well as a String `message` holding a rejection reason.
 * @param {String} whileMsg - A message describing the activity which led to this error
 * @return {Object} The rejected payload formed by shallow cloning the supplied argument (if it is not an `Error`) and suffixing its `message` member
 */
hortis.upgradeError = function (originError, whileMsg) {
    const error = originError instanceof Error ? originError : fluid.extend({}, originError);
    error.message = originError.message + whileMsg;
    return error;
};

hortis.roundDecimals = function (text, places) {
    const parsed = hortis.parseFloat(text);
    if (!isNaN(parsed)) {
        return +parsed.toFixed(places);
    } else {
        return text;
    }
};

hortis.stringTemplateRegex = /\${([^\}]*)}/g;

hortis.stringTemplate = function (template, vars) {
    const replacer = function (all, match) {
        const segs = match.split(".");
        return fluid.getImmediate(vars, segs) || "";
    };
    return template.replace(hortis.stringTemplateRegex, replacer);
};

hortis.findDuplicates = function (array) {
    return array.filter(function (item, index) {
        return array.indexOf(item) !== index;
    });
};

// Taken from https://stackoverflow.com/a/64909887
hortis.asyncMap = async function (arr, fn) {
    const result = [];
    for (let idx = 0; idx < arr.length; ++idx) {
        const cur = arr[idx];
        result.push(await fn(cur, idx, arr));
    }
    return result;
};
