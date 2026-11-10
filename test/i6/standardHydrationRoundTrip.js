/* eslint-env node */
"use strict";

// Test that the pages of the standard visualisation - indexBlitz.html, of the Galiano BioBlitz 2023, and
// indexDiatoms.html, of the diatoms of the Salish Sea - render identically whether booted in the browser from their
// minimal, dehydrated forms or from the forms written for them by Infusion 6's hydrate.js. See
// bbeaHydrationRoundTrip.js, whose assumptions this shares. Run from this checkout with
//     node test/i6/standardHydrationRoundTrip.js
// Also checks, in the Blitz page booted from its minimal form, that its tabs, record status buttons and checklist
// filter the observations.
// The pages may instead be those of another directory served to the browser, e.g. those built into docs by build.js,
// given as
//     node test/i6/standardHydrationRoundTrip.js <root> <Name>=<page> [<Name>=<page>]
// where <root> is the directory served, <Name> is Blitz or Diatoms and <page> the path of its page within <root> -
// the Blitz page is then not driven

const infusion6 = require("../../src/infusion6.js");
const path = require("path"),
    linkedom = require("linkedom"),
    puppeteer = require("puppeteer");

const fluidHydrationRoundTrip = infusion6.requireTestSupport("tests/test-core/browser/js/hydration-roundtrip.js"),
    fluidDemoRunner = infusion6.requireTestSupport("tests/test-core/browser/js/demo-runner.js");

const root = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(__dirname, "../..");

// Pages given on the command line, by name, in place of those of this checkout
const pageArgs = Object.fromEntries(process.argv.slice(3).map(arg => arg.split("=")));

const failures = [];
const expect = function (condition, message) {
    if (!condition) {
        failures.push(message);
    }
};

const reporterText = `(document.querySelector(".imerss-record-reporter")?.textContent || "").replace(/\\s+/g, " ").trim()`;

const pages = [{
    name: "Blitz",
    page: "indexBlitz.html",
    allRows: "555",
    checks: document => {
        expect(document.querySelectorAll(".imerss-checklist-decoration").length > 0, "Blitz checklist rows decorated by reporting status");
        expect(!!document.querySelector(".imerss-blitz-records button.imerss-records-confirmed"), "Blitz record status buttons rendered");
    }
}, {
    name: "Diatoms",
    page: "indexDiatoms.html",
    allRows: "4,803",
    checks: document => {
        expect(!document.querySelector(".imerss-blitz-records"), "Diatoms page has no record status buttons");
    }
}];

const snapshot = `(() => {
    const clone = document.querySelector("[fluid-layers]").cloneNode(true);
    clone.querySelectorAll(".imerss-map").forEach(map => map.replaceChildren());
    return {
        components: fluidCanonicalMarkup(clone),
        injections: fluidInjectionKeys(),
        mapCanvases: document.querySelectorAll(".imerss-map canvas").length
    };
})()`;

const roundTrip = async function (spec) {
    const ready = `${reporterText}.includes("${spec.allRows} of ${spec.allRows}") && !document.querySelector(".imerss-loading")
        && !!document.querySelector(".imerss-map canvas")`;
    const result = await fluidHydrationRoundTrip.run({
        root, page: spec.page, ready, snapshot,
        initial: `(() => ({reporter: ${reporterText}, loading: !!document.querySelector(".imerss-loading")}))()`,
        diagnose: `({reporter: ${reporterText}, canvases: document.querySelectorAll(".imerss-map canvas").length})`,
        ignoreErrors: [/Failed to load resource/, /net::ERR_/],
        timeout: 120000,
        settle: 1000
    });
    const {document} = linkedom.parseHTML(result.hydratedText);
    spec.checks(document);
    expect(result.hydrated.initial.reporter === "Displaying 8 of 8 records" && result.hydrated.initial.loading,
        `${spec.name} hydrated page shows its placeholder rendering as soon as it is parsed - found ${JSON.stringify(result.hydrated.initial)}`);
    expect(result.dehydrated.initial.reporter === "", `${spec.name} dehydrated page holds no markup of its own`);
    [["dehydrated", result.dehydrated], ["hydrated", result.hydrated]].forEach(([name, loaded]) => {
        expect(loaded.errors.length === 0, `No errors in ${spec.name} ${name} page - found ${JSON.stringify(loaded.errors)}`);
        expect(loaded.snapshot.mapCanvases === 1, `One map drawn in ${spec.name} ${name} page`);
    });
    expect(result.dehydrationDifference === null, `${spec.name}: hydration reversed exactly by dehydrate.js - ` + result.dehydrationDifference);
    const difference = fluidHydrationRoundTrip.firstDifference(result.dehydrated.snapshot, result.hydrated.snapshot);
    expect(difference === null, `${spec.name} dehydrated and hydrated pages render identically - ${difference}`);
    console.log(`${spec.name}: hydrated in ${result.hydrateTime}ms; ready in browser: dehydrated ${result.dehydrated.readyTime}ms, ` +
        `hydrated ${result.hydrated.readyTime}ms`);
};

// Drive the Blitz page booted from its minimal form
const interact = async function () {
    const server = await fluidDemoRunner.startServer(root);
    const browser = await puppeteer.launch({headless: true, args: ["--no-sandbox"]});
    try {
        const page = await browser.newPage();
        const errors = [];
        page.on("pageerror", error => errors.push(error.message));
        await page.setViewport({width: 1400, height: 1000});
        await page.goto(`http://127.0.0.1:${server.address().port}/indexBlitz.html`, {waitUntil: "domcontentloaded"});
        await page.waitForFunction(`${reporterText}.includes("555 of 555")`, {timeout: 60000});
        const reporter = () => page.evaluate(reporterText);
        const until = condition => page.waitForFunction(condition, {timeout: 5000}).then(() => true, () => false);

        await page.click(".ui-tabs-tab:nth-child(2) a");
        expect(await until(`!document.getElementById("fli-tab-checklist").hidden && document.getElementById("fli-tab-map").hidden`),
            "Clicking the Checklist tab shows its panel and hides the map's");

        await page.click(".imerss-records-confirmed");
        expect(await until(`!${reporterText}.includes("555 of 555") && !!document.querySelector(".imerss-records-confirmed.selected")`),
            "Clicking Confirmed Records filters the observations - found " + await reporter());
        await page.click(".imerss-records-confirmed");
        expect(await until(`${reporterText}.includes("555 of 555")`), "Clicking Confirmed Records again clears its filter");

        const name = await page.evaluate(`document.querySelector(".checklist-rank-species p[data-row-id]")?.textContent`);
        await page.click(".checklist-rank-species p[data-row-id]");
        expect(await until(`!${reporterText}.includes("555 of 555") && document.querySelector(".imerss-search-checklist input").value !== ""`),
            `Clicking the checklist name ${name} filters to its taxon - found ` + await reporter());
        await page.click(".imerss-filter-controls");
        expect(await until(`${reporterText}.includes("555 of 555") && document.querySelector(".imerss-search-checklist input").value === ""`),
            "Reset filters clears the taxon filter - found " + await reporter());

        await page.click(".imerss-dataset-filter .imerss-filter-row:nth-child(1) input");
        expect(await until(`!${reporterText}.includes("555 of 555")`), "Checking a dataset filters the observations - found " + await reporter());
        expect(errors.length === 0, "No errors interacting with the Blitz page - found " + JSON.stringify(errors));
    } finally {
        await browser.close();
        server.close();
    }
};

const main = async function () {
    const given = Object.keys(pageArgs).length > 0;
    const specs = given ? pages.filter(spec => pageArgs[spec.name]).map(spec => ({...spec, page: pageArgs[spec.name]})) : pages;
    for (const spec of specs) {
        await roundTrip(spec);
    }
    if (!given) {
        await interact();
    }
    if (failures.length === 0) {
        console.log("standardHydrationRoundTrip PASS");
    } else {
        console.log("standardHydrationRoundTrip FAIL:\n  " + failures.join("\n  "));
        process.exitCode = 1;
    }
};

main().catch(error => {
    console.error("standardHydrationRoundTrip FAIL: ", error);
    process.exitCode = 1;
});
