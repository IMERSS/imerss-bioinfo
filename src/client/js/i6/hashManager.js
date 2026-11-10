/*
Copyright 2025-2026 Antranig Basman
Licensed under the Educational Community License (ECL), Version 2.0 or the New
BSD license. You may not use this file except in compliance with one these
Licenses.
You may obtain a copy of the ECL 2.0 License and BSD License at
https://github.com/fluid-project/infusion/raw/master/Infusion-LICENSE.txt
*/

"use strict";

// State held in the URL's hash, ported to Infusion 6 from reknitr.hashManager in howe-sound-mapping-2026's
// static/js/reknit-client.js, which used Infusion 4's model system. Nothing here is part of Infusion's core or its tag
// dialect - a page opts in by loading this file.
//
// fluid.hashManager is a single global component, resolvable everywhere as {hashManager}, which mirrors the URL's hash
// onto a reactive record `hash`. The hash takes the form #key1:value1&key2:value2, where a value beginning with { or [
// is JSON. A component holds a member in the URL simply by referring to it, e.g.
//     selectedPaneKey: "{hashManager}.hash.pane"
// which is undefined whilst the URL does not hold it. A write to the member, e.g. `that.selectedPaneKey = "History"`,
// is applied to the hash, as for any member defined by a reference, and pushes the URL into the window's history.
//
// Every filter bearing hortis.urlMappedFilter (see filters.js) holds its state in the hash, under its `urlKey`, once
// this file is loaded - the manager's $linkage lays hortis.urlMappedFilter.linked over each of them, making its state a
// view of its entry in the hash. This is only done when there is a URL, so that a page rendered statically renders
// its filters in their empty state.
//
// The hash is decoded synchronously when the global manager is created, as this file loads, and so before any
// component which reads it is instantiated. When there is no URL, e.g. when hydrate.js renders a page statically under
// node, the hash is unavailable, so that whatever depends on it is not rendered into the static page, and is rendered
// only once the page boots in the browser.

fluid.def("fluid.hashManager", {
    $layers: "fluid.resolveRoot",
    // The window whose location is mirrored, or null if there is none, e.g. when rendering under node
    window: null,
    hash: {
        $reactiveRoot: {}
    },
    // Reads the hash on binding and whenever it changes, writing it into `hash`
    hashListener: {
        $bindable: {
            bind: "fluid.hashManager.listen({self}, {self}.window)",
            unbind: "fluid.hashManager.unlisten({boundValue})"
        }
    },
    // Holds the state of every filter bearing hortis.urlMappedFilter in the hash, whilst there is a URL
    urlMappedFilters: {
        $linkage: {
            $if: "{self}.window",
            inputLayers: "hortis.urlMappedFilter",
            outputLayers: "hortis.urlMappedFilter.linked"
        }
    },
    // Writes `hash` into the URL. This waits on the listener, so that the hash first read from the URL is not
    // overwritten. Changes which arrived from the URL carry the source "hash", and are not echoed back to it. Since
    // an effect always runs once its arguments are available, it also compares against the URL's current hash
    pushState: {
        $effect: {
            func: "fluid.hashManager.pushState",
            args: ["{self}.hash", "{self}.window", "{self}.hashListener"],
            excludeSource: "hash"
        }
    }
});

fluid.hashManager.parseSegment = function (segment) {
    const decoded = decodeURIComponent(segment);
    const colonIndex = decoded.indexOf(":");
    const key = decoded.substring(0, colonIndex);
    const value = decoded.substring(colonIndex + 1);
    const parsedValue = value.startsWith("{") || value.startsWith("[") ? JSON.parse(value) : value;
    return [key, parsedValue];
};

fluid.hashManager.renderSegment = function (key, value) {
    return key + ":" + (fluid.isPrimitive(value) ? "" + value : JSON.stringify(value));
};

/**
 * Parse a URL hash into a record.
 * @param {String} hash - The hash, with or without its leading #
 * @return {Object} The record encoded by the hash
 */
fluid.hashManager.parse = function (hash) {
    const sections = (hash || "").replace(/^#/, "").split("&");
    return Object.fromEntries(sections.filter(section => section.includes(":")).map(fluid.hashManager.parseSegment));
};

/**
 * Render a record as a URL hash. Members with `null` or `undefined` values are omitted.
 * @param {Object} record - The record to be rendered
 * @return {String} The hash, beginning with #
 */
fluid.hashManager.render = function (record) {
    const nonEmpty = Object.entries(record).filter(([, value]) => value !== null && value !== undefined);
    return "#" + nonEmpty.map(([key, value]) => fluid.hashManager.renderSegment(key, value)).join("&");
};

/**
 * Determine whether two URL hashes are equivalent, ignoring percent-encoding and an empty hash's #.
 * @param {String} hash1 - The first hash
 * @param {String} hash2 - The second hash
 * @return {Boolean} `true` if the hashes are equivalent
 */
fluid.hashManager.equivalent = function (hash1, hash2) {
    const normalise = hash => decodeURIComponent(hash.replace(/^#/, ""));
    return normalise(hash1) === normalise(hash2);
};

/**
 * Begin listening to a window's hash, writing it into a hash manager now and whenever it changes.
 * @param {fluid.hashManager} that - The hash manager
 * @param {Window|null} window - The window whose hash is to be listened to, or null if there is none
 * @return {Object} A record of the listener, to be supplied to `fluid.hashManager.unlisten`
 */
fluid.hashManager.listen = function (that, window) {
    const apply = fluid.cell.withAmbientSource("hash", () => {
        that.hash = fluid.hashManager.parse(window.location.hash);
    });
    if (window) {
        apply();
        window.addEventListener("hashchange", apply);
        window.addEventListener("popstate", apply);
    }
    return {window, apply};
};

fluid.hashManager.unlisten = function (listener) {
    if (listener.window) {
        listener.window.removeEventListener("hashchange", listener.apply);
        listener.window.removeEventListener("popstate", listener.apply);
    }
};

fluid.hashManager.pushState = function (hash, window) {
    const rendered = fluid.hashManager.render(hash);
    if (window && !fluid.hashManager.equivalent(rendered, window.location.hash)) {
        window.history.pushState(null, null, rendered);
    }
};

fluid.hashManager.noUrl = fluid.unavailable({
    message: "The URL's hash is not available when rendering statically",
    path: ["hashManager", "hash"]
}, "config");

// The global hash manager, mirroring the window's hash. Its hash is decoded here, rather than waiting for its listener
// to bind, so that it is available synchronously to any component which reads it. Under node there is no window with
// a location, and the hash is unavailable
fluid.hashManager.instance = fluid.hashManager(typeof(window) === "undefined" || !window.location ? {
    hash: fluid.hashManager.noUrl
} : {
    window,
    hash: fluid.hashManager.parse(window.location.hash)
});
