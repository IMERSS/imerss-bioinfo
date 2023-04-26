/* eslint-env node */

"use strict";

const fluid = require("infusion"),
    jqUnit = fluid.require("node-jqunit", null, "jqUnit");

const hortis = fluid.registerNamespace("hortis");

hortis.sppAnnotations = ["agg.", "aff.", "s.lat.", "cf", "sp.nov.", "var.", "sp.", "ssp.", "spp.", "complex"];
hortis.annoteRegex = new RegExp("(" + hortis.sppAnnotations.map(annot => annot.replace(".", "\\.")).join("|") + ")", "g");

hortis.renderSpeciesName = function (name) {
    return name.replace(hortis.annoteRegex, "<span class=\"flc-checklist-rank\">$1</span>");
};

jqUnit.test("Styling of annotation", function () {
    const fixture = "Symphyotrichum foliaceum var. foliaceum";
    const expected = "Symphyotrichum foliaceum <span class=\"flc-checklist-rank\">var.</span> foliaceum";
    jqUnit.assertEquals("Styling of annotation", expected, hortis.renderSpeciesName(fixture));
});

