"use strict";

// noinspection ES6ConvertVarToLetConst // otherwise this is a duplicate on minifying
var hortis = fluid.registerNamespace("hortis");

hortis.isGraminoid = function (taxonRow) {
    while (taxonRow) {
        if (taxonRow.rank === "family" && (
            taxonRow.iNaturalistTaxonName === "Poaceae" || taxonRow.iNaturalistTaxonName === "Cyperaceae" || taxonRow.iNaturalistTaxonName === "Juncaceae"
        )) {
            return true;
        }
        taxonRow = taxonRow.parent;
    }
    return false;
};

fluid.defaults("hortis.graminoidFilter", {
    gradeNames: ["hortis.taxaFilter", "fluid.stringTemplateRenderingView"],
    markup: {
        container: `
        <div class="imerss-graminoid-filter">
            <div class="imerss-filter-title">Graminoid status:</div>
            <div class="imerss-filter-body imerss-graminoid-filter-checks"> 
            <div class="imerss-filter-row"><div class="imerss-graminoid-check"></div> graminoid</div>
            <div class="imerss-filter-row"><div class="imerss-nongraminoid-check"></div> non-graminoid</div>
            </div>
        </div>
        `
    },
    members: {
        graminoid: "@expand:signal(false)",
        nongraminoid: "@expand:signal(false)",
        filterState: "@expand:fluid.computed(hortis.graminoidFilter.toState, {that}.graminoid, {that}.nongraminoid)"
    },
    invokers: {
        doFilter: "hortis.graminoidFilter.doFilter",
        reset: "hortis.graminoidFilter.reset({that})"
    },
    selectors: {
        graminoid: ".imerss-graminoid-check",
        nongraminoid: ".imerss-nongraminoid-check"
    },
    components: {
        graminoidCheckbox: {
            type: "hortis.checkbox",
            container: "{that}.dom.graminoid",
            options: {
                members: {
                    value: "{graminoidFilter}.graminoid"
                }
            }
        },
        nongraminoidCheckbox: {
            type: "hortis.checkbox",
            container: "{that}.dom.nongraminoid",
            options: {
                members: {
                    value: "{graminoidFilter}.nongraminoid"
                }
            }
        }
    }
});

// Roll on applier-style signalisation
hortis.graminoidFilter.reset = function (that) {
    that.graminoid.value = false;
    that.nongraminoid.value = false;
    // TODO: preactish rendering with signals
    hortis.resetChecks(that.container[0]);
};

hortis.graminoidFilter.toState = function (graminoid, nongraminoid) {
    return {graminoid, nongraminoid};
};

hortis.graminoidFilter.doFilter = function (taxaRows, filterState) {
    const all = filterState.graminoid === filterState.nongraminoid;

    const togo = all ? taxaRows :
        taxaRows.filter(row => hortis.isGraminoid(row) === filterState.graminoid);
    return togo;
};
