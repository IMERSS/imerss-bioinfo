"use strict";

// import fluid from "./FluidView.js"

const $fluidViewBrowserScope = function (fluid) {

    fluid.environment = "browser";

    // The document into which SFCs are injected for a component which has no container from which to find one, e.g.
    // an avatar - in the browser there is just the one. Left undefined on the server, which may host several.
    fluid.defaultDocument = document;

    /**
     * Retrieve the root element of this document, as the container of a `fluid.outputDocumentView` - provided that
     * the location of the output document is that of this document. Given a site's base URL, a relative location is
     * resolved against it, and the locations are compared by their paths relative to the site's root - as served here,
     * that recorded in this document when it was rendered, bearing `fluid.siteRootAttribute`, and otherwise the base
     * URL's path - so that the page is recognised wherever the site is served, even from files. Otherwise the
     * locations are compared whole.
     * @param {String} location - The location of the output document
     * @param {String} [baseURL] - The base URL of the site to which the output document belongs, if any
     * @return {Element|Unavailable} The root element of this document, or an unavailable value if the output document
     * is not this one
     */
    fluid.hostDocumentElement = function (location, baseURL) {
        const here = document.location.href, base = document.baseURI || here;
        let matches;
        if (baseURL) {
            const siteBase = fluid.siteDirectoryOf(baseURL);
            const sitePath = fluid.sitePathOf(location, siteBase, siteBase);
            const recordedRoot = document.documentElement.getAttribute(fluid.siteRootAttribute);
            const localRoot = recordedRoot === null ? siteBase : new URL(recordedRoot, here).href;
            matches = sitePath !== undefined && sitePath === fluid.sitePathOf(here, base, localRoot);
        } else {
            matches = fluid.pageUrlOf(location, base) === fluid.pageUrlOf(here, base);
        }
        return matches ? document.documentElement :
            fluid.unavailable({cause: `Output document at ${location} is not this document`, variety: "config"});
    };

    // Client version of fluid.outputDocumentView from FluidView-node.js. The client observes at most one document, its
    // own, and so rather than creating a fresh document, the view renders into this one should it be at
    // `documentLocation` - e.g. once a page rendered on the server is made live again - and otherwise does not render.
    // A site rendering its pages as output documents supplies its `baseURL`, so that a page recognises itself wherever
    // the site is served - see fluid.hostDocumentElement
    fluid.def("fluid.outputDocumentView", {
        $layers: "fluid.viewComponent",
        documentLocation: fluid.unavailable({cause: "Location of output document not configured", variety: "config"}),
        baseURL: "",
        container: "$compute:fluid.hostDocumentElement({self}.documentLocation, {self}.baseURL)",
        $variety: "framework"
    });

    // Currently disused
    /**
     * Parses an HTML string into a DOM element.
     *
     * @param {String} template - The HTML string to parse.
     * @return {HTMLElement|null} The first element in the parsed DOM fragment, or null if none exists.
     */
    fluid.parseDOM = function (template) {
        const fragment = document.createRange().createContextualFragment(template);
        return fragment.firstElementChild || fluid.unavailable("Unable to parse template as HTML");
    };

    /**
     * Traverses the list of DOM elements lying at a point until it finds the first parent
     * that exists within `fluid.viewContainerRegistry`. Returns an object containing the container
     * and its associated shadow, or `null` if no such parent is found.
     *
     * @param {MouseEvent} mouseEvent - The mouse event at the point to be queried
     * @return {Shadow|null} The shadow, or `null` if not found.
     */
    fluid.shadowForMouseEvent = function (mouseEvent) {
        const elements = document.elementsFromPoint(mouseEvent.clientX, mouseEvent.clientY);
        const container = elements.find(fluid.shadowForElement);
        return container ? fluid.viewContainerRegistry.get(container) : null;
    };

    // event "on" handling logic lithified with thanks from https://github.com/vuejs/petite-vue/blob/main/src/directives/on.ts (Licencs: MIT)

    const systemModifiers = ["ctrl", "shift", "alt", "meta"];


    const modifierGuards = {
        stop: (e) => e.stopPropagation(),
        prevent: (e) => e.preventDefault(),
        self: (e) => e.target !== e.currentTarget,
        ctrl: (e) => !e.ctrlKey,
        shift: (e) => !e.shiftKey,
        alt: (e) => !e.altKey,
        meta: (e) => !e.metaKey,
        left: (e) => "button" in e && e.button !== 0,
        middle: (e) => "button" in e && e.button !== 1,
        right: (e) => "button" in e && e.button !== 2,
        exact: (e, modifiers) =>
            systemModifiers.some((m) => e[`${m}Key`] && !modifiers[m])
    };

    const hyphenateRE = /\B([A-Z])/g;
    const modifierRE = /\.([\w-]+)/g;

    fluid.parseModifiers = (raw) => {
        let modifiers;
        raw = raw.replace(modifierRE, (_, m) => {
            (modifiers || (modifiers = {}))[m] = true;
            return "";
        });
        return {event: raw, modifiers};
    };

    fluid.hyphenate = str => str.replace(hyphenateRE, "-$1").toLowerCase();

    fluid.applyOns = function (vnode, shadow, el, on, vTreeRec) {
        if (on) {
            on.forEach(({onKey, onValue}) => fluid.applyOn(vnode, shadow, el, onKey, onValue, vTreeRec));
        }
    };

    /**
     * Binds a DOM event to a handler function defined in the component context.
     * Parses event modifiers and applies the appropriate event and behavior based on the directive key.
     *
     * @param {VNode} vnode - The virtual DOM node associated with the event.
     * @param {Shadow} shadow - The shadow record of the component, used to resolve context references.
     * @param {HTMLElement} el - The DOM element to which the event handler is to be attached.
     * @param {String} onKey - The directive key specifying the event name and any modifiers (e.g., 'click.ctrl.enter').
     * @param {String} onValue - The key in the component context that resolves to the event handler function.
     * @param {Array} vTreeRec - Array of registered event handler records for later deregistration
     */
    fluid.applyOn = (vnode, shadow, el, onKey, onValue, vTreeRec) => {
        let {event, modifiers} = fluid.parseModifiers(onKey);

        let handler;

        // TODO: Should implement some recognisable kind of parser here to ensure that = is at some kind of syntactic top level
        if (onValue.includes("=")) {
            const parts = onValue.split("=").map(part => part.trim());
            if (parts.length !== 2) {
                fluid.fail("Unrecognised event assignment binding without lefthand and righthand " + onValue);
            }
            const [lh, rh] = parts;
            const parsedLH = fluid.parseContextReference(lh);
            // TODO: Local context resolution, if we need to push event into {0}
            const target = fluid.resolveContext(parsedLH.context, shadow);
            let rvalue, rvalueSignal;
            let negate = rh.startsWith("!");
            const useRH = negate ? rh.substring(1) : rh;
            if (fluid.isILReference(useRH)) {
                rvalueSignal = fluid.fetchContextReference(useRH, shadow);
            } else {
                rvalue = fluid.coerceToPrimitive(rh);
            }
            handler = fluid.cell.withAmbientSource(fluid.domSources(shadow), () => {
                if (rvalueSignal) {
                    rvalue = fluid.deSignal(rvalueSignal);
                }
                if (negate) {
                    rvalue = !rvalue;
                }
                // The target's path may pass through subcomponents, e.g. {self}.shell.fullScreen
                const {component, segs} = fluid.descendSubcomponentPath(fluid.deSignal(target), parsedLH.path);
                fluid.setForComponent(component, segs, rvalue);
            });
        } else {
            const parsed = fluid.compactStringToRec(onValue, "DOMEventBind");
            handler = fluid.cell.withAmbientSource(fluid.domSources(shadow), fluid.expandMethodRecord(parsed, shadow, fluid.vnodeToSegs(vnode)));
        }

        // map modifiers
        if (event === "click") {
            if (modifiers?.right) {
                event = "contextmenu";
            }
            if (modifiers?.middle) {
                event = "mouseup";
            }
        }

        const rawHandler = e => {
            // console.log("Activating event handler for ", event, " for vnode id ", vnode._id, " for DOM element ", el.flDomId);
            if (modifiers) {
                if ("key" in e && !(fluid.hyphenate(e.key) in modifiers)) {
                    return;
                }
                for (const key in modifiers) {
                    const guard = modifierGuards[key];
                    if (guard && guard(e, modifiers)) {
                        return;
                    }
                }
            }
            // Everything the handler causes, until any promise it returns settles, is a single step of the arena's history
            const togo = fluid.history.withinGesture(shadow, () => handler(e));
            fluid.cell.stabilize();
            return togo;
        };

        // console.log(`Bound handler to ${event} for vnode ${vnode._id} for DOM element ${el.flDomId} `, el);
        el.addEventListener(event, rawHandler, modifiers);
        vTreeRec.push({el, event, rawHandler, modifiers, vnodeId: vnode._id});
        // Noted on the element, so that a host of the component, e.g. a canvas which would otherwise take the pointer
        // gestures over it as its own, can find which of its elements handle which events - see fluid.hasBoundEvent
        el.flEventsBound ||= {};
        (el.flEventsBound[vnode._id] ||= []).push(event);
    };

    /**
     * Determine whether a template has bound a handler for any of the supplied events onto an element, through an
     * `@on` attribute
     * @param {Element} el - The element
     * @param {String[]} events - The names of the events, e.g. "click"
     * @return {Boolean} `true` if a handler for any of the events is bound onto the element
     */
    fluid.hasBoundEvent = function (el, events) {
        return Object.values(el.flEventsBound || {}).some(bound => bound.some(event => events.includes(event)));
    };

    /**
     * A record of a press of the pointer anywhere in the document, holding the element pressed as its `target`
     * @typedef {Object} PointerPressRecord
     * @property {EventTarget} target - The target of the pointerdown event
     */

    /**
     * Holds a record of the most recent press of the pointer anywhere in the document, for popups such as menus which
     * are dismissed by a press outside them. Each popup decides for itself whether the press was outside it, by
     * inspecting the record's `target`. A fresh record is written for each press, so that successive presses notify
     * even if they fall on the same element.
     * @type {Cell<PointerPressRecord|null>}
     */
    fluid.globalDismissalSignal = fluid.cell(null, {name: "Global dismissal signal"});

    fluid.def("fluid.globalDismissal", {
        $layers: "fluid.resolveRoot",
        view: {
            $component: {
                $layers: "fluid.viewComponent",
                container: document
            }
        },
        pressListener: {
            $bindable: {
                bind: {
                    func: dokkument => {
                        const listener = e => fluid.globalDismissalSignal.set({target: e.target});
                        // Listen during capture, so that presses whose propagation is stopped, e.g. by a canvas which
                        // takes them as its own gestures, are still seen
                        dokkument.addEventListener("pointerdown", listener, true);
                        return {dokkument, listener};
                    },
                    args: "{self}.view.container"
                },
                unbind: ({dokkument, listener}) => dokkument.removeEventListener("pointerdown", listener, true)
            }
        },
        $variety: "frameworkAux"
    });

    fluid.globalDismissalInstance = fluid.globalDismissal();

    fluid.applyOnLoad = function (func) {
        if (document.readyState === "complete") {
            func();
        } else {
            document.addEventListener("DOMContentLoaded", func);
        }
    };

    // Boot the current document into Infusion by acquiring fluid-import, fluid-module nodes and instantiating
    // components on any fluid-layer nodes
    fluid.bootDocument(document);

};

$fluidViewBrowserScope(fluid);
