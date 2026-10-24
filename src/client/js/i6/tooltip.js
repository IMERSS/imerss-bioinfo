/*
Copyright 2017-2026 Antranig Basman
Licensed under the Educational Community License (ECL), Version 2.0 or the New
BSD license. You may not use this file except in compliance with one these
Licenses.
You may obtain a copy of the ECL 2.0 License and BSD License at
https://github.com/fluid-project/infusion/raw/master/Infusion-LICENSE.txt
*/

"use strict";

// Tooltips which follow the pointer, ported to Infusion 6 - these replace the jQuery UI tooltips driven by
// hortis.withTooltip in src/client/js/new/imerss-new.js, which needed some care to clean up after widgets whose DOM
// had been re-rendered beneath them, and which made jQuery a dependency of every visualisation. Here a component holds
// the id of what is hovered and where, and an effect shows its tooltip element, placed by Popper lite
// (@popperjs/core's popper-lite.js) against a virtual element at the pointer.

// noinspection ES6ConvertVarToLetConst // otherwise this is a duplicate on minifying
var hortis = fluid.registerNamespace("hortis");

// A component showing a tooltip for whatever item is hovered, as rendered by its method `renderTooltip`
fluid.def("hortis.withTooltip", {
    $layers: "fluid.component",
    // The id of the hovered item, or null if none
    hoverId: null,
    // The pointer's position, as {x, y} in client coordinates
    hoverPos: null,
    // renderTooltip: $method accepting a hovered id, returning the tooltip's markup or null if there is none
    tooltipContent: "$compute:hortis.tooltip.content({self}, {self}.hoverId)",
    tooltip: {
        $bindable: {
            // The global object is passed whole, since a reference {global}.Popper to a missing global would be unavailable
            bind: "hortis.tooltip.make({global}.document, {global})",
            unbind: "hortis.tooltip.destroy({boundValue})"
        }
    },
    showTooltip: "$effect:hortis.tooltip.show({self}.tooltip, {self}.tooltipContent, {self}.hoverPos)",
    // Called by event handlers with the hovered id, or null, and the event
    hoverAt: "$method:hortis.tooltip.hoverAt({self}, {0}:id, {1}:event)"
});

fluid.registerNamespace("hortis.tooltip");

// A renderTooltip for components which show no tooltip
hortis.tooltip.none = () => null;

hortis.tooltip.content = function (that, hoverId) {
    return hortis.isValue(hoverId) ? that.renderTooltip(hoverId) : null;
};

// Distance in pixels of the tooltip from the pointer
hortis.tooltip.pointerOffset = {x: 12, y: 8};

// Popper lite omits the offset modifier, so displace the tooltip from the pointer with a minimal modifier of our own
hortis.tooltip.pointerOffsetModifier = {
    name: "pointerOffset",
    enabled: true,
    phase: "main",
    requires: ["popperOffsets"],
    fn: ({state}) => {
        const offsets = state.modifiersData.popperOffsets;
        if (offsets) {
            offsets.x += hortis.tooltip.pointerOffset.x;
            offsets.y += hortis.tooltip.pointerOffset.y;
        }
    }
};

/**
 * A tooltip's element, the virtual element at the pointer against which it is placed, and the Popper instance
 * placing it.
 * @typedef {Object} TooltipRecord
 * @property {HTMLElement} node - The tooltip's element
 * @property {Object} anchor - A virtual element whose bounds are the pointer's position, as held at `pos`
 * @property {Object} [popper] - The Popper instance, if Popper is loaded
 */

/**
 * Create a tooltip's element and the Popper instance placing it.
 * @param {Document} dokkument - The document to hold the tooltip
 * @param {Object} global - The global object, which may supply the Popper lite library as `Popper`
 * @return {TooltipRecord} The tooltip
 */
hortis.tooltip.make = function (dokkument, global) {
    const Popper = global.Popper;
    const node = dokkument.createElement("div");
    node.className = "imerss-tooltip-holder";
    node.setAttribute("role", "tooltip");
    node.hidden = true;
    dokkument.body.appendChild(node);
    const anchor = {
        pos: {x: 0, y: 0},
        getBoundingClientRect: () => {
            const {x, y} = anchor.pos;
            return {x, y, left: x, top: y, right: x, bottom: y, width: 0, height: 0};
        }
    };
    const popper = Popper ? Popper.createPopper(anchor, node, {
        placement: "bottom-start",
        strategy: "fixed",
        modifiers: [hortis.tooltip.pointerOffsetModifier]
    }) : null;
    return {node, anchor, popper};
};

hortis.tooltip.destroy = function (tooltip) {
    tooltip.popper?.destroy();
    tooltip.node.remove();
};

hortis.tooltip.hoverAt = function (that, id, event) {
    that.hoverId = hortis.isValue(id) ? id : null;
    that.hoverPos = event && event.clientX !== undefined ? {x: event.clientX, y: event.clientY} : null;
};

/**
 * Show, place or hide a tooltip.
 * @param {TooltipRecord} tooltip - The tooltip
 * @param {String|null} content - The tooltip's markup, or null if it is to be hidden
 * @param {Object|null} pos - The pointer's position, as {x, y} in client coordinates
 */
hortis.tooltip.show = function (tooltip, content, pos) {
    const node = tooltip.node;
    if (content && pos) {
        if (node.innerHTML !== content) {
            node.innerHTML = content;
        }
        node.hidden = false;
        tooltip.anchor.pos = pos;
        tooltip.popper?.update();
    } else {
        node.hidden = true;
    }
};

/** Taxon tooltips **/

hortis.taxonTooltipTemplate =
    `<div class="imerss-tooltip">
    <div class="imerss-photo" style="background-image: url(%imgUrl)"></div>
    <div class="text"><b>%taxonRank:</b> %taxonNames</div>
</div>`;

hortis.renderTaxonTooltip = function (rowById, hoverId) {
    const row = rowById[hoverId];
    return row ? hortis.stringTemplate(hortis.taxonTooltipTemplate, {
        imgUrl: hortis.rowToLinkTaxonImage(row) || "",
        taxonRank: row.rank ? hortis.capitalize(row.rank) : "Species",
        taxonNames: [hortis.rowToScientific(row), row.commonName, row.hulqName].filter(name => name).join(" / ")
    }) : null;
};

// Shows a tooltip for a hovered taxon
fluid.def("hortis.withTaxonTooltip", {
    $layers: "hortis.withTooltip",
    // rowById: Object<String, TaxonRow>
    renderTooltip: "$method:hortis.renderTaxonTooltip({self}.rowById, {0}:hoverId)"
});
