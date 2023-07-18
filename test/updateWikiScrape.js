/* eslint-env node */

"use strict";

const fluid = require("infusion");

const hortis = fluid.registerNamespace("hortis");

require("../src/iNaturalist/taxonAPI.js");
require("../src/Wikipedia/wikipedia.js");

const source = hortis.iNatTaxonSource({
});

const wikiSource = hortis.wikipediaExtracts();

const upgradeScrape = async function () {
    const dbSource = source.byId.dbSource;
    const allKeys = await dbSource.list();
    console.log("Got " + allKeys.length + " keys");
    console.log("First key ", allKeys[0]);
    const keys = allKeys.slice(0, 5);
    hortis.asyncForEach(keys, async function (id) {
        const doc = await dbSource.get(id);
        console.log(doc);
        if (doc.doc.wikipedia_url) {
            const name = hortis.wikipediaExtracts.urlToTitle(doc.doc.wikipedia_url);
            const extract = await wikiSource.get({name: name});
            if (extract && extract.extract) {
                const oldLength = doc.doc?.wikipedia_summary?.length || 0;
                console.log("Replacing extract length " + oldLength + " with length " + extract.extract.length);
                console.log("New extract " + extract.extract);
                doc.doc.wikipedia_summary = extract.extract;
            } else {
                delete doc.doc.wikipedia_summary;
            }
        } else {
            delete doc.doc.wikipedia_summary;
        }
        // Fix corruption from broken round of taxon API
        doc.id = id;
//        await dbSource.set(id, doc);
    });
};

source.events.onCreate.then(upgradeScrape);

