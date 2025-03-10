/* eslint-env node */

"use strict";

// noinspection ES6ConvertVarToLetConst
var fluid = fluid || require("infusion");

// noinspection ES6ConvertVarToLetConst
var hortis = fluid.registerNamespace("hortis");

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

// Template values with a ${key} syntax using a straightforward regex strategy and optional warning for missing values
hortis.stringTemplate = function (template, vars, warnFunc) {
    const replacer = function (all, match) {
        const segs = match.split(".");
        const fetched = fluid.getImmediate(vars, segs);
        if (warnFunc && fetched === undefined) {
            warnFunc(match);
        }
        return fetched || "";
    };
    return template.replace(hortis.stringTemplateRegex, replacer);
};

// Template values with a %key syntax and optional warning for missing values
fluid.stringTemplateWarn = function (template, values, warnFunc) {
    let keys = Object.keys(values);
    keys = keys.sort(fluid.compareStringLength());
    for (let i = 0; i < keys.length; ++i) {
        const key = keys[i];
        const templatePlaceholder = "%" + key;
        const replacementValue = values[key];
        if (warnFunc && replacementValue === undefined) {
            warnFunc(key);
        }
        template = template.replaceAll(templatePlaceholder, replacementValue);
    }
    return template;
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

// Taken from https://codeburst.io/javascript-async-await-with-foreach-b6ba62bbf404
hortis.asyncForEach = async function (array, callback) {
    for (let index = 0; index < array.length; index++) {
        await callback(array[index], index, array);
    }
};

hortis.asyncEach = async function (source, callback) {
    for (let key in source) {
        await callback(source[key], key);
    }
};
