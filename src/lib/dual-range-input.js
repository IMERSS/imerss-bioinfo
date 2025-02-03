class DualRangeInput {
    $min;
    $max;
    precision;

    /**
     * @param {HTMLInputElement} $min - The range input element for the minimum value
     * @param {HTMLInputElement} $max - The range input element for the maximum value
     * @param {number} [precision=3] - The number of decimal places to round the mid value to, defaults to 3
     */
    constructor(
        $min,
        $max,
        $values,
        precision = 3
    ) {
        this.updateFloor = () => this.update('floor');
        this.updateCeil = () => this.update('ceil');

        this.$min = $min;
        this.$max = $max;
        this.precision = precision;

        this.$min.addEventListener('input', this.updateCeil);
        this.$max.addEventListener('input', this.updateFloor);

        this.$min.addEventListener('focus', this.updateCeil);
        this.$max.addEventListener('focus', this.updateFloor);

        // Unfortunately Safari doesn't trigger focus on mousedown or touchstart
        // like other browsers do, so we have to listen for those events as well
        this.$min.addEventListener('mousedown', this.updateCeil);
        this.$max.addEventListener('mousedown', this.updateFloor);

        this.$min.addEventListener('touchstart', this.updateCeil);
        this.$max.addEventListener('touchstart', this.updateFloor);

        this.update();

        this.$min.dataset.ready = 'true';
        this.$max.dataset.ready = 'true';
    }

    update(method = "ceil") {
        const thumbWidthVar = 'var(--dri-thumb-width)';

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
            '--dri-gradient-position',
            `calc(${minFillPercentage}% + (${minFillThumb} * ${thumbWidthVar}))`
        );
        this.$max.style.setProperty(
            '--dri-gradient-position',
            `calc(${maxFillPercentage}% + (${maxFillThumb} * ${thumbWidthVar}))`
        );
    }

    destroy() {
        this.$min.removeEventListener('input', this.updateFloor);
        this.$max.removeEventListener('input', this.updateCeil);

        this.$min.removeEventListener('focus', this.updateFloor);
        this.$max.removeEventListener('focus', this.updateCeil);

        this.$min.removeEventListener('mousedown', this.updateCeil);
        this.$max.removeEventListener('mousedown', this.updateFloor);

        this.$min.removeEventListener('touchstart', this.updateCeil);
        this.$max.removeEventListener('touchstart', this.updateFloor);
    }
}
