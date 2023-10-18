/* eslint-env node */
"use strict";

const fluid = require("infusion");
const axios = require("axios");

fluid.require("%imerss-bioinfo");

require("./dataProcessing/readJSON.js");
require("./dataProcessing/writeCSV.js");
require("./iNaturalist/taxonAPI.js");

const hortis = fluid.registerNamespace("hortis");

// Examine the training data of iNaturalist's "geomodels" to find which represent Hymenoptera

const train = hortis.readJSONSync(fluid.module.resolvePath("%imerss-bioinfo/data/iNaturalist/geo/geo_prior_train_meta.json"));

// Function to chunk an array into smaller arrays of given size
hortis.chunkArray = function (array, size) {
    const chunkedArr = [];
    for (let i = 0; i < array.length; i += size) {
        chunkedArr.push(array.slice(i, i + size));
    }
    return chunkedArr;
};

hortis.delay = async function (delay) {
    const togo = fluid.promise();
    setTimeout(togo.resolve, delay);
    return togo;
};

// Function to make API requests and collate responses into a flat array
hortis.fetchTaxaData = async function (records, processResponse) {
    const chunkedIds = hortis.chunkArray(records.map(record => record.taxon_id), 30);
    const responses = [];

    return hortis.asyncForEach(chunkedIds, async (ids, index) => {
        if (index >= 140) {
            console.log(`Fetching chunk ${index}/${chunkedIds.length}`);
            const apiUrl = `https://api.inaturalist.org/v1/taxa/${ids.join(",")}`;
            try {
                const response = await axios.get(apiUrl);
                processResponse(response.data.results);
            } catch (error) {
                console.error(`Error fetching data: ${error.message}`);
                process.exit(1);
            }
            await hortis.delay(1000);
        }
    });

    return responses;
};

hortis.filterBeas = function (beas, results) {
    let added = 0;
    results.forEach(function (result) {
        if (result.ancestor_ids.includes(47201)) { // Hymenoptera
            beas.push({id: result.id, name: result.name, ancestry: result.ancestry});
            ++added;
        }
    });
    if (added > 0) {
        console.log(`Added ${added} BBEAS`);
    }
};

hortis.findGeoBeas = async function () {
    const beas = [];

    await hortis.fetchTaxaData(train, results => hortis.filterBeas(beas, results));
    hortis.writeCSV(fluid.module.resolvePath("geobeas.csv"), Object.keys(beas[0]), beas, fluid.promise());
};

hortis.findGeoBeas().then();
