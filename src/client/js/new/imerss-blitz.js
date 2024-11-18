"use strict";

/* global preactSignalsCore */

// noinspection ES6ConvertVarToLetConst // otherwise this is a duplicate on minifying
var hortis = fluid.registerNamespace("hortis");

// noinspection ES6ConvertVarToLetConst // otherwise this is a duplicate on minifying
var {} = preactSignalsCore;

fluid.defaults("hortis.blitzVizLoader", {
    gradeNames: "hortis.standardVizLoader",
    selectors: {
        blitzRecords: ".imerss-blitz-records"
    },
    mapGrades: ["hortis.vizLibreMap"],
    components: {
        blitzRecords: {
            type: "hortis.blitzRecords",
            container: "{vizLoader}.dom.blitzRecords"
        }
    }
});


hortis.blitzFiltersTemplate = `
    <div class="imerss-filters">
        <div class="imerss-filter"></div>
        <div class="imerss-taxon-filter imerss-filter"></div>
        <div class="imerss-collector-filter imerss-filter"></div>
        <div class="imerss-dataset-filter imerss-filter"></div>
    </div>
`;

fluid.defaults("hortis.blitzFilters", {
    gradeNames: ["hortis.filters", "fluid.stringTemplateRenderingView"],
    markup: { // Clearly unsatisfactory, have to move over to preactish rendering before long
        container: hortis.blitzFiltersTemplate,
        fallbackContainer: hortis.blitzFiltersTemplate
    },
    members: {
        obsRows: "{vizLoader}.obsRows"
    },
    selectors: {
        taxonFilter: ".imerss-taxon-filter",
        collectorFilter: ".imerss-collector-filter",
        datasetFilter: ".imerss-dataset-filter"
    },
    components: {
        filterRoot: "{vizLoader}",
        taxonFilter: {
            type: "hortis.taxonFilter",
            container: "{that}.dom.taxonFilter",
            options: {
                filterName: "Search Species",
                fieldName: "datasetName"
            }
        },
        collectorFilter: {
            type: "hortis.collectorFilter",
            container: "{that}.dom.collectorFilter",
            options: {
                filterName: "Recorder",
                fieldName: "recordedBy"
            }
        },
        monumentFilter: {
            type: "hortis.regionFilter",
            container: "{that}.dom.datasetFilter",
            options: {
                filterName: "Dataset",
                fieldName: "datasetName"
            }
        }
    }
});

hortis.blitzRecordsTemplate = `
    <div class="imerss-blitz-records">
        <div class="imerss-blitz-historical">
           <div class="records-label">Historical Records</div>
           <div class="records-value">%historicalRecords</div>
        </div>
        <div class="imerss-blitz-confirmed">
           <div class="records-label">Confirmed Records</div>
           <div class="records-value">%confirmedRecords</div>
        </div>
        <div class="imerss-blitz-unconfirmed">
           <div class="records-label">Unconfirmed Records</div>
           <div class="records-value">%unconfirmedRecords</div>        
        </div>
        <div class="imerss-blitz-new">
           <div class="records-label">New Records</div>
           <div class="records-value">%newRecords</div>  
        </div>
    </div>
`;

fluid.defaults("hortis.blitzRecords", {
    gradeNames: ["fluid.stringTemplateRenderingView", "hortis.obsDrivenFilter"],
    markup: { // Clearly unsatisfactory, have to move over to preactish rendering before long
        container: hortis.blitzRecordsTemplate
    },
    invokers: {                                 // obsRows, filterState
        doFilter: "hortis.blitzRecords.doFilter({arguments}.0, {arguments}.1)",
        reset: "hortis.blitzRecords.reset({that})"
    },
    members: {
        // taxaFromObs: "{vizLoader}.taxaFromObs",
        filterState: "@expand:signal({})",
        taxaById: "{taxa}.rowById",
        renderModel: "@expand:fluid.computed(hortis.renderBlitzRecords, {that}.taxaById)"
    }
});

hortis.blitzRecords.doFilter = function (obsRows, filterState) {
    return obsRows;
};

hortis.blitzRecords.reset = function (that) {
    that.filterState.value = {};
};

hortis.renderBlitzRecords = function (taxaById) {
    const model = {
        historicalRecords: 0,
        confirmedRecords: 0,
        unconfirmedRecords: 0,
        newRecords: 0
    };
    Object.values(taxaById).forEach(row => {
        if (row.reportingStatus === "confirmed") {
            ++model.confirmedRecords;
            ++model.historicalRecords;
        } else if (row.reportingStatus === "reported") {
            ++model.unconfirmedRecords;
            ++model.historicalRecords;
        } else if (row.reportingStatus.startsWith("new")) {
            ++model.newRecords;
        }
    });
    return model;
};
