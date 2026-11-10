/* eslint-env node */
"use strict";

// Locate Infusion 6 for the scripts and tests of this checkout. It is resolved from npm, as the package infusion-6
// installed into node_modules, unless this checkout holds a moduleOverrides.json5 - an array of {moduleName, baseDir},
// with each baseDir relative to the file - whose entry for "infusion-6" names a checkout of Infusion 6 to be used in
// its place, e.g. a sibling checkout during development of Infusion itself. This is the convention of Infusion 6's own
// tools - see its bin/boot.js.

const fs = require("fs"),
    path = require("path");

const infusion6 = {};

// The directory holding this checkout's package.json
infusion6.projectDir = path.resolve(__dirname, "..");

infusion6.overridesFile = path.join(infusion6.projectDir, "moduleOverrides.json5");

/**
 * Read the overrides of the modules of this checkout, if it has any
 * @return {Object[]} The entries of its moduleOverrides.json5, each with members `moduleName` and `baseDir` - the
 * latter resolved to an absolute path - or an empty array if it has none
 */
infusion6.readOverrides = function () {
    let togo = [];
    if (fs.existsSync(infusion6.overridesFile)) {
        const JSON5 = require("json5");
        togo = JSON5.parse(fs.readFileSync(infusion6.overridesFile, "utf8")).map(entry => ({
            moduleName: entry.moduleName,
            baseDir: path.resolve(path.dirname(infusion6.overridesFile), entry.baseDir)
        }));
    }
    return togo;
};

/**
 * Find the directory of Infusion 6 - that named for "infusion-6" by this checkout's moduleOverrides.json5, or else
 * that of the package installed by npm
 * @return {String} The absolute path of Infusion 6's directory
 */
infusion6.dir = function () {
    const override = infusion6.readOverrides().find(entry => entry.moduleName === "infusion-6");
    return override ? override.baseDir : path.dirname(require.resolve("infusion-6/package.json", {paths: [infusion6.projectDir]}));
};

/**
 * Resolve a path within Infusion 6's directory
 * @param {String} relPath - The path within Infusion 6, e.g. "src/framework/server/copyOut.js"
 * @return {String} The absolute path
 */
infusion6.resolve = function (relPath) {
    return path.join(infusion6.dir(), relPath);
};

/**
 * Require a module of Infusion 6's test support, such as its demo runner, ensuring first that puppeteer finds the
 * browser it downloaded on installation into this checkout - see .puppeteerrc.cjs
 * @param {String} relPath - The path of the module within Infusion 6
 * @return {any} The module's exports
 */
infusion6.requireTestSupport = function (relPath) {
    if (!process.env.PUPPETEER_CACHE_DIR) {
        process.env.PUPPETEER_CACHE_DIR = path.join(infusion6.projectDir, "node_modules", ".cache", "puppeteer");
    }
    return require(infusion6.resolve(relPath));
};

module.exports = infusion6;
