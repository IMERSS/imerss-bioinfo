/* eslint-env node */
"use strict";

// Migrate the driver of a visualisation from its separate data files - obsFile, taxaFile and regionIndirectionFile,
// each of CSV or the deflated CSV of the earlier ".viz" form, with their placeholders - to the columnar data package
// read by hortis.dataLoader, named by vizFile and vizPlaceholderFile. See notes/columnar-data-package.md.
//
// Run as
//     node src/migrateVizDriver.js [-n] <driver.html> [<driver.html> ...]
// For each driver, which is an HTML page holding a fluid.def configuring the files, or a Single File Component or
// script doing the same, it packs the files into one package beside the observations, and the placeholders into
// another beside theirs, each named by what the names of its observation and taxon files have in common, e.g.
// "plant-pollinators-BCBA.viz" for "plant-pollinators-BCBA-labels.viz" and "plant-pollinators-BCBA-assigned-taxa.viz",
// and rewrites the driver's six members as the two naming the packages. With -n it reports what it would do, writing
// nothing. It leaves the superseded files in place, listing them, so that they can be removed once the migrated
// driver has been checked.

const fs = require("fs"),
    path = require("path");

const vizPack = require("./vizPack.js");

const migrate = {};

// The members of a driver naming the files of each table, and those naming their placeholders
migrate.tables = {
    obs: {file: "obsFile", placeholder: "obsPlaceholderFile"},
    taxa: {file: "taxaFile", placeholder: "taxaPlaceholderFile"},
    regionIndirection: {file: "regionIndirectionFile", placeholder: "regionIndirectionPlaceholderFile"}
};

/**
 * Find the members of a driver naming its files, as written in its source - each a member name, a colon and a quoted
 * string, on a line of its own.
 * @param {String} source - The driver's source
 * @return {Object<String, Object>} Map of member name to its `value` and `line`, the whole text of its line
 */
migrate.findMembers = function (source) {
    const togo = {};
    const regex = /^([ \t]*)([A-Za-z]+(?:File|PlaceholderFile)):\s*(["'`])(.*?)\3\s*,?[ \t]*\r?\n/gm;
    let match;
    while ((match = regex.exec(source)) !== null) {
        togo[match[2]] = {value: match[4], line: match[0], indent: match[1]};
    }
    return togo;
};

/**
 * Name a package by what the names of its observation and taxon files have in common.
 * @param {String} obsFile - The path of the observation file
 * @param {String} taxaFile - The path of the taxon file
 * @return {String} The path of the package, in the directory of the observation file
 */
migrate.packageName = function (obsFile, taxaFile) {
    const a = path.basename(obsFile), b = path.basename(taxaFile);
    let i = 0;
    while (i < a.length && i < b.length && a[i] === b[i]) {
        ++i;
    }
    const stem = a.substring(0, i).replace(/[-_. ]+$/, "") || "data";
    return path.join(path.dirname(obsFile), stem + ".viz");
};

/**
 * Plan the packages of one driver, from either its files or their placeholders.
 * @param {Object<String, Object>} members - The driver's members, as found by migrate.findMembers
 * @param {String} kind - "file" or "placeholder"
 * @return {Object|null} Members `tables`, map of table name to its path as written in the driver, and `output`, the
 * package's path as it will be written there - or `null` if the driver names no observation file of this kind
 */
migrate.plan = function (members, kind) {
    const tables = {};
    Object.entries(migrate.tables).forEach(([table, names]) => {
        const member = members[names[kind]];
        if (member) {
            tables[table] = member.value;
        }
    });
    return tables.obs && tables.taxa ? {tables, output: migrate.packageName(tables.obs, tables.taxa).split(path.sep).join("/")} : null;
};

/**
 * Migrate one driver.
 * @param {String} driver - The path of the driver
 * @param {Boolean} dryRun - `true` if nothing is to be written
 * @return {String[]} The superseded files, as paths relative to the working directory
 */
migrate.driver = function (driver, dryRun) {
    const source = fs.readFileSync(driver, "utf8");
    const members = migrate.findMembers(source);
    const base = path.dirname(driver);
    const real = migrate.plan(members, "file"), placeholder = migrate.plan(members, "placeholder");
    let superseded = [];
    if (real) {
        const packed = {};
        [real, placeholder].filter(plan => plan).forEach(plan => {
            const spec = JSON.stringify(plan.tables);
            if (!packed[spec]) {
                console.log("  " + (dryRun ? "Would pack " : "Packing ") + path.join(base, plan.output));
                Object.entries(plan.tables).forEach(([table, file]) => console.log("    " + table + ": " + file));
                if (!dryRun) {
                    console.log(vizPack.summarise(vizPack.packSpec(plan, base)).replace(/^/gm, "    "));
                }
                packed[spec] = plan.output;
                superseded = superseded.concat(Object.values(plan.tables).map(file => path.join(base, file)));
            }
            plan.output = packed[spec];
        });
        // Replace the first of the members by the two naming the packages, and remove the rest
        let first = true, rewritten = source;
        Object.values(migrate.tables).forEach(names => [names.file, names.placeholder].forEach(name => {
            const member = members[name];
            if (member) {
                let replacement = "";
                if (first) {
                    replacement = member.indent + "vizFile: \"" + real.output + "\",\n";
                    if (placeholder) {
                        replacement += member.indent + "vizPlaceholderFile: \"" + placeholder.output + "\",\n";
                    }
                    first = false;
                }
                rewritten = rewritten.replace(member.line, replacement);
            }
        }));
        console.log("  " + (dryRun ? "Would rewrite " : "Rewriting ") + driver);
        if (!dryRun) {
            fs.writeFileSync(driver, rewritten);
        }
    } else {
        console.log("  " + driver + " names no observation and taxon files - passed over");
    }
    return [...new Set(superseded)];
};

if (require.main === module) {
    const args = process.argv.slice(2);
    const dryRun = args[0] === "-n";
    const drivers = dryRun ? args.slice(1) : args;
    let superseded = [];
    drivers.forEach(driver => {
        console.log(driver + ":");
        superseded = superseded.concat(migrate.driver(driver, dryRun));
    });
    if (superseded.length > 0) {
        console.log("Files superseded by the packages, which may be removed once the drivers are checked:\n  "
            + [...new Set(superseded)].join("\n  "));
    }
}

module.exports = migrate;
