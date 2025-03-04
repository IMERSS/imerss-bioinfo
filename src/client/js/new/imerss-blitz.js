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
        regionIndirection: {
            type: "hortis.csvReader",
            options: {
                url: "{vizLoader}.options.regionIndirectionFile"
            }
        },
        blitzRecords: {
            type: "hortis.blitzRecords",
            container: "{vizLoader}.dom.blitzRecords"
        },
        checklist: {
            options: {
                members: {
                    decoration: "@expand:hortis.makeBlitzChecklistRowDecorator()"
                }
            }
        }
    }
});

hortis.blitzChecklistRowDecorators = {
    confirmed: `
    <svg width="18" height="18" class="imerss-checklist-decoration" title="Confirmed: This historical observation has been confirmed by a contributor to the Biodiversity Galiano project">
        <use href="#tick" />
    </svg>
    `,
    unconfirmed: `
    <svg width="18" height="18" class="imerss-checklist-decoration" title="Unconfirmed: This historical observation is yet to be confirmed by a contributor to the Biodiversity Galiano project">
        <use href="#question" />
    </svg>
    `,
    new: `
    <svg width="18" height="18" class="imerss-checklist-decoration" title="New: A contributor to the Biodiversity Galiano project has observed a new taxon not seen in the historical record">
        <use href="#exclamation" />
    </svg>
    `
};

hortis.makeBlitzChecklistRowDecorator = function () {
    return function (taxonRow) {
        return hortis.blitzChecklistRowDecorators[taxonRow.filterReportingStatus] || "";
    };
};


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
        datasetFilter: {
            type: "hortis.regionFilter",
            container: "{that}.dom.datasetFilter",
            options: {
                filterName: "Dataset",
                fieldNames: ["dataset"],
                members: {
                    indirectionRows: "{regionIndirection}.rows"
                }
            }
        }
    }
});

hortis.blitzRecordsTemplate = `
    <div class="imerss-blitz-records">
        <div class="imerss-records-historical imerss-records">
           <div class="records-label">Historical Records</div>
           <div class="records-value">%historicalRecords</div>
        </div>
        <button class="imerss-records-confirmed imerss-records">
           <div class="records-label">Confirmed Records</div>
           <div class="records-value">%confirmedRecords</div>
        </button>
        <button class="imerss-records-unconfirmed imerss-records">
           <div class="records-label">Unconfirmed Records</div>
           <div class="records-value">%unconfirmedRecords</div>        
        </button>
        <button class="imerss-records-new imerss-records">
           <div class="records-label">New Records</div>
           <div class="records-value">%newRecords</div>  
        </button>
    </div>
`;

fluid.defaults("hortis.blitzRecords", {
    gradeNames: ["fluid.stringTemplateRenderingView", "hortis.filter", "hortis.obsDrivenFilter"],
    markup: { // Clearly unsatisfactory, have to move over to preactish rendering before long
        container: hortis.blitzRecordsTemplate
    },
    selectors: {
        // Historical is not a button, count is derived from the other two
        historical: ".imerss-records-historical",
        confirmed: ".imerss-records-confirmed",
        unconfirmed: ".imerss-records-unconfirmed",
        new: ".imerss-records-new"
    },
    events: {
        onRendered: null
    },
    invokers: {                                 // obsRows, filterState
        doFilter: "hortis.blitzRecords.doFilter({arguments}.0, {arguments}.1, {that}.taxaById.value)",
        reset: "hortis.blitzRecords.reset({that})"
    },
    components: {
        confirmedButton: {
            type: "hortis.toggleButton",
            container: "{that}.dom.confirmed",
            createOnEvent: "onRendered",
            options: {
                members: {
                    state: "{hortis.blitzRecords}.confirmed"
                }
            }
        },
        unconfirmedButton: {
            type: "hortis.toggleButton",
            container: "{that}.dom.unconfirmed",
            createOnEvent: "onRendered",
            options: {
                members: {
                    state: "{hortis.blitzRecords}.unconfirmed"
                }
            }
        },
        newButton: {
            type: "hortis.toggleButton",
            container: "{that}.dom.new",
            createOnEvent: "onRendered",
            options: {
                members: {
                    state: "{hortis.blitzRecords}.new"
                }
            }
        }
    },
    members: {
        // cf. Strategy in "hortis.sexFilter" - can we do any better?
        confirmed: "@expand:signal(false)",
        unconfirmed: "@expand:signal(false)",
        new: "@expand:signal(false)",

        filterState: "@expand:fluid.computed(hortis.blitzRecords.toState, {that}.confirmed, {that}.unconfirmed, {that}.new)",
        taxaById: "{taxa}.rowById",
        renderModel: "@expand:fluid.computed(hortis.blitzRecords.render, {that}.taxaById)"
    }
});

hortis.blitzRecords.doFilter = function (obsRows, filterState, taxaById) {
    const count = filterState.confirmed + filterState.unconfirmed + filterState.new;
    const all = count === 0 || count === 3;
    return all ? obsRows : obsRows.filter(obsRow => {
        const taxonRow = taxaById[obsRow.iNaturalistTaxonId];
        return filterState.confirmed && taxonRow.filterReportingStatus === "confirmed"
        || filterState.unconfirmed && taxonRow.filterReportingStatus === "unconfirmed"
        || filterState.new && taxonRow.filterReportingStatus === "new";
    });
};

hortis.blitzRecords.reset = function (that) {
    that.confirmed = false;
    that.unconfirmed = false;
    that.new = false;
};

hortis.blitzRecords.toState = function (confirmed, unconfirmed, noo) {
    return {confirmed, unconfirmed, new: noo};
};

hortis.blitzRecords.render = function (taxaById) {
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
            row.filterReportingStatus = "confirmed";
        } else if (row.reportingStatus === "reported") {
            ++model.unconfirmedRecords;
            ++model.historicalRecords;
            row.filterReportingStatus = "unconfirmed";
        } else if (row.reportingStatus.startsWith("new")) {
            ++model.newRecords;
            row.filterReportingStatus = "new";
        }
    });
    return model;
};

fluid.defaults("hortis.toggleButton", {
    gradeNames: "fluid.viewComponent",
    listeners: {
        "onCreate.bindEvents": "hortis.toggleButton.bindEvents"
    },
    members: {
        renderSelected: "@expand:fluid.effect(hortis.toggleClass, {that}.container.0, selected, {that}.state)"
    }
});

hortis.toggleButton.bindEvents = function (that) {
    that.container[0].addEventListener("click", () => {
        that.state.value = !that.state.value;
    });
};
