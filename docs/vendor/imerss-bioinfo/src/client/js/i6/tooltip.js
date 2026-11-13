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

// Least distance in pixels to keep between the tooltip and the window's edge
hortis.tooltip.windowMargin = 8;

/**
 * Displace a tooltip from the pointer, flipping it to the pointer's left if it would overflow the window's right
 * edge, and lifting it if it would overflow the bottom. Popper lite omits the offset, flip and preventOverflow
 * modifiers, so this does the work of all three for a tooltip at the pointer.
 * @param {Object} options - Popper's arguments to a modifier
 * @param {Object} options.state - Popper's state, whose `modifiersData.popperOffsets` are adjusted in place
 */
hortis.tooltip.placeAtPointer = function ({state}) {
    const offsets = state.modifiersData.popperOffsets;
    if (offsets) {
        const {x: dx, y: dy} = hortis.tooltip.pointerOffset;
        const {width, height} = state.rects.popper;
        const window = state.elements.popper.ownerDocument.defaultView;
        const margin = hortis.tooltip.windowMargin;
        offsets.x = offsets.x + dx + width + margin <= window.innerWidth ?
            offsets.x + dx : Math.max(margin, offsets.x - dx - width);
        offsets.y = offsets.y + dy + height + margin <= window.innerHeight ?
            offsets.y + dy : Math.max(margin, window.innerHeight - height - margin);
    }
};

hortis.tooltip.pointerOffsetModifier = {
    name: "pointerOffset",
    enabled: true,
    phase: "main",
    requires: ["popperOffsets"],
    fn: hortis.tooltip.placeAtPointer
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

/** Dismissal of tooltips on touch screens **/

/**
 * Put away every tooltip when the screen is touched. A touch screen imitates hovering by moving its pointer to whatever
 * is tapped, so that a tap on something with a tooltip shows it - but a tap on anything else sends no movement at all,
 * and a tooltip once shown would never be hidden. So every component showing tooltips is cleared as a touch begins,
 * and a tap on something with a tooltip then shows it again at once, by the movement the browser sends to it.
 * Touches within the tooltip itself are left alone, so that a link in it may be followed, as are those within an
 * element marked `data-hortis-tap-tooltips`, which manages the tooltips shown by tapping it - e.g. a map, see
 * hortis.libreMap.bindTapTooltips.
 * @param {Window} window - The window whose touches put the tooltips away
 */
hortis.tooltip.dismissOnTouch = function (window) {
    if (!window.hortisTooltipDismissal) {
        window.hortisTooltipDismissal = true;
        window.addEventListener("pointerdown", event => {
            if (event.pointerType === "touch" && !event.target.closest?.(".imerss-tooltip-holder, [data-hortis-tap-tooltips]")) {
                fluid.queryILSelector(fluid.globalInstantiator.rootComponent, "hortis.withTooltip")
                    .filter(that => !fluid.isUnavailable(that))
                    .forEach(that => that.hoverAt(null));
            }
        }, true);
    }
};

// Only in a browser
if (typeof window !== "undefined" && window.addEventListener) {
    hortis.tooltip.dismissOnTouch(window);
}

/** Tooltips of elements bearing a title **/

// Shows the title of whatever element is hovered within its scope in a tooltip of its own, in place of the browser's -
// as jQuery UI's tooltip widget did for the Infusion 4 visualisations. Whilst an element is hovered, its title is held
// in its attribute data-hortis-title, so that the browser shows nothing, and it is restored once the pointer leaves
fluid.def("hortis.titleTooltips", {
    $layers: "hortis.withTooltip",
    // Selector for the elements within which titles are shown as tooltips
    titleScope: ".imerss-container, .imerss-main",
    renderTooltip: "$method:hortis.titleTooltips.render({0}:title)",
    titleListeners: {
        $bindable: {
            bind: "hortis.titleTooltips.bind({self}, {global}.document, {self}.titleScope)",
            unbind: "hortis.titleTooltips.unbind({boundValue})"
        }
    }
});

hortis.titleTooltips.render = function (title) {
    return `<div class="imerss-tooltip imerss-title-tooltip">${hortis.encodeHTML(String(title))}</div>`;
};

/**
 * Find the element whose title is to be shown for a hovered node - the nearest bearing a title, within the scope and
 * not itself within a tooltip.
 * @param {Node} target - The hovered node
 * @param {String} scope - Selector for the elements within which titles are shown
 * @return {Element|null} The titled element, if any
 */
hortis.titleTooltips.titled = function (target, scope) {
    const element = target?.closest ? target.closest("[title], [data-hortis-title]") : null;
    return element && element.closest(scope) && !element.closest(".imerss-tooltip-holder") ? element : null;
};

/**
 * Take the title of a hovered element into its data-hortis-title attribute, so that the browser shows no tooltip of
 * its own.
 * @param {Element} element - The hovered element
 * @return {String} The element's title
 */
hortis.titleTooltips.take = function (element) {
    const title = element.getAttribute("title");
    if (title !== null) {
        element.setAttribute("data-hortis-title", title);
        element.removeAttribute("title");
    }
    return element.getAttribute("data-hortis-title");
};

/**
 * Restore the title of an element no longer hovered, unless it has been given a new one in the meantime.
 * @param {Element} element - The element
 */
hortis.titleTooltips.restore = function (element) {
    const title = element.getAttribute("data-hortis-title");
    if (title !== null && element.getAttribute("title") === null) {
        element.setAttribute("title", title);
    }
    element.removeAttribute("data-hortis-title");
};

/**
 * Bind the listeners showing the titles of hovered elements. The tooltip is hidden on scrolling, since it would
 * otherwise be left where the element was.
 * @param {hortis.titleTooltips} that - The tooltips
 * @param {Document} dokkument - The document
 * @param {String} scope - Selector for the elements within which titles are shown
 * @return {Object} A record of the listeners, to be supplied to `hortis.titleTooltips.unbind`
 */
hortis.titleTooltips.bind = function (that, dokkument, scope) {
    const record = {dokkument, current: null};
    const leave = () => {
        if (record.current) {
            hortis.titleTooltips.restore(record.current);
            record.current = null;
            that.hoverAt(null);
        }
    };
    record.over = event => {
        const element = hortis.titleTooltips.titled(event.target, scope);
        if (element !== record.current) {
            leave();
            if (element) {
                record.current = element;
                const title = hortis.titleTooltips.take(element);
                that.hoverAt(title || null, event);
            }
        }
    };
    record.move = event => {
        if (record.current) {
            that.hoverAt(record.current.getAttribute("data-hortis-title") || null, event);
        }
    };
    record.out = event => {
        if (record.current && !(event.relatedTarget && record.current.contains(event.relatedTarget))) {
            leave();
        }
    };
    record.leave = leave;
    dokkument.addEventListener("mouseover", record.over);
    dokkument.addEventListener("mousemove", record.move);
    dokkument.addEventListener("mouseout", record.out);
    dokkument.addEventListener("scroll", leave, true);
    dokkument.addEventListener("mousedown", leave, true);
    return record;
};

hortis.titleTooltips.unbind = function (record) {
    record.leave();
    record.dokkument.removeEventListener("mouseover", record.over);
    record.dokkument.removeEventListener("mousemove", record.move);
    record.dokkument.removeEventListener("mouseout", record.out);
    record.dokkument.removeEventListener("scroll", record.leave, true);
    record.dokkument.removeEventListener("mousedown", record.leave, true);
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
