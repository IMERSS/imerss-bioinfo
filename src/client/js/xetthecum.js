/*
Copyright 2022 Antranig Basman
Licensed under the Educational Community License (ECL), Version 2.0 or the New
BSD license. You may not use this file except in compliance with one these
Licenses.
You may obtain a copy of the ECL 2.0 License and BSD License at
https://github.com/fluid-project/infusion/raw/master/Infusion-LICENSE.txt
*/

"use strict";

var hortis = fluid.registerNamespace("hortis");

fluid.defaults("hortis.xetthecumSunburstLoader", {
    gradeNames: "fluid.viewComponent",
    bioPanelLabel: "Biodiversity",
    mapPanelLabel: "Ecological Communities",
    distributeOptions: {
        sunburstLabel: {
            target: "{that hortis.sunburst}.options.model.panelLabel",
            source: "{that}.options.bioPanelLabel"
        },
        checklistLabel: {
            target: "{that hortis.checklist}.options.model.panelLabel",
            source: "{that}.options.bioPanelLabel"
        },
        mapWithLabel: {
            record: "hortis.withPanelLabel",
            target: "{that hortis.leafletMap}.options.gradeNames"
        },
        mapLabel: {
            target: "{that hortis.leafletMap}.options.model.panelLabel",
            source: "{that}.options.mapPanelLabel"
        },
        outerPanelSelector: {
            target: "{that hortis.sunburst}.options.selectors.mapOuterPanel",
            record: ".fld-imerss-map-outer-panel"
        }
    },
    components: {
        infoPanelManager: {
            type: "hortis.infoPanelManager",
            container: "{sunburstLoader}.container",
            createOnEvent: "sunburstLoaded",
            options: {
                listeners: { // Another one for the reuse failure up to 5.x - we have to put these here because of createOnEvent
                    "{hortis.leafletMap}.events.selectRegion": {
                        namespace: "updateInfoPanel",
                        changePath: "{infoPanelManager}.model.visiblePanel",
                        value: "map"
                    },
                    // TODO: Horrid notational problem here - can't duplicate key in JSON and can't put namespace in it
                    "{sunburst}.events.changeLayoutId": [{
                        namespace: "clearMapSelection",
                        listener: "hortis.clearMapSelectionConditionally",
                        args: ["{hortis.leafletMap}", "{arguments}.0", "{arguments}.1"]
                    }, {
                        namespace: "changeLayoutId",
                        changePath: "{infoPanelManager}.model.visiblePanel",
                        value: "taxa"
                    }]
                }
            }
        }
    }
});

hortis.clearMapSelectionConditionally = function (map, layoutId, source) {
    console.log("ClearMapSelectionConditionally with layoutId ", layoutId, " source " + source);
    if (source !== "rowFocus") {
        map.events.clearMapSelection.fire();
    }
};

fluid.defaults("hortis.infoPanelManager", {
    gradeNames: "fluid.viewComponent",
    selectors: {
        map: ".fld-imerss-map-outer-panel-wrapper",
        taxa: ".fld-imerss-taxonDisplay-wrapper"
    },
    panels: {
        map: true,
        taxa: true
    },
    model: {
        visiblePanel: "taxa",
        visiblePanels: {}
    },
    modelRelay: {
        visiblePanels: {
            target: "visiblePanels",
            func: (panel, panels) => {
                return fluid.transform(panels, (troo, thisPanel) => panel === thisPanel);
            },
            args: ["{that}.model.visiblePanel", "{that}.options.panels"]
        },
        visibleMap: {
            target: "dom.map.visible",
            source: "visiblePanels.map"
        },
        visibleTaxa: {
            target: "dom.taxa.visible",
            source: "visiblePanels.taxa"
        }
    }
});
