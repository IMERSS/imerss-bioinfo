/* eslint-env node */

"use strict";

var fluid = require("infusion");
var moment = require("moment"); // Horrid - required to apply template parsing to Date fields

var hortis = fluid.registerNamespace("hortis");

fluid.defaults("hortis.csvReaderWithMap", {
    gradeNames: ["hortis.csvFileReader", "hortis.storingCSVReader"],
    // "columns" member of the map structure
    mapColumns: null,
    // true if the map file defines template interpolation via % rather than simply mapping column names e.g. as an "outMap"
    templateMap: false,
    listeners: {
        "onHeaders.validateHeaders": {
            funcName: "hortis.validateHeaders",
            args: ["{that}.options.mapColumns", "{that}.options.templateMap", "{that}.headers", "{that}.events.onError"]
        },
        "onRow.storeRow": "hortis.storeRow({that}, {arguments}.0)"
    }
});

hortis.templateMapField = function (data, template) {
    if (template.startsWith("!Date")) {
        var match = template.match(/!Date\((.*),(.*)\)/);
        var format = match[1], smallTemplate = match[2];
        var value = fluid.stringTemplate(smallTemplate, data);
        return moment.utc(value, format).toISOString();
    } else if (template.startsWith("@")) {
        var rec = fluid.compactStringToRec(template.substring(1), "expander");
        var func = fluid.getGlobalValue(rec.funcName);
        if (!func) {
            fluid.fail("Unable to look up " + rec.funcName + " as a global function");
        }
        var args = fluid.transform(rec.args, function (arg) {
            return fluid.stringTemplate(arg, data);
        });
        return func.apply(null, args);
    } else {
        var togo = fluid.stringTemplate(template, data);
        if (togo.indexOf("%") !== -1) {
            console.log("Warning: value " + template + " did not match a column in the data");
        }
        return togo;
    }
};

// Speed on taxa - 500ms on IoC dispatch, 1300ms on mapping
hortis.mapRow = function (data, mapColumns, templateMap, index) {
    var togo = {};
    fluid.each(mapColumns, function (label, key) {
        togo[key] = templateMap ? hortis.templateMapField(data, label) : data[label];
    });
    togo.index = index;
    return togo;
};

hortis.storeRow = function (that, row) {
    var mappedRow = hortis.mapRow(row, that.options.mapColumns, that.options.templateMap, that.rows.length + 1);
    that.rows.push(mappedRow);
};

hortis.validateHeaders = function (mapColumns, templateMap, headers, onError) {
    if (!mapColumns || mapColumns.length === 0) {
        fluid.fail("Error in csvReaderWithMap - no mapColumns were supplied");
    }
    var headerHash = fluid.arrayToHash(headers);
    fluid.each(mapColumns, function (label) {
        if (templateMap) {
            var interp = fluid.stringTemplate(label, headerHash);
            if (interp.indexOf("%") !== -1) {
                onError.fire("Error in headers - template " + label + " did not match headers");
            }
        } else {
            if (headers.indexOf(label) === -1) {
                onError.fire("Error in headers - field " + label + " required in map file was not found");
            }
        }
    });
};

// Used in writeCSV
hortis.mapToArray = function (row, map) {
    var keys = Object.keys(map);
    return keys.map(function (header) {
        return row[header];
    });
};
