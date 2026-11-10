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
    // The text and position of each value shown - see hortis.dualRangeInput.labels
    labels: "$compute:hortis.dualRangeInput.labels({self}.range, {self}.minRange, {self}.maxRange, {self}.unit, {self}.formatter)",
    tickStyle: "$compute:hortis.dualRangeInput.tickStyle({self}.ticks, {self}.minRange, {self}.maxRange)",
    view: {
        $component: {
            elideParent: false
        }
    },
    // The widget arranging the two inputs, constructed once the markup is rendered
    control: {
        $bindable: {
            bind: "hortis.dualRangeInput.makeControl({self}.view.renderedContainer)",
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

hortis.dualRangeInput.input = function (event, that, which) {
    that.range[which] = +event.target.value;
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
 * Compute the style of a dual range input's track marking its detents, as a background of thin lines.
 * @param {Number[]} ticks - The values at which detents are marked
 * @param {Number} minRange - The lower bound of the range
 * @param {Number} maxRange - The upper bound of the range
 * @return {String} The style
 */
hortis.dualRangeInput.tickStyle = function (ticks, minRange, maxRange) {
    const extent = maxRange - minRange || 1;
    const lines = ticks.map(tick => {
        const pos = (100 * (tick - minRange) / extent).toFixed(2);
        return `linear-gradient(to right, transparent calc(${pos}% - 1px), var(--dri-tick-color, #999) calc(${pos}% - 1px), ` +
            `var(--dri-tick-color, #999) calc(${pos}% + 1px), transparent calc(${pos}% + 1px))`;
    });
    return lines.length ? "background-image: " + lines.join(", ") + ";" : "";
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

hortis.dualRangeInput.makeControl = function (container) {
    return new DualRangeInput(container.querySelector(".dual-range-min"), container.querySelector(".dual-range-max"));
};

hortis.dualRangeInput.destroyControl = function (control) {
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
        <div class="dual-range-ticks" style="@{tickStyle}"></div>
        <div class="dual-range-input">
            <input type="range" step="1" class="dual-range-min" disabled="@{disabled}" @oninput="hortis.dualRangeInput.input({0}, {self}, min)"/>
            <input type="range" step="1" class="dual-range-max" disabled="@{disabled}" @oninput="hortis.dualRangeInput.input({0}, {self}, max)"/>
        </div>
        <div class="dual-range-thumb-labels" @class="dual-range-thumb-labels-shown:@{thumbLabels}">
            <span class="dual-range-thumb-label dual-range-thumb-min" style="left: max(5em, @{labels.minPos}%)">@{labels.min}</span>
            <span class="dual-range-thumb-label dual-range-thumb-max" style="left: min(100% - 5em, @{labels.maxPos}%)">@{labels.max}</span>
        </div>
        <div class="dual-range-values">
            <span>@{labels.lower}</span>
            <span>@{labels.span}</span>
            <span>@{labels.upper}</span>
        </div>
    </div>
</template>
