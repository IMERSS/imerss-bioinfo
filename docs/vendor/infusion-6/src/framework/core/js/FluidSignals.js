"use strict";

// import fluid from "./FluidCore.js"

const $fluidSignalsScope = function (fluid) {

    /**
     * Compares two values for equality, with special handling for numbers and NaN.
     * - For non-number types, uses strict equality (===).
     * - For numbers, considers them equal if:
     *   - They are strictly equal, or
     *   - Both are NaN, or
     *   - Their relative error is less than 1e-12 (to account for floating-point precision).
     *
     * @param {Any} a - The first value to compare.
     * @param {Any} b - The second value to compare.
     * @return {Boolean} `true` if the values are considered equal, `false` otherwise.
     */
    fluid.defaultEquality = function (a, b) {
        if (typeof(a) !== "number" || typeof(b) !== "number") {
            return a === b;
        } else {
            // Don't use isNaN because of https://developer.mozilla.org/en/docs/Web/JavaScript/Reference/Global_Objects/isNaN#Confusing_special-case_behavior
            if (a === b || a !== a && b !== b) { // Either the same concrete number or both NaN
                return true;
            } else {
                const relError = Math.abs((a - b) / b);
                return relError < 1e-12; // 64-bit floats have approx 16 digits accuracy, this should deal with most reasonable transforms
            }
        }
    };

    /** Any object with a member <code>then</code> of type <code>function</code> passes this test, essentially for
     * a "foreign thenable".
     * @param {any} totest - The value to test
     * @return {Boolean} `true` if the value can be used as a promise
     */
    fluid.isPromise = function (totest) {
        return totest && typeof(totest.then) === "function";
    };

    /**
     * Removes an element from an array at the specified index by replacing it with the last element,
     * then removing the last element. This is an efficient way to remove an item without preserving order.
     *
     * @param {Array} array - The array from which to remove the element.
     * @param {Number} index - The index of the element to remove.
     */
    fluid.removeAtIndex = function (array, index) {
        array[index] = array[array.length - 1];
        array.pop();
    };

    /**
     * Removes the first occurrence of a specified value from an array, if present.
     *
     * @param {Array} array - The array from which to remove the value.
     * @param {any} value - The value to remove from the array.
     */
    fluid.removeArrayElement = function (array, value) {
        const index = array.indexOf(value);
        if (index !== -1) {
            array.splice(index, 1);
        }
    };

    /** Implementation structure taken from Reactively at https://github.com/milomg/reactively/blob/main/packages/core/src/core.ts
     *
     * Nodes for constructing a reactive graph of reactive values and reactive computations.
     *
     * We call input nodes 'roots' and the output nodes 'leaves' of the graph here in discussion,
     * but the distinction is based on the use of the graph, all nodes have the same internal structure.
     * Changes flow from roots to leaves. It would be effective but inefficient to immediately propagate
     * all changes from a root through the graph to descendant leaves. Instead we defer change
     * most change propagation computation until a leaf is accessed. This allows us to coalesce computations
     * and skip altogether recalculating unused sections of the graph.
     *
     * Each reactive node tracks its sources and its observers (observers are other
     * elements that have this node as a source). Source and observer links are updated automatically
     * as observer reactive computations re-evaluate and call get() on their sources.
     *
     * Each node stores a cache state to support the change propagation algorithm: 'clean', 'check', or 'dirty'
     * In general, execution proceeds in three passes:
     *  1. set() propogates changes down the graph to the leaves
     *     direct children are marked as dirty and their deeper descendants marked as check
     *     (no reactive computations are evaluated)
     *  2. get() requests that parent nodes updateIfNecessary(), which proceeds recursively up the tree
     *     to decide whether the node is clean (parents unchanged) or dirty (parents changed)
     *  3. updateIfNecessary() evaluates the reactive computation if the node is dirty
     *     (the computations are executed in root to leaf order)
     */

    // Global state for tracking reactive context

    fluid.trackingVars = {
        /** current capture context for identifying reactive elements
        active while evaluating a reactive function body  */
        // The current Edge whose _fn is in execution
        CurrentReaction: null,
        // Becomes set if the _fn begins to demand a source which is out of step with any of its previously recorded ones
        CurrentGets: null,
        // Tracks along the current array of sources as _fn executes and demands dependents - stores the last index at which
        // demands agree with previous execution
        CurrentGetsIndex: 0
    };

    const $t = fluid.trackingVars;

    /**
     * @enum {Number}
     * @typedef {Number} CacheState
     * @property {Number} CacheClean - The cache is clean (no changes).
     * @property {Number} CacheCheck - The cache needs to be checked (potential changes).
     * @property {Number} CacheDirty - The cache is dirty (changes detected).
     */

    fluid.CacheClean = 0; // light blue
    fluid.CacheCheck = 1; // green
    fluid.CacheDirty = 2; // red

    const CacheClean = fluid.CacheClean,
        CacheCheck = fluid.CacheCheck,
        CacheDirty = fluid.CacheDirty;

    /**
     * A "fit" or connected region of updating graph
     * @typedef {Object} Fit
     * @property {Cell[]} targetsConsumed - An array of cells for which the _consumedSources member has been set during this fit.
     * @property {String[]} sources - An array of source names, supplied to fluid.set, with which this fit has been marked
     * @property {Boolean} isActive - Indicates if this fit is currently active.
     */

    /**
     * A reactive cell
     * @typedef {Object} Cell
     *
     * @property {function(Boolean=, Boolean=): any} get - Retrieves the current value of the cell.
     * @property {function(any): void} set - Sets a new value for the cell.
     * @property {function(Function, Array<Cell>, ComputedProps=): Cell} computed - Sets up or tears down a reactive computation
     * for the cell, which may be asynchronous by returning a promise or async iterable.
     *
     * @property {any} _value - The current value stored in the cell.
     * @property {String|undefined} [name] - A name or address for the cell.
     * @property {CacheState} _state - The cache state of the cell (clean, check, or dirty).
     * @property {CacheState} _prePendingState - A "high watermark" of our _state at the point we went into a pending state
     * @property {Cell|null} _dirtyFrom - Cell from along which we were dirtied
     * @property {Map<Cell, Number>|null} _observers - Cells that have us as sources (out links), in the order in which
     * they began to observe us, each with the number of times it does so - see fluid.cell.addObserver
     * @property {Edge[]|null} _inEdges - Array of incoming edges which could update this node
     * @property {Cell[]|null} _consumedSources - Sources from which arcs have been traversed during this fit
     * @property {CellTrackingRecord|null} _trackingRecord - Captures dynamic dependency tracking information for an update which is in progress
     * @property {Number} _inFlight - The number of promises returned by the cell's asynchronous computation which have
     * yet to settle - an earlier one may settle whilst a later one is outstanding, e.g. one validating a later edit
     * @property {CacheState} _restale - The greatest staleness with which the cell was marked whilst its own update was in
     * progress, e.g. by an effect writing a value which one of its sources depends on, which is restored once the update
     * completes rather than being lost when the cell is marked clean - see fluid.cell.updateIfNecessary. A computed cell
     * is only so marked by a change to a source whose value its update has already received
     * @property {Set<Cell>|null} _receivedThisUpdate - The sources whose values the update in progress has received
     * @property {Boolean} _isEffect - Is this an effect node
     * @property {Boolean} _isQueued - If an effect, are we queued?
     * @property {Boolean} _checking - Whether fluid.cell.updateIfNecessary is bringing the cell up to date
     * @property {Fit|null} _fit - The current update fit that the cell is enlisted in
     */

    /** An edge between two reactive cells
     * @typedef {Object} Edge
     * @property {Cell} target - The cell that we are the edge to (a computer for)
     * @property {Cell|null} key - The key for the edge, either the first staticSource or null if there are not any
     * @property {Cell[]|null} sources - Sources in reference order, not deduplicated (in links)
     * @property {Cell[]|null} staticSources - Static sources supplied
     * @property {Function} fn - The function to be called to compute the value
     * @property {Boolean} isAsync - Set once the edge's computation has returned a promise or async iterable, after which
     * each update along it is treated as asynchronous from the outset - see fluid.cell.update
     * @property {Boolean} isFree - Indicates if the edge's computation should be invoked on unavailable values
     * @property {any} includeSource - If a source is required for propagation across this edge. A source is usually a
     * String, but may be any value compared by identity, e.g. the shadow of a component - see `excludeSource: "self"` in
     * fluid.expandEffectRecord
     * @property {any} excludeSource - If an update with a particular source should not propagate across this edge
     * @property {Function|null} mapArg - Optional function to be applied to map any arguments supplied to `fn`
     * @property {Function|null} dispatcher - Optional function to take charge of dispatch to `fn`
     */

    /**
     * @typedef {Object} CellTrackingRecord
     * @property {Edge|null} prevReaction - The previous global reaction context.
     * @property {Cell[]|null} prevGets - The previous list of demanded source cells.
     * @property {Number} prevIndex - The previous index in the sources array.
     */

    /**
     * Creates a new reactive cell for managing state and computations.
     *
     * @param {any|undefined} [initialValue] - The initial value to store in the cell.
     * @param {Object} [props] - Additional properties to contextualise the cell
     * @return {Cell} The newly created cell object.
     */
    fluid.cell = function (initialValue, props) {
        const cell = Object.create(fluid.cellPrototype);
        cell._isUntracked = false;
        Object.assign(cell, props);

        cell.cellId = fluid.cell.cellId++;
        cell._value = initialValue === undefined ? fluid.cell.initialUnavailable : initialValue;
        cell._dirtyFrom = null;
        cell._observers = null; // nodes that have us as sources (outgoing links)
        cell._inEdges = null;
        cell._consumedSources = null;
        cell._checking = false;
        cell._fit || (cell._fit = null);

        cell._state = CacheClean;
        cell._prePendingState = null;
        cell._trackingRecord = null;

        return cell;
    };

    /** A list of non-clean 'effect' nodes that will be updated when stabilize() is called */
    fluid.cell.EffectQueue = [];

    /* fn to call to notify that there are dirty effect nodes - assigned by fluid.cell.autoStabilize, by default to
     * fluid.cell.deferredStabilize once that is defined */
    fluid.cell.queueStabilize = () => {};

    fluid.cell.cellId = 0;

    /**
     * Record that a cell observes a source, once more. Since an edge's sources are not deduplicated, a cell may observe
     * the same source several times, and is counted each time, so that it remains an observer until it has been
     * removed as many times as it was added. A map is used rather than an array of observers since a widely-shared
     * source, e.g. the definition of a base layer, may acquire tens of thousands of observers, from which each removal
     * would otherwise be a linear search.
     * @param {Cell} source - The cell which is observed
     * @param {Cell} observer - The cell which observes it
     */
    fluid.cell.addObserver = function (source, observer) {
        if (!source._observers) {
            source._observers = new Map();
        }
        source._observers.set(observer, (source._observers.get(observer) || 0) + 1);
    };

    /**
     * Withdraw one record that a cell observes a source - see fluid.cell.addObserver
     * @param {Cell} source - The cell which is observed
     * @param {Cell} observer - The cell which observes it
     */
    fluid.cell.removeObserver = function (source, observer) {
        const count = source._observers?.get(observer);
        if (count === 1) {
            source._observers.delete(observer);
        } else if (count !== undefined) {
            source._observers.set(observer, count - 1);
        }
    };

    // Separately capture this so that calls to fluid.cell can be wrapped
    fluid.cellPrototype = fluid.cell.prototype;

    fluid.cell.initialUnavailable = Object.freeze(fluid.unavailable({
        staleValue: undefined
    }, "config"));

    /** @type {Fit[]} Array of all currently active fits */
    // The fits currently open, in the order they were started - a Set so that ending one is cheap with many open
    fluid.cell.CurrentFits = new Set();

    fluid.cell.fitId = 0;

    /**
     * A transaction propagating one change through the reactive graph
     * @typedef {Object} Fit
     * @property {Cell[]} targetsConsumed - The cells enlisted in the fit
     * @property {any[]} sources - The source markers carried by the fit, as supplied to `cell.set`
     * @property {Boolean} isActive - `false` once the fit has ended
     * @property {Number} fitId - A unique id for the fit
     * @property {Boolean} staticFit - `true` for a fit allocated by the framework, which is never ended
     * @property {Boolean} held - `true` once the fit has been held open past the end of the stabilization pass which
     * propagated it, by effects which are still pending - see fluid.cell.releaseFit
     */

    fluid.cell.makeFit = (staticFit) => ({
        targetsConsumed: [],
        sources: [],
        isActive: true,
        fitId: fluid.cell.fitId++,
        staticFit,
        held: false
    });

    fluid.cell.frameworkFit = fluid.cell.makeFit(true);

    fluid.cell.idleSignal = fluid.cell(true, {name: "Global idle signal", _fit: fluid.cell.frameworkFit});


    /**
     * Filter the cells enlisted in a fit for those which hold it open - effects which are pending, and, if the fit carries
     * sources, asynchronous computations which are pending, so that its sources are carried to the change which their
     * eventual value brings about, e.g. to the effects which it reaches once a validation settles
     * @param {Fit} fit - The fit
     * @param {Cell[]} targets - The cells enlisted in the fit
     * @return {Cell[]} The cells which hold the fit open
     */
    fluid.cell.filterFitHolders = function (fit, targets) {
        const pendingEffects = fluid.cell.filterPendingEffects(targets);
        return fit.sources.length === 0 ? pendingEffects : pendingEffects.concat(targets.filter(target => !target._isEffect &&
            !!target._inEdges && target._inEdges.some(edge => edge.isAsync) && fluid.cell.isAwaiting(target)));
    };

    /**
     * Determine whether an asynchronous computation is still awaiting a result - either it is pending, or a promise it
     * returned is outstanding although an earlier one has since settled
     * @param {Cell} cell - The cell holding the computation
     * @return {Boolean} `true` if the cell is awaiting a result
     */
    fluid.cell.isAwaiting = function (cell) {
        return fluid.isPending(cell._value) || cell._inFlight > 0;
    };

    fluid.cell.filterPendingEffects = function (effects) {
        return effects.filter((oneEffect) => {
            // A disposed effect has no further obligations, and so cannot hold its fit open
            return oneEffect._isEffect && !oneEffect._isDisposed ? fluid.isPending(oneEffect.get(false, true)) : false;
        });
    };

    /** Allocate a new fit
     * @return {Fit} A freshly allocated fit
     */
    fluid.cell.startFit = () => {
        const fit = fluid.cell.makeFit(false);
        fluid.cell.CurrentFits.add(fit);
        fluid.cell.idleSignal.set(false);
        return fit;
    };

    /**
     * Determine whether a cell enlisted in a fit has since been enlisted in another one which is active, e.g. a pending
     * effect of a held fit which has been triggered afresh - the fit then has no further claim on it
     * @param {Cell} target - A cell enlisted in the fit
     * @param {Fit} fit - The fit
     * @return {Boolean} `true` if the cell has moved to another active fit
     */
    fluid.cell.hasMovedFit = function (target, fit) {
        return target._fit !== fit && target._fit !== null && target._fit.isActive;
    };

    fluid.cell.flushFit = function (fit, coalesce, ending) {
        fit.targetsConsumed.forEach(target => {
            if (!fluid.cell.hasMovedFit(target, fit)) {
                target._consumedSources.length = 0;
                if (ending) {
                    target._fit = null;
                }
                if (!coalesce) {
                    target._prePendingState = null;
                }
            }
        });
        fit.targetsConsumed.length = 0;
    };

    /**
     * Release from a fit, held open past the end of the stabilization pass which propagated it by effects which are
     * still pending, all of its cells other than those effects and any other cells which are pending. The fit continues
     * to carry its sources to the pending cells, e.g. to the downstream of an asynchronous computation once it settles,
     * but a fresh change to any released cell is no longer enlisted in it, and so does not appear to carry its sources.
     * A cell which began the fit by being set with a source is not enlisted as one of its targets, and so is not released
     * here - it is disregarded by fluid.cell.findFit, and leaves the fit when it is next set
     * @param {Fit} fit - The fit to be released
     */
    fluid.cell.releaseFit = function (fit) {
        fit.held = true;
        const retained = [];
        fit.targetsConsumed.forEach(target => {
            if (fluid.cell.isAwaiting(target) && !fluid.cell.hasMovedFit(target, fit)) {
                retained.push(target);
            } else if (target._fit === fit) {
                target._consumedSources.length = 0;
                target._prePendingState = null;
                target._fit = null;
            }
        });
        fit.targetsConsumed.length = 0;
        fit.targetsConsumed.push(...retained);
    };

    /** End the current "fit" (transaction) which is updating the reactive graph by resetting all the arcs which
     * have been marked as consumed by one leg of bidirectional update arcs.
     * @param {Fit|null} fit - The fit to end
     * @param {Boolean} [coalesce] - If this fit is being coalesced into another
     */
    fluid.cell.endFit = function (fit, coalesce) {
        if (fit !== null && fit.isActive && !fit.staticFit) {
            fluid.cell.flushFit(fit, coalesce, true);

            fit.isActive = false;
            fluid.cell.CurrentFits.delete(fit);
            if (fluid.cell.CurrentFits.size === 0) {
                fluid.cell.idleSignal.set(true);
            }
        }
    };

    /**
     * End each of a collection of fits, other than those which are held open by effects which are still pending
     * @param {Iterable<Fit>} touchedFits - The fits to be ended
     * @param {Boolean} [release] - If `true`, the propagation of these fits is complete, e.g. at the end of a
     * stabilization pass, and any fit held open is released by fluid.cell.releaseFit
     * @return {Fit[]} The fits which remain open
     */
    fluid.cell.endFits = function (touchedFits, release) {
        const pendingFits = [];
        fluid.cell.untracked( () => {
            // Iterate over a copy, since endFit removes the fit from fluid.cell.CurrentFits, which may be the argument
            [...touchedFits].forEach(oneFit => {
                const ownTargets = oneFit.targetsConsumed.filter(target => !fluid.cell.hasMovedFit(target, oneFit));
                const holders = fluid.cell.filterFitHolders(oneFit, ownTargets);
                if (holders.length === 0) {
                    fluid.cell.endFit(oneFit);
                } else {
                    if (release && !oneFit.staticFit) {
                        fluid.cell.releaseFit(oneFit);
                    }
                    pendingFits.push(oneFit);
                }
            });
        });
        return pendingFits;
    };

    /** Report the cause of any reaction which has updated a given cell, or else the one that is currently
     * in progress, in the form of an array of nodes reaching back from the supplied cell to the one whose modification
     * triggered the reaction.
     * @param {Cell} [inTarget] - If supplied, the cell whose update cause should be reported. If absent, any current
     * reaction will be used instead.
     * @return {Cell[]|null} - An array of nodes starting with either [inTarget] or the one targetted by the current
     * reaction, reaching back to the node whose update caused the reaction, or else `null` if no valid target was supplied.
     */
    fluid.cell.findCause = function (inTarget) {
        const useTarget = inTarget || $t.CurrentReaction?.target;
        if (useTarget) {
            const cause = [];
            let target = useTarget;
            do {
                // Don't currently try to report cyclic causes
                if (!cause.includes(target)) {
                    cause.push(target);
                    target = target._dirtyFrom;
                } else {
                    target = null;
                }
            } while (target);
            return cause;
        } else {
            return null;
        }
    };

    fluid.cell.findAllCauses = function (inEdge) {
        const currentEdge = inEdge || $t.CurrentReaction;
        let allCauses = [];
        if (currentEdge.sources) {
            // Gather causes from each source
            const extraCauses = currentEdge.sources.flatMap(source => fluid.cell.findCause(source));
            allCauses = allCauses.concat(extraCauses);
        }
        return Array.from(new Set(allCauses));
    };

    /**
     * Adds the given sources to the list of culled sources for a specific target cell. This signals that one
     * leg of a bidirectional arc has been travelled and that the reverse arc should be ignored for this fit.
     *
     * @param {Cell} target - The target cell for which sources are being culled.
     * @param {Array[Cell]} inSources - The array of source cells to be added to the culled sources list.
     */
    /**
     * Determine whether an update of a cell along an edge needs to be enlisted in a fit before it is computed. A fit
     * serves to record the traversal of one leg of a bidirectional arc, so that the reverse leg is not traversed within
     * the same update, and to carry the source markers supplied to `cell.set`. Neither is needed by an update which
     * touches no active fit and whose edge has no reverse arc, e.g. the first pull of a freshly constructed computed
     * cell, which is then not enlisted - other than an update along an edge known to be asynchronous, which always is. An
     * edge is first found to be asynchronous when its computation returns a promise or async iterable, whereupon that
     * update is enlisted before it is marked pending. An effect which is pending after an update is enlisted afterwards,
     * so that it holds a fit open - see fluid.cell.update.
     * @param {Cell} target - The cell which is to be updated
     * @param {Edge} inEdge - The edge along which it is to be updated
     * @return {Boolean} `true` if the update is to be enlisted in a fit
     */
    fluid.cell.needsFit = function (target, inEdge) {
        const sources = inEdge.sources;
        const isActive = cell => cell._fit !== null && cell._fit.isActive;
        // A source which observes the target, or will once its edge is first computed, is the far end of a reverse arc
        const hasReverseArc = source => !!source._inEdges && source._inEdges.some(edge =>
            edge.sources?.includes(target) || edge.staticSources?.includes(target));
        return inEdge.isAsync || isActive(target) || !!sources && (sources.some(isActive) || sources.some(hasReverseArc));
    };

    fluid.cell.enlistInFit = function (target, inSources) {
        const sourceFits = [];
        const storeFit = function (sourceFit) {
            if (sourceFit !== null && sourceFit.isActive && !sourceFits.includes(sourceFit)) {
                sourceFits.push(sourceFit);
            }
        };
        if (inSources) {
            for (let i = 0; i < inSources.length; ++i) {
                const sourceFit = inSources[i]._fit;
                storeFit(sourceFit);
            }
        }
        // A cell triggered afresh leaves a fit held open by pending effects, rather than adopting its sources
        if (!target._fit?.held) {
            storeFit(target._fit);
        }

        let fit = null;
        if (sourceFits.length === 0) {
            fit = fluid.cell.startFit();
        } else {
            fit = sourceFits[0];
            if (!fit.staticFit) {
                for (let i = 1; i < sourceFits.length; ++i) {
                    const extraFit = sourceFits[i];

                    Array.prototype.push.apply(fit.targetsConsumed, extraFit.targetsConsumed);
                    Array.prototype.push.apply(fit.sources, extraFit.sources);
                    fluid.cell.endFit(extraFit, true);
                }
            }
        }
        if (!fit.staticFit) {
            const targetsConsumed = fit.targetsConsumed;
            if (!targetsConsumed.includes(target)) {
                targetsConsumed.push(target);
            }

            const sources = target._consumedSources || [];
            Array.prototype.push.apply(sources, inSources);
            target._consumedSources = sources;
        }

        target._fit = fit;
    };


    fluid.cell.equals = fluid.defaultEquality;

    // Dynamic dependency tracking logic

    /**
     * Begins the update process for a reactive cell by saving the current update context.
     * Stores the cell's previous value and the current global reaction state, then sets up
     * the new reaction context for the update. This function is used internally to manage
     * nested or recursive updates in the reactive graph.
     *
     * @param {Cell} cell - The reactive cell being updated.
     * @param {Edge|null} inEdge - The edge representing the computation or dependency being updated.
     */
    fluid.cell.beginTracking = function (cell, inEdge) {
        cell._receivedThisUpdate = null;
        const trackingRecord = {
            prevReaction: $t.CurrentReaction,
            prevGets: $t.CurrentGets,
            prevIndex: $t.CurrentGetsIndex
        };
        cell._trackingRecord = trackingRecord;
        $t.CurrentReaction = inEdge;
        $t.CurrentGets = null;
        $t.CurrentGetsIndex = 0;
    };

    /**
     * Updates the dependency links for a reactive cell after its computation has been evaluated.
     * If the sources demanded during computation have diverged from the previous sources, this function
     * updates the edge's sources array and the observer links from the new sources to the cell.
     * If fewer sources are now demanded, removes the cell as an observer from the excess sources.
     *
     * @param {Cell} cell - The reactive cell whose dependencies are being updated.
     * @param {Edge} inEdge - The edge representing the computation or dependency being updated.
     */
    fluid.cell.updateDynamicDependencies = function (cell, inEdge) {
        // Update sources if they changed during execution -     // if the sources have changed, update source & observer links
        if ($t.CurrentGets) {
            // We diverged, inherit the unchanged portion of sources array up to CurrentGetsIndex and then splice in the excess
            fluid.cell.removeParentObservers(cell, inEdge, $t.CurrentGetsIndex);
            if (inEdge.sources && $t.CurrentGetsIndex > 0) {
                inEdge.sources.length = $t.CurrentGetsIndex + $t.CurrentGets.length;
                for (let i = 0; i < $t.CurrentGets.length; i++) {
                    inEdge.sources[$t.CurrentGetsIndex + i] = $t.CurrentGets[i];
                }
            } else {
                inEdge.sources = $t.CurrentGets;
            }

            for (let i = $t.CurrentGetsIndex; i < inEdge.sources.length; i++) {
                // Add ourselves to the end of the parent's observers
                fluid.cell.addObserver(inEdge.sources[i], cell);
            }
        } else if (inEdge.sources && $t.CurrentGetsIndex < inEdge.sources.length) {
            // We didn't diverge but demanded strictly fewer sources than our predecessor, trim the excess
            fluid.cell.removeParentObservers(cell, inEdge, $t.CurrentGetsIndex);
            inEdge.sources.length = $t.CurrentGetsIndex;
        }
    };

    /**
     * Ends the update process for a reactive cell by restoring the previous update context.
     * Restores the global reaction state, resets the cell's update record, and marks the cell as clean.
     * If the cell's value has changed and it has observers, marks its observers as dirty.
     * If there is no current reaction after ending the update, ends the current fit (transaction).
     *
     * @param {Cell} cell - The reactive cell whose update is being ended.
     */
    fluid.cell.endTracking = function (cell) {
        const trackingRecord = cell._trackingRecord;
        cell._trackingRecord = null;
        cell._receivedThisUpdate = null;

        $t.CurrentGets = trackingRecord.prevGets;
        $t.CurrentReaction = trackingRecord.prevReaction;
        $t.CurrentGetsIndex = trackingRecord.prevIndex;

    };

    /**
     * Executes a function in an "untracked" context, temporarily suspending the current reactive tracking.
     * This allows code to run without capturing dependencies.
     *
     * @param {Function} fn - The function to execute in an untracked context.
     * @return {any} Original function's return
     */
    fluid.cell.untracked = function (fn) {
        // Create fake cell to hold reaction state
        const stateCell = {};
        fluid.cell.beginTracking(stateCell, null);
        try {
            return fn();
        } finally {
            fluid.cell.endTracking(stateCell);
        }
    };

    /**
     * Reactively evaluate the current cell, ensuring its value is up to date with respect to all computed dependents,
     * within the current reactive context
     *
     * @return {any} The evaluated cell value
     * @param {Boolean} [defeatTracking] - If `true`, this cell will not be enrolled as a dependency of any other whose
     * value is currently being computed by a reaction
     * @param {Boolean} [retainFits] - If `true` this is a framework-internal dispatch, perhaps for pulling effects, and
     * any fit this cell is part of will not be closed
     * @this {Cell}
     */
    fluid.cell.prototype.get = function (defeatTracking = false, retainFits = false) {
        const tracked = !defeatTracking && !this._isUntracked;
        if (tracked) {
            fluid.cell.trackRead(this);
        }

        // Update if we have in edges and might be stale
        if (this._inEdges) {
            fluid.cell.updateIfNecessary(this);
        }
        // Record that the reader has now received our value - a later change to it in the course of the reader's update
        // leaves the reader stale - see fluid.cell.markStale
        const reader = tracked ? $t.CurrentReaction?.target : undefined;
        if (reader && reader._trackingRecord) {
            (reader._receivedThisUpdate ||= new Set()).add(this);
        }

        // A fit carrying sources is held open until the end of the stabilization pass, rather than being ended by this read,
        // so that its sources reach effects downstream of cells read along the way, e.g. in merging a component's layers
        if (!retainFits && this._fit && this._fit.sources.length === 0) {
            fluid.cell.endFits([this._fit]);
        }

        return this._value;
    };

    /**
     * Tracks a read operation on a cell within the current reaction context.
     * @param {Object} cell - The cell object being read.
     */
    fluid.cell.trackRead = function (cell) {
        if ($t.CurrentReaction) {
            if (
                !$t.CurrentGets &&
                $t.CurrentReaction.sources &&
                $t.CurrentReaction.sources[$t.CurrentGetsIndex] === cell
            ) {
                // No divergence with previous _sources and none is requested - simply step along the array of _sources
                $t.CurrentGetsIndex++;
            } else {
                // Divergence needs to begin - allocate a fresh array and record this source as demanded
                if (!$t.CurrentGets) {
                    $t.CurrentGets = [cell];
                }
                else {
                    // Divergence in progress, record this source as demanded
                    $t.CurrentGets.push(cell);
                }
            }
        }
    };

    /**
     * @typedef {Object} ComputedProps
     * @property {Boolean} isFree - Indicates if this is a "free" computation that will deliver unavailable values
     * @property {Function} [mapArg] - Optional function to map arguments supplied to computation
     * @property {any} [key] - The identity of the relation amongst the cell's relations, overriding its first static
     * source - e.g. the path of the site in the component tree from which the relation is made, which survives the
     * replacement of the cells along it. See `fluid.cell.edgeKey`
     */

    /**
     * Determine the key identifying a computed relation amongst those of its cell - see `fluid.cell.prototype.computed`
     * @param {Cell[]} [staticSources] - The static sources of the relation
     * @param {ComputedProps} [props] - The properties of the relation, whose `key`, if any, takes precedence
     * @return {any} The relation's key
     */
    fluid.cell.edgeKey = function (staticSources, props) {
        return props?.key !== undefined ? props.key : staticSources && staticSources[0] || null;
    };

    /**
     * Establish a computed relation which will lazily and reactively compute this cell's value given the values of a number
     * of other cells with which the relationship is made, or tear down such relation. These relations are keyed by any `key`
     * supplied in `props`, or else by the first member of any `staticSources` supplied as arguments of the relation, or
     * `null` if there are no such sources. A relation established with the key of an existing one replaces it.
     *
     * @param {Function|null} fn - The function which will reactively evaluate this cell's value, or null if an existing relation
     * is to be torn down. If it returns a promise, the cell is pending until the promise settles, and then holds the value it
     * resolves to, or an unavailable value if it rejects. If it returns an async iterable, e.g. from an async generator
     * function, the cell is pending until the first value is yielded and then holds each value yielded in turn.
     * @param {Cell[]} [staticSources] - Any statically known cell dependencies whose reactively evaluated arguments will be supplied
     * to `fn` when it is called.
     * @param {ComputedProps} [props] - Any additional properties to configure the relation
     * @return {Cell} This cell
     * @this {Cell}
     */
    fluid.cell.prototype.computed = function (fn, staticSources, props) {
        const key = fluid.cell.edgeKey(staticSources, props);
        if (!this._inEdges) {
            this._inEdges = [];
        }
        const inEdgeIndex = this._inEdges.findIndex(edge => edge.key === key);
        /** @type {Edge} **/
        let inEdge = inEdgeIndex === -1 ? null : this._inEdges[inEdgeIndex];

        if (!fn) {
            // Remove computation - part of middle block of Milo's .set
            if (inEdge) {
                fluid.cell.removeParentObservers(this, inEdge, 0);
                fluid.removeAtIndex(this._inEdges, inEdgeIndex);
            }
            return this;
        } else {
            const oldFn = inEdge?.fn;
            if (!inEdge) {
                inEdge = Object.create(null);
                inEdge.key = key;
                this._inEdges.push(inEdge);
            }

            inEdge.fn = fn;
            inEdge.staticSources = staticSources ? [...staticSources] : null;
            inEdge.sources = staticSources ? staticSources.filter(source => source instanceof fluid.cell) : null;
            inEdge.target = this;
            // Whether the computation is asynchronous is discovered from its results - see fluid.cell.update
            inEdge.isAsync = false;
            inEdge.isFree = props?.isFree || false;
            inEdge.includeSource = props?.includeSource || false;
            inEdge.excludeSource = props?.excludeSource || false;
            inEdge.mapArg = props?.mapArg || null;
            inEdge.dispatcher = props?.dispatcher || null;

            // Set up observer links from static sources to this cell immediately - this is from new signature
            if (staticSources) {
                for (let i = 0; i < staticSources.length; i++) {
                    const source = staticSources[i];
                    if (source instanceof fluid.cell) {
                        fluid.cell.addObserver(source, this);
                    }
                }
            }

            if (fn === oldFn) {
                // No change, don't disturb anything
            } else if (oldFn || fluid.isUnavailable(this._value)) {
                // Change in function or possibly uninitialised
                // updateIfNecessary will run this edge when the cell is next pulled.
                fluid.cell.markStale(this, CacheDirty, [], null, false, false, false);
            } else {
                // First wiring on a settled cell: trust the user's assertion of consistency.
                // No markStale. The cycle (if any) stays quiescent.
            }
            fluid.cell.queueStabilize();

            return this;
        }
    };

    /**
     * Refreshes the value of the cell by re-evaluating its computation for the specified static sources.
     * Finds the incoming edge corresponding to the given static sources and triggers an update for this cell along that edge.
     *
     * @param {Cell[]} [staticSources] - An optional array of static source cells to identify the computation edge to be refreshed
     * @param {ComputedProps} [props] - Any properties with which the edge was established, whose `key` identifies it
     * @this {Cell} The cell for which an incoming edge is to be refreshed
     */
    fluid.cell.prototype.refresh = function (staticSources, props) {
        if (this._inEdges) {
            const key = fluid.cell.edgeKey(staticSources, props);
            const inEdge = this._inEdges.find(edge => edge.key === key);
            if (inEdge) {
                fluid.cell.update(this, inEdge);
            }
        }
    };

    fluid.cell.queueEffect = function (cell) {
        if (cell._isEffect && !cell._isQueued && !cell._isDisposed) {
            cell._isQueued = true;
            fluid.cell.EffectQueue.push(cell);
        }
    };

    /**
     * Marks a cell and its observers as stale, updating their cache state, as well as queueing any effects found
     * downstream
     *
     * @param {Cell} cell - The reactive cell to mark as stale.
     * @param {CacheState} state - The new cache state to assign (e.g., CacheDirty or CacheCheck).
     * @param {Cell[]} markedSources - Array of sources which have already been marked dirty on this stack
     * @param {Cell|null} dirtyFrom - A cell joined by an edge responsible for dirtiness
     * @param {Boolean} toPending - Was caused by a transition to a pending value
     * @param {Boolean} fromPending - Was caused by a transition away from pending value
     * @param {Boolean} earlyCutoff - We are cleaning the graph in order to operate early cutoff for an unchanged pending value
     */
    fluid.cell.markStale = function (cell, state, markedSources, dirtyFrom, toPending, fromPending, earlyCutoff) {
        if (cell._trackingRecord && state > (cell._restale || 0) && (cell._isEffect || cell._receivedThisUpdate?.has(dirtyFrom))) {
            cell._restale = state;
        }
        fluid.cell.queueEffect(cell);
        const asyncComplete = fromPending && !toPending;
        if (asyncComplete) { // queue an unconditional async stabilise if a node has gone out of pending state
            fluid.cell.deferredStabilize();
        }

        // If we were previously clean, then we know that we may need to update to get the new value
        // In early cutoff case we need to eagerly walk up the graph and trigger any effects on the unchanged values
        if ((cell._state < state || earlyCutoff || toPending) && !markedSources.includes(cell)) {
            // We've resolved with a genuine concrete value, clear prePending since its scope has ended
            if (!toPending && !fromPending && cell._prePendingState && state === CacheDirty) {
                cell._prePendingState = null;
            }
            if (!earlyCutoff) {
                if (fromPending || toPending && cell._prePendingState === null) {
                    cell._prePendingState = state;
                }
                cell._state = state;
                cell._dirtyFrom = dirtyFrom;
            } else {
                // A pending value which resolved to its stale value restores it - a cell with no pending value, e.g.
                // one never yet computed, has none to restore
                if (fluid.isUnavailable(cell._value)) {
                    cell._value = cell._value.staleValue;
                }
                if (cell._isEffect) {
                    cell._state = CacheDirty;
                }
            }
            markedSources.push(cell);
            if (cell._observers) {
                const consumedSources = cell._consumedSources;
                for (const observer of cell._observers.keys()) {
                    if (!consumedSources?.includes(observer) && !markedSources.includes(observer)) {
                        fluid.cell.markStale(observer, CacheCheck, markedSources, cell, toPending, false, earlyCutoff);
                    }

                }
            }
        }
    };

    fluid.cell.notifiableChange = function (oldValue, newValue, prePendingState) {
        let equalValues = true;
        let earlyCutoff = false;
        const oldUnavail = fluid.isUnavailable(oldValue);
        const newUnavail = fluid.isUnavailable(newValue);

        const toPending = newUnavail && newValue.variety === "pending";
        const fromPending = oldUnavail && oldValue.variety === "pending";

        if (oldUnavail !== newUnavail) {
            equalValues = false;
            if (oldUnavail && oldValue.variety === "pending" && prePendingState) {
                earlyCutoff = fluid.cell.equals(oldValue.staleValue, newValue);
            }
        } else if (oldUnavail) {
            // Both unavailable: variety change is observable; otherwise treat as same
            equalValues = oldValue.variety === newValue.variety;
        } else {
            equalValues = fluid.cell.equals(oldValue, newValue);
        }
        return {toPending, fromPending, earlyCutoff, equalValues};
    };

    /**
     * Commits a new value to the given reactive cell.
     * @param {Cell} cell - The reactive cell to update.
     * @param {any} newValue - The new value to assign to the cell.
     */
    fluid.cell.commitValue = function (cell, newValue) {
        const oldValue = cell._value;
        cell._value = newValue;

        const {equalValues, toPending, fromPending, earlyCutoff} = fluid.cell.notifiableChange(oldValue, newValue, cell._prePendingState);

        if (!equalValues || earlyCutoff) {
            // Misleading original comment:
            // handles diamond dependencies if we're the parent of a diamond.
            if (cell._observers) {
                const consumedSources = cell._consumedSources;
                // We've changed value, so mark our children as dirty so they'll reevaluate
                for (const observer of cell._observers.keys()) {
                    if (!consumedSources?.includes(observer)) {
                        // Milo's implementation for some reason did this directly rather than recursively
                        fluid.cell.markStale(observer, CacheDirty, [cell], cell, toPending, fromPending, earlyCutoff);
                    }
                }
            }
        }
        if (!fluid.isConfigUnavailable(newValue)) {
            fluid.cell.queueStabilize();
        }
    };

    /**
     * Completes the update process for a reactive cell by setting its new value and updating its state.
     * If the value has changed, marks all observers (children) as dirty so they will reevaluate.
     *
     * @param {any} newValue - The new value to assign to the cell.
     * @param {Cell} cell - The reactive cell being updated.
     */
    fluid.cell.updateComplete = function (newValue, cell) {
        // Don't mark ourselves as clean if value is not available since it may be computable from another relation
        if (!fluid.isConfigUnavailable(newValue)) {
            const newState = CacheClean;
            cell._state = newState;
        }

        fluid.cell.commitValue(cell, newValue);
    };

    /**
     * The sources supplied to the innermost call of a function wrapped by fluid.cell.withAmbientSource which is in
     * progress, together with those of any enclosing ones, carried by any cell it sets
     * @type {any[]|null}
     */
    fluid.cell.ambientSources = null;

    /**
     * The sources of the fit whose propagation triggered the effect which is currently running, inherited by any writes
     * it makes, so that they are enlisted in the transaction which caused them - see FLUID-5498
     * @type {String[]|null}
     */
    fluid.cell.inheritedSources = null;

    /**
     * Wrap a function so that any cell set during a call to it carries a source, or several, e.g. a DOM event handler
     * whose writes are marked with the source `"dom"`. Calls may be nested, whereupon writes carry the sources of each.
     * @param {any|any[]} source - The source, usually a String, or an array of sources
     * @param {Function} callback - The function to be wrapped
     * @return {Function} The wrapped function, whose arguments, e.g. an event, are passed on
     */
    fluid.cell.withAmbientSource = function (source, callback) {
        const sources = Array.isArray(source) ? source : [source];
        return (...args) => {
            const prevSources = fluid.cell.ambientSources;
            fluid.cell.ambientSources = prevSources ? [...prevSources, ...sources] : sources;
            let togo;
            try {
                // The callback's return value is passed on, e.g. a promise from an asynchronous method
                togo = callback(...args);
            } finally {
                fluid.cell.ambientSources = prevSources;
            }
            return togo;
        };
    };

    /**
     * Update the value of this writeable cell.
     *
     * @param {any} value - The new cell value
     * @param {Object|String} [options] - Optional options to contextualise the update, or else a String holding just
     * the source
     * @param {String} [options.source] - Optional source to mark the reactive propagation, accessible via effect's includeSource/excludeSource
     * @this {Cell}
     */
    fluid.cell.prototype.set = function (value, options) {
        this._state = CacheClean;
        if (!fluid.cell.equals(this._value, value)) {
            // A fresh change leaves any fit held open by pending effects which an earlier change of ours started - it is
            // a new transaction, which is not to carry that fit's sources - see fluid.cell.releaseFit
            if (this._fit?.held) {
                this._fit = null;
            }
            const explicitSource = typeof(options) === "string" ? options : options?.source;
            const ambient = fluid.cell.ambientSources || [];
            // Writes made by an effect also carry the sources of the change which triggered it - FLUID-5498
            const inherited = fluid.cell.inheritedSources || [];
            const sources = explicitSource ? [explicitSource, ...ambient, ...inherited] : [...ambient, ...inherited];
            // A fit is only started to carry a source marker - see fluid.cell.needsFit
            if (sources.length > 0 && (!this._fit || !this._fit.isActive)) {
                this._fit = fluid.cell.startFit();
            }
            const fit = this._fit;
            if (fit && fit.isActive && !fit.staticFit) {
                fluid.cell.flushFit(fit, false, true);
            }
            if (sources.length > 0) {
                // Flushing releases the cell from the fit if it was one of its targets - it remains enlisted in it, to
                // carry the sources downstream
                this._fit = fit;
                sources.forEach(oneSource => {
                    if (!fit.sources.includes(oneSource)) {
                        fit.sources.push(oneSource);
                    }
                });
            }

            fluid.cell.commitValue(this, value);
        }
    };

    fluid.cell.bindIterable = function (cell, inEdge, iterable) {
        const bindIterable = nextIt => {
            nextIt.then(res => {
                if (!res.done || res.value !== undefined) {
                    fluid.cell.updateComplete(res.value, cell);
                }
                if (!res.done) {
                    fluid.invokeLater(() => {
                        bindIterable(iterable.next());
                    });
                }
            }, e => {
                fluid.cell.updateComplete(fluid.unavailable(e), cell);
            });
        };
        if (!fluid.isPending(cell._value)) {
            fluid.cell.setPending(cell, cell._value);
        }
        bindIterable(iterable.next());
    };

    // Currently very plain compared to old core's processSignalArgs but may include flattening etc. again in future
    /**
     * Map an array of arguments, coalescing "unavailable" values if present.
     *
     * @param {Array} args - The array of arguments to process. These will be checked in a flat way to see if they
     * directly hold unavailable values
     * @param {any} oldValue - Any previous value computed at the same site where arguments are being consumed
     * @return {Object} An object with the following properties:
     *     - `unavailable` (Object|null): The most "unavailable" value (if any) based on priority,
     *       or `null` if no unavailable values are found.
     */
    fluid.cell.mapSignalArgs = function (args, oldValue) {
        // Reuse a pending unavailable with its staleValue if there is one. It is reused only if it is the cell's own -
        // a proxy, e.g. onto a member of a component whose material is unavailable, reads as unavailable through it,
        // but annotating it would write through it, overwriting the material at its site with a plain copy
        let unavailable = fluid.isPending(oldValue) && !fluid.isProxy?.(oldValue) ? oldValue : null;
        let causes = null;
        for (let i = 0; i < args.length; ++i) {
            let arg = args[i];
            if (fluid.isUnavailable(arg)) {
                if (causes === null) {
                    causes = [];
                }
                causes.push(arg);
            }
        }
        if (causes) {
            if (!unavailable) {
                unavailable = fluid.unavailable(causes);
            } else {
                fluid.applyUnavailable(unavailable, causes);
            }
        } else {
            unavailable = null;
        }
        return {unavailable};
    };

    /**
     * Sets the value of the given cell to a pending state, using the provided old value as the stale value.
     * Marks the cell's cache state as clean and commits the pending value.
     *
     * @param {Cell} cell - The reactive cell to set as pending.
     * @param {any} oldValue - The previous value to use as the stale value for the pending state.
     */
    fluid.cell.setPending = function (cell, oldValue) {
        const pendingValue = fluid.pending(oldValue, cell.name);
        cell._state = CacheClean;
        fluid.cell.commitValue(cell, pendingValue);
    };

    // Utility temporarily required because fits are not properly propagating across linked updates
    /**
     * Find the fit in which a cell is enlisted, or else that of the nearest cell along the chain from which it was
     * dirtied. The chain may be cyclic, e.g. across a bidirectional arc, of whose cells none is enlisted.
     * @param {Cell} cell - The cell whose fit is to be found
     * @return {Fit|undefined} The fit, if any
     */
    fluid.cell.findFit = function (cell) {
        const visited = new Set();
        let togo;
        while (cell && togo === undefined && !visited.has(cell)) {
            visited.add(cell);
            // A cell may retain a fit which has ended, e.g. one started by a sourced cell.set - its sources no longer
            // apply. Nor do those of a held fit, other than to the pending cells it retains - see fluid.cell.releaseFit
            if (cell._fit !== null && cell._fit.isActive && (!cell._fit.held || cell._fit.targetsConsumed.includes(cell))) {
                togo = cell._fit;
            }
            cell = cell._dirtyFrom;
        }
        return togo;
    };

    /**
     * Determine whether the result of a computation is to be awaited, as a promise or an async iterable, e.g. one
     * returned from an async generator function. This is decided from the result rather than from the computation, so that
     * a plain function returning a promise is treated in the same way as an async function.
     * @param {any} result - The result of the computation
     * @return {Boolean} `true` if the result is to be awaited
     */
    fluid.cell.isAsyncResult = function (result) {
        return result !== null && typeof(result) === "object" && (fluid.isPromise(result) || !!result[Symbol.asyncIterator]);
    };

    /**
     * Updates the value of a reactive cell by re-evaluating its computation function and updating any changed dynamic dependencies.
     * @param {Cell} cell - The reactive cell to update.
     * @param {Edge} inEdge - The edge along which we should update
     */
    fluid.cell.update = function (cell, inEdge) {
        if (cell._trackingRecord || !cell._inEdges) {
            return;
        }
        // An edge which has previously returned a promise or async iterable is treated as asynchronous from the outset
        let syncUpdate = !inEdge.isAsync;
        let result;

        fluid.cell.beginTracking(cell, inEdge);

        const enlisted = fluid.cell.needsFit(cell, inEdge);
        if (enlisted) {
            fluid.cell.enlistInFit(cell, inEdge.sources);
        }

        const oldValue = fluid.isUnavailable(cell._value) ? cell._value.staleValue : cell._value;

        if (!syncUpdate) {
            // Mark the cell as unavailable/stale whilst it is updating and push old value into staleValue
            fluid.cell.setPending(cell, oldValue);
        }
        const mapArg = inEdge.mapArg === null ? x => x.get(false, true) : inEdge.mapArg;

        let skipped = false;

        try {
            const args = inEdge.staticSources ? inEdge.staticSources.map(mapArg) : [];
            const {unavailable} = fluid.cell.mapSignalArgs(args, cell._value);

            const fit = inEdge.excludeSource || inEdge.includeSource ? fluid.cell.findFit(cell) : undefined;

            // Skip notification if the fit has an excluded source
            if (inEdge.excludeSource) {
                if (fit && fit.sources.includes(inEdge.excludeSource)) {
                    skipped = true;
                }
            }
            if (inEdge.includeSource) {
                if (!fit || !fit.sources.includes(inEdge.includeSource)) {
                    skipped = true;
                }
            }
            if (!skipped) {
                // Any writes made by an effect inherit the sources of the change which triggered it - FLUID-5498
                const triggerFit = cell._isEffect ? fit || fluid.cell.findFit(cell) : undefined;
                const prevInherited = fluid.cell.inheritedSources;
                fluid.cell.inheritedSources = triggerFit?.sources.length ? triggerFit.sources : prevInherited;
                try {
                    result = inEdge.dispatcher !== null ? inEdge.dispatcher(inEdge.fn, args, unavailable, cell._value) :
                        unavailable && !inEdge.isFree ? unavailable : inEdge.fn.apply(null, args);
                } finally {
                    fluid.cell.inheritedSources = prevInherited;
                }
            }
        } catch (e) {
            if (fluid.isLogging()) {
                fluid.log(`Failure during update of ${cell.name}: `, e);
            }
            result = fluid.unavailable(e);
            syncUpdate = true;
        } finally {
            if (!skipped && syncUpdate && fluid.cell.isAsyncResult(result)) {
                // The edge is found to be asynchronous - this update is completed asynchronously, and later ones are
                // treated as asynchronous from the outset. It holds open a fit until it settles, and so is enlisted
                // before it is marked pending, as an update along an edge known to be asynchronous is by needsFit
                inEdge.isAsync = true;
                syncUpdate = false;
                if (!enlisted) {
                    fluid.cell.enlistInFit(cell, inEdge.sources);
                }
                // Mark the cell as unavailable/stale whilst it is updating and push old value into staleValue
                fluid.cell.setPending(cell, oldValue);
            }
            if (!skipped) {
                if (!syncUpdate) {
                    if (fluid.isPromise(result)) {
                        cell._inFlight = (cell._inFlight || 0) + 1;
                        let settled = false;
                        const complete = newValue => {
                            if (!settled) {
                                settled = true;
                                --cell._inFlight;
                            }
                            fluid.cell.updateComplete(newValue, cell);
                        };
                        result.then(complete).catch(e => complete(fluid.unavailable(e)));
                    } else if (result?.[Symbol.asyncIterator]) {
                        fluid.cell.bindIterable(cell, inEdge, result);
                    } else { // A plain value returned along an asynchronous edge
                        syncUpdate = true;
                    }
                }
                if (syncUpdate) {
                    // It was a plain value, update now
                    fluid.cell.updateComplete(result, cell);
                }
            }

            fluid.cell.updateDynamicDependencies(cell, inEdge);
            fluid.cell.endTracking(cell);
        }
        // A pending effect holds open the fit in which it is enlisted until it is no longer pending - see fluid.cell.settle
        if (!enlisted && cell._isEffect && fluid.isPending(cell._value)) {
            fluid.cell.enlistInFit(cell, inEdge.sources);
        }
    };

    /**
     * Determine which compute edge should be activated in order to update a dirty cell. We can activate an edge if
     * all of its sources are either clean or pending unavailable
     * @param {Cell} cell - The reactive cell to update if necessary.
     * @param {CacheState} targetState - May be CacheCheck in the case we're trying to find a dirty edge for an effect, which
     * we might need to notify if it is free and requires notification of all transitions
     * @return {Edge|null} edge - The edge to be activated
     */
    fluid.cell.findDirtyEdge = function (cell, targetState) {
        let bestCandidate = null, bestScore = 0;
        const scoreEdge = function (edge) {
            let score = 0;
            if (edge.isFree) {
                score = 1;
            } else if (targetState === CacheDirty) {
                score = 1;
                if (edge.sources) {
                    for (let i = 0; i < edge.sources.length; ++i) {
                        const source = edge.sources[i];
                        if (source._state !== CacheClean) {
                            score = 0;
                            break;
                        } else {
                            if (source === cell._dirtyFrom) {
                                score = 2;
                            } else if (fluid.isConfigUnavailable(source._value) && score !== 2) {
                                score = 0;
                            }
                        }
                    }
                }
            }
            return score;
        };
        if (cell._inEdges) {
            for (let i = 0; i < cell._inEdges.length; ++i) {
                const edge = cell._inEdges[i];
                const score = scoreEdge(edge);
                if (score > bestScore) {
                    bestScore = score;
                    bestCandidate = edge;
                }
            }
        }
        return bestCandidate;
    };

    /**
     * Determine whether a source of a cell being brought up to date must itself be brought up to date first - it is
     * not clean, and is neither being brought up to date further up the stack, as for an arc of a cycle, nor updating
     * @param {Cell} source - The source
     * @return {Boolean} `true` if the source is to be brought up to date
     */
    fluid.cell.needsCheck = function (source) {
        return source._state !== CacheClean && !source._checking && !source._trackingRecord;
    };

    /**
     * Ensures that a reactive cell is up to date by checking and updating its dependencies as needed. Whilst this is in
     * progress the cell is marked as `_checking`, so that a cycle of sources leading back to it is not followed.
     * @param {Cell} cell - The reactive cell to update if necessary.
     */
    fluid.cell.updateIfNecessary = function (cell) {
        /** @type {Edge|null} **/
        let dirtyEdge = null;
        cell._checking = true;
        try {
            // If we are potentially dirty, see if we have a parent who has actually changed value
            // Difference from Milo's implementation - recurse fully into CacheDirty nodes to ensure that we don't schedule
            // a less nested one with an async dependency first
            if (cell._state !== CacheClean) {
                if (cell._inEdges) {
                    for (const edge of cell._inEdges) {
                        if (edge.sources) {
                            // A source brought up to date may be made stale again in the course of bringing a later one up
                            // to date, e.g. by a binding which that made, and is brought up to date again. Otherwise it would
                            // block any edge for this cell, which would then be marked clean without being brought up to date
                            let passes = 0;
                            do {
                                for (const source of edge.sources) {
                                    if (fluid.cell.needsCheck(source)) {
                                        fluid.cell.updateIfNecessary(source);  // updateIfNecessary() can change this.state
                                    }
                                }
                            } while (edge.sources.some(fluid.cell.needsCheck) && ++passes < fluid.cell.maxEffectRuns);
                        }
                        // Second leg of this test is necessary so that we notify free effects in all cases
                        if (cell._state === CacheDirty || cell._isEffect && cell._state === CacheCheck) {
                            dirtyEdge = fluid.cell.findDirtyEdge(cell, cell._state);
                            if (dirtyEdge) {
                                // Stop the loop here so we won't trigger updates on other parents unnecessarily
                                // If our computation changes to no longer use some sources, we don't
                                // want to update() a source we used last time, but now don't use.
                                break;
                            }
                        }
                    }
                }
            }
            if (!dirtyEdge && cell._state === CacheDirty && !cell._isDisposed) {
                dirtyEdge = fluid.cell.findDirtyEdge(cell, cell._state);
            }

            if (dirtyEdge) {
                fluid.cell.update(cell, dirtyEdge);
                // A computed cell whose update received a value which then changed in the course of it, e.g. through a
                // binding made by reading another source, is brought up to date at once, so that its reader receives a
                // current value
                let reruns = 0;
                while (!cell._isEffect && cell._restale && !dirtyEdge.isAsync && reruns < fluid.cell.maxEffectRuns) {
                    cell._restale = CacheClean;
                    ++reruns;
                    fluid.cell.update(cell, dirtyEdge);
                }
            }
            // A cell marked stale whilst it was updating, e.g. an effect whose run wrote a value which one of its sources
            // depends on, remains so, so that it is brought up to date once more - otherwise the source would remain stale
            // with no observer left to pull it, and so could never notify the cell of any further change
            const restale = cell._restale || CacheClean;
            cell._restale = CacheClean;
            cell._state = restale;
            if (restale !== CacheClean) {
                fluid.cell.queueEffect(cell);
            }
        } finally {
            cell._checking = false;
        }
    };


    /**
     * Removes this cell as an observer from its parent source cells starting at the given index of an edge's sources
     * @param {Cell} cell - The reactive cell to be removed as an observer
     * @param {Edge} edge - The edge whose sources should be removed
     * @param {Number} index - The starting index in the sources array from which to remove observer links.
     * @this {Cell}
     */
    fluid.cell.removeParentObservers = function (cell, edge, index) {
        if (!edge.sources) {
            return;
        }
        for (let i = index; i < edge.sources.length; i++) {
            // Misleading former comment:  // We don't actually delete sources here because we're replacing the entire array soon
            fluid.cell.removeObserver(edge.sources[i], cell);
        }
    };

    /**
     * Creates a disposable reactive effect cell based on the provided configuration.
     * The effect cell runs the `bind.fn` function reactively when any of the `bind.staticSources` change.
     * The effect can be disposed, which will run the `unbind.fn` cleanup (if provided), remove the computation,
     * and detach all parent observers.
     *
     * @param {Object} config - Configuration object for the effect.
     * @param {Object} config.bind - Binding configuration.
     * @param {Function} config.bind.fn - The function to execute reactively.
     * @param {Cell[]}   config.bind.staticSources - The array of source cells to observe.
     * @param {Object}   [config.unbind] - Unbinding configuration.
     * @param {Function} [config.unbind.fn] - Cleanup function to run on disposal.
     * @param {Boolean}  [config.isFree] - If true, the effect will run even if some sources are unavailable.
     * @param {String}   [config.name] - Optional name for the effect.
     * @param {String}   [config.includeSource] - Optional source name (as supplied as last argument to cell.set) that must be present for notification
     * @param {String}   [config.excludeSource] - Optional source name (as supplied as last argument to cell.set) that will have its notification skipped
     * @param {Function} [config.mapArg] - Optional function to map arguments supplied to `fn`
     * @return {Cell} The created disposable effect cell.
     */
    fluid.cell.disposableEffect = function (config) {
        const effect = fluid.cell(undefined, {name: config?.name});
        effect._isEffect = true;
        effect._isQueued = false;
        effect._isDisposed = false;
        effect._isFree = config.isFree;
        effect._fit = config._fit;

        const {fn, staticSources} = config.bind;

        effect.dispose = function () {
            if (config?.unbind?.fn) {
                // TODO: resolve any staticSources here for effects which require contextualised disposal
                config.unbind.fn();
            }
            effect.computed(null, staticSources, config);
            effect._isDisposed = true;
            if (effect._inEdges) {
                effect._inEdges.forEach(edge => fluid.cell.removeParentObservers(effect, edge, 0));
                effect._inEdges = null;
            }
        };

        // Wrap user's function to track execution and neutering on disposal
        const computeFn = function (...args) {
            // Bypass effect for early cutoff if state was Check when going pending, unless it's a free edge
            const shouldBypass = effect._prePendingState === CacheCheck && !effect._isFree;

            if (effect._isDisposed || shouldBypass) {
                return true;
            } else {
                const result = fn.apply(effect, args);
                // Pending status on a free edge needs to propagate, pass through all values other than undefined
                return result ?? true;
            }
        };

        // Set up "computation" which will invoke us
        effect.computed(computeFn, staticSources, config);

        return effect;
    };

    /**
     * Creates a reactive effect cell that runs the provided function when its dependencies change.
     * The effect is managed as a disposable resource, allowing for cleanup via the `onDispose` property in `props`.
     *
     * @param {Function} fn - The function to execute reactively when any of the staticSources change.
     * @param {Cell[]} staticSources - The array of source cells whose values are dependencies for the effect.
     * @param {Object}   [props] - Optional properties to configure the effect.
     * @param {Function} [props.onDispose] - Optional cleanup function to run when the effect is disposed.
     * @param {Boolean}  [props.isFree] - If true, the effect will run even if some sources are unavailable.
     * @param {String}   [props.name] - Optional name for the effect
     * @param {String}   [props.includeSource] - Optional source name (as supplied as last argument to cell.set) that must be present for notification
     * @param {String}   [props.excludeSource] - Optional source name (as supplied as last argument to cell.set) that will have its notification skipped
     * @param {Function} [props.mapArg] - Optional function to map arguments supplied to `fn`
     * @return {Cell} The created effect cell.
     */
    fluid.cell.effect = function (fn, staticSources, props) {
        return fluid.cell.disposableEffect({
            bind: {fn, staticSources},
            unbind: {fn: props?.onDispose},
            _fit: props?._fit || null,
            isFree: props?.isFree,
            name: props?.name,
            includeSource: props?.includeSource,
            excludeSource: props?.excludeSource,
            mapArg: props?.mapArg
        });
    };

    /**
     * Pull every effect in the effect queue once, including any queued whilst doing so, and then end any fits which no
     * longer have pending effects.
     * @return {Cell[]} The effects processed by this pass
     */
    fluid.cell.stabilizeOnce = function () {
        const EffectQueue = fluid.cell.EffectQueue;
        const runCounts = fluid.cell.effectRunCounts;
        for (let i = 0; i < EffectQueue.length; i++) {
            const effect = EffectQueue[i];
            // Unqueued before it runs, so that it may be queued afresh if it is marked stale whilst running
            effect._isQueued = false;
            const runs = (runCounts.get(effect) || 0) + 1;
            runCounts.set(effect, runs);
            if (runs > fluid.cell.maxEffectRuns) {
                if (runs === fluid.cell.maxEffectRuns + 1) {
                    fluid.cell.reportCycle(`Effect ${effect.name} has been triggered ${fluid.cell.maxEffectRuns} times ` +
                        "within one stabilization - it is likely to be writing a value which it also reads. It will not be run " +
                        "again until a later stabilization. Read such a value with fluid.cell.untracked");
                }
            } else if (!effect._isDisposed) {
                effect.get(false, true);
            }
        }
        const processedEffects = EffectQueue.slice(0);
        EffectQueue.length = 0;

        fluid.cell.endFits(fluid.cell.CurrentFits, true);

        return processedEffects;
    };

    /**
     * The number of times one effect may be run within a single call to fluid.cell.stabilize before it is judged to be
     * cyclically triggering itself, e.g. by writing a value which it also reads, and is not run again within it
     * @type {Number}
     */
    fluid.cell.maxEffectRuns = 100;

    /**
     * Report an effect which has been found to be cyclically triggering itself - see fluid.cell.maxEffectRuns. This is
     * reported whether or not logging is enabled, and may be replaced, e.g. by a test
     * @param {String} message - A description of the cycle
     */
    fluid.cell.reportCycle = function (message) {
        console.error(message);
    };

    /** The number of times each effect has been run within the call to fluid.cell.stabilize in progress
     * @type {Map<Cell, Number>}
     */
    fluid.cell.effectRunCounts = new Map();

    /** `true` whilst a call to fluid.cell.stabilize is draining the effect queue */
    fluid.cell.isStabilizing = false;
    /** Set by a reentrant call to fluid.cell.stabilize, which is folded into the pass in progress */
    fluid.cell.stabilizeAgain = false;

    /**
     * Synchronously drain the effect queue - an idempotent flush which may be called at any time, e.g. by tests and
     * event handlers which require the DOM to be consistent before they return. A call made whilst a stabilization is
     * in progress (e.g. from within an effect) is folded into the outer pass. Any deferred stabilization which has been
     * queued is consumed, and so will become a no-op.
     * @return {Cell[]} The effects processed by this call
     */
    fluid.cell.stabilize = function () {
        let processed = [];
        fluid.cell.stabilizationQueued = false;
        if (fluid.cell.isStabilizing) {
            fluid.cell.stabilizeAgain = true;
        } else {
            fluid.cell.isStabilizing = true;
            fluid.cell.effectRunCounts.clear();
            try {
                do {
                    fluid.cell.stabilizeAgain = false;
                    processed = processed.concat(fluid.cell.stabilizeOnce());
                } while (fluid.cell.stabilizeAgain || fluid.cell.EffectQueue.length > 0);
            } finally {
                fluid.cell.isStabilizing = false;
            }
        }
        return processed;
    };

    /**
     * Stabilize the reactive graph and resolve once the effects concerned are no longer pending. If no effects are
     * supplied, this waits for the whole graph, via fluid.cell.settle - since under auto-stabilization the effects
     * dirtied by the caller may already have been drained by a deferred pass, those processed by any one call to
     * fluid.cell.stabilize are not a reliable indication of the work outstanding.
     * @param {Cell[]} [processedEffectsIn] - Effects, as returned from a call to fluid.cell.stabilize, to wait for
     * @return {Promise} A promise which resolves once none of the effects concerned are pending
     */
    fluid.cell.stabilizeAsync = function (processedEffectsIn) {
        let togo;
        if (processedEffectsIn) {
            const processedEffectsCell = fluid.cell([], {name: "processedEffectsCell", _fit: fluid.cell.frameworkFit});
            processedEffectsCell.set(processedEffectsIn);

            togo = new Promise(resolve => {
                const pendingStabilization = fluid.cell.effect(function (processedEffects) {
                    const pendingEffects = fluid.cell.filterPendingEffects(processedEffects);
                    if (pendingEffects.length === 0) {
                        resolve();
                        fluid.cell.endFit(pendingStabilization._fit);
                        // Can't dispose it immediately since it is still in the process of being pulled in stabilize
                        fluid.invokeLater( () => {
                            pendingStabilization.dispose();
                        });
                    } else {
                        fluid.invokeLater(() => {
                            pendingEffects.forEach(fluid.cell.queueEffect);
                            const e = fluid.cell.stabilize();
                            if (e.length !== processedEffectsCell._value.length) {
                                processedEffectsCell.set(e);
                                fluid.cell.endFit(processedEffectsCell._fit);
                            }
                        });
                    }
                }, [processedEffectsCell], {
                    _fit: fluid.cell.frameworkFit,
                    isFree: true,
                    name: "pending stabilization effect"
                });
                pendingStabilization.get();
            });

            fluid.cell.stabilize();
        } else {
            togo = fluid.cell.settle();
        }
        return togo;
    };

    /** `true` if a deferred stabilization has been queued by fluid.cell.deferredStabilize and not yet consumed */
    fluid.cell.stabilizationQueued = false;

    /** Queue a stabilization pass in a microtask, so that it runs at the end of the current task, before any timers,
     * I/O or further macrotasks. A synchronous call to fluid.cell.stabilize in the meantime consumes the request, so that
     * the deferred pass becomes a no-op. No pass is queued during a stabilization, since that drains any effects queued
     * whilst it is in progress.
     */
    fluid.cell.deferredStabilize = function () {
        if (!fluid.cell.stabilizationQueued && !fluid.cell.isStabilizing) {
            fluid.cell.stabilizationQueued = true;
            queueMicrotask(() => {
                if (fluid.cell.stabilizationQueued) {
                    fluid.cell.stabilize();
                }
            });
        }
    };

    /** Configure an auto-stabilization strategy, a function which is run whenever an effect may have become dirty.
     * Auto-stabilization with fluid.cell.deferredStabilize is on by default.
     * @param {Function|null} [fn=fluid.cell.deferredStabilize] - The function to use for stabilization, or `null` to turn
     * auto-stabilization off, so that the effect queue is only drained by explicit calls to fluid.cell.stabilize
     */
    fluid.cell.autoStabilize = function (fn = fluid.cell.deferredStabilize) {
        fluid.cell.queueStabilize = fn || (() => {});
    };

    fluid.cell.autoStabilize();

    /**
     * Determine whether the reactive graph is quiescent - that is, no effects are queued and no fits other than static
     * ones remain open.
     * @return {Boolean} `true` if the graph is quiescent
     */
    fluid.cell.isQuiescent = function () {
        return fluid.cell.EffectQueue.length === 0 && [...fluid.cell.CurrentFits].every(fit => fit.staticFit);
    };

    /**
     * Find the effects which are holding fits open because they are pending - for example, awaiting I/O or an async
     * computation. This is the outstanding work for which fluid.cell.settle waits.
     * @return {Cell[]} The pending effects in open fits
     */
    fluid.cell.pendingEffects = function () {
        return fluid.cell.untracked(() => [...fluid.cell.CurrentFits].flatMap(fit => fluid.cell.filterPendingEffects(fit.targetsConsumed)));
    };

    /**
     * Resolve once the reactive graph is quiescent - no effects are queued, and no fit is held open by a pending effect.
     * Asynchronous work issued from within the graph, whether by an async computation or a fetch which an effect
     * consumes, holds open the fit in which it was issued until it completes, and so no polling is needed. This is the
     * sanctioned way for async code to wait for work internal to the graph - work whose timing lies outside it should
     * be awaited with fluid.cell.waitFor. Note that the promise returned by an async effect function is not tracked -
     * such work should instead be signalled through a cell which is pending until it completes, and which is
     * consumed by some effect, e.g. one allocated by fluid.cell.waitFor. A graph holding an effect which is pending
     * forever never settles - fluid.cell.pendingEffects reports such effects.
     * @return {Promise} A promise which resolves when the graph is quiescent
     */
    fluid.cell.settle = async function () {
        fluid.cell.stabilize();
        while (!fluid.cell.isQuiescent()) {
            // idleSignal becomes true when the last fit ends, as a stabilization following completion of work ends it
            await fluid.cell.waitFor(fluid.cell.idleSignal, idle => idle);
            fluid.cell.stabilize();
        }
    };

    /**
     * Resolve with the first available value of a cell which satisfies a predicate, or reject if the cell holds an
     * error. Whilst the cell is pending, the watching effect is itself pending, so that the fit in which it is pulled
     * stays open and fluid.cell.settle waits for it - this is work internal to the graph. Whilst the cell is available
     * but its value does not satisfy the predicate, the effect is not pending, since the awaited condition depends on
     * something outside the graph, e.g. a value delivered from an external timer.
     * @param {Cell} cell - The cell to watch
     * @param {Function} [predicate] - A test applied to each available value of the cell, which accepts any available
     * value if omitted
     * @return {Promise<Any>} A promise which resolves with the first available value satisfying `predicate`, and
     * rejects with the cell's value if it becomes an error
     */
    fluid.cell.waitFor = function (cell, predicate = () => true) {
        return new Promise((resolve, reject) => {
            const watcher = fluid.cell.effect(value => {
                let togo;
                if (fluid.isUnavailable(value)) {
                    if (value.variety === "error") {
                        reject(value);
                        watcher.dispose();
                    }
                    // Return a pending value unchanged so that the watcher is pending and holds its fit open
                    togo = value;
                } else if (predicate(value)) {
                    resolve(value);
                    watcher.dispose();
                    togo = value;
                } else {
                    togo = true;
                }
                return togo;
            }, [cell], {
                isFree: true,
                name: "waitFor " + cell.name + "/" + fluid.cell.fitId
            });
            watcher.get();
        });
    };

    /**
     * Explain why a cell's value is unavailable, in terms of the causes which bear messages. A cell may hold an
     * unavailable value without any - for example `fluid.cell.initialUnavailable`, held by a computed cell which was
     * never evaluated since one of its sources was itself unavailable for reasons of configuration (see
     * `fluid.cell.findDirtyEdge`). Such a cell is explained by searching upstream through the sources of its computed
     * relations for the cells whose unavailable values do bear messages. The search reads the graph as it stands,
     * without updating or tracking any cell.
     * @param {Cell} cell - The cell whose unavailable value is to be explained
     * @param {Set<Cell>} [visited] - The cells already visited by this search
     * @return {UnavailableCause[]} The causes found, which is empty if the cell's value is available or no cause bearing
     * a message could be found
     */
    fluid.cell.explainUnavailable = function (cell, visited = new Set()) {
        const value = cell._value;
        let togo = [];
        if (fluid.isUnavailable(value) && !visited.has(cell)) {
            visited.add(cell);
            const causes = fluid.unavailableToCauses(value).filter(cause => cause.message !== undefined);
            if (causes.length > 0) {
                togo = causes;
            } else {
                (cell._inEdges || []).forEach(edge => {
                    (edge.sources || []).forEach(source => {
                        fluid.cell.explainUnavailable(source, visited).forEach(cause => {
                            if (!togo.includes(cause)) {
                                togo.push(cause);
                            }
                        });
                    });
                });
            }
        }
        return togo;
    };
};

// Signal to a global environment compositor what path this scope function should be applied to
$fluidSignalsScope.$fluidScopePath = "fluid";

// If there is a namespace in the global, bind to it
if (typeof(fluid) !== "undefined") {
    $fluidSignalsScope(fluid);
}
