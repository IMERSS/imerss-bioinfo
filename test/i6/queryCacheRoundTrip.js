/* eslint-env node */
"use strict";

// Test that a plant-pollinator (BBEA) page hydrated by Infusion 6's hydrate.js against its real data, as a runnable
// application is, holds the results of the queries it executed at startup - see hortis.queryCache in imerss-core.js -
// that it renders identically whether booted in the browser from its minimal, dehydrated form or from its hydrated
// form, which answers its queries of startup from those results, and that dehydrate.js recovers the minimal form
// exactly, removing the cache with the rest of what hydration wrote. Run from this checkout with
//     node test/i6/queryCacheRoundTrip.js [<root> <page>]
// which by default tests test/i6/html/bbeaRealDataFixture.html, the visualisation configured with the real data of the
// Washington Bee Atlas

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


const roundTrip = async function (root, page) {
    const result = await fluidHydrationRoundTrip.run({
        root, page,
        ready, snapshot,
        initial: `(() => ({
            reporter: (document.querySelector(".imerss-record-reporter")?.textContent || "").replace(/\\s+/g, " ").trim(),
            cacheEntries: Object.keys(JSON.parse(document.getElementById("hortis-query-cache")?.textContent || "{}")).length
        }))()`,
        diagnose: `({reporter: document.querySelector(".imerss-record-reporter")?.textContent, hits: hortis.queryCache.hits})`,
        ignoreErrors: [/Failed to load resource/, /net::ERR_/, /cloudflareinsights/],
        timeout: 120000,
        settle: 1500
    });

    const {document} = linkedom.parseHTML(result.hydratedText);
    const reporter = document.querySelector(".imerss-record-reporter")?.textContent.replace(/\s+/g, " ").trim();
    const cache = document.getElementById("hortis-query-cache");
    const entries = cache ? Object.keys(JSON.parse(cache.textContent)).length : 0;
    const expect = (condition, message) => expectAll(condition, page + ": " + message);
    expect(/^Displaying ([\d,]+) of \1 records$/.test(reporter) && reporter !== "Displaying 8 of 8 records",
        "Hydrated page rendered from the real observations - found " + reporter);
    expect(entries > 0, "Hydrated page holds the results of the queries of startup - found " + entries);
    expect(result.hydrated.initial.cacheEntries === entries, "Hydrated page holds the cache as soon as it is parsed");
    [["dehydrated", result.dehydrated], ["hydrated", result.hydrated]].forEach(([name, loaded]) => {
        expect(loaded.errors.length === 0, `No errors in ${name} page - found ${JSON.stringify(loaded.errors)}`);
    });
    expect(result.dehydrationDifference === null, "Hydration reversed exactly by dehydrate.js - " + result.dehydrationDifference);
    const difference = fluidHydrationRoundTrip.firstDifference(result.dehydrated.snapshot, result.hydrated.snapshot);
    expect(difference === null, "Dehydrated and hydrated pages render identically - " + difference);
    console.log(`${page}: ${entries} queries cached, ${cache ? cache.textContent.length : 0} characters; hydrated in ${result.hydrateTime}ms; ` +
        `ready in browser: dehydrated ${result.dehydrated.readyTime}ms, hydrated ${result.hydrated.readyTime}ms`);
};

const main = async function () {
    const root = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(__dirname, "../..");
    const pages = [process.argv[3] || "test/i6/html/bbeaRealDataFixture.html"];
    for (const page of pages) {
        await roundTrip(root, page);
    }
    if (failures.length === 0) {
        console.log("queryCacheRoundTrip PASS");
    } else {
        console.log("queryCacheRoundTrip FAIL:\n  " + failures.join("\n  "));
        process.exitCode = 1;
    }
};

main().catch(error => {
    console.error("queryCacheRoundTrip FAIL: ", error);
    process.exitCode = 1;
});
