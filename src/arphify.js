/* eslint-env node */

"use strict";

var fluid = require("infusion");
var minimist = require("minimist");
var ExcelJS = require("exceljs");
var fs = require("fs");

fluid.require("%bagatelle");

require("./dataProcessing/readJSON.js");
require("./dataProcessing/readCSV.js");
require("./dataProcessing/readCSVwithMap.js");

var hortis = fluid.registerNamespace("hortis");

fluid.setLogging(true);

var parsedArgs = minimist(process.argv.slice(2));

var pipeline = hortis.readJSONSync(parsedArgs.pipeline);

var map = hortis.readJSONSync(fluid.module.resolvePath(pipeline.inputFileMap), "reading map file");

var reader = hortis.csvReaderWithMap({
    inputFile: fluid.module.resolvePath(pipeline.inputFile),
    mapColumns: map.columns
});

var outputDir = fluid.module.resolvePath(pipeline.outputDir);
fs.mkdirSync(outputDir, { recursive: true });

hortis.unmapColumns = function (rows, columns) {
    return fluid.transform(rows, function (row) {
        var togo = {};
        fluid.each(columns, function (target, source) {
            togo[target] = row[source] || "";
        });
        return togo;
    });
};

hortis.writeExcel = function (rows, key, outputDir) {
    if (rows.length === 0) {
        console.log("Skipping key " + key + " since no rows were selected");
        return fluid.promise().resolve();;
    }
    var workbook = new ExcelJS.Workbook();
    var taxaSheet = workbook.addWorksheet("Taxa");
    var keys = Object.keys(rows[0]);
    var header = taxaSheet.getRow(1);
    keys.forEach(function (key, index) {
        header.getCell(index + 1).value = key;
    });
    rows.forEach(function (row, rowIndex) {
        var sheetRow = taxaSheet.getRow(rowIndex + 2);
        keys.forEach(function (key, index) {
            sheetRow.getCell(index + 1).value = row[key];
        });
    });
    var filename = outputDir + "/" + key + ".xlsx";
    return workbook.xlsx.writeFile(filename);
};

reader.completionPromise.then(function () {
    var rows = reader.rows;
    console.log("Input: " + rows.length + " rows");
    var outs = fluid.transform(pipeline.files, function (rec, key) {
        // cf. hortis.applyFilters
        var outRows = rows.filter(function (row) {
            var element = row[rec.field];
            var match = element === rec.equals;
            return match;
        });
        console.log("Extracted " + outRows.length + " rows via filter " + key);
        var remapped = hortis.unmapColumns(outRows, pipeline.columns);
        // console.log(remapped[0]);
        return remapped;
    });
    fluid.each(outs, function (rows, key) {
        var promise = hortis.writeExcel(rows, key, outputDir);
        promise.then(function (res) {
            console.log("Write of " + key + " yielded ",res);
        });
    });
    console.log("Total extracted rows: " + fluid.flatten(Object.values(outs)).length);
}, function (err) {
    console.log("Error ", err);
});
