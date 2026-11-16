/* eslint-env node */
"use strict";

// Run every test of the visualisations ported to Infusion 6, each in a process of its own, in turn, and report the
// outcome of each - the process exits with a failing status if any failed. Run from this checkout with
//     npm test
// or
//     node test/i6/all.js [--stories] [<name> ...]
// where each <name>, e.g. qdlEquivalence or BbeaCoreTests, restricts the run to the tests of that name. The tests of a
// bioReportR story page, storyHydrationRoundTrip.js and storyNavigation.js, drive the development page of a sibling
// checkout of howe-sound-mapping-2026 through its own vendored copy of this package, so are run only with --stories,
// once that copy holds the version under test.

const childProcess = require("child_process"),
    path = require("path");

const root = path.resolve(__dirname, "../..");

const qunitCli = "node_modules/infusion-6/tests/test-core/qunit/js/fqunit-cli.js";

/**
 * A test to be run, as a command run from the root of this checkout.
 * @typedef {Object} TestRecord
 * @property {String} name - The name of the test
 * @property {String[]} args - The arguments to node
 */

// The tests of the columnar data package and the query description language, which run under node alone, then the
// QUnit tests of the visualisations' components, then the round trips between their pages' dehydrated and hydrated
// forms, which drive a browser
const tests = [
    {name: "vizPackageRoundTrip", args: ["test/i6/vizPackageRoundTrip.js"]},
    {name: "qdlEquivalence", args: ["test/i6/qdlEquivalence.js"]},
    ...["BbeaCoreTests", "BbeaMapTests", "BbeaViewsTests", "HashManagerTests"].map(name =>
        ({name, args: [qunitCli, "test/i6/html/" + name + ".html"]})),
    {name: "bbeaHydrationRoundTrip", args: ["test/i6/bbeaHydrationRoundTrip.js"]},
    {name: "standardHydrationRoundTrip", args: ["test/i6/standardHydrationRoundTrip.js"]},
    {name: "queryCacheRoundTrip", args: ["test/i6/queryCacheRoundTrip.js"]}
];

const storyTests = [
    {name: "storyHydrationRoundTrip", args: ["test/i6/storyHydrationRoundTrip.js"]},
    {name: "storyNavigation", args: ["test/i6/storyNavigation.js"]}
];

/**
 * Run one test, echoing its output, and time it.
 * @param {TestRecord} test - The test
 * @return {Object} Members `name`, `passed` and `time`, in milliseconds
 */
const runTest = function (test) {
    console.log("\n=== " + test.name + ": node " + test.args.join(" "));
    const start = Date.now();
    const result = childProcess.spawnSync(process.execPath, test.args, {cwd: root, stdio: "inherit"});
    return {name: test.name, passed: result.status === 0, time: Date.now() - start};
};

const main = function () {
    const args = process.argv.slice(2);
    const withStories = args.includes("--stories");
    const names = args.filter(arg => arg !== "--stories");
    const all = withStories ? [...tests, ...storyTests] : tests;
    const chosen = names.length > 0 ? all.filter(test => names.includes(test.name)) : all;
    const unknown = names.filter(name => !all.some(test => test.name === name));
    if (unknown.length > 0) {
        console.log("No test named " + unknown.join(", ") + " - the tests are " + all.map(test => test.name).join(", "));
        process.exitCode = 1;
    } else {
        const results = chosen.map(runTest);
        console.log("\n=== Summary");
        results.forEach(result => console.log((result.passed ? "  PASS " : "  FAIL ") + result.name + " (" + (result.time / 1000).toFixed(1) + "s)"));
        const failed = results.filter(result => !result.passed);
        if (failed.length === 0) {
            console.log("All " + results.length + " tests passed");
        } else {
            console.log(failed.length + " of " + results.length + " tests failed");
            process.exitCode = 1;
        }
    }
};

main();
