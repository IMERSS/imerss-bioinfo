/* eslint-env node */
"use strict";

// Write the placeholder of a variant of the visualisation into its Single File Component - a minimal columnar data
// package, representative of the data the variant needs in order to instantiate and render the majority of its content,
// for test fixtures and authoring tools. Each variant names its placeholder as the default of its vizFile, as
// placeholder://{layerName}/viz, which a page that is a runnable application overrides with its real data - see
// FLUID-7032 (https://github.com/fluid-project/infusion-6/issues/32). The package, being binary, is held in the SFC as
// a <placeholder> block encoded in base64, written by Infusion 6's src/framework/server/inlinePlaceholder.js.
//
// Run from this checkout with
//     node src/inlineVizPlaceholders.js <layerName> <package.viz> [-n]
// e.g.
//     node src/inlineVizPlaceholders.js hortis.beaVizLoader placeholder.viz
// where the package is written as any other, e.g. by src/vizPack.js from CSV files of a few rows. It must hold the
// tables obs and taxa, and be self-contained - holding no details in a file beside it, since a placeholder is fetched
// through a Blob URL, beside which there is nothing. With -n, it reports what it would write, writing nothing.

const fs = require("fs"),
    path = require("path");

const infusion6 = require("./locateInfusion6.js");
const viz = require("./client/js/i6/vizPackage.js");

const inlineVizPlaceholders = {};

// The Single File Component holding the placeholder of each variant of the visualisation
inlineVizPlaceholders.sfcs = {
    "hortis.beaVizLoader": "src/client/sfc/bbea/hortis-beaVizLoader.vue",
    "hortis.standardVizLoader": "src/client/sfc/core/hortis-standardVizLoader.vue",
    "hortis.blitzVizLoader": "src/client/sfc/core/hortis-blitzVizLoader.vue"
};

// The name of the placeholder within each SFC, as named by placeholder://{layerName}/viz
inlineVizPlaceholders.name = "viz";

/**
 * Check that a package may serve as a placeholder - it is readable, holds the tables obs and taxa, and has no details
 * @param {String} file - The path of the package
 * @return {Promise<String[]>} A promise for a description of each problem found, empty if there is none
 */
inlineVizPlaceholders.check = async function (file) {
    const bytes = fs.readFileSync(file);
    const problems = [];
    try {
        const pkg = await viz.read(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
        ["obs", "taxa"].forEach(table => {
            if (!pkg.tables[table]) {
                problems.push(`it holds no table "${table}"`);
            }
        });
        if (pkg.header.details) {
            problems.push(`it holds details in ${pkg.header.details.file}, beside which a placeholder has nothing - write it without them`);
        }
    } catch (e) {
        problems.push("it can't be read as a columnar data package - " + e.message);
    }
    return problems;
};

/**
 * Write the placeholder of a variant of the visualisation into its SFC
 * @param {String} layerName - The name of the variant's layer, e.g. "hortis.beaVizLoader"
 * @param {String} file - The path of the package
 * @param {Boolean} dryRun - `true` if nothing is to be written
 * @return {Promise<Boolean>} A promise for `true` if the placeholder was written, or would be by a dry run
 */
inlineVizPlaceholders.run = async function (layerName, file, dryRun) {
    const sfc = inlineVizPlaceholders.sfcs[layerName];
    let togo = false;
    if (!sfc) {
        console.error(`Unknown variant ${layerName} - expected one of ${Object.keys(inlineVizPlaceholders.sfcs).join(", ")}`);
    } else {
        const problems = await inlineVizPlaceholders.check(file);
        if (problems.length > 0) {
            console.error(`${file} can't serve as the placeholder of ${layerName}: ` + problems.join("; "));
        } else {
            const inlinePlaceholder = require(path.join(infusion6.dir(), "src/framework/server/inlinePlaceholder.js"));
            inlinePlaceholder.run({
                sfc: path.join(infusion6.projectDir, sfc),
                name: inlineVizPlaceholders.name,
                file,
                type: "application/octet-stream",
                encoding: "base64",
                dryRun
            });
            togo = true;
        }
    }
    return togo;
};

module.exports = inlineVizPlaceholders;

if (require.main === module) {
    const args = process.argv.slice(2);
    const dryRun = args.includes("-n");
    const [layerName, file] = args.filter(arg => arg !== "-n");
    if (!layerName || !file) {
        console.error("Usage: node src/inlineVizPlaceholders.js <layerName> <package.viz> [-n]");
        process.exitCode = 1;
    } else {
        inlineVizPlaceholders.run(layerName, file, dryRun).then(written => {
            if (!written) {
                process.exitCode = 1;
            }
        });
    }
}
