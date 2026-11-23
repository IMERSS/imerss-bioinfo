/*
Copyright 2026 Antranig Basman
Licensed under the Educational Community License (ECL), Version 2.0 or the New
BSD license. You may not use this file except in compliance with one these
Licenses.
You may obtain a copy of the ECL 2.0 License and BSD License at
https://github.com/fluid-project/infusion/raw/master/Infusion-LICENSE.txt
*/

/* global fluidDemoAgent */

"use strict";

// Extends Infusion 6's in-page demo agent, tests/test-core/browser/js/demo-agent.js, which must be loaded first, with
// the expectations needed by the demo scripts of the visualisations - see test/i6/browserDemos.js. These read numbers
// from the page, e.g. a count of records, and compare them with numbers read by earlier steps and saved by name, so
// that a script can check that a count goes down as a filter is applied and returns to what it was as it is removed,
// without encoding the counts of any particular dataset. Each is an extra member of an expectation:

/**
 * @typedef {Object} NumberExpectation
 * @property {String} [pattern] - A regular expression matched against the text of each matching element, whose first
 * group, or else whole match, is the number read - by default the first number in the text. Commas are ignored
 * @property {Boolean} [sum] - If `true`, the numbers read from all matching elements are summed, otherwise only that
 * of the first is read
 * @property {String} [save] - A name under which the number read is saved for comparison by later expectations
 * @property {Number|String} [equals] - The number should equal this - a String names a saved number
 * @property {Number|String} [notEquals] - The number should differ from this
 * @property {Number|String} [lessThan] - The number should be less than this
 * @property {Number|String} [greaterThan] - The number should be greater than this
 */

/**
 * @typedef {Object} ExtendedExpectation
 * @property {NumberExpectation} [number] - Constraining a number read from the text of the target
 * @property {Boolean} [checked] - Whether the first matching element, a checkbox, should be checked
 * @property {Boolean} [focused] - Whether the first matching element should hold, or contain, the focus
 * @property {Object} [value] - Holding `equals`, a String - the value of the first matching element, an input
 * @property {Boolean} [inView] - Whether the first matching element lies wholly within the viewport and within every
 * ancestor which clips its content, e.g. a scrolling container, so that it can be seen without scrolling
 */

/**
 * Determine whether an element can be seen without scrolling - it is visible, and its bounds lie wholly within the
 * viewport and within those of every ancestor whose overflow is not visible.
 * @param {Element} element - The element
 * @return {Boolean} `true` if the element is in view
 */
fluidDemoAgent.isInView = function (element) {
    const rect = element.getBoundingClientRect();
    const tolerance = 1;
    const within = outer => rect.left >= outer.left - tolerance && rect.right <= outer.right + tolerance
        && rect.top >= outer.top - tolerance && rect.bottom <= outer.bottom + tolerance;
    let inView = fluidDemoAgent.isVisible(element) && within({left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight});
    let ancestor = element.parentElement;
    while (inView && ancestor && ancestor !== document.documentElement) {
        const style = getComputedStyle(ancestor);
        if (style.overflowX !== "visible" || style.overflowY !== "visible") {
            inView = within(ancestor.getBoundingClientRect());
        }
        ancestor = ancestor.parentElement;
    }
    return inView;
};

/**
 * Numbers saved by name by `number` expectations bearing `save`
 * @type {Object<String, Number>}
 */
fluidDemoAgent.saved = {};

/**
 * Read a number from the text of an element.
 * @param {Element} element - The element
 * @param {String} [pattern] - A regular expression whose first group, or whole match, holds the number
 * @return {Number} The number, or `NaN` if none could be read
 */
fluidDemoAgent.numberOf = function (element, pattern) {
    const text = fluidDemoAgent.textOf(element).replace(/,/g, "");
    const match = new RegExp(pattern ?? "-?\\d+(?:\\.\\d+)?").exec(text);
    const togo = match ? Number(match[1] ?? match[0]) : NaN;
    return togo;
};

/**
 * Resolve the operand of a numeric comparison, which may name a saved number.
 * @param {Number|String} operand - The operand
 * @return {Number} The number - `NaN` if it names no saved number
 */
fluidDemoAgent.resolveOperand = function (operand) {
    let togo;
    if (typeof operand === "string") {
        togo = fluidDemoAgent.saved[operand] ?? NaN;
    } else {
        togo = operand;
    }
    return togo;
};

/**
 * Evaluate a `number` expectation against the elements matching its target.
 * @param {NumberExpectation} spec - The expectation's `number` member
 * @param {Element[]} elements - The elements matching its target
 * @return {String[]} Messages describing each way in which the expectation failed
 */
fluidDemoAgent.checkNumber = function (spec, elements) {
    const failures = [];
    const numbers = (spec.sum ? elements : elements.slice(0, 1)).map(element => fluidDemoAgent.numberOf(element, spec.pattern));
    const value = numbers.reduce((total, number) => total + number, 0);
    if (elements.length === 0 || Number.isNaN(value)) {
        failures.push(`expected a number to be read, read ${elements.length === 0 ? "no element" : "none"}`);
    } else {
        const describe = operand => typeof operand === "string" ? `${operand} (${fluidDemoAgent.saved[operand]})` : String(operand);
        const comparisons = {
            equals: (a, b) => a === b,
            notEquals: (a, b) => a !== b,
            lessThan: (a, b) => a < b,
            greaterThan: (a, b) => a > b
        };
        Object.entries(comparisons).forEach(([name, compare]) => {
            if (spec[name] !== undefined) {
                const operand = fluidDemoAgent.resolveOperand(spec[name]);
                if (Number.isNaN(operand)) {
                    failures.push(`no number has been saved as ${spec[name]}`);
                } else if (!compare(value, operand)) {
                    failures.push(`expected number ${name} ${describe(spec[name])}, was ${value}`);
                }
            }
        });
        if (spec.save !== undefined) {
            fluidDemoAgent.saved[spec.save] = value;
        }
    }
    return failures;
};

fluidDemoAgent.baseCheckOne = fluidDemoAgent.checkOne;

/**
 * Evaluate a single expectation, as by the base agent, together with the extended expectations it holds.
 * @param {ExtendedExpectation} expectation - The expectation to evaluate
 * @param {Number} baseline - The count of the expectation's target measured before the step's action
 * @return {String[]} Messages describing each way in which the expectation failed - empty if it passed
 */
fluidDemoAgent.checkOne = function (expectation, baseline) {
    const failures = fluidDemoAgent.baseCheckOne(expectation, baseline);
    const elements = fluidDemoAgent.locateAll(expectation.target);
    const first = elements[0];
    if (expectation.number) {
        failures.push(...fluidDemoAgent.checkNumber(expectation.number, elements));
    }
    if (expectation.checked !== undefined) {
        if (first && first.checked !== expectation.checked) {
            failures.push(`expected element to be ${expectation.checked ? "checked" : "unchecked"}`);
        } else if (!first) {
            failures.push("expected a checkbox, found none");
        }
    }
    if (expectation.focused !== undefined) {
        const active = document.activeElement;
        const focused = !!first && !!active && (first === active || first.contains(active));
        if (focused !== expectation.focused) {
            const activeDescription = active ? `${active.tagName}.${[...active.classList].join(".")}` : "nothing";
            failures.push(`expected element ${expectation.focused ? "to hold" : "not to hold"} the focus, which is held by ${activeDescription}`);
        }
    }
    if (expectation.inView !== undefined) {
        const inView = !!first && fluidDemoAgent.isInView(first);
        if (inView !== expectation.inView) {
            failures.push(`expected element ${expectation.inView ? "to be" : "not to be"} in view without scrolling`);
        }
    }
    if (expectation.value) {
        if (first && first.value !== expectation.value.equals) {
            failures.push(`expected value to equal "${expectation.value.equals}", was "${first.value}"`);
        } else if (!first) {
            failures.push("expected an element whose value could be checked, found none");
        }
    }
    return failures;
};
