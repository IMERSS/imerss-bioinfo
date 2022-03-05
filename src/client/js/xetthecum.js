/*
Copyright 2022 Antranig Basman
Licensed under the Educational Community License (ECL), Version 2.0 or the New
BSD license. You may not use this file except in compliance with one these
Licenses.
You may obtain a copy of the ECL 2.0 License and BSD License at
https://github.com/fluid-project/infusion/raw/master/Infusion-LICENSE.txt
*/

"use strict";

fluid.defaults("hortis.xetthecumSunburstLoader", {
    gradeNames: "fluid.viewComponent",
    bioPanelLabel: "Biodiversity Data",
    mapPanelLabel: "Ecological Habitat",
    distributeOptions: {
        sunburstLabel: {
            target: "{that hortis.sunburst}.options.model.panelLabel",
            source: "{that}.options.bioPanelLabel"
        },
        checklistLabel: {
            target: "{that hortis.checklist}.options.model.panelLabel",
            source: "{that}.options.bioPanelLabel"
        },
        mapLabel: {
            target: "{that hortis.leafletMap}.options.model.panelLabel",
            source: "{that}.options.mapPanelLabel"
        },
        outerPanelSelector: {
            target: "{that hortis.sunburst}.options.selectors.mapOuterPanel",
            record: ".fld-bagatelle-map-outer-panel"
        }
    }
});
