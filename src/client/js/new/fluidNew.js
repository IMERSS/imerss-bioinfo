/*
Copyright 2014 Antranig Basman
Licensed under the Educational Community License (ECL), Version 2.0 or the New
BSD license. You may not use this file except in compliance with one these
Licenses.
You may obtain a copy of the ECL 2.0 License and BSD License at
https://github.com/fluid-project/infusion/raw/master/Infusion-LICENSE.txt
*/

/* global preactSignalsCore */

"use strict";

// noinspection ES6ConvertVarToLetConst // otherwise this is a duplicate on minifying
var {signal, effect, computed} = preactSignalsCore;

// Monkey-patch core framework to support wide range of primitives and JSON initial values
fluid.coerceToPrimitive = function (string) {
    return /^(true|false|null)$/.test(string) || /^[\[{0-9]/.test(string) && !/^{\w/.test(string) ? JSON.parse(string) : string;
};

/**
 * Create a marker representing an "Unavailable" state with an associated waitset.
 * The marker is mutable.
 *
 * @param {Object|Array} [cause={}] - A list of dependencies or reasons for unavailability.
 * @return {fluid.marker} A marker of type "Unavailable".
 */
fluid.unavailable = (cause = {}) => fluid.makeMarker("Unavailable", {
    causes: fluid.makeArray(cause).map(oneCause => {
        if (!oneCause.type) {
            oneCause.type = "Unavailable";
        }
        return oneCause;
    })
}, true);

/**
 * Check if an object is a marker of type "Unavailable"
 *
 * @param {Object} totest - The object to test.
 * @return {Boolean} `true` if the object is a marker of type "Unavailable", otherwise `false`.
 */
fluid.isUnavailable = totest => totest instanceof fluid.marker && totest.value === "Unavailable";
// NOTE incompatibility with Infusion < 6 - new marker uses "type" rather than "value"

fluid.processSignalArgs = function (args) {
    let undefinedSignals = false;
    const designalArgs = [];
    for (const arg of args) {
        if (arg instanceof preactSignalsCore.Signal) {
            const value = arg.value;
            designalArgs.push(arg.value);
            if (value === undefined || fluid.isUnavailable(value)) {
                undefinedSignals = true;
            }
        } else {
            designalArgs.push(arg);
        }
    }
    return {designalArgs, undefinedSignals};
};

fluid.computed = function (func, ...args) {
    return computed( () => {
        const {designalArgs, undefinedSignals} = fluid.processSignalArgs(args);
        return undefinedSignals ? undefined :
            typeof(func) === "string" ? fluid.invokeGlobalFunction(func, designalArgs) : func.apply(null, designalArgs);
    });
};

// TODO: Return needs to be wrapped in a special marker so that component destruction can dispose it
fluid.effect = function (func, ...args) {
    return effect( () => {
        const {designalArgs, undefinedSignals} = fluid.processSignalArgs(args);
        if (!undefinedSignals) {
            return typeof(func) === "string" ? fluid.invokeGlobalFunction(func, designalArgs) : func.apply(null, designalArgs);
        }
    });
};

fluid.derefSignal = function (signal, path) {
    return computed( () => {
        const value = signal.value;
        return fluid.get(value, path);
    });
};

fluid.sampleComputed = computed(() => {});
const computedPrototype = Object.getPrototypeOf(fluid.sampleComputed);
const computedPrototypeDescriptor = Object.getOwnPropertyDescriptor(computedPrototype, "value");

fluid.delegateUnavailable = fluid.unavailable({message: "No written value for delegated signal"});

fluid.DelegatedSignal = function (outerSignal, onWrite, onReset) {
    const computer = computed( () => {
        const targetValue = computer._target.value;
        return fluid.isUnavailable(targetValue) ? computer._outerSignal.value : targetValue;
    });
    Object.setPrototypeOf(computer, fluid.DelegatedSignal.prototype);
    computer._outerSignal = outerSignal;
    computer._onWrite = onWrite;
    computer._onReset = onReset;
    computer._target = signal(fluid.delegateUnavailable);
    return computer;
};

fluid.DelegatedSignal.prototype = fluid.sampleComputed;

fluid.DelegatedSignal.prototype.reset = function () {
    if (this._onReset) {
        this.onReset(this._target, this);
    }
    this._target.value = fluid.delegateUnavailable;
};

fluid.DelegatedSignal.prototype.isWritten = function () {
    return !fluid.isUnavailable(this._target.value);
};

Object.defineProperty(fluid.DelegatedSignal.prototype, "value", {
    get: computedPrototypeDescriptor.get,
    set: function (newValue) {
        if (this._target) {
            this._target.value = newValue;
        } else {
            this._target = signal(newValue);
            if (this._onWrite) {
                this._onWrite(this._target, this);
            }
        }
    }
});

fluid.delegatedSignal = function (outerSignal, onWrite, onReset) {
    return new fluid.DelegatedSignal(outerSignal, onWrite, onReset);
};


// The guts of fluid.container without the endless wrapping, unwrapping and overwriting of arguments
// We assume that all containers came out of the DOM binder
fluid.validateContainer = function (container) {
    if (!container || !container.jquery || container.length !== 1) {
        const selector = container?.selector;
        const count = container.length !== undefined ? container.length : 0;
        const extraMessages = container.selectorName ? [" with selector name " + container.selectorName +
        " in context ", container.context] : [];
        fluid.fail((count > 1 ? "More than one (" + count + ") container elements were" :
            "No container element was") + " found for selector " + selector, ...extraMessages);
    }
    return container[0];
};

/** Parse the supplied markup into a DOM element. If the markup has a single root node, this is signalled by
 * setting `hasRoot` to `true`, and that node will be returned. Otherwise, setting `hasRoot` to false will
 * instead return a DocumentFragment that has the parsed markup as children.
 * @param {String} template - The markup to be parsed
 * @param {Boolean} hasRoot - If `true`, the returned node will be the (assumed) single root node of the supplied markup,
 * otherwise the return will be a DocumentFragment hosting the entire markup's nodes
 * @return {Element} The parsed markup as a tree of nodes
 */
fluid.parseMarkup = function (template, hasRoot) {
    const fragment = document.createRange().createContextualFragment(template);
    return hasRoot ? fragment.firstElementChild : fragment;
};

fluid.spliceContainer = function (target, source, elideParent) {
    const children = elideParent ? source.childNodes : [source];
    // Or polyfill at https://stackoverflow.com/a/66528507
    target.replaceChildren(...children);
    if (elideParent) {
        target.classList.add(...source.classList);
    }
};

// TODO: Could move to HTM's parser using virtual DOM for tree building
fluid.renderContainerSplice = function (parentContainer, elideParent, hasRoot, renderMarkup, that) {
    const resolvedContainer = fluid.validateContainer(parentContainer);
    effect ( () => {
        const containerMarkup = renderMarkup();
        const template = fluid.parseMarkup(containerMarkup, true);
        fluid.spliceContainer(resolvedContainer, template, elideParent);
        // Allow an effect to wait for rendering
        if (that.renderModel.value !== undefined) {
            that.templateRoot.value = template;
        }
        that.events.onRendered.fire(that);
    });
    return parentContainer;
};

fluid.renderStringTemplate = function (markup, renderModelSignal) {
    const renderModel = renderModelSignal.value;
    return renderModel === undefined ? markup.fallbackContainer : fluid.stringTemplate(markup.container, renderModel);
};

// Taken from reknit.js
fluid.makeCreateElement = function (dokkument) {
    return (tagName, props) => {
        const element = dokkument.createElement(tagName);
        Object.entries(props).forEach(([key, value]) => element.setAttribute(key, value));
        return element;
    };
};

fluid.h = fluid.makeCreateElement(document);

fluid.defaults("fluid.stringTemplateRenderingView", {
    gradeNames: "fluid.containerRenderingView",
    markup: {
        fallbackContainer: "<div></div>"
    },
    invokers: {
        renderMarkup: "fluid.renderStringTemplate({that}.options.markup, {that}.renderModel)",
        renderContainer: "fluid.renderContainerSplice({that}.options.parentContainer, {that}.options.elideParent, {that}.options.hasRoot, {that}.renderMarkup, {that})",
        // Blast this unnecessary invoker definition
        addToParent: null,
    },
    // Stopgap so we can wait to create children in old world for single initial rendering
    events: {
        onRendered: null
    },
    elideParent: true,
    hasRoot: true,
    members: {
        // So that clients can wait for template to have been rendered
        templateRoot: "@expand:signal()",
        // Need an blank default so that initial rendering effect is triggered
        renderModel: "@expand:fluid.computed(fluid.blankRenderModel)"
    }
});

fluid.blankRenderModel = function () {
    const blankSignal = signal(true);
    return blankSignal.value;
};
