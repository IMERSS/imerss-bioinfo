/*
Copyright 2017-2026 Antranig Basman
Licensed under the Educational Community License (ECL), Version 2.0 or the New
BSD license. You may not use this file except in compliance with one these
Licenses.
You may obtain a copy of the ECL 2.0 License and BSD License at
https://github.com/fluid-project/infusion/raw/master/Infusion-LICENSE.txt
*/

"use strict";

// Vertical bar charts of counts drawn as SVG markup, e.g. those of hortis.beeAbundance

// noinspection ES6ConvertVarToLetConst // otherwise this is a duplicate on minifying
var hortis = fluid.registerNamespace("hortis");

/** Bar charts drawn as SVG markup **/

/**
 * Choose a round step and upper bound for a count axis with about four intervals.
 * @param {Number} max - The largest value to be plotted
 * @return {Object} Members `step`, a whole number, and `top`, the smallest multiple of `step` at least `max`
 */
hortis.niceScale = function (max) {
    const bounded = Math.max(max, 1);
    const raw = bounded / 4;
    const magnitude = Math.pow(10, Math.floor(Math.log10(raw)));
    const normal = raw / magnitude;
    const nice = normal <= 1 ? 1 : normal <= 2 ? 2 : normal <= 5 ? 5 : 10;
    const step = Math.max(1, nice * magnitude);
    return {step, top: step * Math.ceil(bounded / step)};
};

/**
 * Truncate a label to a maximum length, marking the truncation with an ellipsis.
 * @param {String} label - The label
 * @param {Number} maxLength - The maximum length of the returned label
 * @return {String} The possibly truncated label
 */
hortis.truncateLabel = function (label, maxLength) {
    return label.length > maxLength ? label.substring(0, maxLength - 1) + "…" : label;
};

/**
 * Render a vertical bar chart of counts, one bar per row, as SVG markup.
 * @param {Object[]} rows - Records each with members `label` and `count`, in display order
 * @param {Object} opts - Chart options:
 *     width, height: Number - dimensions in pixels
 *     foot: Number - height in pixels reserved below the plot for bar labels and the x axis label
 *     angle: Number - rotation of bar labels in degrees
 *     title, titleTip: String - the chart heading and its tooltip
 *     xLabel, xTip, yLabel, yTip: String - the axis labels and their tooltips
 *     colourOf: Function - maps a row to its bar colour
 *     rowTip: Function - maps a row to the tooltip for its bar
 * @return {String} The chart's SVG markup
 */
hortis.barChartMarkup = function (rows, opts) {
    const enc = hortis.encodeHTML;
    const left = 58, right = opts.width - 10, top = 34;
    const base = opts.height - opts.foot;
    const {step, top: scaleTop} = hortis.niceScale(rows.reduce((max, row) => Math.max(max, row.count), 0));
    const band = (right - left) / Math.max(rows.length, 1);
    const barWidth = Math.min(30, band * 0.7);
    const yOf = value => base - value / scaleTop * (base - top);
    const parts = [];
    parts.push(`<text x="${left}" y="18" class="imerss-chart-title">${enc(opts.title)}<title>${enc(opts.titleTip)}</title></text>`);
    for (let value = 0; value <= scaleTop; value += step) {
        const y = yOf(value);
        parts.push(`<line x1="${left}" y1="${y}" x2="${right}" y2="${y}" class="imerss-chart-grid"/>`);
        parts.push(`<text x="${left - 7}" y="${y + 4}" text-anchor="end" class="imerss-chart-tick">${hortis.formatInt(value)}<title>${enc(hortis.formatInt(value) + " " + opts.yLabel.toLowerCase())}</title></text>`);
    }
    rows.forEach((row, i) => {
        const height = base - yOf(row.count);
        const x = left + band * i + (band - barWidth) / 2;
        const tip = enc(opts.rowTip(row));
        parts.push(`<rect x="${x}" y="${base - height}" width="${barWidth}" height="${height}" fill="${opts.colourOf(row)}" class="imerss-chart-bar"><title>${tip}</title></rect>`);
        parts.push(`<text x="0" y="0" text-anchor="end" class="imerss-chart-label" transform="translate(${x + barWidth / 2 + 3} ${base + 9}) rotate(${opts.angle})">` +
            `${enc(hortis.truncateLabel(row.label, 30))}<title>${tip}</title></text>`);
    });
    parts.push(`<line x1="${left}" y1="${base}" x2="${right}" y2="${base}" class="imerss-chart-axis-line"/>`);
    parts.push(`<text x="0" y="0" text-anchor="middle" class="imerss-chart-axis" transform="translate(16 ${(top + base) / 2}) rotate(-90)">${enc(opts.yLabel)}<title>${enc(opts.yTip)}</title></text>`);
    parts.push(`<text x="${(left + right) / 2}" y="${opts.height - 6}" text-anchor="middle" class="imerss-chart-axis">${enc(opts.xLabel)}<title>${enc(opts.xTip)}</title></text>`);
    return `<svg class="imerss-chart" width="${opts.width}" height="${opts.height}" viewBox="0 0 ${opts.width} ${opts.height}" role="img" aria-label="${enc(opts.title)}">${parts.join("")}</svg>`;
};
