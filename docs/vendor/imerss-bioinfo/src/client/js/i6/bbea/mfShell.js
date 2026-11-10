/*
Copyright 2025-2026 Antranig Basman
Licensed under the Educational Community License (ECL), Version 2.0 or the New
BSD license. You may not use this file except in compliance with one these
Licenses.
You may obtain a copy of the ECL 2.0 License and BSD License at
https://github.com/fluid-project/infusion/raw/master/Infusion-LICENSE.txt
*/

"use strict";

// The state behind the shell of the BBEA page, ported to Infusion 6 from the since removed src/client/js/new/imerss-bbea.js - the grips
// resizing and collapsing its panes and its full screen mode, and the layer borne by its downloadable views. Their markup is part
// of the template of hortis.beaVizLoader, which binds to the state held here, and whose event handlers call the
// functions here.

// noinspection ES6ConvertVarToLetConst // otherwise this is a duplicate on minifying
var hortis = fluid.registerNamespace("hortis");

/** Shell grips and full screen **/

// The sizes of the shell's panes, which of them are collapsed, and whether the shell is shown in full screen
fluid.def("hortis.mfShell", {
    $layers: "fluid.component",
    // Distance in pixels a pointer must move on a grip's tab before a press counts as a drag
    dragSlop: 3,
    // Width in pixels of the filter pane, or null for its default
    filterWidth: null,
    // Share in percent of the middle pane given to the map, or null for its default
    mapShare: null,
    filtersClosed: false,
    viewsClosed: false,
    // true whilst a grip is being dragged
    dragging: false,
    fullScreen: false,
    // The style of the shell's root, holding the custom properties sizing its panes
    rootStyle: "$compute:hortis.mfShell.rootStyle({self}.filterWidth, {self}.mapShare)",
    filtersGripLabel: "$compute:hortis.mfShell.gripLabel({self}.filtersClosed, filters)",
    viewsGripLabel: "$compute:hortis.mfShell.gripLabel({self}.viewsClosed, views)",
    fullScreenEffect: "$effect:hortis.mfShell.applyFullScreen({self}.fullScreen, {global}.document)"
});

/**
 * Compute the style of the shell's root from the sizes of its panes.
 * @param {Number|null} filterWidth - Width in pixels of the filter pane, or null for its default
 * @param {Number|null} mapShare - Share in percent of the middle pane given to the map, or null for its default
 * @return {String|null} The style, or null if neither has been set
 */
hortis.mfShell.rootStyle = function (filterWidth, mapShare) {
    const props = [
        ...(filterWidth === null ? [] : [`--mf-col-filters: ${filterWidth}px`]),
        ...(mapShare === null ? [] : [`--mf-row-map: ${mapShare}fr`, `--mf-row-net: ${100 - mapShare}fr`])
    ];
    return props.length > 0 ? props.join("; ") : null;
};

hortis.mfShell.gripLabel = (closed, what) => (closed ? "Expand " : "Collapse ") + what;

/**
 * Collapse or restore the pane beside a grip.
 * @param {hortis.mfShell} shell - The shell
 * @param {HTMLElement} grip - A `.mf-grip` element carrying `data-axis`
 */
hortis.mfShell.toggleGrip = function (shell, grip) {
    if (grip.dataset.axis === "y") {
        shell.viewsClosed = !shell.viewsClosed;
    } else {
        shell.filtersClosed = !shell.filtersClosed;
    }
};

/**
 * Resize the panes beside a grip.
 * @param {hortis.mfShell} shell - The shell
 * @param {HTMLElement} grip - The grip being moved, carrying `data-axis`, and `data-min` and `data-max` if it moves in x
 * @param {Number} position - The new position of the grip in client coordinates on its axis
 */
hortis.mfShell.moveGrip = function (shell, grip, position) {
    const root = grip.closest(".imerss-container");
    if (grip.dataset.axis === "y") {
        const box = root.querySelector(".mf-middle").getBoundingClientRect();
        const raw = (position - box.top) / box.height * 100;
        shell.mapShare = Math.min(82, Math.max(18, raw));
    } else {
        const box = root.querySelector(".mf-shell").getBoundingClientRect();
        const size = position - box.left;
        shell.filterWidth = Math.min(Number(grip.dataset.max), Math.max(Number(grip.dataset.min), size));
    }
};

// The state of each grip being pressed, which is no business of the reactive graph
hortis.mfShell.presses = new WeakMap();

hortis.mfShell.axisPos = (grip, event) => grip.dataset.axis === "y" ? event.clientY : event.clientX;

hortis.mfShell.pointerDown = function (event, shell) {
    const grip = event.currentTarget;
    const tab = grip.querySelector(".mf-grip-tab");
    // Capture retargets later events to the grip, so decide here whether the press began on the tab
    hortis.mfShell.presses.set(grip, {
        origin: hortis.mfShell.axisPos(grip, event),
        moved: false,
        onTab: tab !== null && tab.contains(event.target)
    });
    grip.setPointerCapture(event.pointerId);
    shell.dragging = true;
};

hortis.mfShell.pointerMove = function (event, shell) {
    const grip = event.currentTarget;
    const press = hortis.mfShell.presses.get(grip);
    if (press) {
        const position = hortis.mfShell.axisPos(grip, event);
        if (Math.abs(position - press.origin) > shell.dragSlop) {
            press.moved = true;
        }
        if (press.moved) {
            hortis.mfShell.moveGrip(shell, grip, position);
        }
    }
};

hortis.mfShell.pointerUp = function (event, shell) {
    const grip = event.currentTarget;
    const press = hortis.mfShell.presses.get(grip);
    if (press) {
        grip.releasePointerCapture(event.pointerId);
        hortis.mfShell.presses.delete(grip);
        if (press.onTab && !press.moved) {
            hortis.mfShell.toggleGrip(shell, grip);
        }
    }
    shell.dragging = false;
};

hortis.mfShell.keyDown = function (event, shell) {
    const grip = event.currentTarget;
    const less = event.key === "ArrowLeft" || event.key === "ArrowUp";
    const more = event.key === "ArrowRight" || event.key === "ArrowDown";
    if (less || more) {
        event.preventDefault();
        const box = grip.getBoundingClientRect();
        const centre = grip.dataset.axis === "y" ? box.top + box.height / 2 : box.left + box.width / 2;
        hortis.mfShell.moveGrip(shell, grip, centre + (more ? 20 : -20));
    } else if (event.key === "Enter") {
        event.preventDefault();
        hortis.mfShell.toggleGrip(shell, grip);
    }
};

/**
 * Enter or leave full screen mode. Since the effect runs once on startup, leaving full screen when not in it is
 * harmless.
 * @param {Boolean} enabled - `true` if full screen mode is to be entered
 * @param {Document} dokkument - The document holding the shell
 */
hortis.mfShell.applyFullScreen = async function (enabled, dokkument) {
    dokkument.body.classList.toggle("imerss-fullscreen-mode", enabled);
    try {
        if (enabled) {
            await dokkument.querySelector(".imerss-container").requestFullscreen();
        } else if (dokkument.fullscreenElement) {
            await dokkument.exitFullscreen();
        }
    } catch (e) {
        fluid.log("Full screen request failed: ", e);
    }
};

/** Downloadable views **/

// A view in the views pane which can download its contents - see hortis.bbeaViewTabs
fluid.def("hortis.downloadableView", {
    $layers: "fluid.component"
    // tabId: String
    // download: $method
});
