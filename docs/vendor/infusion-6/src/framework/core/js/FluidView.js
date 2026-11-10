"use strict";

// import fluid from "./FluidIL.js"

const fluidViewScope = function (fluid) {
    const $m = fluid.metadataSymbol;
    const $t = fluid.proxySymbol;

    /**
     * @typedef {Object} VNode
     * @property {String} [tag] - The tag name of the element (e.g., 'div', 'span').
     * @property {Object<String, String>} [attrs] - A key-value map of the element's attributes.
     * @property {Object<String, String>} [defaultAttrs] - Attributes applied to the element only if it does not already have them
     * @property {Object<String, Boolean>} [class] - A map of strings to `true` determining whether a CSS class name is present on the node
     * @property {VNode[]} [children] - An array of child virtual nodes.
     * @property {String} [text] - The text content in the case this VNode represents a DOM TextNode.
     * @property {Shadow} [shadow] - The shadow for a component for which this vnode is the template root
     * @property {Number} [_id] - The id of this vnode
     *
     * @property {VNode|null} [parentNode] - For an active vTree (not a template) stores its parent node
     *
     * @property {signal<HTMLElement>|undefined} [elementSignal] - A signal that resolves to the corresponding DOM element.
     * @property {Function[]} [renderEffects] - An array of effects that manage updates to the corresponding DOM element
     * @property {Object<String, Signal>} [boundAttrs] - Signals for the values of attributes bound in the template, indexed by attribute name
     */

    /**
     * Converts a single DOM Element node to a VNode
     *
     * @param {HTMLElement} element - The DOM element to convert.
     * @return {VNode} The virtual node representation of the element.
     */
    fluid.elementToVNode = function (element) {
        const tag = element.tagName.toLowerCase();
        const attrs = {};

        for (let i = 0; i < element.attributes.length; i++) {
            const attr = element.attributes[i];
            attrs[attr.name] = attr.value;
        }
        // Could also have members:
        // elementSignal/renderEffects
        return {tag, attrs};
    };

    fluid.svgTags = new Set([
        "svg", "circle", "ellipse", "line", "path", "polygon", "polyline",
        "rect", "g", "defs", "marker", "mask", "pattern", "symbol", "use",
        "view", "text", "tspan", "textPath", "filter", "feGaussianBlur",
        "feOffset", "feBlend", "feColorMatrix", "feComponentTransfer",
        "feComposite", "feFlood", "feImage", "feMerge", "feMorphology",
        "feTile", "feTurbulence", "clipPath", "foreignObject", "linearGradient",
        "radialGradient", "stop"
    ]);

    /**
     * Creates a DOM node from a virtual node (VNode), either a text node or an element node.
     *
     * @param {Document} dokkument - The document object used to create DOM nodes.
     * @param {VNode} vnode - The virtual node to convert into a DOM node.
     * @return {Node} - A newly created DOM node corresponding to the VNode.
     */
    fluid.nodeFromVNode = function (dokkument, vnode) {
        if (typeof(vnode) === "string") {
            return dokkument.createTextNode(vnode);
        } else if (vnode.text !== undefined) {
            return dokkument.createTextNode(fluid.isSignal(vnode.text) ? "" : vnode.text);
        } else {
            return fluid.svgTags.has(vnode.tag)
                ? dokkument.createElementNS("http://www.w3.org/2000/svg", vnode.tag)
                : dokkument.createElement(vnode.tag);
        }
    };

    /**
     * Checks whether a DOM node matches a given virtual node (VNode).
     *
     * @param {Node} node - The actual DOM node to compare.
     * @param {VNode} vnode - The virtual node to match against.
     * @return {Boolean} - `true` if the node matches the vnode, otherwise `false`.
     */
    fluid.matchNodeToVNode = function (node, vnode) {
        if (typeof(vnode) === "string" || vnode.text) {
            return node.nodeType === 3 /* Node.TEXT_NODE */;
        } else {
            return node.nodeType === 1 /* Node.ELEMENT_NODE */ && node.tagName.toLowerCase() === vnode.tag;
        }
    };

    /**
     * Create a live `Signal` that tracks elements matching a CSS selector within a DOM subtree.
     * The signal updates whenever matching elements are added or removed.
     * @param {String} selector - The CSS selector to match elements.
     * @param {Element|Document|null} [root=null] - The root element to observe; defaults to `document` if `null`.
     * @param {Document} [dokkument=document] - The document object to use for querying and observing.
     * @return {Signal<Array<Element>>} A signal containing the current list of matching elements.
     */
    fluid.liveQuerySelectorAll = function (selector, root = null, dokkument = document) {
        const togo = fluid.cell([], {name: "liveQuerySelectorAll for " + selector});
        const context = root || dokkument;

        const updateMatches = () => {
            const upcoming = Array.from(context.querySelectorAll(selector));
            if (!fluid.arrayEqual(togo.get(), upcoming)) {
                togo.set(upcoming);
            }
        };
        const window = dokkument.defaultView;

        const observer = new window.MutationObserver(() => {
            // TODO: Could do better, I guess, by observing updates in a finegrained way but this is just fine for now
            updateMatches();
        });

        const init = () => {
            observer.observe(context, {
                childList: true,
                subtree: true
            });
            updateMatches();
        };
        // Despite widespread explanations to the contrary, MutationObserver will not register correctly before document is loaded
        fluid.applyOnLoad(init);

        // TODO: Go with our wierd "Effect" contract for now, need to make a general "disposable" contract
        togo.dispose = () => observer.disconnect();
        return togo;
    };

    /**
     * Create a computed `Signal` that tracks the first element matching a CSS selector within a DOM subtree.
     * If no element matches, the signal yields an "unavailable" placeholder.
     * @param {String} selector - The CSS selector to match a single element.
     * @param {Element|null} [root=null] - The root element to observe; defaults to `document` if `null`.
     * @param {Document} [dokkument=document] - The document object to use for querying and observing.
     * @return {Signal<Element|Object>} A signal containing the first matching element or an "unavailable" placeholder.
     */
    fluid.liveQuerySelector = function (selector, root = null, dokkument = document) {
        const noElement = fluid.unavailable({cause: "No element matches selector " + selector, variety: "config"});
        const querySignal = fluid.liveQuerySelectorAll(selector, root, dokkument);
        const togo = fluid.cell(undefined, {name: `{liveQuerySelector for ${selector}`})
            .computed( (query) => query.length === 0 ? noElement : query[0], [querySignal]);
        togo.dispose = querySignal.dispose;
        return togo;
    };

    /**
     * Finds all child nodes of a given virtual or physical node that match a specified tag name.
     * For virtual nodes, this implementation only supports exact matches by tag name.
     *
     * @param {VNode|Element} node - The virtual or DOM node whose children are to be searched.
     * @param {String} selector - The tag name to match (case-insensitive).
     * @return {VNode[]} An array of child VNodes that match the specified tag name.
     */
    fluid.querySelectorAll = function (node, selector) {
        if (fluid.isDOMNode(node)) {
            const nodes = [...node.querySelectorAll(selector)];
            return nodes.map(node => fluid.domToVDom(node));
        } else {
            const results = [];
            if (node.children) {
                node.children.forEach(child => {
                    if (child.tag === selector) {
                        results.push(child);
                    }
                    results.push(...fluid.querySelectorAll(child, selector));
                });
            }
            return results;
        }
    };

    // No longer used on templates supplied in string form, which uses template-parser.js,
    // but used in fluid.captureViewTemplate for in-DOM templates
    /**
     * Converts a DOM tree into a virtual DOM representation.
     *
     * @param {Node} node - The root node of the DOM to convert.
     * @return {VNode|null} A virtual DOM representation of the tree, or null if the node type is not supported.
     */
    fluid.domToVDom = function (node) {
        if (node.nodeType === 3 /* Node.TEXT_NODE */) {
            const text = node.nodeValue;
            return text === "" ? null : {text};
        }
        if (node.nodeType === 1 /* Node.ELEMENT_NODE */) {
            const togo = fluid.elementToVNode(node);

            const children = [];
            for (let i = 0; i < node.childNodes.length; ++i) {
                const child = fluid.domToVDom(node.childNodes[i]);
                if (child !== null) {
                    children.push(child);
                }
            }
            togo.children = children;
            return togo;
        }
        return null; // Ignore other node types (comments, etc.)
    };

    fluid.importOneUrlResource = function (layerName, relPath) {
        return {
            url: fluid.importMap[layerName].urlBase + relPath,
            variety: "importUrlResource"
        };
    };

    fluid.importUrlResource = function (layerName, relPath) {
        return typeof(relPath) === "string" ? fluid.importOneUrlResource(layerName, relPath) :
            Array.isArray(relPath) ? relPath.map(oneRelPath => fluid.importOneUrlResource(layerName, oneRelPath)) : null;
    };

    /**
     * Converts a virtual DOM node (VNode) into a real DOM node and applies its children.
     * This function creates the root DOM node from the given VNode and then recursively
     * patches its children to ensure the DOM structure matches the virtual DOM tree.
     * @param {Document} dokkument - The document object used to create DOM nodes.
     * @param {VNode} vnode - The virtual DOM node to convert into a real DOM node.
     * @return {Node} The root DOM node corresponding to the VNode.
     */
    fluid.vNodeToDom = function (dokkument, vnode) {
        const root = fluid.nodeFromVNode(dokkument, vnode);
        fluid.patchChildren(vnode, root);
        return root;
    };

    // Formerly called at the end of every injected script to confirm that its evaluation completed - retained as a
    // no-op so that pages hydrated whilst it was, which still call it, continue to boot. See
    // fluid.applyEvaluatedScriptInjection for how a failed evaluation is now detected
    fluid.scriptInjectionComplete = function () {
    };

    /**
     * Wrap source text in a function scope without disturbing its line numbers. The prefix shares line 1 with the original
     * text so that only columns on that line shift, and any leading "use strict" remains in the function's directive
     * prologue.
     * @param {String} text - The source text to be wrapped.
     * @param {String} absUrl - The absolute URL to be reported to the debugger.
     * @param {String} scope - A injection scope style - "global" is supported
     * @return {String} The wrapped source, ready for insertion into a script element.
     */
    fluid.wrapScriptSource = function (text, absUrl, scope) {
        return (scope !== "global" ? "(function () {" : "") + text +
            (scope !== "global" ? "\n}).call(globalThis);" : "") +
            "\n//# sourceURL=" + absUrl;
    };

    /**
     * Fetch the text of an injected resource, bypassing any cached copy so that reloads observe the current file.
     * @param {String} url - The absolute URL of the resource.
     * @return {Promise<String>} A promise for the resource's text, rejecting on a network or HTTP failure.
     */
    fluid.fetchInjectionText = function (url) {
        return fetch(url, {cache: "no-cache"}).then(response => {
            if (response.ok) {
                return response.text();
            } else {
                throw new Error(`HTTP ${response.status} ${response.statusText} fetching ${url}`);
            }
        });
    };

    /**
     * Find the node after which a fresh injection is placed in a document - the last node injected into it, or else its
     * last `<fluid-import>`, which may lie in its head or its body. Injections are so placed in the order they are made,
     * after the bootstrap of Infusion and the imports which demand them and before any stylesheet or script which the
     * page holds after its imports, whether the document is still being parsed, as when a page boots in the browser, or
     * complete, as when it is rendered under node. So a hydrated page, whose injected scripts run as it is parsed, runs
     * them only once Infusion is loaded, and the cascade of a page's own stylesheets over those of its Single File
     * Components is the same in its hydrated form as in its minimal one.
     * @param {Document} dokkument - The document into which a node is injected.
     * @return {Node|null} The node after which it is placed, or `null` if it is to be appended to the head.
     */
    fluid.injectionAnchor = function (dokkument) {
        const last = dokkument.fluidLastInjected;
        const imports = dokkument.querySelectorAll("fluid-import");
        return last && last.isConnected !== false && last.parentNode ? last :
            imports.length > 0 ? imports[imports.length - 1] : null;
    };

    /**
     * Connect a freshly built injection node to the document, replacing any existing node with the same id or else
     * placing it after the anchor found by `fluid.injectionAnchor`.
     * @param {Document} dokkument - The document into which the node is injected.
     * @param {Element|null} existing - Any existing node with the injection's id.
     * @param {Element} fresh - The fresh node, which must already carry the injection's id.
     */
    fluid.swapInjectedNode = function (dokkument, existing, fresh) {
        fresh.flInjected = true;
        if (existing) {
            existing.replaceWith(fresh);
        } else {
            const anchor = fluid.injectionAnchor(dokkument);
            if (anchor) {
                anchor.parentNode.insertBefore(fresh, anchor.nextSibling);
            } else {
                dokkument.head.appendChild(fresh);
            }
        }
        dokkument.fluidLastInjected = fresh;
    };

    /**
     * Commit a script injection. Since a script element evaluates only once, on connection, every commit builds a fresh
     * element. Evaluation happens synchronously during the swap, reporting any syntax or runtime error to the window's
     * error event where a temporary listener captures it. A script which cannot run at all - in a document with no
     * window, or one refused by a content security policy - is reported as a failure, as is any error captured.
     * @param {DocInjectionRecord} docInjRec - The injection payload, whose `material` holds members `text` and `sourceUrl`.
     * @param {Element|null} existing - Any existing node with the injection's id.
     * @return {Boolean|Unavailable} `true` if evaluation completed, otherwise an unavailable value describing the failure.
     */
    fluid.applyScriptInjection = function ({dokkument, injRec, material}, existing) {
        let togo;
        if (injRec.client && !fluid.hostEvaluatesClientScripts()) {
            togo = fluid.recordClientScriptInjection(dokkument, injRec, existing);
        } else {
            togo = fluid.applyEvaluatedScriptInjection({dokkument, injRec, material}, existing);
        }
        return togo;
    };

    // `true` whilst a document is being rendered statically, e.g. by hydrate.js, rather than live in the browser - set
    // by fluid.loadAndBootDocument in server-support.js before the document is booted. A component bearing
    // fluid.withPlaceholder then fetches its placeholder in place of its genuine data
    fluid.renderingStatically = false;

    // A mixin for a component which fetches data from its `url`, as it does through its member `fetchUrl` - e.g.
    // fluid.jsonReader - supplying as `placeholderUrl` a short file of the same shape, which is fetched in its place when
    // the document is rendered statically. So the static rendering, e.g. a page written by hydrate.js, is rendered from
    // the placeholder, and is replaced once the page boots in the browser and fetches the genuine data. The component's
    // `isPlaceholder` is then `true`, so that it, or what holds it, can render as it should until its genuine data
    // arrives, e.g. by showing a loading indicator. Each such component is listed in fluid.withPlaceholder.instances, so
    // that the hydrater can find, without knowing the design, every file a page fetches and what stands in for it
    fluid.def("fluid.withPlaceholder", {
        // url: String - the genuine URL, relative to the document
        placeholderUrl: null,
        isPlaceholder: "$compute:fluid.withPlaceholder.isPlaceholder({self}.placeholderUrl)",
        fetchUrl: "$compute:fluid.withPlaceholder.fetchUrl({self}.url, {self}.placeholderUrl)",
        registration: {
            $bindable: {
                bind: "fluid.withPlaceholder.register({self})",
                unbind: "fluid.withPlaceholder.deregister({boundValue})"
            }
        }
    });

    /**
     * Determine whether a component bearing `fluid.withPlaceholder` fetches its placeholder in place of its genuine data
     * @param {String|null} placeholderUrl - The URL of its placeholder, if it has one
     * @return {Boolean} `true` if the document is rendered statically, and the component has a placeholder
     */
    fluid.withPlaceholder.isPlaceholder = placeholderUrl => fluid.renderingStatically && !!placeholderUrl;

    /**
     * Determine the URL fetched by a component bearing `fluid.withPlaceholder`
     * @param {String} url - Its genuine URL
     * @param {String|null} placeholderUrl - The URL of its placeholder, if it has one
     * @return {String} The URL of its placeholder if it is fetched in place of its genuine data, else its genuine URL
     */
    fluid.withPlaceholder.fetchUrl = (url, placeholderUrl) => fluid.withPlaceholder.isPlaceholder(placeholderUrl) ? placeholderUrl : url;

    // Each component bearing fluid.withPlaceholder which is live
    fluid.withPlaceholder.instances = new Set();

    fluid.withPlaceholder.register = function (that) {
        fluid.withPlaceholder.instances.add(that);
        return that;
    };

    fluid.withPlaceholder.deregister = function (that) {
        fluid.withPlaceholder.instances.delete(that);
    };

    /**
     * Determine whether any of a set of components bearing `fluid.withPlaceholder` fetches its placeholder - e.g. to
     * decide whether what holds them is rendering placeholder data
     * @param {...Boolean} isPlaceholders - The `isPlaceholder` member of each component
     * @return {Boolean} `true` if any of them fetches its placeholder
     */
    fluid.withPlaceholder.any = (...isPlaceholders) => isPlaceholders.some(isPlaceholder => isPlaceholder);

    // A loader for a JSON file at `url`. Its `data` member is pending until the file has been loaded and parsed. It
    // fetches its `fetchUrl`, which is its `url` unless it bears fluid.withPlaceholder
    fluid.def("fluid.jsonReader", {
        $layers: "fluid.component",
        // url: String
        fetchUrl: "{self}.url",
        data: "$compute:fluid.fetchJSON({self}.fetchUrl)"
    });

    /**
     * Express a URL relative to a base URL, e.g. that of a document, if they share an origin - so that a document
     * written to a file, e.g. by a static build, refers to its resources wherever it is served from
     * @param {String|URL} base - The base URL
     * @param {String} target - The URL to be expressed, which may itself be relative to the base
     * @return {String} The relative URL, or the absolute URL if the two have different origins
     */
    fluid.relativeUrl = function (base, target) {
        const baseUrl = new URL(base);
        const targetUrl = new URL(target, baseUrl);
        let togo;
        if (baseUrl.protocol === targetUrl.protocol && baseUrl.host === targetUrl.host) {
            const baseSegs = baseUrl.pathname.split("/").slice(0, -1);
            const targetSegs = targetUrl.pathname.split("/");
            let common = 0;
            while (common < baseSegs.length && common < targetSegs.length - 1 && baseSegs[common] === targetSegs[common]) {
                ++common;
            }
            togo = [...new Array(baseSegs.length - common).fill(".."), ...targetSegs.slice(common)].join("/") + targetUrl.search + targetUrl.hash;
        } else {
            togo = targetUrl.href;
        }
        return togo;
    };

    /**
     * Determine whether the host runs the scripts held in a document's markup as it loads, as a browser does. A
     * document rendered by a static build holds the scripts injected for its Single File Components - where the host
     * has run them, they are adopted rather than injected afresh - see `fluid.adoptMarkupInjections`. A host which
     * does not, e.g. node, declares so by supplying `fluidHost.runsMarkupScripts: false` in its global object
     * @return {Boolean} `true` if scripts in markup have been run
     */
    fluid.hostRunsMarkupScripts = function () {
        return fluid.global.fluidHost?.runsMarkupScripts ?? true;
    };

    /**
     * Find the script in a document's markup, written by a static build, which was injected from a given source - see
     * `fluid-src` as written by the injection styles
     * @param {Document} dokkument - The document
     * @param {String} url - The absolute URL of the script's source
     * @return {Element|undefined} The script element, if it is present and has not been injected by this session
     */
    fluid.markupScriptFrom = function (dokkument, url) {
        const location = fluid.documentLocation(dokkument);
        return [...dokkument.querySelectorAll("script[fluid-src]")].find(node => !node.flInjected &&
            new URL(node.getAttribute("fluid-src"), location).href === new URL(url, location).href);
    };

    /**
     * Adopt the injections of a Single File Component which a document's markup already holds, e.g. as written by a
     * static build of the document, rather than injecting them afresh - so that a script is not run a second time, nor
     * a stylesheet loaded again. Styles and symbols are always adopted. Scripts are adopted only where the host has run
     * those in the markup - see `fluid.hostRunsMarkupScripts`. An adopted injection is taken to be the one its record
     * describes, since the document was rendered from the same SFC - should the SFC change, it is injected afresh.
     * @param {Document} dokkument - The document
     * @param {Object<String, InjectRecord>} injRecs - The injection records of the SFC
     * @return {Object<String, InjectRecord>} The records adopted, keyed by node id
     */
    fluid.adoptMarkupInjections = function (dokkument, injRecs) {
        const adopted = {};
        Object.values(injRecs).forEach(injRec => {
            const node = dokkument.getElementById(injRec.nodeId);
            if (node && !node.flInjected && (injRec.variety !== "script" || fluid.hostRunsMarkupScripts())) {
                node.flInjected = true;
                adopted[injRec.nodeId] = injRec;
            }
        });
        return adopted;
    };

    /**
     * Determine whether the host evaluates scripts which are payload for the browser alone, bearing `fluid-client`. A
     * real browser does - a host mocking one, e.g. the node test runner, declares that it does not by supplying
     * `fluidHost.evaluatesClientScripts: false` in its global object
     * @return {Boolean} `true` if such scripts are evaluated
     */
    fluid.hostEvaluatesClientScripts = function () {
        return fluid.global.fluidHost?.evaluatesClientScripts ?? true;
    };

    /**
     * Record in a document a script for the browser alone which the host does not evaluate, as a link to its source
     * @param {Document} dokkument - The document into which the script is injected
     * @param {InjectRecord} injRec - The injection record, whose `url` is the script's URL
     * @param {Element|null} existing - Any existing node with the injection's id
     * @return {Boolean} `true`, since recording the script cannot fail
     */
    fluid.recordClientScriptInjection = function (dokkument, injRec, existing) {
        const fresh = dokkument.createElement("script");
        const src = fluid.module.resolveRelativePath(fluid.documentLocation(dokkument), injRec.url);
        fresh.setAttribute("src", src);
        fresh.setAttribute("fluid-src", src);
        fresh.setAttribute("fluid-client", "");
        fresh.id = injRec.nodeId;
        fluid.swapInjectedNode(dokkument, existing, fresh);
        return true;
    };

    /**
     * Commit a script injection by evaluating it - see `fluid.applyScriptInjection`
     * @param {DocInjectionRecord} docInjRec - The injection payload, whose `material` holds members `text` and `sourceUrl`.
     * @param {Element|null} existing - Any existing node with the injection's id.
     * @return {Boolean|Unavailable} `true` if evaluation completed, otherwise an unavailable value describing the failure.
     */
    fluid.applyEvaluatedScriptInjection = function ({dokkument, injRec, material}, existing) {
        let togo;
        const fresh = dokkument.createElement("script");
        fresh.text = fluid.wrapScriptSource(material.text, material.sourceUrl, injRec.scope);
        fresh.id = injRec.nodeId;
        if (injRec.client) {
            fresh.setAttribute("fluid-client", "");
        }
        // A script from a source records it, so that a static build of the document may be adopted - see fluid.markupScriptFrom
        if (injRec.url) {
            fresh.setAttribute("fluid-src", material.sourceUrl);
        }

        let captured = null;
        let refused = false;
        const view = dokkument.defaultView;
        const errorListener = event => {
            captured = event.error ?? event.message;
        };
        const refusalListener = () => {
            refused = true;
        };
        view?.addEventListener("error", errorListener);
        dokkument.addEventListener?.("securitypolicyviolation", refusalListener);
        try {
            fluid.swapInjectedNode(dokkument, existing, fresh);
        } finally {
            view?.removeEventListener("error", errorListener);
            dokkument.removeEventListener?.("securitypolicyviolation", refusalListener);
        }

        if (view && !refused && captured === null) {
            togo = true;
        } else {
            togo = fluid.unavailable({
                message: `Failure evaluating script at ${material.sourceUrl}` + (!view ? " - its document has no window in which to run it" :
                    refused ? " - refused by the document's content security policy" : ""),
                cause: captured
            });
        }
        return togo;
    };

    /**
     * Wait for a stylesheet link to finish loading.
     * @param {HTMLLinkElement} link - A link element which has just been connected or had its href changed.
     * @param {String} url - The resolved URL, for error reporting.
     * @return {Promise<Boolean|Unavailable>} Resolves to `true` on load, or an unavailable value on failure. Never rejects.
     */
    fluid.awaitLinkLoad = function (link, url) {
        return new Promise(resolve => {
            const done = outcome => {
                link.removeEventListener("load", onLoad);
                link.removeEventListener("error", onError);
                resolve(outcome);
            };
            const onLoad = () => done(true);
            const onError = () => done(fluid.unavailable({message: `Failure loading stylesheet at ${url}`}));
            link.addEventListener("load", onLoad);
            link.addEventListener("error", onError);
        });
    };

    fluid.scriptInjectionStyles = {
        literal: {
            prepare: (injRec, dokkument, url) => ({text: injRec.text, sourceUrl: url}),
            apply: fluid.applyScriptInjection
        },
        link: {
            prepare: (injRec, dokkument) => {
                const resolved = fluid.module.resolveRelativePath(dokkument.location, injRec.url);
                // A script for the browser alone which the host does not evaluate needs no text
                return injRec.client && !fluid.hostEvaluatesClientScripts() ? {text: null, sourceUrl: resolved} :
                    fluid.fetchInjectionText(resolved).then(text => ({text, sourceUrl: resolved}));
            },
            apply: fluid.applyScriptInjection
        }
    };

    // CSS nodes are live - a <style> re-parses on any change to its text and a <link> re-fetches on any change to its href -
    // so an existing node of the right kind is updated in place rather than replaced
    fluid.cssInjectionStyles = {
        literal: {
            apply: ({dokkument, injRec, url}, existing) => {
                // An output document is to be published, and so does not reveal the location of the SFC's source
                const text = injRec.text + (fluid.isOutputDocument(dokkument) ? "" : `\n/*# sourceURL=${url}*/`);
                if (existing?.localName === "style") {
                    existing.textContent = text;
                } else {
                    const fresh = dokkument.createElement("style");
                    fresh.textContent = text;
                    fresh.id = injRec.nodeId;
                    fluid.swapInjectedNode(dokkument, existing, fresh);
                }
                return true;
            }
        },
        link: {
            apply: ({dokkument, injRec}, existing) => {
                const resolved = fluid.module.resolveRelativePath(fluid.documentLocation(dokkument), injRec.url);
                if (existing?.localName === "link") {
                    if (existing.href === resolved && existing.sheet) {
                        return true; // Unchanged and already loaded - no load event would fire
                    }
                    const loaded = fluid.awaitLinkLoad(existing, resolved);
                    existing.href = resolved;
                    return loaded;
                } else {
                    const fresh = dokkument.createElement("link");
                    fresh.rel = "stylesheet";
                    fresh.href = resolved;
                    fresh.id = injRec.nodeId;
                    const loaded = fluid.awaitLinkLoad(fresh, resolved); // Listen before connecting
                    fresh.href = resolved;
                    fluid.swapInjectedNode(dokkument, existing, fresh);
                    return loaded;
                }
                return true;
            }
        }
    };

    // The SVG namespace, in which the hosts of injected symbols are created
    fluid.svgNamespace = "http://www.w3.org/2000/svg";

    // The id of the single hidden <svg> element in a document's body holding the symbols injected for every Single File
    // Component - see fluid.symbolsInjectionStyles. It matches the pattern of fluid.isInjectedNode, so that a rendering
    // of the body leaves it alone
    fluid.symbolsHostId = "fl-symbols-host";

    /**
     * Find, or else create, the hidden `<svg>` element in a document's body which hosts the symbols injected for Single
     * File Components. The symbols are held in the body rather than the head, since an HTML parser reading a document
     * written with them would move them there anyway.
     * @param {Document} dokkument - The document
     * @return {Element} The host element
     */
    fluid.symbolsHost = function (dokkument) {
        let host = dokkument.getElementById(fluid.symbolsHostId);
        if (!host) {
            host = dokkument.createElementNS(fluid.svgNamespace, "svg");
            host.setAttribute("id", fluid.symbolsHostId);
            host.setAttribute("aria-hidden", "true");
            host.setAttribute("style", "position: absolute; width: 0; height: 0; overflow: hidden");
            host.flInjected = true;
            dokkument.body.prepend(host);
        }
        return host;
    };

    // The symbols of a Single File Component are injected as a <defs> element holding the markup of its <symbols> block,
    // within the shared host - see fluid.symbolsHost. Since symbols are inert, an existing <defs> is updated in place,
    // and any <use> referring to them updates live
    fluid.symbolsInjectionStyles = {
        literal: {
            apply: ({dokkument, injRec}, existing) => {
                if (existing?.localName === "defs") {
                    existing.innerHTML = injRec.text;
                } else {
                    const fresh = dokkument.createElementNS(fluid.svgNamespace, "defs");
                    fresh.setAttribute("id", injRec.nodeId);
                    fresh.innerHTML = injRec.text;
                    fresh.flInjected = true;
                    if (existing) {
                        existing.replaceWith(fresh);
                    } else {
                        fluid.symbolsHost(dokkument).appendChild(fresh);
                    }
                }
                return true;
            }
        }
    };

    /**
     * Select the injection styles appropriate for an injection record's variety
     * @param {InjectRecord} injRec - The injection record
     * @param {Document} dokkument - The document into which it is injected
     * @return {Object<String, InjectionStyle>} The injection styles, keyed by `literal` and `link`
     */
    fluid.injectionStylesForRecord = function (injRec, dokkument) {
        return injRec.variety === "script" ? fluid.scriptInjectionStylesFor(dokkument) :
            injRec.variety === "symbols" ? fluid.symbolsInjectionStyles : fluid.cssInjectionStyles;
    };

    /**
     * Load phase: acquire the material for an injection without touching the document or executing anything. Styles
     * without a `prepare` method need no material.
     * @param {DocInjectionRecord} docInjRec - The decoded injection payload.
     * @return {Promise<DocInjectionRecord>} A promise for the payload augmented with its `material`.
     */
    fluid.prepareSFCElement = function (docInjRec) {
        const {dokkument, injStyle, injRec, url} = docInjRec;
        const material = injStyle.prepare ? injStyle.prepare(injRec, dokkument, url) : undefined;
        return Promise.resolve(material).then(material => ({...docInjRec, material}));
    };

    /**
     * Commit phase: apply a prepared injection to the document through its injection style, which owns the lifecycle of
     * its node.
     * @param {DocInjectionRecord} docInjRec - A payload as resolved by `fluid.prepareSFCElement`.
     * @return {Boolean|Unavailable} `true` if the injection completed, otherwise an unavailable value describing the failure.
     */
    fluid.doInjectSFCElement = function (docInjRec) {
        const existing = docInjRec.dokkument.getElementById(docInjRec.injRec.nodeId);
        return docInjRec.injStyle.apply(docInjRec, existing);
    };

    /**
     * @typedef {Object} InjectRecord
     * @property {String} nodeId - The unique identifier for the DOM node to be injected.
     * @property {String} variety - The type of injection, either "script", "style" or "symbols".
     * @property {String} [url] - A resolved URL for the script or style source.
     * @property {String} [text] - The inline script or style content with a source map comment.
     * @property {String} [scope] - For a "script" its injection scope style
     * @property {Boolean} [ownLayer] - For a "script", `true` if it holds the definition of the SFC's own layer
     * @property {Boolean} [client] - For a "script", `true` if it is payload for the browser alone - see `ScriptNodeInfo`
     */

    /**
     * Determine whether a DOM node was injected into its document for a Single File Component, e.g. its style. Such
     * nodes are ignored when reconciling an element's children with a template, e.g. when a component renders the
     * document's head - see `fluid.patchChildren`. A node held in a document loaded from markup, e.g. one written by
     * an earlier rendering, is recognised by its id.
     * @param {Node} node - The node to be tested
     * @return {Boolean} `true` if the node was injected
     */
    fluid.isInjectedNode = function (node) {
        return !!node.flInjected || node.nodeType === 1 /* Node.ELEMENT_NODE */ && /^fl-(script|style|symbols)-/.test(node.id);
    };

    /**
     * Classify a script element of a document by its role, e.g. so that a writer may decide which to keep:
     * - "framework" - a script booting Infusion itself, bearing `fluid-hydrated`, e.g. `fluid-hydrated="%infusion-6"`
     * - "injection" - a script injected for a Single File Component, or an inert record of one in an output document
     * - "client" - a script which is payload for the browser, bearing `fluid-client`, e.g. one loading a widget library.
     *   Such a script is never evaluated by the server, whether it is in a booted document or one rendered by a template
     * - "page" - any other script
     * @param {Element} node - The script element
     * @return {String} The role of the script
     */
    fluid.classifyScriptNode = function (node) {
        return node.hasAttribute("fluid-hydrated") ? "framework" :
            fluid.isInjectedNode(node) || node.getAttribute("type") === fluid.inertScriptType ? "injection" :
                node.hasAttribute("fluid-client") ? "client" : "page";
    };

    // The type borne by inert records of the scripts of Single File Components injected into output documents, which
    // a client recognises so that it may make the document live again
    fluid.inertScriptType = "text/x-fluid-layer";

    fluid.clearInjRec = function (dokkument, nodeId) {
        dokkument.getElementById(nodeId)?.remove();
    };

    /**
     * Resolves a given URL to an absolute URL. If the URL already has a protocol, it is returned as is.
     * Otherwise, it is resolved relative to the current document's location, taking into account relative paths.
     *
     * @param {Document} dokkument - The document relative to which to compute paths.
     * @param {String} url - The URL to resolve.
     * @return {String} The absolute URL.
     */
    fluid.toAbsoluteUrl = (dokkument, url) => /^\w+:\/\//.test(url) ? url : new URL(url, fluid.documentLocation(dokkument).href).href;

    /**
     * @typedef {Object} DocInjectionRecord
     * @property {Document} dokkument - The document object used for injection.
     * @property {InjectionStyle} injStyle - The injection style object - a member of fluid.xxxxInjectionStyles
     * @property {InjectRecord} injRec - The injection record for the SFC element.
     * @property {String} url - The URL of the SFC, used for debugging and error reporting.
     */

    fluid.diffFields = function (rec1, rec2, fields) {
        return fields.every(field => rec1[field] === rec2[field]);
    };

    /**
     * Decode an injection record into a payload for injection if it differs from the record previously injected under its
     * node id. No DOM changes are made here - any existing node is replaced during the commit phase.
     * @param {Document} dokkument - The document into which the element will be injected.
     * @param {InjectRecord} injRec - The record containing either the URL or inline content for the SFC element.
     * @param {String} url - The URL of the overall SFC, used for debugging and error reporting.
     * @param {Object<String, InjectRecord>} oldInjRecs - A map of existing injection records, keyed by node ID.
     * @param {Object<String, InjectionStyle>} injStyles - A map of injection styles, keyed by "literal" or "link".
     * @return {DocInjectionRecord|null} - A DocInjectionRecord payload for injection, or `null` if no update is needed.
     */
    fluid.decodeInjectSFCElement = function (dokkument, injRec, url, oldInjRecs, injStyles) {
        const nodeId = injRec.nodeId;
        const diffFields = ["url", "text"];

        const existing = oldInjRecs[nodeId];
        const shouldInject = !existing || !fluid.diffFields(existing, injRec, diffFields);

        if (shouldInject) {
            // Note that an empty block such as <style></style> has empty text but is still literal
            const injStyleKey = injRec.url ? "link" : "literal";
            const injStyle = injStyles[injStyleKey];
            return {dokkument, injStyle, injRec, url};
        } else {
            return null;
        }
    };

    /**
     * Determines whether a given path is absolute.
     *
     * Strategy: Matches paths that either start with a forward slash (Unix-style absolute paths)
     * or begin with a lowercase URI scheme followed by "://".
     *
     * @param {String} path - The path to evaluate.
     * @return {Boolean} True if the path begins with "/" or matches a URI scheme, otherwise false.
     */
    fluid.isAbsolutePath = function (path) {
        return /^(?:\/|[a-z]+:\/\/)/.test(path);
    };

    /**
     * Removes a trailing slash from the end of a path string, if present.
     *
     * @param {String} path - The input path string to process.
     * @return {String} The path string without a trailing slash, or the original path if no trailing slash is present.
     */
    fluid.deSlash = function (path) {
        return path.endsWith("/") ? path.slice(0, -1) : path;
    };

    // TODO: Destroying the nodes should also deregister the module - global Giladism
    /**
     * Acquires all `<fluid-module>` elements within the given DOM root and populates the fluid module registry.
     * Each `<fluid-module>` element must have an `id` and a `src` attribute. The `src` is normalized to ensure it does not end with a "/".
     * It may also have a `modules` attribute, naming a module map, relative to the module's directory, which locates the
     * modules it depends upon - see `fluid.module.registerMap`. A page declares in this way the module which holds it,
     * e.g. `<fluid-module id="my-project" src="../" modules="fluid-modules.json">`.
     *
     * @param {Document} dokkument - The document for/from which the module should be registered
     * @param {VNode|Element} root - The root DOM element to search for `<fluid-module>` elements.
     * @return {Object<String, Object>} An array of objects representing the acquired `<fluid-module>` nodes.
     */
    fluid.acquireModules = function (dokkument, root) {
        const moduleNodes = fluid.querySelectorAll(root, "fluid-module");
        const entries = moduleNodes.map(node => {
            const id = node.attrs.id;
            const rawSrc = node.attrs.src;
            const origSrc = fluid.deSlash(rawSrc);
            const abs = fluid.isAbsolutePath(origSrc);
            const src = abs ? origSrc : fluid.deSlash(new URL(origSrc, dokkument.location.href).href);
            fluid.module.register(id, src, origSrc, abs);
            // The module's map of the modules it depends upon, relative to its directory - see fluid.module.registerMap
            const mapUrl = node.attrs.modules ? new URL(node.attrs.modules, src + "/").href : undefined;
            return [id, {node, path: src, mapUrl}];
        });
        return Object.fromEntries(entries);
    };

    /**
     * Extracts the layer name from a given file path.
     *
     * This function matches the last segment of the file path (excluding the file extension),
     * replaces any hyphens (`-`) with dots (`.`), and returns the resulting string.
     *
     * @param {String} path - The file path to extract the layer name from.
     * @return {String} The extracted layer name with hyphens replaced by dots, or an empty string if no match is found.
     */
    fluid.pathToLayerName = function (path) {
        const match = path.match(/\/([^/]+)\.[^/.]+$/);
        return match ? match[1].replace(/-/g, ".") : "";
    };

    /**
     * Acquires all `<fluid-import>` elements within the given DOM root and registers them in the `fluid.importMap`.
     * Each `<fluid-import>` element must have a `layer` and a `src` attribute. The `src` is resolved to an absolute URL.
     * The function also initiates the loading of the Single File Component (SFC) for each import.
     *
     * @param {Document} dokkument - The document object into which any injection directives will be injected
     * @param {VNode|Element} root - The root element to search for `<fluid-import>` elements.
     * @return {Array<Object>} An array of objects representing the acquired `<fluid-import>` nodes, including their layer names and URLs.
     */
    fluid.docToImportMap = function (dokkument, root) {
        const importMap = {};
        const importNodes = fluid.querySelectorAll(root, "fluid-import");
        importNodes.forEach(node => {
            // A relative path is relative to the document, and is resolved so that the paths within the imported SFC,
            // which are relative to the SFC, can be resolved in turn - see fluid.resolveSFCPath
            const path = fluid.resolveSFCPath(fluid.documentLocation(dokkument)?.href, node.attrs.src);
            const layerName = node.attrs.layer || fluid.pathToLayerName(path);
            if (!layerName) {
                // TODO: Feed this back to any UI editing the document
                fluid.log(fluid.logLevel.FAIL, "Error in document structure: couldn't determine layer name from import ", node);
            } else {
                importMap[layerName] = {path, node};
            }
        });
        fluid.loadImportMap(importMap);

        // We can do this early in case the imports are found in a doc, otherwise it will happen when the layer
        // is demanded - in time this should be removed
        Object.keys(importMap).forEach(layerName => fluid.subscribeDocToInjections(layerName, dokkument));

        return importMap;
    };

    /**
     * Removes a specific element from an array, if it exists.
     * This function searches for the element in the array, and if found,
     * removes it by modifying the array in place.
     *
     * @param {Array} [array] - The array from which the element should be removed.
     * @param {any} element - The element to remove from the array.
     */
    fluid.removeArrayElement = function (array, element) {
        if (array) {
            const index = array.indexOf(element);
            if (index !== -1) {
                array.splice(index, 1);
            }
        }
    };

    // Currently only called from activateTemplate
    // acquireModules and acquireImports called separately from root document onload
    /**
     * Processes and removes all `<fluid-url-base>` and `<fluid-import>` directive nodes from the given root.
     * This function ensures that these directive nodes are not rendered in the final DOM output, if the root was a template
     * @param {Document} dokkument - The document object into which any injection directives will be injected
     * @param {VNode} root - The template element to process.
     */
    fluid.acquireLoadDirectives = function (dokkument, root) {
        // Remove directive nodes from template since no use in them rendering
        const removeAll = recs => fluid.each(recs, rec => fluid.removeArrayElement(rec.node.parentNode, rec.node));
        removeAll(fluid.acquireModules(dokkument, root));
        removeAll(fluid.docToImportMap(dokkument, root));
    };

    /**
     * Represents the result of parsing a single `<script>` node in an SFC.
     *
     * - If the script node has a `src` attribute, only the `src` string is recorded.
     * - Otherwise, the inline script is parsed to extract a `DefMap` and its original text.
     *
     * @typedef {Object} ScriptNodeInfo
     * @property {String} [url] - The source URL if the script uses `src`.
     * @property {DefMap} [defMaps] - The parsed defMap for inline script content.
     * @property {String} [text] - The original text of the inline script.
     * @property {String} [scope] - A possible scope marker for a script injection style - supported value is "global"
     * @property {Boolean} [client] - `true` if the script bears `fluid-client`, marking it as payload for the browser
     * alone, e.g. a widget library, which the server records but does not evaluate
     */

    /**
     * Parses a list of SFC `<script>` nodes (`VNode[]`) and returns structural metadata for each script.
     *
     * Each node is analyzed as follows:
     * - If it contains a `src` attribute, a record is returned with only the `src`.
     * - Otherwise, the inline text is parsed using `fluid.parseDefMaps`, producing a `DefMap` and returning
     *   both the map and the original text.
     *
     * @param {VNode[]} scriptNodes - An array of virtual DOM nodes representing `<script>` elements.
     * @return {ScriptNodeInfo[]} - A list of metadata records for each script node.
     */
    fluid.parseSFCScripts = function (scriptNodes) {
        const defMapList = scriptNodes.map((scriptNode) => {
            const src = scriptNode.attrs?.src;
            if (src) {
                return {url: src, scope: scriptNode.attrs["data-fl-scope"], client: scriptNode.attrs["fluid-client"] !== undefined};
            } else {
                const text = scriptNode.children[0]?.text;
                const defMaps = fluid.parseDefMaps(text, 0);
                return {defMaps, text};
            }
        });
        return defMapList;
    };

    /**
     * Metadata describing where a given layer definition appears within a script.
     *
     * @typedef {Object} LayerDefLocation
     * @property {Integer} scriptIndex - Index of the script in the original `defMapList`.
     * @property {Integer} from - Start offset of the definition in the source text.
     * @property {Integer} to - End offset of the definition in the source text.
     */

    /**
     * An index mapping layer (definition) names to their source locations across multiple scripts.
     *
     * @typedef {Object.<String, LayerDefLocation>} LayerDefIndex
     */

    /**
     * Builds an index of all top-level layer (definition) names from a list of parsed script records.
     *
     * This function iterates through each entry in the `defMapList` (typically the result of `fluid.parseSFCScripts`),
     * skipping any entries that are external `src` strings. For inline scripts, it extracts the top-level
     * keys in each `defMaps` object and records their character range along with the index of the script.
     *
     * The resulting index allows efficient lookup of where a given layer is defined within the full set of scripts.
     *
     * @param {ScriptNodeInfo[]} defMapList - A list of parsed script records (inline or external).
     * @return {LayerDefIndex} - A map from layer names to their locations within the source scripts.
     */
    fluid.indexLayerDefs = function (defMapList) {
        const layerDefIndex = {};
        defMapList.forEach( (rec, index) => {
            if (typeof(rec) !== "string") {
                const {defMaps} = rec;
                fluid.each(defMaps, (range, layerName) => {
                    layerDefIndex[layerName] = {scriptIndex: index, ...range};
                });
            }
        });
        return layerDefIndex;
    };

    /**
     * Find the top-level blocks of a Single File Component with a given tag - e.g. its `<script>` blocks, but not any
     * `<script>` element within its `<template>`, which is markup to be rendered
     * @param {VNode} vTree - The virtual DOM tree representing the Single File Component
     * @param {String} tag - The tag of the blocks
     * @return {VNode[]} The blocks, in document order
     */
    fluid.sfcBlocks = function (vTree, tag) {
        return vTree.children.filter(child => child.tag === tag);
    };

    /**
     * Resolve a path written in a Single File Component, e.g. the `src` of a `<script>`, `<style>` or `<fluid-import>`
     * block. A path beginning with a module reference `%module/`, or which is absolute, is returned unchanged, to be
     * resolved once it is used - see `fluid.module.resolveRelativePath`. Any other path is relative to the SFC itself,
     * and is resolved against its URL, so that a set of SFCs and the files they refer to may be moved together, e.g. by
     * copying them into another project.
     * @param {String} [sfcUrl] - The absolute URL of the SFC. If it is not supplied, the path is returned unchanged
     * @param {String} path - The path to be resolved
     * @return {String} The resolved path
     */
    fluid.resolveSFCPath = function (sfcUrl, path) {
        return sfcUrl && !path.startsWith("%") && !fluid.isAbsolutePath(path) ? new URL(path, sfcUrl).href : path;
    };

    /**
     * Collect the imports declared by the top-level `<fluid-import src="..." [layer="..."]>` blocks of a Single File
     * Component, whose paths are resolved by `fluid.resolveSFCPath`. As for a `<fluid-import>` in a document, the
     * layer name defaults to the name of the imported file - see `fluid.pathToLayerName`.
     * @param {VNode} vTree - The parsed SFC
     * @param {String} [sfcUrl] - The absolute URL of the SFC
     * @return {Object<String, Object>} An import map, suitable for `fluid.loadImportMap`, keyed by layer name
     */
    fluid.sfcImportMap = function (vTree, sfcUrl) {
        const importMap = {};
        fluid.sfcBlocks(vTree, "fluid-import").forEach(node => {
            const path = fluid.resolveSFCPath(sfcUrl, node.attrs.src);
            const layerName = node.attrs.layer || fluid.pathToLayerName(path);
            if (!layerName) {
                fluid.log(fluid.logLevel.FAIL, "Error in SFC structure: couldn't determine layer name from import ", node);
            } else if (!fluid.importMap[layerName]) {
                importMap[layerName] = {path, node};
            }
        });
        return importMap;
    };

    /**
     * Read verbatim the markup held within a top-level block of a Single File Component, e.g. its `<symbols>` block,
     * whose SVG content would not survive conversion through the HTML template parser's tree
     * @param {String} text - The text of the SFC
     * @param {VNode} node - The parsed block, bearing the `start` and `end` offsets of its tags in `text`
     * @return {String} The markup between the block's opening and closing tags, trimmed
     */
    fluid.sfcBlockInnerText = function (text, node) {
        const from = text.indexOf(">", node.start) + 1;
        const to = text.lastIndexOf("</", node.end);
        return text.slice(from, to).trim();
    };

    /**
     * Describe the error of a Single File Component which defines its view's template twice - see
     * `fluid.hasSFCTemplateConflict`
     * @param {String} layerName - The name of the layer defined by the SFC
     * @return {String} The description of the error
     */
    fluid.sfcTemplateConflictMessage = layerName => `Error in SFC for ${layerName}: Its layer defines `
        + "view.$component.template, but the SFC also has a <template> block, which would replace it - remove one or "
        + "the other. A template which is computed, e.g. by \"$compute:...\", should be held in view.$component.template, "
        + "with no <template> block";

    /**
     * Determine whether a Single File Component defines its view's template twice - both as a `<template>` block and
     * as `view.$component.template` in the definition of its own layer. The block would be written over the member,
     * silently discarding it. A partial view, whose `<template>` block is written elsewhere, is not affected.
     * @param {VNode} vTree - The virtual DOM tree representing the Single File Component
     * @param {ScriptNodeInfo} ourSNI - The parsed script holding the definition of the SFC's own layer
     * @param {String} layerName - The name of the layer defined by the SFC
     * @return {Boolean} `true` if the template is defined twice
     */
    fluid.hasSFCTemplateConflict = function (vTree, ourSNI, layerName) {
        const docTemplate = fluid.sfcBlocks(vTree, "template")[0];
        const ownTemplate = fluid.get(ourSNI.defMaps, [layerName, "view", "$component", "template", $m]);
        const viewLayers = fluid.defFromMap(ourSNI.text, ourSNI.defMaps, layerName, ["view", "$component", "$layers"]);
        return !!docTemplate && !!ownTemplate && !fluid.makeArray(viewLayers).includes("fluid.partialViewComponent");
    };

    /**
     * The provenance of a Single File Component, recorded in a top-level `<provenance>` block holding an element for
     * each of its fields, e.g. by an AI integration recording how the layer it defines was generated. The block takes
     * no part in defining the layer, and is carried through verbatim with the rest of the SFC's text.
     * @typedef {Object} SFCProvenance
     * @property {String} [model] - The id of the AI model which generated the SFC
     * @property {String} [prompt] - The user's prompt from which it was generated
     * @property {String} [datestamp] - The ISO date at which it was generated
     */

    // The fields of an SFC's provenance, in the order in which they are written
    fluid.sfcProvenanceFields = ["model", "prompt", "datestamp"];

    /**
     * Escape text for inclusion as the text content of an HTML element
     * @param {String} text - The text to be escaped
     * @return {String} The escaped text
     */
    fluid.encodeHtmlText = text => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    /**
     * Find the top-level `<provenance>` blocks of a Single File Component
     * @param {VNode} vTree - The virtual DOM tree representing the Single File Component
     * @return {VNode[]} The blocks, in document order
     */
    fluid.sfcProvenanceNodes = vTree => vTree.children.filter(child => child.tag === "provenance");

    /**
     * Read the provenance recorded in the text of a Single File Component
     * @param {String} text - The text of the SFC
     * @return {SFCProvenance|null} The provenance recorded in its first `<provenance>` block, or `null` if it has none
     */
    fluid.readSFCProvenance = function (text) {
        const node = fluid.sfcProvenanceNodes(fluid.parseHTMLToTree(text))[0];
        return node ? fluid.provenanceFromNode(node) : null;
    };

    /**
     * Read the fields of provenance from a parsed `<provenance>` block
     * @param {VNode} node - The block
     * @return {SFCProvenance} The provenance it records
     */
    fluid.provenanceFromNode = function (node) {
        const togo = {};
        node.children.forEach(child => {
            if (fluid.sfcProvenanceFields.includes(child.tag)) {
                togo[child.tag] = child.children.map(textNode => textNode.text ?? "").join("");
            }
        });
        return togo;
    };

    /**
     * Render provenance as the markup of a `<provenance>` block. Fields whose values are absent are omitted.
     * @param {SFCProvenance} provenance - The provenance to be rendered
     * @return {String} The markup of the block, ending with a newline
     */
    fluid.renderProvenanceBlock = function (provenance) {
        const fields = fluid.sfcProvenanceFields.filter(field => typeof(provenance[field]) === "string")
            .map(field => `    <${field}>${fluid.encodeHtmlText(provenance[field])}</${field}>\n`);
        return "<provenance>\n" + fields.join("") + "</provenance>\n";
    };

    /**
     * Write provenance into the text of a Single File Component, as a `<provenance>` block at its end replacing any
     * which it already holds. Fields whose values are absent are omitted from the block.
     * @param {String} text - The text of the SFC
     * @param {SFCProvenance} provenance - The provenance to be written
     * @return {String} The text of the SFC holding the provenance
     */
    fluid.writeSFCProvenance = function (text, provenance) {
        const existing = fluid.sfcProvenanceNodes(fluid.parseHTMLToTree(text));
        // Remove existing blocks from the last, so that the offsets of earlier ones remain valid
        const stripped = existing.reduceRight((acc, node) => acc.slice(0, node.start) + acc.slice(node.end), text);
        return stripped.trimEnd() + "\n\n" + fluid.renderProvenanceBlock(provenance);
    };

    // Matches a `<provenance>` block held in line comments, as written by fluid.writeJSProvenance
    fluid.jsProvenancePattern = /^\/\/ <provenance>\n(?:\/\/.*\n)*?\/\/ <\/provenance>\n?/gm;

    /**
     * Read the provenance recorded in the text of a JavaScript layer, as a `<provenance>` block held in line comments
     * @param {String} text - The text of the layer
     * @return {SFCProvenance|null} The provenance recorded in its first such block, or `null` if it has none
     */
    fluid.readJSProvenance = function (text) {
        const match = text.match(fluid.jsProvenancePattern)?.[0];
        let togo = null;
        if (match) {
            const markup = match.split("\n").map(line => line.replace(/^\/\/ ?/, "")).join("\n");
            togo = fluid.readSFCProvenance(markup);
        }
        return togo;
    };

    /**
     * Write provenance into the text of a JavaScript layer, as a `<provenance>` block held in line comments at its end,
     * replacing any which it already holds - a JavaScript layer has no other place to hold it
     * @param {String} text - The text of the layer
     * @param {SFCProvenance} provenance - The provenance to be written
     * @return {String} The text of the layer holding the provenance
     */
    fluid.writeJSProvenance = function (text, provenance) {
        const stripped = text.replace(fluid.jsProvenancePattern, "");
        const block = fluid.renderProvenanceBlock(provenance).trimEnd().split("\n").map(line => "// " + line).join("\n");
        return stripped.trimEnd() + "\n\n" + block + "\n";
    };

    /**
     * Processes a vTree to extract and prepare injection records for scripts and styles.
     * This function validates the presence of required script nodes, parses their definitions, and updates
     * the layer definition with appropriate metadata. It also handles template blocks and style nodes.
     *
     * @param {VNode} vTree - The virtual DOM tree representing the Single File Component (SFC).
     * @param {String} layerName - The name of the layer associated with the SFC.
     * @param {String} [text] - The text of the SFC from which `vTree` was parsed, from which the markup of any
     * `<symbols>` block is read verbatim. Without it, any such block is ignored.
     * @param {String} [sfcUrl] - The absolute URL of the SFC, against which relative `src` paths of its blocks are
     * resolved - see `fluid.resolveSFCPath`
     * @return {Object<String, InjectRecord>} A map of injection records keyed by node ID, or `undefined` if an error occurs.
     */
    fluid.sfcToInjRecs = function (vTree, layerName, text, sfcUrl) {
        const reject = message => {
            const unavailable = fluid.unavailable(message);
            fluid.def(layerName, unavailable);
        };

        /** @type {Object<String, InjectRecord>} */
        const injRecs = {};
        const scriptNodes = fluid.sfcBlocks(vTree, "script");
        if (scriptNodes.length === 0) {
            reject(`Error in SFC: Expected definition for layer ${layerName} but no script node was found`);
        } else {
            /** @type {ScriptNodeInfo[]} */
            const defMapList = fluid.parseSFCScripts(scriptNodes);
            /** @type {LayerDefIndex} */
            const layerDefIndex = fluid.indexLayerDefs(defMapList);
            if (!layerDefIndex[layerName]) {
                reject(`Error in SFC: Expected definition for layer ${layerName} but found ${Object.keys(layerDefIndex).join(", ")} instead`);
            } else if (fluid.hasSFCTemplateConflict(vTree, defMapList[layerDefIndex[layerName].scriptIndex], layerName)) {
                reject(fluid.sfcTemplateConflictMessage(layerName));
            } else {
                /** @type {LayerDefLocation} */
                const ourDef = layerDefIndex[layerName];
                /** @type {ScriptNodeInfo} */
                const ourSNI = defMapList[ourDef.scriptIndex];
                const oldLayers = fluid.defFromMap(ourSNI.text, ourSNI.defMaps, layerName, "$layers");
                const viewLayersPath = ["view", "$component", "$layers"];
                const oldViewLayers = fluid.defFromMap(ourSNI.text, ourSNI.defMaps, layerName, viewLayersPath);

                const partial = fluid.makeArray(oldViewLayers).includes("fluid.partialViewComponent");

                let patchedText = ourSNI.text;

                /** @type {VNode} */
                const docTemplate = fluid.sfcBlocks(vTree, "template")[0];

                let addLayers = ["fluid.templateViewComponent"];

                // If a <template> block is present, store it in the template registry and add a definition to resolve it
                if (docTemplate) {
                    addLayers = ["fluid.sfcTemplateViewComponent"];
                    // Template configuration is written onto the component's view. The template of a partial is found
                    // in the template store by fluid.partialContributions, together with the cutpoint configured in the
                    // layer's own definition or overridden by another layer
                    if (!partial) {
                        // The template is written as the view's template member, referring to the template store, so
                        // that a template supplied by any stronger layer, e.g. a layer derived from this one, overrides it
                        patchedText = fluid.patchDefMapPath(patchedText, ourDef, ["view", "$component", "template"], {sfcLayer: layerName}, "last");
                    }
                    fluid.writeParsedTemplate(layerName, docTemplate);
                }

                // Reparse if the text has already been patched since existing entries may have moved
                const reparse = () => patchedText === ourSNI.text ? ourDef :
                    {scriptIndex: ourDef.scriptIndex, ...fluid.parseDefMaps(patchedText, 0)[layerName]};
                // If no layers were written for the component's view, add one that will correctly resolve its template.
                // Any view inherited from the component's other layers will accumulate this layer.
                if (!oldViewLayers && (docTemplate || !oldLayers)) {
                    patchedText = fluid.patchDefMapPath(patchedText, reparse(), viewLayersPath, addLayers, "first");
                }
                // Add the tag layer marking the layer as derived from an SFC. This must be placed first, where it is
                // weakest, since any of the existing layers may themselves be derived from an SFC - C3 linearization will
                // then demand that they are stronger than the tag layer.
                if (!oldLayers) {
                    patchedText = fluid.patchDefMap(patchedText, reparse(), "$layers", ["fluid.sfcLayer", "fluid.component"], "first");
                } else if (!fluid.makeArray(oldLayers).includes("fluid.sfcLayer")) {
                    patchedText = fluid.patchDefMap(patchedText, reparse(), "$layers", ["fluid.sfcLayer", ...fluid.makeArray(oldLayers)], "first");
                }
                ourSNI.text = patchedText;


                defMapList.forEach((sni, index) => {
                    const nodeId = `fl-script-${layerName}-${index}`;
                    const injRec = sni.url ?
                        {url: fluid.resolveSFCPath(sfcUrl, sni.url), scope: sni.scope, client: sni.client} :
                        {text: sni.text};
                    injRec.defMaps = sni.defMaps;
                    injRec.nodeId = nodeId;
                    injRec.variety = "script";
                    injRec.ownLayer = index === ourDef.scriptIndex;
                    injRecs[nodeId] = injRec;
                });

                const styleNodes = fluid.sfcBlocks(vTree, "style");
                styleNodes.forEach((styleNode, index) => {
                    const nodeId = `fl-style-${layerName}-${index}`;
                    const src = styleNode.attrs?.src;
                    const injRec = src ?
                        {url: fluid.resolveSFCPath(sfcUrl, src)} :
                        {text: styleNode.children[0]?.text ?? ""};
                    injRec.nodeId = nodeId;
                    injRec.variety = "style";
                    injRecs[nodeId] = injRec;
                });

                if (text !== undefined) {
                    fluid.sfcBlocks(vTree, "symbols").forEach((symbolsNode, index) => {
                        const nodeId = `fl-symbols-${layerName}-${index}`;
                        injRecs[nodeId] = {
                            text: fluid.sfcBlockInnerText(text, symbolsNode),
                            nodeId,
                            variety: "symbols"
                        };
                    });
                }
            }
        }
        return injRecs;
    };

    /**
     * Record in the layer history an edit to the text of an SFC which did not rewrite its layer's definition. The
     * layer's current value is recorded as both its old and new values, together with the SFC's old and new text.
     * @param {String} layerName - The name of the layer defined by the SFC
     * @param {String} oldText - The text of the SFC before the edit
     * @param {String} newText - The text of the SFC after the edit
     */
    fluid.pushSFCHistory = function (layerName, oldText, newText) {
        const layerValue = fluid.layerStore._value[layerName]?._value;
        if (layerValue) {
            fluid.history.push({type: "updateLayer", oldValue: layerValue, newValue: layerValue, layerName, oldText, newText});
        }
    };

    /**
     * Parses a Single File Component (SFC) from a given text signal and processes its content.
     * This function extracts the template, scripts, and styles from the SFC, evaluates the script
     * definitions, and constructs a component definition object. It also handles any trailing scripts
     * and injects them into the DOM with a source URL for debugging.
     *
     * @param {Object} rec - Record holding the SFC definition
     * @param {String} layerName - The name of the layer associated with the SFC.
     * @return {Effect<Object>} An effect that applies the parsed definition, including the template, CSS, and scripts.
     */
    fluid.parseSFC = function (rec, layerName) {
        let oldText;

        return fluid.cell.effect(text => {
            if (text === oldText) {
                fluid.log("Culling SFC injection effect since text has not changed");
                return;
            }
            fluid.log("**** Beginning to parse SFC for layer ", layerName);
            const previousText = oldText;
            oldText = text;
            const vTree = fluid.parseHTMLToTree(text);
            // Load any SFCs this one imports before its own script executes, so that their layers are known to be
            // forthcoming when it is instantiated
            fluid.loadImportMap(fluid.sfcImportMap(vTree, rec.url));
            const injRecs = fluid.sfcToInjRecs(vTree, layerName, text, rec.url);
            const ownScriptText = Object.values(injRecs).find(injRec => injRec.ownLayer)?.text;
            // An edit which leaves the script defining our layer unchanged, e.g. to the template alone, will not
            // reinject it, and so will not reach fluid.writeLayer - record the edit in the history here instead
            if (previousText !== undefined && ownScriptText !== undefined && ownScriptText === rec.ownScriptText) {
                fluid.pushSFCHistory(layerName, previousText, text);
            }
            rec.ownScriptText = ownScriptText;
            rec.injRecsSignal.set(injRecs);
            rec.loadCompletion.set(true);
            fluid.log("**** SFC completion for layer ", layerName);

        }, [rec.textSignal], {name: `fluid.parseSFC effect for ${layerName}`});
    };

    /**
     * @typedef {Object} SFCRecord
     * @property {Signal} textSignal - A signal containing the SFC's text content or an "unavailable" placeholder.
     * @property {Signal} injRecsSignal - A signal containing the injection records for the SFC.
     * @property {Map<Document, Effect>} docInjectEffects - A map of document-specific injection effects.
     * @property {String} [ownScriptText] - The text of the script defining the SFC's own layer when last parsed
     */

    /** @type {Object<String, SFCRecord>} */
    fluid.sfcStore = Object.create(null);

    // fluid.sfcStore also holds placeholder records for layers which have merely been asked about via fluid.readSFC -
    // this lists just those for which a load has begun, and may be read reactively to discover newly registered SFCs
    /** @type {Cell<String[]>} The names of all layers for which an SFC load has begun, in the order loads began */
    fluid.sfcLayerNames = fluid.cell([], {name: "Names of loading SFC layers"});

    /** @type {Object<String, Signal<VNode>>} */
    fluid.templateStore = Object.create(null);

    /**
     * @typedef {Object} DocLayerInjectionRec
     * @property {Signal<Boolean>} injectionsComplete - A signal with an available value if no injections are pending
     * @property {Signal<Array>} injRecsSignal - A signal holding an array of all pending injection actions
     */

    // Consumed in hydrate.js to determine when all injections are done
    /** @type {Map<Document, DocLayerInjectionRec>} */
    fluid.documentInjections = new Map();

    /**
     * Record the injection signal for a layer in the injection record of its document, so that the document's
     * `injectionsComplete` signal reflects it.
     * @param {Cell<Boolean>} injDone - The injection signal allocated by fluid.subscribeDocToInjections, tagged with its
     * `layerName` and `dokkument`
     */
    fluid.noteLayerInjectionInProgress = function (injDone) {
        const existing = fluid.documentInjections.get(injDone.dokkument);
        if (existing) {
            const existingRecs = [...existing.injRecsSignal._value];
            const existingLayerIndex = existingRecs.findIndex(rec => rec.layerName === injDone.layerName);
            if (existingLayerIndex !== -1) {
                existingRecs[existingLayerIndex] = injDone;
            } else {
                existingRecs.push(injDone);
            }
            existing.injRecsSignal.set(existingRecs);
        } else {
            /** @type {DocLayerInjectionRec} **/
            const rec = {
                injRecsSignal: fluid.cell([injDone], {name: `Document injections for ${fluid.documentLocation(injDone.dokkument)}`})
            };
            rec.injectionsComplete = fluid.cell(undefined, {name: `Injections complete for ${fluid.documentLocation(injDone.dokkument)}`})
                // Read each layer's injDone signal here, rather than returning a signal for them, which would itself be
                // an available value
                .computed( injRecs => fluid.processSignalArgs(injRecs).unavailable || true, [rec.injRecsSignal]);
            fluid.documentInjections.set(injDone.dokkument, rec);
        }
    };

    /**
     * Fetch the parsed `<template>` block of a Single File Component from the template store. The SFC's layer may be
     * defined before its template has been parsed - e.g. in a page written by a static build, whose markup holds the
     * SFC's script, which defines its layer as the page loads, before the SFC itself has been fetched - and its
     * template is then pending until it has been.
     * @param {String} layerName - The name of the layer defined by the SFC
     * @return {VNode|Unavailable} The parsed template, or an unavailable value if it is not yet parsed
     */
    fluid.fetchParsedTemplate = function (layerName) {
        if (!fluid.templateStore[layerName]) {
            fluid.templateStore[layerName] = fluid.cell(fluid.unavailable({message: `Template of SFC for ${layerName} is not yet loaded`,
                variety: "pending"}), {name: `template store for layer ${layerName}`});
        }
        return fluid.templateStore[layerName].get();
    };

    /**
     * Stores a parsed template in the template store for a given layer name.
     * @param {String} layerName - The name of the layer to associate with the template.
     * @param {VNode} template - The parsed template to store.
     */
    fluid.writeParsedTemplate = function (layerName, template) {
        const existing = fluid.templateStore[layerName];
        if (existing) {
            existing.set(template);
        } else {
            fluid.templateStore[layerName] = fluid.cell(template, {name: `template store for layer ${layerName}`});
        }
    };

    /**
     * Retrieve a layer by its name from the layer store.
     * If the layer does not exist, returns an "unavailable" marker with an appropriate message and path.
     *
     * @param {String} layerName - The name of the layer to retrieve.
     * @return {SFCRecord} Record for the SFC layer
     */
    fluid.readSFC = function (layerName) {
        const rec = fluid.sfcStore[layerName];
        if (rec) {
            return rec;
        } else {
            const unavailable = fluid.unavailable(`SFC for ${layerName} is not available`);
            return fluid.sfcStore[layerName] = {
                textSignal: fluid.cell(unavailable, {name: `text signal for layer ${layerName}`}),
                injRecsSignal: fluid.cell(unavailable, {name: `injections signal for layer ${layerName}`}),
                /** @type {Map<Document, Effect>} **/
                docInjectEffects: new Map()
            };
        }
    };

    /**
     * @typedef {SFCRecord} LoadingSFCRecord
     * @property {String} url - The URL from which the SFC is loading
     * @property {Signal<String>} fetchSignal - A signal containing the fetched SFC content from the URL.
     * @property {Effect} parseEffect - An effect that registers the SFC's definition when the text signal updates.
     * @property {Effect} fetchEffect - An effect that updates the text signal with the fetched content.
     */

    /**
     * Ensure that a Single File Component (SFC) is loaded from a given URL. If it is not already loading, the load
     * effect will be initialised
     *
     * @param {String} layerName - The name of the layer associated with the SFC.
     * @param {String} url - The URL from which to fetch the SFC content.
     * @return {LoadingSFCRecord} The record tracking the SFC's load effects
     */
    fluid.loadSFC = function (layerName, url) {
        fluid.log("loadSFC for ", layerName);
        const rec = fluid.readSFC(layerName);
        if (!rec.parseEffect) {
            rec.loadCompletion = fluid.cell(fluid.unavailable(`SFC for ${layerName} is loading`, "pending"),
                {name: `load completion for SFC for layer ${layerName}`});
            rec.url = url;
            fluid.sfcLayerNames.set([...fluid.sfcLayerNames._value, layerName]);
            // TODO: Currently starts fetch immediately but in future will be initiated by fluid.ensureImportsLoaded
            rec.fetchSignal = fluid.fetchText(url);
            rec.textSignal.computed(x => x, [rec.fetchSignal]);
            rec.parseEffect = fluid.parseSFC(rec, layerName);
        }
        return rec;
    };


    /**
     * @typedef {Object} SharedScriptClaim
     * @property {String} layerName - The layer whose SFC first claimed the script
     * @property {Promise} done - A promise which resolves once the claiming SFC's injections have been committed
     * @property {Function} resolve - Resolves `done`
     */

    /** @type {WeakMap<Document, Map<String, SharedScriptClaim>>} */
    fluid.sharedScriptClaims = new WeakMap();

    /**
     * Arrange that a script referred to by its `src` from several Single File Components, e.g. a library such as a
     * map widget, or a file of utilities and base layers shared by a family of SFCs, is executed only once in a
     * document. The first SFC whose injections reach the script claims it, and injects it. Any other SFC refers to the
     * script as resolved through `fluid.resolveSFCPath` and `fluid.module.resolvePath`, so a script referred to by
     * different relative paths is still recognised, and omits it - instead committing its own injections only once
     * those of the claiming SFC are committed, so that its scripts may rely on the shared one having executed.
     * @param {Document} dokkument - The document into which injections are being made
     * @param {String} layerName - The layer whose SFC's injections are being made
     * @param {DocInjectionRecord[]} docInjRecs - The injections to be made
     * @return {Object} Members `docInjRecs`, the injections which are to be made, `claimed`, the claims made by this
     * SFC, to be resolved once its injections are committed, and `awaited`, promises for those of other SFCs
     */
    fluid.claimSharedScripts = function (dokkument, layerName, docInjRecs) {
        let claims = fluid.sharedScriptClaims.get(dokkument);
        if (!claims) {
            claims = new Map();
            fluid.sharedScriptClaims.set(dokkument, claims);
        }
        const claimed = [], awaited = [];
        const togo = docInjRecs.filter(docInjRec => {
            const {injRec} = docInjRec;
            let keep = true;
            if (injRec.variety === "script" && injRec.url) {
                const key = fluid.module.resolvePath(injRec.url);
                let existing = claims.get(key);
                // A script already run from the document's markup, e.g. as written by a static build, has executed
                if (!existing && fluid.hostRunsMarkupScripts() && fluid.markupScriptFrom(dokkument, key)) {
                    existing = {layerName: null, done: Promise.resolve(), resolve: fluid.identity};
                    claims.set(key, existing);
                }
                if (existing && existing.layerName !== layerName) {
                    awaited.push(existing.done);
                    keep = false;
                } else if (!existing) {
                    let resolve;
                    const done = new Promise(resolveDone => resolve = resolveDone);
                    const claim = {layerName, done, resolve};
                    claims.set(key, claim);
                    claimed.push(claim);
                }
            }
            return keep;
        });
        return {docInjRecs: togo, claimed, awaited};
    };

    /**
     * Bind injections from the specified SFC layer to the supplied document.
     * @param {String} layerName - The name of the layer for which injections are to be bound
     * @param {Document} dokkument - The document object into which any injection directives will be injected
     * @return {Signal<Boolean>} - A signal which resolves to `true` when injections are resolved
     */
    fluid.subscribeDocToInjections = function (layerName, dokkument) {
        const rec = fluid.readSFC(layerName);
        // TODO: One day clear these out
        let docEffect = rec.docInjectEffects.get(dokkument);
        if (!docEffect) {
            /** @type {Object<String, InjectRecord>} **/
            let oldInjRecs = {};
            const injDone = fluid.cell(fluid.unavailable(`Injection in progress for layer ${layerName}`, "pending"), {name: `Injections for layer ${layerName}`});
            injDone.layerName = layerName;
            injDone.dokkument = dokkument;
            let adoptChecked = false;
            const newDocEffect = fluid.cell.effect(async function docInjectEffect(injRecs) {
                let claimed = [];
                if (!adoptChecked) {
                    adoptChecked = true;
                    oldInjRecs = fluid.adoptMarkupInjections(dokkument, injRecs);
                }
                try {
                    /** @type {DocInjectionRecord[]} */
                    const decoded = Object.values(injRecs).map(injRec =>
                        fluid.decodeInjectSFCElement(dokkument, injRec, rec.url, oldInjRecs,
                            fluid.injectionStylesForRecord(injRec, dokkument))
                    ).filter(injRec => injRec);
                    const shared = fluid.claimSharedScripts(dokkument, layerName, decoded);
                    claimed = shared.claimed;
                    // Load phase - acquire all material, executing nothing
                    const prepared = await Promise.all(shared.docInjRecs.map(fluid.prepareSFCElement));
                    // Any script shared with another SFC which claimed it first must have executed before ours do
                    await Promise.all(shared.awaited);
                    // Commit phase - one synchronous block, so no stabilisation can observe a partial set of definitions
                    // Stylesheet links return promises which settle once the sheet is applied
                    const outcomes = await Promise.all(prepared.map(fluid.doInjectSFCElement));

                    outcomes.filter(fluid.isUnavailable).forEach(outcome =>
                        fluid.log(fluid.logLevel.FAIL, `Injection failure for layer ${layerName}: `, outcome));
                } finally {
                    claimed.forEach(claim => claim.resolve());
                    injDone.set(true);
                }

                Object.keys(oldInjRecs).forEach(nodeId => {
                    const newRec = injRecs[nodeId];
                    if (!newRec) {
                        fluid.clearInjRec(dokkument, nodeId);
                    }
                });
                oldInjRecs = injRecs;
            }, [rec.injRecsSignal], {name: `docInjectEffect for layer ${layerName}`});
            newDocEffect.injDone = injDone;
            rec.docInjectEffects.set(dokkument, newDocEffect);
            fluid.noteLayerInjectionInProgress(injDone);
            docEffect = newDocEffect;
        }
        return docEffect.injDone;
    };

    /**
     * Withdraw the injections of a Single File Component from every document they were bound into, e.g. once its layer
     * has been deleted - its elements, such as its styles, are removed, and its injections forgotten, so that should
     * the layer be registered once more, e.g. on undoing its deletion, they are injected afresh even if its text is
     * unchanged, defining its layer again.
     * @param {String} layerName - The name of the layer defined by the SFC
     */
    fluid.withdrawLayerInjections = function (layerName) {
        const rec = fluid.sfcStore[layerName];
        if (rec) {
            const injRecs = rec.injRecsSignal._value;
            rec.docInjectEffects.forEach((docEffect, dokkument) => {
                docEffect.dispose();
                Object.keys(fluid.isUnavailable(injRecs) ? {} : injRecs || {}).forEach(nodeId => fluid.clearInjRec(dokkument, nodeId));
            });
            rec.docInjectEffects.clear();
        }
    };

    // Hooks through which output documents participate in rendering and injection. An output document is one which
    // views render into without executing any script in it, e.g. each page of a site rendered as one component tree.
    // Only the server creates them - see FluidView-node.js, which overrides these hooks - whereas the client observes
    // at most one document, its own, and so here they describe a document which is never an output document.

    /**
     * Determine whether a document is an output document. Overridden in FluidView-node.js
     * @param {Document} dokkument - The document
     * @return {Boolean} `true` if it is an output document
     */
    fluid.isOutputDocument = function (dokkument) { // eslint-disable-line no-unused-vars
        return false;
    };

    /**
     * Determine the location of a document, against which relative URLs within it resolve. Overridden in
     * FluidView-node.js for output documents, which may have no location of their own
     * @param {Document} dokkument - The document
     * @return {URL|Location} The document's location
     */
    fluid.documentLocation = function (dokkument) {
        return dokkument.location;
    };

    /**
     * Determine the injection styles with which the scripts of Single File Components are injected into a document.
     * Overridden in FluidView-node.js, so that scripts are recorded in output documents without being executed
     * @param {Document} dokkument - The document
     * @return {Object<String, InjectionStyle>} The injection styles, keyed by `literal` and `link`
     */
    fluid.scriptInjectionStylesFor = function (dokkument) { // eslint-disable-line no-unused-vars
        return fluid.scriptInjectionStyles;
    };

    /**
     * Record in the document into which a view renders the injections of the Single File Components of its layers,
     * should the document be one into which no injection has otherwise been made. Does nothing here, and is
     * overridden in FluidView-node.js for output documents
     * @param {ComponentComputer} view - The view of the component which is rendering
     * @param {Document} dokkument - The document into which it renders
     */
    fluid.subscribeOutputDocumentInjections = function (view, dokkument) { // eslint-disable-line no-unused-vars
    };

    /**
     * Retrieve the root element of a document, as the container of a view rendering the whole of it
     * @param {Document} dokkument - The document
     * @return {Element} Its root element
     */
    fluid.documentElementOf = function (dokkument) {
        return dokkument.documentElement;
    };

    /**
     * Resolve a location to the path of the page which it designates, so that locations naming the same page compare
     * equal - any query and fragment are dropped, and a final `index.html` is taken as naming its directory
     * @param {String} location - The location, which may be relative
     * @param {String} base - The URL against which a relative location is resolved
     * @return {String} The path of the page, e.g. "/post/x/"
     */
    fluid.pagePathOf = function (location, base) {
        return new URL(location, base).pathname.replace(/\/index\.html$/, "/");
    };

    /**
     * Resolve a location to the URL of the page which it designates, as by `fluid.pagePathOf`
     * @param {String} location - The location, which may be relative
     * @param {String} base - The URL against which a relative location is resolved
     * @return {String} The URL of the page, without query or fragment
     */
    fluid.pageUrlOf = function (location, base) {
        return new URL(location, base).origin + fluid.pagePathOf(location, base);
    };

    /**
     * Express a site's base URL as the URL of its root directory, whether or not it ends with a slash
     * @param {String} baseURL - The site's base URL, e.g. "https://example.org/blog"
     * @return {String} The URL of the site's root directory, e.g. "https://example.org/blog/"
     */
    fluid.siteDirectoryOf = function (baseURL) {
        return baseURL.replace(/\/?$/, "/");
    };

    /**
     * Resolve a location to the path of the page which it designates relative to the path of a site's root directory,
     * whatever the origin of either - so that a page is recognised wherever the site is served
     * @param {String} location - The location, which may be relative
     * @param {String} base - The URL against which a relative location is resolved
     * @param {String} siteRoot - The URL of the site's root directory, e.g. "https://example.org/blog/"
     * @return {String|undefined} The path of the page relative to the site's root, e.g. "post/x/", or `undefined` if the
     * page does not lie within it
     */
    fluid.sitePathOf = function (location, base, siteRoot) {
        const rootPath = new URL(siteRoot).pathname.replace(/\/?$/, "/");
        const pagePath = fluid.pagePathOf(location, base);
        return pagePath.startsWith(rootPath) ? pagePath.substring(rootPath.length) : undefined;
    };

    /**
     * Compute the relative URL of a site's root directory from a page of the site
     * @param {String} sitePath - The path of the page relative to the site's root, as by `fluid.sitePathOf`
     * @return {String} The relative URL of the site's root, e.g. "../../" from "post/x/", or "./" from the root itself
     */
    fluid.relativeSiteRoot = function (sitePath) {
        return "../".repeat((sitePath.match(/\//g) ?? []).length) || "./";
    };

    // The attribute recording on the root element of a page rendered as an output document of a site the relative URL
    // of the site's root - by which the page, once live on the client, recognises its own location wherever the site
    // is served - see fluid.hostDocumentElement in FluidView-browser.js
    fluid.siteRootAttribute = "fluid-site-root";

    // TODO: need equivalent for server-style injections where there is no document - this would use "require" or "import".
    // Also: In future this will be the point that fluid.layerLoaders is actually triggered
    /**
     * Ensures that the specified layers are loaded and their imports are bound to the document.
     * @param {Shadow} shadow - The shadow object representing the component context.
     * @param {String} layerName - A layer name to check and load imports for.
     * @return {Signal<true>} A signal which resolves when imports are done
     */
    fluid.ensureImportsLoaded = function (shadow, layerName) {
        // A layer cannot be defined by injecting its SFC into an output document, in which nothing executes
        const found = fluid.findDocument(shadow);
        const dokkument = found && !fluid.isOutputDocument(found) ? found : fluid.defaultDocument;
        const importRec = fluid.importMap[layerName];
        if (importRec && dokkument === undefined) {
            // A component with no document, e.g. an avatar or a free component with no container on the server, cannot
            // inject the layer's SFC - its layer remains unavailable until the SFC is injected into a document for
            // another component
            return fluid.cell(fluid.unavailable(`No document into which imports for ${layerName} can be injected`, "pending"),
                {name: `Imports awaited for ${layerName}`});
        } else if (importRec) {
            // TODO: We could use the return value of this to stick in the layer store, so that we could report whether
            // a layer was pending and what it was waiting for - we could use fluid.writeLayer for this, and fix it
            // so that it didn't update history for unvailable transitions
            const injDone = fluid.subscribeDocToInjections(layerName, dokkument);
            if (fluid.isUnavailable(injDone.get())) {
                fluid.writeLayer(layerName, injDone);
            }
            return injDone;
        } else {
            return fluid.cell(true, {name: `Imports loaded for ${layerName}`});
        }
        // TODO: Return currently ignored - we react to injections through effects on layer store
    };

    /**
     * Inserts a new element into the DOM based on the provided template, ensuring no duplicate
     * element with the same `data-fl-key` exists within the parent node. If a duplicate is found,
     * the existing element is returned instead of inserting a new one. It's assumed that reconciliation of the
     * remainder of the template will be done later via fluid.patchChildren or similar.
     *
     * The function supports four strategies for insertion:
     * - `first`: Inserts the new element as the first child of the parent node.
     * - `last`: Appends the new element as the last child of the parent node.
     * - `before`: Inserts the new element before the reference node.
     * - `after`: Inserts the new element after the reference node.
     *
     * @param {String} strategy - The insertion strategy, either "first", "last", "before", or "after".
     * @param {String} key - A unique key to identify the element. If a child with the same key exists, it will be reused.
     * @param {VNode} templateTree - A template string of HTML from which the root tag will be extracted.
     * @param {Element} parentNode - The parent DOM node in which to insert the new node.
     * @param {Element} [referenceNode] - The node relative to which the new node will be inserted (used with "before" and "after").
     * @return {Element} The newly created or existing DOM element.
     */
    fluid.insertChildContainer = function (strategy, key, templateTree, parentNode, referenceNode) {
        const tagName = templateTree.children[0].tag;

        if (!tagName) {
            return fluid.unavailable({cause: `Invalid template: Unable to determine tag name from ${templateTree.children[0]}`});
        }

        if (key) {
            const child = [...parentNode.children].find(child => child.getAttribute("data-fl-transient-key") === key);
            if (child) {
                return child;
            }
        }
        const dokkument = parentNode.ownerDocument;
        const newNode = dokkument.createElement(tagName);
        if (strategy === "first") {
            parentNode.insertBefore(newNode, parentNode.firstChild);
        } else if (strategy === "last") {
            parentNode.appendChild(newNode);
        } else if (strategy === "before") {
            parentNode.insertBefore(newNode, referenceNode);
        } else if (strategy === "after") {
            parentNode.insertBefore(newNode, referenceNode.nextSibling);
        }
        newNode.setAttribute("data-fl-transient-key", key);
        return newNode;
    };

    /**
     * A registry that maps container elements to their associated component instances.
     * This is used to track which component is responsible for rendering a specific container.
     *
     * @type {WeakMap<Element, Shadow>}
     */
    fluid.viewContainerRegistry = new WeakMap();

    fluid.noteViewContainerRegistry = function (element, shadow) {
        const existing = fluid.viewContainerRegistry.get(element);
        if (!existing || existing.path.length < shadow.path.length) {
            fluid.viewContainerRegistry.set(element, shadow);
        }
    };

    fluid.shadowForElement = element => {
        const shadow = fluid.viewContainerRegistry.get(element);
        return shadow && !/^fullPageEditor-\d+\.inspectOverlay$/.test(shadow.path) ? shadow : null;
    };

    fluid.shadowForElementParent = element => {
        while (element) {
            const shadow = fluid.shadowForElement(element);
            if (shadow) {
                return {shadow, container: element};
            }
            element = element.parentElement;
        }
    };

    fluid.unavailableElement = fluid.unavailable("DOM element not available", "config");

    fluid.allocateVNodeEffect = function (vnode, effectMaker) {
        vnode.elementSignal ||= fluid.cell(fluid.unavailableElement, {name: `Element signal for vnode ${vnode._id}`});
        const renderEffect = effectMaker(vnode);

        fluid.pushArray(vnode, "renderEffects", renderEffect);
        return renderEffect;
    };

    /**
     * @callback DomApplyFunction
     * @param {HTMLElement} element - The DOM element to which the function applies changes.
     * @param {String|Number|Boolean} value - The rendered content to be applied.
     */

    /**
     * Binds a rendered signal or static value to a virtual DOM node and applies a function when the DOM element is available.
     *
     * @param {Effect[]} templateEffects - An array of effects to contribute any allocated effects to
     * @param {VNode} vnode - The virtual DOM node to bind to.
     * @param {Signal|String|Number|Boolean} rendered - A signal or static value representing the rendered content.
     * @param {DomApplyFunction} applyFunc - A function that applies the rendered content to the actual DOM element.
     */
    fluid.bindDomTokens = function (templateEffects, vnode, rendered, applyFunc) {
        if (fluid.isSignal(rendered)) {
            const bindEffect = fluid.allocateVNodeEffect(vnode, vnode => {
                const togo = fluid.cell.effect( function (element, text) {
                    if (!fluid.isUnavailable(element)) {
                        if (fluid.isUnavailable(text)) {
                            fluid.reportRenderError({shadow: vnode.shadow, container: element, unavailable: text});
                        } else {
                            applyFunc(element, text);
                        }
                    }
                }, [vnode.elementSignal, rendered], {isFree: true, name: "bindDomTokens"});
                togo.$variety = "bindDomTokens";
                togo.$vnode = vnode;
                return togo;
            });
            templateEffects.push(bindEffect);
        }
    };

    /**
     * Bind the classes interpolated into the class attribute of a template node, contributing them as one of the
     * writers of its element's classes - see `fluid.applyClassTokens`. As for any attribute binding, whilst the value is
     * unavailable, e.g. pending I/O, it contributes no classes, rather than rendering an error in place of the element.
     * @param {Effect[]} templateEffects - The effects of the template, to which the binding effect is added
     * @param {VNode} vnode - The template node
     * @param {Cell<String>} rendered - The rendered value of the class attribute
     */
    fluid.bindDomClassTokens = function (templateEffects, vnode, rendered) {
        const bindEffect = fluid.allocateVNodeEffect(vnode, vnode => {
            const togo = fluid.cell.effect(function (element, text) {
                if (!fluid.isUnavailable(element)) {
                    fluid.applyClassTokens(element, fluid.classWriterOf(vnode), fluid.isUnavailable(text) ? null : text);
                }
            }, [vnode.elementSignal, rendered], {isFree: true, name: "bindDomClassTokens"});
            togo.$variety = "bindDomTokens";
            togo.$vnode = vnode;
            return togo;
        });
        templateEffects.push(bindEffect);
    };

    let domId = 1;

    fluid.allocateDomId = function (el) {
        el.flDomId = el.flDomId || domId++;
    };

    /**
     * Bind the root VNode of a component's rendered tree to its container, registering the container against the
     * component in `fluid.viewContainerRegistry` and exposing it as the `renderedContainer` member of its view.
     * @param {Effect[]} templateEffects - An array of effects to contribute any allocated effects to
     * @param {VNode} vnode - The root VNode of the component's rendered tree
     * @param {ComponentComputer} self - The component whose view is rendered
     * @param {ComponentComputer} view - The view subcomponent of `self`
     */
    fluid.bindContainer = function (templateEffects, vnode, self, view) {
        const shadow = self[$m];
        const bindEffect = fluid.allocateVNodeEffect(vnode, vnode => {
            const togo = fluid.cell.effect(function (element) {
                fluid.noteViewContainerRegistry(element, shadow);
            }, [vnode.elementSignal], {name: "fluid.bindContainer effect"});
            togo.$variety = "bindContainer";
            togo.$vnode = vnode;
            return togo;
        });
        templateEffects.push(bindEffect);
        const renderedContainer = view[$m].that.renderedContainer;
        renderedContainer.computed(x => x, [vnode.elementSignal]);
    };

    fluid.removeDomListeners = function (vTreeRec) {
        vTreeRec.forEach(({el, event, rawHandler, modifiers, vnodeId}) => {
            el.removeEventListener(event, rawHandler, modifiers);
            // console.log(`Removed handler to ${event} for vnode ${vnodeId} for DOM element ${el.flDomId} `, el);
            if (vnodeId && el.flEventsBound) {
                delete el.flEventsBound[vnodeId];
            }
        });
    };

    fluid.allocateEventBindingEffect = function (templateEffects, vnode) {
        const bindEffect = fluid.allocateVNodeEffect(vnode, vnode => {
            const vTreeRec = [];
            const togo = fluid.cell.effect(function (element) {
                fluid.allocateDomId(element);
                // console.log("Event binding effect activating for vnode " + vnode._id + " element ", element.flDomId, " on ", vnode.on);
                // The effect runs afresh whenever the vnode's element is notified - remove any listeners bound by an
                // earlier run, to an earlier element or this one, so that a handler is never bound more than once
                fluid.removeDomListeners(vTreeRec);
                vTreeRec.length = 0;
                fluid.applyOns(vnode, vnode.shadow, element, vnode.on, vTreeRec);
            }, [vnode.elementSignal], {
                onDispose: () => {
                    fluid.removeDomListeners(vTreeRec);
                },
                name: `eventBindingEffect for vnode ${vnode._id}`
            });
            togo.$variety = "bindEvents";
            togo.$vnode = vnode;
            togo.vTreeRec = vTreeRec;
            fluid.log("Allocated event binding effect for vnode id " + vnode._id + " cell id " + togo.cellId + " with on ", vnode.on);
            return togo;
        });
        templateEffects.push(bindEffect);
    };

    /**
     * Attributes whose presence alone denotes `true`, so that a false value must be expressed by their removal.
     * @type {Set<String>}
     */
    fluid.booleanAttrs = new Set(["disabled", "checked", "selected", "readonly", "required", "hidden", "multiple",
        "open", "inert", "autofocus", "novalidate", "indeterminate", "defer", "async", "nomodule", "itemscope", "autoplay",
        "loop", "muted", "playsinline", "controls", "allowfullscreen", "reversed"]);

    /**
     * @typedef {Object} LiveStateRecord
     * @property {String} prop - The DOM property holding the live state corresponding to the attribute
     * @property {String} event - The DOM event signalling that the user has changed the live state
     */

    /**
     * Attributes whose live state is held in a DOM property which may diverge from the attribute, either because the
     * attribute only represents a default (`value`, `checked`, `selected`), because the user may change it (`open`),
     * or because the attribute is unknown to HTML and is materialised only for serialisation (`indeterminate`).
     * A bound attribute in this table writes both the attribute and the property, and listens to the named event in
     * order to write the user's change back to the bound model value.
     * @type {Object<String, LiveStateRecord>}
     */
    fluid.liveStateAttrs = {
        value: {prop: "value", event: "input"},
        checked: {prop: "checked", event: "change"},
        selected: {prop: "selected", event: "change"},
        open: {prop: "open", event: "toggle"},
        indeterminate: {prop: "indeterminate", event: "change"}
    };

    /**
     * Determine whether a value bound to an attribute should cause the attribute to be absent. Boolean `false` denotes
     * absence except for `aria-` attributes, for which "true" and "false" are meaningful tokens.
     * @param {String} key - The attribute name
     * @param {any} value - The bound value
     * @return {Boolean} `true` if the attribute should be removed
     */
    fluid.isAbsentAttrValue = function (key, value) {
        const isFalse = value === false && !key.startsWith("aria-");
        return isFalse || value === null || value === undefined || fluid.isUnavailable(value);
    };

    /**
     * Coerce a value arriving from a template binding for an attribute - the String "false" bound to a boolean
     * attribute is taken to mean `false`, since nobody binding it means it to denote presence.
     * @param {String} key - The attribute name
     * @param {any} value - The bound value
     * @return {any} The coerced value
     */
    fluid.coerceBoundAttrValue = function (key, value) {
        return fluid.booleanAttrs.has(key) && value === "false" ? false : value;
    };

    /**
     * Materialise the serialisable form of an attribute value onto a DOM element. This is normally the attribute
     * itself, but the value of a `textarea` is materialised as its text content, and the value of a `select` as
     * `selected` attributes on its options.
     * @param {Element} element - The element to be updated
     * @param {String} key - The attribute name
     * @param {any} value - The value to be materialised
     */
    fluid.materialiseAttr = function (element, key, value) {
        const absent = fluid.isAbsentAttrValue(key, value);
        const tag = element.localName;
        if (key === "value" && tag === "textarea") {
            const text = absent ? "" : String(value);
            if (element.textContent !== text) {
                element.textContent = text;
            }
        } else if (key === "value" && tag === "select") {
            const text = absent ? null : String(value);
            [...element.options].forEach(option => fluid.applyAttr(option, "selected", option.value === text));
        } else if (absent) {
            if (element.hasAttribute(key)) {
                element.removeAttribute(key);
            }
        } else {
            const attrValue = fluid.booleanAttrs.has(key) ? "" : String(value);
            if (element.getAttribute(key) !== attrValue) {
                element.setAttribute(key, attrValue);
            }
        }
    };

    /**
     * Apply a value to a DOM element under a single attribute name, materialising it as an attribute so that the
     * element serialises faithfully, and also writing any live state property so that the element's visible state agrees.
     * @param {Element} element - The element to be updated
     * @param {String} key - The attribute name as written in the template
     * @param {any} value - The value to be applied
     */
    fluid.applyAttr = function (element, key, value) {
        fluid.materialiseAttr(element, key, value);
        const live = fluid.liveStateAttrs[key];
        // The live state of a select is held by its options, which have been written by fluid.materialiseAttr
        if (live && live.prop in element && element.localName !== "select") {
            const absent = fluid.isAbsentAttrValue(key, value);
            const propValue = fluid.booleanAttrs.has(key) ? !absent : (absent ? "" : String(value));
            // Guard against redundant writes, which would reset the caret in a focused input
            if (element[live.prop] !== propValue) {
                element[live.prop] = propValue;
            }
        }
    };

    /**
     * Resolve the site to which a write at a site is directed, in the same way as a write through the component proxy.
     * A write beneath a member sourced from another site, e.g. `range.checked` beneath a `$for` iteration variable
     * `range`, is directed upstream to that site, i.e. into the original element of the source. A write to the sourced
     * member itself is not redirected, since it rebinds the member locally.
     * @param {Site} site - The site being written
     * @return {Site} The site to which the write is directed
     */
    fluid.lensedWriteSite = function (site) {
        let togo = site;
        // Try the shortest prefix first, since the proxy hands off to the first sourced member it traverses
        for (let i = 1; i < site.segs.length && togo === site; ++i) {
            const prefix = site.segs.slice(0, i);
            const upstream = fluid.upstreamSite(site.shadow, prefix);
            if (upstream.shadow !== site.shadow || !fluid.arrayEqual(upstream.segs, prefix)) {
                // The upstream site may itself lie beneath a sourced member of its own component
                togo = fluid.lensedWriteSite({shadow: upstream.shadow, segs: [...upstream.segs, ...site.segs.slice(i)]});
            }
        }
        return togo;
    };

    /**
     * Resolve the model site to which a template reference bound to an attribute could write back a user's change.
     * A write beneath a member sourced from another site is directed upstream, as for a write through the component
     * proxy - see `fluid.lensedWriteSite`. A site holding a signal product such as `$compute` is not writeable - although
     * a linked member of a reactive root is, since its link only writes into it.
     * @param {Signal} token - The live reference bound to the attribute, as resolved by `fluid.fetchContextReference`
     * @return {Site|null} The writeable site, or `null` if there is none
     */
    fluid.writeableAttrSite = function (token) {
        const sited = fluid.deSignalToSite(token);
        const site = fluid.isSignal(sited) && sited.$variety === "$sitedRef" ? fluid.lensedWriteSite(sited.site) : null;
        const rec = site && fluid.get(site.shadow.shadowMap, [...site.segs, $m]);
        const isProduct = rec?.signalRecord && rec.handlerRecord !== fluid.reactiveLinkExpanderRecord;
        return site && !isProduct ? site : null;
    };

    /**
     * Respond to a user's change to the live state of an element bound to an attribute. If the attribute is bound to
     * a single writeable reference, the change is written back to it, and the attribute will be updated by its binding.
     * Otherwise the attribute is rematerialised from the live state so that the element continues to serialise faithfully.
     * @param {Element} element - The element whose live state has changed
     * @param {String} key - The attribute name
     * @param {Signal|null} token - The single live reference bound to the attribute, if there is one
     */
    fluid.liveStateChanged = function (element, key, token) {
        const live = fluid.liveStateAttrs[key];
        const propValue = element[live.prop];
        const value = fluid.booleanAttrs.has(key) ? Boolean(propValue) : propValue;
        const site = token ? fluid.writeableAttrSite(token) : null;
        if (site) {
            fluid.setForComponent(site.shadow.that, site.segs, value);
        } else {
            fluid.materialiseAttr(element, key, value);
        }
    };

    /**
     * Return the sources carried by changes made by the user through the view of a component, e.g. by handlers bound in
     * its template to DOM events or the live state of its elements - `"dom"`, marking all of the user's activity, and
     * the source of changes originated by the component itself, matched by an effect excluding `"self"` - see
     * fluid.selfSource
     * @param {Shadow} shadow - The shadow of the component whose view received the user's activity
     * @return {any[]} The sources
     */
    fluid.domSources = function (shadow) {
        return ["dom", shadow];
    };

    /**
     * Allocate an effect which listens for a user's changes to the live state of an element bound to an attribute
     * named in `fluid.liveStateAttrs`, removing the listener when the template's effects are disposed.
     * @param {Effect[]} templateEffects - An array of effects to contribute the allocated effect to
     * @param {VNode} vnode - The virtual DOM node holding the attribute
     * @param {String} key - The attribute name
     * @param {Signal|null} token - The single live reference bound to the attribute, if there is one
     */
    fluid.allocateLiveStateEffect = function (templateEffects, vnode, key, token) {
        const event = fluid.liveStateAttrs[key].event;
        const bindEffect = fluid.allocateVNodeEffect(vnode, vnode => {
            let bound = null;
            const unbind = function () {
                if (bound) {
                    bound.element.removeEventListener(event, bound.listener);
                    bound = null;
                }
            };
            const togo = fluid.cell.effect(function (element) {
                unbind();
                const listener = fluid.cell.withAmbientSource(fluid.domSources(vnode.shadow), () => fluid.liveStateChanged(element, key, token));
                element.addEventListener(event, listener);
                bound = {element, listener};
            }, [vnode.elementSignal], {
                onDispose: unbind,
                name: `liveStateEffect for attribute ${key} of vnode ${vnode._id}`
            });
            togo.$variety = "bindLiveState";
            togo.$vnode = vnode;
            return togo;
        });
        templateEffects.push(bindEffect);
    };

    /**
     * Bind a rendered attribute value to the DOM element corresponding to a virtual node. An unavailable value causes
     * the attribute to be absent. If the attribute is named in `fluid.liveStateAttrs`, its live state property is also
     * bound, and user changes to it are written back to the model.
     * @param {Effect[]} templateEffects - An array of effects to contribute any allocated effects to
     * @param {VNode} vnode - The virtual DOM node holding the attribute
     * @param {String} key - The attribute name
     * @param {Signal<any>} bound - A signal for the value to be applied to the attribute
     * @param {Signal|null} token - The single live reference bound to the attribute, if there is one
     */
    fluid.bindDomAttr = function (templateEffects, vnode, key, bound, token) {
        const bindEffect = fluid.allocateVNodeEffect(vnode, vnode => {
            const togo = fluid.cell.effect(function (element, value) {
                if (!fluid.isUnavailable(element)) {
                    fluid.applyAttr(element, key, fluid.coerceBoundAttrValue(key, value));
                }
            }, [vnode.elementSignal, bound], {isFree: true, name: `bindDomAttr for attribute ${key}`});
            togo.$variety = "bindDomAttr";
            togo.$vnode = vnode;
            return togo;
        });
        templateEffects.push(bindEffect);
        if (fluid.liveStateAttrs[key]) {
            fluid.allocateLiveStateEffect(templateEffects, vnode, key, token);
        }
    };

    /**
     * Return a function that conditionally negates its input based on the given flag.
     * @param {Boolean} negate - If `true`, returns a function that negates its input; otherwise, returns fluid.identity
     * @return {Function} A function that optionally negates its input.
     */
    fluid.liftNegate = negate => negate ? x => !x : fluid.identity;

    /**
     * Apply a transformation function to the value of a `Signal`, producing a new computed `Signal`. If the function is
     * `fluid.identity` the original signal is returned.
     * @param {Signal<any>} sig - The input signal to transform.
     * @param {Function} func - The transformation function to apply to the signal's value.
     * @return {Signal<any>} A computed signal reflecting the transformed value.
     */
    fluid.mapSignal = (sig, func) => func === fluid.identity ? sig : fluid.cell(undefined, {name: "fluid.mapSignal"})
        .computed( value => {
            return func(value);
        }, [sig], {mapArg: fluid.deproxyAndDesignal});

    /**
     * Resolve a function call interpolated into a template, e.g. `@{fluid.tests.urlize({self}.tag)}`, into a signal
     * for its result. As for a `$compute` record, the function is invoked afresh whenever any of its arguments changes.
     * @param {AtTemplateToken} token - The parsed token holding the call
     * @param {Shadow} shadow - The shadow of the component against which the call's references are resolved
     * @return {Signal<any>} A signal for the result of the call
     */
    fluid.expandTemplateCall = function (token, shadow) {
        const {func, resolvedArgs} = fluid.resolveFuncRecord(token.call, shadow, ["$template"]);
        const name = `template call ${token.raw} at path ${shadow.path}`;
        const togo = fluid.cell(undefined, {name}).computed(fluid.makeFuncDispatcher(func),
            fluid.flattenedArgCells(resolvedArgs, name));
        togo.$variety = "$compute";
        return togo;
    };

    /**
     * Resolve a token interpolated into a template into a signal for its value
     * @param {AtTemplateToken} token - The parsed token - a reference or a function call
     * @param {Shadow} shadow - The shadow of the component against which the token is resolved
     * @return {Signal<any>} A signal for the token's value
     */
    fluid.templateTokenSignal = function (token, shadow) {
        return token.call ? fluid.expandTemplateCall(token, shadow) : fluid.fetchContextReference(token.parsed, shadow);
    };

    /**
     * Renders a parsed string template against the local component tree by replacing tokens with their corresponding values.
     * Tokens that are primitives remain unchanged, while signal tokens are resolved and then the resulting token
     * string concatenated.
     *
     * @param {Array<string|ParsedContext>} tokens - An array of tokens, where each token is either a string
     *        or an object with a `key` property indicating a path in the source.
     * @param {Shadow} shadow - The shadow record of the component where the reference is held
     * @return {String|Signal<string>} A computed signal representing the resolved string.
     */
    fluid.renderComputedStringTemplate = function (tokens, shadow) {
        if (tokens.length === 0) {
            return "";
        } else if (tokens.length === 1 && typeof(tokens[0]) === "string") {
            return tokens[0];
        } else {
            const liveTokens = tokens.map(token => fluid.isPrimitive(token) ? token : fluid.templateTokenSignal(token, shadow));
            const togo = fluid.cell(undefined, {name: "renderComputedStringTemplate"}).computed(function (...tokens) {
                return tokens.join("");
            }, liveTokens, {mapArg: fluid.deSignal});
            togo.$tokens = liveTokens;
            return togo;
        }
    };

    /**
     * Processes an attribute directive found on a virtual node.
     *
     * @param {VNode} vnode - The virtual node to which the attribute belongs.
     * @param {String} value - The attribute value, holding a directive through beginning with "v-"
     * @param {String} key - The name of the attribute.
     * @param {Shadow} shadow - The shadow for the component in whose context the attribute is processed.
     * @param {Effect[]} templateEffects - An array of effects to contribute any allocated effects to
     */
    fluid.processVNodeAttribute = function (vnode, value, key, shadow, templateEffects) {
        const firstChar = key.charCodeAt(0);
        if (firstChar === 64) { // @
            if (key.startsWith("@on")) {
                // A single effect binds all of the vnode's handlers, and so is allocated only for its first
                if (!vnode.on) {
                    fluid.allocateEventBindingEffect(templateEffects, vnode);
                }
                fluid.pushArray(vnode, "on", {onKey: key.slice(3).toLowerCase(), onValue: value});
            } else if (key === "@class") {
                const parts = value.split(",").map(part => part.trim());
                const clazz = Object.fromEntries(parts.map(part => {
                    const [key, ref] = part.split(":");
                    if (ref === undefined) {
                        // TODO: Figure out how to route template syntax errors back to template source
                        fluid.fail(`Malformed @class entry "${part}" in value "${value}" - expected className:@{reference}`);
                    }
                    const negate = ref.startsWith("!");
                    const effRef = negate ? ref.substring(1) : ref;
                    const tokens = fluid.parseAtStringTemplate(effRef);
                    const rendered = fluid.renderComputedStringTemplate(tokens, shadow);
                    const negMap = fluid.liftNegate(negate);
                    // Unwrap the primitive token so it is more principled to check for falsy during compositeTemplate
                    const renderedPrim = fluid.isSignal(rendered) ? fluid.mapSignal(rendered.$tokens[0], negMap) : negMap(rendered);
                    return [key, renderedPrim];
                }));
                vnode["class"] = clazz;
            }
            delete vnode.attrs[key];
        } else {
            const tokens = fluid.parseAtStringTemplate(value);
            const rendered = fluid.renderComputedStringTemplate(tokens, shadow);
            // A class attribute alongside @class is rendered together with it, by the allClass computer allocated in
            // fluid.activateTemplate
            const withClassDirective = key === "class" && (vnode["class"] !== undefined || "@class" in vnode.attrs);
            if (fluid.isSignal(rendered) && withClassDirective) {
                rendered.$source = value;
                vnode.attrs[key] = rendered;
            } else if (fluid.isSignal(rendered) && key === "class") {
                // An interpolated class contributes its classes as one of the writers of the element's classes, as does
                // @class - see fluid.applyClassTokens
                rendered.$source = value;
                fluid.bindDomClassTokens(templateEffects, vnode, rendered);
                vnode.attrs[key] = rendered;
            } else if (fluid.isSignal(rendered)) {
                rendered.$source = value;
                // A template consisting of a single reference binds its raw value so that booleans survive
                const token = tokens.length === 1 ? rendered.$tokens[0] : null;
                const bound = token ? fluid.cell(undefined, {name: `raw attribute value for ${key} of vnode ${vnode._id}`})
                    .computed(fluid.identity, [token], {mapArg: fluid.deproxyAndDesignal}) : rendered;
                fluid.bindDomAttr(templateEffects, vnode, key, bound, token);
                vnode.boundAttrs ||= {};
                vnode.boundAttrs[key] = bound;
                vnode.attrs[key] = rendered; // Mark to reconciler that it is a signal so it should ignore it
                if (key === "value" && vnode.tag === "textarea") {
                    // The textarea's value is materialised as its content, which the reconciler must leave alone
                    delete vnode.children;
                }
            } else {
                // A literal value, which may differ from the template's if it held an escaped "@@{"
                vnode.attrs[key] = rendered;
            }
        }
    };

    // Simple utility to allow us to layer live signals on top of signal sources in a VTree
    fluid.getSignalSource = function (ref) {
        return fluid.isSignal(ref) ? ref.$source : ref;
    };

    fluid.editorRootRef = null;

    fluid.effVTree = function (vTree, elideParent) {
        return elideParent ? (vTree.children[0] || vTree) : vTree;
    };

    /**
     * Determine whether a node of a template matches the predicates of one compound of a selector parsed with
     * `fluid.templateCSSMatcher`
     * @param {VNode} vnode - The node to be tested
     * @param {Object[]} predList - The predicates of the compound, each holding one of `tag`, `clazz`, `id` or `member`
     * @return {Boolean} `true` if the node matches every predicate
     */
    fluid.matchVNodePredicates = function (vnode, predList) {
        const attrs = vnode.attrs || {};
        return vnode.tag !== undefined && predList.every(pred =>
            pred.tag !== undefined ? vnode.tag === pred.tag :
                pred.clazz !== undefined ? (attrs["class"] || "").split(/\s+/).includes(pred.clazz) :
                    pred.id !== undefined ? attrs.id === pred.id :
                        pred.member !== undefined ? attrs["@id"] === pred.member : true);
    };

    /**
     * Determine whether a node of a template matches a selector parsed with `fluid.templateCSSMatcher`, whose compounds
     * other than the last are matched against the node's ancestors as for CSS descendant and child combinators. The
     * tree's nodes must have their `parentNode` members assigned.
     * @param {VNode} vnode - The node to be tested
     * @param {ParsedSelector[]} parsed - The parsed selector
     * @param {Number} [index] - The index of the compound to be matched against `vnode`, by default the last
     * @return {Boolean} `true` if the node matches the selector
     */
    fluid.matchVNodeSelector = function (vnode, parsed, index = parsed.length - 1) {
        let togo = false;
        if (fluid.matchVNodePredicates(vnode, parsed[index].predList)) {
            if (index === 0) {
                togo = true;
            } else if (parsed[index - 1].child) {
                togo = !!vnode.parentNode && fluid.matchVNodeSelector(vnode.parentNode, parsed, index - 1);
            } else {
                for (let ancestor = vnode.parentNode; ancestor && !togo; ancestor = ancestor.parentNode) {
                    togo = fluid.matchVNodeSelector(ancestor, parsed, index - 1);
                }
            }
        }
        return togo;
    };

    /**
     * Find all nodes of a template tree matching a selector, which may designate a node by tag, `.class`, `#id` or, as
     * `@member`, by the member name it bears as `@id`, and combine these with descendant and child (`>`) combinators
     * @param {VNode} tree - The root of the tree, whose nodes have their `parentNode` members assigned
     * @param {String} selector - The selector, e.g. `.ponder-title`, `@postMeta` or `header h1.title`
     * @return {VNode[]} The matching nodes, in document order
     */
    fluid.queryVTree = function (tree, selector) {
        const parsed = fluid.parseSelector(selector, fluid.templateCSSMatcher);
        const results = [];
        const visit = function (vnode) {
            if (fluid.matchVNodeSelector(vnode, parsed)) {
                results.push(vnode);
            }
            if (vnode.children) {
                vnode.children.forEach(visit);
            }
        };
        visit(tree);
        return results;
    };

    // The dispositions in which a partial template's nodes may be composited relative to the node matching its selector
    fluid.partialDispositions = ["before", "after", "first", "last", "replace", "remove"];

    /**
     * @typedef {Object} PartialContribution
     * @property {String} layerName - The layer contributing the partial template
     * @property {String} relativeContainer - Its default cutpoint, of the form `disposition: selector`
     * @property {VNode|Unavailable|null} template - Its parsed template, a tree whose top-level nodes are composited, or
     * `null` if it has none, as for a contribution which only removes a node
     */

    /**
     * Collect the partial templates contributed by the layers of a component, in order of the precedence of those
     * layers, weakest first. A layer contributes a partial template if the view record in its own definition, i.e.
     * `view.$component`, holds `relativeContainer` - its template is then either that of its Single File Component, or
     * the markup held as `partialTemplate` in that record. The cutpoint of any layer's partial may be overridden by any
     * other layer through the view's merged member `partialTemplateLayers`, as
     * `partialTemplateLayers: {"layer.name": {relativeContainer: "after: .cutpoint"}}`.
     * @param {ComponentComputer} self - The component whose layers are inspected
     * @param {ComponentComputer} view - Its view, a `fluid.partialViewComponent`
     * @return {PartialContribution[]} The partial templates contributed by the component's layers
     */
    fluid.partialContributions = function (self, view) {
        const overrides = view.partialTemplateLayers || {};
        const contributions = self.$layers.map(layerName => {
            const layerRec = fluid.readLayer(layerName).get();
            const def = fluid.layerRecToUnavailable(layerRec) === null ? fluid.deSignal(layerRec.raw) : {};
            const ownView = def.view?.$component || {};
            const relativeContainer = overrides[layerName]?.relativeContainer ?? ownView.relativeContainer;
            const sfcTemplate = fluid.templateStore[layerName];
            const template = typeof(ownView.partialTemplate) === "string" ? fluid.parseTemplateMarkup(ownView.partialTemplate) :
                sfcTemplate && ownView.relativeContainer !== undefined ? sfcTemplate.get() : null;
            const isPartial = ownView.relativeContainer !== undefined || overrides[layerName] !== undefined;
            return isPartial ? {layerName, relativeContainer, template} : null;
        });
        return contributions.filter(contribution => contribution);
    };

    /**
     * Parse a cutpoint of the form `disposition: selector`
     * @param {String} relativeContainer - The cutpoint
     * @param {String} layerName - The layer contributing the partial, for error reporting
     * @return {Object|Unavailable} A record holding `disposition` and `selector`, or an unavailable value if the cutpoint
     * is malformed
     */
    fluid.parseCutpoint = function (relativeContainer, layerName) {
        const colPos = typeof(relativeContainer) === "string" ? relativeContainer.indexOf(":") : -1;
        const disposition = colPos === -1 ? null : relativeContainer.substring(0, colPos).trim();
        let togo;
        if (colPos === -1) {
            togo = fluid.unavailable(`Error in partial template for ${layerName}: cutpoint ${JSON.stringify(relativeContainer)} is not `
                + "of the form \"disposition: selector\"");
        } else if (!fluid.partialDispositions.includes(disposition)) {
            togo = fluid.unavailable(`Error in partial template for ${layerName}: Unrecognised disposition ${disposition} which should be `
                + "one of " + fluid.partialDispositions.join(", "));
        } else {
            togo = {disposition, selector: relativeContainer.substring(colPos + 1).trim()};
        }
        return togo;
    };

    /**
     * Composite one group of nodes of a partial template at a cutpoint within a template tree
     * @param {VNode} compositedTree - The tree being composited, whose nodes have their `parentNode` members assigned
     * @param {VNode[]} nodes - The nodes to be composited, as a group
     * @param {String} relativeContainer - The cutpoint, of the form `disposition: selector`
     * @param {String} layerName - The layer contributing the nodes, for error reporting
     * @param {Map<VNode, Object>} cursors - For each node which has received nodes after it or at its start, how many
     * it has received, so that later groups follow earlier ones in document order
     * @return {VNode|Unavailable} The composited tree, or an unavailable value describing why it could not be composited
     */
    fluid.compositeAtCutpoint = function (compositedTree, nodes, relativeContainer, layerName, cursors) {
        const cutpoint = fluid.parseCutpoint(relativeContainer, layerName);
        const matches = fluid.isUnavailable(cutpoint) ? [] : fluid.queryVTree(compositedTree, cutpoint.selector);
        let togo = compositedTree;
        if (fluid.isUnavailable(cutpoint)) {
            togo = cutpoint;
        } else if (matches.length !== 1) {
            togo = fluid.unavailable(`Error in partial template for ${layerName}: No exact match (${matches.length}) for selector ${cutpoint.selector}`);
        } else {
            const target = matches[0];
            const parentNode = target.parentNode;
            const {disposition} = cutpoint;
            const cursor = cursors.get(target) || {after: 0, first: 0};
            cursors.set(target, cursor);
            nodes.forEach(node => node.parentNode = ["first", "last"].includes(disposition) ? target : parentNode);
            if ((disposition === "first" || disposition === "last") && !target.children) {
                togo = fluid.unavailable(`Error in partial template for ${layerName}: Cannot composite into node matching ${cutpoint.selector} which is rendered by a subcomponent`);
            } else if (!parentNode && !["first", "last"].includes(disposition)) {
                togo = fluid.unavailable(`Error in partial template for ${layerName}: Cannot composite at ${disposition} the root of the template`);
            } else if (disposition === "before") {
                parentNode.children.splice(parentNode.children.indexOf(target), 0, ...nodes);
            } else if (disposition === "after") {
                parentNode.children.splice(parentNode.children.indexOf(target) + 1 + cursor.after, 0, ...nodes);
                cursor.after += nodes.length;
            } else if (disposition === "first") {
                target.children.splice(cursor.first, 0, ...nodes);
                cursor.first += nodes.length;
            } else if (disposition === "last") {
                target.children.push(...nodes);
            } else if (disposition === "replace") {
                parentNode.children.splice(parentNode.children.indexOf(target), 1, ...nodes);
            } else { // remove
                parentNode.children.splice(parentNode.children.indexOf(target), 1);
            }
        }
        return togo;
    };

    /**
     * Composite the partial templates contributed by a component's layers onto the tree of its template. Partial
     * templates are composited in order of the precedence of the layers contributing them, weakest first, and those
     * composited at the same cutpoint appear in that order in the document. Each top-level node of a partial template
     * is composited at the cutpoint of its layer, or at its own cutpoint if it bears one as `@relative`, e.g.
     * `<div @relative="after: @navbar">`. Since the selectors of later partials are matched against the tree composited
     * so far, a partial may designate nodes contributed by a weaker one.
     * @param {VNode} compositedTree - The tree of the component's template, whose nodes have their `parentNode` members
     * assigned, which will be modified
     * @param {ComponentComputer} self - The component whose layers contribute partial templates
     * @param {ComponentComputer} view - Its view, a `fluid.partialViewComponent`
     * @return {VNode|Unavailable} The composited tree, or an unavailable value describing why it could not be composited
     */
    fluid.compositePartials = function (compositedTree, self, view) {
        const cursors = new Map();
        return fluid.partialContributions(self, view).reduce((tree, {layerName, relativeContainer, template}) => {
            let togo = tree;
            if (fluid.isUnavailable(tree)) {
                togo = tree;
            } else if (fluid.isUnavailable(template)) {
                togo = template;
            } else if (template === null) {
                togo = fluid.compositeAtCutpoint(tree, [], relativeContainer, layerName, cursors);
            } else {
                const roots = fluid.copy(template).children.filter(child => !child.isComment && !(child.text !== undefined && fluid.isWhitespace(child.text)));
                const defaultGroup = roots.filter(root => !root.attrs?.["@relative"]);
                const ownGroups = roots.filter(root => root.attrs?.["@relative"]).map(root => {
                    const {"@relative": ownCutpoint, ...attrs} = root.attrs;
                    return {nodes: [{...root, attrs}], relativeContainer: ownCutpoint};
                });
                const groups = [...(defaultGroup.length > 0 ? [{nodes: defaultGroup, relativeContainer}] : []), ...ownGroups];
                togo = groups.reduce((acc, group) => fluid.isUnavailable(acc) ? acc :
                    fluid.compositeAtCutpoint(acc, group.nodes.map(node => fluid.assignVTreeParents(node, null)),
                        group.relativeContainer, layerName, cursors), tree);
            }
            return togo;
        }, compositedTree);
    };

    /**
     * Assign the `parentNode` member of every node in a tree, as required for matching selectors against it
     * @param {VNode} vnode - The root of the tree
     * @param {VNode|null} [parentNode] - The parent of the root
     * @return {VNode} The same tree
     */
    fluid.assignVTreeParents = function (vnode, parentNode = null) {
        vnode.parentNode = parentNode;
        if (vnode.children) {
            vnode.children.forEach(child => fluid.assignVTreeParents(child, vnode));
        }
        return vnode;
    };

    // Sort of hack to allow unprocessed part of vtree to form a template for a selfTemplated child component by removing
    // parentNode properties so it can be cloned.
    fluid.retemplatise = function (vnode) {
        delete vnode.parentNode;
        if (vnode.children) {
            vnode.children.forEach(fluid.retemplatise);
        }
        return vnode;
    };

    /**
     * Determine whether a member of a component is configured to hold a component list, i.e. holds a subcomponent
     * record with a `$for` member, as determined by the light merge of its contributions
     * @param {Shadow} shadow - The shadow of the component holding the member
     * @param {String} memberName - The name of the member
     * @return {Boolean} `true` if the member is configured to hold a component list
     */
    fluid.isComponentListMember = function (shadow, memberName) {
        const record = shadow.flatMerged.get()[memberName]?.$component;
        return record ? fluid.expandComponentContributions(record).forRecord !== undefined : false;
    };

    /**
     * Determine whether a member of a component which would hold a subcomponent has been removed by a stronger layer
     * holding `null` at it - see `fluid.collectComponentRecords`
     * @param {Shadow} shadow - The shadow of the component holding the member
     * @param {String} memberName - The name of the member
     * @return {Boolean} `true` if the member has been removed
     */
    fluid.isRemovedMember = function (shadow, memberName) {
        return shadow.flatMerged.get()[memberName] === null;
    };

    // The condition of an element bearing `@id` whose member has been removed, which is never rendered
    fluid.removedMemberCondition = fluid.cell(false, {name: "Removed member condition"});

    fluid.shadowsToRoot = function (shadow) {
        const togo = [];
        while (shadow) {
            togo.push(shadow);
            shadow = shadow.parentShadow;
        }
        return togo;
    };

    /**
     * Retrieves the `ownerDocument` associated with a given shadow component.
     *
     * @param {Shadow} shadow - The shadow object representing the component context.
     * @return {Document|undefined} The document object associated with the shadow's container, or `undefined` if no valid container is found.
     */
    fluid.findDocument = function (shadow) {
        // Search them from root downwards to increase chance of finding a concrete one first - we can't evaluate $compute records
        // by this route. In future components can start to evaluate (at least $computeds can) before layer is defined.
        const shadows = fluid.shadowsToRoot(shadow).reverse();
        const container = fluid.find(shadows, oneShadow => {
            const viewShadow = oneShadow.that && fluid.hasLayer(oneShadow.that, "fluid.viewComponent") ? oneShadow : fluid.viewShadowFor(oneShadow);
            if (viewShadow) {
                return viewShadow.that.container;
            } else {
                // Before a component's view exists, its container may be found in the configuration of its view,
                // and before a view is instantiated, in its own configuration
                const layers = (oneShadow.mergeRecords || []).map(mergeRecord => mergeRecord.layer).reverse();
                return fluid.find(layers, layer => {
                    const container = layer.view?.$component?.container ?? layer.container;
                    return fluid.isSignal(container) || fluid.isDOMNode(container) ? container : undefined;
                });
            }
        });
        return container ? fluid.deSignal(container).ownerDocument : undefined;
    };

    /**
     * Determine the component against which the references of a template rendered by a component's view are resolved.
     * This is the component itself, unless it is a `fluid.templateBlock` rendering the markup of an element bearing
     * `@if` or `@else` within another template, in which case it is the component whose template that is.
     * @param {ComponentComputer} self - The component whose view renders the template
     * @return {ComponentComputer} The component against which the template's references are resolved
     */
    fluid.templateScopeOf = function (self) {
        let shadow = self[$m];
        while (shadow.parentShadow && fluid.hasLayer(shadow.that, "fluid.templateBlock")) {
            shadow = shadow.parentShadow;
        }
        return shadow === self[$m] ? self : fluid.proxyMat(shadow.computer, shadow, []);
    };

    /**
     * Parse the condition of an element bearing `@if` in a template into a signal for its truth. The condition is an
     * expression as interpolated by `@{...}`, which may also be written enclosed in `@{` and `}` - a context reference,
     * a function call or a bare path - optionally preceded by `!` to negate it. As for `$if`, an unavailable value is
     * false.
     * @param {String} condition - The value of the `@if` attribute
     * @param {Shadow} shadow - The shadow of the component against which the condition is resolved
     * @return {Signal<Boolean>} A signal for the truth of the condition
     */
    fluid.parseBlockCondition = function (condition, shadow) {
        const trimmed = condition.trim();
        const negate = trimmed.startsWith("!");
        const body = (negate ? trimmed.substring(1) : trimmed).trim();
        const exp = body.startsWith("@{") && body.endsWith("}") ? body.substring(2, body.length - 1).trim() : body;
        const signal = fluid.templateTokenSignal(fluid.parseAtExpression(exp), shadow);
        return fluid.cell(undefined, {name: `@if condition ${condition} at path ${shadow.path}`}).computed(value => {
            const truthy = !!value && !fluid.isUnavailable(value);
            return negate ? !truthy : truthy;
        }, [signal], {mapArg: fluid.deproxyAndDesignal, isFree: true});
    };

    /**
     * Assign conditions to those of a list of sibling template nodes which bear `@if` or `@else`. An element bearing
     * `@else` takes the negation of the condition of the element bearing `@if` which precedes it, separated from it by
     * nothing but whitespace.
     * @param {VNode[]} children - The sibling nodes
     * @param {Shadow} shadow - The shadow of the component against which conditions are resolved
     */
    fluid.assignBlockConditions = function (children, shadow) {
        let lastCondition = null;
        children.forEach(child => {
            const attrs = child.attrs;
            if (attrs && "@if" in attrs) {
                lastCondition = fluid.parseBlockCondition(attrs["@if"], shadow);
                child.blockCondition = lastCondition;
                child.blockKind = "if";
            } else if (attrs && "@else" in attrs) {
                if (lastCondition === null) {
                    fluid.fail(`Element <${child.tag}> bearing @else in template at path ${shadow.path} does not follow an element bearing @if`);
                }
                child.blockCondition = fluid.mapSignal(lastCondition, value => !value);
                child.blockKind = "else";
                lastCondition = null;
            } else if (child.text === undefined || !fluid.isWhitespace(child.text)) {
                lastCondition = null;
            }
        });
    };

    /**
     * Convert the attributes of an element into the form of its DOM `dataset` - the values of its `data-` attributes
     * keyed by the camel-cased remainder of their names
     * @param {Object<String, String>} attrs - The attributes of the element
     * @return {Object<String, String>} The element's data attributes in the form of its dataset
     */
    fluid.attrsToDataset = function (attrs) {
        const entries = Object.entries(attrs || {}).filter(([key]) => key.startsWith("data-"))
            .map(([key, value]) => [key.substring(5).replace(/-([a-z])/g, (match, letter) => letter.toUpperCase()), value]);
        return Object.fromEntries(entries);
    };

    /**
     * Withdraw the template record pushed to a child component by the template of its parent, if the child exists. A
     * child configured by nothing else, e.g. an anonymous `fluid.templateBlock`, is then destroyed.
     * @param {Shadow} parentShadow - The shadow of the parent component
     * @param {String} memberName - The member name of the child
     */
    fluid.withdrawTemplateRecord = function (parentShadow, memberName) {
        if (parentShadow.childComponents[memberName]) {
            fluid.pushPotentia(parentShadow, memberName, [{mergeRecordType: "template"}]);
        }
    };

    /**
     * Process a vTree to parse text and attribute templates, creating effects to bind to markup during the later renderView stage.
     *
     * Template references, e.g. to `{self}`, are resolved in the context of the view's parent, since a template has no
     * reason to refer to the view machinery which renders it.
     *
     * Nodes marked `verbatim`, as parsed by `fluid.parseVerbatimMarkup`, are not scanned for bindings, but any element
     * among them bearing `fluid-layers` is an island - it is rendered by a child component of `self` bearing those
     * layers, whose member `dataset` holds the element's `data-` attributes.
     *
     * An element bearing `@if` (or `@else`, following one bearing `@if`) is rendered only whilst its condition holds,
     * by a child component of `self` which exists only whilst it does - see `fluid.templateBlock`. An element bearing
     * `@id` whose member has been removed by a layer holding `null` is likewise omitted, and allocates no component.
     *
     * @param {VNode} vtemplate - The vTree representing the template which will be parsed
     * @param {ComponentComputer} self - The component whose view renders the template, which receives any components
     * allocated for conditional elements and islands
     * @param {ComponentComputer} view - The view subcomponent of `self` which will render the template, and which holds
     * its configuration and the effects binding it to markup
     * @param {ComponentComputer} [scope] - The component in the context of which template references are to be parsed,
     * and which receives the subcomponents designated by `@id` - by default, `self`
     * @return {VNode} The processed vTree with rendered text and attributes.
     */
    fluid.activateTemplate = function (vtemplate, self, view, scope = self) {
        const shadow = scope[$m];
        const selfShadow = self[$m];
        const viewShadow = view[$m];
        // Awful hack to get around surplus notification problem for now
        const selfEditingRef = fluid.editorRootRef || (fluid.editorRootRef = fluid.fetchContextReference("{fluid.editorRoot}.selfEditing", shadow));
        const selfEditing = fluid.deSignal(selfEditingRef);

        // Add dependency on turnover since will affect partial template contingent, etc.
        shadow.flatMerged.get();

        const templateEffects = viewShadow.frameworkEffects.templateEffects = viewShadow.frameworkEffects.templateEffects || [];
        // Names of the members of self allocated for conditional elements and islands by this activation
        const jointNames = [];
        const jointCounts = {};
        // Names of the members designated by @id whose elements are omitted by this activation since they are removed
        const removedNames = [];
        const allocateJointName = kind => `${kind}-${jointCounts[kind] = (jointCounts[kind] || 0) + 1}`;

        /**
         * Allocate the child component of `self` rendering an element of the template which bears `@if` or `@else`.
         * Unless the element also bears `@id`, the child is an anonymous `fluid.templateBlock`. The element is omitted
         * from the rendered markup whilst its condition is false.
         * @param {VNode} vnode - The element
         */
        function allocateTemplateBlock(vnode) {
            const idValue = vnode.attrs["@id"];
            const memberName = idValue || allocateJointName(vnode.blockKind);
            const parentTemplate = {
                tag: vnode.tag,
                attrs: fluid.filterObjKeys(vnode.attrs, key => key !== "@if" && key !== "@else" && key !== "@id"),
                children: vnode.children.map(fluid.retemplatise)
            };
            vnode.elementSignal ||= fluid.cell(fluid.unavailableElement, {name: `Element signal for vnode ${vnode._id}`});
            const view = {
                $component: {
                    container: vnode.elementSignal,
                    parentTemplate
                }
            };
            // An element bearing @id renders its member just as it would without @if - otherwise its markup is
            // rendered by an anonymous block, against our scope
            const templateRecord = {
                mergeRecordType: "template",
                layer: idValue ? {
                    $layers: "fluid.component",
                    view: {$component: {...view.$component, $layers: "fluid.viewComponent"}}
                } : {
                    $layers: "fluid.templateBlock",
                    view
                }
            };
            delete vnode.children;
            vnode.attrs = {};
            vnode.ifSignal = vnode.blockCondition;
            vnode.blockKey = memberName;
            const pushShadow = idValue ? shadow : selfShadow;
            const blockEffect = fluid.cell.effect(function () {
                if (vnode.ifSignal.get()) {
                    fluid.pushPotentia(pushShadow, memberName, [templateRecord]);
                } else {
                    fluid.withdrawTemplateRecord(pushShadow, memberName);
                }
            }, [], {name: `@${vnode.blockKind} block effect for member ${memberName} at path ${pushShadow.path}`});
            blockEffect.$variety = "templateBlock";
            templateEffects.push(blockEffect);
            if (!idValue) {
                jointNames.push(memberName);
            }
        }

        /**
         * Omit from the rendered markup an element bearing `@id` whose member has been removed by a stronger layer
         * holding `null`, as for an element bearing `@if` whose condition is false. Any component left by a previous
         * activation's template record for the member is destroyed.
         * @param {VNode} vnode - The element
         */
        function omitRemovedMember(vnode) {
            const memberName = vnode.attrs["@id"];
            delete vnode.children;
            vnode.attrs = {};
            vnode.ifSignal = fluid.removedMemberCondition;
            vnode.blockKey = memberName;
            removedNames.push(memberName);
            const withdrawEffect = fluid.cell.effect(function () {
                fluid.withdrawTemplateRecord(shadow, memberName);
            }, [], {name: `Removed member effect for member ${memberName} at path ${shadow.path}`});
            templateEffects.push(withdrawEffect);
        }

        /**
         * Allocate the child component of `self` rendering an island within verbatim markup
         * @param {VNode} vnode - The element bearing `fluid-layers`
         */
        function allocateIsland(vnode) {
            const layers = vnode.attrs["fluid-layers"].split(/\s+/).filter(layer => layer);
            const memberName = vnode.attrs["fluid-id"] || allocateJointName("island");
            const parentTemplate = {
                tag: vnode.tag,
                attrs: {...vnode.attrs},
                children: vnode.children.map(fluid.retemplatise),
                verbatim: true
            };
            vnode.elementSignal ||= fluid.cell(fluid.unavailableElement, {name: `Element signal for vnode ${vnode._id}`});
            delete vnode.children;
            fluid.pushPotentia(selfShadow, memberName, [{
                mergeRecordType: "template",
                layer: {
                    $layers: ["fluid.component", ...layers],
                    dataset: fluid.attrsToDataset(vnode.attrs),
                    view: {
                        $component: {
                            $layers: "fluid.viewComponent",
                            container: vnode.elementSignal,
                            parentTemplate
                        }
                    }
                }
            }]);
            jointNames.push(memberName);
        }

        /**
         * Recursively processes a VNode by rendering any template strings found in its text or attributes
         * @param {VNode} vnode - The VNode to be processed.
         * @return {VNode} The processed VNode with rendered content in text and attributes.
         */
        function processVNode(vnode) {
            vnode.shadow = shadow;
            vnode._id = vnode._id || vnode_id++;
            if (vnode.text !== undefined) {
                if (!vnode.verbatim) {
                    const tokens = fluid.parseAtStringTemplate(vnode.text);
                    const rendered = fluid.renderComputedStringTemplate(tokens, shadow);
                    if (fluid.isSignal(rendered)) {
                        rendered.$source = vnode.text;
                    }
                    fluid.bindDomTokens(templateEffects, vnode, rendered, (node, text) => node.nodeValue = text);
                    Object.assign(vnode, {text: rendered});
                }
            } else if (vnode.verbatim) {
                if (vnode.attrs?.["fluid-layers"]) {
                    allocateIsland(vnode);
                } else if (vnode.children !== undefined) {
                    vnode.children = vnode.children.map(processVNode);
                }
            } else if (vnode.blockCondition) {
                allocateTemplateBlock(vnode);
            } else if (vnode.attrs?.["@id"] && fluid.isRemovedMember(shadow, vnode.attrs["@id"])) {
                omitRemovedMember(vnode);
            } else {
                // Process id attribute first since it may cause others to be slung to another component
                const idValue = vnode.attrs?.["@id"];
                if (idValue) {
                    // The element's node is marked with its member's name, so that it can be removed should the member
                    // be removed - if it was removed by the previous activation, the element is inserted afresh
                    vnode.memberKey = idValue;
                    if ((viewShadow.removedMemberNames || []).includes(idValue)) {
                        vnode.blockKey = idValue;
                    }
                    // This effect binds to the DOM node, when it is disposed, will empty the component's template record.
                    // We likely don't want to use this in practice since a template update is going to update this live and
                    // we'd prefer to reuse whatever is in the DOM without tearing it down.
                    fluid.allocateVNodeEffect(vnode, vnode => {
                        const disposable = function () {
                            fluid.pushPotentia(shadow, idValue, [{mergeRecordType: "template"}]);
                        };
                        disposable.$variety = "$component";
                        const parentTemplate = fluid.cell({
                            tag: vnode.tag,
                            attrs: fluid.filterObjKeys(vnode.attrs, key => key !== "@id"),
                            children: vnode.children.map(fluid.retemplatise)
                        }, {name: `parentTemplate signal for vnode ${vnode._id}`});
                        delete vnode.children;
                        vnode.attrs = fluid.filterObjKeys(vnode.attrs, key => !key.startsWith("@"));

                        // The template record ensures that the child has a view, rendering into the container supplied
                        // here - if the child is a component list, its view renders its members' views in sequence. A
                        // <fluid-fragment> slot has no element - the child's view renders no container of its own, and
                        // its tree is spliced into ours in place of the slot by fluid.patchChildren
                        const isFragment = vnode.tag === fluid.fragmentSlotTag;
                        const viewLayer = fluid.isComponentListMember(shadow, idValue) ? "fluid.listViewComponent" : "fluid.viewComponent";
                        const templateRecord = {
                            mergeRecordType: "template",
                            layer: {
                                $layers: "fluid.component",
                                view: {
                                    $component: {
                                        $layers: viewLayer,
                                        container: isFragment ? fluid.fragmentSlotContainer : vnode.elementSignal,
                                        parentTemplate
                                    }
                                }
                            }
                        };

                        const childShadow = fluid.pushPotentia(shadow, idValue, [templateRecord]);
                        if (isFragment) {
                            vnode.fragmentOf = childShadow;
                        }
                        // Establish dependency on availability of child component so we re-render if its availability changes
                        childShadow.availableInstance.get();
                        return disposable;
                    });
                }
                fluid.each(vnode.attrs, (value, key) => {
                    fluid.processVNodeAttribute(vnode, value, key, shadow, templateEffects);
                });
                // Special marker put on the VNode by fluid.processVNodeAttribute for @class
                if (vnode["class"]) {
                    // Grab a reference to any source of classes before this node was signalised - a static class
                    // attribute, or one interpolating references, which is rendered here
                    const clazzAttr = vnode.attrs["class"];
                    const clazzSource = fluid.getSignalSource(clazzAttr) || "";
                    const allClass = fluid.cell(undefined, {name: `allClass computer for vnode ${vnode._id}`})
                        .computed( () => {
                            const classes = Object.entries(vnode["class"]).map( ([key, value]) => [key, fluid.deSignal(value)])
                                .filter(([, value]) => value && !fluid.isUnavailable(value))
                                .map(([key]) => key);
                            const renderedSource = fluid.isSignal(clazzAttr) ? fluid.deSignal(clazzAttr) : clazzSource;
                            return [fluid.isUnavailable(renderedSource) ? "" : renderedSource, ...classes].filter(clazz => clazz).join(" ");
                        });
                    allClass.$variety = "$allClass";
                    allClass.$source = clazzSource;
                    fluid.bindDomTokens(templateEffects, vnode, allClass, (node, text) => fluid.applyClassTokens(node, fluid.classWriterOf(vnode), text));
                    vnode.attrs["class"] = allClass;
                }
                if (vnode.children !== undefined) {
                    fluid.assignBlockConditions(vnode.children, shadow);
                    vnode.children = vnode.children.map(processVNode);
                }
            }
            return vnode;
        }

        const activateTemplate = tree => {
            fluid.disposeEffects(templateEffects);
            const togo = processVNode(tree);
            // TODO: In the end this will be done on parse of the SFC and folding its provenance onto the $imports layer property
            // TODO: This path is now broken - fluid.findDocument returns a signal and this function accepts a Document.
            // We can't actually asynchronise this here and this whole process of acquiring imports from template documents is broken
            // Use layer imports for now until we can have a big reform - either do this processing on parse, or attach machinery to templates directly etc.
            fluid.acquireLoadDirectives(fluid.findDocument(shadow), vtemplate);
            templateEffects.forEach(effect => effect.$site = self);
            // Destroy any conditional element or island allocated by a previous activation which is no longer in the template
            (viewShadow.templateJointNames || []).filter(name => !jointNames.includes(name)).forEach(name =>
                fluid.withdrawTemplateRecord(selfShadow, name));
            viewShadow.templateJointNames = jointNames;
            viewShadow.removedMemberNames = removedNames;
            return togo;
        };

        if (!vtemplate) {
            // TODO: looks like this can only occur through reference like {self}.parentTemplate which should produce unavailable by itself
            return fluid.unavailable("Template not configured");
        }

        const tree = fluid.copy(vtemplate);
        const useTree = fluid.effVTree(tree, view.elideParent);
        let compositedTree = fluid.assignVTreeParents(useTree);

        if (fluid.hasLayer(view, "fluid.partialViewComponent")) {
            compositedTree = fluid.compositePartials(compositedTree, self, view);
        }

        let togo;
        if (fluid.isUnavailable(compositedTree)) {
            togo = compositedTree;
        } else {
            // Currently returns its argument, but historical "tag-singularity" branch did funky stuff folding "virtual virtual DOM nodes" together
            const activatedTree = activateTemplate(compositedTree);

            const filteredTree = !fluid.isUnavailable(selfEditing) && selfEditing ? selfEditingRef.get().site.shadow.that.filterForSelfEditing(activatedTree, self) : activatedTree;

            fluid.bindContainer(templateEffects, filteredTree, self, view);
            togo = filteredTree;
        }
        return togo;
    };

    fluid.unbindDom = function (/*vnode, element*/) {
        // Try to remove event listeners and the like?
    };

    /**
     * Binds a DOM element to a virtual node (VNode), setting up necessary bindings or effect handling.
     * If the VNode contains a signal, it will update its value with the provided element.
     * If it contains a set of binding functions, those functions will be invoked with the element.
     *
     * @param {VNode} vnode - The virtual node to bind the element to.
     * @param {HTMLElement} element - The DOM element to bind to the virtual node.
     */
    fluid.bindDom = function (vnode, element) {
        if (vnode.elementSignal) {
            fluid.unbindDom(vnode, vnode.elementSignal._value);
            vnode.elementSignal.set(element);
        }
    };

    // The tag of a slot designating a subcomponent by @id which is rendered as the subcomponent's markup alone, with no
    // element of its own, e.g. a list of <link>s within <head> - <fluid-fragment @id="stylesheetTags">
    fluid.fragmentSlotTag = "fluid-fragment";

    // The container of the view of a subcomponent rendered into a <fluid-fragment> slot, which renders nothing itself
    fluid.fragmentSlotContainer = fluid.unavailable({cause: "View rendered into a fragment slot by its parent", variety: "config"});

    /**
     * Expand a vnode for patching - a <fluid-fragment> slot is replaced by the nodes of the tree currently rendered by
     * the view of its subcomponent, which are thereby patched as children of the slot's parent. A view whose root is
     * elided contributes that root; a list view, or one whose root is not elided, contributes its root's children.
     * Whilst the subcomponent's tree is unavailable, the slot contributes nothing. Any other vnode is returned as is.
     * @param {VNode} vnode - The vnode
     * @return {VNode[]} The vnodes to be patched in its place
     */
    fluid.expandFragmentSlot = function (vnode) {
        let togo;
        if (vnode.fragmentOf) {
            const tree = fluid.deSignal(fluid.getForComponent(vnode.fragmentOf, ["view", "vTree"]));
            togo = !tree || fluid.isUnavailable(tree) ? [] : fluid.isTemplateRootTag(tree.tag) ? tree.children : [tree];
        } else {
            togo = [vnode];
        }
        return togo;
    };

    /**
     * Cause the attributes of the supplied DOM node to agree with the `attrs` member of the supplied VNode. Any
     * attributes in its `defaultAttrs` member are applied only if the node does not already have them.
     *
     * @param {VNode} vnode - The VNode whose attributes are to be applied
     * @param {HTMLElement} element - The DOM node whose attributes are to be patched
     * @param {Boolean} isRoot - `true` if this rendering is of a container root - if so, this will skip deleting mismatching attributes
     */
    fluid.patchAttrs = function (vnode, element, isRoot) {
        // The attributes of a container are written both by the template in which it appears, e.g. as an element
        // bearing @id, and by the root of the template rendered into it. Each removes only those attributes which it
        // wrote itself and no longer writes, recorded as flJointAttrs and flRootAttrs respectively. The class attribute
        // is instead the union of the classes each writes - see fluid.applyClassTokens
        const classValue = vnode.attrs?.["class"] ?? vnode.defaultAttrs?.["class"];
        // Whether the element is claimed from earlier markup is decided now, before its children are rendered
        fluid.initClassWriters(element, isRoot ? "root" : "joint");
        // A bound class is written by its own effect, allocated in fluid.activateTemplate
        if (!fluid.isSignal(classValue)) {
            fluid.applyClassTokens(element, isRoot ? "root" : "joint", classValue);
        }
        const owned = new Set([...Object.keys(vnode.attrs ?? {}), ...Object.keys(vnode.defaultAttrs ?? {}), "class"]);
        const ownedByOther = isRoot ? element.flJointAttrs : element.flRootAttrs;
        // An attribute is removed only if this writer wrote it before - not if it was written by some other agent, e.g. a
        // widget marking an element of the template. On the first patch of an element by the template in which it
        // appears, whatever it holds was written by that template, e.g. in markup claimed from a static build, since
        // an element created by rendering holds nothing until then
        const previouslyWritten = attrName => isRoot ? !!element.flRootAttrs?.has(attrName) :
            element.flJointAttrs ? element.flJointAttrs.has(attrName) : true;
        const removable = attrName => !owned.has(attrName) && !attrName.startsWith("data-fl-transient") && !ownedByOther?.has(attrName) &&
            previouslyWritten(attrName);
        for (let i = element.attributes.length - 1; i >= 0; i--) {
            const attrName = element.attributes[i].name;
            if (removable(attrName)) {
                fluid.applyAttr(element, attrName, null);
            }
        }
        for (const [key, value] of Object.entries(vnode.attrs ?? {})) {
            if (key !== "class" && !fluid.isSignal(value) && element.getAttribute(key) !== value) {
                fluid.applyAttr(element, key, value);
            }
        }
        // A default attribute is only written, and so only owned, if the element does not already have it
        const ownedDefaults = Object.keys(vnode.defaultAttrs ?? {}).filter(key =>
            !element.hasAttribute(key) || (isRoot ? element.flRootAttrs : element.flJointAttrs)?.has(key));
        for (const [key, value] of Object.entries(vnode.defaultAttrs ?? {})) {
            if (key !== "class" && !element.hasAttribute(key)) {
                fluid.applyAttr(element, key, value);
            }
        }
        const written = new Set([...Object.keys(vnode.attrs ?? {}), ...ownedDefaults]);
        if (isRoot) {
            element.flRootAttrs = written;
        } else {
            element.flJointAttrs = written;
        }
    };

    // The writers of an element's classes, in the order in which their classes appear in its class attribute - the
    // template in which the element appears, and the root of any template elided onto it
    fluid.classWriters = ["joint", "root"];

    /**
     * Determine which of the writers of an element's classes a VNode is - see `fluid.applyClassTokens`
     * @param {VNode} vnode - The VNode
     * @return {String} "root" if the VNode is the root of a template rendered onto the element, otherwise "joint"
     */
    fluid.classWriterOf = vnode => vnode.renderedAsRoot ? "root" : "joint";

    // Split a class attribute into its classes
    fluid.classTokens = value => (value ?? "").split(/\s+/).filter(token => token);

    /**
     * Begin tracking the writers of an element's classes, on the first occasion that one of them renders it, before its
     * children are rendered - see `fluid.applyClassTokens`
     * @param {Element} element - The element
     * @param {String} writer - The writer which is rendering it, one of `fluid.classWriters`
     */
    fluid.initClassWriters = function (element, writer) {
        if (!element.flClassWriters) {
            const tokens = fluid.classTokens;
            const current = tokens(element.getAttribute("class"));
            element.flClassWriters = {};
            // A container which already holds markup when the template rendered into it first writes it was rendered
            // earlier from that template, e.g. by a static build - its children are claimed by position, and its
            // classes likewise were written by its templates, apart from any recorded as its own. Since its attributes
            // are written before its children, a fresh container holds none at this point
            const claimed = writer === "root" && element.children.length > 0;
            const own = new Set(tokens(element.getAttribute(fluid.ownClassAttribute)));
            element.flClassPrior = new Set(current.filter(token => !own.has(token)));
            element.flClassClaimed = claimed;
            if (writer === "root" && !claimed && current.length > 0) {
                // The classes of a fresh container which the template rendered into it did not write, e.g. those of an
                // element booted by fluid-layers, are recorded, so that they survive as its own should the rendered
                // markup be written by a static build and claimed later
                element.setAttribute(fluid.ownClassAttribute, current.join(" "));
            }
        }
    };

    /**
     * Write the classes which one writer contributes to an element's class attribute. An element serving as the
     * container of a view whose template's root is elided onto it is written by two templates - its own as the
     * element bearing @id in its parent's template, and the template rendered into it. Either may re-render without
     * the other, in either order, so rather than each writing the whole attribute, each contributes a set of classes,
     * and the attribute holds their union. A writer removes only those of its classes which it no longer writes, and
     * which no other writer holds. Classes written by no template, e.g. added by a widget, are kept, after the written
     * ones, which appear in the order of `fluid.classWriters` - so the attribute is the same whatever the order in which
     * the writers rendered, and whether a writer renders before or after another agent adds a class.
     * An element claimed from existing markup, e.g. rendered by a static build, records no writers - the classes it
     * holds are taken to have been written by the templates which are about to render it once the template in which it
     * appears has written it, and are then dropped unless written again. Likewise for the container of a free
     * component, e.g. one booted by `fluid-layers`, which already holds markup when the template rendered into it
     * first writes it - apart from those classes recorded as its own in its `fluid-own-class` attribute. This is
     * written when a template first renders into a fresh container holding classes of its own, so that they survive
     * in the container's markup as written by a static build.
     * @param {Element} element - The element
     * @param {String} writer - The writer, one of `fluid.classWriters`
     * @param {String|null|undefined} text - The classes the writer contributes, separated by whitespace - none if absent
     */
    fluid.applyClassTokens = function (element, writer, text) {
        const tokens = fluid.classTokens;
        fluid.initClassWriters(element, writer);
        const current = tokens(element.getAttribute("class"));
        const writers = element.flClassWriters;
        writers[writer] = new Set(tokens(text));
        // The classes the element held before any writer wrote are taken to have been written by its templates, once
        // the template in which it appears has written it, or if it was claimed from earlier markup
        const previous = new Set([...(element.flClassWritten ?? []), ...(writers.joint || element.flClassClaimed ? element.flClassPrior : [])]);
        const written = new Set(fluid.classWriters.flatMap(oneWriter => [...(writers[oneWriter] ?? [])]));
        // Classes neither written now nor previously by any writer were added by some other agent
        const foreign = current.filter(token => !written.has(token) && !previous.has(token));
        // Classes of other agents follow those of the templates, since an agent adding a class with classList.add places
        // it last - so the attribute is in the same order whether or not a template writes after the agent has
        const updated = [...written, ...foreign].join(" ");
        element.flClassWritten = written;
        if (updated === "") {
            if (element.hasAttribute("class")) {
                element.removeAttribute("class");
            }
        } else if (element.getAttribute("class") !== updated) {
            element.setAttribute("class", updated);
        }
    };

    // The attribute recording the classes of the container of a free component which are its own rather than written by
    // the template rendered into it - see fluid.applyClassTokens
    fluid.ownClassAttribute = "fluid-own-class";

    fluid.vnodeToSegs = function (vnode) {
        // TODO: Extract path to root of template
        return ["$template", vnode.tag];
    };


    // Hack to assign ids to vnodes to ensure that their events get bound to container DOM nodes exactly once
    let vnode_id = 1;

    /**
     * Determine the key by which a vnode's node is matched up across renderings - the key of the list member whose
     * markup it is, or else the member held by an element bearing `@id`, or else the block of an element bearing `@if`.
     * A vnode with none of these is matched by position amongst its unkeyed siblings.
     * @param {VNode} vnode - The vnode
     * @return {String|undefined} Its key, if it has one
     */
    fluid.vnodeKey = function (vnode) {
        return typeof(vnode) === "string" ? undefined : vnode.listKey ?? vnode.memberKey ?? vnode.blockKey;
    };

    /**
     * Determine whether a node within an element is not ours to reconcile - one injected for a Single File Component,
     * e.g. its style, or a script booting the framework in a hydrated document.
     * @param {Node} node - The node
     * @return {Boolean} `true` if the node is to be left alone
     */
    fluid.isForeignFrameworkNode = function (node) {
        return fluid.isInjectedNode(node) || node.nodeType === 1 /* Node.ELEMENT_NODE */ && node.localName === "script" &&
            fluid.classifyScriptNode(node) === "framework";
    };

    /**
     * Match up the vnodes which are to be the children of an element with the nodes which it currently holds and which
     * may be reused for them, removing any others which this rendering owns. A rendering owns the nodes it created,
     * and, on the first rendering of an element which already has children, e.g. markup written by an earlier static
     * rendering, those which it claims from them. Any node which it does not own, e.g. one added by a widget loader or
     * browser extension, is left in place and alone. On the first rendering the children are claimed by position,
     * since the markup is expected to have been rendered from the same template. Thereafter, owned nodes are matched to
     * vnodes by key where they have one, so that a node is reused by the same list member or block however the list
     * is reordered or grows, and other nodes by position amongst the unkeyed ones.
     * @param {Element} element - The element whose children are being reconciled
     * @param {VNode[]} vchildren - The vnodes which are to be its children
     * @return {Array<Node|undefined>} For each vnode, the node to be reused for it, or `undefined` if one is to be created
     */
    fluid.assignChildNodes = function (element, vchildren) {
        const children = [...element.childNodes].filter(node => !fluid.isForeignFrameworkNode(node));
        let assigned;
        let owned;
        if (element.flPatched) {
            owned = children.filter(node => node.flOwned);
            const byKey = new Map();
            const unkeyed = [];
            owned.forEach(node => {
                if (node.flKey !== undefined) {
                    byKey.set(node.flKey, node);
                } else {
                    unkeyed.push(node);
                }
            });
            let unkeyedIndex = 0;
            assigned = vchildren.map(vchild => {
                const key = fluid.vnodeKey(vchild);
                let candidate;
                if (key !== undefined) {
                    candidate = byKey.get(key);
                    byKey.delete(key);
                } else {
                    candidate = unkeyed[unkeyedIndex++];
                }
                return candidate && fluid.matchNodeToVNode(candidate, vchild) ? candidate : undefined;
            });
        } else {
            owned = children;
            assigned = vchildren.map((vchild, i) => children[i] && fluid.matchNodeToVNode(children[i], vchild) ? children[i] : undefined);
        }
        const reused = new Set(assigned);
        owned.filter(node => !reused.has(node)).forEach(node => node.remove());
        return assigned;
    };

    /**
     * Place the nodes for the vnodes which are to be the children of an element into it in order, creating any which
     * are not to be reused, and patch each of them. Each node is placed after the node of its preceding sibling vnode,
     * moving it only if it is out of order, so that a node reused for a keyed vnode keeps its identity - e.g. a
     * stylesheet is not fetched again, nor a script run again. Nodes which the rendering does not own are not moved, and
     * nodes created are placed immediately after their predecessor, so that any nodes appended to the element by others,
     * e.g. injections into the head, remain after all of the rendering's own.
     * @param {Element} element - The element whose children are being reconciled
     * @param {VNode[]} vchildren - The vnodes which are to be its children
     * @param {Array<Node|undefined>} nodes - For each vnode, the node to be reused for it, as returned by
     * `fluid.assignChildNodes`
     */
    fluid.placeChildNodes = function (element, vchildren, nodes) {
        const placed = new Set(nodes.filter(node => node));
        let cursor = element.firstChild;
        vchildren.forEach((vchild, i) => {
            let node = nodes[i];
            if (!node) {
                node = fluid.nodeFromVNode(element.ownerDocument, vchild);
            }
            node.flOwned = true;
            node.flKey = fluid.vnodeKey(vchild);
            // Look past nodes we do not own up to the next of ours - if it is this node, it is already in order
            let probe = cursor;
            while (probe && probe !== node && !placed.has(probe)) {
                probe = probe.nextSibling;
            }
            if (probe !== node) {
                element.insertBefore(node, cursor);
            }
            cursor = node.nextSibling;
            fluid.patchChildren(vchild, node);
        });
    };

    // Helpful comparison: https://lazamar.github.io/virtual-dom/#applying-a-diff
    /**
     * Updates the DOM to match the given virtual node (VNode) structure.
     *
     * This function ensures that the provided `element` correctly reflects the structure
     * of `vnode.children`, updating, replacing, or removing child elements as necessary.
     *
     * @param {VNode} vnode - The virtual node representing the desired DOM structure.
     * @param {Node} element - The actual DOM element to be patched.
     * @param {Boolean} [isRoot] - `true` if this rendering is of a container root - if so, this will skip deleting mismatching attributes
     */
    fluid.patchChildren = function (vnode, element, isRoot = false) {
        // Recorded before binding, so that the effect binding any class of the node writes it as the same writer - see
        // fluid.classWriterOf
        vnode.renderedAsRoot = isRoot;
        fluid.bindDom(vnode, element); // Will assign to elementSignal and allocate binding effects
        if (vnode.text !== undefined && !fluid.isSignal(vnode.text) && vnode.text !== element.nodeValue) {
            element.nodeValue = vnode.text;
        }
        if (vnode.attrs !== undefined || vnode.defaultAttrs !== undefined) {
            fluid.patchAttrs(vnode, element, isRoot);
        }

        // It may be undefined because this is a joint to a subcomponent as applied in fluid.processAttributeDirective
        if (vnode.children !== undefined) {
            // An element bearing @if is omitted whilst its condition is false, and its node is then not reused
            const isAbsent = vchild => vchild.ifSignal !== undefined && !vchild.ifSignal.get();
            const vchildren = vnode.children.filter(vchild => !isAbsent(vchild)).flatMap(fluid.expandFragmentSlot);
            const nodes = fluid.assignChildNodes(element, vchildren);
            fluid.placeChildNodes(element, vchildren, nodes);
            element.flPatched = true;
            const boundValue = vnode.boundAttrs?.value;
            if (boundValue && element.localName === "select") {
                // Patching the options may have disturbed the value materialised onto them, so restore it
                fluid.cell.untracked(() => fluid.applyAttr(element, "value", fluid.deSignal(boundValue)));
            }
        }
    };

    /**
     * Renders a virtual DOM tree (VNode) into a container element.
     *
     * This function updates the container's contents to match the provided virtual tree.
     * If `elideParent` is true, the `vTree`'s children are grafted as children of the current container.
     *
     * @param {ComponentComputer} self - The view component which is rendering
     * @param {HTMLElement} container - The target DOM element where the virtual tree should be rendered.
     * @param {VNode} vTree - The virtual node representing the desired DOM structure.
     */
    fluid.renderView = function (self, container, vTree) {
        fluid.allocateDomId(container);
        fluid.subscribeOutputDocumentInjections(self, container.ownerDocument);
        // console.log(`renderView beginning for ${self[$m].path} with vTree ${vTree._id} container `, container.flDomId);
        fluid.patchChildren(vTree, container, true);
    };

    /**
     * Disable any further rendering by a component's view, e.g. because its markup has been taken over by a widget
     * @param {ComponentComputer} self - The component whose rendering is to be disabled
     */
    fluid.disableRendering = function (self) {
        self.view.vTree = fluid.unavailable({cause: "Rendering is disabled", variety: "config"});
    };

    // The view of a component, held as its subcomponent "view", which holds all of its view configuration, e.g. its
    // container and template, as well as all the machinery which renders it. A component acquires a view by writing a
    // record at view.$component holding this layer or one derived from it - the component itself bears no view layer.
    // The view renders its template into its container. References within the template are resolved in the context of
    // its parent, by fluid.activateTemplate
    fluid.def("fluid.viewComponent", {
        $layers: "fluid.component",
        elideParent: true,
        // If true, a template supplied as markup is taken verbatim - it is not scanned for bindings, may have any number
        // of top-level nodes, all of which are rendered within the container, and keeps its whitespace. Elements within
        // it bearing `fluid-layers` are rendered as islands - see fluid.activateTemplate
        verbatim: false,
        container: "$compute:fluid.unavailable(Container not specified)",
        // The markup at our container in our parent's template, supplied by the template record of a parent whose
        // template designates our container with @id
        parentTemplate: fluid.unavailable({cause: "No virtual DOM tree is configured", variety: "config"}),
        // A view with no template of its own renders the markup found at its container in its parent's template - for
        // example, once the $if of a conditional component has become false, and only its parent's template record remains
        templateTree: "$compute:fluid.placeholderTree({self}.parentTemplate)",
        // Mashed in live by bindContainer called at the end of activateTemplate
        renderedContainer: {
            $reactiveRoot: fluid.unavailable({cause: "Component not rendered", variety: "config"})
        },
        vTree: "$compute:fluid.activateTemplate({self}.templateTree, {$parent}, {self})",
        renderView: "$effect:fluid.renderView({self}, {self}.container, {self}.vTree)",
        $variety: "framework"
    });

    /**
     * Wrap the markup found at a view's container in its parent's template as a fragment, so that it is rendered onto
     * the container itself when the root of the tree is elided, as it is by default. The markup is marked as a
     * placeholder so that the container is rendered just as the parent's template has it, without a default id.
     * @param {VNode} parentTemplate - The markup found at the container in the parent's template
     * @return {VNode} A fragment holding the markup
     */
    fluid.placeholderTree = function (parentTemplate) {
        return {tag: "fragment", children: [{...parentTemplate, isPlaceholder: true}]};
    };

    /**
     * Forward any `container` supplied as an argument to a free component's creator function to the component's view,
     * as a courtesy to its callers
     * @param {Object} argLayer - The user arguments
     * @return {Object} The upgraded user arguments
     */
    fluid.upgradeFreeComponentArgs = function (argLayer) {
        let togo;
        if (argLayer.container === undefined) {
            togo = argLayer;
        } else {
            const {container, ...rest} = argLayer;
            togo = {...rest, view: {...rest.view, $component: {...rest.view?.$component, container}}};
        }
        return togo;
    };

    /**
     * Retrieve the shadow of the view subcomponent of a component which has one
     * @param {Shadow} shadow - The shadow of a component
     * @return {Shadow|undefined} The shadow of the component's view, or `undefined` if it has none
     */
    fluid.viewShadowFor = function (shadow) {
        const viewShadow = shadow.childComponents?.view;
        return viewShadow?.that && fluid.hasLayer(viewShadow.that, "fluid.viewComponent") ? viewShadow : undefined;
    };

    /**
     * Retrieve the DOM element onto which a component's view is currently rendered
     * @param {Shadow} shadow - The shadow of a component
     * @return {Element|Unavailable|undefined} The rendered container, or an unavailable value if the component's view
     * is not rendered, or `undefined` if it has no view
     */
    fluid.renderedContainerFor = function (shadow) {
        const viewShadow = fluid.viewShadowFor(shadow);
        return viewShadow && fluid.deSignal(viewShadow.that.renderedContainer);
    };

    // A self-templating component that uses the existing DOM document contents as its template
    fluid.def("fluid.selfTemplateRootViewComponent", {
        $layers: "fluid.viewComponent",
        templateContainer: fluid.unavailable({cause: "No template container is configured", variety: "config"}),
        container: "{self}.templateContainer",
        templateTree: {
            $bindable: {
                bind: "fluid.captureViewTemplate({self}.container)"
            }
        },
        elideParent: false,
        $variety: "framework"
    });

    fluid.captureViewTemplate = function (container) {
        return fluid.domToVDom(container);
    };

    // TODO: fold selfTemplateRootViewComponent and selfTemplateViewComponent together - requires advanced feature of reacting to whether
    // container was sourced as a direct user argument or from the templateRecord pushPotentia from a parent component
    // - we'd probably prefer this to be done by being able to expose the provenance of a value as a reactive quantity
    // A self-templating component that uses markup supplied by its parent
    fluid.def("fluid.selfTemplateViewComponent", {
        $layers: "fluid.viewComponent",
        templateTree: "{self}.parentTemplate",
        elideParent: false,
        $variety: "framework"
    });

    // A view rendering the template held as its member `template` - either markup, or a reference `{sfcLayer}` to the
    // template of a Single File Component, as written by fluid.sfcToInjRecs
    fluid.def("fluid.templateViewComponent", {
        $layers: "fluid.viewComponent",
        templateTree: "$compute:fluid.templateToTree({self}.template, {self}.verbatim)",
        $variety: "framework"
    });

    // An anonymous component rendering the markup of an element bearing @if or @else in another component's template,
    // which exists only whilst its condition holds - see fluid.activateTemplate. References within its markup, and
    // subcomponents designated within it by @id, are resolved against the component whose template it is part of.
    fluid.def("fluid.templateBlock", {
        $layers: "fluid.component",
        view: {
            $component: {
                $layers: "fluid.templateBlockView"
            }
        },
        $variety: "framework"
    });

    fluid.def("fluid.templateBlockView", {
        $layers: "fluid.viewComponent",
        elideParent: false,
        templateTree: "$compute:fluid.blockTemplateTree({self}.parentTemplate)",
        vTree: "$compute:fluid.activateBlockTemplate({self}.templateTree, {$parent}, {self})",
        $variety: "framework"
    });

    /**
     * Activate the template of a `fluid.templateBlock`, resolving its references against the component whose template
     * it is part of
     * @param {VNode} vtemplate - The block's template
     * @param {ComponentComputer} block - The block
     * @param {ComponentComputer} view - The block's view
     * @return {VNode} The activated tree
     */
    fluid.activateBlockTemplate = function (vtemplate, block, view) {
        return fluid.activateTemplate(vtemplate, block, view, fluid.templateScopeOf(block));
    };

    /**
     * Produce the template of a `fluid.templateBlock` - the markup of the element bearing @if or @else, which is marked
     * as a placeholder so that it does not acquire a default id
     * @param {VNode} parentTemplate - The markup of the element
     * @return {VNode} The block's template
     */
    fluid.blockTemplateTree = function (parentTemplate) {
        return {...parentTemplate, isPlaceholder: true};
    };

    /**
     * Parse markup supplied as a view's template, recording any problems with it which would otherwise pass silently -
     * tags left unclosed or closed without being opened, which the parser repairs as best it can, and top-level nodes
     * beyond the first, which are not rendered since the root of a template is elided onto its container. These are
     * held as the member `warnings` of the parsed tree, as reported by diagnostic tools.
     * @param {String} markup - The template's markup
     * @return {VNode} The parsed template, a fragment, bearing `warnings` if any problems were found
     */
    fluid.parseTemplateMarkup = function (markup) {
        const warnings = [];
        const warn = (message, range) => warnings.push(range?.start === undefined ? message :
            `${message} - at character ${range.start}: ${JSON.stringify(markup.substring(range.start, range.start + 60))}`);
        const tree = fluid.parseHTMLToTree(markup, {fragment: true, skipWhitespace: true, warn});
        const roots = tree.children.filter(child => !child.isComment);
        if (roots.length > 1) {
            warnings.push(`The template has ${roots.length} top-level nodes, but only the first is rendered - wrap them `
                + "in a single element");
        }
        if (warnings.length > 0) {
            tree.warnings = warnings;
        }
        return tree;
    };

    /**
     * Mark every node of a parsed tree as verbatim, so that it is not scanned for bindings by `fluid.activateTemplate`
     * @param {VNode} vnode - The root of the tree
     * @return {VNode} The same tree
     */
    fluid.markVerbatim = function (vnode) {
        vnode.verbatim = true;
        if (vnode.children) {
            vnode.children.forEach(fluid.markVerbatim);
        }
        return vnode;
    };

    /**
     * Parse markup to be rendered verbatim, e.g. HTML produced by a content pipeline. All of its top-level nodes are
     * held by a single root, which is elided onto the view's container, so that they are rendered within it. Whitespace
     * is kept, and no node is scanned for bindings - see `fluid.activateTemplate`.
     * @param {String} markup - The markup to be rendered
     * @return {VNode} The parsed tree, a fragment
     */
    fluid.parseVerbatimMarkup = function (markup) {
        const parsed = fluid.parseHTMLToTree(markup, {fragment: true, skipWhitespace: false});
        const root = fluid.markVerbatim({tag: "verbatim", attrs: {}, children: parsed.children});
        return {tag: "fragment", children: [root]};
    };

    /**
     * Resolve the template held by a view to its parsed tree
     * @param {String|Object} template - The view's template - either markup, or a reference `{sfcLayer}` to the template
     * of the named Single File Component layer, held in the template store
     * @param {Boolean} [verbatim] - If `true`, markup is parsed by `fluid.parseVerbatimMarkup` rather than as a template
     * @return {VNode|Unavailable} The parsed template, or an unavailable value if the template is neither of these
     */
    fluid.templateToTree = function (template, verbatim) {
        let togo;
        if (typeof(template) === "string" && verbatim) {
            togo = fluid.parseVerbatimMarkup(template);
        } else if (typeof(template) === "string") {
            togo = fluid.parseTemplateMarkup(template);
        } else if (fluid.isPlainObject(template, true) && typeof(template.sfcLayer) === "string") {
            togo = fluid.fetchParsedTemplate(template.sfcLayer);
        } else {
            const described = template === undefined ? "undefined" : JSON.stringify(template)?.substring(0, 100) ?? String(template);
            togo = fluid.unavailable({
                message: "The template of a view must be markup held as a String, or a reference {sfcLayer} to the "
                    + `template of a Single File Component, but it was ${described} - if it is computed, check that the `
                    + "function computing it returns its markup",
                variety: "error"
            });
        }
        return togo;
    };

    // Tag layer applied by fluid.sfcToInjRecs to every layer which was loaded from a Single File Component, allowing
    // its MIME type to be determined by fluid.layerMimeType
    fluid.def("fluid.sfcLayer", {
        $variety: "framework"
    });

    // Tag layer applied by fluid.sfcToInjRecs to the view of a layer loaded from a Single File Component with a template
    fluid.def("fluid.sfcTemplateViewComponent", {
        $layers: "fluid.templateViewComponent",
        $variety: "framework"
    });

    // A view which composites the partial templates of its parent's layers onto the template supplied by another of
    // its layers, at the relative containers they configure
    fluid.def("fluid.partialViewComponent", {
        $layers: "fluid.viewComponent",
        relativeContainer: fluid.unavailable({cause: "Relative container not configured", variety: "config"}),
        $variety: "framework"
    });

    fluid.renderSourceUrl = sourceUrl => ` written in <a class="fl-source-link" href="{sourceUrl}">${sourceUrl.split("/").pop()}</a>`;

    fluid.renderFullSite = site => {
        const path = site ? ` at <a href="#" class="fl-path-link">${fluid.renderSite(site)}</a>` : "";
        const layer = site && fluid.layerForSite(site);
        const layerText = layer ? ` in layer ${layer}` : "";
        const sourceUrl = layer && fluid.importMap[layer]?.url;
        const urlText = sourceUrl ? fluid.renderSourceUrl(sourceUrl) : "";
        return path + layerText + urlText;
    };

    fluid.renderOneCause = cause => {
        const siteText = Array.isArray(cause.site) ? cause.site.map(fluid.renderFullSite).join("<br/>") :
            fluid.renderFullSite(cause.site);
        return `<li>${cause.message}${siteText}</li>`;
    };

    fluid.renderError = function (container, unavailable) {
        // An unavailable value with a single cause holds it directly
        const errors = (unavailable.causes || [unavailable]).map(fluid.renderOneCause).join("\n");
        const markup = `<ul class="fl-error">${errors}</ul>`;
        // OK to flash this in since it will be replaced when proper rendering happens and has no browser state
        container.innerHTML = markup;
        // The report is the rendering's own, and so is reconciled away by the next one - see fluid.assignChildNodes
        container.childNodes.forEach(node => node.flOwned = true);
    };

    /**
     * @typedef {Object} RenderErrorReport
     * @property {Shadow} shadow - The shadow of the component which failed to render
     * @property {Element} container - The element where the failed material would have been rendered
     * @property {Unavailable} unavailable - Why it failed
     */

    /**
     * Render an error report in place, as the default policy of an error boundary
     * @param {RenderErrorReport} report - The report of the error
     */
    fluid.renderErrorReport = function (report) {
        fluid.renderError(report.container, report.unavailable);
    };

    // A component which takes responsibility for the presentation of errors in rendering the components within its
    // scope, e.g. a host which reports them alongside the widgets it hosts. Its policy is its `reportError` method,
    // which accepts a {RenderErrorReport} - by default the error is rendered in place, as it is where there is no
    // boundary. It is found by ordinary context resolution as {errorBoundary}, and so is not a "framework" layer, whose
    // names are not entered into scope.
    fluid.def("fluid.errorBoundary", {
        $layers: "fluid.component",
        reportError: "$method:fluid.renderErrorReport({0})",
        $variety: "frameworkAux"
    });

    /**
     * Find the error boundary responsible for the errors of a component - the component resolved as {errorBoundary}
     * from its parent, if it is available. Resolution starts from the parent since a boundary which has failed cannot be
     * responsible for its own errors.
     * @param {Shadow} shadow - The shadow of the component
     * @return {fluid.component|null} The error boundary, or `null` if there is none or it is not available
     */
    fluid.findErrorBoundary = function (shadow) {
        // As for fluid.resolveContext, but yielding the boundary's shadow rather than the signal of its instance
        const boundaryShadow = shadow.parentShadow?.ownScope.errorBoundary?.value;
        return boundaryShadow && !fluid.isUnavailable(boundaryShadow.availableInstance.get()) ?
            fluid.proxyMat(boundaryShadow.computer, boundaryShadow, []) : null;
    };

    /**
     * Report an error in rendering a component to its error boundary, or render it in place if it has none
     * @param {RenderErrorReport} report - The report of the error
     */
    fluid.reportRenderError = function (report) {
        // Finding the boundary reads the availability of ancestors, which must not become dependencies of the caller
        const boundary = fluid.cell.untracked(() => fluid.findErrorBoundary(report.shadow));
        if (boundary) {
            boundary.reportError(report);
        } else {
            fluid.renderErrorReport(report);
        }
    };

    /**
     * Find the container supplied to the view of a component through its potentia, e.g. by a host constructing it,
     * which can be found even when the component has failed to merge
     * @param {Shadow} shadow - The shadow of the component
     * @return {Element|null} The container, or `null` if none was supplied
     */
    fluid.potentiaContainer = function (shadow) {
        const mergeRecords = shadow.potentia._value.mergeRecords;
        return mergeRecords.reduce((acc, record) => record.layer?.view?.$component?.container || record.layer?.container || acc, null);
    };

    fluid.possiblyRenderError = function (shadow) {
        const that = shadow.that;
        const unavailableLayers = Object.values(shadow.unavailableLayerMap._value);
        if (unavailableLayers.length > 0) {
            // A component whose layers failed has no view of its own to render into, but may have been supplied a
            // container for one - e.g. one hosting a widget whose layer was rejected
            const container = fluid.potentiaContainer(shadow);
            const unavailable = fluid.mergeUnavailables(unavailableLayers);
            if (container && fluid.isErrorUnavailable(unavailable)) {
                fluid.reportRenderError({shadow, container, unavailable});
            }
        } else if (that?.$layers.includes("fluid.viewComponent")) {
            const vTree = fluid.deSignal(that.vTree);
            if (fluid.isErrorUnavailable(vTree)) {
                fluid.reportRenderError({shadow, container: fluid.deSignal(that.container), unavailable: vTree});
            }
        }
    };

    // The view of a fluid.componentList, which renders the views of the list's members in sequence. This is supplied
    // by fluid.activateTemplate in place of fluid.viewComponent when a template designates a component list
    fluid.def("fluid.listViewComponent", {
        $layers: "fluid.viewComponent",
        elideParent: false,
        // Note that this is activateTemplate in a regular view
        vTree: "$compute:fluid.listViewTree({$parent}, {$parent}.list)",
        $variety: "framework"
    });

    // Marks a layer as suitable to be instantiated as a top-level widget, e.g. by a host such as a canvas offering a
    // menu of widgets - nothing in a layer's own definition otherwise betrays this. Holds placeholders for material a
    // widget may optionally advertise to its host, and receives from its view whatever the host reports of it.
    fluid.def("fluid.topLevelWidget", {
        $layers: "fluid.component",
        // The size, as {w, h}, at which the widget would like to be hosted - null if it has no preference
        preferredSize: null,
        // The bounds, as {x, y, w, h}, at which the widget is currently hosted, as reported by its view - or, for a
        // widget nested within another of which its host reports nothing, e.g. one held as a subcomponent of an
        // umbrella widget which renders it into its own template, those of the nearest enclosing top-level widget
        hostBounds: "$compute:fluid.chooseHostBounds({self}.view.hostBounds, {self}.enclosingHostBounds)",
        enclosingHostBounds: {
            $bindable: {
                bind: "fluid.bindEnclosingHostBounds({self})"
            }
        },
        view: {
            $component: {
                $layers: "fluid.topLevelWidgetView"
            }
        },
        $variety: "framework"
    });

    /**
     * Choose the bounds at which a top-level widget is hosted
     * @param {ShapeBounds|null} own - The bounds reported for the widget by its view, or `null` if none are reported
     * @param {ShapeBounds|null} enclosing - The bounds of the nearest enclosing top-level widget, or `null` if there is none
     * @return {ShapeBounds|null} The bounds at which the widget is hosted
     */
    fluid.chooseHostBounds = (own, enclosing) => own || enclosing;

    /**
     * Find the bounds at which the nearest top-level widget enclosing a top-level widget is hosted
     * @param {fluid.component} self - The top-level widget
     * @return {Signal<ShapeBounds|null>|null} A signal for the bounds of the nearest enclosing top-level widget, or
     * `null` if there is none
     */
    fluid.bindEnclosingHostBounds = function (self) {
        let shadow = self[fluid.proxySymbol].shadow.parentShadow;
        while (shadow && !(shadow.that && fluid.hasLayer(shadow.that, "fluid.topLevelWidget"))) {
            shadow = shadow.parentShadow;
        }
        return shadow ? fluid.getForComponent(shadow, "hostBounds") : null;
    };

    // Applied to the view of every top-level widget, this is the attachment point for any machinery supplied by a host,
    // typically broadcast onto it by a $linkage with this layer as its input
    fluid.def("fluid.topLevelWidgetView", {
        // The bounds of the widget as hosted - null if its host does not report any, as it should not for a widget
        // which it does not itself host, e.g. one nested within another
        hostBounds: null,
        $variety: "framework"
    });

    /**
     * Determine whether a tag is that of the synthetic root of a parsed template - the fragment holding the top-level
     * nodes of a template, or the <template> block of an SFC - which is not itself rendered as an element
     * @param {String} tag - The tag
     * @return {Boolean} `true` if it is the tag of a template's root
     */
    fluid.isTemplateRootTag = tag => tag === "fragment" || tag === "template" || tag === fluid.fragmentSlotTag;

    /**
     * Compute the vTree for a list of view components by concatenating the vTrees rendered by their views
     * @param {ComponentComputer} self - The component list
     * @param {Signal<ComponentComputer[]>} list - The list of view components
     * @return {Signal<VNode>} A signal for a VNode holding the list members' vTrees as its children
     */
    fluid.listViewTree = function (self, list) {
        return fluid.cell(undefined, {name: "fluid.listViewTree"}).computed(componentList => {
            const unwrappedList = componentList.map(e => fluid.deSignal(e[fluid.unavailableSymbol]));
            const unavailable = fluid.mergeUnavailables(unwrappedList);

            if (unavailable) {
                return unavailable;
            } else {
                const {
                    designalArgs: childTrees,
                    unavailable: treesUnavailable
                } = fluid.processSignalArgs(componentList.map(component => component.view.vTree));
                // A member whose view does not elide its template's root renders the root's children - e.g. several
                // top-level nodes of a template, or the contents of an SFC's <template> - which are spliced in its place.
                // Each is keyed by its member, so that its node follows the member however the list changes - the list's
                // path qualifies the key, since a list in a <fluid-fragment> slot is spliced amongst other children
                const listPath = self[$m].path;
                const keyed = (childTree, component) => {
                    const memberKey = `${listPath}[${component[$m].memberName}]`;
                    const vnodes = fluid.isTemplateRootTag(childTree.tag) ? childTree.children : [childTree];
                    return vnodes.map((vnode, i) => typeof(vnode) === "string" ? vnode : Object.assign(vnode, {listKey: `${memberKey}#${i}`}));
                };
                return treesUnavailable || {
                    tag: "template",
                    children: childTrees.flatMap((childTree, i) => keyed(childTree, componentList[i])),
                    _id: vnode_id++
                };
            }
        }, [list], {mapArg: fluid.deproxyAndDesignal});
    };

    /**
     * Fetch a module map named by the `modules` attribute of a `<fluid-module>` - see `fluid.module.registerMap`. A map
     * which cannot be fetched is taken to be empty, with a warning, e.g. when copyOut.js boots a page before writing
     * its map for the first time, and locates its modules for itself.
     * @param {String} mapUrl - The absolute URL of the map
     * @return {Cell<Object<String, String>>} A cell holding the map, pending whilst it is fetched
     */
    fluid.fetchModuleMap = function (mapUrl) {
        const load = async function () {
            let togo = {};
            try {
                const response = await fetch(mapUrl);
                if (response.ok) {
                    togo = await response.json();
                } else {
                    fluid.log(fluid.logLevel.WARN, "Module map " + mapUrl + " could not be fetched - status " + response.status);
                }
            } catch (err) {
                fluid.log(fluid.logLevel.WARN, "Module map " + mapUrl + " could not be fetched - " + err);
            }
            return togo;
        };
        return fluid.cell(fluid.unavailable({message: `Pending I/O for module map ${mapUrl}`, variety: "pending"}),
            {name: `fluid.fetchModuleMap for URL ${mapUrl}`}).computed(load, []);
    };

    /**
     * Creates an effect that automatically instantiates self-booting Fluid components for elements
     * in the document that have the `fluid-layers` attribute.
     *
     * This function performs a live query for all elements with the `fluid-layers` attribute.
     * For each such element, if it is not already registered in the `viewContainerRegistry`,
     * it splits the attribute value into layer names, instantiates a new component with those layers,
     * and registers the component's shadow in the registry.
     *
     * @param {Document} dokkument - The document in which to search for self-booting components.
     * @return {Effect} An effect that manages the instantiation and registration of self-booting components.
     */
    fluid.makeSelfBootEffect = function (dokkument) {
        // Many thanks to Hugo Daniel https://hugodaniel.com/pages/boredom/ for inspiration for this concept
        const selfBootQuery = fluid.liveQuerySelectorAll("*[fluid-layers]", dokkument, dokkument);
        return fluid.cell.effect( () => {
            const elements = selfBootQuery.get();
            elements.forEach(element => {
                const existing = fluid.viewContainerRegistry.get(element);
                if (!existing) {
                    const layers = element.getAttribute("fluid-layers").split(" ").map(layer => layer.trim());
                    const [firstLayer, ...restLayers] = layers;
                    const instance = fluid.initFreeComponent(firstLayer, {
                        $layers: restLayers,
                        view: {
                            $component: {
                                container: element
                            }
                        }
                    });
                    // Put this in early in case instantiation fails - TODO standardise access to shadow
                    fluid.viewContainerRegistry.set(element, instance[$t].shadow);
                }
            });
        }, null, {name: `fluid.selfBootEffect for document at ${dokkument.location}`});
    };

    /**
     * Boots the Infusion framework for a given document by acquiring modules and import maps,
     * and initializing self-booting components.
     *
     * This function performs the following steps:
     * - On document load, it acquires all `<fluid-module>` elements and registers them, together with the modules
     *   located by any of their module maps, which are first fetched.
     * - It processes all `<fluid-import>` elements to build the import map and initiate SFC loading.
     * - It returns an effect that tracks and instantiates self-booting components found in the document.
     *
     * @param {Document} dokkument - The document to boot the Fluid framework within.
     * @return {Effect} An effect that manages self-booting component instantiation.
     */
    fluid.bootDocument = function (dokkument) {
        fluid.applyOnLoad(() => {
            const modules = fluid.acquireModules(dokkument, dokkument.documentElement);
            const mapUrls = Object.values(modules).map(rec => rec.mapUrl).filter(mapUrl => mapUrl);
            if (mapUrls.length === 0) {
                fluid.docToImportMap(dokkument, dokkument.documentElement);
            } else {
                // The document's imports may refer to modules located by the maps, which are first loaded
                let acquired = false;
                fluid.cell.effect((...maps) => {
                    if (!acquired) {
                        acquired = true;
                        maps.forEach((map, i) => fluid.module.registerMap(mapUrls[i], map));
                        fluid.docToImportMap(dokkument, dokkument.documentElement);
                    }
                }, mapUrls.map(fluid.fetchModuleMap), {name: `Module maps for document at ${dokkument.location}`});
            }
        });
        const effect = fluid.makeSelfBootEffect(dokkument);
        fluid.cell.stabilize();
        return effect;
    };

};

if (typeof(fluid) !== "undefined") {
    fluidViewScope(fluid);
}
