/* eslint-env node */
"use strict";

// Test that the story page of a bioReportR project renders identically whether booted in the browser from its minimal
// form, or from the form written for it by Infusion 6's hydrate.js - and that, booted from either with a hash naming a
// pane, only that pane is ever shown. The static rendering has no URL, so shows no pane, nor anything else depending
// on the pane, until it boots. Run from the bagatelle checkout with
//     node test/i6/storyHydrationRoundTrip.js [<projectDir> <page>]
// by default the development page of howe-sound-mapping-2026, whose static/vendor has been filled by copyOut.js and
// whose material has been written by its src/js/storyBuild.js. The page is served from the project alone.

const infusion6 = require("../../src/infusion6.js");
const fs = require("fs"),
    path = require("path"),
    linkedom = require("linkedom");

const fluidHydrationRoundTrip = infusion6.requireTestSupport("tests/test-core/browser/js/hydration-roundtrip.js");

const projectDir = path.resolve(process.argv[2] || path.join(__dirname, "../../../howe-sound-mapping-2026"));
const page = process.argv[3] || "static/story/index-dev.html";

const failures = [];
const expect = function (condition, message) {
    if (!condition) {
        failures.push(message);
    }
};

// The panes of the story, in order, as written by storyBuild.js beside the page
const panes = JSON.parse(fs.readFileSync(path.join(projectDir, path.dirname(page), "panes.json"), "utf8")).map(pane => pane.paneKey);

const reporterText = `(document.querySelector(".imerss-record-reporter")?.textContent || "").replace(/\\s+/g, " ").trim()`;

// Widgets drawn by libraries which own their markup - MapLibre's map, plotly's charts - are compared only as far as
// their roots
const snapshot = `(() => {
    const clone = document.querySelector("[fluid-layers]").cloneNode(true);
    clone.querySelectorAll(".mxcw-map, .html-widget").forEach(node => node.replaceChildren());
    clone.querySelectorAll(".html-widget").forEach(node => node.removeAttribute("style"));
    return {
        components: fluidCanonicalMarkup(clone),
        injections: fluidInjectionKeys()
    };
})()`;

// Records each pane shown, from the moment the page is parsed - a pane is shown if it is active
// Timers of a second or more, e.g. that animating the History pane's slider through the years, are suppressed in both
// forms of the page, so that each is snapshotted at the same year
const recorder = `const fluidTestsSetInterval = window.setInterval;
window.setInterval = (func, delay, ...args) => delay >= 1000 ? 0 : fluidTestsSetInterval(func, delay, ...args);
window.storyShown = [];
new MutationObserver(() => {
    const pane = document.querySelector(".mxcw-storyPane.mxcw-activePane")?.dataset.pane;
    if (pane && window.storyShown[window.storyShown.length - 1] !== pane) {
        window.storyShown.push(pane);
    }
}).observe(document, {subtree: true, childList: true, attributes: true, attributeFilter: ["class"]});`;

const main = async function () {
    for (const hash of ["", "#pane:" + panes[1]]) {
        const result = await fluidHydrationRoundTrip.run({
            root: projectDir, page, hash, snapshot,
            ready: `!!document.querySelector(".imerss-main:not(.imerss-loading)") && ${reporterText}.startsWith("Displaying")
                && !!document.querySelector(".mxcw-map canvas")`,
            initial: "window.storyShown.slice()",
            diagnose: `({reporter: ${reporterText}})`,
            preload: recorder,
            ignoreErrors: [/Failed to load resource/, /net::ERR_/, /CORS policy/, /JSHandle@error/],
            timeout: 120000,
            settle: 2500
        });
        const name = hash || "no hash";
        if (hash === "") {
            const {document} = linkedom.parseHTML(result.hydratedText);
            expect(document.querySelectorAll(".chevron-tab").length === panes.length, "Hydrated page renders the tab of each of its panes");
            expect(!!document.querySelector(".imerss-main.imerss-loading"), "Hydrated page shows itself as loading");
            expect(document.querySelectorAll(".mxcw-storyPane .section").length === panes.length, "Hydrated page renders each pane's section");
            expect(!document.querySelector(".mxcw-activePane"), "Hydrated page, rendered without a URL, shows no pane");
            expect(/Displaying\s*<b[^>]*>8<\/b>\s*of\s*<span[^>]*>8<\/span>/.test(result.hydratedText) ||
                (document.querySelector(".imerss-record-reporter")?.textContent || "").replace(/\s+/g, " ").includes("8 of 8"),
            "Hydrated page rendered from the placeholder observations");
        }
        [["dehydrated", result.dehydrated], ["hydrated", result.hydrated]].forEach(([form, loaded]) => {
            expect(loaded.errors.length === 0, `No errors in ${form} page with ${name} - found ${JSON.stringify(loaded.errors).slice(0, 600)}`);
            const shown = loaded.shownAtEnd;
            const expected = hash ? panes[1] : panes[0];
            expect(JSON.stringify(shown) === JSON.stringify([expected]), `With ${name}, the ${form} page only ever showed pane ${expected} - found ${JSON.stringify(shown)}`);
        });
        expect(result.dehydrationDifference === null, `${name}: hydration reversed exactly by dehydrate.js - ` + result.dehydrationDifference);
        const difference = fluidHydrationRoundTrip.firstDifference(result.dehydrated.snapshot, result.hydrated.snapshot);
        expect(difference === null, `With ${name}, dehydrated and hydrated pages render identically - ${difference}`);
        console.log(`${name}: hydrated in ${result.hydrateTime}ms; ready in browser: dehydrated ${result.dehydrated.readyTime}ms, hydrated ${result.hydrated.readyTime}ms`);
    }
    if (failures.length === 0) {
        console.log("storyHydrationRoundTrip PASS");
    } else {
        console.log("storyHydrationRoundTrip FAIL:\n  " + failures.join("\n  "));
        process.exitCode = 1;
    }
};

main().catch(error => {
    console.error("storyHydrationRoundTrip FAIL: ", error);
    process.exitCode = 1;
});
