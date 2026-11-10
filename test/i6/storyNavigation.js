/* eslint-env node */
"use strict";

// Test that the story page of a bioReportR project shows the pane named by its URL's hash from the outset - its tab
// and section are the first and only ones ever marked active, rather than the first pane's being rendered and then
// replaced. Then check that choosing a tab writes the pane into the hash, and that navigating back restores it.
// Run from the bagatelle checkout with
//     node test/i6/storyNavigation.js [<page>]
// where <page> is the path of the story page beneath the parent of this checkout - by default the development page
// of howe-sound-mapping-2026, whose material is written by its src/js/storyBuild.js

const infusion6 = require("../../src/infusion6.js");
const fs = require("fs"),
    path = require("path"),
    puppeteer = require("puppeteer");

const fluidDemoRunner = infusion6.requireTestSupport("tests/test-core/browser/js/demo-runner.js");

const root = path.resolve(__dirname, "../../..");
const pagePath = process.argv[2] || "howe-sound-mapping-2026/static/story/index-dev.html";

const failures = [];
const expect = function (condition, message) {
    if (!condition) {
        failures.push(message);
    }
};

// Installed before the page's own scripts - records each change of the active tab and pane, from the moment they appear
const recorder = `window.storyNavLog = {tabs: [], panes: []};
new MutationObserver(() => {
    const push = (list, value) => value && list[list.length - 1] !== value && list.push(value);
    push(window.storyNavLog.tabs, document.querySelector(".chevron-tab.active")?.textContent.trim());
    push(window.storyNavLog.panes, document.querySelector(".mxcw-storyPane.mxcw-activePane")?.dataset.pane);
}).observe(document, {subtree: true, childList: true, attributes: true, attributeFilter: ["class"]});`;

const main = async function () {
    const server = await fluidDemoRunner.startServer(root);
    const browser = await puppeteer.launch({headless: true, args: ["--no-sandbox"]});
    try {
        const base = `http://127.0.0.1:${server.address().port}/${pagePath}`;
        const errors = [];
        const open = async function (hash) {
            const page = await browser.newPage();
            page.on("pageerror", error => errors.push(error.message));
            await page.evaluateOnNewDocument(recorder);
            await page.goto(base + hash, {waitUntil: "domcontentloaded"});
            await page.waitForFunction(`document.querySelectorAll(".chevron-tab").length > 0 && !!document.querySelector(".mxcw-storyPane.mxcw-activePane .section")`,
                {timeout: 60000});
            return page;
        };
        // The panes of the story, in order, as written by storyBuild.js beside the page
        const panes = JSON.parse(fs.readFileSync(path.join(root, path.dirname(pagePath), "panes.json"), "utf8")).map(pane => pane.paneKey);
        for (const pane of panes.slice(1)) {
            const page = await open("#pane:" + pane);
            await new Promise(resolve => setTimeout(resolve, 2000));
            const log = await page.evaluate("window.storyNavLog");
            expect(JSON.stringify(log.panes) === JSON.stringify([pane]), `Booted with #pane:${pane}, only that pane was ever active - found ${JSON.stringify(log.panes)}`);
            expect(log.tabs.length === 1, `Booted with #pane:${pane}, only one tab was ever active - found ${JSON.stringify(log.tabs)}`);
            await page.close();
        }
        const page = await open("");
        const firstLog = await page.evaluate("window.storyNavLog");
        expect(firstLog.panes[0] === panes[0], "Booted without a hash, the first pane is active - found " + JSON.stringify(firstLog.panes));
        await page.click(".chevron-tab:nth-child(2)");
        await page.waitForFunction(`document.querySelector(".mxcw-storyPane.mxcw-activePane")?.dataset.pane === "${panes[1]}"`, {timeout: 5000})
            .catch(() => failures.push("Clicking the second tab shows the second pane"));
        const hash = await page.evaluate("location.hash");
        expect(hash === "#pane:" + panes[1], "Choosing a tab writes the pane into the URL's hash - found " + hash);
        await page.goBack();
        await page.waitForFunction(`document.querySelector(".mxcw-storyPane.mxcw-activePane")?.dataset.pane === "${panes[0]}"`, {timeout: 5000})
            .catch(() => failures.push("Navigating back restores the first pane"));
        expect(errors.length === 0, "No errors - found " + JSON.stringify(errors));
    } finally {
        await browser.close();
        server.close();
    }
    if (failures.length === 0) {
        console.log("storyNavigation PASS");
    } else {
        console.log("storyNavigation FAIL:\n  " + failures.join("\n  "));
        process.exitCode = 1;
    }
};

main().catch(error => {
    console.error("storyNavigation FAIL: ", error);
    process.exitCode = 1;
});
