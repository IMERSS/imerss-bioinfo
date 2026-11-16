/* eslint-env node */
"use strict";

// Test that a plant-pollinator (BBEA) page renders identically whether booted in the browser from its minimal,
// dehydrated form - which imports the visualisation's Single File Component and configures it with its data - or from
// the form written for it by Infusion 6's hydrate.js, which holds the markup rendered from the same data and every
// injection its SFCs made, and that dehydrate.js recovers the minimal form exactly. Run from this checkout with
//     node test/i6/bbeaHydrationRoundTrip.js
// which tests test/i6/html/bbeaPlaceholderFixture.html, the visualisation as it is, rendered from the placeholder its
// layer declares - see FLUID-7032. Infusion 6 is that installed by npm, or the checkout named for it by
// moduleOverrides.json5 - see src/locateInfusion6.js.
// A page which is a runnable application may instead be given, e.g. one of the atlases' pages built into docs by
// build.js, as
//     node test/i6/bbeaHydrationRoundTrip.js <root> <page>
// where <root> is the directory served to the browser, and <page> the page's path within it. Such a page must be
// hydrated from its real data, and hold the results of its queries of startup

const infusion6 = require("../../src/locateInfusion6.js");
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
// page whose data is already loaded it does only once, as it is hydrated. Their own content is
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

// The fixture rendered from the placeholder of the visualisation's layer
const placeholderFixture = "test/i6/html/bbeaPlaceholderFixture.html";

const roundTrip = async function (root, page) {
    const isFixture = page === placeholderFixture;
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
    // The fixture is rendered from the 8 observations of the placeholder, and a runnable application from all of its
    // real ones
    const allShown = /^Displaying ([\d,]+) of \1 records$/.exec(reporter || "");
    const rendered = isFixture ? reporter === "Displaying 8 of 8 records" : !!allShown && allShown[1] !== "8";
    expect(rendered, `Hydrated page rendered from ${isFixture ? "the 8 observations of its placeholder" : "all of its real observations"} - found ` + reporter);
    expect(!!document.querySelector(".bee-loading-container-hidden"), "Hydrated page shows no loading indicator, its data being loaded");
    expect(isFixture || !!document.getElementById("hortis-query-cache"), "Hydrated page holds the results of its queries of startup");
    expect(isFixture === /from placeholder placeholder:\/\/hortis\.beaVizLoader\/viz/.test(result.hydrateOutput || ""),
        `Hydrater reports ${isFixture ? "the placeholder it rendered from" : "no placeholder"} - found ` + (result.hydrateOutput || "").slice(-300));
    expect(document.querySelectorAll(".imerss-pollinators .checklist-row").length > 0, "Hydrated page renders the bee checklist");
    expect(!!document.querySelector("script[fluid-client][src$='maplibre-gl/dist/maplibre-gl-dev.js']"),
        "MapLibre recorded as a script for the browser alone, relative to the page");
    expect(!!document.querySelector("#fl-symbols-host symbol#imerss-i-chev"), "Shared icons injected");

    expect(result.hydrated.initial.reporter === reporter && !result.hydrated.initial.loading,
        "Hydrated page shows its rendering as soon as it is parsed - found " + JSON.stringify(result.hydrated.initial));
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
    const pages = [process.argv[3] || placeholderFixture];
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
