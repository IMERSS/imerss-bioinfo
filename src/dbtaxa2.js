/* eslint-env node */

"use strict";

const fluid = require("infusion");
const fs = require("fs");
const sqlite3 = require("sqlite3");
const sqlite = require("sqlite");

require("./dataProcessing/readJSON.js");
require("./iNaturalist/taxonAPI.js");

const glob = require("glob");

const taxonAPIFileBase = "data/iNaturalist/taxonAPI";

const hortis = fluid.registerNamespace("hortis");

const path = fluid.module.resolvePath("%bagatelle/data/iNaturalist/taxa.db/taxa.db");

sqlite.open({
    filename: path,
    driver: sqlite3.Database
}).then(async function (db) {
    console.log("Got db ", db);
    await db.run("CREATE TABLE IF NOT EXISTS iNatTaxaId (id INTEGER PRIMARY KEY, fetched_at TEXT, doc TEXT)");
    await traverseDB(db);
}).catch(function (err) {
    console.log("Error opening database " + err);
});

const now = Date.now();

const dataFiles = glob.sync(taxonAPIFileBase + "/*.json");

console.log("Found " + dataFiles.length + " taxon files in " + (Date.now() - now) + "ms");

hortis.idFromFilename = function (filename) {
    const lastslash = filename.lastIndexOf("/");
    const lastdot = filename.lastIndexOf(".");
    return filename.substring(lastslash + 1, lastdot);
};

async function traverseDB(db) {

    console.log("Beginning insert");
    const beforeWrite = Date.now();

    const writeAll = async function (dataFiles) {
        await db.run("BEGIN");
        for (let i = 0; i < dataFiles.length; ++i) {
            const dataFile = dataFiles[i];
            const contents = hortis.readJSONSync(dataFile);
            const stats = fs.statSync(dataFile);
            const fetched_at = stats.mtime.toISOString();
            await db.run("INSERT OR REPLACE INTO iNatTaxaId (id, fetched_at, doc) VALUES ($id, $fetched_at, $doc)", {
                $id: contents.id,
                $fetched_at: fetched_at,
                $doc: JSON.stringify(contents)
            });
            if (i % 1000 === 0) {
                process.stdout.write(i + " ... ");
            }
        }
        await db.run("COMMIT");
    };

    // await writeAll(dataFiles);

    console.log("\nWritten " + dataFiles.length + " taxon files in " + (Date.now() - beforeWrite) + "ms");

    const allIds = await db.all("SELECT id from iNatTaxaId");

    console.log("Got " + allIds.length + " ids: ", allIds[0]);

    const readAll = async function () {
        let index = 0;
        let first = true;
        for (const {id: key} of allIds) {

            if (index % 100 === 0) {
                process.stdout.write("\"" + key + "\" ");
            }
            const row = await db.get("SELECT id, fetched_at, doc from iNatTaxaId WHERE id = ?", key);
            const doc = JSON.parse(row.doc);
            if (first) {
                console.log("First doc: ", doc);
                first = false;
            }
            ++index;
        }
    };

    await readAll();
}

// traverseDB();
