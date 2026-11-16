/* eslint-env node */
"use strict";

// Test that each data set packed into a columnar data package by src/vizPack.js is read back by
// src/client/js/i6/vizPackage.js into exactly the rows which Papa Parse produced from its files, and report the sizes
// and times of each. Run from this checkout with
//     node test/i6/vizPackageRoundTrip.js [<table>=<file> ...]
// which by default tests the tables of each of the plant-pollinator atlases

const fs = require("fs"),
    os = require("os"),
    path = require("path");

const vizPack = require("../../src/vizPack.js"),
    viz = require("../../src/client/js/i6/vizPackage.js");

const datasets = {
    BCBA: "data/b-team/plant-pollinators-BCBA",
    OBA: "data/b-team/plant-pollinators-OBA-2025",
    WaBA: "data/b-team/plant-pollinators-WaBA-2026"
};

const tablesOf = prefix => ({
    obs: prefix + "-labels.viz",
    taxa: prefix + "-assigned-taxa.viz",
    regionIndirection: prefix + "-regionIndirection.csv"
});

const roundTrip = async function (name, tableFiles) {
    const output = path.join(os.tmpdir(), "vizPackageRoundTrip-" + name + ".viz");
    const result = vizPack.packFiles(output, tableFiles);
    let start = Date.now();
    const pkg = await viz.read(fs.readFileSync(output));
    const decodeTime = Date.now() - start;
    const failures = [];
    // Before its details are attached, a date column reads as its day alone
    Object.entries(pkg.tables).forEach(([table, vizTable]) => vizTable.fields.filter(field => vizTable.columns[field].encoding === "date32").forEach(field => {
        const column = vizTable.columns[field];
        for (let i = 0; i < vizTable.rowCount; ++i) {
            const text = column.getString(i);
            if (text !== "" && !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(text)) {
                failures.push(table + " row " + i + " field " + field + ": " + JSON.stringify(text) + " is not a day");
                break;
            }
        }
    }));
    if (result.details) {
        viz.attachDetails(pkg, await viz.read(fs.readFileSync(result.details.file)));
    }
    Object.entries(tableFiles).forEach(([table, file]) => {
        const expected = vizPack.readTable(file);
        start = Date.now();
        const rows = viz.toRows(pkg.tables[table]);
        const rowsTime = Date.now() - start;
        if (JSON.stringify(pkg.tables[table].fields) !== JSON.stringify(expected.fields)) {
            failures.push(table + ": fields differ");
        }
        if (rows.length !== expected.rows.length) {
            failures.push(table + ": " + rows.length + " rows against " + expected.rows.length);
        }
        for (let i = 0; i < expected.rows.length && failures.length < 10; ++i) {
            expected.fields.forEach(field => {
                const want = expected.rows[i][field] ?? "", got = rows[i][field];
                if (want !== got) {
                    failures.push(table + " row " + i + " field " + field + ": " + JSON.stringify(got) + " against " + JSON.stringify(want));
                }
            });
        }
        console.log("  " + table + ": rows materialised in " + rowsTime + " ms");
    });
    console.log(name + ": decoded in " + decodeTime + " ms\n" + vizPack.summarise(result));
    fs.unlinkSync(output);
    if (result.details) {
        fs.unlinkSync(result.details.file);
    }
    return failures;
};

const run = async function () {
    const args = process.argv.slice(2);
    const all = args.length > 0 ? {args: Object.fromEntries(args.map(arg => arg.split(/=(.*)/s)))} :
        Object.fromEntries(Object.entries(datasets).map(([name, prefix]) => [name, tablesOf(prefix)]));
    let failures = [];
    for (const [name, tableFiles] of Object.entries(all)) {
        failures = failures.concat((await roundTrip(name, tableFiles)).map(failure => name + ": " + failure));
    }
    if (failures.length === 0) {
        console.log("All rows round-tripped exactly");
    } else {
        console.log(failures.join("\n"));
        process.exitCode = 1;
    }
};

run();
