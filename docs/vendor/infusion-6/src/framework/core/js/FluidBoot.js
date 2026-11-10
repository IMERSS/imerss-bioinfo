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
// into the bundle of them built into dist - see fluid.writeBootScript
(function () {
    const fluidBoot = {
        moduleName: "infusion-6",
        // The path of this file within Infusion
        bootPath: "src/framework/core/js/FluidBoot.js",
        // The files a page loads, in order, relative to Infusion's root directory
        files: [
            "src/lib/lezer/lezer-javascript-browser.js",
            "src/framework/core/js/FluidCore.js",
            "src/framework/core/js/FluidSignals.js",
            "src/framework/core/js/Fluid.js",
            "src/framework/core/js/FluidModules.js",
            "src/framework/core/js/FluidIL.js",
            "src/framework/core/js/FluidView.js",
            "src/framework/core/js/FluidPTF.js",
            "src/framework/core/js/FluidView-browser.js",
            "src/framework/core/js/template-parser.js",
            "src/framework/core/js/sfc-parser.js"
        ],
        // The bundle of the same files, built by build.js
        builtFile: "dist/fluid.boot.min.js"
    };

    if (typeof(module) !== "undefined" && module.exports) {
        module.exports = fluidBoot;
    } else {
        const src = document.currentScript.getAttribute("src");
        const root = src.substring(0, src.length - fluidBoot.bootPath.length);
        // A page written by hydrate.js already holds the module's declaration
        if (!document.querySelector(`fluid-module[id="${fluidBoot.moduleName}"]`)) {
            document.write(`<fluid-module id="${fluidBoot.moduleName}" src="${root}"></fluid-module>`);
        }
        fluidBoot.files.forEach(file => {
            document.write(`<script src="${root}${file}" fluid-hydrated="%${fluidBoot.moduleName}"></script>`);
        });
    }
})();
