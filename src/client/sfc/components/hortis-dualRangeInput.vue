<style src="%@stanko/dual-range-input/dist/index.css"></style>
<script>
"use strict";

// A dual range input ported to Infusion 6 - corresponds to the since removed src/client/js/new/dual-range-input.js

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
    // The values to which the thumbs have been slid but which are not yet written to `range`, or null if there are none -
    // see hortis.dualRangeInput.input. Shown at once by the labels, whilst the costlier work of filtering by them
    // follows, once the browser is free of the input events which slid them
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
 * Record a value to which a thumb has been slid, and arrange for it to be written to the input's `range`. The range
 * usually filters a whole dataset, and redraws whatever shows it, which is far too costly to do as each input event
 * arrives - the thumb would lag behind the pointer. So the value is shown at once by the labels, through `sliding`, but
 * written to `range` only once the browser has handled every input event already queued, in a task of its own. Any
 * values slid to in the meantime replace those pending, so that however many events arrive, the range is written once
 * with the latest values. Releasing the thumb, which the browser marks by a change event, writes them at once.
 * @param {Event} event - The input event
 * @param {hortis.dualRangeInput} that - The dual range input
 * @param {String} which - `min` or `max`, naming the thumb slid
 */
hortis.dualRangeInput.input = function (event, that, which) {
    const control = that.control;
    control.pending = {...control.pending, [which]: +event.target.value};
    that.sliding = {...that.shownRange, ...control.pending};
    if (control.commitTimer === null) {
        control.commitTimer = control.window.setTimeout(control.commit, 0);
    }
};

/**
 * Write at once any values slid to and not yet written to the range, e.g. as the thumb is released.
 * @param {hortis.dualRangeInput} that - The dual range input
 */
hortis.dualRangeInput.flush = function (that) {
    that.control.commit();
};

/**
 * Write the values slid to and pending to a dual range input's range, as its own change, so that its effect moving
 * the inputs does not move them back. Does nothing if none are pending.
 * @param {hortis.dualRangeInput} that - The dual range input
 * @param {DualRangeInput} control - Its control, holding the pending values as `pending`
 */
hortis.dualRangeInput.commit = function (that, control) {
    control.window.clearTimeout(control.commitTimer);
    control.commitTimer = null;
    const pending = control.pending;
    control.pending = null;
    if (pending) {
        fluid.cell.withAmbientSource(fluid.domSources(fluid.selfSource(that)), () => {
            Object.entries(pending).forEach(([which, value]) => {
                that.range[which] = value;
            });
            that.sliding = null;
        })();
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

        this.update();

        this.$min.dataset.ready = "true";
        this.$max.dataset.ready = "true";
    }

    update(method = "ceil") {
        const thumbWidthVar = "var(--dri-thumb-width)";

        const min = parseFloat(this.$min.min);
        const max = parseFloat(this.$max.max);
        const step = parseFloat(this.$min.step) || 1;
        const minValue = parseFloat(this.$min.value);
        const maxValue = parseFloat(this.$max.value);

        const midValue = (maxValue - minValue) / 2;
        const mid = minValue + Math[method](midValue / step) * step;

        const range = max - min;

        const leftWidth = (((mid - min) / range) * 100).toFixed(this.precision);
        const rightWidth = (((max - mid) / range) * 100).toFixed(this.precision);

        this.$min.style.flexBasis = `calc(${leftWidth}% + ${thumbWidthVar})`;
        this.$max.style.flexBasis = `calc(${rightWidth}% + ${thumbWidthVar})`;

        this.$min.max = mid.toFixed(this.precision);
        this.$max.min = mid.toFixed(this.precision);

        const minFill = (minValue - min) / (mid - min) || 0;
        const maxFill = (maxValue - mid) / (max - mid) || 0;

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
    }
}

/**
 * Construct the widget arranging the two inputs, which also holds the values slid to and not yet written to the
 * range - see hortis.dualRangeInput.input.
 * @param {hortis.dualRangeInput} that - The dual range input
 * @param {HTMLElement} container - Its rendered container
 * @return {DualRangeInput} The widget
 */
hortis.dualRangeInput.makeControl = function (that, container) {
    const control = new DualRangeInput(container.querySelector(".dual-range-min"), container.querySelector(".dual-range-max"));
    control.window = container.ownerDocument.defaultView;
    control.pending = null;
    control.commitTimer = null;
    control.commit = () => hortis.dualRangeInput.commit(that, control);
    return control;
};

hortis.dualRangeInput.destroyControl = function (control) {
    control.window.clearTimeout(control.commitTimer);
    control.destroy();
};

hortis.dualRangeInput.updateControl = function (control, range, minRange, maxRange) {
    // Must update range first otherwise value update will be rejected
    control.$min.min = minRange;
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
            <input type="range" step="1" class="dual-range-min" disabled="@{disabled}" @oninput="hortis.dualRangeInput.input({0}, {self}, min)" @onchange="hortis.dualRangeInput.flush({self})"/>
            <input type="range" step="1" class="dual-range-max" disabled="@{disabled}" @oninput="hortis.dualRangeInput.input({0}, {self}, max)" @onchange="hortis.dualRangeInput.flush({self})"/>
        </div>
        <div class="dual-range-thumb-labels" @class="dual-range-thumb-labels-shown:@{thumbLabels}">
            <span class="dual-range-thumb-label dual-range-thumb-min" style="left: max(5em, @{labels.minPos}%)">@{labels.min}</span>
            <span class="dual-range-thumb-label dual-range-thumb-max" style="left: min(100% - 5em, @{labels.maxPos}%)">@{labels.max}</span>
        </div>
        <div class="dual-range-values" @class="fl-hidden:!@{valueLabels}">
            <span>@{labels.lower}</span>
            <span>@{labels.span}</span>
            <span>@{labels.upper}</span>
        </div>
    </div>
</template>
