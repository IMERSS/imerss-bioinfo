/* eslint-env node */
"use strict";

// Write placeholder versions of the data files of a visualisation, e.g. a plant-pollinator (BBEA) or standard one - very short files of the
// same shape and format as the real ones, which a visualisation's driver names beside them, e.g. as obsPlaceholderFile, so that it can be
// rendered statically, e.g. by Infusion 6's hydrate.js, without loading its real data.
// The placeholder observations are the first few real ones, and the placeholder taxa are those they refer to, together
// with all their ancestors, so that every view of the page has something to render.
// Usage: node scripts/makePlaceholderData.js <obsFile> <taxaFile> <regionIndirectionFile> <outDir> [obsCount]

const fs = require("fs"),
    path = require("path"),
    pako = require("pako"),
    Papa = require("papaparse");

/**
 * Read a CSV file, either plain (".csv") or deflated (".viz")
 * @param {String} filename - The file to read
 * @return {Object} Papa Parse's results, with members `data` and `meta`
 */
const readCSV = function (filename) {
    const raw = fs.readFileSync(filename);
    const text = filename.endsWith(".viz") ? pako.inflate(raw, {to: "string"}) : raw.toString("utf8");
    return Papa.parse(text, {header: true, skipEmptyLines: true});
};

/**
 * Write rows as a CSV file in the same format as a source file - deflated if its name ends in ".viz"
 * @param {String} filename - The file to write
 * @param {String[]} fields - The columns, in order
 * @param {Object[]} rows - The rows
 */
const writeCSV = function (filename, fields, rows) {
    const text = Papa.unparse({fields, data: rows.map(row => fields.map(field => row[field]))}) + "\n";
    fs.mkdirSync(path.dirname(filename), {recursive: true});
    fs.writeFileSync(filename, filename.endsWith(".viz") ? pako.deflate(text) : text);
    console.log("Written " + rows.length + " rows to " + filename);
};

/**
 * Select the taxa referred to by a set of observations, together with all their ancestors, in their original order
 * @param {Object[]} taxa - The taxon rows, each with `id` and `parentId`
 * @param {Object[]} obs - The observation rows
 * @param {String[]} idFields - The columns of the observations holding taxon ids
 * @return {Object[]} The selected taxon rows
 */
const selectTaxa = function (taxa, obs, idFields) {
    const byId = new Map(taxa.map(row => [row.id, row]));
    const selected = new Set();
    obs.forEach(row => {
        idFields.map(field => row[field]).forEach(id => {
            let taxon = byId.get(id);
            while (taxon && !selected.has(taxon.id)) {
                selected.add(taxon.id);
                taxon = byId.get(taxon.parentId);
            }
        });
    });
    return taxa.filter(row => selected.has(row.id));
};

const main = function (args) {
    const [obsFile, taxaFile, regionFile, outDir, obsCountArg] = args;
    if (outDir === undefined) {
        console.error("Usage: node scripts/makePlaceholderData.js <obsFile> <taxaFile> <regionIndirectionFile> <outDir> [obsCount]");
        process.exitCode = 1;
    } else {
        const obsCount = Number(obsCountArg || 8);
        const obs = readCSV(obsFile);
        const taxa = readCSV(taxaFile);
        const regions = readCSV(regionFile);
        const someObs = obs.data.slice(0, obsCount);
        const outFile = file => path.join(outDir, path.basename(file));
        writeCSV(outFile(obsFile), obs.meta.fields, someObs);
        // The taxon ids of a BBEA visualisation's plants and pollinators, or of a standard one's observations
        const idFields = obs.meta.fields.filter(field => field.endsWith("INatId") || field === "iNaturalistTaxonId");
        writeCSV(outFile(taxaFile), taxa.meta.fields, selectTaxa(taxa.data, someObs, idFields));
        writeCSV(outFile(regionFile), regions.meta.fields, regions.data.slice(0, 3));
    }
};

main(process.argv.slice(2));
