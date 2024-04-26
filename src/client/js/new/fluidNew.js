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

// TODO: Hoist this into some kind of core library
// noinspection ES6ConvertVarToLetConst // otherwise this is a duplicate on minifying
var {signal, effect, computed, batch} = preactSignalsCore;

// Monkey-patch core framework to support wide range of primitives and JSON initial values
fluid.coerceToPrimitive = function (string) {
    return /^(true|false|null)$/.test(string) || /^[\[{0-9]/.test(string) && !/^{\w/.test(string) ? JSON.parse(string) : string;
};

fluid.computed = function (func, ...args) {
    return computed( () => {
        const designalArgs = args.map(arg => arg instanceof preactSignalsCore.Signal ? arg.value : arg);
        return typeof(func) === "string" ? fluid.invokeGlobalFunction(func, designalArgs) : func.apply(null, designalArgs);
    });
};

// TODO: Return needs to be wrapped in a special marker so that component destruction can dispose it
fluid.effect = function (func, ...args) {
    return effect( () => {
        let undefinedSignals = false;
        const designalArgs = [];
        for (const arg of args) {
            if (arg instanceof preactSignalsCore.Signal) {
                const value = arg.value;
                designalArgs.push(arg.value);
                if (value === undefined) {
                    undefinedSignals = true;
                }
            } else {
                designalArgs.push(arg);
            }
        }
        // const designalArgs = args.map(arg => arg instanceof preactSignalsCore.Signal ? arg.value : arg);
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

// TODO: Could move to HTM's parser using virtual DOM for tree building
fluid.renderContainerSplice = function (parentContainer, elideParent, hasRoot, renderMarkup) {
    const resolvedContainer = fluid.validateContainer(parentContainer);
    effect ( () => {
        const containerMarkup = renderMarkup();
        const template = fluid.parseMarkup(containerMarkup, true);
        // Or polyfill at https://stackoverflow.com/a/66528507
        const children = elideParent ? template.childNodes : [template];
        resolvedContainer.replaceChildren(...children);
        if (elideParent) {
            resolvedContainer.classList.add(...template.classList);
        }
    });
    return parentContainer;
};

fluid.renderStringTemplate = function (template, modelFetcher) {
    return fluid.stringTemplate(template, modelFetcher());
};


fluid.defaults("fluid.stringTemplateRenderingView", {
    gradeNames: "fluid.containerRenderingView",
    invokers: {
        renderMarkup: "fluid.renderStringTemplate({that}.options.markup.container, {that}.signalsToModel)",
        renderContainer: "fluid.renderContainerSplice({that}.options.parentContainer, {that}.options.elideParent, {that}.options.hasRoot, {that}.renderMarkup)",
        // Blast this unnecessary invoker definition
        addToParent: null,
        // Need an empty default so that initial rendering effect is triggered
        signalsToModel: "fluid.emptySignalsToModel()"
    },
    elideParent: true,
    hasRoot: true,
    members: {
    },
    signals: { // override with your signals in here
    }
});

fluid.emptySignalsToModel = function () {
    const emptySignal = signal();
    return emptySignal.value;
};
