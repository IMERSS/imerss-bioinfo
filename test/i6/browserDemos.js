/* eslint-env node */
"use strict";

// Run the declarative demo scripts of the visualisations ported to Infusion 6, held in test/i6/browser/*.json, against
// their pages served from this checkout, delivering real mouse and keyboard input to a headless browser. Run from this
// checkout with
//     npm run test:browser
// or
//     node test/i6/browserDemos.js [--headful] [--console] [--timeout=ms] [--settle=ms] [--screenshots=dir] [script.json ...]
// The scripts are those of Infusion 6's demo runner, tests/test-core/browser/js/demo-runner.js, whose format is
// documented in its in-page agent, demo-agent.js - each names a page, the expectations under which it is `ready`, and a
// sequence of `steps`, each an `action` followed by expectations which must come to pass. This driver reuses that
// runner, serving this checkout rather than Infusion's, and extends it with
//  - the actions "press" - pressing a `key`, e.g. "Tab", "Shift+Tab" or "ArrowRight", `times` times, default 1 - "type",
//    clicking a `target` and typing `text` into it, having first cleared it if `clear` is `true`, "focus", focusing a
//    `target` directly as a starting point for keyboard navigation, and "none", which only waits for the step's
//    expectations
//  - the expectations of test/i6/browser/js/demoAgentExtensions.js, reading numbers from the page and comparing them
//    with those read by earlier steps, and checking the state of checkboxes, inputs and the focus.
// The browser is that downloaded by puppeteer on installation, unless PUPPETEER_EXECUTABLE_PATH names another - e.g. a
// chrome-headless-shell, where puppeteer's own browser fails to launch. Infusion 6 is that installed by npm, or the
// checkout named for it by moduleOverrides.json5 - see src/locateInfusion6.js.

const fs = require("fs"),
    os = require("os"),
    path = require("path"),
    minimist = require("minimist");

const infusion6 = require("../../src/locateInfusion6.js");

const fluidDemoRunner = infusion6.requireTestSupport("tests/test-core/browser/js/demo-runner.js");

const bagatelleDemos = {};

bagatelleDemos.root = path.resolve(__dirname, "../..");

bagatelleDemos.scriptDir = path.join(__dirname, "browser");

/**
 * Write the in-page agent - Infusion 6's agent followed by this checkout's extensions to it - to a single file, which
 * the runner injects into each page in place of its own.
 * @param {String} dir - The directory into which the file is written
 * @return {String} The path of the file
 */
bagatelleDemos.writeAgent = function (dir) {
    const agentPath = path.join(dir, "bagatelle-demo-agent.js");
    const base = fs.readFileSync(fluidDemoRunner.agentPath, "utf8");
    const extensions = fs.readFileSync(path.join(bagatelleDemos.scriptDir, "js", "demoAgentExtensions.js"), "utf8");
    fs.writeFileSync(agentPath, base + "\n" + extensions);
    return agentPath;
};

bagatelleDemos.basePerformAction = fluidDemoRunner.performAction;

/**
 * Perform a step's action in the page by delivering native input, extending the actions of Infusion 6's runner with
 * "press", "type", "focus" and "none" - see the head of this file.
 * @param {Page} page - The puppeteer page
 * @param {Object} action - The action
 * @return {Promise} A promise which resolves once the input has been delivered
 */
bagatelleDemos.performAction = async function (page, action) {
    if (action.type === "press") {
        const keys = action.key.split("+");
        const key = keys.pop();
        for (let i = 0; i < (action.times ?? 1); ++i) {
            for (const modifier of keys) {
                await page.keyboard.down(modifier);
            }
            await page.keyboard.press(key);
            for (const modifier of keys.slice().reverse()) {
                await page.keyboard.up(modifier);
            }
        }
    } else if (action.type === "type") {
        const point = await fluidDemoRunner.pointFor(page, action.target);
        await page.mouse.click(point.x, point.y);
        if (action.clear) {
            await page.evaluate(target => {
                const element = window.fluidDemoAgent.locate(target);
                element.select();
            }, action.target);
            await page.keyboard.press("Backspace");
        }
        await page.keyboard.type(action.text, {delay: 20});
    } else if (action.type === "focus") {
        await page.evaluate(target => window.fluidDemoAgent.locate(target).focus(), action.target);
    } else if (action.type === "none") {
        await Promise.resolve();
    } else {
        await bagatelleDemos.basePerformAction(page, action);
    }
};

/**
 * Run a list of demo scripts in turn against this checkout, and set the process's exit code to reflect their
 * aggregate result.
 * @param {String[]} scriptPaths - Paths of the JSON demo scripts to run
 * @param {Object} options - Options as accepted by Infusion 6's `fluidDemoRunner.runScript`
 * @return {Promise} A promise which resolves once all scripts have run
 */
bagatelleDemos.runScripts = async function (scriptPaths, options) {
    fs.mkdirSync(options.screenshots, {recursive: true});
    fluidDemoRunner.agentPath = bagatelleDemos.writeAgent(options.screenshots);
    fluidDemoRunner.performAction = bagatelleDemos.performAction;
    const server = await fluidDemoRunner.startServer(bagatelleDemos.root);
    const baseUrl = `http://127.0.0.1:${server.address().port}/`;
    const totals = {passed: 0, failed: 0, known: 0};
    try {
        for (const scriptPath of scriptPaths) {
            const tally = await fluidDemoRunner.runScript(scriptPath, baseUrl, options);
            totals.passed += tally.passed;
            totals.failed += tally.failed;
            totals.known += tally.known;
        }
    } finally {
        server.close();
    }
    console.log(`# ${totals.passed} steps passed, ${totals.failed} failed, ${totals.known} failed with known issues`);
    process.exitCode = totals.failed === 0 ? 0 : 1;
};

const argv = minimist(process.argv.slice(2), {boolean: ["headful", "console"]});
const scriptPaths = argv._.length > 0 ? argv._ : fs.readdirSync(bagatelleDemos.scriptDir)
    .filter(name => name.endsWith(".json")).sort().map(name => path.join(bagatelleDemos.scriptDir, name));

bagatelleDemos.runScripts(scriptPaths, {
    headful: argv.headful,
    console: argv.console,
    timeout: Number(argv.timeout ?? 30000),
    settle: Number(argv.settle ?? 500),
    screenshots: argv.screenshots ?? path.join(os.tmpdir(), "bagatelle-demo-screenshots")
});
