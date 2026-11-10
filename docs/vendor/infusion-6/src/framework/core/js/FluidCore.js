"use strict";

const $fluidCoreJSScope = function (fluid) {

    fluid.version = "Infusion 6.1.0";

    // Export this for use in environments like node.js, where it is useful for
    // configuring stack trace behaviour
    fluid.Error = Error;

    fluid.global = fluid.global || (typeof window !== "undefined" ?
        window : typeof self !== "undefined" ? self : {});

    fluid._isLogging = false;

    fluid.isLogging = () => fluid._isLogging;

    fluid.setLogging = function (enabled) {
        fluid._isLogging = enabled;
    };

    fluid.log = function (...args) {
        if (fluid._isLogging) {
            console.log.apply(console, args);
        }
    };

    /**
     * Check whether the argument is a primitive type
     *
     * @param {any} value - The value to be tested
     * @return {Boolean} `true` if the supplied value is a JavaScript (ES5) primitive
     */
    fluid.isPrimitive = function (value) {
        const valueType = typeof(value);
        return !value || valueType === "string" || valueType === "boolean" || valueType === "number" || valueType === "function";
    };

    /**
     * Converts the given argument into an array or shallow copies it.
     * - If the argument is `null` or `undefined`, returns an empty array.
     * - If the argument is a primitive value or not iterable, wraps it in a single-element array.
     * - If the argument is iterable, converts it into an array using the spread operator.
     * @param {any} arg - The value to be converted into an array.
     * @return {Array} An array representation of the input value.
     */
    fluid.makeArray = function (arg) {
        return arg === null || arg === undefined ? [] :
            fluid.isPrimitive(arg) || typeof arg[Symbol.iterator] !== "function" ? [arg] : [...arg];
    };

    /**
     * Compares two arrays for equality by checking if they have the same length
     * and if all elements at corresponding indices are strictly equal.
     *
     * @param {Array} array1 - The first array to compare.
     * @param {Array} array2 - The second array to compare.
     * @return {Boolean} `true` if the arrays are equal, `false` otherwise.
     */
    fluid.arrayEqual = function (array1, array2) {
        return array1.length === array2.length && array1.every((element, index) => element === array2[index]);
    };

    /**
     * Pushes an element or elements onto an array, initialising the array as a member of a holding object if it is
     * not already allocated.
     * @param {Array|Object} holder - The holding object whose member is to receive the pushed element(s).
     * @param {String} member - The member of the <code>holder</code> onto which the element(s) are to be pushed
     * @param {Array|any} topush - If an array, these elements will be added to the end of the array using Array.push.apply.
     * If a non-array, it will be pushed to the end of the array using Array.push.
     */
    fluid.pushArray = function (holder, member, topush) {
        const array = holder[member] ? holder[member] : (holder[member] = []);
        if (Array.isArray(topush)) {
            array.push.apply(array, topush);
        } else {
            array.push(topush);
        }
    };

    /**
     * Iterates over the properties of an object, invoking a provided function for each item.
     *
     * @param {Object} source - The object or array to iterate over. If `null` or `undefined`, the function does nothing.
     * @param {Function} func - The function to be invoked for each item. It is called with two arguments:
     *   - `value` (any): The value of the current property or element.
     *   - `key` (String|Number): The key of the current property.
     */
    fluid.each = function (source, func) {
        if (source) {
            for (const key in source) {
                func(source[key], key);
            }
        }
    };

    /* A special "marker object" representing that no value is present (where
     * signalling using the value "undefined" is not possible - e.g. the return value from a "strategy"). This
     * is intended for "ephemeral use", i.e. returned directly from strategies and transforms and should not be
     * stored in data structures */
    fluid.NoValue = Symbol("No Value");

    /**
     * Transforms the properties of an object or elements of an array by applying a provided function to each item.
     *
     * @param {Object} source - The object to transform. If `null` or `undefined`, the function returns the input as-is.
     * @param {Function} func - The transformation function to apply to each item. It is called with two arguments:
     *   - `value` (any): The value of the current property or element.
     *   - `key` (String): The key of the current property .
     * @return {Object} A new object or array with transformed values. If `source` is `null` or `undefined`, it is returned unchanged.
     */
    fluid.transform = function (source, func) {
        if (source) {
            const togo = {};
            for (const key in source) {
                const ret = func(source[key], key);
                if (ret !== fluid.NoValue) {
                    togo[key] = ret;
                }
            }
            return togo;
        } else {
            return source;
        }
    };

    fluid.invokeLater = function (func) {
        return setTimeout(func, 0);
    };

    /** Unavailable value support **/

    fluid.unavailablePriority = {
        "pending": 1,
        "config": 2,
        "error": 3
    };

    /** @typedef {Object} UnavailableCause
     * A record explaining the cause that a value is unavailable.
     * @property {String} message - A human-readable message describing the cause.
     * @property {String} variety - The variety assigned to the cause (e.g., "error", "config", "pending").
     * @property {String} [site] - An optional site associated with the cause of unavailability
     * @property {String} [hint] - An optional hint towards correcting the cause, e.g. explaining a commonly
     *   misunderstood construct which may be responsible for it
     */

    /**
     * @typedef {UnavailableCause} Unavailable
     * A marker representing an "Unavailable" state.
     * @property {Any} staleValue - The most recently seen state of an unavailable value which is unavailable through
     *   depending on pending I/O
     */

    /** @typedef {Unavailable} CausedUnavailable
     * A marker representing an unavailable state which has multiple causes.
     * @property {UnavailableCause[]} causes - An array of cause records.
     */

    /**
     * Upgrades a cause value into a standardized cause object.
     * @param {Object|String|Error} cause - The cause to upgrade. Can be a string, Error, or object.
     * @param {String} defaultVariety - The default variety to assign if not present.
     * @return {UnavailableCause} The upgraded cause object.
     */
    fluid.upgradeCause = function (cause, defaultVariety) {
        const upCause = typeof(cause) === "string" ? {message: cause} :
            cause instanceof Error ? {message: cause.message, error: cause, variety: "error"} : {...cause};
        if (!upCause.variety) {
            upCause.variety = defaultVariety;
        }
        return upCause;
    };

    /**
     * Formats an array of cause records into a human-readable string describing why a value is unavailable.
     * Each cause's message is included, separated by newlines.
     *
     * @param {UnavailableCause[]} causes - An array of cause records explaining the unavailability.
     * @return {string} A formatted string listing all cause messages.
     */
    fluid.formatCauses = function (causes) {
        return "Value is unavailable - causes are:\n" + causes.map(cause => cause.message).join("\n");
    };

    /**
     * Applies a fresh set of causes and variety to an existing Unavailable instance. Single or multiple supplied
     * cause will be upgraded via fluid.upgradeCause.
     *
     * @param {Unavailable} instance - The object to annotate with unavailability information.
     * @param {Object|Array|String|Error} [cause={}] - The cause or array of causes for unavailability.
     *        Can be a string, Error, object, or array of these.
     * @param {String} [variety="error"] - The variety of unavailability (e.g., "error", "config", "pending").
     * @return {Unavailable} The annotated instance.
     */
    fluid.applyUnavailable = function (instance, cause = {}, variety = "error") {
        if (!(variety in fluid.unavailablePriority)) {
            throw ({message: "Unrecognised unavailable variety " + variety});
        }
        if (Array.isArray(cause)) {
            instance.causes = cause.map(oneCause => fluid.upgradeCause(oneCause, variety));
            instance.variety = instance.causes.reduce((acc, {variety}) => {
                const priority = fluid.unavailablePriority[variety];
                return priority > acc.priority ? {variety, priority} : acc;
            }, {variety, priority: -1}).variety;
            instance.message = fluid.formatCauses(instance.causes);
        } else {
            const upCause = fluid.upgradeCause(cause, variety);
            Object.assign(instance, upCause);
        }
        return instance;
    };

    /**
     * Create a marker representing an "Unavailable" state with an associated cause or list of causes, which each
     * contain an site address or external resource (e.g. URL) responsible for unavailability of this value.
     * The marker is mutable.
     *
     * @param {Object|Array<UnavailableCause>} [cause={}] - A list of dependencies or reasons for unavailability.
     * @param {String} [variety="error"] - The variety of unavailable value:
     * * "error" indicates a syntax or structural issue that needs design intervention.
     * * "config" indicates the value is not available because it has been configured away
     * * "pending" indicates pending I/O - a stale value may be stored at `staleValue` representing a previous evaluation
     * @return {Unavailable} A marker of type "Unavailable".
     */
    fluid.unavailable = function (cause = {}, variety = "error") {
        const togo = Object.create(fluid.unavailable.prototype);
        fluid.applyUnavailable(togo, cause, variety);
        return togo;
    };

    /**
     * Creates an "Unavailable" marker representing a value that is pending due to I/O.
     * Sets the variety to "pending", provides a standard message, and records the site and stale value.
     *
     * @param {Any} staleValue - The most recently seen value before it became unavailable due to pending I/O.
     * @param {String} site - The site or resource (e.g. URL) responsible for the pending I/O.
     * @return {Unavailable} An object representing the unavailable state due to pending I/O.
     */
    fluid.pending = function (staleValue, site) {
        const togo = Object.create(fluid.unavailable.prototype);
        togo.variety = "pending";
        togo.message = "Value is unavailable due to pending I/O";
        togo.site = site;
        togo.staleValue = staleValue;
        return togo;
    };

    fluid.isPending = function (value) {
        return value instanceof fluid.unavailable && value.variety === "pending";
    };

    fluid.isConfigUnavailable = function (value) {
        return value instanceof fluid.unavailable && value.variety === "config";
    };

    /**
     * Check if an object is a marker of type "Unavailable"
     *
     * @param {Object} totest - The object to test.
     * @return {Boolean} `true` if the object is a marker of type "Unavailable", otherwise `false`.
     */
    fluid.isUnavailable = totest => totest instanceof fluid.unavailable;

    fluid.isErrorUnavailable = totest => fluid.isUnavailable(totest) && totest.variety === "error";

    // Patched in core framework to unproxy unavailable values
    fluid.deproxyUnavailable = target => target;

    /**
     * Extracts the array of causes from an "Unavailable" marker.
     * If the marker has a `causes` property, returns it; otherwise, returns an array containing the unwrapped marker itself.
     *
     * @param {Unavailable} unavailable - The "Unavailable" marker to extract causes from.
     * @return {UnavailableCause[]} An array of cause records explaining the unavailability.
     */
    fluid.unavailableToCauses = function (unavailable) {
        const unwrapped = fluid.deproxyUnavailable(unavailable);
        return unwrapped.causes ? unwrapped.causes : [unwrapped];
    };

    /**
     * Merge two "unavailable" markers into a single marker, combining their causes.
     * If the existing marker is `null` or `undefined`, the fresh marker is returned as-is.
     *
     * @param {Unavailable|null|undefined} existing - The existing "unavailable" marker, or `null`/`undefined` if none exists.
     * @param {Unavailable} fresh - The new "unavailable" marker to merge with the existing one.
     * @return {Unavailable} A combined "unavailable" marker with merged causes, or the fresh marker if no existing marker is provided.
     */
    fluid.mergeUnavailable = function (existing, fresh) {
        return !existing ? fresh : fluid.unavailable(fluid.unavailableToCauses(existing).concat(fluid.unavailableToCauses(fresh)));
    };

    /**
     * Merges multiple results into a single unavailable object.
     * @param {Array} values - An array of values to check for unavailability
     * @return {Unavailable|null} unavailable - The merged unavailable result, or null if no supplied values were unavailable
     */
    fluid.mergeUnavailables = function (values) {
        let unavailable = null;
        values.forEach(result => {
            if (fluid.isUnavailable(result)) {
                unavailable = fluid.mergeUnavailable(unavailable, result);
            }
        });
        return unavailable;
    };

    /** Support for traversing substrate via string paths **/

    fluid.getPathSegmentImpl = function (accept, path, i) {
        let segment = "";
        let escaped = false;
        const limit = path.length;
        for (; i < limit; ++i) {
            const c = path.charAt(i);
            if (!escaped) {
                if (c === ".") {
                    break;
                } else if (c === "\\") {
                    escaped = true;
                } else {
                    segment += c;
                }
            } else {
                escaped = false;
                segment += c;
            }
        }
        accept[0] = segment;
        return i;
    };

    /** Parse an IL path separated by periods (.) into its component segments.
     * @param {String} path - The path expression to be split
     * @return {String[]} Path parsed into segments.
     */
    fluid.parsePath = function (path) {
        const togo = [], accept = [null];
        let index = 0;
        const limit = path.length;
        while (index < limit) {
            const firstdot = fluid.getPathSegmentImpl(accept, path, index);
            togo.push(accept[0]);
            index = firstdot + 1;
        }
        return togo;
    };

    /**
     * Optionally parse a path expression into its component segments.
     * If the input is a primitive value (e.g., a string), it is parsed into segments using `fluid.parsePath`.
     * If the input is already an array of segments, it is returned unchanged.
     *
     * @param {String|String[]} path - The path expression to be split into segments,
     *     or an array of path segments.
     * @return {String[]} The path represented as an array of segments.
     */
    fluid.pathToSegs = function (path) {
        return fluid.isPrimitive(path) ? fluid.parsePath(path) : path;
    };

    fluid.missingPolicies = {
        unavailable: (root, path) => {
            return fluid.unavailable({
                message: `Path ${path} was not found`,
                // TODO: Upgrade incoming data so that it always comes with a full site cursor
                site: root
            });
        },
        error: (root, path) => fluid.fail("Path ", path, " was not found in model ", root)
    };


    /**
     * Retrieve the value at a specified path within a nested object structure.
     * Traverses the object hierarchy based on the path segments.
     *
     * @param {Object} root - The root object to begin traversal from.
     * @param {String|String[]} path - The path to the desired value, specified as a string or an array of path segments.
     * @param {"unavailable"|"error"} [missingPolicy] - An optional policy from `fluid.missingPolicies` to be followed if a value is not found
     * @return {any} The value at the specified path, or `undefined` if the path traverses beyond defined objects.
     */
    fluid.get = function (root, path, missingPolicy) {
        const segs = fluid.pathToSegs(path);
        const limit = segs.length;
        for (let j = 0; j < limit; ++j) {
            root = root ? root[segs[j]] : undefined;
        }
        if (root === undefined && missingPolicy) {
            return fluid.missingPolicies[missingPolicy](root, path);
        } else {
            return root;
        }
    };


    /**
     * Set a value at a specified path within a nested object structure.
     * Creates intermediate objects as needed to ensure the path exists.
     *
     * @param {Object} root - The root object to begin traversal from.
     * @param {String|String[]} path - The path to the location where the value should be set, specified as a string or an array of path segments.
     * @param {any} newValue - The value to set at the specified path.
     */
    fluid.set = function (root, path, newValue) {
        const segs = fluid.pathToSegs(path);
        for (let i = 0; i < segs.length - 1; ++i) {
            const seg = segs[i];
            if (!root[seg]) {
                root[seg] = Object.create(null);
            }
            root = root[seg];
        }
        root[segs[segs.length - 1]] = newValue;
    };

    /** Managing the global namespace **/

    /** Returns any value held at a particular global path. This may be an object or a function, depending on what has been stored there.
     * @param {String|String[]} path - The global path from which the value is to be fetched
     * @return {any} The value that was stored at the path, or a fluid.unavailable value if there is none.
     */
    fluid.getGlobalValue = path => {
        const value = fluid.get(fluid.global, path);
        return value === undefined ? fluid.unavailable({
            message: "Global value " + path + " is not defined",
            path
        }) : value;
    };

    /**
     * Set a value in the global namespace at a specified path.
     * This uses `fluid.set` to traverse and create the necessary structure within `fluid.global`.
     * @param {String|String[]} path - The path in the global namespace where the value should be set, specified as a string or an array of path segments.
     * @param {any} value - The value to set at the specified global path.
     */
    fluid.setGlobalValue = (path, value) => {
        fluid.set(fluid.global, path, value);
    };

    /** Ensures that the supplied path has an object allocated in the global Infusion namespace, and retrieves the current value.
     * If no value is stored, a fresh {} will be assigned at the path, and to all currently empty paths leading to the global namespace root.
     * In a browser environment, the global Infusion namespace is rooted in the global `window`.
     * @param {String|String[]} path - The global path at which the namespace is to be allocated.
     * @return {any} Any current value held at the supplied path - or a freshly allocated {} to be held at that path if it was previously empty
     */
    fluid.registerNamespace = function (path) {
        let existing = fluid.getGlobalValue(path);
        if (fluid.isUnavailable(existing)) {
            existing = Object.create(null);
            fluid.setGlobalValue(path, existing);
        }
        return existing;
    };
};

// If we are standalone and in a browserlike, define namespace
if (typeof(fluid) === "undefined" && typeof(window) !== "undefined") {
    window.fluid = {};
}

// If there is a namespace in the global, bind to it
if (typeof(fluid) !== "undefined") {
    $fluidCoreJSScope(fluid);
}
