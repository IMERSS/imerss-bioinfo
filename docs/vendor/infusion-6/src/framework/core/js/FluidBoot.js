/*
Copyright The Infusion copyright holders
See the AUTHORS.md file at the top-level directory of this distribution and at
https://github.com/fluid-project/infusion/raw/main/AUTHORS.md.

Licensed under the Educational Community License (ECL), Version 2.0 or the New
BSD license. You may not use this file except in compliance with one these
Licenses.

You may obtain a copy of the ECL 2.0 License and BSD License at
https://github.com/fluid-project/infusion/raw/main/Infusion-LICENSE.txt
*/

/* global module */

"use strict";

// The bootstrap of a page using Infusion - the one reference a page makes to the location of Infusion, which all of its
// other references reach through modules, e.g. %infusion-6/... or %imerss-bioinfo/...:
//     <script src="../vendor/infusion/src/framework/core/js/FluidBoot.js"></script>
// In the browser, this declares Infusion's module, as <fluid-module id="infusion-6">, at the directory holding it, and
// loads each of Infusion's files which a page requires, in order, as the page is parsed. Under node, where Infusion is
// already loaded, the same is done by fluid.expandBootScript in server-support.js, which reads this file's record of
// Infusion's files - and a hydrated or copied out page may be written with the script expanded into those files, or
// into the bundle of them built into dist - see fluid.writeBootScript.
// A page in development may mark the script with data-fluid-dev-mode:
//     <script src="../vendor/infusion/src/framework/core/js/FluidBoot.js" data-fluid-dev-mode></script>
// whereupon the checkout of Infusion named by the nearest moduleOverrides.json5 above it is booted in its place, if
// there is one - see fluidBoot.overriddenRoot. Without the attribute nothing is looked for, so that a page as deployed
// makes no requests beyond Infusion's own files
(function () {
    const fluidBoot = {
        moduleName: "infusion-6",
        // The path of this file within Infusion
        bootPath: "src/framework/core/js/FluidBoot.js",
        // The files a page loads, in order, relative to Infusion's root directory
        files: [
            "src/framework/core/js/FluidCore.js",
            "src/framework/core/js/FluidSignals.js",
            "src/framework/core/js/Fluid.js",
            "src/framework/core/js/FluidModules.js",
            "src/framework/core/js/FluidIL.js",
            "src/framework/core/js/FluidView.js",
            "src/framework/core/js/FluidPTF.js",
            "src/framework/core/js/template-parser.js",
            // Last, since it boots the document as it runs - which, in a page already loaded, is at once, so that every
            // file it relies on, e.g. the template parser reading the SFCs it imports, must have loaded before it
            "src/framework/core/js/FluidView-browser.js"
        ],
        // The bundle of the same files, built by build.js
        builtFile: "dist/fluid.boot.min.js",
        // The file in a site's root, beside its package.json, naming checkouts of modules to be used in place of those
        // installed or vendored - see bin/boot.js
        overridesFile: "moduleOverrides.json5",
        // The attribute by which a page in development marks the script booting Infusion, so that overrides are
        // honoured
        devModeAttribute: "data-fluid-dev-mode"
    };

    /**
     * Parse the text of a moduleOverrides.json5 - the subset of JSON5 such a file is written in, which is JSON together
     * with comments and trailing commas.
     * @param {String} text - The text of the file
     * @return {Object[]} Its entries, each with members `moduleName` and `baseDir`
     */
    fluidBoot.parseOverrides = function (text) {
        // Comments are removed only outside strings, so that a string holding "//" is kept whole
        const uncommented = text.replace(/("(?:\\.|[^"\\])*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (match, string) => string || "");
        return JSON.parse(uncommented.replace(/,(\s*[\]}])/g, "$1"));
    };

    /**
     * Fetch a moduleOverrides.json5 synchronously, since the page is still being parsed and Infusion's files must be
     * written into it in order.
     * @param {String} url - The URL of the file
     * @return {Object[]|null} Its entries, or null if there is no such file, or it cannot be read
     */
    fluidBoot.fetchOverrides = function (url) {
        let togo = null;
        try {
            const request = new XMLHttpRequest();
            request.open("GET", url, false);
            request.send();
            togo = request.status === 200 ? fluidBoot.parseOverrides(request.responseText) : null;
        } catch (e) {
            console.warn("Ignoring unreadable " + url + ": " + e.message);
        }
        return togo;
    };

    /**
     * Determine synchronously whether a file is served.
     * @param {String} url - The URL of the file
     * @return {Boolean} `true` if a request for it succeeds
     */
    fluidBoot.isServed = function (url) {
        let togo = false;
        try {
            const request = new XMLHttpRequest();
            request.open("HEAD", url, false);
            request.send();
            togo = request.status === 200;
        } catch (e) {
            togo = false;
        }
        return togo;
    };

    /**
     * Find the root of the checkout of Infusion which a moduleOverrides.json5 names in place of the Infusion a page
     * boots - so that a page in development boots the same Infusion as the site's tools do, wherever the site keeps
     * the Infusion it names, e.g. in node_modules or vendored into a directory it serves. The file is looked for in the
     * directory holding Infusion's root, and then in each directory above it, up to the root of the server, and the
     * nearest found is honoured - its baseDir resolved relative to it. A checkout is reached only if it is served too,
     * e.g. from a common parent of the site and the checkout. Only a page whose script bears data-fluid-dev-mode
     * does this.
     * @param {String} root - The URL of the root of Infusion as booted, ending in "/"
     * @return {String|null} The URL of the root of the checkout, ending in "/", or null if there is none to boot in
     * place of this one
     */
    fluidBoot.overriddenRoot = function (root) {
        const rootURL = new URL(root, document.baseURI);
        let togo = null;
        let directory = new URL("../", rootURL);
        let searching = true;
        while (searching) {
            const overrides = fluidBoot.fetchOverrides(new URL(fluidBoot.overridesFile, directory).href);
            if (overrides) {
                const entry = overrides.find(entry => entry.moduleName === fluidBoot.moduleName);
                const overridden = entry ? new URL(entry.baseDir.replace(/\/?$/, "/"), directory) : null;
                // A file naming this very Infusion leaves it to boot itself
                const candidate = overridden && overridden.href !== rootURL.href ? overridden.href : null;
                // A checkout which is not served, e.g. one above the root of the server, leaves this one to boot
                togo = candidate && fluidBoot.isServed(candidate + fluidBoot.bootPath) ? candidate : null;
                if (candidate && !togo) {
                    console.warn("Booting Infusion from " + rootURL.href + " since the checkout at " + candidate + " named by " +
                        directory.href + fluidBoot.overridesFile + " is not served");
                }
                searching = false;
            } else if (directory.pathname === "/") {
                searching = false;
            } else {
                directory = new URL("../", directory);
            }
        }
        return togo;
    };

    if (typeof(module) !== "undefined" && module.exports) {
        module.exports = fluidBoot;
    } else {
        const script = document.currentScript;
        const src = script.getAttribute("src");
        const root = src.substring(0, src.length - fluidBoot.bootPath.length);
        const overriddenRoot = script.hasAttribute(fluidBoot.devModeAttribute) ? fluidBoot.overriddenRoot(root) : null;
        if (overriddenRoot) {
            // The checkout's own copy of this file boots it, declaring its module at its own root. Its script bears no
            // data-fluid-dev-mode, so that it does not look for overrides again
            document.write(`<script src="${overriddenRoot}${fluidBoot.bootPath}"></script>`);
        } else {
            // A page written by hydrate.js already holds the module's declaration
            if (!document.querySelector(`fluid-module[id="${fluidBoot.moduleName}"]`)) {
                document.write(`<fluid-module id="${fluidBoot.moduleName}" src="${root}"></fluid-module>`);
            }
            fluidBoot.files.forEach(file => {
                document.write(`<script src="${root}${file}" fluid-hydrated="%${fluidBoot.moduleName}"></script>`);
            });
        }
    }
})();
