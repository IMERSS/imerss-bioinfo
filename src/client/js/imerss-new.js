/*
Copyright 2017-2023 Antranig Basman
Licensed under the Educational Community License (ECL), Version 2.0 or the New
BSD license. You may not use this file except in compliance with one these
Licenses.
You may obtain a copy of the ECL 2.0 License and BSD License at
https://github.com/fluid-project/infusion/raw/master/Infusion-LICENSE.txt
*/

"use strict";
// noinspection ES6ConvertVarToLetConst // otherwise this is a duplicate on minifying
var hortis = fluid.registerNamespace("hortis");

fluid.defaults("hortis.sunburstLoader", {
    gradeNames: ["fluid.viewComponent", "fluid.resourceLoader", "hortis.configHolder"],

    resources: {
        taxa: {},
        obs: {
            url: "{that}.options.obsFile",
            dataType: "binary",
            options: {
                processData: false,
                responseType: "arraybuffer"
            }
        }
    }
});