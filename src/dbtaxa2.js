/* eslint-env node */

"use strict";

const fluid = require("infusion");
const fs = require("fs");

require("./dataProcessing/readJSON.js");
require("./iNaturalist/taxonAPI.js");

const glob = require("glob");

const taxonAPIFileBase = "data/iNaturalist/taxonAPI";

const hortis = fluid.registerNamespace("hortis");

const taxonAPIs = hortis.iNatTaxonAPI.dbTaxonAPIs();
taxonAPIs.events.onCreate.then((function (taxonAPIs) {
    return traverseDB(taxonAPIs.byId, taxonAPIs.db);
}), function (err) {
    console.log("Got error instantiating APIs ", err);
});

const now = Date.now();

const dataFiles = glob.sync(taxonAPIFileBase + "/*.json");

console.log("Found " + dataFiles.length + " taxon files in " + (Date.now() - now) + "ms");

hortis.idFromFilename = function (filename) {
    const lastslash = filename.lastIndexOf("/");
    const lastdot = filename.lastIndexOf(".");
    return filename.substring(lastslash + 1, lastdot);
};

async function traverseDB(source, db) {

    console.log("Beginning insert");
    const beforeWrite = Date.now();

    const writeAll = async function (dataFiles) {
        await db.beginTransaction();
        for (let i = 0; i < dataFiles.length; ++i) {
            const dataFile = dataFiles[i];
            const contents = hortis.readJSONSync(dataFile);
            const stats = fs.statSync(dataFile);
            const fetched_at = stats.mtime.toISOString();
            await source.set({id: contents.id}, {
                id: contents.id,
                fetched_at: fetched_at,
                doc: contents
            });
            if (i % 1000 === 0) {
                process.stdout.write(i + " ... ");
            }
        }
        await db.endTransaction();
    };

    try {
        await writeAll(dataFiles);
    } catch (err) {
        console.log("Error writing files ", err);
        throw err;
    }

    console.log("\nWritten " + dataFiles.length + " taxon files in " + (Date.now() - beforeWrite) + "ms");

    const allIds = await source.list();

    console.log("Got " + allIds.length + " ids: ", allIds[0]);

    const beforeRead = Date.now();

    const readAll = async function () {
        let index = 0;
        let first = true;
        for (const {id: key} of allIds) {

            if (index % 100 === 0) {
                process.stdout.write("\"" + key + "\" ");
            }
            const row = await source.get({id: key});
            const doc = row.doc;
            if (first) {
                console.log("First doc: ", doc);
                first = false;
            }
            ++index;
        }
    };

    await readAll();
    console.log("\nRead " + allIds.length + " taxon files in " + (Date.now() - beforeRead) + "ms");

}
