/*
Copyright 2025-2026 Antranig Basman
Licensed under the Educational Community License (ECL), Version 2.0 or the New
BSD license. You may not use this file except in compliance with one these
Licenses.
You may obtain a copy of the ECL 2.0 License and BSD License at
https://github.com/fluid-project/infusion/raw/master/Infusion-LICENSE.txt
*/

"use strict";

// Mirrors the URL's hash onto a reactive record, ported to Infusion 6 from reknitr.hashManager in
// howe-sound-mapping-2026's static/js/reknit-client.js, which used Infusion 4's model system.
// The hash takes the form #key1:value1&key2:value2, where a value beginning with { or [ is JSON.
// Clients read and write members of `hash`, e.g. `hashManager.hash.taxon = "Bombus mixtus"`.

// noinspection ES6ConvertVarToLetConst // otherwise this is a duplicate on minifying
var hortis = fluid.registerNamespace("hortis");

fluid.def("hortis.hashManager", {
    $layers: "fluid.component",
    // The window whose location is mirrored - may be overridden, e.g. for testing
    window: "{global}.window",
    hash: {
        $reactiveRoot: {}
    },
    // Reads the hash on binding and whenever it changes, writing it into `hash`
    hashListener: {
        $bindable: {
            bind: "hortis.hashManager.listen({self}, {self}.window)",
            unbind: "hortis.hashManager.unlisten({boundValue})"
        }
    },
    // Writes `hash` into the URL. This waits on the listener, so that the hash first read from the URL is not
    // overwritten. Since it compares against the URL's current hash, it neither echoes a change which arrived from the
    // URL, nor needs to exclude the initial value as Infusion 4's excludeSource: "init" did. Source tracking with
    // excludeSource: "hash" would be the natural expression of the former, but see gap G2 in
    // a-scratch/reports/requirements-imerss.md of the Infusion 6 repository
    pushState: "$effect:hortis.hashManager.pushState({self}.hash, {self}.window, {self}.hashListener)"
});

hortis.hashManager.parseSegment = function (segment) {
    const decoded = decodeURIComponent(segment);
    const colonIndex = decoded.indexOf(":");
    const key = decoded.substring(0, colonIndex);
    const value = decoded.substring(colonIndex + 1);
    const parsedValue = value.startsWith("{") || value.startsWith("[") ? JSON.parse(value) : value;
    return [key, parsedValue];
};

hortis.hashManager.renderSegment = function (key, value) {
    return key + ":" + (fluid.isPrimitive(value) ? "" + value : JSON.stringify(value));
};

/**
 * Parse a URL hash into a record.
 * @param {String} hash - The hash, with or without its leading #
 * @return {Object} The record encoded by the hash
 */
hortis.hashManager.parse = function (hash) {
    const sections = hash.replace(/^#/, "").split("&");
    return Object.fromEntries(sections.filter(section => section.includes(":")).map(hortis.hashManager.parseSegment));
};

/**
 * Render a record as a URL hash. Members with `null` or `undefined` values are omitted.
 * @param {Object} record - The record to be rendered
 * @return {String} The hash, beginning with #
 */
hortis.hashManager.render = function (record) {
    const nonEmpty = Object.entries(record).filter(([, value]) => hortis.isValue(value));
    return "#" + nonEmpty.map(([key, value]) => hortis.hashManager.renderSegment(key, value)).join("&");
};

/**
 * Determine whether two URL hashes are equivalent, ignoring percent-encoding and an empty hash's #.
 * @param {String} hash1 - The first hash
 * @param {String} hash2 - The second hash
 * @return {Boolean} `true` if the hashes are equivalent
 */
hortis.hashManager.equivalent = function (hash1, hash2) {
    const normalise = hash => decodeURIComponent(hash.replace(/^#/, ""));
    return normalise(hash1) === normalise(hash2);
};

/**
 * Begin listening to a window's hash, writing it into a hash manager now and whenever it changes.
 * @param {hortis.hashManager} that - The hash manager
 * @param {Window} window - The window whose hash is to be listened to
 * @return {Object} A record of the listener, to be supplied to `hortis.hashManager.unlisten`
 */
hortis.hashManager.listen = function (that, window) {
    const apply = fluid.cell.withAmbientSource("hash", () => {
        that.hash = hortis.hashManager.parse(window.location.hash);
    });
    apply();
    window.addEventListener("hashchange", apply);
    window.addEventListener("popstate", apply);
    return {window, apply};
};

hortis.hashManager.unlisten = function (listener) {
    listener.window.removeEventListener("hashchange", listener.apply);
    listener.window.removeEventListener("popstate", listener.apply);
};

hortis.hashManager.pushState = function (hash, window) {
    const rendered = hortis.hashManager.render(hash);
    if (!hortis.hashManager.equivalent(rendered, window.location.hash)) {
        window.history.pushState(null, null, rendered);
    }
};
