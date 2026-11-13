/* eslint-env node */
"use strict";

// Copy the Oregon Bee Atlas plant-pollinator visualisation, ported to Infusion 6, out to the production site
// melittoflora, a sibling checkout of this one, where it is served from docs as viz.html - see
// https://oregon-bee-project.github.io/melittoflora/viz.html. Run from this checkout with
//     node src/copyMelitOut.js [--no-verify]
// The page is written from its source in src/buildSource/indexBeasOBA.html, which is written as served from a docs
// directory. The files it refers to directly - the stylesheets, images and fonts of the Oregon State University site
// and its data with their placeholders - are copied beside it, and then Infusion 6's copyOut.js copies into
// docs/vendor the files of every module it depends upon, from this checkout and from Infusion 6 - installed by npm, or as named by moduleOverrides.json5 - in the built form
// of Infusion, writing docs/fluid-modules.json to locate them. The page is then hydrated in place by hydrate.js, so that
// it shows its rendering from placeholder data before it boots - its source is recovered from it by dehydrate.js.
// Unless --no-verify is given, the hydrated page is then loaded in a headless browser, which must show all of its
// real records without error. Since only the built form of Infusion is copied, the page's minimal form cannot be
// loaded from the site - the round trip between its two forms is verified by build.js, of the same page in this
// checkout's docs.

const fs = require("fs-extra"),
    path = require("path"),
    childProcess = require("child_process"),
    infusion6 = require("./infusion6.js");

const bagatelle = path.resolve(__dirname, ".."),
    // Infusion 6 as installed by npm, or the checkout named for it by moduleOverrides.json5
    infusion6Dir = infusion6.dir(),
    melittoflora = path.resolve(bagatelle, "../melittoflora"),
    docs = path.join(melittoflora, "docs"),
    page = path.join(docs, "viz.html");

// Files referred to by the page itself, rather than by a module, copied from this checkout to the same path in docs
const pageFiles = {
    "src/client/css/OSU.css": "css/OSU.css",
    "src/client/css/OSU-superfish.css": "css/OSU-superfish.css",
    "src/client/css/OSU-overrides.css": "css/OSU-overrides.css",
    "src/client/img/OSU/OSU-logo.png": "img/OSU/OSU-logo.png",
    "src/client/img/external-link.svg": "img/external-link.svg",
    "src/client/fonts/OSU/Stratum2WebBold.woff2": "fonts/OSU/Stratum2WebBold.woff2",
    "src/client/fonts/OSU/Stratum2WebLight.woff2": "fonts/OSU/Stratum2WebLight.woff2",
    "data/b-team/plant-pollinators-OBA-2025-labels.viz": "data/b-team/plant-pollinators-OBA-2025-labels.viz",
    "data/b-team/plant-pollinators-OBA-2025-assigned-taxa.viz": "data/b-team/plant-pollinators-OBA-2025-assigned-taxa.viz",
    "data/b-team/plant-pollinators-OBA-2025-regionIndirection.csv": "data/b-team/plant-pollinators-OBA-2025-regionIndirection.csv",
    "data/b-team/placeholder/plant-pollinators-OBA-2025-labels.viz": "data/b-team/placeholder/plant-pollinators-OBA-2025-labels.viz",
    "data/b-team/placeholder/plant-pollinators-OBA-2025-assigned-taxa.viz": "data/b-team/placeholder/plant-pollinators-OBA-2025-assigned-taxa.viz",
    "data/b-team/placeholder/plant-pollinators-OBA-2025-regionIndirection.csv": "data/b-team/placeholder/plant-pollinators-OBA-2025-regionIndirection.csv"
};

/**
 * Run a node script in a child process, failing if it fails
 * @param {String[]} args - The script and its arguments
 */
const runNode = function (args) {
    console.log("Running node " + args.join(" "));
    const result = childProcess.spawnSync(process.execPath, args, {cwd: bagatelle, stdio: ["ignore", "pipe", "inherit"],
        encoding: "utf8", maxBuffer: 256 * 1024 * 1024});
    const reported = (result.stdout || "").split("\n").filter(line => !line.startsWith("fluid.loadInContext"));
    console.log(reported.slice(-8).join("\n"));
    if (result.status !== 0) {
        throw new Error("node " + args.join(" ") + " failed with status " + result.status);
    }
};

const copyMelitOut = function () {
    if (!fs.existsSync(melittoflora)) {
        throw new Error("No checkout of melittoflora found at " + melittoflora);
    }
    fs.copySync(path.join(bagatelle, "src/buildSource/indexBeasOBA.html"), page);
    console.log("Copied page to " + page);
    Object.entries(pageFiles).forEach(([source, target]) => {
        fs.ensureDirSync(path.dirname(path.join(docs, target)));
        fs.copySync(path.join(bagatelle, source), path.join(docs, target));
    });
    console.log("Copied " + Object.keys(pageFiles).length + " files referred to by the page");
    // The stylesheets of the Oregon State University site refer to its theme's fonts and images, which are served only
    // there, and to forms of its fonts which are not held here
    runNode([path.join(infusion6Dir, "src/framework/server/copyOut.js"), page, "--source", "infusion-6=" + infusion6Dir,
        "--source", "imerss-bioinfo=" + bagatelle, "--framework", "built", "--ignore-missing", "sites/all/",
        "--ignore-missing", "fonts/OSU/"]);
    runNode([path.join(infusion6Dir, "src/framework/server/hydrate.js"), page, "-o", page, "--framework", "built"]);
};

/**
 * Load the hydrated page from the site in a headless browser, and check that it shows all of its real records
 * without error
 * @return {Promise} A promise which resolves once the page has been checked, rejecting if it fails
 */
const verifyPage = async function () {
    const fluidDemoRunner = infusion6.requireTestSupport("tests/test-core/browser/js/demo-runner.js"),
        fluidHydrationRoundTrip = infusion6.requireTestSupport("tests/test-core/browser/js/hydration-roundtrip.js"),
        puppeteer = require("puppeteer");
    const server = await fluidDemoRunner.startServer(docs);
    const browser = await puppeteer.launch({headless: true, args: ["--no-sandbox"]});
    try {
        const reporter = `(document.querySelector(".imerss-record-reporter")?.textContent || "").replace(/\\s+/g, " ")`;
        const loaded = await fluidHydrationRoundTrip.loadPage(browser, `http://127.0.0.1:${server.address().port}/viz.html`, {
            ready: `/([\\d,]+) of \\1 records/.test(${reporter}) && !!document.querySelector(".bee-loading-container-hidden")`,
            snapshot: reporter,
            // Map tiles and fonts are fetched remotely, and may not be reachable, nor may the site's analytics
            ignoreErrors: [/Failed to load resource/, /net::ERR_/, /cloudflareinsights/],
            timeout: 120000
        });
        if (loaded.errors.length > 0) {
            throw new Error("Errors in viz.html: " + JSON.stringify(loaded.errors));
        }
        console.log(`viz.html verified - ${loaded.snapshot.trim()}, ready in ${loaded.readyTime}ms`);
    } finally {
        await browser.close();
        server.close();
    }
};

const main = async function () {
    copyMelitOut();
    if (!process.argv.includes("--no-verify")) {
        await verifyPage();
    }
};

main().catch(error => {
    console.error("copyMelitOut failed: " + error.message);
    process.exitCode = 1;
});
