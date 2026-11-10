/* global QUnit, hortis */

"use strict";

fluid.registerNamespace("hortis.tests");

// The page's module map is fetched as it boots, which is first awaited
QUnit.module("Hash manager on Infusion 6", {
    before: () => fluid.cell.settle()
});

QUnit.config.reorder = false;

/**
 * Construct a fake window holding a location whose hash is changed by `history.pushState`, and recording the pushes.
 * @param {String} initialHash - The window's initial hash
 * @return {Object} The fake window, with additional member `pushed` holding the URLs pushed and method `navigate`
 * simulating the user's navigation to a new hash
 */
hortis.tests.fakeWindow = function (initialHash) {
    const listeners = {};
    const togo = {
        location: {hash: initialHash},
        pushed: [],
        history: {
            pushState: (state, title, url) => {
                togo.pushed.push(url);
                togo.location.hash = encodeURI(url); // Browsers report the hash percent-encoded
            }
        },
        addEventListener: (event, listener) => fluid.pushArray(listeners, event, listener),
        removeEventListener: (event, listener) => fluid.remove_if(listeners[event] || [], one => one === listener),
        navigate: hash => {
            togo.location.hash = hash;
            (listeners.hashchange || []).forEach(listener => listener());
        },
        listenerCount: () => Object.values(listeners).reduce((count, list) => count + list.length, 0)
    };
    return togo;
};

fluid.def("hortis.tests.hashManager", {
    $layers: "fluid.hashManager",
    window: "{global}.hortis.tests.currentWindow"
});

QUnit.test("Parsing and rendering", function (assert) {
    const parsed = fluid.hashManager.parse("#pane:History&taxon:Bombus%20mixtus&filter:{\"a\":1}");
    assert.deepEqual(parsed, {pane: "History", taxon: "Bombus mixtus", filter: {a: 1}}, "Hash parsed, including JSON values");
    assert.equal(fluid.hashManager.render({pane: "History", taxon: null, filter: {a: 1}}), "#pane:History&filter:{\"a\":1}",
        "Record rendered, omitting null members");
    assert.ok(fluid.hashManager.equivalent("#taxon:Bombus mixtus", "#taxon:Bombus%20mixtus"), "Encoding is ignored when comparing");
    assert.ok(fluid.hashManager.equivalent("#", ""), "Empty hashes are equivalent");
});

QUnit.test("Initial hash is read without being pushed back", function (assert) {
    const win = hortis.tests.currentWindow = hortis.tests.fakeWindow("#pane:History&taxon:Bombus%20mixtus");
    const that = hortis.tests.hashManager();
    fluid.cell.stabilize();
    assert.deepEqual({...that.hash}, {pane: "History", taxon: "Bombus mixtus"}, "Initial hash read into model");
    assert.deepEqual(win.pushed, [], "Nothing is pushed on startup");

    that.hash.taxon = "Bombus vosnesenskii";
    fluid.cell.stabilize();
    assert.deepEqual(win.pushed, ["#pane:History&taxon:Bombus vosnesenskii"], "Model change pushed to the URL");

    win.navigate("#pane:Status");
    fluid.cell.stabilize();
    assert.deepEqual({...that.hash}, {pane: "Status"}, "Navigation read into model");
    assert.equal(win.pushed.length, 1, "Navigation is not echoed back to the URL");

    that.hash.region = "Gambier";
    fluid.cell.stabilize();
    assert.deepEqual(win.pushed[1], "#pane:Status&region:Gambier", "A further model change is pushed after navigation");

    assert.equal(win.listenerCount(), 2, "Listening to hashchange and popstate");
    that.destroy();
    // Bindables are unbound at the next stabilization
    fluid.cell.stabilize();
    assert.equal(win.listenerCount(), 0, "Listeners removed on destruction");
});

QUnit.test("Changes arriving from the URL do not reach pushState", function (assert) {
    const win = hortis.tests.currentWindow = hortis.tests.fakeWindow("#pane:History");
    const original = fluid.hashManager.pushState;
    let runs = 0;
    fluid.hashManager.pushState = function (...args) {
        ++runs;
        return original(...args);
    };
    try {
        const that = hortis.tests.hashManager();
        fluid.cell.stabilize();
        const initialRuns = runs;
        win.navigate("#pane:Status");
        fluid.cell.stabilize();
        assert.deepEqual({...that.hash}, {pane: "Status"}, "Navigation read into model");
        assert.equal(runs, initialRuns, "pushState is not run for a change with source \"hash\"");
        that.hash.region = "Gambier";
        fluid.cell.stabilize();
        assert.equal(runs, initialRuns + 1, "pushState runs for a later model change");
        assert.deepEqual(win.pushed, ["#pane:Status&region:Gambier"], "The later change is pushed");
        that.destroy();
        fluid.cell.stabilize();
    } finally {
        fluid.hashManager.pushState = original;
    }
});

fluid.def("hortis.tests.hashReader", {
    $layers: "fluid.component",
    selectedPane: "{hashManager}.hash.pane",
    region: "{hashManager}.hash.region",
    paneRenders: [],
    // Records each pane for which the component computes, as a rendering of the pane would
    recordPane: "$effect:hortis.tests.recordPane({self}, {self}.selectedPane)"
});

hortis.tests.recordPane = function (that, selectedPane) {
    that.paneRenders.push(selectedPane);
};

QUnit.test("Members referring to the URL's hash", function (assert) {
    const win = hortis.tests.currentWindow = hortis.tests.fakeWindow("#pane:History");
    // Stand in for the global manager, so that {hashManager} resolves to one mirroring the fake window
    fluid.hashManager.instance.destroy();
    fluid.cell.stabilize();
    const manager = hortis.tests.hashManager();
    fluid.cell.stabilize();
    const that = hortis.tests.hashReader();
    fluid.cell.stabilize();
    assert.equal(that.selectedPane, "History", "Member begins with the URL's value");
    assert.deepEqual([...that.paneRenders], ["History"], "Member was only ever computed from the URL");
    assert.equal(that.region, undefined, "Member absent from the URL is undefined");

    that.selectedPane = "Status";
    fluid.cell.stabilize();
    assert.equal(manager.hash.pane, "Status", "Writing the member writes into the hash");
    assert.deepEqual(win.pushed, ["#pane:Status"], "and pushes it to the URL");

    win.navigate("#pane:Protected&region:Gambier");
    fluid.cell.stabilize();
    assert.equal(that.selectedPane, "Protected", "Navigation changes the member");
    assert.equal(that.region, "Gambier", "Navigation supplies a member formerly absent");
    assert.equal(win.pushed.length, 1, "Navigation is not echoed back to the URL");

    that.region = null;
    fluid.cell.stabilize();
    assert.deepEqual(win.pushed[1], "#pane:Protected", "Writing a member null removes it from the URL");
    win.navigate("#pane:Overview");
    fluid.cell.stabilize();
    assert.equal(that.selectedPane, "Overview", "Navigation still reaches a member which has been written");

    that.destroy();
    manager.destroy();
    fluid.cell.stabilize();
    fluid.hashManager.instance = fluid.hashManager({window, hash: fluid.hashManager.parse(window.location.hash)});
    fluid.cell.stabilize();
});
