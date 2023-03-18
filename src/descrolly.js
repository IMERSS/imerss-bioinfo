/* eslint-env node */

"use strict";

const fluid = require("infusion");
const minimist = require("minimist");

fluid.require("%imerss-bioinfo");

require("./dataProcessing/readJSON.js");
require("./dataProcessing/writeJSON.js");
require("./dataProcessing/readCSV.js");
require("./dataProcessing/readCSVWithMap.js");

require("./iNaturalist/taxonAPI.js");

const hortis = fluid.registerNamespace("hortis");

fluid.setLogging(true);

const parsedArgs = minimist(process.argv.slice(2));

const inputFile = parsedArgs._[0] || "%imerss-bioinfo/data/Howe Sound/descrolly.json5";

const config = hortis.readJSONSync(fluid.module.resolvePath(inputFile));

const scrollyInput = hortis.readJSONSync(fluid.module.resolvePath(config.scrollyInput));

const taxaMap = hortis.readJSONSync(fluid.module.resolvePath(config.taxaMap));

hortis.descrolly = async function (config) {
    const source = hortis.iNatTaxonSource();

    await source.events.onCreate;

    const reintegrated = await hortis.csvReaderWithMap({
        inputFile: fluid.module.resolvePath(config.taxaInput),
        mapColumns: taxaMap.columns
    }).completionPromise;

    const reintById = {};

    reintegrated.rows.forEach(row => {
        reintById[row.iNaturalistTaxonId] = row;
    });

    const scrollyFeatures = {
        classes: {}
    };

    await hortis.asyncForEach(scrollyInput.MAP_LABEL, async function (label, index) {
        const taxaString = scrollyInput.taxa[index];
        const taxa = taxaString.split(",").map(fluid.trim);
        console.log("Found " + taxa.length + " taxa for key " + label);
        const byTaxonId = {};
        await hortis.asyncForEach(taxa, async function (taxonName) {
            const san = hortis.sanitizeSpeciesName(taxonName);
            const looked = await source.get({name: san});
            if (looked.doc) {
                const taxonId = looked.doc.id;
                const row = reintById[taxonId];
                if (!row) {
                    console.log("Looked up " + san + " to id " + taxonId + " but no row found in reintegrated");
                } else {
                    byTaxonId[taxonId] = true; // In a "proper" bucket this is a hash to obs Ids
                }
            } else {
                console.log("Failed to look up taxon " + san);
            }
            scrollyFeatures.classes[label] = {byTaxonId};
        });
    });

    hortis.writeJSONSync(fluid.module.resolvePath(config.scrollyFeatures), scrollyFeatures);
};

hortis.descrolly(config).catch(function (e) {
    console.log("Error applying descrolly ", e);
});
