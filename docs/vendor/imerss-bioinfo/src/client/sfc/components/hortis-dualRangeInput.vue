<style src="%@stanko/dual-range-input/dist/index.css"></style>
<script>
"use strict";

// A dual range input ported to Infusion 6 - corresponds to the since removed src/client/js/new/dual-range-input.js

fluid.registerNamespace("hortis.dualRangeInput");

// The time in milliseconds for which the thumbs must rest before the values slid to are written to the range - see
// the `commitSliding` effect
hortis.dualRangeInput.commitDelay = 150;

fluid.def("hortis.dualRangeInput", {
    $layers: "fluid.component",
    // minRange: Number, maxRange: Number - the bounds of the range
    unit: "",
    // The name of a global function formatting a value of the range for display, or null to show it as it is,
    // followed by the unit
    formatter: null,
    // If true, the values chosen are shown beneath the thumbs which choose them, following them as they are slid
    thumbLabels: false,
    // Values at which detents are marked on the track, e.g. the first day of each month
    ticks: [],
    // Labels of the spaces between successive ticks, e.g. the months, each with members `long` and `short` - the long
    // label is shown when the input is wider than 300px, and the short one otherwise - or null to label none
    tickLabels: null,
    // If true, the bounds of the range and the range chosen are shown in a row beneath the input
    valueLabels: true,
    // If true, the inputs are disabled
    disabled: false,
    // The chosen range. Each member tracks its bound until the user moves it, and is overwritten whenever the bound
    // changes, as did Infusion 4's fluid.delegatedSignal
    range: {
        $reactiveRoot: {
            min: null,
            max: null
        },
        min: "{self}.minRange",
        max: "{self}.maxRange"
    },
    // The values to which the thumbs have been slid but which are not yet written to `range`, with members `min` and
    // `max`, or null if there are none - see hortis.dualRangeInput.input. Shown at once by the labels, whilst the
    // costlier work of filtering by them follows only once the thumbs come to rest
    sliding: null,
    shownRange: "$compute:hortis.dualRangeInput.shownRange({self}.range, {self}.sliding)",
    // The text and position of each value shown - see hortis.dualRangeInput.labels
    labels: "$compute:hortis.dualRangeInput.labels({self}.shownRange, {self}.minRange, {self}.maxRange, {self}.unit, {self}.formatter)",
    // The scale above the track, marking the ticks and labelling the spaces between them
    scale: {
        $component: {
            $layers: "fluid.component",
            markup: "$compute:hortis.dualRangeInput.scaleMarkup({dualRangeInput}.ticks, {dualRangeInput}.tickLabels, {dualRangeInput}.minRange, {dualRangeInput}.maxRange)",
            view: {
                $component: {
                    $layers: "fluid.templateViewComponent",
                    template: "{scale}.markup"
                }
            }
        }
    },
    view: {
        $component: {
            elideParent: false
        }
    },
    // The widget arranging the two inputs, constructed once the markup is rendered
    control: {
        $bindable: {
            bind: "hortis.dualRangeInput.makeControl({self}, {self}.view.renderedContainer)",
            unbind: "hortis.dualRangeInput.destroyControl({boundValue})",
            onceOnly: true
        }
    },
    // Writes the values slid to into the range once the thumbs have rested for a moment. The range usually filters a
    // whole dataset, and redraws whatever shows it, which costs far more than the interval between input events - were
    // it written as each arrived, or even once per task as they arrive, the thumb would be repainted only between
    // redraws and lag behind the pointer. Waiting until the values have rested leaves the browser free to repaint the
    // thumb throughout a drag, and writes the range once with its latest values. The write is the component's own, so
    // that its effect moving the inputs does not move them back
    commitSliding: {
        $effect: {
            func: "hortis.dualRangeInput.commit",
            args: ["{self}", "{self}.sliding"],
            debounce: hortis.dualRangeInput.commitDelay,
            source: "self"
        }
    },
    // Moves the inputs to the range and its bounds. A change the user made through the inputs is already shown by them,
    // and is not written back
    updateControl: {
        $effect: {
            func: "hortis.dualRangeInput.updateControl",
            args: ["{self}.control", "{self}.range", "{self}.minRange", "{self}.maxRange"],
            excludeSource: "self"
        }
    }
});

/**
 * Record a value to which a thumb has been slid, which the labels show at once, and which is written to the input's
 * `range` once the thumbs have rested - see the `commitSliding` effect.
 * @param {Event} event - The input event
 * @param {hortis.dualRangeInput} that - The dual range input
 * @param {String} which - `min` or `max`, naming the thumb slid
 */
hortis.dualRangeInput.input = function (event, that, which) {
    that.sliding = {...that.shownRange, [which]: +event.target.value};
};

/**
 * Write the values slid to into a dual range input's range. Does nothing if none are pending.
 * @param {hortis.dualRangeInput} that - The dual range input
 * @param {Object|null} sliding - The values slid to, with members `min` and `max`, or null if there are none
 */
hortis.dualRangeInput.commit = function (that, sliding) {
    if (sliding) {
        // Both bounds are written at once, so that no range is ever seen holding one new bound and one old - which,
        // were both thumbs slid past each other's old values, would be inverted
        that.range = {min: sliding.min, max: sliding.max};
        that.sliding = null;
    }
};

/**
 * The range shown by the labels - the range, or the values slid to whilst they are yet to be written to it.
 * @param {Object} range - The range chosen, with members `min` and `max`
 * @param {Object|null} sliding - The values slid to, with members `min` and `max`, or null if none are pending
 * @return {Object} The range shown, with members `min` and `max`
 */
hortis.dualRangeInput.shownRange = function (range, sliding) {
    return sliding || range;
};

/**
 * Compute the text of each value shown by a dual range input, and the position of each value chosen along the track.
 * @param {Object} range - The range chosen, with members `min` and `max`
 * @param {Number} minRange - The lower bound of the range
 * @param {Number} maxRange - The upper bound of the range
 * @param {String} unit - The unit of a value shown without a formatter
 * @param {String|null} formatter - The name of a global function formatting a value, or null
 * @return {Object} Members `lower` and `upper`, the text of the bounds, `min` and `max`, the text of the values
 * chosen, `span`, the text of the range chosen, and `minPos` and `maxPos`, the positions of the values chosen as
 * percentages of the track
 */
hortis.dualRangeInput.labels = function (range, minRange, maxRange, unit, formatter) {
    const format = formatter ? fluid.getGlobalValue(formatter) : value => value + unit;
    const extent = maxRange - minRange || 1;
    const position = value => (100 * (value - minRange) / extent).toFixed(2);
    return {
        lower: format(minRange),
        upper: format(maxRange),
        min: format(range.min),
        max: format(range.max),
        span: formatter ? format(range.min) + " - " + format(range.max) : range.min + " - " + range.max + unit,
        minPos: position(range.min),
        maxPos: position(range.max)
    };
};

/**
 * Compute the markup of a dual range input's scale - an element for each tick, and a label centred in the space between
 * each tick and the next. Each tick is drawn by its border, which the browser draws a whole number of device pixels
 * wide at any zoom, so that every tick is drawn the same width - a gradient of the same width, as the scale was once
 * drawn, falls across device pixels differently at each tick.
 * @param {Number[]} ticks - The values at which ticks are marked, in ascending order
 * @param {Object[]|null} tickLabels - The labels of the spaces between successive ticks, each with members `long` and
 * `short`, or null if there are none
 * @param {Number} minRange - The lower bound of the range
 * @param {Number} maxRange - The upper bound of the range
 * @return {String} The scale's markup
 */
hortis.dualRangeInput.scaleMarkup = function (ticks, tickLabels, minRange, maxRange) {
    const extent = maxRange - minRange || 1;
    const position = value => (100 * (value - minRange) / extent).toFixed(3);
    const tickMarkup = ticks.map(tick => `<span class="dual-range-tick" style="left: ${position(tick)}%"></span>`);
    const labelMarkup = (tickLabels || []).slice(0, Math.max(ticks.length - 1, 0)).map((label, i) =>
        `<span class="dual-range-tick-label" style="left: ${position((ticks[i] + ticks[i + 1]) / 2)}%">` +
        `<span class="dual-range-tick-label-long">${hortis.encodeHTML(label.long)}</span>` +
        `<span class="dual-range-tick-label-short">${hortis.encodeHTML(label.short)}</span></span>`);
    const labelled = labelMarkup.length ? " dual-range-scale-labelled" : "";
    return `<div class="dual-range-scale${labelled}">${tickMarkup.join("")}${labelMarkup.join("")}</div>`;
};

hortis.dualRangeInput.reset = function (that) {
    that.range = {min: that.minRange, max: that.maxRange};
};

// Adapted from sample at https://muffinman.io/blog/native-dual-range-input/

class DualRangeInput {
    $min;
    $max;
    precision;

    /**
     * @param {HTMLInputElement} $min - The range input element for the minimum value
     * @param {HTMLInputElement} $max - The range input element for the maximum value
     * @param {Number} [precision=3] - The number of decimal places to round the mid value to, defaults to 3
     */
    constructor(
        $min,
        $max,
        precision = 3
    ) {
        this.updateFloor = () => this.update("floor");
        this.updateCeil = () => this.update("ceil");

        this.$min = $min;
        this.$max = $max;
        this.precision = precision;

        this.$min.addEventListener("input", this.updateCeil);
        this.$max.addEventListener("input", this.updateFloor);

        this.$min.addEventListener("focus", this.updateCeil);
        this.$max.addEventListener("focus", this.updateFloor);

        // Unfortunately Safari doesn't trigger focus on mousedown or touchstart
        // like other browsers do, so we have to listen for those events as well
        this.$min.addEventListener("mousedown", this.updateCeil);
        this.$max.addEventListener("mousedown", this.updateFloor);

        this.$min.addEventListener("touchstart", this.updateCeil);
        this.$max.addEventListener("touchstart", this.updateFloor);

        // The least separation of the thumbs depends on the width of the input, which changes, e.g. as a collapsed panel
        // holding it is expanded. A document which is not laid out, e.g. one rendered under node, has no such observer
        const ResizeObserver = $min.ownerDocument.defaultView.ResizeObserver;
        this.resizeObserver = ResizeObserver ? new ResizeObserver(() => this.update()) : null;
        if (this.resizeObserver) {
            this.resizeObserver.observe($min.parentElement);
        }

        this.update();

        this.$min.dataset.ready = "true";
        this.$max.dataset.ready = "true";
    }

    /**
     * Lay out the two inputs, so that each value lies at the same place along the track whichever thumb is set to it,
     * and that place is that of the thumb's centre - as the scale above the track marks it. A native range input of
     * width w, whose thumb is t wide, places the centre of its thumb a fraction f of the way through its range at
     * t / 2 + f * (w - t), so that, across the whole input of width W, a value a fraction p of the way through the
     * range must lie at t / 2 + p * (W - t). The lower input spans the values from the lower end of the range to a split
     * value, m1, and the upper input those from m2 to the upper end, where m2 lies above m1 by at least the values
     * spanned by one thumb width - so that, holding these at their places, the lower input ends no further along than
     * the upper begins, and the thumbs never overlap. A gap left between the inputs, since m2 - m1 is rounded up to a
     * whole number of steps, is less than a step wide. The split lies midway between the thumbs, rounded towards the
     * upper thumb if the lower is being slid, and towards the lower if the upper, so that the thumb being slid has room.
     * @param {String} [method] - "ceil" if the lower thumb is being slid, or "floor" if the upper
     */
    update(method = "ceil") {
        const thumbWidthVar = "var(--dri-thumb-width)";

        const min = parseFloat(this.$min.min);
        const max = parseFloat(this.$max.max);
        const step = parseFloat(this.$min.step) || 1;
        const minValue = parseFloat(this.$min.value);
        const maxValue = parseFloat(this.$max.value);
        const range = max - min || 1;

        // The values spanned by one thumb width, the least by which the thumbs' values may differ - unknown whilst the
        // input is not laid out, e.g. in a collapsed panel, whereupon it is computed once it is, or in a document which
        // is never laid out, e.g. one rendered under node, whereupon the thumbs may take any values
        const width = this.$min.parentElement.clientWidth;
        const window = this.$min.ownerDocument.defaultView;
        const thumbWidth = window.getComputedStyle ? parseFloat(window.getComputedStyle(this.$min).minWidth) || 0 : 0;
        const thumbSpan = width > thumbWidth ? thumbWidth * range / (width - thumbWidth) : 0;
        const gap = Math.min(Math.ceil(thumbSpan / step) * step, range);

        const slack = Math.max(maxValue - minValue - gap, 0);
        const m1 = Math.min(minValue + Math[method](slack / 2 / step) * step, max - gap);
        const m2 = m1 + gap;

        // The fractions of the range at which the lower input ends and the upper begins
        const p1 = ((m1 - min) / range).toFixed(this.precision);
        const p2 = ((m2 - min) / range).toFixed(this.precision);
        const span = `(100% - ${thumbWidthVar})`;

        this.$min.style.flexBasis = `calc(${thumbWidthVar} + ${p1} * ${span})`;
        this.$max.style.flexBasis = `calc(${thumbWidthVar} + (1 - ${p2}) * ${span})`;
        this.$max.style.marginInlineStart = `calc((${p2} - ${p1}) * ${span} - ${thumbWidthVar})`;

        this.$min.max = m1;
        this.$max.min = m2;

        // The track of each input is filled from its thumb's centre towards the other thumb
        const minFill = (minValue - min) / (m1 - min) || 0;
        const maxFill = (maxValue - m2) / (max - m2) || 0;

        const minFillPercentage = (minFill * 100).toFixed(this.precision);
        const maxFillPercentage = (maxFill * 100).toFixed(this.precision);

        const minFillThumb = (0.5 - minFill).toFixed(this.precision);
        const maxFillThumb = (0.5 - maxFill).toFixed(this.precision);

        this.$min.style.setProperty(
            "--dri-gradient-position",
            `calc(${minFillPercentage}% + (${minFillThumb} * ${thumbWidthVar}))`
        );
        this.$max.style.setProperty(
            "--dri-gradient-position",
            `calc(${maxFillPercentage}% + (${maxFillThumb} * ${thumbWidthVar}))`
        );
    }

    destroy() {
        this.$min.removeEventListener("input", this.updateCeil);
        this.$max.removeEventListener("input", this.updateFloor);

        this.$min.removeEventListener("focus", this.updateCeil);
        this.$max.removeEventListener("focus", this.updateFloor);

        this.$min.removeEventListener("mousedown", this.updateCeil);
        this.$max.removeEventListener("mousedown", this.updateFloor);

        this.$min.removeEventListener("touchstart", this.updateCeil);
        this.$max.removeEventListener("touchstart", this.updateFloor);

        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
        }
    }
}

/**
 * Construct the widget arranging the two inputs.
 * @param {hortis.dualRangeInput} that - The dual range input
 * @param {HTMLElement} container - Its rendered container
 * @return {DualRangeInput} The widget
 */
hortis.dualRangeInput.makeControl = function (that, container) {
    return new DualRangeInput(container.querySelector(".dual-range-min"), container.querySelector(".dual-range-max"));
};

hortis.dualRangeInput.destroyControl = function (control) {
    control.destroy();
};

hortis.dualRangeInput.updateControl = function (control, range, minRange, maxRange) {
    // Each input must span the whole range before its value is set, else a value beyond the split between them, as
    // last laid out, is clamped to it - update then splits the range afresh
    control.$min.min = minRange;
    control.$min.max = maxRange;
    control.$max.min = minRange;
    control.$max.max = maxRange;
    control.$min.value = range.min;
    control.$max.value = range.max;
    control.update();
};
</script>

<template>
    <div class="dual-range-holder" @class="dual-range-disabled:@{disabled}">
        <div @id="scale"></div>
        <div class="dual-range-input">
            <input type="range" step="1" class="dual-range-min" disabled="@{disabled}" @oninput="hortis.dualRangeInput.input({0}, {self}, min)"/>
            <input type="range" step="1" class="dual-range-max" disabled="@{disabled}" @oninput="hortis.dualRangeInput.input({0}, {self}, max)"/>
        </div>
        <div class="dual-range-thumb-labels" @class="dual-range-thumb-labels-shown:@{thumbLabels}">
            <span class="dual-range-thumb-label dual-range-thumb-min" style="--dri-thumb-pos: @{labels.minPos}">@{labels.min}</span>
            <span class="dual-range-thumb-label dual-range-thumb-max" style="--dri-thumb-pos: @{labels.maxPos}">@{labels.max}</span>
        </div>
        <div class="dual-range-values" @class="fl-hidden:!@{valueLabels}">
            <span>@{labels.lower}</span>
            <span>@{labels.span}</span>
            <span>@{labels.upper}</span>
        </div>
    </div>
</template>
