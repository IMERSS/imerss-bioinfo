/* global QUnit, hortis */

"use strict";

fluid.registerNamespace("hortis.tests");

QUnit.module("Hash manager on Infusion 6");

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
    $layers: "hortis.hashManager",
    window: "{global}.hortis.tests.currentWindow"
});

QUnit.test("Parsing and rendering", function (assert) {
    const parsed = hortis.hashManager.parse("#pane:History&taxon:Bombus%20mixtus&filter:{\"a\":1}");
    assert.deepEqual(parsed, {pane: "History", taxon: "Bombus mixtus", filter: {a: 1}}, "Hash parsed, including JSON values");
    assert.equal(hortis.hashManager.render({pane: "History", taxon: null, filter: {a: 1}}), "#pane:History&filter:{\"a\":1}",
        "Record rendered, omitting null members");
    assert.ok(hortis.hashManager.equivalent("#taxon:Bombus mixtus", "#taxon:Bombus%20mixtus"), "Encoding is ignored when comparing");
    assert.ok(hortis.hashManager.equivalent("#", ""), "Empty hashes are equivalent");
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
