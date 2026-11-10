/* eslint-env node */
"use strict";

const path = require("path");

// Keep the captive browser downloaded by puppeteer within the checkout so that browser tests are self-contained - read
// also by src/infusion6.js, so that Infusion 6's test support, which otherwise looks within Infusion 6, finds it
module.exports = {
    cacheDirectory: path.join(__dirname, "node_modules", ".cache", "puppeteer")
};
