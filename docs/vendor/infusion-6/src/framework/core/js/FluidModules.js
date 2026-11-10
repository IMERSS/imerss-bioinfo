"use strict";

// import fluid from "./FluidCore.js"

// An extremely simple base for the module system that just has the functionality of
// tracking base directories for loaded modules, and the ability to interpolate paths
// of the form %module/further-path

fluid.registerNamespace("fluid.module");

// A mapping of module name to a structure containing elements
//    url {String} The URL of the base directory of the module, without terminating slash

fluid.module.modules = {};

/* Canonicalise a path by replacing all backslashes with forward slashes,
 * (such paths are always valid when supplied to Windows APIs) - except for any initial
 * "\\" beginning a UNC path - since this will defeat the simpleminded "// -> /" normalisation which is done in
 * fluid.module.resolvePath, kettle.dataSource.file.handle and similar locations.
 * JavaScript regexes don't support lookbehind assertions, so this is a reasonable strategy to achieve this.
 */
// Currently disused, noone currently registers modules direct from the filesystem - if this is done, someone would
// have to use this utility to compute a canonicalised file:/// URL to the current fluid.module.register
fluid.module.canonPath = function (path) {
    return path.replace(/\\/g, "/").replace(/^\/\//, "\\\\");
};

/*
 * A module which has just loaded will call this API to register itself into
 * the Fluid module loader's records. The call will generally take the form:
 * <code>fluid.module.register("my-module", __dirname, require)</code>
 */
fluid.module.register = function (name, url, origUrl, abs) {
    fluid.log(fluid.logLevel.WARN, "Registering module " + name + " from url " + url);
    fluid.module.modules[name] = {
        url,
        origUrl,
        abs
    };
};

// A module reference, `%name/rest`, where the name may be that of a scoped npm package, e.g. `%@mapbox/mapbox-gl-draw/`
fluid.module.refRegex = /^%((?:@[^/]+\/)?[^/]+)\/(.*)$/;

/**
 * A function which is consulted for a module which is referred to but has not been registered, and which may register
 * it - e.g. as installed by copyOut.js, which finds the module's source where node would find the package of that
 * name. Otherwise `null`, and a module is known only once registered, e.g. by `<fluid-module>` or a module map
 * @type {Function|null}
 */
fluid.module.unregisteredResolver = null;

/**
 * Look up the record of a registered module, consulting `fluid.module.unregisteredResolver` if it is not registered
 * @param {String} name - The name of the module
 * @return {Object|undefined} The module's record, with members `url`, `origUrl` and `abs`, if it is registered
 */
fluid.module.lookup = function (name) {
    if (!fluid.module.modules[name] && fluid.module.unregisteredResolver) {
        fluid.module.unregisteredResolver(name);
    }
    return fluid.module.modules[name];
};

/**
 * Register the modules listed in a module map - an object mapping the name of each module to its directory, relative
 * to the map's own URL. A module already registered, e.g. by `<fluid-module>`, keeps its registration.
 * @param {String} mapUrl - The absolute URL of the map
 * @param {Object<String, String>} map - The map
 */
fluid.module.registerMap = function (mapUrl, map) {
    Object.entries(map).forEach(([name, dir]) => {
        if (!fluid.module.modules[name]) {
            const abs = /^[a-z][a-z0-9+.-]*:/i.test(dir);
            const url = abs ? dir.replace(/\/$/, "") : new URL(dir.replace(/\/$/, "") + "/", mapUrl).href.replace(/\/$/, "");
            fluid.module.register(name, url, dir, abs);
        }
    });
};

/**
 * Resolves a path expression that may begin with a module reference of the form `%moduleName/`
 * into an absolute path using the database of base directories registered with `fluid.module.register`.
 * If the path does not begin with a reference to a known module, it is returned unchanged.
 *
 * @param {String} path - The path expression to resolve, possibly containing a module reference.
 * @return {String} The resolved absolute path, or the original path if no module reference is present.
 */
fluid.module.resolvePath = function (path) {
    const match = fluid.module.refRegex.exec(path);
    const moduleRecord = match && fluid.module.lookup(match[1]);
    return moduleRecord ? moduleRecord.url + "/" + match[2] : path;
};

/**
 * Similar to fluid.module.resolvePath, only it will attempt to interpolate a relative path if the supplied base
 * path shares a prefix with the registered path, and
 *
 * @param {String} base - The base url of a document which is attempting to resolve the module-relative reference.
 * @param {String} path - The path expression to resolve, possibly containing a module reference.
 * @return {String} The resolved path, or the original path if no module reference is present.
 */
fluid.module.resolveRelativePath = function (base, path) {
    const match = fluid.module.refRegex.exec(path);

    if (match) {
        const moduleName = match[1];
        const rest = match[2];
        const moduleRecord = fluid.module.lookup(moduleName);
        if (moduleRecord) {
            const moduleBase = moduleRecord.url;

            if (moduleRecord.abs) {
                // Absolute interpolation requested
                return moduleBase + "/" + rest;
            } else {
                const baseUrl = new URL(base);
                const moduleUrl = new URL(moduleBase);

                if (baseUrl.protocol === moduleUrl.protocol && baseUrl.host === moduleUrl.host) {
                    // Same origin - compute relative path from the directory holding the base document
                    const baseDir = baseUrl.pathname.substring(0, baseUrl.pathname.lastIndexOf("/") + 1);
                    const baseSegments = baseDir.split("/").filter(Boolean);
                    const moduleSegments = moduleUrl.pathname.split("/").filter(Boolean);

                    let prefixIndex = 0;
                    const max = Math.min(baseSegments.length, moduleSegments.length);

                    while (prefixIndex < max && baseSegments[prefixIndex] === moduleSegments[prefixIndex]) {
                        prefixIndex++;
                    }

                    if (prefixIndex === 0) {
                        // No shared path prefix - fall back to absolute
                        return moduleBase + "/" + rest;
                    } else {
                        const upLevels = baseSegments.length - prefixIndex;
                        const upSegments = new Array(upLevels).fill("..");
                        const downSegments = moduleSegments.slice(prefixIndex);

                        return [...upSegments, ...downSegments, rest].join("/");
                    }
                } else {
                    // Different origin - fallback to absolute
                    return moduleBase + "/" + rest;
                }
            }
        } else {
            // Module not registered - return path unchanged
            return path;
        }
    } else {
        // No module reference - return path unchanged
        return path;
    }
};
