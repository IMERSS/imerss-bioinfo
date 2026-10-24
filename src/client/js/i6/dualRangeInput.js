/*
Copyright 2025 Antranig Basman and 2024 Stanko

MIT License

Copyright (c) 2024 Stanko

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files
(the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge,
publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES
OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE
FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

"use strict";

// A dual range input ported to Infusion 6 - corresponds to src/client/js/new/dual-range-input.js

// noinspection ES6ConvertVarToLetConst // otherwise this is a duplicate on minifying
var hortis = fluid.registerNamespace("hortis");

fluid.def("hortis.dualRangeInput", {
    $layers: "fluid.component",
    // minRange: Number, maxRange: Number - the bounds of the range
    unit: "",
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
    view: {
        $component: {
            $layers: "fluid.templateViewComponent",
            elideParent: false,
            template: `<div>
                <div class="dual-range-input">
                    <input type="range" step="1" class="dual-range-min" @oninput="hortis.dualRangeInput.input({0}, {self}, min)"/>
                    <input type="range" step="1" class="dual-range-max" @oninput="hortis.dualRangeInput.input({0}, {self}, max)"/>
                </div>
                <div class="dual-range-values">
                    <span>@{minRange}@{unit}</span>
                    <span>@{range.min} - @{range.max}@{unit}</span>
                    <span>@{maxRange}@{unit}</span>
                </div>
            </div>`
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
    updateControl: "$effect:hortis.dualRangeInput.updateControl({self}.control, {self}.range, {self}.minRange, {self}.maxRange)"
});

hortis.dualRangeInput.input = function (event, that, which) {
    that.range[which] = +event.target.value;
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
