/* global hortis */

"use strict";

// Support shared by the tests of the BBEA visualisation, which load it from its Single File Components

fluid.registerNamespace("hortis.tests");

/**
 * Load every Single File Component imported by the page, and those they import in turn, and inject them into the
 * document, so that tests may instantiate their layers synchronously. SFCs are discovered as their importers are parsed,
 * so this repeats until no further import appears. The page's imports are acquired once its module map has been
 * fetched, which is first awaited.
 * @return {Promise} Resolves once every imported SFC has been injected
 */
hortis.tests.loadAllImports = async function () {
    await fluid.cell.settle();
    let layerNames = [];
    while (layerNames.length !== Object.keys(fluid.importMap).length) {
        layerNames = Object.keys(fluid.importMap);
        await Promise.all(layerNames.map(layerName => fluid.cell.waitFor(fluid.subscribeDocToInjections(layerName, document))));
        await fluid.cell.settle();
    }
};

/**
 * The element in the QUnit fixture into which a test renders the visualisation
 * @return {Element} The element
 */
hortis.tests.root = () => document.querySelector("#qunit-fixture .bbea-root");

// The state of every URL-mapped filter is held in the URL's hash, which is shared between tests - each starts with
// an empty hash. The hash manager is loaded with the visualisation's SFCs, and so is absent until they have loaded
/* global QUnit */
QUnit.testStart(function () {
    if (fluid.hashManager?.instance) {
        fluid.hashManager.instance.hash = {};
        fluid.cell.stabilize();
    }
});
