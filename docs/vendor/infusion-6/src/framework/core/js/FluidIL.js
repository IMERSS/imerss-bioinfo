"use strict";

const $fluidILScope = function (fluid) {

    const $m = fluid.metadataSymbol;
    const $t = fluid.proxySymbol;
    const $u = fluid.unavailableSymbol;

    // A function to tag the types of all Fluid components
    fluid.componentConstructor = function () {};

    fluid.shadow = function () {};

    // Define the `name` property to be `"fluid.componentConstructor"` as a means to inspect if an Object is actually
    // an Infusion component instance; while being agnostic of the Infusion codebase being present. For example this
    // technique is used in the jquery.keyboard-a11y plugin for `fluid.thatistBridge`.
    Object.defineProperty(fluid.componentConstructor, "name", {
        value: "fluid.componentConstructor"
    });

    fluid.isComponent = function (obj) {
        return obj && obj.constructor === fluid.componentConstructor;
    };

    fluid.isShadow = function (obj) {
        return obj && obj.constructor === fluid.shadow;
    };

    fluid.freshComponent = function (props, shadow) {
        const instance = Object.create(fluid.componentConstructor.prototype);
        fluid.each(props, (value, key) => {
            instance[key] = value;
        });
        if (!instance.$id) {
            const id = fluid.allocateGuid();
            instance.$id = id;
        }

        shadow = shadow || Object.create(fluid.shadow.prototype);
        shadow.unavailableLayerMap = shadow.unavailableLayerMap || fluid.cell(Object.create(null),
            {name: "unavailableLayerMap for bare component"});
        shadow.that = instance;
        instance[$m] = shadow;
        return instance;
    };

    fluid.dumpLayerNames = function (that) {
        return " layerNames: " + JSON.stringify(that.$layers);
    };

    fluid.dumpThat = function (that) {
        return `{ id: ${that.$id} ${fluid.dumpLayerNames(that)}`;
    };

    fluid.dumpThatStack = function (thatStack) {
        const togo = fluid.transform(thatStack, function (that) {
            const path = that[$m].path;
            return fluid.dumpThat(that) + (path ? (" - path: " + path) : "");
        });
        return togo.join("\n");
    };

    fluid.dumpComponentPath = function (that) {
        const path = that[$m].path;
        return path || "** no path registered for component **";
    };

    fluid.dumpComponentAndPath = function (that) {
        return "component " + fluid.dumpThat(that) + " at path " + fluid.dumpComponentPath(that);
    };

    // A variant of fluid.visitComponentChildren that supplies the signature expected for fluid.matchILSelector
    // this is: thatStack, contextHashes, memberNames, i - note, the supplied arrays are NOT writeable and shared through the iteration
    fluid.visitComponentsForMatching = function (shadow, options, visitor) {
        options = Object.assign({visited: {}}, options);
        const shadowStack = [shadow];
        // eslint-disable-next-line no-unused-vars
        const scopeTick = shadow.scopeTick.get(); // Read the scope tick to cause a dependency
        const scopes = [shadow.ownScope];
        const visitorWrapper = function (thisShadow, xName, segs) {
            shadowStack.length = 1;
            scopes.length = 1;
            for (let i = 0; i < segs.length; ++i) {
                const childShadow = shadowStack[i].childComponents[segs[i]];
                shadowStack[i + 1] = childShadow;
                // Read the scope tick to cause a dependency - one route here is from fluid.fetchContextReference which is inside
                // its computed block, creating a live collection/referencee
                // eslint-disable-next-line no-unused-vars
                const scopeTick = childShadow.scopeTick.get();
                scopes[i + 1] = childShadow.ownScope;
            }
            return visitor(thisShadow, shadowStack, scopes, segs, segs.length);
        };
        fluid.visitComponentChildren(shadow, visitorWrapper, options, []);
    };

    /**
     * Visit the child components of a given component, applying a visitor function to each.
     *
     * @param {Shadow} shadow - The parent component whose children are to be visited.
     * @param {Function} visitor - A function to be called for each child component.
     *     The function is invoked with the following arguments:
     *     - `component` (Object): The current child component being visited.
     *     - `name` (String): The name of the current child component.
     *     - `segs` (String[]): The array of segment names leading to the current child.
     *     - `depth` (Number): The depth of the current child in the traversal.
     * @param {Object} options - Options to control the traversal:
     *     - `visited` (Object): A map of already visited component IDs to avoid cycles.
     *     - `flat` (Boolean): If `true`, prevents recursive traversal into child components.
     * @param {String[]} [segs=[]] - The path segments leading to the current component, used internally for recursion.
     * @return {Boolean|undefined} Returns `true` if the traversal was terminated early by the visitor function, otherwise `undefined`.
     */
    fluid.visitComponentChildren = function (shadow, visitor, options, segs = []) {
        for (const name in shadow.childComponents) {
            const childShadow = shadow.childComponents[name];
            if (!childShadow.that) {
                continue;
            }
            if (options.visited[childShadow.that.$id]) {
                continue;
            }
            // Inert components, e.g. avatars, are not visited by traversals which begin outside them
            if (childShadow.inert && !shadow.inert) {
                continue;
            }            segs.push(name);
            // recall that this is here because we may run into a component that has been cross-injected which might otherwise cause cyclicity
            options.visited[childShadow.that.$id] = true;

            visitor(childShadow, name, segs, segs.length - 1);

            if (!options.flat) {
                fluid.visitComponentChildren(childShadow, visitor, options, segs);
            }
            segs.pop();
        }
    };

    /** Query for all components matching a selector in a particular tree
     * @param {Component} root - The root component at which to start the search
     * @param {String} selector - An IoCSS selector, in form of a string. Note that since selectors supplied to this function implicitly
     * match downwards, they do not contain the "head context" followed by whitespace required in the distributeOptions form. E.g.
     * simply <code>"fluid.viewComponent"</code> will match all component views below the root.
     * @param {Boolean} [flat] - <code>true</code> if the search should just be performed at top level of the component tree
     * Note that with <code>flat=false</code> this search will scan every component below the root and may well be very slow.
     * @return {Array<Component|Unavailable>} An array holding all components matching the selector, together with the
     * unavailable value of each unavailable component traversed, whether or not it matches - its layers may not yet be
     * known, so it can't be matched. Such a value's `message` says why the component is unavailable, e.g. that one of its
     * layers is not defined - test for it with `fluid.isUnavailable`, or use `fluid.liveQueryILSelector`, which merges
     * them into a single unavailable result. Reading any other member of one outside a computation is an error reporting
     * why - see fluid.unavailableComponentProxy
     */
    fluid.queryILSelector = function (root, selector, flat = false) {
        const parsed = fluid.parseSelector(selector, fluid.ILSSMatcher);
        const togo = [];

        fluid.visitComponentsForMatching(root[$m], {flat: flat}, function (shadow, shadowStack, scopes) {
            // A simple component, e.g. the root's child resolveRootComponent, has no availableInstance and is always
            // available
            const thisUnavailable = shadow.availableInstance ? shadow.availableInstance.get() : shadow.that;
            if (fluid.isUnavailable(thisUnavailable)) {
                togo.push(fluid.unavailableComponentProxy(shadow, thisUnavailable));
            } else if (fluid.matchILSelector(parsed, shadowStack, scopes, 1)) {
                togo.push(fluid.proxyMat(shadow.computer, shadow, []));
            }
        });
        return togo;
    };

    // USER-FACING METHOD
    /** Query for all components matching a selector in a particular tree, returning a live computed collection
     * @param {Component} root - The root component at which to start the search
     * @param {String} selector - An IoCSS selector, in form of a string. Note that since selectors supplied to this function implicitly
     * match downwards, they do not contain the "head context" followed by whitespace required in the distributeOptions form. E.g.
     * simply <code>"fluid.viewComponent"</code> will match all component views below the root.
     * @param {Boolean} [flat] - <code>true</code> if the search should just be performed at top level of the component tree
     * Note that with <code>flat=false</code> this search will scan every component below the root and may well be very slow.
     * @return {Cell<Unavailable|Component[]>} An array holding all components matching the selector, or an unavailable value if any
     * unavailable components were traversed
     */
    fluid.liveQueryILSelector = function (root, selector, flat = false) {
        const shadow = root[$m];
        const key = selector + (flat ? "!" : "");
        const existing = shadow.queryILMap[key];
        if (existing) {
            return existing;
        } else {
            let previous = null;
            return shadow.queryILMap[key] = fluid.cell(undefined, {name: `liveQueryILSelector for ${selector}`}).computed(() => {
                const results = fluid.queryILSelector(root, selector, flat);
                const unavailableComponents = fluid.mergeUnavailables(results.map(fluid.deproxyUnavailable));
                if (unavailableComponents) {
                    return unavailableComponents;
                } else {
                    // The query is reevaluated whenever any component beneath the root turns over - only deliver a
                    // fresh list if the matched components have changed. Root proxies keep their identity across turnover.
                    previous = previous !== null && fluid.arrayEqual(previous, results) ? previous : results;
                    return previous;
                }
            });
        }
    };

    // USER-FACING METHOD

    /**
     * Converts a context reference to a promise using the root shadow and cell signal.
     * @param {String} contextRef - The context reference to fetch
     * @param {Component} root - The component reference from which the context reference is to be resolved
     * @return {Promise} A promise that resolves with the first settled signal value
     */
    fluid.contextRefToPromise = function (contextRef, root) {
        const shadow = root[$t].shadow;
        const ref = fluid.fetchContextReference(contextRef, shadow);
        return fluid.cell.waitFor(fluid.deSignalToSite(ref));
    };

    // TODO: This implementation is obviously poor and has numerous flaws - in particular it does no backtracking as well as matching backwards through the selector
    /** Match a parsed IL selector against a selection of data structures representing a component's tree context.
     * @param {ParsedSelector} selector - A parsed selector structure as returned from `fluid.parseSelector`.
     * @param {Shadow[]} shadowStack - An array of components ascending up the tree from the component being matched,
     * which will be held in the last position.
     * @param {Object[]} scopes - An array of own scope records as cached in the component's shadows
     * @param {Number} i - One plus the index of the IoCSS head component within `thatStack` - all components before this
     * index will be ignored for matching. Will have value `1` in the queryIoCSelector route.
     * @return {Boolean} `true` if the selector matches the leaf component at the end of `thatStack`
     */
    fluid.matchILSelector = function (selector, shadowStack, scopes, i) {
        let thatpos = shadowStack.length - 1;
        let selpos = selector.length - 1;
        while (true) {
            const isChild = selector[selpos].child;
            const mustMatchHere = thatpos === shadowStack.length - 1 || isChild;

            const that = shadowStack[thatpos];
            const selel = selector[selpos];
            let match = true;
            for (let j = 0; j < selel.predList.length; ++j) {
                const pred = selel.predList[j];
                const context = pred.context;
                if (context && context !== "*" && !(Object.prototype.hasOwnProperty.call(scopes[thatpos], context))) {
                    match = false;
                    break;
                }
                if (pred.id && that.id !== pred.id) {
                    match = false;
                    break;
                }
            }
            if (selpos === 0 && thatpos > i && mustMatchHere && isChild) {
                match = false; // child selector must exhaust stack completely - FLUID-5029
            }
            if (match) {
                if (selpos === 0) {
                    return true;
                }
                --thatpos;
                --selpos;
            }
            else {
                if (mustMatchHere) {
                    return false;
                }
                else {
                    --thatpos;
                }
            }
            if (thatpos < i) {
                return false;
            }
        }
        return false;
    };

    // SCOPES

    // Priorities corresponding to reason for context name to be in scope within contextHash and scope
    fluid.contextName = 1;
    fluid.memberName = 2; // higher priority

    /**
     * @typedef {Object} ScopeRecord
     * A record mapping string keys to scope entries, each holding a Shadow value and its associated priority.
     * @property {Shadow} value - The component shadow associated with this key.
     * @property {Integer} priority - The priority bitmask indicating how the key was applied (e.g., contextName, memberName).
     */

    /**
     * Converts an array of layer names into a hash object where each name and its nickname are mapped to a context type.
     * @param {Object<String, ScopeRecord>} targetScope - The scope to be destructively updated from the supplied layer names and shadow
     * @param {String[]} layerNames - An array of layer names to be processed.
     * @param {Shadow} shadow - The shadow to be placed into scope
     * @return {Object<String, ScopeRecord>} The updated scope object where:
     *   - Each full layer name is a key, mapped to the number `fluid.contextName`.
     *   - Each nickname of a valid layer name (computed using `fluid.computeNickName`) is also a key, mapped to the number `fluid.contextName`.
     *   - Names that are references or expanders are ignored.
     */
    fluid.layerNamesToScope = function (targetScope, layerNames, shadow) {
        fluid.clear(targetScope);
        const {contextNames, resolveRoot} = fluid.layerScopeNames(layerNames);
        if (contextNames.length > 0) {
            // A single record serves for all of the names - records in a scope are replaced, never modified
            const rec = {value: shadow, priority: fluid.contextName};
            contextNames.forEach(contextName => targetScope[contextName] = rec);
        }
        if (resolveRoot) {
            shadow.resolveRoot = true;
        }
        return targetScope;
    };

    // The context names of resolved lists of layer names, as found by fluid.layerScopeNames
    /** @type {WeakMap<String[], LayerScopeNames>} */
    fluid.layerScopeNamesCache = new WeakMap();

    /**
     * @typedef {Object} LayerScopeNames
     * @property {String[]} contextNames - The context names under which a component with the layers is placed in scope
     * @property {Boolean} resolveRoot - `true` if one of the layers is `fluid.resolveRoot`
     */

    /**
     * Determine the context names contributed by a list of layer names - each name of a layer which is not of the
     * framework's variety, together with its nickname. A component's resolved `$layers` member is the same array for
     * every component resolving the same chain of the same definitions - see `fluid.definitionMergeRecords` - and so
     * these are found once for each such chain.
     * @param {String[]} layerNames - The layer names
     * @return {LayerScopeNames} The context names, and whether the layers include `fluid.resolveRoot`
     */
    fluid.layerScopeNames = function (layerNames) {
        let togo = Array.isArray(layerNames) ? fluid.layerScopeNamesCache.get(layerNames) : undefined;
        if (!togo) {
            togo = {contextNames: [], resolveRoot: false};
            fluid.each(layerNames, function (layerName) {
                if (!fluid.isReferenceOrExpander(layerName)) {
                    const def = fluid.readLayer(layerName)._value.raw;
                    if (def && def.$variety !== "framework") {
                        togo.contextNames.push(layerName, fluid.computeNickName(layerName));
                    }
                    if (layerName === "fluid.resolveRoot") {
                        togo.resolveRoot = true;
                    }
                }
            });
            if (Array.isArray(layerNames)) {
                fluid.layerScopeNamesCache.set(layerNames, togo);
            }
        }
        return togo;
    };

    /**
     * Applies a shadow record to a scope under a given key, respecting the precedence of disposition flags.
     * The scope stores a record for each key with the shape `{value, priority}`.
     * A new value is assigned only if any existing priority is lower than the supplied one
     *
     * @param {Object<String, ScopeRecord>} scope - The scope to update.
     * @param {String} key - The name under which the shadow will be stored.
     * @param {Shadow} shadow - The shadow record to assign.
     * @param {Integer} priority - A bitmask indicating the strength of the claim (i.e. member > context).
     */
    fluid.applyToScope = function (scope, key, shadow, priority) {
        const existing = scope[key];
        if (!existing || (priority === fluid.memberName)) {
            // TODO: Actually chain a linked list here
            scope[key] = {value: shadow, priority};
        }
    };

    fluid.cacheLayerScopes = function (parentShadow, shadow) {
        const rootComponent = shadow.instantiator.rootComponent;
        shadow.childrenScope = Object.create(parentShadow ? parentShadow.ownScope : null);
        shadow.childrenScope[$m] = "childrenScope-" + shadow.path;
        shadow.ownScope = Object.create(shadow.childrenScope);
        shadow.ownScope[$m] = "ownScope-" + shadow.path;
        shadow.ownScopeTick = fluid.cell(0, {name: "ownScopeTick for component at " + shadow.path});
        shadow.scopeTick = parentShadow ? fluid.cell(0, {name: "scopeTick for component at " + shadow.path}).
            computed( (ownScopeTick, parentScopeTick) => ownScopeTick + parentScopeTick, [shadow.ownScopeTick, parentShadow.ownScopeTick]) : shadow.ownScopeTick;

        return fluid.cell.effect(function scopeEffect() {
            const childOfRoot = !shadow.parentShadow || shadow.parentShadow.that === rootComponent;
            const layers = shadow.computer?.get()?.$layers || [];
            fluid.layerNamesToScope(shadow.ownScope, layers, shadow);

            // This is filtered out again in recordComponent
            if (typeof(shadow.memberName) === "string" && !childOfRoot) {
                fluid.applyToScope(shadow.ownScope, shadow.memberName, shadow, fluid.memberName);
            }
            const ownScope = Object.getOwnPropertyNames(shadow.ownScope);
            const applyToParent = shadow.parentShadow && !childOfRoot;
            // Withdraw any contexts which we applied previously but no longer hold, e.g. once our potentia is emptied
            // on destruction, so that they do not continue to resolve to us
            const withdrawn = (shadow.appliedContexts || []).filter(context => !ownScope.includes(context));
            if (applyToParent) {
                withdrawn.forEach(context => fluid.withdrawFromScope(shadow.parentShadow.childrenScope, context, shadow));
            }
            fluid.withdrawFromScopes(shadow, withdrawn);
            shadow.appliedContexts = ownScope;
            ownScope.forEach(context => {
                const rec = shadow.ownScope[context];
                if (applyToParent) {
                    fluid.applyToScope(shadow.parentShadow.childrenScope, context, rec.value, rec.priority);
                }
                // An inert component, e.g. the avatar of a fluid.resolveRoot layer, must not displace live ones at root
                if (shadow.resolveRoot && !shadow.inert) {
                    fluid.applyToScope(rootComponent[$m].childrenScope, context, rec.value, rec.priority);
                    rootComponent[$m].ownScopeTick.set(rootComponent[$m].ownScopeTick._value + 1);
                }
            });
            if (applyToParent) {
                // The parent's own scope has changed via its childrenScope - any context already resolved at the parent,
                // e.g. a reference to this component from a sibling member, may need to be reevaluated
                const parentTick = shadow.parentShadow.ownScopeTick;
                parentTick.set(parentTick._value + 1);
            }
            shadow.ownScopeTick.set(shadow.ownScopeTick._value + 1);
        }, [], {name: `scopeEffect for path "${shadow.path}"`, shadow});
    };

    /**
     * Remove any entry for a context from a scope which resolves to the supplied component
     * @param {Object<String, ScopeRecord>} scope - The scope from which the entry is to be removed
     * @param {String} context - The context name of the entry
     * @param {Shadow} shadow - The shadow of the component whose entry is to be removed
     * @return {Boolean} `true` if an entry was removed
     */
    fluid.withdrawFromScope = function (scope, context, shadow) {
        const holds = Object.prototype.hasOwnProperty.call(scope, context) && scope[context].value === shadow;
        if (holds) {
            delete scope[context]; // TODO: ambiguous resolution, and should just clear flags resulting from context
        }
        return holds;
    };

    /**
     * Remove the entries for the supplied contexts which a component with `fluid.resolveRoot` placed into the root
     * scope, which are otherwise not removed when it is cleared from its parent's scope, since the root is not its parent
     * @param {Shadow} shadow - The shadow of the component whose entries are to be removed
     * @param {String[]} contexts - The context names of the entries
     */
    fluid.withdrawFromScopes = function (shadow, contexts) {
        if (shadow.resolveRoot && contexts.length > 0) {
            const rootShadow = shadow.instantiator.rootComponent[$m];
            const removed = contexts.filter(context => fluid.withdrawFromScope(rootShadow.childrenScope, context, shadow));
            if (removed.length > 0) {
                rootShadow.ownScopeTick.set(rootShadow.ownScopeTick._value + 1);
            }
        }
    };

    /**
     * Remove any entries placing a child component into the scope of its parent's children, and into the root scope
     * if it has `fluid.resolveRoot`
     * @param {Shadow} parentShadow - The shadow of the parent from whose childrenScope entries are to be removed
     * @param {Shadow} childShadow - The shadow of the child whose entries are to be removed
     * @param {String} memberName - The member name at which the child is held in the parent, which may differ from its
     * own member name if it has been injected there
     */
    fluid.clearScope = function (parentShadow, childShadow, memberName) {
        // Its own scope may already have been emptied, but the contexts it applied are recorded
        const contexts = [...new Set([...Object.getOwnPropertyNames(childShadow.ownScope), ...childShadow.appliedContexts || [], memberName])];
        contexts.forEach(context => fluid.withdrawFromScope(parentShadow.childrenScope, context, childShadow));
        fluid.withdrawFromScopes(childShadow, contexts);
        childShadow.ownScopeTick.set(childShadow.ownScopeTick._value + 1);
        // Any context resolved at the parent to the child, e.g. from a sibling member, needs to be reevaluated
        parentShadow.ownScopeTick.set(parentShadow.ownScopeTick._value + 1);
    };

    /**
     * Compute the context names under which an injected component will be placed into the scope of its new parent's
     * children - these are the same as it would have been placed under had it been created there, i.e. its layer names
     * and their nicknames together with the member name at which it is injected. Its member name at its original site
     * is omitted.
     * @param {Shadow} targetShadow - The shadow of the injected component
     * @param {String} memberName - The member name at which the component is injected
     * @return {String[]} The context names for the injected component
     */
    fluid.injectedScopeContexts = function (targetShadow, memberName) {
        const contexts = Object.getOwnPropertyNames(targetShadow.ownScope).filter(context =>
            !(context === targetShadow.memberName && targetShadow.ownScope[context].priority === fluid.memberName));
        return [...new Set([...contexts, memberName])];
    };

    /**
     * Withdraw the entries placing an injected component into the scope of its parent's children
     * @param {InjectionRecord} injection - The record of the injection whose scope entries are to be withdrawn
     */
    fluid.withdrawInjectedScope = function (injection) {
        const {parentShadow, targetShadow} = injection;
        injection.scopeContexts.forEach(context => {
            if (Object.prototype.hasOwnProperty.call(parentShadow.childrenScope, context) && parentShadow.childrenScope[context].value === targetShadow) {
                delete parentShadow.childrenScope[context];
            }
        });
        injection.scopeContexts = [];
    };

    /**
     * Place an injected component into the scope of its parent's children, under the contexts computed by
     * `fluid.injectedScopeContexts`, withdrawing any entries made previously for the same injection if these have changed
     * @param {InjectionRecord} injection - The record of the injection whose scope entries are to be applied
     */
    fluid.applyInjectedScope = function (injection) {
        const {parentShadow, targetShadow, memberName} = injection;
        const contexts = fluid.injectedScopeContexts(targetShadow, memberName);
        if (!fluid.arrayEqual(contexts, injection.scopeContexts)) {
            fluid.withdrawInjectedScope(injection);
            contexts.forEach(context => {
                const priority = context === memberName ? fluid.memberName : targetShadow.ownScope[context].priority;
                fluid.applyToScope(parentShadow.childrenScope, context, targetShadow, priority);
            });
            injection.scopeContexts = contexts;
            parentShadow.ownScopeTick.set(parentShadow.ownScopeTick._value + 1);
        }
    };

    // About the SHADOW
    // This holds a record of IL information for each instantiated component.
    // It is allocated at: fluid.computeInstance or fluid.freshComponent for a "simple component"
    // It is destroyed at: instantiator's "clearComponent"
    /**
     * @typedef {Object} Shadow
     * @property {fluid.component} that - The component for which this shadow is held - shorthand for {Shadow}.computer._value
     * @property {String} path - The principal allocated path (point of construction) of the component in the component tree.
     * @property {String} memberName - The name of the component within its parent.
     * @property {Shadow|null} parentShadow - The shadow record associated with the parent component.
     * @property {Object} potentia - The construction record for this component
     * @property {Number} instanceId - Successive integers associated with freshly allocated `that` as the component's reference turns over
     *
     * @property {Object<String, Shadow>} childComponents - A record of child components keyed by their member names.
     * @property {Object<String, ScopeRecord>} ownScope - Cached layer scopes for the component.
     * @property {Object<String, ScopeRecord>} childrenScope - Cached layer scopes for the component.
     * @property {Object} [injectedPaths] - A record of paths where this component has been injected, keyed by path.
     * @property {Object<String, InjectionRecord>} [injections] - Records of components injected into this component, keyed by member name
     * @property {Site|null} [lensedSite] - For a member of a component list, the site of the data item from which it is lensed
     * @property {String[]} [listKeys] - For a component list, the keys of the list elements most recently allocated
     *
     * @property {fluid.instantiator} instantiator - The instantiator which allocated this component/shadow
     * @property {Object} frameworkEffects - A possibly deep structure of effects allocated by the framework which
     * which need to be disposed when the component is destroyed. Any user effects are disposed as layers come and go.
     *
     * @property {Object} variablesLayer - Layer holding any iteration variables applied through $for, merged just below the liveLayer
     * @property {Object} liveLayer - The live layer associated with runtime modifications to the object
     * @property {Cell<String[]>} dynamicLayerNames - Dynamic layer names supplied as direct arguments to the component
     * @property {Cell<Object<String, Unavailable>>} unavailableLayerMap - Map of layers which are currently unavailable
     * @property {Boolean} [resolveRoot] - Whether this shadow's scope names will resolve globally
     * @property {Boolean} [inert] - Whether this component is inert - that is, it is instantiated only to be inspected,
     * as is a layer's avatar (see `fluid.avatar`) or any component within one. An inert component merges its layers,
     * expands its members, constructs its subcomponents and evaluates any `$compute` member which is read, exactly as
     * any other component, but has no effect on the rest of the system:
     *  - it allocates no `$effect` or `$linkage`, binds no `$bindable` and renders nothing
     *  - it is not placed into root scope even if it bears `fluid.resolveRoot`
     *  - it is not tracked by `fluid.unavailableComponents`, so may be unavailable without holding up the system
     *  - it is not visited by component traversals, e.g. `fluid.queryILSelector`, which begin outside it
     * Inertness is inherited from a component's parent at construction.
     *
     * @property {Cell<Object>} flatMerged - The result of a deep recursive merge of all layer records for the component
     * @property {Object} [lastMerge] - The inputs and products of the most recent merge, used by `fluid.flatMergedComputer`
     * to avoid remerging when its inputs are unchanged
     * @property {Cell<Object>} computer - Signal for the component reference ("that")
     * @property {Cell<Unavailable|Component>} availableInstance - Signal tracking whether the component's instance should be publically
     * available, through having a complete set of available layers, etc.
     *
     * @property {Object} shadowMap - Recursive map indexed by path segments and $m of any live mounted signal products and their records
     * @property {Object} oldShadowMap - Previous value of shadowMap from the last time flatMerged turned over
     * @property {Object<String, Cell>} sitedRefMap - Map of all $sitedRef signals so far dispensed for this component, indexed by path
     * @property {Object<String, Cell>} queryILMap - Map of all $sitedRef signals so far dispensed for this component, indexed by path
     * @property {Object<String, Cell>} contextReferenceMap - Map of all $contextRef signals so far dispensed for this component, indexed by path
     */

    /** @typedef {Object} Instantiator
     * @property {Object<String, Shadow>} pathToComponent - Mapping of global path to shadow for each component
     */

    /**
     * @typedef {Object} DestroyRec
     * @property {Shadow} childShadow - The shadow record associated with the component being cleared
     * @property {String} name - The name of the child component within its parent.
     * @property {Shadow} shadow - The shadow record associated with the parent component.
     * @property {String} childPath - The fully qualified path to the child component in the component tree.
     */

    /** Clear indexes held of the location of an injected or concrete component.
     * @param {Instantiator} instantiator - The instantiator holding records to be cleared
     * @param {DestroyRec} destroyRec - A "destroy record" as allocated within instantiator.clearComponent
     */
    fluid.clearComponentIndexes = function (instantiator, destroyRec) {
        const shadow = destroyRec.shadow;
        fluid.clearScope(shadow, destroyRec.childShadow, destroyRec.name);
        // Note that "pathToComponent" will not be available during afterDestroy. This is so that we can synchronously recreate the component
        // in an afterDestroy listener (FLUID-5931). We don't clear up the shadow itself until after afterDestroy.
        delete instantiator.pathToComponent[destroyRec.childPath];
        delete shadow.childComponents[destroyRec.name];
    };

    /** Operate the process of destroying a concrete component, as encoded in a `DestroyRec` structure. This takes the
     * following sequence:
     *  - Other injected sites of this component are cleared
     *  - The path and scope records of the component are cleared
     *  - Listeners registered by this component's construction are removed
     *  - Events and appliers are destroyed
     *  - The `afterDestroy` event is fired on the component
     *  - We remove the lookup of this component's id in instantiator.idToShadow
     * @param {Instantiator} instantiator - The instantiator holding records to be cleared
     * @param {DestroyRec} destroyRec - A "destroy record" as allocated within instantiator.clearComponent
     */
    fluid.doDestroy = function (instantiator, destroyRec) {
        const shadow = destroyRec.childShadow;
        // Clear injected instance of this component from all other paths - historically we didn't bother
        // to do this since injecting into a shorter scope is an error - but now we have resolveRoot area
        fluid.each(shadow.injectedPaths, function (troo, injectedPath) {
            const segs = fluid.parsePath(injectedPath);
            const parentPath = fluid.composeSegments(segs.slice(0, -1));
            const otherShadow = instantiator.pathToComponent[parentPath];
            instantiator.clearComponent(otherShadow, fluid.peek(segs), shadow);
        });
        fluid.clearComponentIndexes(instantiator, destroyRec);
        // fluid.clearDistributions(shadow);

        shadow.lifecycleStatus = "destroyed";
        fluid.markDestroyed(shadow);
    };

    /**
     * Construct the unavailable value read from a component which has been destroyed, and from each of its members
     * @param {Shadow} shadow - The shadow of the destroyed component
     * @return {Unavailable} An unavailable value of variety "config" reporting the destruction
     */
    fluid.destroyedUnavailable = function (shadow) {
        return fluid.unavailable({
            message: `Component at path ${shadow.path} has been destroyed`,
            site: {shadow, segs: []}
        }, "config");
    };

    /**
     * Make a destroyed component, and every one of its members, read as unavailable. The component's cells are detached
     * from the computations which built its instance, and set to an unavailable value. Every member cell is derived from
     * the component's computer, and so becomes unavailable in turn, notifying any computation which read it once, so that
     * it no longer depends on material which has gone. A proxy onto the component then reads as unavailable within a
     * computation - see fluid.proxyMat.
     * @param {Shadow} shadow - The shadow of the destroyed component
     */
    fluid.markDestroyed = function (shadow) {
        const destroyed = fluid.destroyedUnavailable(shadow);
        shadow.destroyedValue = destroyed;
        [shadow.computer, shadow.availableInstance].forEach(cell => {
            if (cell) {
                cell.computed(null);
                cell.set(destroyed);
            }
        });
    };

    fluid.instantiator = function () {
        /** @type {Instantiator} */
        const that = {
            /**
             * A map that associates component paths with their corresponding shadow records.
             * Each key is a string representing the fully qualified path of a component in the component tree,
             * and each value is a `Shadow` object containing metadata and state for the component.
             * @type {Object<String, Shadow>}
             */
            pathToComponent: {}
        };

        /**
         * Records the metadata of a component in the component tree and updates its shadow record.
         *
         * @param {Shadow|null} parentShadow - The parent component of the component being recorded. Can be `null` for root components.
         * @param {Shadow} shadow - The component to record.
         * @param {String} name - The name of the component within its parent.
         * @param {Boolean} created - Whether the component was freshly created (`true`) or injected (`false`).
         */
        function recordComponent(parentShadow, shadow, name, created) {
            // This is allocated in fluid.freshComponent or fluid.computeInstance
            shadow.instantiator = that;
            const path = parentShadow ? fluid.composeSegment(parentShadow.path, name) : name; // "" if root component
            if (created) {
                shadow.path = path;
                shadow.memberName = name;
                shadow.parentShadow = parentShadow;
                shadow.childComponents = {};
                shadow.frameworkEffects = {};
                shadow.frameworkEffects.scopeEffect = fluid.cacheLayerScopes(parentShadow, shadow);
                // An inert component is expected to be unavailable, e.g. an avatar lacking its prerequisites, and must not
                // hold up the system
                if (!shadow.inert) {
                    shadow.frameworkEffects.availabilityTracker = fluid.trackComponentAvailability(shadow);
                }
            } else {
                shadow.injectedPaths = shadow.injectedPaths || {}; // a hash since we will modify whilst iterating
                shadow.injectedPaths[path] = true;
                // The injected component's entries in its new parent's scope are maintained by fluid.applyInjectedScope
            }
            if (that.pathToComponent[path]) {
                fluid.fail("Error during instantiation - path " + path + " which has just created component " + fluid.dumpThat(shadow) +
                    " has already been used for component " + fluid.dumpThat(that.pathToComponent[path]) + " - this is a circular instantiation or other oversight." +
                    " Please clear the component using instantiator.clearComponent() before reusing the path.");
            }
            that.pathToComponent[path] = shadow;
        }

        that.recordKnownComponent = function (parentShadow, shadow, name, created) {
            const existing = parentShadow.childComponents[name];
            if (existing) {
                if (existing !== shadow) {
                    fluid.fail("Attempt to register component at path ", existing.path, " which has already been used for component ", existing);
                }
            } else {
                // We no longer assign in here - the reference to the component signal gets evaluated in expandComponentRecord
                // parent[name] = component;
                parentShadow.childComponents[name] = shadow;
                recordComponent(parentShadow, shadow, name, created);
            }
        };

        that.allocateSimpleComponent = function (parentShadow, name, props) {
            const fresh = fluid.freshComponent(props);
            if (parentShadow === null) { // It's the component root
                recordComponent(null, fresh[$m], "", true);
            } else {
                that.recordKnownComponent(parentShadow, fresh[$m], name, true);
            }
            return fresh;
        };


        that.clearComponent = function (shadow, name, childShadow, destroyRecs, nested, path) {
            // Fill in recursive args at top level
            destroyRecs = destroyRecs || [];
            path = path || shadow.path; // TODO could this ever disagree?

            const childPath = fluid.composeSegment(path, name);
            childShadow = childShadow || shadow.childComponents[name];
            const created = childShadow.path === childPath;
            const destroyRec = {
                childShadow: childShadow,
                name: name,
                shadow: shadow,
                childPath: childPath
            };

            // only recurse on components which were created in place - if the id record disagrees with the
            // recurse path, it must have been injected
            if (created) {
                if (fluid.isDestroyedShadow(childShadow)) {
                    fluid.fail("Cannot destroy component which is already in status \"" + childShadow.lifecycleStatus + "\"");
                }
                // All effects, proxies etc. nullified at this point
                childShadow.lifecycleStatus = "destroying";
                fluid.disposeEffects(childShadow.frameworkEffects);
                childShadow.effectScheduler.dispose();

                childShadow.oldShadowMap = childShadow.shadowMap;
                childShadow.shadowMap = Object.create(null);
                fluid.disposeLayerEffects(childShadow);

                fluid.each(childShadow.childComponents, (gchildShadow, memberName) =>
                    that.clearComponent(childShadow, memberName, gchildShadow, destroyRecs, true)
                );
                //fluid.fireEvent(child, "onDestroy", [child, name || "", component]);
                // fluid.fireDestroy(child, name, component);
                destroyRecs.push(destroyRec);
            } else {
                const injection = shadow.injections?.[name];
                if (injection && injection.targetShadow === childShadow) {
                    fluid.withdrawInjectedComponent(injection);
                } else {
                    delete childShadow.injectedPaths[childPath];
                    fluid.clearComponentIndexes(that, destroyRec);
                }
            }
            if (!nested) {
                // Do actual destruction for the whole tree here, including "afterDestroy" and deleting shadows
                destroyRecs.forEach(function (destroyRec) {
                    fluid.doDestroy(that, destroyRec);
                });
            }
        };
        return Object.assign(that, fluid.freshComponent());
    };

    fluid.globalInstantiator = fluid.instantiator();

    fluid.constructRootComponents = function (instantiator) {
        // Instantiate the primordial components at the root of each context tree
        instantiator.rootComponent = instantiator.allocateSimpleComponent(null, "", {$layers: ["fluid.rootComponent"]});
        const rootShadow = instantiator.rootShadow = instantiator.rootComponent[$m];

        // The component which for convenience holds injected instances of all components with fluid.resolveRoot grade
        instantiator.resolveRootComponent = instantiator.allocateSimpleComponent(rootShadow,
            "resolveRootComponent", {$layers: ["fluid.component"]});

        // TODO: need to revisit root component logic
        // obliterate resolveRoot's scope objects and replace by the real root scope - which is unused by its own children
        // rootShadow.childrenScope = {};
        const resolveRootShadow = instantiator.resolveRootComponent[$m];
        resolveRootShadow.childrenScope = rootShadow.childrenScope;
    };

    /* Compute a "nickname" given a fully qualified layer name, by returning the last path
     * segment.
     */
    fluid.computeNickName = function (layerName) {
        const segs = fluid.parsePath(layerName);
        return fluid.peek(segs);
    };

    fluid.isDestroyedShadow = function (shadow, strict) {
        return shadow.lifecycleStatus === "destroyed" || (!strict && shadow.lifecycleStatus === "destroying");
    };

    /** Returns <code>true</code> if the supplied reference holds a component which has been destroyed or for which destruction has started
     * @param {fluid.component|Shadow} that - A reference to a component or a proxy to one, or its shadow record
     * @param {Boolean} [strict] - If `true`, the test will only check whether the component has been fully destroyed
     * @return {Boolean} `true` if the reference is to a component which has been destroyed
     **/
    fluid.isDestroyed = function (that, strict) {
        const shadow = that?.[$t]?.shadow || that[$m];
        return fluid.isDestroyedShadow(shadow, strict);
    };

    // Computes a name for a component appearing at the global root which is globally unique, from its nickName and id
    fluid.computeGlobalMemberName = function (layerName, id) {
        const nickName = fluid.computeNickName(layerName);
        return nickName + "-" + id;
    };

    /**
     * Upgrades an element of an IL record which designates a function to prepare for a {func, args} representation.
     *
     * @param {any} rec - The record to be upgraded. If an object will be returned unchanged. Otherwise it may be a function
     * object or an IL reference to one.
     * @param {String} key - The key in the returned record to hold the function, this will default to `funcName` if `rec` is a `string` *not*
     * holding an IL reference, or `func` otherwise
     * @return {Object} The original `rec` if it was not of primitive type, else a record holding { key : rec } if it was of primitive type.
     */
    fluid.upgradePrimitiveFunc = function (rec, key) {
        if (rec && fluid.isPrimitive(rec)) {
            const togo = {};
            togo[key || "func"] = rec;
            togo.args = fluid.NO_ARGUMENTS; // TODO currently undefined and unused
            return togo;
        } else {
            return rec;
        }
    };

    /**
     * Record encoding a function invocation - may encode materials for a $method, $compute or $effect record
     * @typedef {Object} FuncRec
     * @property {String|Function} func - The function name or reference.
     * @property {Array<String>} [args] - The arguments to the function, if any.
     */

    /**
     * Converts a compact string representation of a function or method call into a structured record object.
     *
     * This function parses strings of the form "funcName(arg1, arg2, ...)" into an object with a `func` property
     * and an `args` array. If the string does not contain parentheses and the type is "$method" or "$compute",
     * it returns an object with a `func` property set to the string. Otherwise, it throws an error for malformed input.
     *
     * @param {String} string - The compact string to parse, e.g., "myFunc(1, "a", true)".
     * @param {String} type - The type of record being parsed, such as "$method" or "$compute".
     * @return {FuncRec} The parsed record object, typically with `func` and `args` properties.
     * @throws Will throw an error if the string is not well-formed or if the type is unrecognized.
     */
    fluid.compactStringToRec = function (string, type) {
        const openPos = string.indexOf("(");
        const closePos = string.indexOf(")");
        if (openPos === -1 ^ closePos === -1 || openPos > closePos) {
            fluid.fail("Badly-formed compact " + type + " record without matching parentheses: " + string);
        }
        if (openPos !== -1 && closePos !== -1) {
            const trail = string.substring(closePos + 1);
            if (trail.trim() !== "") {
                fluid.fail("Badly-formed compact " + type + " record " + string + " - unexpected material following close parenthesis: " + trail);
            }
            const prefix = string.substring(0, openPos);
            const body = string.substring(openPos + 1, closePos).trim();
            const args = body === "" ? [] : body.split(",").map(str => str.trim()).map(fluid.coerceToPrimitive);
            const togo = fluid.upgradePrimitiveFunc(prefix, null);
            togo.args = args;
            return togo;
        } else if (type === "$method" || type === "$compute") {
            return {func: string};
        } else { // TODO: pass in cursor and produce unavailable value there
            fluid.fail("Unrecognised compact record " + string + " with no arguments with type ", type);
        }
        return string;
    };

    fluid.contextUnavailable = (context, shadow) => fluid.unavailable({
        message: "Cannot resolve context " + context,
        errorSite: {shadow}
    });

    /**
     * Determines whether a context name is a global address of a component, of the form "/path.to.component"
     * @param {String} context - The context name to be tested
     * @return {Boolean} `true` if the context name is a global address
     */
    fluid.isGlobalAddress = function (context) {
        return context.length > 1 && context.charAt(0) === "/";
    };

    /**
     * Looks up the shadow of the component at a global address of the form "/path.to.component"
     * @param {String} context - The global address of the component
     * @param {Shadow} shadow - Any shadow belonging to the instantiator holding the component
     * @return {Shadow|undefined} The shadow of the addressed component, or `undefined` if there is none
     */
    fluid.resolveGlobalAddress = function (context, shadow) {
        return shadow.instantiator.pathToComponent[context.substring(1)];
    };

    /**
     * Renders a site into a global reference of the form "{/path.to.component}.path.in.component" which may be
     * resolved by `fluid.fetchContextReference` to a `$sitedRef` at that site
     * @param {Site} site - The site to be rendered
     * @return {String} The global reference to the site
     */
    fluid.renderGlobalReference = function (site) {
        const path = site.segs.length > 0 ? "." + fluid.composeSegments(site.segs) : "";
        return `{/${site.shadow.path}}${path}`;
    };

    /**
     * Resolves a given context string to its corresponding component or scope within the component tree.
     *
     * @param {String} context - The context name to resolve. Special values:
     *   - `"self"` resolves to the current component
     *   - `"$parent"` resolves to the parent of the current component
     *   - `"/"` resolves to the root component.
     *   - `"/path.to.component"` resolves to the component at that global path
     *   - Other values resolve to named scopes in the target component's scope chain.
     * @param {Shadow} shadow - The component site from which resolution starts.
     * @return {any} Signal or plain value for the resolved component or scope. Returns:
     *   - The target component if `context` is `"self"`.
     *   - The root component if `context` is `"/"`.
     *   - The component or scope corresponding to `context` in the target component's scope chain, if found.
     *   - An unavailable value if the context cannot be resolved.
     */
    fluid.resolveContext = function (context, shadow) {
        if (context === "self") {
            return shadow.availableInstance;
            // fluid.proxyMat(shadow.computer, shadow, []);
            // return shadow.that;
        } else if (context === "/") {
            return shadow.instantiator.rootComponent;
        } else if (context === "global") {
            return fluid.global;
        } else if (context === "$oldValue") {
            return fluid.OldValue;
        } else if (context === "$parent") {
            return shadow.parentShadow ? shadow.parentShadow.availableInstance : fluid.contextUnavailable(context, shadow);
        } else if (fluid.isGlobalAddress(context)) {
            const target = fluid.resolveGlobalAddress(context, shadow);
            return target ? target.computer : fluid.contextUnavailable(context, shadow);
        } else {
            return fluid.cell(undefined, {name: `resolveContext for ${context} at ${shadow.path}`}).computed(() => {
                shadow.scopeTick.get(); // Read the scope tick to cause a dependency
                const resolvedRec = shadow.ownScope[context];
                if (resolvedRec) {
                    // Return the component's signal rather than its instance so that the component may be found by
                    // fluid.componentShadowForSignal
                    return resolvedRec.value.computer || fluid.contextUnavailable(context, shadow);
                } else {
                    return fluid.contextUnavailable(context, shadow);
                }
            });
        }
    };

    /**
     * Traverse into signalised material to resolve a "sited value" - return any penultimately discovered $sitedRef
     * or $component signal, otherwise the final resolved value.
     *
     * @param {any} ref - The value to resolve. May be a `Cell` or a plain value.
     * @return {any} The ultimate resolved value of the reference
     */
    fluid.deSignalToSite = function (ref) {
        let prev = null;
        while (fluid.isSignal(ref) && ref.$variety !== "$component") {
            prev = ref;
            ref = ref.get(ref.$variety === "$component" || ref.$variety === "$bareValue");
        }
        if (prev !== null && prev.$variety === "$sitedRef") {
            return prev;
        } else {
            return ref;
        }
    };

    fluid.deSignalSoft = function (ref) {
        while (fluid.isSignal(ref)) {
            ref = ref.get(ref.$variety === "$component" || ref.$variety === "$availableInstance");
        }
        return ref;
    };

    // Note every current site has penultimate = true
    /**
     * Traverses a nested object structure, resolving signals as encountered, and returns the value at the specified path.
     * @param {any} root - The root object or signal to begin traversal from.
     * @param {String[]} segs - An array of string segments representing the path to traverse.
     * @param {Boolean} penultimate - If true, return the signal at the final segment rather than unwrapping it.
     * @return {any} The resolved value at the specified path, or an unavailable value if the path cannot be fully resolved.
     */
    // The hint accompanying a reference to a member which a component lacks but its parent has
    fluid.parentMemberHintText = "Within a $component record, {self} designates the subcomponent being defined rather "
        + "than its parent, which may be referred to as {$parent} or by a context name such as that of one of its layers";

    /**
     * Construct the unavailable value resulting from a reference to a member which a component lacks. If its parent
     * has such a member, as most often happens when `{self}.member` is written within a `$component` record, e.g. that
     * of a view, intending the component which holds the record, this is noted, and the cause bears a `hint` explaining
     * the meaning of `{self}`. The parent's merged layers are consulted as they stand, without evaluating anything.
     * @param {Shadow} shadow - The shadow of the component which lacks the member
     * @param {String[]} segs - The path segments of the reference within the component
     * @param {Number} index - The index within `segs` of the member which is lacking
     * @return {Unavailable} The unavailable value
     */
    fluid.missingMemberUnavailable = function (shadow, segs, index) {
        const memberName = segs[index];
        const parentShadow = shadow.parentShadow;
        const parentMerged = parentShadow?.flatMerged?._value;
        const parentHas = index === 0 && fluid.isPlainObject(parentMerged, true) && memberName in parentMerged;
        return fluid.unavailable({
            message: `Component at path ${shadow.path} has no member ${memberName}` +
                (parentHas ? `, although its parent component at path ${parentShadow.path} does` : ""),
            variety: "config",
            site: {shadow, segs},
            ...(parentHas ? {hint: fluid.parentMemberHintText} : {})
        });
    };

    fluid.getThroughSignalsImpl = function (root, segs, penultimate) {
        // Always fully designal the root so it is concrete
        let move = penultimate && segs.length === 0 ? fluid.deSignalSoft(root) : fluid.deSignal(root);
        for (let j = 0; j < segs.length; ++j) {
            if (!move || fluid.isUnavailable(move)) {
                break;
            }
            const seg = segs[j];
            if (!(seg in move) && move[$m]) {
                move = fluid.missingMemberUnavailable(move[$m], segs, j);
                break;
            }
            // Stop if we've been asked to report the very last sited ref
            move = fluid.deSignalToSite(move[seg]);
            if (penultimate && j === segs.length - 1) {
                return move;
            } else {
                move = fluid.deSignal(move);
            }
        }
        return move;
    };

    // Takes a siteref and dereferences it to the last nested siteref that is going to produce a concrete value
    fluid.deSignalToUltimate = function (siteref) {
        return fluid.getThroughSignalsImpl(siteref.site.shadow.computer, siteref.site.segs, true);
    };

    /**
     * Traverse a nested object structure, resolving `Signal` values as encountered,
     * and returning a computed or plain value representing the resolved path.
     *
     * @param {any} root - The root object to begin traversal from.
     * @param {String[]} segs - An array of segment names representing the path to traverse.
     * @param {Object} extra - Metadata to be assigned to the returned signal, including a $variety element
     * @param {Boolean} penultimate - Whether to terminate traversal before final dereference of $sitedRef and simply return it
     * @return {Computed<any>} A computed value that resolves the path through any `Signal` encountered, a plain value if
     * no signals are encountered, or `undefined` if the traversal passes beyond defined objects.
     */
    fluid.getThroughSignals = function (root, segs, extra, penultimate = false) {
        const siteName = extra?.site ? ` for site ${fluid.renderSite(extra.site)}` : "";
        const togo = fluid.cell(undefined, {name: "$sitedRef" + siteName}).computed(function getThroughSignals() {
            return fluid.getThroughSignalsImpl(root, segs, penultimate);
        });
        Object.assign(togo, extra);
        return togo;
    };

    /**
     * Retrieves a signal for a value at a path within a component.
     *
     * @param {Shadow} shadow - The shadow record of the component.
     * @param {String|String[]} path - The path to resolve within the component's shadow.
     * @return {Signal<any>} A signal representing the value at the specified path.
     */
    fluid.getForComponent = function (shadow, path) {
        const segs = fluid.pathToSegs(path);
        if (segs.length === 0) {
            return shadow.computer;
        } else {
            const rec = fluid.getRecInsist(shadow.sitedRefMap, [...segs, $m]);
            return rec.sitedRef ||= fluid.getThroughSignals(shadow.computer, segs,
                {site: {shadow, segs: [...segs]}, $variety: "$sitedRef"}, true);
        }
    };

    // TODO: Need some way to target another layer other than the liveLayer, e.g. for the renderer writing to "container" - this
    // state is not transportable
    fluid.pathToLive = function (shadow, path) {
        const segs = fluid.pathToSegs(path);
        let existing = fluid.get(shadow.liveLayer, segs);
        if (!existing) {
            // TODO: "get" is redundant?
            // Not tracked, since a write, e.g. made by an effect, does not make the writer depend on what it overwrites
            const oldValue = fluid.deSignal(fluid.getForComponent(shadow, path).get(true));
            const valueSignal = fluid.cell(oldValue, {name: `Initial liveLayer signal at path ${path} for component path ${shadow.path}`});
            fluid.set(shadow.liveLayer, segs, valueSignal);
            // Remerge to take account that this top-level prop is now drawn from signal layer -
            // Could be much more efficient
            fluid.log("Upgrading path ", path, " to live");
            shadow.potentia.set(Object.assign({}, shadow.potentia.get()));
            return valueSignal;
        } else {
            return existing;
        }
    };

    /**
     * Replace a proxy onto mat-forming material with the plain value which it fronts. Proxies onto components, and all
     * other values, are returned unchanged.
     * @param {any} value - The value which may be a proxy
     * @return {any} The plain value fronted by the proxy, or the value itself if it is not such a proxy
     */
    fluid.deproxyMatValue = function (value) {
        const target = fluid.isPlainObject(value) ? value[$t] : undefined;
        const unwrapped = target === undefined ? undefined : fluid.deSignal(target);
        return target === undefined || fluid.isComponent(unwrapped) ? value : unwrapped;
    };

    /**
     * Replace any proxies onto mat-forming material held as the direct members of a fresh array or object which is
     * about to be written into a component with the plain values which they front, so that the proxies themselves are
     * not written into the component's live layer. Such values are assembled by spreading proxied material, e.g.
     * `[...that.list, item]`, and a proxy written back beneath the site it fronts would refer to itself. No deeper
     * traversal is made, since the value may hold arbitrary material which the framework should not traverse, and a
     * value which is itself a proxy is written as it is.
     * @param {any} value - The value to be written
     * @return {any} The value with any such proxies replaced, which is the value itself if it holds none
     */
    fluid.deproxyMat = function (value) {
        let togo = value;
        if (fluid.deproxyMatValue(value) === value) {
            if (Array.isArray(value)) {
                const mapped = value.map(fluid.deproxyMatValue);
                togo = mapped.some((element, i) => element !== value[i]) ? mapped : value;
            } else if (fluid.isPlainObject(value, true)) {
                const mapped = Object.entries(value).map(([key, member]) => [key, fluid.deproxyMatValue(member)]);
                togo = mapped.some(([key, member]) => member !== value[key]) ? Object.fromEntries(mapped) : value;
            }
        }
        return togo;
    };

    /**
     * Set a value for a component at a specified path, via immutable application if the path is nested below a reactive root.
     * @param {Object} component - The component holding the path to be modified
     * @param {String|Array<String>} path - The path at which to set the value, as a string or array of segments.
     * @param {any} inValue - The value to set at the specified path - any proxies onto mat-forming material within it are
     * replaced by the values they front
     * @param {Object} [options] - Options governing the write
     * @param {Boolean} [options.recordHistory] - If `true`, the write is recorded in the history even if it is not to a
     * reactive root of a user component, as is done for the mutating methods of an array
     * @return {Cell<Object>} Signal for the value at the updated path, which will now have been raised into the live layer
     */
    /**
     * Resolve a path written into a component which may pass through its subcomponents, e.g. "shell.fullScreen" written
     * into a component with a subcomponent `shell`, to the component which holds the path's final member and the
     * remainder of the path within it. The path descends into a subcomponent for as long as its leading segment names
     * one, so that the final segment is always left to be written.
     * @param {ComponentComputer} component - The component into which the path is written
     * @param {String|String[]} path - The path
     * @return {Object} Members `component`, the component holding the path's final member, and `segs`, the path within it
     */
    fluid.descendSubcomponentPath = function (component, path) {
        let shadow = component[$m];
        let segs = fluid.pathToSegs(path);
        while (segs.length > 1 && shadow.childComponents?.[segs[0]]) {
            shadow = shadow.childComponents[segs[0]];
            segs = segs.slice(1);
        }
        return {component: shadow === component[$m] ? component : fluid.deSignal(shadow.availableInstance), segs};
    };

    /**
     * Write a value at a path within a component. A write is not a read: whatever the write consults - the site it is
     * applied to, the value it overwrites, the component's layers and the history recording it - does not become a
     * dependency of a computation or effect which makes it, which would otherwise be notified, and run again, by
     * changes to what it wrote. E.g. an effect seeding a form's draft of its user's entries would undo each entry.
     * @param {Component} component - The component to write into
     * @param {String|String[]} path - The path within the component to write at
     * @param {any} inValue - The value to write
     * @param {Object} [options] - Options for the write - `recordHistory`, if `true`, records the write in the history
     * whether or not it is beneath a reactive root of a user component
     * @return {Cell} The live cell which received the write
     */
    fluid.setForComponent = function (component, path, inValue, options) {
        return fluid.cell.untracked(() => fluid.setForComponentImpl(component, path, inValue, options));
    };

    fluid.setForComponentImpl = function (component, path, inValue, options = {}) {
        const value = fluid.deproxyMat(inValue);
        const segs = fluid.pathToSegs(path),
            shadow = component[$m];
        // A write at or beneath a lens is applied to its source rather than held here
        const lensSite = fluid.findLensSite(shadow, segs);
        let togo;
        if (lensSite) {
            togo = fluid.putThroughLens(lensSite.lens, segs.slice(lensSite.length), value);
        } else {
            const reactiveSegs = fluid.findReactiveRoot(shadow.shadowMap, segs);

            const existing = fluid.pathToLive(shadow, reactiveSegs || segs);
            const existingValue = existing._value;

            const surplusSegs = reactiveSegs && segs.slice(reactiveSegs.length, segs.length);
            const updated = reactiveSegs ? fluid.setImmutable(existingValue, surplusSegs, value) : value;
            if (updated !== existingValue) {
                existing.set(updated);
                // Writes beneath a reactive root of a user component are recorded at the whole of the root. Writes to its
                // other members are not, since its reactive roots alone are the state which navigating its history restores
                // - e.g. the editor records its open tabs but not which of them is selected
                if (options.recordHistory || reactiveSegs && fluid.isUserLayer(fluid.peek(component.$layers))) {
                    // We'd like this to be asynchronous but then source tracking breaks down
                    //fluid.invokeLater(() => {
                    const layerName = fluid.renderSite({shadow, segs: reactiveSegs || segs});
                    fluid.history.push({type: "updateLayer", oldValue: existingValue, newValue: updated, layerName});
                    //});
                }
            }
            togo = existing;
        }
        return togo;
    };

    /**
     * Creates a writable live signal for a given reference within a component.
     * The signal dynamically tracks the value located at the specified path and allows updates to it.
     *
     * @param {String} ref - A context reference string
     * @return {Cell<any>} A writable, disposable signal representing the resolved value.
     */
    fluid.fetchWriteableLiveSignal = function (ref) {
        const site = fluid.parseSite(ref);
        const getter = fluid.getForComponent(site.shadow, site.path);
        const togo = fluid.cell(fluid.unavailable("Not initialised", "config"));
        togo.write = (value) => {
            // TODO: Need to deSignal here if we move to "breakpoint" fluid.getForComponent
            const oldValue = getter._value;
            if (value !== oldValue) {
                fluid.setForComponent(site.shadow.that, site.path, value);
            }
        };
        togo.reader = fluid.cell.effect( (newValue) => togo.set(newValue), [getter]);
        //  TODO: writer effect currently can't be used since we can't resolve raw signals through the proxy
        togo.writer = fluid.cell.effect(togo.write, [togo]);
        togo.dispose = () => {
            togo.reader.dispose();
            togo.writer.dispose();
        };
        return togo;
    };

    /**
     * Determine whether one path is a prefix of the other, or equal to it - so that a value at one includes the value at the other
     * @param {String[]} segs1 - The segments of the first path
     * @param {String[]} segs2 - The segments of the second path
     * @return {Boolean} `true` if the paths overlap
     */
    fluid.segsOverlap = function (segs1, segs2) {
        const length = Math.min(segs1.length, segs2.length);
        return segs1.slice(0, length).every((seg, i) => String(seg) === String(segs2[i]));
    };

    /**
     * Determine whether a reference to a path of a component designates its own site, or a value including or included by
     * it - e.g. `hostBounds: "{self}.hostBounds"` - which could only be computed from itself
     * @param {Shadow} targetShadow - The shadow of the component designated by the reference
     * @param {String} path - The path within the component designated by the reference
     * @param {Shadow} shadow - The shadow of the component holding the reference
     * @param {String[]} [segs] - The path segments at which the reference is held, if known
     * @return {Boolean} `true` if the reference designates its own site
     */
    fluid.isSelfReference = function (targetShadow, path, shadow, segs) {
        return targetShadow === shadow && !!segs && segs.length > 0 && fluid.segsOverlap(segs, fluid.pathToSegs(path));
    };

    /**
     * Resolves a context reference into a signal that dynamically tracks the value located at a path within another component or context.
     *
     * @param {String|Object} ref - A context reference string or parsed reference object.
     *   If a String, it will be parsed via `fluid.parseContextReference`.
     * @param {Shadow} shadow - The shadow context of the component from which the reference is being resolved.
     * @param {String[]} [inSegs] - Array of path segments where this reference appears in component configuration
     * @param {Function} [resolver] - An optional custom resolver function used for resolving context names.
     * @return {Cell<any>} A signal representing the resolved reference value. It includes metadata: the parsed reference, the resolving site, and a `$variety` tag.
     */
    fluid.fetchContextReference = function (ref, shadow, inSegs, resolver) {
        // Copy the segments, since callers traversing configuration may reuse the array
        const segs = inSegs && [...inSegs];
        const parsed = fluid.isPrimitive(ref) ? fluid.parseContextReference(ref) : ref;
        // Resolve the context outside the computed - a local value is captured here by value, and a context cell is
        // allocated once rather than on every reevaluation

        const localContext = resolver !== undefined ? resolver(parsed.context) : fluid.NoValue;

        const contextTarget = localContext === fluid.NoValue ? fluid.resolveContext(parsed.context, shadow) : localContext;

        const globalShadow = localContext === fluid.NoValue && fluid.isGlobalAddress(parsed.context) && !parsed.selector ?
            fluid.resolveGlobalAddress(parsed.context, shadow) : undefined;

        if (globalShadow) {
            // A global address to a site, e.g. as written into a variablesLayer - dispense the $sitedRef directly
            return fluid.getForComponent(globalShadow, parsed.path);
        } else if (parsed.path === "" && !parsed.selector) {
            // Special wrapper to signal to flattenSignals that it should not try to recurse through this. Eliminate this
            // once we reform flattenSignals
            const bareValue = fluid.cell(contextTarget, {name: `bareValue cell from fetchContextReference`, _isUntracked: true});
            bareValue.$variety = "$bareValue";
            return bareValue;
        } else {
            const rendered = fluid.isPrimitive(ref) ? ref : fluid.renderContextReference(parsed);
            // A reference which might designate its own site is cached per site, so that it is checked at each
            const key = segs && fluid.segsOverlap(segs, fluid.pathToSegs(parsed.path)) ? rendered + " at " + segs.join(".") : rendered;
            const existing = shadow.contextReferenceMap[key];
            if (existing) {
                return existing;
            } else {
                // The values at a path in each component matched by a selector, as last delivered
                let previousSelected = null;
                // Next: Make sure we never allocate a cell for a local context, or if we do, cache it somewhere appropriate
                const refComputer = shadow.contextReferenceMap[key] = fluid.cell(undefined, {name: `fetchContextReference for ${JSON.stringify(ref)} at path ${shadow.path}`}).computed(function fetchContextReference() {
                    // TODO: Need to cache these per site
                    const target = fluid.deSignal(contextTarget);
                    if (fluid.isUnavailable(target)) {
                        return parsed.path === "" ? target : fluid.mergeUnavailable(fluid.unavailable({
                            message: "Cannot fetch path " + parsed.path + " of context " + parsed.context + " which didn't resolve",
                            path: shadow.path
                        }, target.variety), target);
                    } else if (fluid.isComponent(target)) {
                        if (!parsed.selector && fluid.isSelfReference(target[$m], parsed.path, shadow, segs)) {
                            return fluid.unavailable({
                                message: `Reference ${fluid.isPrimitive(ref) ? ref : key} at path ${segs.join(".")} refers to its own value - note that `
                                    + "within a $component record, {self} designates the subcomponent being defined rather than its parent",
                                path: shadow.path
                            });
                        } else if (parsed.selector) {
                            const listSignal = fluid.liveQueryILSelector(target, parsed.selector);
                            if (parsed.path) {
                                // The array of values at the path in each matched component
                                const list = listSignal.get();
                                if (fluid.isUnavailable(list)) {
                                    return list;
                                } else {
                                    const values = list.map(listEl => fluid.deSignal(fluid.getForComponent(listEl[$m], parsed.path)));
                                    const unavailableValues = fluid.mergeUnavailables(values);
                                    if (unavailableValues) {
                                        return unavailableValues;
                                    } else {
                                        // Deliver the same array again if no value has changed - see fluid.liveQueryILSelector
                                        previousSelected = previousSelected !== null && fluid.arrayEqual(previousSelected, values) ? previousSelected : values;
                                        return previousSelected;
                                    }
                                }
                            } else {
                                return listSignal;
                            }
                        } else {
                            return fluid.getForComponent(target[$m], parsed.path);
                        }
                    } else {
                        const bareTarget = fluid.unProxy(target);
                        // Special case of reference through a local context holding a proxy, e.g. a method argument
                        if (fluid.isSignal(bareTarget) && bareTarget.$variety === "$sitedRef") {
                            return fluid.getForComponent(bareTarget.site.shadow, [...bareTarget.site.segs, ...fluid.pathToSegs(parsed.path)]);
                        } else {
                            return fluid.get(target, parsed.path, "unavailable");
                        }
                    }
                }, null);
                return Object.assign(refComputer, {parsed, site: {shadow, segs}, $variety: "$contextRef"});
            }
        }
    };

    /**
     * Traverses a structured `shadowMap` along the provided path segments to detect if any point is marked as a reactive root.
     * At each segment, it checks if the special property `reactiveRoot` is present in the corresponding `$m` record.
     * If a `reactiveRoot` is found at any level, returns array of path segments to that point, else null.
     *
     * @param {Object} shadowMap - A structured map representing a component's shadow hierarchy.
     * @param {String[]} segs - An array of path segments to traverse within the `shadowMap`.
     * @return {String[]|null} Path to any reactive root found
     */
    fluid.findReactiveRoot = function (shadowMap, segs) {
        let current = shadowMap;
        for (let i = 0; i < segs.length; ++i) {
            const seg = segs[i];
            const shadowRec = current?.[seg];
            if (shadowRec?.[$m]?.reactiveRoot) {
                return segs.slice(0, i + 1);
            }
            current = shadowRec;
        }
        return null;
    };

    /**
     * Recursively transfer a shadow map structure based on a corresponding layer map. Currently only transfers reactiveRoot
     * markers from layerMap into shadowMap, together with any links of each reactive root, which are mounted as effects
     * at the paths of the members they link - see fluid.extractReactiveLinks.
     * @param {Object} shadowMap - The shadow map to be populated.
     * @param {Object} layerMap - The layer map providing the structure and reactive root indicators.
     */
    fluid.transferShadowMap = function (shadowMap, layerMap) {
        Object.entries(layerMap).forEach(([key, value]) => {
            if (key !== $m) {
                const rec = shadowMap[key] = {};
                fluid.transferShadowMap(rec, value);
            }
        });
        if (layerMap?.[$m]?.reactiveRoot) {
            const rec = fluid.getRecInsist(shadowMap, [$m]);
            rec.reactiveRoot = true;
            fluid.makeArray(layerMap[$m].reactiveLinks).forEach(link => {
                const linkRec = fluid.getRecInsist(shadowMap, [...link.segs, $m]);
                // The reference itself is the signal record, so that an unchanged link is recognised as such across
                // turnover of its component, e.g. when its reactive root is first written into the live layer, and
                // its effect is retained rather than allocated afresh
                linkRec.signalRecord = link.ref;
                linkRec.handlerRecord = fluid.reactiveLinkExpanderRecord;
            });
        }
    };

    /**
     * Expands a link of a member of a reactive root into an effect which writes the referenced value into the member
     * whenever it changes - see fluid.extractReactiveLinks. These writes are derived rather than authored, and so are
     * not recorded in the history.
     * @param {String} ref - The context reference from which the member's value is drawn
     * @param {Shadow} shadow - The shadow of the component holding the reactive root
     * @param {String[]} segs - The path of the linked member within the component
     * @return {Function} A disposer function for the created effect
     */
    fluid.expandReactiveLink = function (ref, shadow, segs) {
        // Copied since the segments supplied by fluid.scheduleEffects are those of its traversal, which go on to change
        const linkSegs = [...segs];
        const record = {
            func: value => fluid.history.withoutRecording(() => fluid.setForComponent(shadow.that, linkSegs, value)),
            args: [ref]
        };
        return fluid.expandEffectRecord(record, shadow, linkSegs);
    };

    fluid.isMatForming = function (shadow, segs) {
        const upSignals = fluid.get(shadow.shadowMap, segs)?.[$m]?.hasSignalChild;
        const inReactive = fluid.findReactiveRoot(shadow.shadowMap, segs);
        return upSignals || inReactive || !!fluid.findLensSite(shadow, segs);
    };

    // TODO: flattenSignals is currently just a crude approximation to its final form - really needs to be divided into
    // flattenSignalsPre which maps out the structure to determine the paths of signals and then flattenSignalsImpl,
    // by close analogy with old Infusion's fluid.preExpand/fluid.expandImmediateImpl
    /**
     * Recursively traverse a data structure, resolving any `Signal` values to their underlying values.
     * @param {any|Cell<any>} root - The root data structure to process.
     * @param {String[]|Integer} segs - Path segments being traversed in the structure, defaults to []
     * @return {any} The processed data structure with all `Signal` values resolved and flattened into primitive values where applicable.
     */
    fluid.flattenSignals = function (root, segs = []) {
        const rawSignal = fluid.isSignal(root) && root.$variety !== "$sitedRef";
        const deref = fluid.deSignalToSite(root);
        if (typeof(segs) === "number") { // Currently receive iteration from fluid.cell.update's mapArg
            segs = ["" + segs];
        }
        if (fluid.isSignal(deref)) { // It must be a $sitedRef or $component
            // If it is a $sitedRef, retraverse it carefully step by step to discover the final site, which may hold a
            // further $sitedRef or a $component - if it holds a plain value, the original $sitedRef is the final site
            const upstream = deref.$variety === "$sitedRef" ? fluid.deSignalToUltimate(deref) : deref;
            const ult = fluid.isSignal(upstream) ? upstream : deref;
            const value = ult.get(ult.$variety === "$component");

            if (fluid.isUnavailable(value)) {
                return value;
            } else if (ult.$variety === "$component") {
                return fluid.proxyMat(ult, ult.shadow, []);
            } else {
                return fluid.isMatForming(ult.site.shadow, ult.site.segs) && fluid.isPlainObject(value) ?
                    fluid.proxyMat(ult, ult.site.shadow, ult.site.segs) : value;
            }
        }
        if (fluid.isComponent(deref) && !deref[$t]) {
            // A bare component instance, e.g. resolved from a named context such as {todoItem} - proxy it as for {self}
            // so that reads are designalised and writes are upgraded, following any sited material upstream
            const shadow = deref[$m];
            return fluid.proxyMat(shadow.computer, shadow, []);
        } else if (fluid.isPrimitive(deref) || !fluid.isPlainObject(deref) || rawSignal) {
            return deref;
        } else {
            let unavailable;
            // We have handled all non-plain structural values by here - recurse through the depth of "arg material" assuming
            // it is a framework signal - TODO need to map structure of original "root" to avoid recursing past it.
            const mapper = (member, key) => {
                const togo = fluid.flattenSignals(member, [...segs, key]);
                if (fluid.isUnavailable(togo)) {
                    // TODO: use segs to diagnose location of unavailable material
                    unavailable = fluid.mergeUnavailable(unavailable, togo);
                }
                return togo;
            };
            let concrete;
            if (Array.isArray(deref)) {
                concrete = deref.map(mapper);
            } else {
                concrete = fluid.transform(deref, mapper);
            }
            return unavailable || concrete;
        }

    };

    /**
     * Resolve material intended for compute and method arguments - this only expands {} references, possibly into
     * a local context
     * @param {any} material - The material to be expanded
     * @param {Shadow} shadow - Component from whose point of view the material is to be expanded
     * @param {String[]} segs - Path segments within shadow where material was found
     * @param {Function} [resolver] - A function dynamically resolving a context name to a local context
     * @return {any} The expanded material, with signals in place of any references discovered
     */
    fluid.resolveArgMaterial = function (material, shadow, segs, resolver) {
        if (fluid.isPrimitive(material)) {
            return fluid.isILReference(material) ? fluid.fetchContextReference(material, shadow, segs, resolver) : fluid.unescapeLiteral(material);
        } else if (Array.isArray(material)) {
            return material.map((member, key) => fluid.resolveArgMaterial(member, shadow, [...segs, key], resolver));
        } else if (fluid.isPlainObject(material, true)) {
            return fluid.transform(material, (member, key) => fluid.resolveArgMaterial(member, shadow, [...segs, key], resolver));
        } else {
            return material;
        }
    };

    fluid.makeArgResolver = function () {
        const that = {
            backing: [],
            resolve: function (context) {
                const argNum = +context;
                return Number.isInteger(+argNum) ? (argNum in that.backing ? that.backing[argNum] :
                    fluid.unavailable({message: "No argument at position " + context + " was supplied to this method call"})) : fluid.NoValue;
            }
        };
        return that;
    };

    fluid.makeMethodFuncResolver = function (shadow, segs, funcSignal) {
        const captureSegs = [...segs]; // Copy this since it is mutable during iteration
        // TODO: turn this into a computed of funcSignal to deal with the rare case it gets rebound
        return () => {
            const resolvedFunc = fluid.deSignal(funcSignal);
            if (fluid.isUnavailable(resolvedFunc)) {
                fluid.fail("Couldn't invoke method at path ", captureSegs, " of component ", shadow, resolvedFunc);
            }
            return resolvedFunc;
        };
    };

    /**
     * Expands a method record and returns a function that can be called with arguments. The function dispatches the invocation
     * of the resolved method (either directly or with computed arguments).
     *
     * If the method record contains arguments (`args`), it first resolves them and then returns a function that applies the
     * resolved arguments to the resolved function. If no arguments are provided, a direct method dispatch is returned.
     *
     * @param {FuncRecord} record - The method record to expand. It contains a `func` (the function to call) and optional `args`
     * that define the arguments to be resolved for the method.
     * @param {Shadow} shadow - The shadow context in which the method is being expanded, providing access to the component and its state.
     * @param {String[]} segs - The path where this method record appears in its component
     * @return {Function} A function that can be invoked with arguments, dispatching the resolved method with the provided arguments.
     */
    fluid.expandMethodRecord = function (record, shadow, segs) {
        // A method is an action rather than a computation - any values it reads are consulted, and do not become
        // dependencies of a computation or effect which happens to invoke it, e.g. an effect calling a method which
        // appends to a history it also reads
        const funcSignal = fluid.resolveFuncReference(record, shadow, segs);
        const funcResolver = fluid.makeMethodFuncResolver(shadow, segs, funcSignal);

        let togo;
        if (record.args) {
            const resolver = fluid.makeArgResolver();
            resolver.record = record; // Put this for visibility in debugger
            const argRecs = fluid.makeArray(record.args);
            togo = function invokeMethod(...args) {
                resolver.backing = args;
                const resolvedArgs = fluid.resolveArgMaterial(argRecs, shadow, segs, resolver.resolve);
                // TODO: if it is unavailable, await a promise for them
                const flatArgs = resolvedArgs.map(fluid.flattenSignals).map(arg => fluid.isUnavailable(arg) ? undefined : arg);
                return fluid.isUnavailable(flatArgs) ? flatArgs : fluid.cell.untracked(() => funcResolver().apply(shadow, flatArgs));
            };
        } else { // Fast path just directly dispatches args
            togo = function applyDirectMethod(...args) {
                // TODO: Should it instead dispatch with shadow.shadowMap[$m].proxy?
                return fluid.cell.untracked(() => funcResolver().apply(shadow.that, [shadow.that, ...args]));
            };
        }
        return togo;
    };

    /**
     * @typedef {Object} FuncRecord
     * @property {String|any} [func] - A reference to a function, as an Infusion context reference string a global
     * function name to be resolved via `fluid.getGlobalValue` or as a direct function value.
     * @property {Array<any>} [args] - Optional arguments to be passed to the function. These may include context references or values.
     */

    /**
     * Resolves a function reference from a `FuncRecord`, which may refer to a global function name, a context reference, or a direct function.
     *
     * @param {FuncRecord} rec - A function record containing one of `funcName` or `func` to resolve.
     * @param {Shadow} shadow - The shadow context used for resolving context references.
     * @param {String[]} segs - The path where this reference appears in component configuration
     * @return {Signal<Function>} Signal for the resolved function.
     */
    fluid.resolveFuncReference = function (rec, shadow, segs) {
        return fluid.isILReference(rec.func) ? fluid.fetchContextReference(rec.func, shadow, segs) :
            fluid.cell(undefined, {name: `resolveFuncReference for ${rec.func}`, rec, _isUntracked: true}).computed( () => {
                let func = rec.func;
                if (typeof(func) === "string") {
                    func = fluid.getGlobalValue(func);
                }
                return func || fluid.unavailable(`Unable to resolve reference to function from ${rec.func || rec}`);
            });
    };

    /**
     * @typedef {Object} ResolvedFuncRecord
     * @property {Cell<Function>} func - The resolved function signal.
     * @property {any[]} resolvedArgs - The resolved arguments array.
     */

    /**
     * Resolves a function reference and its arguments from a function record.
     *
     * This function takes a function record, resolves the function reference using `fluid.resolveFuncReference`,
     * converts the `args` property to an array, and resolves each argument using `fluid.resolveArgMaterial`.
     *
     * @param {FuncRecord} rec - The function record containing a function reference and optional arguments.
     * @param {Shadow} shadow - The shadow context used for resolving context references.
     * @param {String[]} segs - The path where this reference appears in component configuration.
     * @return {ResolvedFuncRecord} An object containing the resolved function signal and the resolved arguments array.
     */
    fluid.resolveFuncRecord = function (rec, shadow, segs) {
        const func = fluid.resolveFuncReference(rec, shadow, segs);
        const args = fluid.makeArray(rec.args);
        const resolvedArgs = fluid.resolveArgMaterial(args, shadow, [...segs, "args"]);

        return {func, resolvedArgs};
    };

    // Just deal with the fact that fluid.resolveFuncReference returns either a true signal or a kind of half-arsed signal
    // which resolves a global value which should not be resolved early - eventually the global mat will be signalised.
    fluid.makeFuncDispatcher = function (func) {
        return function dispatchFunc(...args) {
            const resolvedFunc = fluid.deSignal(func);
            if (fluid.isUnavailable(resolvedFunc)) {
                return resolvedFunc;
            } else {
                return resolvedFunc.apply(null, args);
            }
        };
    };

    /**
     * Expands a compute-style function record into a computed signal.
     * The function and its arguments are resolved from the record, and a signal is returned that tracks their computed value.
     *
     * @param {FuncRecord} record - The record describing the compute-style function. Must include either `func` or `funcName`, and optionally `args`.
     * @param {Shadow} shadow - The current component's shadow record used for resolving context references within the arguments.
     * @param {String[]} segs - The path where this record appears in its component
     * @return {Cell<any>} A computed signal representing the result of invoking the resolved function with the resolved arguments.
     *     Includes a `$variety` property set to `"$compute"`.
     */
    fluid.expandComputeRecord = function (record, shadow, segs) {
        const {func, resolvedArgs} = fluid.resolveFuncRecord(record, shadow, [...segs, "$compute"]);
        const dispatchCompute = fluid.makeFuncDispatcher(func);
        const name = `$compute at path ${segs} of component at path ${shadow.path}`;
        const togo = fluid.cell(undefined, {name}).computed(dispatchCompute, fluid.flattenedArgCells(resolvedArgs, name));
        togo.$variety = "$compute";
        return togo;
    };

    /**
     * Upgrade an arc of a `$lens` record, which may be a compact string or a function record, to a function record
     * @param {String|FuncRecord} arc - The arc
     * @param {String} type - The type of compact record it is parsed as, "$compute" or "$method"
     * @return {FuncRecord} The arc as a function record
     */
    fluid.expandLensArc = function (arc, type) {
        return typeof(arc) === "string" ? fluid.compactStringToRec(arc, type) : arc;
    };

    /**
     * Expands a lens record into a cell holding a view of the value held at an address within another site, together
     * with an address writer which writes back through the view. A lens names the matching forward and backward arcs
     * of a relation in one place:
     *  - `source` - a reference to the site holding the viewed data;
     *  - `path` - optionally, the path of the address viewed within the source's value, as a String, an Array of
     *    segments or a reference resolving to either - the lens owns only this address, and writes through it leave the
     *    rest of the source's value as it was;
     *  - `forward` - a compute-style record computing the lens's value, in whose arguments `{0}` designates the value
     *    at the lens's address;
     *  - `backward` - a method-style record computing the value for the lens's address alone from a value written to
     *    the lens, which it receives as `{0}`. Returning `fluid.deleteMarker` removes the address from the source.
     * A write to the lens's site, or beneath it, is not held locally - see `fluid.putThroughLens`. The backward arc is
     * not an edge in the graph of cells but an address writer, registered under the stable key of the lens's site -
     * see `fluid.siteWriterOf`.
     * @param {Object} record - The lens record, holding `source`, `forward` and `backward`, and optionally `path`
     * @param {Shadow} shadow - The shadow of the component holding the lens
     * @param {String[]} segs - The path where this record appears in its component
     * @return {Cell<any>} A computed cell holding the lens's value, which includes a `$variety` property set to "$lens"
     */
    fluid.expandLensRecord = function (record, shadow, segs) {
        const lensSegs = [...segs, "$lens"];
        const name = `$lens at path ${segs} of component at path ${shadow.path}`;
        const source = fluid.fetchContextReference(record.source, shadow, [...lensSegs, "source"]);
        const pathMaterial = record.path === undefined ? [] : fluid.resolveArgMaterial(record.path, shadow, [...lensSegs, "path"]);
        const [pathCell] = fluid.flattenedArgCells([pathMaterial], name + " path");
        const addressSegs = fluid.cell(undefined, {name: name + " address"}).computed(path => fluid.pathToSegs(path ?? []), [pathCell]);
        const [sourceCell] = fluid.flattenedArgCells([source], name + " source");
        const viewed = fluid.cell(undefined, {name: name + " viewed"}).computed((value, addSegs) =>
            addSegs.length === 0 ? value : fluid.get(value, addSegs), [sourceCell, addressSegs]);
        const forward = fluid.expandLensArc(record.forward, "$compute");
        const func = fluid.resolveFuncReference(forward, shadow, [...lensSegs, "forward"]);
        const argSegs = [...lensSegs, "forward", "args"];
        const resolvedArgs = fluid.makeArray(forward.args).map((arg, i) =>
            arg === "{0}" ? viewed : fluid.resolveArgMaterial(arg, shadow, [...argSegs, i]));
        const togo = fluid.cell(undefined, {name}).computed(fluid.makeFuncDispatcher(func), fluid.flattenedArgCells(resolvedArgs, name));
        togo.$variety = "$lens";
        togo.lensSource = source;
        togo.addressSegs = addressSegs;
        togo.backward = fluid.expandMethodRecord(fluid.expandLensArc(record.backward, "$method"), shadow, [...lensSegs, "backward"]);
        togo.writer = fluid.registerSiteWriter(shadow, segs, togo);
        return togo;
    };

    /**
     * @typedef {Object} AddressWriter
     * @property {String} key - The stable key of the site from which the writer writes - see `fluid.siteEdgeKey`
     * @property {Cell} lens - The lens whose writes it carries
     * @property {Object|null} lastWrite - A record of its last write, for explanation - members `lensValue`, the value
     * written to the lens, `address`, the rendered address written, and `value`, the value written there
     */

    /**
     * Register the address writer of a lens with its component, under the stable key of the lens's site. A lens
     * allocated afresh at the same site, e.g. as its component turns over, replaces the writer registered before, and
     * the writers are discarded with their component.
     * @param {Shadow} shadow - The shadow of the component holding the lens
     * @param {String[]} segs - The path of the lens within the component
     * @param {Cell} lens - The lens's cell
     * @return {AddressWriter} The writer
     */
    fluid.registerSiteWriter = function (shadow, segs, lens) {
        const key = fluid.siteEdgeKey(shadow, segs);
        const writers = shadow.siteWriters = shadow.siteWriters || Object.create(null);
        return writers[key] = {key, lens, lastWrite: null};
    };

    /**
     * Find the address writer registered for a site within a component
     * @param {Shadow} shadow - The shadow of the component
     * @param {String[]} segs - The path of the site within the component
     * @return {AddressWriter|undefined} The writer, if one is registered
     */
    fluid.siteWriterOf = function (shadow, segs) {
        return shadow.siteWriters?.[fluid.siteEdgeKey(shadow, segs)];
    };

    /**
     * Find the site of a lens at or above a path within a component, if there is one
     * @param {Shadow} shadow - The shadow of the component
     * @param {String[]} segs - The path within the component
     * @return {Object|null} Members `lens`, the lens's cell, and `length`, the number of segments of the path which
     * designate its site, or `null` if no lens is found
     */
    fluid.findLensSite = function (shadow, segs) {
        let node = shadow.shadowMap;
        let togo = null;
        for (let i = 0; i < segs.length && node && !togo; ++i) {
            node = node[segs[i]];
            const rec = node?.[$m];
            if (rec?.handlerRecord?.key === "$lens" && rec.signalProduct) {
                togo = {lens: rec.signalProduct, length: i + 1};
            }
        }
        return togo;
    };

    /**
     * Find the site from which a signal draws its value, by following its chain of signals upstream to the last
     * `$sitedRef` within it
     * @param {Signal} signal - The signal
     * @return {Site|null} The site, or `null` if the signal is not drawn from any site
     */
    fluid.terminalSiteOf = function (signal) {
        let ref = signal, site = null;
        while (fluid.isSignal(ref) && ref.$variety !== "$component") {
            if (ref.$variety === "$sitedRef") {
                site = ref.site;
            }
            ref = ref.get(ref.$variety === "$bareValue");
        }
        return site;
    };

    /**
     * Compute the stable key of a relation made from a site within a component - the path of the site in the component
     * tree. Unlike the cells along the relation, this survives the turnover of the component, so that a relation made
     * afresh from the same site replaces the one made before, rather than standing beside it
     * @param {Shadow} shadow - The shadow of the component holding the site
     * @param {String[]} segs - The path of the site within the component
     * @return {String} The key, e.g. "elevationFilter.dualRangeInput:range"
     */
    fluid.siteEdgeKey = function (shadow, segs) {
        return shadow.path + ":" + segs.join(".");
    };

    /**
     * Establish a computed relation onto a cell, which may be held by another component, on behalf of a site within a
     * component. The relation is keyed by the path of the site, so that it is replaced when the site makes it afresh,
     * e.g. as its component turns over and allocates fresh cells along it, and is torn down when the component is
     * destroyed. The target cell may thereby hold several relations, e.g. the arcs of a bidirectional relation, each
     * identified by the site which made it. As for any relation made onto a cell which already holds a value, it is
     * trusted to agree with that value, and is first run when one of its sources changes
     * @param {Shadow} shadow - The shadow of the component holding the site
     * @param {String[]} segs - The path of the site within the component
     * @param {Cell} target - The cell onto which the relation is made
     * @param {Function} fn - The function computing the target's value from the sources'
     * @param {Cell[]} staticSources - The relation's sources
     * @param {ComputedProps} [props] - Any further properties of the relation
     * @return {Cell} The target cell
     */
    fluid.attachSiteEdge = function (shadow, segs, target, fn, staticSources, props) {
        const key = fluid.siteEdgeKey(shadow, segs);
        target.computed(fn, staticSources, {...props, key});
        const siteEdges = shadow.frameworkEffects.siteEdges = shadow.frameworkEffects.siteEdges || [];
        const existing = siteEdges.findIndex(rec => rec.key === key);
        const record = {key, target, dispose: () => target.computed(null, null, {key})};
        if (existing === -1) {
            siteEdges.push(record);
        } else {
            siteEdges[existing] = record;
        }
        return target;
    };

    /**
     * Tear down a relation made by `fluid.attachSiteEdge`
     * @param {Shadow} shadow - The shadow of the component holding the site
     * @param {String[]} segs - The path of the site within the component
     */
    fluid.detachSiteEdge = function (shadow, segs) {
        const key = fluid.siteEdgeKey(shadow, segs);
        const siteEdges = shadow.frameworkEffects.siteEdges || [];
        const existing = siteEdges.findIndex(rec => rec.key === key);
        if (existing !== -1) {
            siteEdges[existing].dispose();
            siteEdges.splice(existing, 1);
        }
    };

    /**
     * Write a value through a lens, as its address writer - the lens's current value with the value applied at a path
     * within it is passed through its backward arc, and the result written at the lens's address within the site of its
     * source, through the source component's write gateway, `fluid.setForComponent`, leaving the rest of the source's
     * value as it was. The write carries the writer's key as its source marker. See `fluid.expandLensRecord`.
     * @param {Cell} lens - The lens's cell
     * @param {String[]} innerSegs - The path within the lens's value at which the value is written
     * @param {any} value - The value to be written
     * @return {Cell} The lens's cell
     */
    fluid.putThroughLens = function (lens, innerSegs, value) {
        fluid.cell.untracked(() => {
            const current = fluid.deSignal(lens);
            if (innerSegs.length > 0 && fluid.isUnavailable(current)) {
                fluid.fail(`Cannot write to path ${innerSegs.join(".")} beneath ${lens.name} whose value is unavailable`);
            }
            const updated = innerSegs.length === 0 ? value : fluid.setImmutable(current, innerSegs, value);
            const addressValue = lens.backward(updated);
            const site = fluid.terminalSiteOf(lens.lensSource);
            if (!site) {
                fluid.fail(`Cannot write through ${lens.name} since its source is not drawn from any site`);
            }
            const addressSegs = [...site.segs, ...lens.addressSegs.get()];
            const writer = lens.writer;
            writer.lastWrite = {lensValue: updated, address: fluid.renderSite({shadow: site.shadow, segs: addressSegs}), value: addressValue};
            // The write carries the writer's key as its source, so that a reader may recognise, or decline, writes which
            // arrived through this lens
            fluid.cell.withAmbientSource(writer.key, () =>
                fluid.setForComponent(site.shadow.that, addressSegs, addressValue))();
        });
        return lens;
    };

    /**
     * Flatten each of a set of resolved arguments within a computed cell of its own. Flattening an argument may traverse
     * the instance of a component, e.g. to reach a member of it, and so its reader would otherwise be notified on every
     * turnover of that component even when the argument's flattened value is unchanged. Held in its own cell, an
     * unchanged value is cut off by the usual equality check.
     * @param {any[]} resolvedArgs - The resolved arguments, as returned from `fluid.resolveFuncRecord`
     * @param {String} name - A name for the cells, for debugging
     * @return {Cell[]} A computed cell for each argument, holding its flattened value
     */
    fluid.flattenedArgCells = function (resolvedArgs, name) {
        return resolvedArgs.map((arg, i) => fluid.cell(undefined, {name: `flattened argument ${i} of ${name}`})
            .computed(() => fluid.flattenSignals(arg)));
    };

    fluid.expandCompactSubelement = function (subel) {
        return typeof(subel) === "string" ? fluid.compactStringToRec(subel, "$method") : subel;
    };

    /**
     * Upgrade the `bind` or `unbind` member of a `$bindable` record, which may be a bare function, a compact string or
     * a function record, to a function record
     * @param {Function|String|FuncRecord} [subel] - The member to be upgraded
     * @return {FuncRecord|undefined} The upgraded member
     */
    fluid.expandBindableSubelement = function (subel) {
        return typeof(subel) === "function" ? {func: subel} : fluid.expandCompactSubelement(subel);
    };

    /**
     * Expands a bindable function record, with properties `bind` and optionally `unbind`, into a value that will be eagerly
     * computed as soon as the arguments to bind become available. If an unbind record is supplied, it will be invoked
     * with the bound value whenever that value is released - when any argument becomes unavailable, when the record is
     * rebound, or when this entire record is disposed, e.g. through destruction of its component.
     *
     * By default the value is rebound, by unbinding and binding again, whenever the binder's arguments change - as for
     * `$compute` and `$effect`, this is whenever any of them is notified with a fresh value. Note that turnover of a
     * component supplied as an argument is not such a notification. A binder may stream updates for the whole lifetime
     * of its binding by returning a signal, which readers of the bindable will see through.
     *
     * If the record bears `onceOnly: true`, the value is bound exactly once during the available lifetime of the record,
     * that is, until it is disposed, regardless of any apparent change in its arguments, including any transient
     * unavailability of them. This is suitable for a heavyweight widget which cannot respond to changes in its arguments
     * without being reinstantiated, and which would lose its state if it were.
     *
     * @param {Object} record - The record describing the bindable, holding `bind`, and optionally `unbind` and `onceOnly`
     * @param {Function|String|FuncRecord} record.bind - The binder, which receives the resolved arguments and returns
     * the value to be bound
     * @param {Function|String|FuncRecord} [record.unbind] - Any unbinder, which receives the bound value, or its own
     * arguments, in which a bare `{boundValue}` receives the bound value exactly as returned from the binder
     * @param {Boolean} [record.onceOnly] - If `true`, the value is never rebound during the lifetime of the record
     * @param {Shadow} shadow - The current component's shadow record used for resolving context references within the arguments.
     * @param {String[]} segs - The path where this record appears in its component
     * @return {fluid.cell<any>} A computed signal holding the bound value, or an unavailable value if none is bound.
     *     Includes a `$variety` property set to `"$bindable"`.
     */
    fluid.expandBindableRecord = function (record, shadow, segs) {
        const bindSegs = [...segs, "$bindable", "bind"];
        const expBind = fluid.expandBindableSubelement(record.bind);
        const {func, resolvedArgs} = fluid.resolveFuncRecord(expBind, shadow, bindSegs);
        const funcResolver = fluid.makeMethodFuncResolver(shadow, segs, func);

        const unbindSegs = [...segs, "$bindable", "unbind"];
        const expUnbind = fluid.expandBindableSubelement(record.unbind);
        // The unbinder's arguments are only resolved when it is invoked, since they may refer to the bound value
        const unbindFunc = expUnbind ? fluid.resolveFuncReference(expUnbind, shadow, unbindSegs) : null;

        const unbindArgsResolver = context => context === "boundValue" ? togo._value : fluid.NoValue;

        let selfObserveEffect;
        // Whether a value is currently bound
        let isBound = false;

        /**
         * Invoke any unbinder supplied by the user for the currently bound value. A bare `{boundValue}` argument
         * receives the value exactly as returned from the binder, e.g. a signal which it bound, rather than designalised
         */
        const unbind = function () {
            const boundValue = togo._value;
            if (unbindFunc && isBound && !fluid.isUnavailable(boundValue)) {
                const unbindArgs = expUnbind.args === undefined ? [boundValue] : fluid.makeArray(expUnbind.args).map((arg, i) =>
                    arg === "{boundValue}" ? boundValue :
                        fluid.flattenSignals(fluid.resolveArgMaterial(arg, shadow, [...unbindSegs, "args", i], unbindArgsResolver)));
                fluid.makeFuncDispatcher(unbindFunc).apply(null, unbindArgs);
            }
            isBound = false;
        };

        const bind = function (args) {
            // The binder's dependencies are its arguments - anything it reads in the course of binding, e.g. through a
            // component supplied as an argument, must not cause it to be rebound
            const bound = fluid.cell.untracked(() => funcResolver().apply(null, args));
            // A binder which reports its value as unavailable has bound nothing
            isBound = !fluid.isUnavailable(bound);
            return bound;
        };

        const dispatcher = (func, args, unavailable, oldValue) => {
            let togo;
            if (shadow.inert) {
                // A bindable is evaluated lazily when read - an inert component, e.g. an avatar, must still never bind
                togo = fluid.unavailable({message: `Bindable of inert component at ${shadow.path} is not bound`, variety: "config"});
            } else if (isBound && record.onceOnly) {
                fluid.log("Retaining value bound once only at ", shadow.path, bindSegs);
                togo = oldValue;
            } else if (unavailable) {
                unbind();
                togo = unavailable;
            } else {
                unbind();
                togo = bind(args);
            }
            return togo;
        };

        // TODO: Inconsistency, note that this should presumably be marked as isFree in order to get notified of transition back to unavailable,
        // but no doubt anything that supplies a dispatcher should
        const name = `bindable for record at path ${segs} of ${shadow.path}`;
        const togo = fluid.cell(undefined, {name}).computed(func, fluid.flattenedArgCells(resolvedArgs, name), {dispatcher});
        togo.$variety = "$bindable";
        togo.dispose = () => {
            unbind();
            if (selfObserveEffect) {
                selfObserveEffect.dispose();
            }
        };
        togo.selfObserve = () => {
            if (!selfObserveEffect) {
                selfObserveEffect = fluid.cell.effect(() => togo.get());
            }
        };

        return togo;
    };

    /**
     * Return the source marking changes which a component itself originates from outside the reactive graph, e.g. from
     * an event handler bound in its template, or from a listener to a third-party widget it wraps which is wrapped by
     * `fluid.cell.withAmbientSource(fluid.selfSource(self), listener)`. An effect of the component excluding the source
     * `"self"` is not notified of these changes, nor of any which they cause - this is the source of the component's
     * shadow, which is distinct for each component instance and cannot be written in configuration.
     * @param {Component|Shadow} component - The component, or its shadow
     * @return {Shadow} The source for changes originated by the component
     */
    fluid.selfSource = function (component) {
        return fluid.isShadow(component) ? component : component[$m];
    };

    /**
     * Resolve a source named in the `includeSource` or `excludeSource` of an effect record, where the name `"self"` is
     * resolved to the source of changes originated by the effect's own component - see fluid.selfSource
     * @param {String|undefined} sourceName - The source name, if any
     * @param {Shadow} shadow - The shadow of the component holding the effect record
     * @return {any} The resolved source
     */
    fluid.resolveSourceName = function (sourceName, shadow) {
        return sourceName === "self" ? fluid.selfSource(shadow) : sourceName;
    };

    /**
     * Expands an effect-style function record into a reactive effect.
     * The function and its arguments are resolved from the record, and an effect is created that runs in response to changes.
     *
     * @param {FuncRecord} record - The record describing the effect-style function. Must include either `func` or `funcName`, and optionally `args`.
     * @param {Shadow} shadow - The current component's shadow record used for resolving context references within the arguments.
     * @param {String[]} segs - The path where this effect record appears in its component
     * @return {Function} A disposer function for the created effect. The function object includes a `$variety` property set to `"$effect"`.
     */
    fluid.expandEffectRecord = function (record, shadow, segs) {
        const {func, resolvedArgs} = fluid.resolveFuncRecord(record, shadow, [...segs, "$effect"]);
        const dispatch = fluid.makeFuncDispatcher(func);
        // Any cell the effect sets is marked with its declared source, e.g. "self" for changes it makes on behalf of its
        // own component, which an effect of the component excluding "self" will not be notified of
        const dispatchEffect = record.source === undefined ? dispatch :
            fluid.cell.withAmbientSource(fluid.resolveSourceName(record.source, shadow), dispatch);
        const name = `$effect at path ${segs} of component at path ${shadow.path}`;
        const togo = fluid.cell.effect(dispatchEffect, fluid.flattenedArgCells(resolvedArgs, name), {
            includeSource: fluid.resolveSourceName(record.includeSource, shadow),
            excludeSource: fluid.resolveSourceName(record.excludeSource, shadow),
            name});
        togo.$variety = "$effect";
        fluid.log("Allocated effect " + togo.cellId + " at path " + segs.join(".") + " at component " + shadow.path);
        return togo;
    };

    // Marks the position of a `{$payload}` argument of a listener record of a composite effect
    fluid.payloadArgument = Object.freeze({$variety: "$payload"});

    /**
     * Expands a composite effect, written as an array of listener records, or merged together from the effects of
     * several layers by `fluid.collectEffectRecords`, into a cell which runs the records as a chain, as for the
     * transforming promise events of Infusion 4 - see FLUID-7028. Each record may bear a `namespace`, and a `priority`
     * such as "before:namespace" or "after:namespace" ordering it with respect to the others, which otherwise run in the
     * order supplied, weakest layer first. An argument of a record written as `{$payload}` receives the value returned by
     * the previous record of the chain, or the value it resolves to if it returned a promise - a record returning
     * `undefined` passes on the payload it received. The chain stops at any record returning an unavailable value.
     * Whilst the chain runs, the cell is pending, and it then holds the final payload. As for a `$bindable`, the cell
     * is evaluated eagerly as soon as all of the records' arguments are available, and is run afresh whenever any of
     * them changes.
     *
     * @param {FuncRecord[]} records - The listener records, each holding `func` and optionally `args`, `namespace` and
     * `priority`
     * @param {Shadow} shadow - The current component's shadow record used for resolving context references within the arguments.
     * @param {String[]} segs - The path where this record appears in its component
     * @return {Cell<any>} A cell holding the final payload of the chain. Includes a `$variety` property set to `"$compositeEffect"`.
     */
    fluid.expandCompositeEffectRecord = function (records, shadow, segs) {
        const name = `composite $effect at path ${segs} of component at path ${shadow.path}`;
        fluid.checkEffectNamespaces(records, name);
        // The arguments of all records other than payloads, from which the cell is computed
        const argMaterials = [];
        const listeners = records.map((record, i) => {
            const listenerSegs = [...segs, "$effect", i];
            const args = fluid.makeArray(record.args).map((arg, j) => arg === "{$payload}" ? fluid.payloadArgument :
                fluid.resolveArgMaterial(arg, shadow, [...listenerSegs, "args", j]));
            return {
                namespace: fluid.effectNamespace(record),
                priority: fluid.parsePriority(record.priority, i, false, name),
                dispatch: fluid.makeFuncDispatcher(fluid.resolveFuncReference(record, shadow, listenerSegs)),
                // Index of each argument within argMaterials, or -1 for a payload
                argIndices: args.map(arg => arg === fluid.payloadArgument ? -1 : argMaterials.push(arg) - 1)
            };
        });
        fluid.sortByPriority(listeners);

        let selfObserveEffect;
        // Incremented on each run of the chain, so that a run which has been superseded whilst awaiting a promise
        // dispatches no further records
        let generation = 0;
        // The result of the latest run of the chain, which any superseded run resolves to
        let latest;

        const runChain = function (...values) {
            const thisGeneration = ++generation;
            const runFrom = function (start, payload) {
                let current = payload;
                let pending = null;
                for (let i = start; i < listeners.length && pending === null && !fluid.isUnavailable(current); ++i) {
                    const listener = listeners[i];
                    const result = listener.dispatch.apply(null, listener.argIndices.map(index => index === -1 ? current : values[index]));
                    if (fluid.isPromise(result)) {
                        const received = current;
                        pending = result.then(value => thisGeneration === generation ?
                            runFrom(i + 1, value === undefined ? received : value) : latest);
                    } else if (result !== undefined) {
                        current = result;
                    }
                }
                // As for a plain effect, a chain whose final payload is empty holds `true`
                return pending === null ? current ?? true : pending;
            };
            latest = runFrom(0, undefined);
            return latest;
        };

        const dispatcher = (func, args, unavailable) => {
            let togo;
            if (shadow.inert) {
                // As for a bindable, an inert component, e.g. an avatar, must never run its chain
                togo = fluid.unavailable({message: `Composite effect of inert component at ${shadow.path} is not run`, variety: "config"});
            } else if (unavailable) {
                togo = unavailable;
            } else {
                togo = func.apply(null, args);
            }
            return togo;
        };

        const togo = fluid.cell(undefined, {name}).computed(runChain, fluid.flattenedArgCells(argMaterials, name), {dispatcher});
        togo.$variety = "$compositeEffect";
        togo.dispose = () => {
            ++generation;
            if (selfObserveEffect) {
                selfObserveEffect.dispose();
            }
        };
        togo.selfObserve = () => {
            if (!selfObserveEffect) {
                selfObserveEffect = fluid.cell.effect(() => togo.get());
            }
        };
        return togo;
    };

    /**
     * Expands a linkage record into an effect which registers its co-occurrence as an effect whose lifetime coincides
     * with the instantiation of the record in the component surface.
     * Each entry of the record may bear `$if`, as for a subcomponent record, in which case it is registered only whilst
     * its condition holds, and `scope`, a reference to a component to whose subtree its effect is confined - e.g.
     * `scope: "{site}"` - in which case it is registered only whilst that component exists. Otherwise its effect is
     * global.
     *
     * @param {LayerLinkageRecord|LayerLinkageRecord[]} record - A linkage record holding one or more entries including
     * inputLayers or selector, and outputLayers
     * @param {Shadow} shadow - The current component's shadow record used for resolving context references within the arguments.
     * @param {String[]} segs - The path where this effect record appears in its component
     * @return {Function} A disposer function for the created effect. The function object includes a `$variety` property set to `"$effect"`.
     */
    fluid.expandLinkageRecord = function (record, shadow, segs) {
        const site = {shadow, segs};
        const siteString = fluid.renderSite(site);
        const array = Array.isArray(record);
        const entries = (array ? record : [record]).map((linkage, i) => {
            const entrySegs = array ? [...segs, "$linkage", i] : [...segs, "$linkage"];
            const {$if, scope, ...rest} = linkage;
            return {
                coOcName: array ? `${siteString}-${i}` : siteString,
                linkage: rest,
                condition: $if === undefined ? null : fluid.expandIfRecord($if, shadow, entrySegs),
                scope: scope === undefined ? null : fluid.fetchContextReference(scope, shadow, entrySegs),
                registered: null
            };
        });
        const deregister = function (entry) {
            if (entry.registered) {
                fluid.deregisterCoOccurrence(entry.coOcName);
                entry.registered = null;
            }
        };
        const togo = fluid.cell.effect( () => {
            entries.forEach(entry => {
                const condition = entry.condition === null ? true : fluid.deSignal(entry.condition);
                const scopeShadow = entry.scope === null ? null : fluid.componentShadowForSignal(entry.scope);
                const scopeAvailable = entry.scope === null || !!scopeShadow && !fluid.isDestroyedShadow(scopeShadow);
                if (condition && !fluid.isUnavailable(condition) && scopeAvailable) {
                    const scopePath = scopeShadow ? scopeShadow.path : null;
                    if (!entry.registered || entry.registered.scopePath !== scopePath) {
                        deregister(entry);
                        entry.registered = {...entry.linkage, scopePath};
                        fluid.registerCoOccurrence(entry.coOcName, entry.registered);
                    }
                } else {
                    deregister(entry);
                }
            });
        }, null, {
            onDispose: () => entries.forEach(deregister),
            name: `$linkage at path ${segs.join(".")} of component at path ${shadow.path}`
        });
        togo.$variety = "$linkage";
        return togo;
    };


    /**
     * Expands a reactive record into a part of the component tree marked as reactive data.
     * If its record is a String, it is interpreted as a context reference. Otherwise any members merged alongside the
     * record override its initial value, other than links which are honoured by fluid.expandReactiveLink.
     *
     * @param {Object} element - The element holding the reactive record as its member `$reactiveRoot`, where the record
     * is the data to be made reactive, or a context reference String.
     * @param {Shadow} shadow - The component's shadow record
     * @param {String[]} segs - The path where this record appears in its component
     * @return {Cell<any>} A computed signal representing the reactive data for the specified record.
     */
    fluid.expandReactiveRecord = function (element, shadow, segs) {
        const record = element.$reactiveRoot;
        let initial = record;
        // Members merged alongside the record which are not links override its initial value, unless displaced by a
        // stronger layer - see fluid.extractReactiveLinks. They are absent once the root has been written into the live layer.
        const literals = fluid.get(shadow.layerMap, [...segs, $m, "reactiveLiterals"]) || [];
        literals.forEach(literal => {
            if (fluid.get(element, literal.segs) !== undefined) {
                initial = fluid.setImmutable(initial, literal.segs, literal.value);
            }
        });
        const togo = fluid.isILReference(record) ?
            fluid.fetchContextReference(record, shadow, segs) : fluid.cell(initial,
                {name: `expandReactiveRoot for record at path ${segs.join(".")} of component at path ${shadow.path}`});
        // This is otherwise a no-op since marking the shadowMap is done in fluid.transferShadowMap
        togo.$variety = "$reactiveRoot";
        return togo;
    };

    /**
     * Pushes the potentia (potential definition) for a subcomponent into the system by constructing
     * a `subcomponent` layer record and invoking `fluid.pushPotentia`. This supports instantiating
     * nested subcomponents from within a parent component's definition.
     *
     * Each of the supplied records becomes a `subcomponent` merge record of its own, of successively greater priority,
     * so that the subcomponent's layers accumulate across them - see `fluid.componentRecords`.
     *
     * @param {Shadow} shadow - The shadow record representing the parent component into which the subcomponent is being added.
     * @param {String} memberName - The member name of the subcomponent within the parent component.
     * @param {ExpandedContribution[]} contributions - The expanded records for the subcomponent, weakest first, each
     * expected to contain a `$layers` field.
     * @param {Object|null} [variables] - Iteration variables to be placed in the subcomponent's variables layer
     * @param {MergeRecord} [forLayerRecord] - A `forLayer` merge record holding the source element of a `$for` which is
     * merged into the subcomponent through `layerAs`, stronger than all of the contributions
     * @return {ComponentComputer} Computer for the pushed subcomponent
     */
    fluid.pushSubcomponentPotentia = function (shadow, memberName, contributions, variables, forLayerRecord) {
        const count = contributions.length;
        const subLayerRecords = contributions.map(({expanded, mergeRecordName}, i) => ({
            mergeRecordType: "subcomponent",
            mergeRecordName: `${mergeRecordName}`,
            // The strongest contribution, the last, has the base priority for its type and the others are weaker
            priority: fluid.mergeRecordTypes.subcomponent + (count - 1 - i),
            layer: expanded
        }));
        // Weakest contribution first, as for the parents listed in any $layers
        const layerNames = fluid.uniqueLayerNames([...contributions.map(({expanded}) => expanded), ...fluid.makeArray(forLayerRecord?.layer)]
            .flatMap(expanded => expanded.$layers));
        const mergeRecords = forLayerRecord ? [...subLayerRecords, forLayerRecord] : subLayerRecords;
        // TODO: detect injected reference and take direct path to instantiator
        return fluid.pushPotentia(shadow, memberName, mergeRecords, layerNames, variables).computer;
    };

    /**
     * Construct the merge record through which the source element of a `$for` is merged into its member as a layer of
     * configuration, as directed by the `$for` record's `layerAs` member. Unlike material reached through `valueAs`,
     * which is final, the element is expanded in the member's context just as any other layer - context references
     * within it are resolved, and `$component` and other records within it are instantiated - and any `$layers` within
     * it are added to the member's. It is stronger than the member's own record, but weaker than its iteration variables
     * and live state.
     * @param {String} layerAs - The name of the merge record, as written in `layerAs`
     * @param {any} value - The source element
     * @param {String|Number} subKey - The key of the element within the source
     * @param {String} source - The `$for` record's source, for any error message
     * @return {MergeRecord} The `forLayer` merge record
     */
    fluid.forLayerRecord = function (layerAs, value, subKey, source) {
        const element = fluid.deproxyAndDesignal(value);
        if (!fluid.isPlainObject(element, true)) {
            fluid.fail(`Cannot merge element ${JSON.stringify(element)} at key ${subKey} of $for source ${source} as a layer ` +
                `through layerAs "${layerAs}" - each element must be a plain object`);
        }
        return {
            mergeRecordType: "forLayer",
            mergeRecordName: `${layerAs}`,
            priority: fluid.mergeRecordTypes.forLayer,
            layer: fluid.readerExpandLayer(element)
        };
    };

    /**
     * @typedef {Object} ExpandedContribution
     * @property {Object} expanded - A subcomponent record with its `$layers` member expanded into an array
     * @property {String} [mergeRecordName] - The name of the merge record holding the layer in which it was written
     */

    /**
     * Expand the contributions to a subcomponent record, which may be a single record or several collected into a
     * `fluid.componentRecords`, and perform a "light merge" of those members which must be resolved before the
     * subcomponent is pushed, i.e. `$for` and `$if`, each taken from the strongest contribution which holds it.
     * @param {Object|fluid.componentRecords} record - The subcomponent record
     * @param {String} [sourceLayer] - The layer in which a single record was written
     * @return {Object} A structure holding `contributions`, an array of `ExpandedContribution`, and the light merged
     * `forRecord` and `ifRecord`
     */
    fluid.expandComponentContributions = function (record, sourceLayer) {
        const raw = record instanceof fluid.componentRecords ? record.contributions : [{record, mergeRecordName: sourceLayer}];
        const contributions = raw.map(({record, mergeRecordName}) => ({expanded: fluid.readerExpandLayer(record), mergeRecordName}));
        const lightMerge = key => contributions.reduce((acc, {expanded}) => expanded[key] === undefined ? acc : expanded[key], undefined);
        return {contributions, forRecord: lightMerge("$for"), ifRecord: lightMerge("$if")};
    };

    /**
     * @typedef {Object} InjectionRecord
     * @property {Shadow} parentShadow - The shadow of the component into which a component is injected
     * @property {String} memberName - The member of the parent at which the component is injected
     * @property {String} path - The path in the component tree at which the component is injected
     * @property {Shadow|null} targetShadow - The shadow of the component currently injected, or `null` if none is
     * @property {String[]} scopeContexts - The context names under which the injected component has been placed into
     * the scope of its parent's children
     * @property {Cell<Number>} withdrawals - A tick which is incremented whenever an injected component is withdrawn
     */

    /**
     * Inject an existing component at a member of a parent component - it is recorded at the member's path in the
     * component tree, and placed into the scope of the parent's children just as it would have been had it been created
     * there. Any component previously injected by the same record is first withdrawn.
     * @param {InjectionRecord} injection - The record of the injection
     * @param {Shadow} targetShadow - The shadow of the component to be injected
     */
    fluid.registerInjectedComponent = function (injection, targetShadow) {
        const {parentShadow, memberName, path} = injection;
        if (injection.targetShadow !== targetShadow) {
            fluid.withdrawInjectedComponent(injection);
            const instantiator = parentShadow.instantiator;
            const occupant = parentShadow.childComponents[memberName];
            if (occupant && occupant.path === path && fluid.isEmptyPotentia(occupant.potentia._value)) {
                // A component formerly created at this member, e.g. by a previous record, which is awaiting destruction
                instantiator.clearComponent(parentShadow, memberName, occupant);
            }
            instantiator.recordKnownComponent(parentShadow, targetShadow, memberName, false);
            injection.targetShadow = targetShadow;
            parentShadow.injections = parentShadow.injections || {};
            parentShadow.injections[memberName] = injection;
        }
        fluid.applyInjectedScope(injection);
    };

    /**
     * Withdraw any component injected by an injection record, clearing its records at the injected path and its entries
     * in the scope of the parent's children. The component itself is not affected.
     * @param {InjectionRecord} injection - The record of the injection
     */
    fluid.withdrawInjectedComponent = function (injection) {
        const {parentShadow, memberName, path, targetShadow} = injection;
        if (targetShadow) {
            const instantiator = parentShadow.instantiator;
            fluid.withdrawInjectedScope(injection);
            if (parentShadow.childComponents[memberName] === targetShadow) {
                delete parentShadow.childComponents[memberName];
            }
            if (instantiator.pathToComponent[path] === targetShadow) {
                delete instantiator.pathToComponent[path];
            }
            if (targetShadow.injectedPaths) {
                delete targetShadow.injectedPaths[path];
            }
            if (parentShadow.injections?.[memberName] === injection) {
                delete parentShadow.injections[memberName];
            }
            injection.targetShadow = null;
            parentShadow.ownScopeTick.set(parentShadow.ownScopeTick._value + 1);
            injection.withdrawals.set(injection.withdrawals._value + 1);
        }
    };

    /**
     * Trace a signal through its chain of signals to discover whether a component is held at the location in the tree
     * it designates, i.e. whether a signal of variety `$component` or `$availableInstance` is present there, or a proxy
     * onto one.
     * @param {any} ref - The signal to be traced, e.g. as resolved from an IL reference by `fluid.fetchContextReference`
     * @return {Shadow|null} The shadow of the component found at the designated location, or `null` if there is none
     */
    fluid.componentShadowForSignal = function (ref) {
        let move = ref;
        let togo = null;
        while (togo === null && fluid.isSignal(move)) {
            if (move.$variety === "$component" || move.$variety === "$availableInstance") {
                togo = move.shadow;
            } else {
                move = move.get();
            }
        }
        if (togo === null) {
            const target = fluid.unProxy(move);
            if (fluid.isSignal(target) && target.$variety === "$component") {
                togo = target.shadow;
            }
        }
        return togo;
    };

    /**
     * Expands an IL reference held at a top-level member of a component. Whether the reference designates a component
     * can only be known once it is resolved - it may resolve to any part of the tree. Whilst the location it resolves to
     * holds a component, that component is injected at the member: it is recorded at the member's path and placed into
     * scope as described in `fluid.registerInjectedComponent`. It is withdrawn again if the reference ceases to
     * resolve to it, if the reference is disposed, or if the component is destroyed. A reference to the component
     * itself, e.g. `{self}`, is never injected. A reference to an ancestor, e.g. `filterRoot: "{vizLoader}"`, is
     * injected, which brings it down into nearer scope where it may hide other components of the same name. In all cases the value of the member is just the value the reference resolves to.
     *
     * @param {String} reference - The IL reference
     * @param {Shadow} shadow - The shadow record of the component holding the reference
     * @param {String[]} segs - The path in the component holding the reference, which will have a single segment
     * @param {String} memberName - The member name holding the reference
     * @return {Signal<any>} A signal for the value of the reference, which is unavailable if it designates a component
     * which has been destroyed. Includes a `$variety` property set to `"$memberRef"`.
     */
    fluid.expandReferenceRecord = function (reference, shadow, segs, memberName) {
        const path = fluid.composeSegment(shadow.path, memberName);
        /** @type {InjectionRecord} */
        const injection = {
            parentShadow: shadow,
            memberName,
            path,
            targetShadow: null,
            scopeContexts: [],
            withdrawals: fluid.cell(0, {name: `withdrawals of injected component at path ${path}`})
        };
        const referenceSignal = fluid.fetchContextReference(reference, shadow, segs);
        // The component, if any, designated by the reference - early cutoff will ensure that the injector is notified
        // only when this changes, and not on every change in a value the reference designates
        const targetShadow = fluid.cell(undefined, {name: `injectable target of ${reference} at path ${path}`}).computed(() => {
            const target = fluid.componentShadowForSignal(referenceSignal);
            return target && target !== shadow && target.path !== path ? target : null;
        });
        const injector = fluid.cell.effect(() => {
            const target = targetShadow.get();
            if (target && !fluid.isDestroyedShadow(target)) {
                // Read the target's own scope tick so that its scope entries are reapplied if its layers change
                target.ownScopeTick.get();
                fluid.registerInjectedComponent(injection, target);
            } else {
                fluid.withdrawInjectedComponent(injection);
            }
        }, [], {
            name: `injector for reference ${reference} at path ${path}`,
            onDispose: () => fluid.withdrawInjectedComponent(injection)
        });
        const togo = fluid.cell(undefined, {name: `member reference ${reference} at path ${path}`}).computed(() => {
            injection.withdrawals.get();
            const target = targetShadow.get();
            return target && fluid.isDestroyedShadow(target) ? fluid.unavailable({
                message: `Component designated by ${reference} at path ${path} has been destroyed`,
                site: {shadow, segs: [...segs]}
            }, "config") : referenceSignal;
        });
        togo.$variety = "$memberRef";
        togo.injection = injection;
        togo.dispose = () => injector.dispose();
        return togo;
    };

    // Handler record for IL references held at top-level members, which may designate a component to be injected
    fluid.memberReferenceExpanderRecord = {
        key: "$memberRef",
        handler: fluid.expandReferenceRecord
    };

    /**
     * Expand the weaker material recorded in a reference fallback, as it would have been expanded had the reference not
     * overridden it. Any effect within it is not expanded.
     * @param {fluid.referenceFallbackRecord} record - The reference fallback
     * @param {Shadow} shadow - The shadow record of the component holding the reference
     * @param {String[]} segs - The path in the component holding the reference
     * @return {any} The expanded weaker material - a signal if it was a reference or a signal-bearing record
     */
    fluid.expandFallbackMaterial = function (record, shadow, segs) {
        const value = record.value;
        const uncompact = fluid.expandCompactElement(value) || value;
        const typeRecord = fluid.isPlainObject(uncompact, true) ? fluid.elementTypeOf(uncompact) : undefined;
        let togo;
        if (record.fallback) {
            togo = fluid.expandFallbackReference(record.fallback, shadow, segs, fluid.peek(segs), false);
        } else if (fluid.isILReference(uncompact)) {
            togo = fluid.fetchContextReference(uncompact, shadow, segs);
        } else if (typeRecord) {
            togo = typeRecord.isEffect ? undefined :
                typeRecord.handler(typeRecord.wholeElement ? uncompact : uncompact[typeRecord.key], shadow, segs, fluid.peek(segs));
        } else if (fluid.isPlainObject(uncompact, true)) {
            togo = {};
            fluid.expandLayer(togo, uncompact, shadow, [...segs]);
        } else {
            togo = fluid.unescapeLiteral(uncompact);
        }
        return togo;
    };

    /**
     * Expand an IL reference which overrides weaker material at its path. Should the reference resolve to `undefined`,
     * the weaker material is delivered instead, as if the reference had not been written - this allows a layer to
     * refer to an optional value, e.g. `"{self}.record.maxObsCount"`, without displacing a default supplied by a weaker
     * layer.
     * @param {fluid.referenceFallbackRecord} record - The reference together with the weaker material
     * @param {Shadow} shadow - The shadow record of the component holding the reference
     * @param {String[]} segs - The path in the component holding the reference
     * @param {String} memberName - The final path segment
     * @param {Boolean} [inject=true] - `false` if a reference at a top-level member should not inject any component it
     * designates, as for one reached as a fallback of another
     * @return {Signal<any>} A signal delivering either the reference's signal or the expanded weaker material
     */
    fluid.expandFallbackReference = function (record, shadow, segs, memberName, inject = true) {
        const primary = inject && segs.length === 1 ? fluid.expandReferenceRecord(record.reference, shadow, segs, memberName) :
            fluid.fetchContextReference(record.reference, shadow, segs);
        const weaker = fluid.expandFallbackMaterial(record, shadow, segs);
        const togo = fluid.cell(undefined, {name: `reference ${record.reference} with fallback at path ${segs.join(".")} of ${shadow.path}`})
            .computed(() => fluid.deSignal(primary) === undefined ? weaker : primary);
        togo.dispose = () => {
            primary.dispose?.();
            weaker?.dispose?.();
        };
        return togo;
    };

    // Handler record for IL references which override weaker material at their path
    fluid.fallbackReferenceExpanderRecord = {
        key: "$fallbackRef",
        handler: fluid.expandFallbackReference
    };

    /**
     * Determine whether two signal records are equivalent, so that a signal product allocated for one may be reused for
     * the other. Records collected into a `fluid.componentRecords`, and records merged from several layers by
     * `fluid.mergeLayers`, are freshly allocated on every merge, and so are equivalent if their contributions are
     * identical.
     * @param {any} oldRecord - The record from which a signal product was previously allocated
     * @param {any} newRecord - The record currently mounted at the same site
     * @return {Boolean} `true` if the records are equivalent
     */
    fluid.isSameSignalRecord = function (oldRecord, newRecord) {
        const sameContributions = () => oldRecord.contributions.length === newRecord.contributions.length &&
            oldRecord.contributions.every((contribution, i) => contribution.record === newRecord.contributions[i].record &&
                contribution.mergeRecordName === newRecord.contributions[i].mergeRecordName);
        const oldMerged = oldRecord?.[$m]?.contributions, newMerged = newRecord?.[$m]?.contributions;
        return oldRecord === newRecord || oldRecord instanceof fluid.componentRecords &&
            newRecord instanceof fluid.componentRecords && sameContributions() ||
            oldRecord instanceof fluid.referenceFallbackRecord && newRecord instanceof fluid.referenceFallbackRecord &&
            fluid.isSameReferenceFallback(oldRecord, newRecord) ||
            oldMerged !== undefined && newMerged !== undefined && fluid.arrayEqual(oldMerged, newMerged);
    };

    /**
     * Expands the `$if` condition of a component record into a signal whose truthiness determines whether the component
     * is instantiated. A String is interpreted as a context reference. Otherwise the record is a long-form function record
     * holding `func` and optionally `args`, as for `$compute`, whose computed value is tested.
     *
     * @param {String|FuncRecord} ifRecord - The `$if` condition, either a context reference String or a function record
     * @param {Shadow} shadow - The shadow record of the component holding the conditional component record
     * @param {String[]} segs - The path in the parent shadow holding the conditional component record
     * @return {Signal<any>} A signal whose value will be tested for truthiness
     */
    fluid.expandIfRecord = function (ifRecord, shadow, segs) {
        let togo;
        if (typeof(ifRecord) === "string") {
            togo = fluid.fetchContextReference(ifRecord, shadow);
        } else {
            const {func, resolvedArgs} = fluid.resolveFuncRecord(ifRecord, shadow, [...segs, "$if"]);
            const dispatchIf = fluid.makeFuncDispatcher(func);
            togo = fluid.cell(undefined, {name: `$if at path ${segs.join(".")} of component at path ${shadow.path}`}).
                computed(dispatchIf, resolvedArgs, {mapArg: fluid.flattenSignals});
        }
        return togo;
    };

    /**
     * Order the entries of a keyed collection over which a `$for` iterates. Collections are keyed so that layers may
     * contribute, override and remove entries by the ordinary rules of merging - an entry whose value is `null` or
     * `undefined`, e.g. one removed by a stronger layer, is skipped. Entries are ordered by their member `priority`,
     * if any, as for the priorities of Infusion's listeners: either a Number, higher numbers sorting first, or a
     * constraint relative to the key of another entry, e.g. "before:katex" or "after:katex", or "first" or "last".
     * Entries of equal priority, including all those without one, keep the order of their keys.
     * @param {Object} records - The collection
     * @return {Array<Array>} The entries of the collection as `[key, value]` pairs, in order
     */
    fluid.orderKeyedRecords = function (records) {
        const prioritised = Object.entries(records).filter(([, value]) => value !== null && value !== undefined)
            .map(([key, value]) => ({
                namespace: key,
                value,
                priority: fluid.parsePriority(fluid.isPlainObject(value, true) ? value.priority : undefined, 0, false, "$for")
            }));
        fluid.sortByPriority(prioritised);
        return prioritised.map(({namespace, value}) => [namespace, value]);
    };

    /**
     * Expands a subcomponent-style function record into a component instantiation.
     * Produces a `subcomponent`-type layer record and pushes it into the component tree at the given `key` under the `shadow`.
     *
     * @param {FuncRecord} record - The component-style function record to be expanded. Expected to contain `func`, `funcName`, and/or `args`, along with `$layers`.
     * @param {Shadow} shadow - The parent component's shadow record under which the subcomponent will be allocated.
     * @param {String[]} segs - The path in the parent shadow holding this record
     * @param {String} key - The member name at which the subcomponent will be instantiated.
     * @return {ComponentComputer} A reactive signal representing the component instance.
     */
    fluid.expandComponentRecord = function (record, shadow, segs, key) {
        const sourceLayer = fluid.get(shadow.layerMap, [...segs, $m, "source"]);
        const {contributions, forRecord, ifRecord} = fluid.expandComponentContributions(record, sourceLayer);
        if (forRecord) {
            const sourceSignal = fluid.fetchContextReference(forRecord.source, shadow);
            let listShadow;
            const componentList = fluid.cell(undefined, {name: `componentList for record ${forRecord.source} at path ${segs} of ${shadow.path}`})
                .computed(source => {
                    const allKeys = [];
                    const sourceRef = fluid.deSignalToSite(sourceSignal);
                    const sourceSite = fluid.isSignal(sourceRef) && sourceRef.$variety === "$sitedRef" ? sourceRef.site : null;

                    /**
                     * Allocate the member of the list for one entry of the source collection
                     * @param {any} value - The value of the entry
                     * @param {String|Number} subKey - The key of the entry - its index if the source is an array
                     * @param {Number} index - The position of the entry within the source, once ordered
                     * @param {Number} length - The number of entries in the source
                     * @return {ComponentComputer} The member allocated for the entry
                     */
                    const pushSubcomponentPotentia = function (value, subKey, index, length) {
                        allKeys.push("" + subKey);
                        const variables = {};
                        // A value which is itself a proxy onto a site, e.g. an element selected by filter() from
                        // proxied material, retains the provenance of that site. Otherwise, where the source has a
                        // site, its element is the site of the value
                        const valueRef = fluid.unProxy(value);
                        const valueSite = fluid.isSignal(valueRef) && valueRef.$variety === "$sitedRef" ? valueRef.site :
                            sourceSite ? {shadow: sourceSite.shadow, segs: [...sourceSite.segs, "" + subKey]} : null;
                        if (forRecord.valueAs !== undefined) {
                            // Express a sited value as a global reference to it so that it stays live
                            variables[forRecord.valueAs] = valueSite ? fluid.renderGlobalReference(valueSite) : value;
                        }
                        if (forRecord.keyAs !== undefined) {
                            variables[forRecord.keyAs] = subKey;
                        }
                        if (forRecord.positionAs !== undefined) {
                            // Position within the collection regardless of how it is keyed, e.g. for rendering
                            // separators between members
                            variables[forRecord.positionAs] = {index, first: index === 0, last: index === length - 1};
                        }
                        const forLayerRecord = forRecord.layerAs !== undefined ?
                            fluid.forLayerRecord(forRecord.layerAs, value, subKey, forRecord.source) : undefined;
                        const computer = fluid.pushSubcomponentPotentia(listShadow, subKey, contributions, variables, forLayerRecord);
                        // Record the data item from which the component is lensed, so that destroying the component
                        // deletes the item from its source - see fluid.destroyComponent
                        computer.shadow.lensedSite = valueSite;
                        return computer;
                    };

                    let togo;
                    if (Array.isArray(source)) {
                        togo = source.map((value, index) => pushSubcomponentPotentia(value, index, index, source.length));
                    } else if (fluid.isPlainObject(source)) {
                        const entries = fluid.orderKeyedRecords(source);
                        togo = entries.map(([key, value], index) => pushSubcomponentPotentia(value, key, index, entries.length));
                    } else if (fluid.isUnavailable(source)) {
                        return source;
                    } else {
                        return fluid.unavailable({cause: `Unable to iterate over object ${source} to produce a ComponentList`, errorSite: sourceSignal.site});
                    }

                    // Destroy components which no longer have matching entries
                    // Consult only the keys of elements last pushed, since the list may have other children, e.g. its view
                    const goneKeys = (listShadow.listKeys || []).filter(k => !allKeys.includes(k));
                    const goneShadows = goneKeys.map(k => listShadow.childComponents[k]).filter(shadow => shadow);
                    goneShadows.forEach(shadow => shadow.potentia.set(fluid.emptyPotentia));
                    listShadow.listKeys = allKeys;

                    return togo.map(computer => fluid.proxyMat(computer, computer.shadow, []));
                }, [sourceSignal], {mapArg: fluid.deSignal});
            componentList.$variety = "$componentList";
            componentList.$source = sourceSignal;
            const listLayer = {
                $layers: ["fluid.componentList"],
                list: componentList
            };
            const listComputer = fluid.pushSubcomponentPotentia(shadow, key, [{expanded: listLayer, mergeRecordName: sourceLayer}]);
            // This gets read from the componentList computed scope above
            listShadow = listComputer.shadow;
            const effectKey = "listComponent-" + segs.join(".");
            // Cod reactivity to keep component list in sync with source signal
            shadow.frameworkEffects[effectKey] = fluid.cell.effect( () => {
                return fluid.deSignal(fluid.getForComponent(listShadow, "list"));
            }, [sourceSignal], {name: `Component list reading effect for ${effectKey}`});
            return listComputer;
        } else if (ifRecord) {
            const togo = fluid.cell(undefined, {name: `conditional creation for component at path ${segs.join(".")}`});
            let computer;
            const sourceSignal = fluid.expandIfRecord(ifRecord, shadow, segs);
            // TODO: This should really be a sited effect but this requires rewriting effect allocation pathway
            // See notes from 1/7/2025
            const effectKey = "conditionalComponent-" + segs.join(".");
            shadow.frameworkEffects[effectKey] = fluid.cell.effect( () => {
                const value = fluid.deSignal(sourceSignal);
                if (value && !fluid.isUnavailable(value)) {
                    computer = fluid.pushSubcomponentPotentia(shadow, key, contributions, null);
                    togo.set(computer);
                } else {
                    if (computer) {
                        computer.shadow.potentia.set(fluid.emptyPotentia);
                        computer = null;
                        togo.set(null);
                    }
                }
            }, [], {name: `Conditional component allocating effect for ${effectKey}`});
            return togo;
        } else {
            return fluid.pushSubcomponentPotentia(shadow, key, contributions, null);
        }
    };

    /**
     * @typedef {Object} HandlerRecord
     * @property {String} key - The type of element being processed, such as "$method", "$compute", "$effect", "$component", etc.
     * @property {Function} handler - A function responsible for handling the record expansion, such as `fluid.expandMethodRecord`, `fluid.expandComputeRecord`, etc.
     * @property {Boolean} [isEffect=false] - A flag indicating whether the handler is related to an effect, typically used for $effect records.
     * @property {Boolean} [isEager=false] - A flag indicating that the handler's product, e.g. that of a $bindable record, is to be
     * evaluated eagerly once its component is instantiated, rather than only when read.
     */

    fluid.elementExpanderRecord = function () {};

    /**
     * An array of handler records that define how different element types are expanded. Each record contains a key representing the type
     * of element (e.g., "$method", "$compute", "$effect", "$component") and a handler function that processes the record. The handler
     * function will expand or transform the record into a different form, such as a computed signal, effect, or component expansion.
     *
     * @type {HandlerRecord[]}
     */
    fluid.expandElementTypes = [{
        key: "$method",
        handler: fluid.expandMethodRecord
    }, {
        key: "$compute",
        handler: fluid.expandComputeRecord
    }, {
        key: "$effect",
        handler: fluid.expandEffectRecord,
        isEffect: true
    }, {
        key: "$bindable",
        handler: fluid.expandBindableRecord,
        isEager: true
    }, {
        key: "$linkage",
        handler: fluid.expandLinkageRecord,
        isEffect: true
    }, {
        // Placed before $reactiveRoot, since a lens may be laid over a reactive root, e.g. a filter's state
        key: "$lens",
        handler: fluid.expandLensRecord
    }, {
        key: "$reactiveRoot",
        handler: fluid.expandReactiveRecord,
        // Supplied with the element as a whole, since members alongside its record also contribute to its value
        wholeElement: true,
        // Recognised whatever its value, since a root may hold any value, including a falsy one such as false or null
        byPresence: true
    }, {
        key: "$component",
        handler: fluid.expandComponentRecord
        // TODO: Need to turn this record into an effect so that effect (potentia) can be withdrawn
    }].map(rec => Object.assign(Object.create(fluid.elementExpanderRecord.prototype), rec));

    /**
     * Find the type of signal-bearing record held by an element of merged material, e.g. `{$compute: ...}`. A record is
     * recognised by its key holding a truthy value, e.g. so that `{$component: null}`, which removes a subcomponent,
     * is not expanded as one - other than a `$reactiveRoot`, which is recognised whatever value it holds.
     * @param {Object} element - The element, which must be a plain object
     * @return {Object|undefined} The record from `fluid.expandElementTypes` describing its type, if it holds one
     */
    fluid.elementTypeOf = function (element) {
        return fluid.expandElementTypes.find(record => record.byPresence ? record.key in element : element[record.key]);
    };

    // Handler for an $effect record holding an array of listener records, which is expanded into a cell holding the
    // payload of their chain rather than into a plain effect
    fluid.compositeEffectExpanderRecord = Object.assign(Object.create(fluid.elementExpanderRecord.prototype), {
        key: "$effect",
        handler: fluid.expandCompositeEffectRecord,
        isEager: true
    });

    // Handler for the links of members of reactive roots, which are mounted by fluid.transferShadowMap rather than found
    // in a component's merged material
    fluid.reactiveLinkExpanderRecord = Object.assign(Object.create(fluid.elementExpanderRecord.prototype), {
        key: "$reactiveLink",
        handler: fluid.expandReactiveLink,
        isEffect: true
    });

    /**
     * @typedef {Object} Site
     * @property {Shadow} shadow - The shadow record associated with the site.
     * @property {String[]} [segs] - The path segments within the shadow's layer map.
     */

    /**
     * Retrieves the layer associated with a specific site in the component tree.
     * The site is defined by a shadow record and a set of path segments.
     *
     * @param {Site} site - The site object containing the shadow and path segments.
     * @return {String} The layer associated with the specified site, or `undefined` if not found.
     */
    fluid.layerForSite = site => fluid.get(site.shadow.layerMap, site.segs)?.[$m]?.source;

    // USER-FACING METHOD
    /**
     * Find which layer supplied the value of a member of a component - the strongest of its layers writing the member,
     * or the layer of the parent configuring it onto a subcomponent, e.g. to diagnose why a layer's definition of a
     * member is overridden. A component's own definition is stronger than every layer it names amongst its `$layers`.
     * @param {Component} component - The component
     * @param {String|String[]} path - The path of the member within the component, which may pass through its
     * subcomponents, e.g. "checklist.renderTooltip"
     * @return {String|undefined} The name of the layer supplying the member, or `undefined` if no layer supplies it, e.g.
     * if it was written at run time
     */
    fluid.layerForMember = function (component, path) {
        const {component: holder, segs} = fluid.descendSubcomponentPath(component, path);
        return holder ? fluid.layerForSite({shadow: holder[$m], segs}) : undefined;
    };

    /**
     * Apply a site address to a signalised product in the form of members `site, segs`
     * @param {Cell} signal - A signalised product to be assigned a site address
     * @param {Shadow} shadow - The shadow for the component where the signal is sited
     * @param {String[]} segs - The path segments where the signal is sited within its component
     * @return {Cell} The now sited signal
     */
    fluid.siteSignal = function (signal, shadow, segs) {
        const site = {shadow, segs: [...segs]};
        if (fluid.isUnavailable(signal)) {
            signal.causes.forEach(cause => cause.site = site);
        } else {
            signal.site = site;
        }
        signal.record = fluid.get(shadow.flatMerged.get(), segs);
        return signal;
    };

    /**
     * Converts a site locator into a unique string identifier.
     * The identifier is constructed by combining the shadow's path and the composed segments of the site's path.
     * @param {Site} site - The site object to convert.
     * @return {String} A unique string identifier for the site in the format `{shadow.path}.segments`.
     */
    fluid.renderSite = function (site) {
        const path = site.segs ? "." + fluid.composeSegments(site.segs) : "";
        return `{${site.shadow.path}}${path}`;
    };

    fluid.renderLayerRef = function (layerName, segs) {
        const path = segs ? "." + fluid.composeSegments(segs) : "";
        return `{${layerName}}${path}`;
    };

    /**
     * Parses a site identifier into its corresponding shadow and path within the component tree.
     * The site identifier is expected to be a context reference string that includes a context and an optional path.
     *
     * @param {String} id - The site identifier to parse. It should be a context reference string.
     * @return {Site} The resolved site
     */
    fluid.parseSite = function (id) {
        const ref = fluid.parseContextReference(id);
        const shadow = fluid.globalInstantiator.pathToComponent[ref.context];
        return {shadow, path: ref.path};
    };

    /**
     * Mounts a signal-producing record into a component's shadow map at the specified path.
     * If an identical record already exists in the previous shadow map, it is reused to preserve reactivity.
     * Otherwise, the provided `handler` from the `handlerRecord` is invoked to produce the signal or effect.
     *
     * @param {HandlerRecord} handlerRecord - A handler metadata record containing a `handler` function and an `isEffect` flag.
     * @param {FuncRecord} record - The signal-producing record that will be mounted. Typically includes fields like `func`, `args`, etc.
     * @param {Shadow} shadow - The component shadow in which to mount the record.
     * @param {String[]} segs - The path segments at which to mount the signal within the shadow structure
     * @return {any|undefined} The signal or computed product that results from the mounting operation.
     */
    fluid.mountSignalRecord = function (handlerRecord, record, shadow, segs) {
        const allSegs = [...segs, $m];
        const oldRec = fluid.get(shadow.oldShadowMap, allSegs);
        const rec = fluid.getRecInsist(shadow.shadowMap, allSegs);
        rec.signalRecord = record;
        rec.handlerRecord = handlerRecord;
        if (oldRec) {
            rec.proxy = oldRec.proxy;
        }
        if (oldRec && fluid.isSameSignalRecord(oldRec.signalRecord, record)) {
            rec.signalRecord = oldRec.signalRecord;
            return rec.signalProduct = oldRec.signalProduct;
        } else if (!handlerRecord.isEffect) {
            const product = rec.signalProduct = handlerRecord.handler(record, shadow, segs, fluid.peek(segs));
            fluid.siteSignal(product, shadow, segs);
            return product;
        }
    };


    fluid.expandElement = function (shadow, element, segs) {
        if (fluid.isPlainObject(element, true)) {
            const typeRecord = fluid.elementTypeOf(element);
            const handlerRecord = typeRecord?.key === "$effect" && Array.isArray(element.$effect) ? fluid.compositeEffectExpanderRecord : typeRecord;
            if (handlerRecord) {
                return fluid.mountSignalRecord(handlerRecord, handlerRecord.wholeElement ? element : element[handlerRecord.key], shadow, segs);
            } else {
                return element;
            }
        } else if (fluid.isILReference(element)) {
            // A reference overriding weaker material falls back to it if it resolves to undefined
            const fallback = fluid.get(shadow.layerMap, [...segs, $m, "fallback"]);
            // A reference at a top-level member may designate a component, which will be injected there
            return fallback ? fluid.mountSignalRecord(fluid.fallbackReferenceExpanderRecord, fallback, shadow, segs) :
                segs.length === 1 ? fluid.mountSignalRecord(fluid.memberReferenceExpanderRecord, element, shadow, segs) :
                    fluid.fetchContextReference(element, shadow, segs);
        } else {
            return fluid.unescapeLiteral(element);
        }
    };



    // TODO: Hack immutability for expanded elements since effect adapter requires it -
    // This should properly be part of "reader expansion" for layers and stored with them
    fluid.expansionCache = Object.create(null);

    fluid.expandCompactElementImpl = function (element) {
        const c = element.charAt(0);
        if (c === "$") {
            const colpos = element.indexOf(":");
            if (colpos === -1) {
                fluid.fail("Badly-formed compact record ", element, " without colon");
            } else {
                const type = element.substring(0, colpos);
                if (!fluid.expandElementTypes.find(record => record.key === type)) {
                    // TODO: Tests for this branch
                    fluid.fail("Unrecognised compact record type ", type);
                }
                const body = element.substring(colpos + 1);
                const rec = fluid.compactStringToRec(body, type);
                return {[type]: rec};
            }
        }
    };

    fluid.expandCompactElement = function (element) {
        if (typeof(element) === "string") {
            const existing = fluid.expansionCache[element];
            if (existing) {
                return existing;
            } else {
                const expanded = fluid.expandCompactElementImpl(element);
                if (expanded) {
                    fluid.expansionCache[element] = expanded;
                    return expanded;
                }
            }
        }
    };

    /**
     * Marks a sequence of segments in the `shadowMap` as signalised, indicating to consumers such as
     * `flattenSignals` and the proxy that the corresponding paths should be cloned and expanded due to
     * the presence of signal-bearing content further down the path.
     * @param {Object} shadowMap - The root of the shadow map structure to annotate.
     * @param {String[]} segs - The sequence of path segments to follow and mark.
     * @param {Integer} [uncess=1] - The number of trailing segments to exclude from marking as signal-bearing parents.
     */
    fluid.markSignalised = function (shadowMap, segs, uncess = 1) {
        for (let i = 0; i < segs.length; ++i) {
            const seg = segs[i];
            const rec = fluid.getRecInsist(shadowMap, [seg, $m]);
            if (i < segs.length - uncess) {
                // This is a signal to flattenSignals and the proxy to indicate that it should clone and expand
                // since this path is in the interior of the mat
                rec.hasSignalChild = true;
            }
            shadowMap = shadowMap[seg];
        }
    };

    fluid.isUnexpandablePath = function (segs) {
        return segs[0] === "$for";
    };

    fluid.expandLayer = function (target, flatMerged, shadow, segs) {
        fluid.each(flatMerged, function expandOneLayer(value, key) {
            segs.push(key);
            const uncompact = fluid.expandCompactElement(value);
            const expanded = fluid.expandElement(shadow, uncompact || value, segs);
            if (fluid.isPlainObject(expanded, true) && !fluid.isUnexpandablePath(segs)) {
                const expandedInner = {};
                fluid.expandLayer(expandedInner, value, shadow, segs);
                // Only hold a fresh object if something within was expanded - otherwise the merged material is held
                // directly, so that a member which is unchanged across turnover of its component keeps its identity
                // and does not notify its readers
                const anyExpanded = Object.keys(value).some(innerKey => expandedInner[innerKey] !== value[innerKey]);
                target[key] = anyExpanded ? expandedInner : value;
            } else {
                target[key] = expanded;
                if (fluid.isSignal(expanded)) {
                    // TODO: Currently don't have any plain $list in the system
                    const uncess = expanded.$variety === "$componentList" || expanded.$variety === "$list" ? 0 : 1;
                    fluid.markSignalised(shadow.shadowMap, segs, uncess);
                }
            }
            segs.pop();
        });
    };

    fluid.updateUnavailableLayers = function (shadow, unavailableLayerMap) {
        const oldUnavailableLayers = Object.keys(shadow.unavailableLayerMap._value);
        const newUnavailableLayers = Object.keys(unavailableLayerMap);
        const availChange = (oldUnavailableLayers.length === 0) !== (newUnavailableLayers.length === 0);
        if (availChange) {
            shadow.unavailableLayerMap.set(unavailableLayerMap);
        } else {
            // No change in overall availability - quietly update the map so that derived signals do not update
            shadow.unavailableLayerMap._value = unavailableLayerMap;
        }
    };

    /**
     * Performs a flattened resolution of the merged hierarchy for a component, optionally constructing
     * a synthetic layer if multiple layer names are provided.
     *
     * @param {Shadow} shadow - The shadow record of the component which is merging.
     * @param {fluid.HierarchyResolver} hierarchyResolver - The resolver used to store and resolve layered definitions.
     * @param {String[]} layerNames - An array of layer names to be merged and resolved.
     * @return {MergedHierarchyResolution | Unavailable} The resolved merged definition for the computed instance
     */
    fluid.flatMergedRound = function (shadow, hierarchyResolver, layerNames) {

        layerNames.forEach(layerName => hierarchyResolver.storeLayer(layerName));
        return hierarchyResolver.resolve(layerNames);
    };

    // The user will be expecting the priority of any layers supplied dynamically to be high, and in particular to beat
    // any definitions arriving as a result of a subcomponent declaration. The records of definitions are shared by all
    // components resolving the same chain - see fluid.definitionMergeRecords - and so an upgraded record replaces its
    // definition's record in the component's own array rather than modifying it
    fluid.upgradeDynamicLayers = function (resolvedMergeRecords, dynamicMergeRecord) {
        const dynamicLayers = dynamicMergeRecord.layer.$layers;
        if (dynamicLayers) {
            resolvedMergeRecords.forEach((mergeRecord, i) => {
                if (mergeRecord.mergeRecordType === "def" && dynamicLayers.includes(mergeRecord.mergeRecordName)) {
                    resolvedMergeRecords[i] = {...mergeRecord, mergeRecordType: "dynamicLayers", priority: fluid.mergeRecordTypes.dynamicLayers};
                }
            });
        }
    };

    // Stub that will be overridden in FluidView.js
    fluid.ensureImportsLoaded = () => {};

    fluid.flatMergedComputer = function (shadow) {
        return fluid.cell(undefined, {name: `flatMergedComputer for path ${shadow.path}`}).computed(function flatMergedComputer() {
            const unavailableLayerMap = Object.create(null);
            // Our potentia may be pushed to us by our parent's instantiation, as a write rather than through an edge -
            // bring our parent up to date first so that the write precedes, rather than invalidates, our evaluation
            shadow.parentShadow?.computer?.get();

            const potentia = shadow.potentia.get();
            const {layerNames, mergeRecords} = potentia;
            const dynamicMergeRecord = shadow.dynamicMergeRecord.get();
            const allMergeRecords = [...mergeRecords, dynamicMergeRecord];
            shadow.mergeRecords = allMergeRecords; // Put this in early so we can resolve container if there is an error

            // The layers named by our merge records, weakest record first, preceded by our direct layer names - within
            // each record, as in any $layers list, a later layer is stronger than an earlier one
            const recordPriority = mergeRecord => mergeRecord.priority ?? fluid.mergeRecordTypes[mergeRecord.mergeRecordType] ?? 0;
            const mergeRecordLayerNames = [...allMergeRecords].sort((a, b) => recordPriority(b) - recordPriority(a))
                .map(mergeRecord => fluid.makeArray(mergeRecord.layer.$layers)).flat().filter(name => name);
            const allLayerNames = [...layerNames, ...mergeRecordLayerNames];

            const [dynamicNames, staticNames] = fluid.partition(allLayerNames, fluid.isILReference);

            // TODO: We notice layerNames now routinely duplicates mergedRecordLayerNames - C3 doesn't in fact make a problem of this
            // but we need to move to a "forgiving C3" in time - see notes from 31/5/25
            const uniqueStaticNames = fluid.uniqueLayerNames(staticNames);

            const hierarchyResolver = new fluid.HierarchyResolver(layerName => {
                fluid.ensureImportsLoaded(shadow, layerName);
            }, shadow);
            const resolved = fluid.flatMergedRound(shadow, hierarchyResolver, uniqueStaticNames); // <= WILL READ LAYER REGISTRY

            // Dynamic layers may be named amongst the parents of any of our layers, or by our merge records, which are stronger
            const uniqueDynamicNames = fluid.uniqueLayerNames([...hierarchyResolver.dynamicLayerNames, ...dynamicNames]);
            if (!fluid.arrayEqual(uniqueDynamicNames, shadow.dynamicLayerNames._value)) {
                shadow.dynamicLayerNames.set(uniqueDynamicNames);
            }
            // Copy in any layers the resolver marked unavailable, either through circularity or defs being unavailable
            fluid.each(hierarchyResolver.unavailableLayers, (value, layerName) => unavailableLayerMap[layerName] = value);

            // Our merge is a pure function of these inputs - if they are unchanged, e.g. because we have been reevaluated
            // only through our parent turning over, our previous merge is returned so that we do not turn over ourselves.
            // Note that the resolution above must still run on every evaluation since its reads of the layer registry
            // are our dependencies on the definitions of our layers. The resolved records are the same array whenever
            // the same chain of the same definitions is resolved - see fluid.definitionMergeRecords
            const mergeInputs = [potentia, dynamicMergeRecord, resolved.mergeRecords];
            const previous = shadow.lastMerge;
            if (previous && fluid.arrayEqual(previous.mergeInputs, mergeInputs)) {
                shadow.mergeRecords = previous.layers;
                fluid.updateUnavailableLayers(shadow, previous.unavailableLayerMap);
                return previous.flatMerged;
            }

            const layers = resolved.mergeRecords.concat(mergeRecords).concat({
                mergeRecordType: "variables",
                mergeRecordName: "variables",
                layer: shadow.variablesLayer
            }, {
                mergeRecordType: "live",
                mergeRecordName: "live",
                layer: shadow.liveLayer
            });
            fluid.upgradeDynamicLayers(layers, dynamicMergeRecord);
            shadow.mergeRecords = layers;

            const flatMerged = fluid.makeLayer("flatMerged", shadow);
            shadow.layerMap = fluid.mergeLayerRecords(flatMerged, layers);
            // Likely because it has just been destroyed through having an empty potentia pushed
            if (uniqueStaticNames.length === 0) {
                unavailableLayerMap["fluid.noLayers"] = fluid.unavailable({message: "Component has no layers", site: {shadow, segs: []}}, "config");
            }
            fluid.updateUnavailableLayers(shadow, unavailableLayerMap);
            shadow.lastMerge = {mergeInputs, layers, unavailableLayerMap, flatMerged};
            return flatMerged;
        });
    };

    fluid.unavailableComponent = fluid.unavailable("Component is unavailable");

    /**
     * Computes an instance for a given potentia and returns the associated component computer signal.
     * @param {Potentia} potentia - The potentia (potential component configuration).
     * @param {Shadow} parentShadow - The shadow record associated with the parent component.
     * @param {String} memberName - The name of the member for this component in the parent.
     * @param {Object} [variables] - Iteration variables to be placed in the component's variables layer
     * @return {ComponentComputer} - The computed instance as a signal with shadow and $variety properties.
     */
    fluid.computeInstance = function (potentia, parentShadow, memberName, variables) {
        fluid.isIdle.set(fluid.busyUnavailable);

        /** @type {Shadow} **/
        const shadow = Object.create(fluid.shadow.prototype);

        shadow.path = fluid.composeSegment(parentShadow.path, memberName);
        // A component within an inert one, e.g. a subcomponent of an avatar, is itself inert - see Shadow.inert
        shadow.inert = !!parentShadow.inert;
        shadow.potentia = fluid.cell(potentia, {name: `potentia for path ${shadow.path}`});
        shadow.variablesLayer = variables || Object.create(null);
        shadow.liveLayer = Object.create(null);
        shadow.shadowMap = Object.create(null);
        shadow.sitedRefMap = Object.create(null);
        shadow.queryILMap = Object.create(null);
        shadow.contextReferenceMap = Object.create(null);

        shadow.dynamicMergeRecord = fluid.cell({
            mergeRecordType: "dynamicLayers",
            layer: {}
        }, {name: `dynamicMergeRecord for path ${shadow.path}`});
        shadow.dynamicLayerNames = fluid.cell([], {name: `dynamicLayerNames for path ${shadow.path}`});
        shadow.unavailableLayerMap = fluid.cell(Object.create(null), {name: `unavailableLayerMap for path ${shadow.path}`});

        shadow.instanceId = 0;
        shadow.flatMerged = fluid.flatMergedComputer(shadow);

        const computer = fluid.cell(fluid.unavailableComponent, {name: `computeInstance for path ${shadow.path}`}).computed(function computeInstance() {
            shadow.oldShadowMap = shadow.shadowMap;
            shadow.shadowMap = Object.create(null);
            const flatMerged = shadow.flatMerged.get(); // <-- EVALUATE HERE - various side-effects

            // Assigns mutual reference between "shadow" and "shadow.that"
            const instance = fluid.freshComponent(potentia.props, shadow);

            fluid.transferShadowMap(shadow.shadowMap, shadow.layerMap);
            // These props may just be the id for a free component

            instance.instanceId = shadow.instanceId++;
            fluid.expandLayer(instance, flatMerged, shadow, []);

            fluid.disposeLayerEffects(shadow);
            // Here Lies the Gap of the Queen of Sheba
            return instance;
        });

        computer.$variety = "$component";
        shadow.computer = computer;
        computer.shadow = shadow;

        // TODO: Add to cell.onDispose once it is implemented for all computed
        // This will be picked up in disposeLayerEffects
        computer.dispose = () => {
            shadow.potentia.set(fluid.emptyPotentia);
            // scheduleEffects will do remaining tidyup
        };

        shadow.availableInstance = fluid.cell(undefined, {name: `availableInstance for path ${shadow.path}`}).computed( () => {
            // Evaluate the merge first - this is what populates unavailableLayerMap, so reading the map before it would
            // report a stale availability
            shadow.flatMerged.get();
            const unavailableLayerVals = Object.values(shadow.unavailableLayerMap.get());
            return unavailableLayerVals.length > 0 ? fluid.mergeUnavailables(unavailableLayerVals) : computer;
        });
        shadow.availableInstance.$variety = "$availableInstance";
        shadow.availableInstance.shadow = shadow;

        // At this point there will be fluid.cacheLayerScopes which will start to demand shadow.computer.value.$layers
        const instantiator = parentShadow.instantiator;
        instantiator.recordKnownComponent(parentShadow, shadow, memberName, true);

        fluid.allocateEffectScheduler(shadow);

        return computer;
    };

    fluid.allocateEffectScheduler = function (shadow) {
        // Disposed during instantiator.clearComponent
        shadow.effectScheduler = fluid.cell.effect(() => {
            const instance = shadow.computer.get();
            if (!fluid.isUnavailable(instance)) {
                fluid.cell.untracked(() => { // God knows what scheduleEffects touches but we don't care
                    fluid.log("scheduleEffects executing for instanceId ", instance.instanceId, " path " + shadow.path);
                    fluid.scheduleEffects(shadow);
                });
            }
        }, [], {name: `$effectScheduler for path ${shadow.path}`});
        shadow.effectScheduler.$variety = "effectScheduler";
    };

    fluid.possiblyRenderError = x => x;

    /** Schedules framework effects for a component shadow once the instance becomes available.
     * @param {Shadow} shadow - The component shadow to schedule effects for
     */
    fluid.scheduleEffects = function (shadow) {
        // We would like this effect to act later than scopeEffect which is why it is scheduled now
        if (shadow.dynamicLayerNames._value.length > 0 && !shadow.frameworkEffects.dynamicLayerEffect) {
            let resolvedDynamicLayers = [];
            // The layers to which each reference last resolved
            const lastResolved = new Map();
            shadow.frameworkEffects.dynamicLayerEffect = fluid.cell.effect(() => {
                const newResolvedDynamicLayers = shadow.dynamicLayerNames.get().map((function resolveDynamicLayers(ref) {
                    const layers = fluid.deSignal(fluid.fetchContextReference(ref, shadow, ["$layers"]));
                    let togo;
                    if (fluid.isUnavailable(layers)) {
                        // A reference into the component itself is unavailable whilst the component is, which it may be
                        // because of a layer the reference resolved to, e.g. one whose SFC failed to evaluate - keep
                        // that layer, since dropping it would make the component available again, and the reference
                        // would then resolve to it once more, without end. Until the reference has first resolved,
                        // don't return unavailable, to avoid blocking initial evaluation of flatMerged
                        // TODO: Allow evaluation of components with partially or completely missing layers
                        togo = lastResolved.has(ref) ? lastResolved.get(ref) : null;
                    } else {
                        lastResolved.set(ref, layers);
                        togo = layers;
                    }
                    return togo;
                })).flat();
                if (!fluid.arrayEqual(newResolvedDynamicLayers, resolvedDynamicLayers)) {
                    resolvedDynamicLayers = newResolvedDynamicLayers;
                    // Pushes update to dynamicMergeRecord and hence renotifies flatMergedComputer
                    shadow.dynamicMergeRecord.set({
                        mergeRecordType: "dynamicLayers",
                        layer: {
                            $layers: resolvedDynamicLayers
                        }
                    });
                }
            });
        }

        // An inert component allocates no effects, binds nothing and renders nothing - see Shadow.inert
        if (!shadow.inert) {
            fluid.possiblyRenderError(shadow); // Callout to FluidView.js
        }

        // Only proceed to allocate any effects if the component has no unavailable layers
        if (Object.keys(shadow.unavailableLayerMap._value).length === 0 && !shadow.inert) {

            const expandEffect = (newRecord, segs) => {
                newRecord.signalProduct = newRecord.handlerRecord.handler(newRecord.signalRecord, shadow, segs);
                fluid.siteSignal(newRecord.signalProduct, shadow, segs);
            };
            // Instantiate any fresh effects
            fluid.forEachDeep(shadow.shadowMap, function allocateOneEffect(newRecord, segs) {
                if (newRecord.handlerRecord?.isEffect) {
                    const oldRecord = fluid.get(shadow.oldShadowMap, segs)?.[$m];
                    // !oldRecord.signalProduct: Deal with funny race where we managed to update instance before we ever allocate effects at all
                    // !newRecord.signalProduct: Similarly if instance turns over during effect instantiation and we've already instantiated it
                    if ((!oldRecord || newRecord.signalRecord !== oldRecord.signalRecord || !oldRecord.signalProduct) && !newRecord.signalProduct) {
                        fluid.log(`Allocating effect at path ${segs.join(".")} for component at path ${shadow.path}`);
                        expandEffect(newRecord, segs);
                    } else if (oldRecord && newRecord.signalRecord === oldRecord.signalRecord) {
                        newRecord.signalProduct = oldRecord.signalProduct;
                    }
                } else if (newRecord.handlerRecord?.isEager) {
                    // Ensure this bindable value or composite effect is allocated if it hasn't been already
                    newRecord.signalProduct.selfObserve();
                }
            });
        }

        // principal route to signalling instance destruction
        if (fluid.isEmptyPotentia(shadow.potentia._value)) {
            shadow.instantiator.clearComponent(shadow.parentShadow, shadow.memberName, shadow);
        }
    };

    // called from computeInstance just before the Sheba gap
    fluid.disposeLayerEffects = function (shadow) {
        fluid.forEachDeep(shadow.oldShadowMap, (oldRecord, segs) => {
            const newRecord = fluid.get(shadow.shadowMap, segs)?.[$m];
            // Note it may have no record because it records a proxy - do we actually want this in the map?
            // A product may be carried over even though its record has changed - e.g. a subcomponent whose record is
            // merged afresh from several layers will have been pushed its new potentia, and must not be disposed
            const carriedOver = newRecord?.signalProduct === oldRecord.signalProduct;
            if (oldRecord.signalProduct?.dispose && (!newRecord || newRecord.signalRecord !== oldRecord.signalRecord) && !carriedOver) {
                // fluid.log(`Disposing effect at path ${segs.join(".")} for component at path ${shadow.path}`);
                oldRecord.signalProduct?.dispose(); // dispose old effect/bindable/component that is not configured after adaptation
            }
            // Fresh effect will be allocated in fluid.scheduleEffects
        });
    };

    /**
     * @typedef {Cell<fluid.component>} ComponentComputer
     * @property {fluid.component} value - The component value associated with the signal.
     * @property {Shadow} shadow - The shadow record associated with the component.
     * @property {"$component"} $variety - A string indicating the type of the signal, which should be "$component".
     */

    /**
     * Represents the potential state of a component, defining its layer-based configuration and merge records.
     *
     * @typedef {Object} Potentia
     * @property {String[]} layerNames - An array of direct layer names applied to the component
     * @property {MergeRecord[]} mergeRecords - An array of merge records representing the component's configuration.
     * @property {Object} [props] - Optional component properties, typically including an `$id` field.
     */

    /**
     * Updates or initializes a component's potentia by merging new records and layer names.
     * If a potentia already exists, it filters out old merge records that belong to layers being updated.
     * Otherwise, it computes a new instance.
     *
     * @param {Shadow} parentShadow - The shadow record of the parent component.
     * @param {String} memberName - The name of the component within its parent.
     * @param {MergeRecord[]} mergeRecords - An array of merge records representing the component's configuration.
     * @param {String[]} [layerNames] - An array of direct layer names applied to the component
     * @param {Object} [variables] - Iteration variables to be placed in the component's variables layer as a result of structural iteration
     * @return {Shadow} Shadow for the updated or newly designated component.
     */
    fluid.pushPotentia = function (parentShadow, memberName, mergeRecords, layerNames = [], variables) {
        const existing = parentShadow.childComponents[memberName];
        if (existing) {
            const shadow = existing;
            fluid.log("pushPotentia for path ", shadow.path);
            const oldPotentia = shadow.potentia._value; // Avoid creating a read dependency
            const writtenLayers = new Set(mergeRecords.map(mergeRecord => mergeRecord.mergeRecordType));
            const filteredRecords = oldPotentia.mergeRecords.filter(mergeRecord => !writtenLayers.has(mergeRecord.mergeRecordType));
            const newMergeRecords = filteredRecords.concat(mergeRecords.filter(mergeRecord => mergeRecord.layer));
            const newLayerNames = oldPotentia.layerNames || layerNames;

            const potentia = {mergeRecords: newMergeRecords, layerNames: newLayerNames};
            if (variables) {
                // Assign before setting potentia since this read is not tracked by flatMergedComputer
                shadow.variablesLayer = variables;
            }
            shadow.potentia.set(potentia);
            return shadow;
        } else {
            return fluid.computeInstance({mergeRecords, layerNames}, parentShadow, memberName, variables).shadow;
        }
    };
    fluid.busyUnavailable = fluid.unavailable("System is busy", "pending");

    // Was used to schedule renders in tag singularity branch, currently disused
    fluid.isIdle = fluid.cell(true, {name: "Fluid global isIdle signal"});


    // Unavailable component tracking - used to determine whether server-side has stabilised and is ready to be written

    // The paths of the components which are currently unavailable, maintained in place by
    // fluid.trackComponentAvailability - each change is signalled by fluid.unavailableComponentsVersion. A system with
    // many thousands of components, e.g. a site rendered as one tree, changes the set many times whilst it is
    // constructed, and copying it on each change would cost time quadratic in its size
    /** @type {Object<String, Boolean>} */
    fluid.unavailableComponentPaths = Object.create(null);

    fluid.unavailableComponentsVersion = fluid.cell(0, {name: "Fluid global unavailable components version"});

    // A copy of fluid.unavailableComponentPaths, made only when read after it has changed
    fluid.unavailableComponentMap = fluid.cell(undefined, {name: "Fluid global unavailable component map"}).computed(() =>
        Object.assign(Object.create(null), fluid.unavailableComponentPaths), [fluid.unavailableComponentsVersion]);

    // Allocated with an undefined value so that it is evaluated when first read, rather than its initial value being
    // trusted until the map first changes
    fluid.unavailableComponents = fluid.cell(undefined, {name: "Fluid global unavailable components"}).computed(() => {
        const keys = Object.keys(fluid.unavailableComponentPaths);
        // Pending rather than an error - a component is typically unavailable whilst its layers are loading
        return keys.length === 0 ? true : fluid.unavailable({message: "Some components are unavailable", paths: keys}, "pending");
    }, [fluid.unavailableComponentsVersion]);

    /**
     * Track whether a component is available in `fluid.unavailableComponentPaths`, keyed by its path, so that
     * `fluid.unavailableComponents` reports whether any component in the system is unavailable
     * @param {Shadow} shadow - The shadow of the component to be tracked
     * @return {Effect} An effect maintaining the component's entry, which removes it when disposed
     */
    fluid.trackComponentAvailability = function (shadow) {
        const updateAvailability = function (instance) {
            const paths = fluid.unavailableComponentPaths;
            const currentEntry = !!paths[shadow.path];
            const isUnavailable = fluid.isUnavailable(instance);
            if (currentEntry !== isUnavailable) {
                if (isUnavailable) {
                    paths[shadow.path] = true;
                } else {
                    delete paths[shadow.path];
                }
                fluid.unavailableComponentsVersion.set(fluid.unavailableComponentsVersion._value + 1);
            }
        };
        return fluid.cell.effect(() => {
            // Read the value of availableInstance - a simple component, e.g. the root, has none and is always available
            updateAvailability(shadow.availableInstance ? shadow.availableInstance.get() : true);
        }, [], {
            onDispose: () => {
                // Remove it from tracking since it wholeheartedly does not exist rather than existing and being unavailable
                updateAvailability(true);
            },
            name: "trackComponentAvailability for " + shadow.path
        });
    };

    fluid.expectLiveComponent = function (shadow, prop) {
        if (shadow.lifecycleStatus === "destroyed") {
            throw Error(`Cannot access member ${prop} of component which has been destroyed`);
        }
    };

    // Members probed by generic code on any value, e.g. "then" by `await` and promise resolution, which read quietly from
    // a component which is unavailable - see fluid.expectAvailableComponent
    fluid.probedMembers = Object.fromEntries(["then", "toJSON", "constructor"].map(key => [key, true]));

    /**
     * Read a member through the proxy of a component which is unavailable, e.g. one whose layers can't be resolved.
     * Within a computation, the member reads as the component's unavailable value, and the computation depends on the
     * component's availability, so that it runs again once the component is available - as for a component which has
     * been destroyed, which reads as unavailable within a computation. Elsewhere, the member would read as `undefined`,
     * making the component look empty rather than unavailable, so reading it is an error reporting why the component is
     * unavailable - as reading a component which has been destroyed is, see fluid.expectLiveComponent. The members of
     * the unavailable value itself, e.g. its `message`, and those probed by generic code, e.g. `then`, are read as
     * normal, and do not reach here.
     * @param {Shadow} shadow - The shadow of the component
     * @param {Unavailable} unavailable - The component's unavailable value
     * @param {String} prop - The member being read
     * @return {Proxy<Unavailable>} A proxy onto the unavailable value, within a computation
     */
    fluid.readUnavailableComponent = function (shadow, unavailable, prop) {
        if (fluid.trackingVars.CurrentReaction) {
            // Read tracked, unlike for an available component, since an unavailable instance turns over only on becoming
            // available, or on the reason for its unavailability changing
            shadow.availableInstance?.get();
            return fluid.unavailableProxy(unavailable);
        } else {
            throw Error(`Cannot access member ${prop} of component at path ${shadow.path}, which is unavailable: ${unavailable.message}`);
        }
    };

    /**
     * Front the unavailable value of a component which is unavailable, as returned amongst the results of
     * fluid.queryILSelector, with a proxy which reads as that component would through its own proxy: the members of the
     * unavailable value itself, e.g. its `message`, read as normal, as do those probed by generic code, e.g. `then`,
     * and any other member is read as by fluid.readUnavailableComponent - an error outside a computation reporting why
     * the component is unavailable, rather than a silent `undefined`. It passes `fluid.isUnavailable`, and is unwrapped
     * by `fluid.deproxyUnavailable`.
     * @param {Shadow} shadow - The shadow of the component
     * @param {Unavailable} unavailable - The component's unavailable value
     * @return {Proxy<Unavailable>} The proxy
     */
    fluid.unavailableComponentProxy = function (shadow, unavailable) {
        return new Proxy(unavailable, {
            get: function (target, prop) {
                return prop === $t ? target : typeof(prop) === "symbol" || prop in target || fluid.probedMembers[prop] ?
                    target[prop] : fluid.readUnavailableComponent(shadow, target, prop);
            },
            getPrototypeOf: () => Object.getPrototypeOf(unavailable)
        });
    };

    fluid.mutatingArrayMethods = Object.fromEntries(["copyWithin", "fill", "pop", "push",
        "reverse", "shift", "sort", "splice", "unshift"].map(key => [key, true]));

    /**
     * "Follow fish upstream" - trace a signal held at a component member through its chain of `$sitedRef`s to the
     * terminal site which holds its data, e.g. from an iteration variable `{self}.todo` to the element
     * `{todoList}.todos.0` of the list it was drawn from. If that site lies in mat-forming material, a proxy is returned
     * onto it so that writes through it are applied to the original data source rather than to the referring component.
     * @param {Signal<any>} next - The signal held at the member
     * @param {any} upcoming - The designalised value of the signal
     * @return {Proxy|any} A proxy onto the terminal site if it is mat-forming, otherwise the supplied value
     */
    fluid.proxyUpstream = function (next, upcoming) {
        const sited = fluid.deSignalToSite(next);
        if (fluid.isSignal(sited) && sited.$variety === "$sitedRef" && fluid.isMatForming(sited.site.shadow, sited.site.segs)) {
            return fluid.proxyMat(sited, sited.site.shadow, sited.site.segs);
        } else {
            return upcoming;
        }
    };

    /**
     * Find the terminal site of the value held at a path within a component by tracing its chain of `$sitedRef`s
     * upstream. If the value is not sourced from elsewhere, this is the site itself.
     * @param {Shadow} shadow - The shadow record of the component holding the path
     * @param {String[]} segs - The path segments within the component
     * @return {Site} The terminal site of the value
     */
    fluid.upstreamSite = function (shadow, segs) {
        const sited = fluid.deSignalToSite(fluid.getForComponent(shadow, segs));
        if (fluid.isSignal(sited) && sited.$variety === "$sitedRef") {
            return sited.site;
        } else {
            return {shadow, segs};
        }
    };

    /**
     * Delete the value held at a path within a component,
     * @param {Object} component - The component holding the path to be deleted
     * @param {String|String[]} path - The path to be deleted, as a string or array of segments - this must have a
     * parent path within the component
     * @return {Cell<any>} Signal for the value at the parent path, which will now have been raised into the live layer
     */
    fluid.deleteForComponent = function (component, path) {
        return fluid.cell.untracked(() => fluid.deleteForComponentImpl(component, path));
    };

    fluid.deleteForComponentImpl = function (component, path) {
        const segs = fluid.pathToSegs(path);
        let togo;
        if (segs.length > 1) {
            const parentSegs = segs.slice(0, -1),
                key = fluid.peek(segs);
            const parent = fluid.deSignal(fluid.getForComponent(component[$m], parentSegs));
            let updated;
            if (Array.isArray(parent)) {
                updated = parent.filter((element, index) => "" + index !== "" + key);
            } else {
                // eslint-disable-next-line no-unused-vars
                const {[key]: _deleted, ...rest} = parent;
                updated = rest;
            }
            togo = fluid.setForComponent(component, parentSegs, updated);
        } else {
            fluid.fail(`Cannot delete top-level member ${segs[0]} of component at path ${component[$m].path}`);
        }
        return togo;
    };

    /**
     * Construct a proxy wrapper for a supplied component from its computer - reads will be designalised, and writes
     * will be upgraded into a live layer, allocating a fresh property in the layer if required.
     *
     * @param {any} inTarget - The target value to be proxied
     * @param {Shadow} shadow - The shadow record of the target component.
     * @param {Array<string>} segs - The path segments representing the location within the component structure.
     * @return {Proxy<fluid.component>} The retrieved or newly created metadata record.
     */
    fluid.proxyMat = function (inTarget, shadow, segs) {
        // If we're at the component root, expose an instance which may be unavailable if it has unavailable constituents
        const target = segs.length === 0 ? shadow.availableInstance : inTarget;
        // The root proxy dereferences the component's current instance on every access, and so is held by the shadow
        // rather than by the shadowMap of any one instance - it keeps its identity across turnover
        const rec = segs.length === 0 ? shadow.rootProxyRec ||= {} : fluid.getRecInsist(shadow.shadowMap, [...segs, $m]);
        const existing = rec.proxy;
        if (existing) {
            return existing;
        } else {
            const getHandler = function (target, prop) {
                if (prop === $t) {
                    return inTarget;
                } else if (prop === $u) {
                    return target;
                }
                // Within a computation, a destroyed component reads as unavailable, as do its members, so that the
                // computation may run to completion when it is notified of the destruction - see fluid.markDestroyed.
                // Elsewhere, reading a destroyed component is an error
                if (shadow.lifecycleStatus === "destroyed" && fluid.trackingVars.CurrentReaction) {
                    return fluid.unavailableProxy(shadow.destroyedValue);
                }
                fluid.expectLiveComponent(shadow, prop);
                // Use "Symbol.toStringTag" to make sure that tricks like Qunit's plain object detection work on the target
                const deTarget = fluid.deSignalSoft(target);
                // The material fronted by the proxy may have gone away, e.g. an element of an array which has since
                // been shortened - the proxy then reads as empty
                if (deTarget === undefined || deTarget === null) {
                    return undefined;
                } else if (prop === Symbol.toStringTag) {
                    return Array.isArray(deTarget) ? "Array" : deTarget[Symbol.toStringTag];
                } else if (typeof(prop) === "symbol") {
                    // A symbol, e.g. Symbol.asyncIterator probed by the signal graph to detect an async iterable, is never
                    // a path into the mat - it is read from the material itself
                    return deTarget[prop];
                } else if (segs.length === 0 && fluid.isUnavailable(deTarget) && !(prop in deTarget) && !fluid.probedMembers[prop]) {
                    return fluid.readUnavailableComponent(shadow, deTarget, prop);
                } else {
                    const nextSegs = [...segs, prop];
                    // Note that logic is quite similar to fluid.flattenSignals
                    const proxyNext = fluid.isMatForming(shadow, nextSegs);
                    // Special case to allow fluid.isUnavailable of an entire component
                    // A top-level member is read through its own cell, so that a computation reading it depends on that
                    // member alone - the instance itself is read untracked above, since it turns over whenever any of its
                    // members changes
                    const memberRead = segs.length === 0 && typeof(prop) === "string" && !fluid.isUnavailable(deTarget) && prop in deTarget;
                    const unavailableWithin = fluid.isUnavailable(deTarget) && segs.length > 0;
                    const next = unavailableWithin ? undefined : proxyNext || memberRead ?
                        fluid.getForComponent(shadow, nextSegs) : deTarget[prop];
                    if (unavailableWithin) {
                        // Material within the component which is unavailable, e.g. a lens whose source is pending, reads
                        // as that unavailable value, so that e.g. its staleValue may be read by a cell holding the proxy
                        return deTarget[prop];
                    } else if (Array.isArray(deTarget) && typeof(deTarget[prop]) === "function") {
                        if (fluid.mutatingArrayMethods[prop]) {
                            // For any mutating array methods, assemble a shallow copy of the array's current value,
                            // apply the mutation to that, and after it is done, write it back via fluid.setForComponent,
                            // which applies it immutably to any reactive root enclosing the array - the mutation is
                            // recorded in the history whether or not the array is within a reactive root
                            return function () {
                                const oldValue = fluid.cell.untracked(() => fluid.deSignal(fluid.getForComponent(shadow, segs)));
                                const forked = [...oldValue];
                                const togo = Array.prototype[prop].apply(forked, arguments);
                                fluid.setForComponent(shadow.that, segs, forked, {recordHistory: true});
                                return togo;
                            };
                        } else {
                            // Non-mutating methods such as filter operate on proxied elements, so that their
                            // results retain the provenance of the elements they select
                            const unwrapped = deTarget.map((element, key) => getHandler(target, key));
                            return Array.prototype[prop].bind(unwrapped);
                        }
                    } else if (proxyNext || fluid.isSignal(next)) {
                        const upcoming = fluid.deSignal(next);
                        // Problem here if material goes away or changes - proxies bound to old material will still be out there,
                        // although we do reevaluate our signal target
                        // If it is unavailable, we need to ensure that user does not try to dereference into it by next property access
                        // If it is another component, hand off to fresh lineage of proxy
                        // A component reached by any other route, e.g. one injected from elsewhere, is proxied at its own site
                        return fluid.isUnavailable(upcoming) ? fluid.unavailableProxy(upcoming) :
                            next.$variety === "$component" ? fluid.proxyMat(next, next.shadow, []) :
                                fluid.isComponent(upcoming) && upcoming[$m].computer ? fluid.proxyMat(upcoming[$m].computer, upcoming[$m], []) :
                                    !fluid.isPlainObject(upcoming) ? upcoming :
                                        proxyNext ? fluid.proxyMat(next, shadow, nextSegs) :
                                            fluid.proxyUpstream(next, upcoming);
                    } else {
                        return next;
                    }
                }
            };
            // Note that writes into material sourced from another site are already directed upstream since getHandler
            // will have handed off to a proxy onto that site via fluid.proxyUpstream. A write to a member which is
            // itself sourced from another site, e.g. one defined by a reference such as "{hashManager}.hash.pane",
            // follows the fish upstream in the same way, as a deletion does, and is applied to the original site,
            // rather than rebinding the member locally and severing it from its source.
            // Neither a write nor a deletion tracks what it consults in finding its site - see fluid.setForComponent
            const setHandler = function (target, prop, value) {
                fluid.expectLiveComponent(shadow, prop);
                fluid.cell.untracked(() => {
                    const nextSegs = [...segs, prop];
                    // A member already raised into the live layer is held locally, and is written in place
                    const upstream = segs.length === 0 && !(prop in shadow.liveLayer);
                    const site = upstream ? fluid.upstreamSite(shadow, nextSegs) : {shadow, segs: nextSegs};
                    fluid.setForComponent(site.shadow.that, site.segs, value);
                });
                return true;
            };
            // A deletion of a member sourced from another site, e.g. `delete item.todo` for an iteration variable,
            // follows the fish upstream and removes the original element from its source
            const deleteHandler = function (target, prop) {
                fluid.expectLiveComponent(shadow, prop);
                fluid.cell.untracked(() => {
                    const site = fluid.upstreamSite(shadow, [...segs, prop]);
                    fluid.deleteForComponent(site.shadow.that, site.segs);
                });
                return true;
            };

            const proxy = new Proxy(target, {
                get: getHandler,
                set: setHandler,
                deleteProperty: deleteHandler,
                // Pattern described at https://stackoverflow.com/a/50139861/1381443
                // Each of these tolerates material which has gone away, as getHandler does
                ownKeys: () => {
                    return Reflect.ownKeys(Object(fluid.deSignalSoft(target) ?? {}));
                },
                getOwnPropertyDescriptor: function (target, prop) {
                    return Reflect.getOwnPropertyDescriptor(Object(fluid.deSignalSoft(target) ?? {}), prop);
                },
                getPrototypeOf: () => {
                    const deTarget = fluid.deSignalSoft(target);
                    return deTarget === undefined || deTarget === null ? null : Object.getPrototypeOf(deTarget);
                }
            });
            return rec.proxy = proxy;
        }
    };

    // Get the underlying value hosted by a proxy. Besides test cases, this is of value in performance-critical code,
    // such as a loop over many rows of component material - reads of the bare value skip the proxy's per-access
    // tracking, which can cost many times the work of the loop itself. Such reads are not tracked as dependencies
    fluid.unwrapProxy = function (maybeProxy) {
        const target = maybeProxy?.[$t];
        return target ? fluid.deSignal(target) : maybeProxy;
    };

    /**
     * Upgrade the user arguments supplied to a free component's creator function before they are applied as its user
     * layer. This is overridden in FluidView.js to forward a `container` argument to the component's view.
     * @param {Object} argLayer - The user arguments
     * @return {Object} The upgraded user arguments
     */
    fluid.upgradeFreeComponentArgs = argLayer => argLayer;

    fluid.initFreeComponent = function (componentName, ...initArgs) {
        // TODO: Perhaps one day we will support a directive which allows the user to select a current component
        // root for free components other than the global root - fluid.initChildComponent constructs one elsewhere
        return fluid.initComponentInShadow(fluid.globalInstantiator.rootShadow, componentName, initArgs[0]);
    };

    /**
     * Construct a component as a child of an existing one, as a free component is constructed as a child of the root,
     * by default under a member name allocated from its name and a fresh id. This allows a host to scope the behaviour
     * of the components it constructs, e.g. through an error boundary or contexts found amongst its ancestors, whilst the
     * component remains free in that it is not declared by its parent's layers. It is destroyed by
     * `fluid.destroyComponent`. A host which reconstructs a component, e.g. on undoing its deletion, may supply a member
     * name of its own, so that the component keeps its path within the tree - see `fluid.history.arenaRoot`.
     * @param {fluid.component} parent - The component which is to hold the fresh one
     * @param {String} componentName - The name of the fresh component's principal layer
     * @param {Object} [argLayer] - User arguments for the fresh component, which may include further `$layers`
     * @param {String} [memberName] - The member name under which the fresh component is to be held
     * @return {fluid.component} The proxy for the fresh component, which may not yet be available
     */
    fluid.initChildComponent = function (parent, componentName, argLayer, memberName) {
        return fluid.initComponentInShadow(parent[$t].shadow, componentName, argLayer, memberName);
    };

    /**
     * Construct a free component as a child of the component with the supplied shadow - see `fluid.initChildComponent`
     * @param {Shadow} parentShadow - The shadow of the component which is to hold the fresh one
     * @param {String} componentName - The name of the fresh component's principal layer
     * @param {Object} [argLayerIn] - User arguments for the fresh component, which may include further `$layers`
     * @param {String} [memberName] - The member name under which the fresh component is to be held - by default, one
     * allocated from its name and its id
     * @return {fluid.component} The proxy for the fresh component, which may not yet be available
     */
    fluid.initComponentInShadow = function (parentShadow, componentName, argLayerIn, memberName) {
        const id = fluid.allocateId();
        const instanceName = memberName ?? fluid.computeGlobalMemberName(componentName, id);

        // Currently just a single initial argument is supported - perhaps one day we might revive "argMaps" looked up by componentName
        const argLayer = fluid.upgradeFreeComponentArgs(argLayerIn || {});
        const ourLayerNames = [componentName].concat(fluid.makeArray(argLayer.$layers));

        const userLayerRecord = {
            mergeRecordType: "user",
            layer: {
                ...argLayer
            }
        };
        const potentia = {
            props: {$id: id},
            layerNames: ourLayerNames,
            mergeRecords: [userLayerRecord]
        };

        const computer = fluid.computeInstance(potentia, parentShadow, instanceName);
        computer.get();

        const proxy = fluid.proxyMat(computer, computer.shadow, []);
        return proxy;
    };

    // AVATARS

    /**
     * Allocate the area at the root of the component tree which holds the avatars of layers. This is inert, and hence
     * so is every component constructed within it - see Shadow.inert
     * @param {fluid.instantiator} instantiator - The instantiator whose component tree is to hold the area
     * @return {fluid.component} The component forming the area
     */
    fluid.allocateAvatarsComponent = function (instantiator) {
        const avatars = instantiator.allocateSimpleComponent(instantiator.rootShadow, "avatars", {$layers: ["fluid.component"]});
        avatars[$m].inert = true;
        return avatars;
    };

    /**
     * Retrieve the shadow of the area at the root of the component tree which holds the avatars of layers, allocating
     * it if required
     * @param {fluid.instantiator} [instantiator] - The instantiator whose avatars are required - defaults to the global one
     * @return {Shadow} The shadow of the avatars area
     */
    fluid.avatarsShadow = function (instantiator = fluid.globalInstantiator) {
        instantiator.avatarsComponent ||= fluid.allocateAvatarsComponent(instantiator);
        return instantiator.avatarsComponent[$m];
    };

    /**
     * Retrieve the avatar of a layer, allocating it if required. This is an "early instantiation" of a component bearing
     * just that layer, held in the avatars area at the root of the component tree. An avatar is inert (see
     * Shadow.inert) - it has no effect on the rest of the system, but otherwise merges, expands and constructs itself
     * as any other component. Its instantiation will often be incomplete through missing prerequisites, e.g. references
     * to components which are only found where the layer is genuinely deployed, which render just the members depending
     * on them unavailable - all others, including computed ones, may be read through the returned proxy as for any
     * component. If any of its layers is unavailable, e.g. whilst it is loading, the avatar is unavailable as a whole,
     * but its merged layer structure remains inspectable via `fluid.avatarMerged`. What an avatar accumulates includes
     * all that the layer brings to a component, including material arriving
     * through its parent layers or broadcast onto it by linkage, which a shallow inspection of its definition by
     * `fluid.def` would miss. An avatar persists once allocated, tracking any redefinition of its layers, until its
     * own layer is deleted.
     * @param {String} layerName - The name of the layer whose avatar is required
     * @return {Proxy<fluid.component>} A proxy for the avatar component
     */
    fluid.avatar = function (layerName) {
        const avatarsShadow = fluid.avatarsShadow();
        const memberName = fluid.avatarMemberName(layerName);
        const shadow = avatarsShadow.childComponents[memberName] ||
            fluid.computeInstance({layerNames: [layerName], mergeRecords: []}, avatarsShadow, memberName).shadow;
        return fluid.proxyMat(shadow.computer, shadow, []);
    };

    /**
     * Compute the member name at which a layer's avatar is held in the avatars area. Since this is a path segment it
     * is escaped as required when composed into the avatar's path.
     * @param {String} layerName - The name of the layer
     * @return {String} The avatar's member name
     */
    fluid.avatarMemberName = layerName => layerName;

    /**
     * Retrieve the merged layer structure of a layer's avatar, as described for `fluid.avatar`. This is available
     * whether or not the avatar's instantiation succeeded, and when read within a reactive context will update as
     * the layer or any of those it accumulates are redefined. Its members are raw configuration - e.g. a member
     * defined by a `$compute` record holds the record rather than its value, which is read through the avatar itself.
     * @param {String} layerName - The name of the layer whose merged structure is required
     * @return {Object} The avatar's merged layer structure, holding at `$layers` the full resolved list of its layers
     */
    fluid.avatarMerged = function (layerName) {
        return fluid.avatar(layerName)[$t].shadow.flatMerged.get();
    };

    /**
     * Destroy the avatar of a layer, if it has one - this is done when the layer is deleted
     * @param {String} layerName - The name of the layer whose avatar is to be destroyed
     */
    fluid.destroyAvatar = function (layerName) {
        const avatarsComponent = fluid.globalInstantiator.avatarsComponent;
        const shadow = avatarsComponent?.[$m].childComponents[fluid.avatarMemberName(layerName)];
        if (shadow) {
            fluid.destroyComponent(fluid.proxyMat(shadow.computer, shadow, []));
        }
    };

    /** Destroys a component held at the specified path. The parent path must represent a component, although the component itself may be nonexistent
     * @param {String|String[]} path - Path where the new component is to be destroyed, represented as a string or array of string segments
     * @param {fluid.instantiator} [instantiator] - [optional] The instantiator holding the component to be destroyed - if blank, the global instantiator will be used.
     */
    fluid.destroy = function (path, instantiator) {
        instantiator = instantiator || fluid.globalInstantiator;
        const segs = fluid.parsePath(path);
        if (segs.length === 0) {
            fluid.fail("Cannot destroy the root component");
        }
        const that = instantiator.pathToComponent[path];
        fluid.destroyComponent(that);
    };

    fluid.emptyPotentia = Object.freeze({layerNames: [], mergeRecords: []});

    /**
     * Determines whether a given Potentia object is empty, meaning it has no associated layers or merge records.
     * @param {Potentia} potentia - The Potentia object to check.
     * @return {Boolean} `true` if the Potentia object is empty; otherwise, `false`.
     */
    fluid.isEmptyPotentia = function (potentia) {
        return potentia.layerNames.length === 0 && potentia.mergeRecords.length === 0;
    };

    // TODO: Special syntax to just access signal
    /**
     * Destroys a component. A component which has been lensed from a data item, i.e. as a member of a `$for`-driven
     * component list, is not destroyed in place but by deleting the item from its original source, following the fish
     * upstream as for the delete proxy - the component list then destroys the component in turn. Any other component is
     * destroyed by resetting its Potentia, removing all layer names and merge records.
     * @param {ComponentComputer} proxy - The component to be destroyed.
     */
    fluid.destroyComponent = function (proxy) {
        const shadow = proxy[$t].shadow;
        if (shadow.lensedSite) {
            const site = fluid.upstreamSite(shadow.lensedSite.shadow, shadow.lensedSite.segs);
            fluid.deleteForComponent(site.shadow.that, site.segs);
        } else {
            shadow.potentia.set(fluid.emptyPotentia);
        }
    };

    fluid.def("fluid.component", {
        destroy: "$method:fluid.destroyComponent({self})",
        $variety: "framework"
    });

    fluid.def("fluid.componentList", {
        $layers: "fluid.component",
        $variety: "framework"
    });

    // The grade supplied to components which will be resolvable from all parts of the component tree
    fluid.def("fluid.resolveRoot", {$layers: "fluid.component", $variety: "framework"});
    // In addition to being resolvable at the root, "resolveRootSingle" component will have just a single instance available. Fresh
    // instances will displace older ones.
    fluid.def("fluid.resolveRootSingle", {$layers: "fluid.resolveRoot", $variety: "framework"});

    fluid.constructRootComponents(fluid.globalInstantiator); // currently a singleton - in future, alternative instantiators might come back

    // By default the whole component tree forms the arena whose live state is recorded - see fluid.history.arenaRoot
    fluid.history.arenaRoot = fluid.globalInstantiator.rootShadow;

};

if (typeof(fluid) !== "undefined") {
    $fluidILScope(fluid);
}
