<style src="../../css/resize-bar.css"></style>
<script>
"use strict";

// A bar dividing two panes, dragged or moved with the arrow keys to share their space between them - ported to
// Infusion 6 from resize-bar.js. The bar is rendered in place by its parent's template, between the elements it
// divides, which are found as its siblings when it is moved. Their sizes are written as inline styles, which the
// parent's template, having not written them, leaves in place.
fluid.def("hortis.resizeBar", {
    $layers: "fluid.component",
    axis: "horizontal", // "horizontal" | "vertical"
    minBefore: 48,
    minAfter: 48,
    orientation: "$compute:hortis.resizeBar.orientation({self}.axis)"
});

hortis.resizeBar.orientation = axis => axis === "horizontal" ? "vertical" : "horizontal";

// The state of a drag in progress, keyed by the bar's element
hortis.resizeBar.drags = new WeakMap();

hortis.resizeBar.sizeOf = (horizontal, element) => horizontal ? element.getBoundingClientRect().width : element.getBoundingClientRect().height;

/**
 * Share the space of the two panes beside a bar, giving the first `rawBefore` pixels within the limits of each.
 * @param {hortis.resizeBar} that - The bar's component
 * @param {Element} bar - The bar's element
 * @param {Object} drag - The sizes of the panes at the start of the move, with members `startBefore` and `startAfter`
 * @param {Number} rawBefore - The size proposed for the first pane, in pixels
 */
hortis.resizeBar.apply = function (that, bar, drag, rawBefore) {
    const horizontal = that.axis === "horizontal";
    const total = drag.startBefore + drag.startAfter;
    const before = Math.min(Math.max(rawBefore, that.minBefore), total - that.minAfter);
    const property = horizontal ? "width" : "height";
    bar.previousElementSibling.style[property] = (before / total * 100).toFixed(4) + "%";
    bar.nextElementSibling.style[property] = ((total - before) / total * 100).toFixed(4) + "%";
};

hortis.resizeBar.startSizes = function (that, bar) {
    const horizontal = that.axis === "horizontal";
    return {startBefore: hortis.resizeBar.sizeOf(horizontal, bar.previousElementSibling), startAfter: hortis.resizeBar.sizeOf(horizontal, bar.nextElementSibling)};
};

hortis.resizeBar.pointerDown = function (event, that) {
    if (event.button === 0) {
        const bar = event.currentTarget;
        const horizontal = that.axis === "horizontal";
        hortis.resizeBar.drags.set(bar, {...hortis.resizeBar.startSizes(that, bar), startPos: horizontal ? event.clientX : event.clientY});
        bar.setPointerCapture(event.pointerId);
        bar.classList.add("resize-bar--active");
        bar.ownerDocument.body.style.cursor = horizontal ? "col-resize" : "row-resize";
        bar.ownerDocument.body.style.userSelect = "none";
        event.preventDefault();
    }
};

hortis.resizeBar.pointerMove = function (event, that) {
    const bar = event.currentTarget;
    const drag = hortis.resizeBar.drags.get(bar);
    if (drag) {
        const pos = that.axis === "horizontal" ? event.clientX : event.clientY;
        hortis.resizeBar.apply(that, bar, drag, drag.startBefore + pos - drag.startPos);
    }
};

hortis.resizeBar.pointerUp = function (event) {
    const bar = event.currentTarget;
    if (hortis.resizeBar.drags.has(bar)) {
        hortis.resizeBar.drags.delete(bar);
        bar.classList.remove("resize-bar--active");
        bar.ownerDocument.body.style.cursor = "";
        bar.ownerDocument.body.style.userSelect = "";
    }
};

hortis.resizeBar.keyDown = function (event, that) {
    const horizontal = that.axis === "horizontal";
    const shrink = horizontal ? "ArrowLeft" : "ArrowUp";
    const grow = horizontal ? "ArrowRight" : "ArrowDown";
    if (event.key === shrink || event.key === grow) {
        event.preventDefault();
        const step = event.shiftKey ? 4 : 16;
        const drag = hortis.resizeBar.startSizes(that, event.currentTarget);
        hortis.resizeBar.apply(that, event.currentTarget, drag, drag.startBefore + (event.key === grow ? step : -step));
    }
};
</script>

<template>
    <div class="resize-bar resize-bar--@{axis}" role="separator" aria-orientation="@{orientation}" tabindex="0" aria-label="Resize panels"
        @onpointerdown="hortis.resizeBar.pointerDown({0}, {self})" @onpointermove="hortis.resizeBar.pointerMove({0}, {self})"
        @onpointerup="hortis.resizeBar.pointerUp({0})" @onpointercancel="hortis.resizeBar.pointerUp({0})"
        @onkeydown="hortis.resizeBar.keyDown({0}, {self})"></div>
</template>
