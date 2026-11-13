/* eslint-env node */
"use strict";

// Test that a plant-pollinator (BBEA) page renders identically whether booted in the browser from its minimal,
// dehydrated form - which imports the visualisation's Single File Component and configures it with its data and their
// placeholders - or from the form written for it by Infusion 6's hydrate.js, which holds the markup rendered from the
// placeholder data and every injection its SFCs made, and that dehydrate.js recovers the minimal form exactly. Run from
// this checkout with
//     node test/i6/bbeaHydrationRoundTrip.js
// which tests test/i6/html/bbeaPlaceholderFixture.html, the visualisation configured with the placeholder data of the
// Washington Bee Atlas as its data too, so that it is ready as soon as it boots. Infusion 6 is that installed by npm, or
// the checkout named for it by moduleOverrides.json5 - see src/infusion6.js.
// A page with real data may instead be given, e.g. one of the atlases' pages built into docs by build.js, as
//     node test/i6/bbeaHydrationRoundTrip.js <root> <page>
// where <root> is the directory served to the browser, and <page> the page's path within it

const infusion6 = require("../../src/infusion6.js");
const path = require("path"),
    linkedom = require("linkedom");

const fluidHydrationRoundTrip = infusion6.requireTestSupport("tests/test-core/browser/js/hydration-roundtrip.js");

const failures = [];
const expectAll = function (condition, message) {
    if (!condition) {
        failures.push(message);
    }
};

// The page is ready once all of its observations are counted, the loading indicator is hidden, and the map and the
// network have drawn
const ready = `/([\\d,]+) of \\1 records/.test((document.querySelector(".imerss-record-reporter")?.textContent || "").replace(/\\s+/g, " "))
    && !!document.querySelector(".bee-loading-container-hidden") && !!document.querySelector(".imerss-map canvas")
    && document.querySelectorAll(".imerss-bipartite svg rect").length > 0`;

// The map and the network are drawn by libraries which own their markup - MapLibre lays out its controls and canvas
// according to the moment its tiles arrive, and d3 sizes the network to its panel as it draws it, which on a hydrated
// page whose data is its placeholders, as the fixture's is, it does only once, as it is hydrated. Their own content is
// compared only as far as their roots
const snapshot = `(() => {
    const clone = document.querySelector("[fluid-layers]").cloneNode(true);
    clone.querySelectorAll(".imerss-map, .imerss-bipartite").forEach(root => root.replaceChildren());
    return {
        components: fluidCanonicalMarkup(clone),
        injections: fluidInjectionKeys(),
        symbols: [...document.querySelectorAll("#fl-symbols-host symbol")].map(node => node.id).sort(),
        mapCanvases: document.querySelectorAll(".imerss-map canvas").length
    };
})()`;

const initial = `(() => ({
    reporter: (document.querySelector(".imerss-record-reporter")?.textContent || "").replace(/\\s+/g, " ").trim(),
    loading: !!document.querySelector(".bee-loading-container:not(.bee-loading-container-hidden)")
}))()`;

const roundTrip = async function (root, page) {
    const result = await fluidHydrationRoundTrip.run({
        root, page,
        ready, snapshot, initial,
        diagnose: `({reporter: document.querySelector(".imerss-record-reporter")?.textContent, hidden: !!document.querySelector(".bee-loading-container-hidden"),
            canvases: document.querySelectorAll(".imerss-map canvas").length, rects: document.querySelectorAll(".imerss-bipartite svg rect").length,
            unavailable: Object.keys(fluid.unavailableComponentPaths || {}).slice(0, 10)})`,
        // Map tiles, fonts and the icon font are fetched remotely, and may not be reachable - nor may the analytics of
        // a page built into docs, which refuses a page served locally
        ignoreErrors: [/Failed to load resource/, /net::ERR_/, /cloudflareinsights/],
        timeout: 120000,
        settle: 1500
    });

    const {document} = linkedom.parseHTML(result.hydratedText);
    const reporter = document.querySelector(".imerss-record-reporter")?.textContent.replace(/\s+/g, " ").trim();
    const expect = (condition, message) => expectAll(condition, page + ": " + message);
    expect(reporter === "Displaying 8 of 8 records", "Hydrated page rendered from the 8 placeholder observations - found " + reporter);
    expect(!!document.querySelector(".bee-loading-container") && !document.querySelector(".bee-loading-container-hidden"),
        "Hydrated page shows its loading indicator");
    expect(document.querySelectorAll(".imerss-pollinators .checklist-row").length > 0, "Hydrated page renders the bee checklist");
    expect(!!document.querySelector("script[fluid-client][src$='maplibre-gl/dist/maplibre-gl-dev.js']"),
        "MapLibre recorded as a script for the browser alone, relative to the page");
    expect(!!document.querySelector("#fl-symbols-host symbol#imerss-i-chev"), "Shared icons injected");

    expect(result.hydrated.initial.reporter === "Displaying 8 of 8 records" && result.hydrated.initial.loading,
        "Hydrated page shows its placeholder rendering and loading indicator as soon as it is parsed - found " + JSON.stringify(result.hydrated.initial));
    expect(result.dehydrated.initial.reporter === "", "Dehydrated page holds no markup of its own");

    [["dehydrated", result.dehydrated], ["hydrated", result.hydrated]].forEach(([name, loaded]) => {
        expect(loaded.errors.length === 0, `No errors in ${name} page - found ${JSON.stringify(loaded.errors)}`);
        expect(loaded.snapshot.mapCanvases === 1, `One map drawn in ${name} page - found ${loaded.snapshot.mapCanvases}`);
    });
    expect(result.dehydrationDifference === null, "Hydration reversed exactly by dehydrate.js - " + result.dehydrationDifference);
    const difference = fluidHydrationRoundTrip.firstDifference(result.dehydrated.snapshot, result.hydrated.snapshot);
    expect(difference === null, "Dehydrated and hydrated pages render identically - " + difference);

    console.log(`${page}: hydrated in ${result.hydrateTime}ms; ready in browser: dehydrated ${result.dehydrated.readyTime}ms, ` +
        `hydrated ${result.hydrated.readyTime}ms`);
};

const main = async function () {
    const root = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(__dirname, "../..");
    const pages = [process.argv[3] || "test/i6/html/bbeaPlaceholderFixture.html"];
    for (const page of pages) {
        await roundTrip(root, page);
    }
    if (failures.length === 0) {
        console.log("bbeaHydrationRoundTrip PASS");
    } else {
        console.log("bbeaHydrationRoundTrip FAIL:\n  " + failures.join("\n  "));
        process.exitCode = 1;
    }
};

main().catch(error => {
    console.error("bbeaHydrationRoundTrip FAIL: ", error);
    process.exitCode = 1;
});
