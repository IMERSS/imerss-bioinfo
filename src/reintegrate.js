/* eslint-env node */

"use strict";

var fluid = require("infusion");
var fs = require("fs");
var JSON5 = require("json5");

require("./dataProcessing/readCSV.js");
require("./dataProcessing/readCSVwithMap.js");
require("./utils/settleStructure.js");

fluid.setLogging(true);

var hortis = fluid.registerNamespace("hortis");

var taxonResolveMap = hortis.readJSONSync("data/TaxonResolution-map.json", "reading taxon resolution map");
var swaps = hortis.readJSONSync("data/taxon-swaps.json5", "reading taxon swaps file");

hortis.copyCSVProps = function (props, target, source) {
    props.forEach(function (prop) {
        if (fluid.isValue(source[prop]) && source[prop] !== "") {
            target[prop] = source[prop];
        }
    });
};

hortis.alphabetise = function (hash) {
    var togo = {};
    var keys = Object.keys(hash).sort();
    keys.forEach(function (key) {
        togo[key] = hash[key];
    });
    return togo;
};

hortis.updateSwaps = function (data) {
    data.rows.forEach(function (row) {
        var iNatName = row.iNaturalistTaxonName;
        if (iNatName) {
            var existing = swaps[iNatName];
            if (!existing) {
                existing = {
                    taxonNames: {}
                };
                swaps[iNatName] = existing;
            }
            existing.iNaturalistTaxonId = row.iNaturalistTaxonId;
            var taxonNames = existing.taxonNames;

            if (row.commonName) {
                taxonNames[row.commonName] = {type: "commonName"};
            }
            var record = {};
            hortis.copyCSVProps(["resolvedBy", "notes", "oldiNaturalistTaxonId"], record, row);
            taxonNames[row.taxonName] = record;
        }
    });
    var alphaSwaps = hortis.alphabetise(swaps);
    fs.writeFileSync("updated-taxon-swaps.json5", JSON5.stringify(alphaSwaps, {
        space: 4,
        quote: "\""
    }));
};

hortis.bagatelle.csvReader({
    inputFile: process.argv[2] || "data/Valdes/Valdes Marine Dives Taxon Resolution.csv",
    mapColumns: taxonResolveMap.columns
}).completionPromise.then(hortis.updateSwaps);
