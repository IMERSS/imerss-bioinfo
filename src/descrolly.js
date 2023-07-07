/* eslint-env node */

"use strict";

const fluid = require("infusion");
const minimist = require("minimist");

fluid.require("%imerss-bioinfo");

require("./dataProcessing/readJSON.js");
require("./dataProcessing/writeJSON.js");
require("./dataProcessing/readCSV.js");
require("./dataProcessing/readCSVWithMap.js");
require("./client/js/colour.js");

require("./iNaturalist/taxonAPI.js");

const hortis = fluid.registerNamespace("hortis");

fluid.setLogging(true);

const parsedArgs = minimist(process.argv.slice(2));

const inputFile = parsedArgs._[0] || "%imerss-bioinfo/data/Howe Sound/descrolly.json5";

const config = hortis.readJSONSync(fluid.module.resolvePath(inputFile));
let scrollyInput, scrollyStatusInput;

if (config.scrollyInput) {
    scrollyInput = hortis.readJSONSync(fluid.module.resolvePath(config.scrollyInput));
} else if (config.scrollyStatusInput) {
    scrollyStatusInput = hortis.readJSONSync(fluid.module.resolvePath(config.scrollyStatusInput));
}

const taxaMap = hortis.readJSONSync(fluid.module.resolvePath(config.taxaMap));

const swaps = hortis.readJSONSync("data/taxon-swaps.json5", "reading taxon swaps file");
const invertedSwaps = hortis.invertSwaps(swaps);

const applySwaps = true;

hortis.applyTaxaForKey = async function (that, taxaString, label, container, col) {
    const {scrollyFeatures, source, reintById} = that;
    const taxa = taxaString.split(",").map(fluid.trim);
    console.log("Found " + taxa.length + " taxa for key " + label);
    const byTaxonId = {};
    await hortis.asyncForEach(taxa, async function (taxonName) {
        const san = hortis.sanitizeSpeciesName(taxonName);
        // Copied from taxonomise.js hortis.applyObservations
        const invertedId = applySwaps ? invertedSwaps[san] : null;
        const looked = invertedId && await source.get({id: invertedId}) || await source.get({name: san});
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
        if (col) {
            const fillColor = fluid.colour.hexToArray(col);
            scrollyFeatures[container][label] = {byTaxonId, fillColor};
        } else {
            scrollyFeatures[container][label] = {byTaxonId};
        }
    });
    console.log("Deduplicated to " + Object.keys(byTaxonId).length + " taxa for key " + label);
};

hortis.appendTaxa = function (target, key, taxa) {
    let existing = target[key];
    existing = existing ? existing += ", " + taxa : taxa;
    target[key] = existing;
};

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
        classes: {},
        communities: {}
    };
    const that = {scrollyFeatures, source, reintById};

    if (scrollyInput) {
        await hortis.asyncEach(scrollyInput.taxa, async function (taxaString, label) {
            const col = fluid.getImmediate(scrollyInput, ["palette", label]);
            await hortis.applyTaxaForKey(that, taxaString, label, "communities", col);
        });
    } else if (scrollyStatusInput) { // Two-level Bioblitz "Status" file
        const byStatus = {};
        const byCell = {};
        await hortis.asyncEach(scrollyStatusInput.taxa, async function (record, status) {
            await hortis.asyncEach(record, async function (taxa, cell_id) {
                const key = status + "|" + cell_id;
                await hortis.applyTaxaForKey(that, taxa, key, "communities");
                hortis.appendTaxa(byStatus, status, taxa);
                hortis.appendTaxa(byCell, cell_id, taxa);
            });
        });
        await hortis.asyncEach(byStatus, async function (taxaString, status) {
            await hortis.applyTaxaForKey(that, taxaString, status, "communities");
        });
        await hortis.asyncEach(byCell, async function (taxaString, cell_id) {
            await hortis.applyTaxaForKey(that, taxaString, cell_id, "communities");
        });
        scrollyFeatures.classes = fluid.transform(scrollyStatusInput.palette, function (col) {
            return {fillColor: fluid.colour.hexToArray(col)};
        });
    }

    hortis.writeJSONSync(fluid.module.resolvePath(config.scrollyFeatures), scrollyFeatures);
};

hortis.descrolly(config).catch(function (e) {
    console.log("Error applying descrolly ", e);
});
