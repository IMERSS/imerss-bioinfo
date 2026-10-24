"use strict";

/* global imerss, d3, Papa, signal, computed, batch */

// noinspection ES6ConvertVarToLetConst // otherwise this is a duplicate on minifying
var hortis = fluid.registerNamespace("hortis");

fluid.defaults("hortis.beaVizLoader", {
    mapGrades: ["hortis.bbeaLibreMap"],
    selectors: {
        interactions: ".imerss-interactions-holder",
        bipartite: ".imerss-bipartite",
        recordReporter: ".imerss-record-reporter",
        filterControls: ".imerss-filter-controls",
        filters: ".imerss-facets",
        filterPane: ".mf-pane-filters",
        loadingIndicator: ".bee-loading-container",
        bbeaFilters: ".imerss-bbea-filters",
        fullScreen: ".imerss-fullscreen",
        collectorReport: ".imerss-collector-report",
        views: ".mf-pane-views",
        viewDownload: ".imerss-view-download",
        beeList: ".imerss-bee-list",
        plantList: ".imerss-plant-list",
        beeAbundance: ".imerss-bee-abundance",
        seedMix: ".imerss-seed-mix"
    },
    // Map from the id of each tab in the views pane to the name of the component which can download its contents
    viewDownloaders: {
        net: "bipartite",
        mtx: "drawInteractions",
        bees: "beeList",
        plants: "plantList",
        abund: "beeAbundance",
        seed: "seedMix"
    },
    listeners: {
        "onCreate.bindViewDownload": "hortis.beaVizLoader.bindViewDownload({that}, {that}.dom.viewDownload, {viewTabs}.selectedTab)"
    },
    members: {
        filteredObs: "{obsFilters}.allOutput",
        taxaFromObs: "@expand:fluid.computed(hortis.twoTaxaFromObs, {that}.filteredObs, {taxa}.rowById)",
        allTaxaFromObs: "@expand:fluid.computed(hortis.twoTaxaFromObs, {that}.obsRows, {taxa}.rowById)",
        // Funny hack since this is computed in an effect by interactions - review this
        finalFilteredObs: "@expand:signal()",
        hideLoadingIndicator: "@expand:fluid.effect(hortis.beaVizLoader.hideLoadingIndicator, {that}.rendered)"
    },
    components: {
        regionIndirection: {
            type: "hortis.csvReader",
            options: {
                url: "{vizLoader}.options.regionIndirectionFile"
            }
        },
        collectorReportLinker: {
            type: "hortis.collectorReportLinker",
            container: "{that}.dom.collectorReport",
            options: {
                stateCode: "{beaVizLoader}.options.stateCode",
                members: {
                    collectorName: "{obsFilters}.collectorFilter.filterState"
                }
            }
        },
        filterControls: {
            type: "hortis.filterControls",
            container: "{that}.dom.filterControls"
        },
        recordReporter: {
            type: "hortis.recordReporter",
            container: "{that}.dom.recordReporter",
            options: {
                markup: {
                    container: `<p>Displaying <b title="Observation records matching every filter and the current bee and plant selections">%filteredRows</b>
                        of <span title="Total number of observation records in this dataset">%allRows</span> records</p>`
                },
                members: {
                    filteredRows: "{vizLoader}.finalFilteredObs",
                    allRows: "{vizLoader}.obsRows",
                    renderModel: "@expand:fluid.computed(hortis.beaVizLoader.recordReporterModel, {that}.filteredRows, {that}.allRows)"
                }
            }
        },
        shellLayout: {
            type: "hortis.mfShell",
            container: "{that}.container"
        },
        concertina: {
            type: "hortis.filterConcertina",
            container: "{that}.dom.filterPane"
        },
        obsFilters: {
            type: "hortis.bbeaFilters",
            container: "{that}.dom.filters",
            options: {
                members: {
                    allInput: "{vizLoader}.obsRows",
                    rendered: "{hortis.vizLoader}.rendered",
                    idle: "{hortis.vizLoader}.idle"
                }
            }
        },
        pollChecklist: {
            type: "hortis.checklist.withHolder",
            container: ".imerss-pollinators",
            options: {
                gradeNames: ["hortis.checklist.withOBA", "hortis.checklist.withSearch", "hortis.checklist.withRankFold", "hortis.checklist.withFilterSummary"],
                rootId: 1,
                filterRanks: ["epifamily", "family", "tribe", "genus", "subgenus", "species"],
                disclosableRanks: ["tribe", "genus", "subgenus", "species"],
                copyChecklistRanks: ["genus", "species"],
                selectable: true,
                unfoldable: true,
                copyButtonMessage: "Copy %rows bee taxa to clipboard",
                summaryNouns: ["bee taxon", "bee taxa"],
                searchControlId: "fli-imerss-bee-search",
                members: {
                    rowById: "{taxa}.rowById",
                    rowFocus: "@expand:fluid.derefSignal({vizLoader}.taxaFromObs, pollRowFocus)"
                }
            }
        },
        bbeaFilters: {
            container: "{that}.dom.bbeaFilters",
            type: "hortis.bbeaBbeaFilters"
        },
        plantChecklist: {
            type: "hortis.checklist.withHolder",
            container: ".imerss-plants",
            options: {
                gradeNames: ["hortis.checklist.withOBA", "hortis.checklist.withSearch", "hortis.checklist.withRankFold", "hortis.checklist.withFilterSummary"],
                rootId: 47126,
                filterRanks: ["kingdom", "order", "family", "genus"],
                disclosableRanks: ["family", "genus"],
                copyChecklistRanks: ["genus"],
                selectable: true,
                unfoldable: true,
                copyButtonMessage: "Copy %rows plant taxa to clipboard",
                summaryNouns: ["plant taxon", "plant taxa"],
                searchControlId: "fli-imerss-plant-search",
                members: {
                    rowById: "{taxa}.rowById",
                    rowFocus: "@expand:fluid.derefSignal({vizLoader}.taxaFromObs, plantRowFocus)"
                }
            }
        },
        viewTabs: {
            type: "hortis.viewTabs",
            container: "{that}.dom.views"
        },
        beeList: {
            type: "hortis.taxonListView",
            container: "{that}.dom.beeList",
            options: {
                tabId: "bees",
                idField: "pollinatorINatId",
                colourByFamily: true,
                noun: "bee",
                downloadFile: "bees.csv"
            }
        },
        plantList: {
            type: "hortis.taxonListView",
            container: "{that}.dom.plantList",
            options: {
                tabId: "plants",
                idField: "plantINatId",
                colourByFamily: false,
                noun: "plant",
                downloadFile: "plants.csv"
            }
        },
        beeAbundance: {
            type: "hortis.beeAbundance",
            container: "{that}.dom.beeAbundance"
        },
        seedMix: {
            type: "hortis.seedMix",
            container: "{that}.dom.seedMix"
        },
        interactions: {
            type: "hortis.interactions",
            options: {
                members: {
                    obsRows: "{vizLoader}.filteredObs",
                    plantSelection: "{plantChecklist}.rowSelection",
                    pollSelection: "{pollChecklist}.rowSelection",
                    rowById: "{taxa}.rowById",
                    finalFilteredObs: "{vizLoader}.finalFilteredObs"
                }
            }
        },
        drawInteractions: {
            type: "hortis.drawInteractions",
            container: "{that}.dom.interactions"
        },
        bipartite: {
            type: "hortis.bipartite",
            container: "{that}.dom.bipartite",
            options: {
                members: {
                    // TODO: Split drawInteractions render prepare back out into interactions
                    bipartiteRows: "{drawInteractions}.bipartiteRows",
                    beeSelection: "{pollChecklist}.rowSelection",
                    beeIdToEntry: "{pollChecklist}.idToEntry",
                    plantSelection: "{plantChecklist}.rowSelection",
                    plantIdToEntry: "{plantChecklist}.idToEntry"
                }
            }
        },
        fullScreenControl: {
            type: "hortis.fullScreenControl",
            container: "{that}.dom.fullScreen",
            options: {
                fullScreenElement: "{vizLoader}.container.0"
            }
        }
    }
});

hortis.beaVizLoader.hideLoadingIndicator = function () {
    const container = document.querySelector(".bee-loading-container");
    container.classList.add("bee-loading-container-hidden");
    window.setTimeout(() => container.remove(), 1000);
};

hortis.beaVizLoader.recordReporterModel = function (filteredRows, allRows) {
    return {
        filteredRows: hortis.formatInt(filteredRows.length),
        allRows: hortis.formatInt(allRows.length)
    };
};

/**
 * Bind the download button in the views pane's tab strip so that it downloads the contents of whichever view is
 * currently selected.
 * @param {hortis.beaVizLoader} that - The loader component, whose `viewDownloaders` option maps tab ids to component names
 * @param {jQuery} button - The download button
 * @param {Signal<String>} selectedTab - The id of the currently selected tab
 */
hortis.beaVizLoader.bindViewDownload = function (that, button, selectedTab) {
    button.on("click", () => {
        const componentName = that.options.viewDownloaders[selectedTab.value];
        that[componentName].download();
    });
};

/**
 * Trigger the download of a table as a CSV file.
 * @param {String[]} headers - The column headers
 * @param {Array[]} rows - The rows of the table, each an array of cell values
 * @param {String} filename - The name of the file to be downloaded
 */
hortis.downloadCSV = function (headers, rows, filename) {
    const content = Papa.unparse({fields: headers, data: rows});
    hortis.triggerDownload(content, "text/csv", filename);
};

// Manages the draggable and collapsible bars separating the shell's panes
fluid.defaults("hortis.mfShell", {
    gradeNames: "fluid.viewComponent",
    selectors: {
        shell: ".mf-shell",
        middle: ".mf-middle",
        grips: ".mf-grip"
    },
    // Distance in pixels a pointer must move on a grip's tab before a press counts as a drag
    dragSlop: 3,
    listeners: {
        "onCreate.bindGrips": "hortis.mfShell.bindGrips"
    }
});

/**
 * Collapse or restore the pane beside a grip.
 * @param {hortis.mfShell} that - The shell component
 * @param {HTMLElement} grip - A `.mf-grip` element carrying `data-flag` and `data-axis`
 */
hortis.mfShell.toggleGrip = function (that, grip) {
    const host = grip.dataset.axis === "y" ? that.locate("middle")[0] : that.locate("shell")[0];
    const closed = host.classList.toggle("mf-" + grip.dataset.flag);
    grip.classList.toggle("mf-closed", closed);
    const tab = grip.querySelector(".mf-grip-tab");
    const what = grip.dataset.axis === "y" ? "views" : "filters";
    tab.setAttribute("aria-label", (closed ? "Expand " : "Collapse ") + what);
    tab.setAttribute("title", (closed ? "Expand " : "Collapse ") + what);
};

/**
 * Resize the panes beside a grip.
 * @param {hortis.mfShell} that - The shell component
 * @param {HTMLElement} grip - The grip being moved
 * @param {Number} position - The new position of the grip in client coordinates on its axis
 */
hortis.mfShell.moveGrip = function (that, grip, position) {
    const root = that.container[0];
    if (grip.dataset.axis === "y") {
        const box = that.locate("middle")[0].getBoundingClientRect();
        const raw = (position - box.top) / box.height * 100;
        const share = Math.min(82, Math.max(18, raw));
        root.style.setProperty("--mf-row-map", share + "fr");
        root.style.setProperty("--mf-row-net", (100 - share) + "fr");
    } else {
        const box = that.locate("shell")[0].getBoundingClientRect();
        const size = position - box.left;
        const clamped = Math.min(Number(grip.dataset.max), Math.max(Number(grip.dataset.min), size));
        root.style.setProperty(grip.dataset.var, clamped + "px");
    }
};

hortis.mfShell.bindGrip = function (that, grip) {
    const root = that.container[0];
    const tab = grip.querySelector(".mf-grip-tab");
    const axisPos = event => grip.dataset.axis === "y" ? event.clientY : event.clientX;
    let origin = null;
    let moved = false;
    let onTab = false;

    grip.addEventListener("pointerdown", function (event) {
        origin = axisPos(event);
        moved = false;
        // Capture retargets later events to the grip, so decide here whether the press began on the tab
        onTab = tab !== null && tab.contains(event.target);
        grip.setPointerCapture(event.pointerId);
        root.classList.add("mf-dragging");
    });

    grip.addEventListener("pointermove", function (event) {
        if (origin !== null) {
            if (Math.abs(axisPos(event) - origin) > that.options.dragSlop) {
                moved = true;
            }
            if (moved) {
                hortis.mfShell.moveGrip(that, grip, axisPos(event));
            }
        }
    });

    grip.addEventListener("pointerup", function (event) {
        const wasTab = onTab;
        const wasDrag = moved;
        if (origin !== null) {
            grip.releasePointerCapture(event.pointerId);
        }
        origin = null;
        onTab = false;
        root.classList.remove("mf-dragging");
        if (wasTab && !wasDrag) {
            hortis.mfShell.toggleGrip(that, grip);
        }
    });

    grip.addEventListener("keydown", function (event) {
        const less = event.key === "ArrowLeft" || event.key === "ArrowUp";
        const more = event.key === "ArrowRight" || event.key === "ArrowDown";
        if (less || more) {
            event.preventDefault();
            const step = more ? 20 : -20;
            const box = grip.getBoundingClientRect();
            const centre = grip.dataset.axis === "y" ? box.top + box.height / 2 : box.left + box.width / 2;
            hortis.mfShell.moveGrip(that, grip, centre + step);
        } else if (event.key === "Enter") {
            event.preventDefault();
            hortis.mfShell.toggleGrip(that, grip);
        }
    });
};

hortis.mfShell.bindGrips = function (that) {
    that.locate("grips").each((index, grip) => hortis.mfShell.bindGrip(that, grip));
};

// The concertina of filter sections in the filter pane, each with a badge in its header summing the summaries of the
// filters whose containers it holds - see hortis.summarisedFilter
fluid.defaults("hortis.filterConcertina", {
    gradeNames: "fluid.viewComponent",
    selectors: {
        facets: ".mf-facet",
        collapseAll: ".imerss-collapse-facets"
    },
    members: {
        // Look up the filters only once they have first been evaluated, by which time the whole tree has been constructed
        filters: "@expand:fluid.computed(hortis.filterConcertina.findFilters, {vizLoader}, {vizLoader}.rendered)",
        facetSummaries: "@expand:hortis.filterConcertina.facetSummaries({that}.filters)",
        renderBadges: "@expand:fluid.effect(hortis.filterConcertina.renderBadges, {that}.dom.facets, {that}.facetSummaries)"
    },
    listeners: {
        "onCreate.bindEvents": "hortis.filterConcertina.bindEvents"
    }
});

/**
 * Find all the filters in the tree which can summarise their settings.
 * @param {fluid.component} vizLoader - The root of the tree of filters
 * @return {hortis.summarisedFilter[]} The filters which have a `filterSummary`
 */
hortis.filterConcertina.findFilters = function (vizLoader) {
    return fluid.queryIoCSelector(vizLoader, "hortis.summarisedFilter", false).filter(filter => filter.filterSummary);
};

/**
 * Compute a signal holding the summary of each section of the concertina, combined from the summaries of the filters
 * within it. Summaries which are not yet available contribute nothing.
 * @param {Signal<hortis.summarisedFilter[]>} filters - The filters to be summarised
 * @return {Signal<Map<HTMLElement, FilterSummary>>} Signal holding a map of each section's element to its combined
 * summary, which shows a plain marker only if every active filter within it does
 */
hortis.filterConcertina.facetSummaries = function (filters) {
    return computed(() => {
        const summaries = new Map();
        (filters.value || []).forEach(filter => {
            const summary = filter.filterSummary.value;
            const facet = filter.container?.[0]?.closest(".mf-facet");
            if (summary && summary.count > 0 && facet) {
                const existing = summaries.get(facet);
                if (existing) {
                    existing.count += summary.count;
                    existing.dot = existing.dot && !!summary.dot;
                    existing.title += "; " + summary.title;
                } else {
                    summaries.set(facet, {count: summary.count, dot: !!summary.dot, title: summary.title});
                }
            }
        });
        return summaries;
    });
};

/**
 * Update the badge in each filter section's header from the current section summaries.
 * @param {jQuery} facets - The sections of the concertina
 * @param {Map<HTMLElement, FilterSummary>} facetSummaries - Map of section element to its summary
 */
hortis.filterConcertina.renderBadges = function (facets, facetSummaries) {
    facets.each((index, facet) => {
        const summary = facetSummaries.get(facet);
        const badge = facet.querySelector("[data-state]");
        if (summary) {
            facet.classList.add("mf-facet-live");
            badge.hidden = false;
            badge.classList.toggle("mf-facet-state-dot", summary.dot);
            badge.textContent = summary.dot ? "" : String(summary.count);
            badge.setAttribute("title", summary.title);
            badge.setAttribute("aria-label", summary.title);
        } else {
            facet.classList.remove("mf-facet-live");
            badge.hidden = true;
            badge.textContent = "";
        }
    });
};

hortis.filterConcertina.setOpen = function (head, open) {
    head.setAttribute("aria-expanded", open ? "true" : "false");
    document.getElementById(head.getAttribute("aria-controls")).hidden = !open;
};

hortis.filterConcertina.bindEvents = function (that) {
    that.container.on("click", ".mf-facet-head", function () {
        hortis.filterConcertina.setOpen(this, this.getAttribute("aria-expanded") !== "true");
    });
    that.locate("collapseAll").on("click", () => {
        that.container.find(".mf-facet-head").each((index, head) => hortis.filterConcertina.setOpen(head, false));
    });
};

// The tabs heading the views pane - a simple replacement for jQuery UI tabs which allows each view to know whether
// it is showing so that it need only render when it is
fluid.defaults("hortis.viewTabs", {
    gradeNames: "fluid.viewComponent",
    initialTab: "net",
    selectors: {
        tabs: ".mf-tab",
        panels: "[data-panel]",
        download: ".imerss-view-download"
    },
    downloadTitles: {
        net: "Download the network as a PNG image",
        mtx: "Download the interaction counts as CSV",
        bees: "Download the bee list as CSV",
        plants: "Download the plant list as CSV",
        abund: "Download bee abundance counts as CSV",
        seed: "Download the seed mix as CSV"
    },
    members: {
        selectedTab: "@expand:signal({that}.options.initialTab)",
        renderTabs: "@expand:fluid.effect(hortis.viewTabs.render, {that}, {that}.selectedTab)"
    },
    listeners: {
        "onCreate.bindEvents": "hortis.viewTabs.bindEvents"
    }
});

hortis.viewTabs.render = function (that, selectedTab) {
    that.locate("tabs").each((index, tab) => {
        const on = tab.dataset.tab === selectedTab;
        tab.classList.toggle("mf-tab-on", on);
        tab.setAttribute("aria-selected", on ? "true" : "false");
        tab.setAttribute("tabindex", on ? "0" : "-1");
    });
    that.locate("panels").each((index, panel) => {
        panel.hidden = panel.dataset.panel !== selectedTab;
    });
    const title = that.options.downloadTitles[selectedTab];
    that.locate("download").attr({title, "aria-label": title});
};

hortis.viewTabs.bindEvents = function (that) {
    that.container.on("click", ".mf-tab", function () {
        that.selectedTab.value = this.dataset.tab;
    });
    that.container.on("keydown", ".mf-tab", function (event) {
        const tabs = that.locate("tabs").toArray();
        const index = tabs.indexOf(this);
        const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
        if (step !== 0) {
            event.preventDefault();
            const next = tabs[(index + step + tabs.length) % tabs.length];
            that.selectedTab.value = next.dataset.tab;
            next.focus();
        }
    });
};

/**
 * Compute a signal which is `true` whilst a particular tab of the views pane is selected.
 * @param {Signal<String>} selectedTab - The id of the currently selected tab
 * @param {String} tabId - The id of the tab of interest
 * @return {Signal<Boolean>} `true` whilst the tab is selected
 */
hortis.viewTabs.isSelected = function (selectedTab, tabId) {
    return computed(() => selectedTab.value === tabId);
};

/**
 * Track the content width of an element in a signal.
 * @param {HTMLElement} node - The element to be observed
 * @return {Signal<Number>} The content width of the element, updated whenever it is laid out with nonzero width
 */
hortis.widthSignal = function (node) {
    const width = signal();
    const observer = new ResizeObserver(entries => {
        entries.forEach(entry => {
            if (entry.contentRect.width > 0) {
                width.value = entry.contentRect.width;
            }
        });
    });
    observer.observe(node);
    return width;
};

fluid.defaults("hortis.fullScreenControl", {
    gradeNames: "fluid.viewComponent",
    members: {
        enabled: "@expand:signal()",
        fullScreenEffect: "@expand:fluid.effect(hortis.fullScreenEffect, {that}.enabled, {that}.options.fullScreenElement)"
    },
    listeners: {
        "onCreate.bind": "hortis.fullScreenControl.bind({that}.container, {that}.enabled)"
    }
});

hortis.fullScreenEffect = async function (enabled, fullScreenElement) {
    if (enabled) {
        await fullScreenElement.requestFullscreen();
    } else {
        try {
            await document.exitFullscreen();
        } catch (e) {}
    }
};

hortis.fullScreenControl.bind = function (container, enabled) {
    const body = document.querySelector("body");
    container.click(() => {
        enabled.value = !enabled.value;
        hortis.toggleClass(body, "imerss-fullscreen-mode", enabled.value);
    });
};

fluid.defaults("hortis.collectorReportLinker", {
    gradeNames: "fluid.stringTemplateRenderingView",
    // stateCode
    markup: {
        container: `
        <div>
            <div>Volunteer reports available:</div><div>%reports</div>
        </div>
        `,
        linkText: "%collectorName %state Summary (%year)",
        linkTarget: "https://oregon-bee-project.github.io/melittoflora/reports/%reportPath"
    },
    members: {
        // collectorName
        reportIndex: "@expand:fluid.fetchJSON(https://oregon-bee-project.github.io/melittoflora/reportIndex.json)",
        collectorReports: "@expand:fluid.computed(hortis.findCollectorReports, {that}.collectorName, {that}.reportIndex, {that}.options.stateCode)",
        showControl: "@expand:fluid.effect(hortis.toggleClass, {that}.container.0, fl-hidden, {that}.collectorReports, true)",
        renderModel: "@expand:fluid.computed(hortis.collectorReportLinker.renderModel, {that}.collectorName, {that}.collectorReports, {that}.options.markup.linkText, {that}.options.markup.linkTarget)"
    }
});

hortis.findCollectorReports = function (collectorName, reportIndex, stateCode) {
    if (collectorName) {
        const collectorNorm = collectorName.replaceAll("|", "and");
        const reports = reportIndex[collectorNorm];
        return reports ? (stateCode ? reports.filter(oneReport => oneReport.state === stateCode) : reports) : null;
    } else {
        return undefined;
    }
};

hortis.collectorReportLinker.renderModel = function (collectorName, collectorReports, linkTextTemplate, linkTargetTemplate) {
    const linkTemplate = `<a href="%target" target="_blank">%linkText</a><span className="external-link"></span>`;
    return {
        reports: collectorReports.map(({state, year, report}) => fluid.stringTemplate(linkTemplate, {
            target: fluid.stringTemplate(linkTargetTemplate, {reportPath: report}),
            linkText: fluid.stringTemplate(linkTextTemplate, {collectorName, state, year})
        })).join("\n")
    };
};

hortis.twoTaxaFromObs = function (filteredObs, rowById) {
    const plantIds = {},
        pollIds = {};
    filteredObs.forEach(row => {
        plantIds[row.plantINatId] = true;
        pollIds[row.pollinatorINatId] = true;
    });
    const togo = {
        plantRowFocus: hortis.closeParentTaxa(plantIds, rowById),
        pollRowFocus: hortis.closeParentTaxa(pollIds, rowById)
    };
    return togo;
};

// TODO: Why is this disused
hortis.filterObsByTwoTaxa = function (obsRows, plantRowFocus, pollRowFocus) {
    const filteredObs = [];
    obsRows.forEach(function (row) {
        const accept = plantRowFocus[row.plantINatId] && pollRowFocus[row.pollinatorINatId];
        if (accept) {
            filteredObs.push(row);
        }
    });
    return filteredObs;
};


fluid.defaults("hortis.interactions", {
    gradeNames: "fluid.modelComponent",
    members: {
        obsRows: "@expand:signal()",
        plantSelection: "@expand:signal()",
        pollSelection: "@expand:signal()",
        // keys are plantId|pollId, values ints
        crossTable: "@expand:fluid.computed(hortis.interactions.count, {that}, {that}.obsRows, {that}.plantSelection, {that}.pollSelection)",
        // Accessing crossTable.value will populate these three by a hideous side-effect
        plantCounts: {},
        pollCounts: {}
    }
});

// Note that we can't use bitwise operators since they are defined to work on 32 bit operands!!
// https://stackoverflow.com/questions/63697853/js-bitwise-shift-operator-not-returning-the-correct-result
hortis.SHIFT = 2 ** 22;
hortis.MASK = hortis.SHIFT - 1;

hortis.intIdsToKey = function (plantId, pollId) {
    return ((+plantId) * hortis.SHIFT) + (+pollId);
};

hortis.keyToIntIds = function (key) {
    return {
        plantId: Math.floor(key / hortis.SHIFT),
        pollId: key & hortis.MASK
    };
};

hortis.addCount = function (table, key, count = 1) {
    if (table[key] === undefined) {
        table[key] = 0;
    }
    table[key] += count;
};

hortis.max = function (hash) {
    let max = Number.NEGATIVE_INFINITY;
    fluid.each(hash, function (val) {
        max = Math.max(val, max);
    });
    return max;
};

hortis.maxReducer = function () {
    const togo = {
        value: Number.NEGATIVE_INFINITY,
        reduce: next => {togo.value = Math.max(next, togo.value);}
    };
    return togo;
};

hortis.minReducer = function () {
    const togo = {
        value: Number.POSITIVE_INFINITY,
        reduce: next => {togo.value = Math.min(next, togo.value);}
    };
    return togo;
};


hortis.findAncestor = function (row, selection) {
    let move = row;
    while (move !== undefined) {
        if (selection[move.id] !== undefined) {
            return move.id;
        }
        move = move.parent;
    }
};

hortis.ancestorHitCache = function (selection, rowById) {
    const taxonToAncestor = {};
    return {
        taxonToAncestor,
        get: function (taxonId) {
            const existing = taxonToAncestor[taxonId];
            if (existing !== undefined) {
                return existing;
            } else {
                // eslint-disable-next-line eqeqeq
                const row = taxonId == 0 ? hortis.checklist.NO_TAXON_ROW : rowById[taxonId];
                const computed = hortis.findAncestor(row, selection);
                taxonToAncestor[taxonId] = computed;
                return computed;
            }
        }
    };
};

/** Count plant-pollinator interactions for the current taxonomic selection
 *
 * @param {hortis.interactions} that - The interactions component
 * @param {obsRow[]} rows - The full set of observation rows
 * @param {Object<key, true>} plantSelection - The currently selected plant taxa
 * @param {Object<key, true>} pollSelection - The currently selected pollinator taxa
 * @return {Object<int, int>} - Hash bins keyed by integer cross key to interaction count.
 */
hortis.interactions.count = function (that, rows, plantSelection, pollSelection) {
    const rowById = that.rowById.peek();
    const plantCache = hortis.ancestorHitCache(plantSelection, rowById);
    const pollCache = hortis.ancestorHitCache(pollSelection, rowById);

    const crossTable = {};
    const plantCounts = {counts: {}, max: 0};
    const pollCounts = {counts: {}, max: 0};

    const now = Date.now();
    const f = hash => Object.keys(hash).length;

    const finalFilteredObs = [];

    // Currently get several notifications during startup, turn checklist's rowSelection into a computed rather than effect
    if (f(plantSelection) && f(pollSelection)) {
        rows.forEach(function (row) {
            const {pollinatorINatId: pollId, plantINatId: plantId} = row;
            if (plantId && pollId) {
                const plantCountKey = plantCache.get(plantId);
                const pollCountKey = pollCache.get(pollId);
                if (plantCountKey && pollCountKey) {
                    const key = hortis.intIdsToKey(plantCountKey, pollCountKey);

                    hortis.addCount(crossTable, key);
                    hortis.addCount(plantCounts.counts, plantCountKey);
                    hortis.addCount(pollCounts.counts, pollCountKey);
                    finalFilteredObs.push(row);
                }
            }
        });
    }

    plantCounts.max = hortis.max(plantCounts.counts);
    pollCounts.max = hortis.max(pollCounts.counts);

    const cells = Object.keys(crossTable).length;
    const plants = Object.keys(plantCounts.counts).length;
    const polls = Object.keys(pollCounts.counts).length;
    fluid.log("Counted ", rows.length + " obs into " + cells + " interaction cells for " + plants + " plants and " + polls + " pollinators");
    fluid.log("Occupancy: " + (100 * (cells / (plants * polls))).toFixed(2) + "%");
    const delay = Date.now() - now;
    fluid.log("Computed interactions in " + delay + " ms");

    that.plantCounts = plantCounts;
    that.pollCounts = pollCounts;
    // Hack since we are in a computation - in fact count should make a multiple return
    fluid.invokeLater(() => that.finalFilteredObs.value = finalFilteredObs);
    return crossTable;
};

hortis.pollColours = {
    family: {
        "Andrenidae": "#E41A1C",
        "Apidae": "#377EB8",
        "Colletidae": "#4DAF4A",
        "Megachilidae": "#FF7F00",
        "Halictidae": "#984EA3",
        "Melittidae": "#ECC846"
    }
};

hortis.plantColours = {
    phylum: {
        "Tracheophyta": "#4DAF4A"
    }
};

hortis.computeRankColours = function (selection, colourIndex, idToEntry) {
    const entries = Object.keys(selection).map(id => idToEntry[id]).filter(entry => entry);
    const rows = entries.sort((a, b) => a.index - b.index).map(entry => entry.row);
    const colourEntries = rows.map(row => {
        let togo = [row.iNaturalistTaxonName, null];
        while (row) {
            const entry = colourIndex[row.rank]?.[row.iNaturalistTaxonName];
            if (entry) {
                togo[1] = entry;
                break;
            }
            row = row.parent;
        }
        return togo;
    });
    const colours = Object.fromEntries(colourEntries);
    return {rows, colours};
};

fluid.defaults("hortis.bipartite", {
    gradeNames: "fluid.viewComponent",
    selectors: {
        svg: "svg"
    },
    invokers: {
        download: "hortis.bipartite.download({that}.dom.svg.0)"
    },
    members: {
        bipartiteRows: "@expand:signal()",
        beeSelection: "@expand:signal()",
        plantSelection: "@expand:signal()",
        rendered: "@expand:signal()",
        // beeIdToEntry: {}, - injected from checklist
        // plantIdToEntry: {}
        containerWidth: "@expand:signal()",
        render: "@expand:fluid.effect(hortis.bipartite.render, {that}, {that}.dom.svg.0, {that}.containerWidth, {that}.bipartiteRows, {that}.beeIdToEntry, {that}.plantIdToEntry)"
    },
    listeners: {
        "onCreate.listenWidth": "hortis.bipartite.listenWidth({that}.container.0, {that}.containerWidth)"
    }
});

hortis.bipartite.listenWidth = function (containerNode, widthSignal) {
    const observer = new ResizeObserver(entries => {
        entries.forEach(entry => {
            const width = entry.contentRect.width;
            if (width > 0) {
                widthSignal.value = entry.contentRect.width;
            }
        });
    });
    observer.observe(containerNode);
};

// This gets injected into a rendered bipartite diagram - keep in step with imerss-bbea.css etc.
hortis.bipartite.css = `
<style>
    svg {
        font-size: 14px;
        font-family: Arial,Helvetica,sans-serif;
    }
    .bipartite-label {
        font-size: 18px;
        font-weight: 500;
    }
</style>
`;


hortis.loadImage = async url => {
    const $img = document.createElement("img");
    $img.src = url;
    return new Promise((resolve) => {
        $img.onload = () => resolve($img);
        $img.onerror = e => {
            console.log("Got error ", e);
        };
        $img.src = url;
    });
};

hortis.getCanvasBlob = async (svgURL, { format, quality, scale }) => {
    const img = await hortis.loadImage(svgURL);

    const $canvas = document.createElement("canvas");
    $canvas.width = img.naturalWidth * scale;
    $canvas.height = img.naturalHeight * scale;
    $canvas.getContext("2d").drawImage(img, 0, 0, img.naturalWidth * scale, img.naturalHeight * scale);

    const blob = await new Promise(resolve => $canvas.toBlob(resolve, `image/${format}`, quality));
    return blob;
};

function injectSvgStyle(svgText, style) {
    return svgText.replace(/(<svg[^>]*>)/, `$1${style}`);
}

hortis.bipartite.download = async function (svgNode) {
    const dataHeader = "data:image/svg+xml;charset=utf-8";
    const serializeAsXML = $e => (new XMLSerializer()).serializeToString($e);
    const encodeAsUTF8 = s => {
        return `${dataHeader},${encodeURIComponent(injectSvgStyle(s, hortis.bipartite.css))}`;
    };
    const svgURL = encodeAsUTF8(serializeAsXML(svgNode));

    const blob = await hortis.getCanvasBlob(svgURL, {format: "png", scale: 4});
    hortis.triggerDownload(blob, "image/png", "bipartite.png");
};

hortis.bipartite.render = function (that, svgNode, containerWidth, bipartiteRows, beeIdToEntry, plantIdToEntry) {
    const svg = d3.select(svgNode);
    fluid.log("Bipartite render with containerWidth of ", containerWidth);

    // Read this directly so we don't get an extra notification - bipartiteRows is computed by an effect upstream in drawInteractions
    const beeSelection = that.beeSelection.peek();
    const plantSelection = that.plantSelection.peek();
    const containerHeight = that.container[0].clientHeight;
    const {rows: beeRows, colours: beeColours} = hortis.computeRankColours(beeSelection, hortis.pollColours, beeIdToEntry);
    const {rows: plantRows} = hortis.computeRankColours(plantSelection, hortis.plantColours, plantIdToEntry);
    const {
        renderedWidth,
        renderedHeight
    } = imerss.bipartitePP(bipartiteRows, svg, containerWidth, containerHeight, {
        FigureLabel: "",
        sortedBeeNames: beeRows.map(row => row.iNaturalistTaxonName),
        sortedPlantNames: plantRows.map(row => row.iNaturalistTaxonName),
        beeColors: beeColours
    });

    // Explain each bar and its count - these titles are not drawn into the downloaded image
    svg.selectAll(".mainBars").append("title").text(d => {
        const partner = d.part === "primary" ? "plants" : "bees";
        return `${d.key}: ${d.value} observation${d.value === 1 ? "" : "s"} on the ${partner} shown`;
    });
    svg.selectAll(".bipartite-label").each(function () {
        const noun = this.textContent === "Bees" ? "Bee" : "Plant";
        d3.select(this).append("title").text(`${noun} taxa, each bar's height proportional to its number of observations`);
    });

    svgNode.setAttribute("height", renderedHeight);
    svgNode.setAttribute("width", renderedWidth);
};

hortis.interactionMarkup =
`
    <div class="imerss-interactions-holder">
        <div class="imerss-int-top imerss-int-row">
            <div class="imerss-int-left imerss-int-plant-label">Plants</div>
            <div class="imerss-poll-counts imerss-int-h-middle"></div>
            <div class="imerss-int-right"></div>
        </div>
        <div class="imerss-int-v-middle imerss-int-row">
            <div class="imerss-plant-names imerss-int-left"></div>
            <div class="imerss-int-h-middle imerss-int-scroll">
                <canvas class="imerss-interactions-canvas"></canvas>
            </div>
            <div class="imerss-plant-counts imerss-int-right"></div>
        </div>
        <div class="imerss-int-bottom imerss-int-row">
            <div class="imerss-int-left imerss-int-poll-label">Bees</div>
            <div class="imerss-poll-names imerss-int-h-middle imerss-int-sideways"></div>
            <div class="imerss-int-right"></div>
        </div>
    </div>`;

fluid.defaults("hortis.drawInteractions", {
    gradeNames: "fluid.stringTemplateRenderingView",
    tooltipKey: "hoverCellKey",
    selectors: {
        plantNames: ".imerss-plant-names",
        plantCounts: ".imerss-plant-counts",
        pollNames: ".imerss-poll-names",
        pollCounts: ".imerss-poll-counts",
        interactions: ".imerss-interactions-canvas",
        scroll: ".imerss-int-scroll",
        hoverable: ".imerss-int-label"
    },
    markup: {
        container: hortis.interactionMarkup
    },
    squareSize: 16,
    squareMargin: 2,
    fillStops: hortis.libreMap.natureStops,
    fillOpacity: 0.7,
    memoStops: "@expand:fluid.colour.memoStops({that}.options.fillStops, 32)",
    outlineColour: "black",
    listeners: {
        "onCreate.bindEvents": "hortis.drawInteractions.bindEvents",
        // TODO: We now have one layoutHolder for each checklist, need to complexify this
        "onCreate.bindTaxonHover": "hortis.bindTaxonHover({that}, {layoutHolder})"
    },
    invokers: {
        renderTooltip: "hortis.renderInteractionTooltip({that}, {arguments}.0)",
        download: {
            args: ["{that}.bipartiteRows.value"],
            func: bipartiteRows => hortis.downloadCSV(["bee", "plant", "observations"], bipartiteRows, "interactions.csv")
        }
    },
    members: {
        hoverCellKey: "@expand:signal()",
        // plantSelection, pollSelection: injected
        subscribeRender: `@expand:fluid.effect(hortis.drawInteractions.render, {that}, {interactions},
            {interactions}.crossTable, {taxa}.rowById)`,
        subscribeHover: "@expand:hortis.subscribeHover({that})",
        bipartiteRows: "@expand:signal()"
    },
    components: {
        pollTooltips: {
            container: "{that}.dom.pollCounts",
            type: "hortis.histoTooltips",
            options: {
                counts: "pollCounts"
            }
        },
        plantTooltips: {
            container: "{that}.dom.plantCounts",
            type: "hortis.histoTooltips",
            options: {
                counts: "plantCounts"
            }
        }
    }
});

fluid.defaults("hortis.histoTooltips", {
    gradeNames: "fluid.viewComponent",
    tooltipKey: "hoverId",
    // counts - an index into nteractions
    selectors: {
        hoverable: ".imerss-int-count"
    },
    members: {
        hoverId: "@expand:signal()",
        subscribeHover: "@expand:hortis.subscribeHover({that})"
    },
    invokers: {
        renderTooltip: "hortis.renderHistoTooltip({that}, {arguments}.0, {interactions})"
    },
    listeners: {
        "onCreate.bindHistoHover": "hortis.bindHistoHover"
    }
});

hortis.bindHistoHover = function (that) {
    const hoverable = that.options.selectors.hoverable;
    that.container.on("mouseenter", hoverable, function (e) {
        const id = this.dataset.rowId;
        that.hoverEvent = e;
        that.hoverId.value = id;
    });
    that.container.on("mouseleave", hoverable, function () {
        that.hoverId.value = null;
    });
};

hortis.renderHistoTooltip = function (that, id, interactions) {
    const counts = interactions[that.options.counts];
    const count = counts.counts[id];
    const row = interactions.rowById.value[id];
    const name = row.iNaturalistTaxonName;
    return `<div class="imerss-int-tooltip"><div><i>${name}</i>:</div><div>Observation count: ${count}</div></div>`;
};


hortis.drawInteractions.render = function (that, interactions, crossTable, rowById) {
    const {plantCounts, pollCounts} = interactions;

    const now = Date.now();

    const filterZero = function (taxonIds, counts) {
        // eslint-disable-next-line eqeqeq
        fluid.remove_if(taxonIds, id => counts[id] === undefined || id == 0);
        taxonIds.sort((ea, eb) => counts[eb] - counts[ea]);
    };

    const filterCutoff = function (taxonIds, counts, sizeLimit, countLimit) {
        if (taxonIds.length >= sizeLimit) {
            const cutIndex = taxonIds.findIndex(id => counts[id] < countLimit);
            if (cutIndex !== -1 && cutIndex >= sizeLimit) {
                taxonIds.length = cutIndex;
            }
        }
    };

    const selectedPlantIds = Object.keys(plantCounts.counts);
    const selectedPollIds = Object.keys(pollCounts.counts);

    filterZero(selectedPlantIds, plantCounts.counts);
    filterZero(selectedPollIds, pollCounts.counts);

    filterCutoff(selectedPlantIds, plantCounts.counts, 100, 5);
    filterCutoff(selectedPollIds, pollCounts.counts, 100, 5);

    // Read by bindEvents, tooltips, etc.
    Object.assign(that, {crossTable, selectedPlantIds, selectedPollIds, rowById});

    const taxonIndices = {},
        idIt = (id, index) => taxonIndices[id] = index;
    selectedPlantIds.forEach(idIt);
    selectedPollIds.forEach(idIt);

    const cellTable = [],
        cellMax = hortis.maxReducer(),
        cellMin = hortis.minReducer();

    const bipartiteRows = [];

    Object.entries(crossTable).forEach(([key, count]) => {
        const {plantId, pollId} = hortis.keyToIntIds(key);
        const plantIndex = taxonIndices[plantId];
        const pollIndex = taxonIndices[pollId];

        const scaled = count / Math.sqrt((plantCounts.counts[plantId] * pollCounts.counts[pollId]));
        cellMax.reduce(scaled);
        cellMin.reduce(scaled);
        cellTable.push({scaled, plantIndex, pollIndex});

        const plantRow = rowById[plantId];
        const pollRow = rowById[pollId];
        if (plantRow && pollRow) {
            bipartiteRows.push([pollRow.iNaturalistTaxonName, plantRow.iNaturalistTaxonName, count]);
        }
    });

    const delay = Date.now() - now;
    fluid.log("Computed celltable in " + delay + " ms");
    that.bipartiteRows.value = bipartiteRows;

    // From here on we read selectedPollIds, selectedPlantIds, cellTable - should be separate function

    const now2 = Date.now();

    const {squareSize, squareMargin} = that.options;
    const canvas = that.locate("interactions")[0];
    const ctx = canvas.getContext("2d");
    const side = squareSize - 2 * squareMargin;

    ctx.lineWidth = 10;

    const width = selectedPollIds.length * squareSize + 2 * squareMargin;
    const height = selectedPlantIds.length * squareSize + 2 * squareMargin;
    canvas.width = width;
    canvas.height = height;
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, width, height);

    const xPos = index => index * squareSize + squareMargin;
    const yPos = index => index * squareSize + squareMargin;

    cellTable.forEach(function (cell) {
        const {scaled, plantIndex, pollIndex} = cell;
        const prop = (scaled - cellMin.value) / (cellMax.value - cellMin.value);

        const colour = fluid.colour.lookupStop(that.options.memoStops, prop);
        const xywh = [xPos(pollIndex), yPos(plantIndex), side, side];

        ctx.fillStyle = colour;
        ctx.fillRect.apply(ctx, xywh);

        ctx.strokeStyle = that.options.outlineColour;
        ctx.strokeRect.apply(ctx, xywh);
    });

    fluid.log("Celltable draw at  " + (Date.now() - now2) + " ms");

    const yoffset = 0; // offset currently disused
    const xoffset = -0.75;
    const countDimen = 48; // Need to hack bars slightly smaller to avoid clipping
    const countScale = 100 * (1 - 2 / countDimen);

    const plantNames = that.locate("plantNames")[0];
    plantNames.style.height = height;
    const plantMark = selectedPlantIds.map(function (plantId, plantIndex) {
        const row = rowById[plantId];
        const top = yPos(plantIndex);
        return `<div class="imerss-int-label" data-row-id="${plantId}" style="top: ${top + yoffset}px">${row.iNaturalistTaxonName}</div>`;
    });
    plantNames.innerHTML = plantMark.join("\n");

    const plantCountNode = that.locate("plantCounts")[0];
    plantCountNode.style.height = height;
    const plantCountMark = selectedPlantIds.map(function (plantId, plantIndex) {
        const count = plantCounts.counts[plantId];
        const prop = fluid.roundToDecimal(countScale * count / plantCounts.max, 2);
        const top = yPos(plantIndex);
        // noinspection CssInvalidPropertyValue
        return `<div class="imerss-int-count" data-row-id="${plantId}" style="top: ${top + yoffset}px; width: ${prop}%; height: ${side}px;"></div>`;
    });
    plantCountNode.innerHTML = plantCountMark.join("\n");

    const pollNames = that.locate("pollNames")[0];
    pollNames.style.width = width;
    const pollMark = selectedPollIds.map(function (pollId, pollIndex) {
        const row = rowById[pollId];
        const left = xPos(pollIndex);
        return `<div class="imerss-int-label" data-row-id="${pollId}" style="left: ${left + xoffset}px">${row.iNaturalistTaxonName}</div>`;
    });
    pollNames.innerHTML = pollMark.join("\n");

    const pollCountNode = that.locate("pollCounts")[0];
    pollCountNode.style.width = `${width}px`;
    const pollCountMark = selectedPollIds.map(function (pollId, pollIndex) {
        const count = pollCounts.counts[pollId];
        const prop = fluid.roundToDecimal(countScale * count / pollCounts.max, 2);
        const left = xPos(pollIndex);
        // noinspection CssInvalidPropertyValue
        return `<div class="imerss-int-count" data-row-id="${pollId}" style="left: ${left + xoffset}px; height: ${prop}%; width: ${side}px;"></div>`;
    });
    pollCountNode.innerHTML = pollCountMark.join("\n");

    const delay2 = Date.now() - now2;
    fluid.log("Rendered in " + delay2 + " ms");
};

// TODO unused
hortis.interactionTooltipTemplate = `<div class="imerss-tooltip">
    <div class="imerss-photo" style="background-image: url(%imgUrl)"></div>
    <div class="text"><b>%taxonRank:</b> %taxonNames</div>
</div>`;

hortis.renderInteractionTooltip = function (that, cellKey) {
    const {plantId, pollId} = hortis.keyToIntIds(cellKey);
    const plantRow = that.rowById[plantId];
    const plantName = plantRow.iNaturalistTaxonName;
    const pollRow = that.rowById[pollId];
    const pollName = pollRow.iNaturalistTaxonName;
    const count = that.crossTable[cellKey];
    return `<div class="imerss-int-tooltip"><div><i>${pollName}</i> on </div><div><i>${plantName}</i>:</div><div>Count: ${count}</div></div>`;
};

hortis.drawInteractions.bindEvents = function (that) {
    const plantNames = that.locate("plantNames")[0];
    const plantCounts = that.locate("plantCounts")[0];
    const pollNames = that.locate("pollNames")[0];
    const pollCounts = that.locate("pollCounts")[0];

    const scroll = that.locate("scroll")[0];
    scroll.addEventListener("scroll", function () {
        const scrollTop = scroll.scrollTop;
        plantNames.scrollTop = scrollTop;
        plantCounts.scrollTop = scrollTop;
        const scrollLeft = scroll.scrollLeft;
        pollNames.scrollLeft = scrollLeft;
        pollCounts.scrollLeft = scrollLeft;
    });

    plantNames.addEventListener("scroll", function () {
        scroll.scrollTop = plantNames.scrollTop;
    });

    const canvas = that.locate("interactions")[0];

    const {squareSize, squareMargin} = that.options;
    const buff = squareMargin / squareSize;

    canvas.addEventListener("mousemove", function (e) {
        const xc = e.offsetX / squareSize,
            yc = e.offsetY / squareSize;
        const xb = xc % 1, yb = yc % 1;
        if (xb >= buff && xb <= 1 - buff && yb >= buff && yb <= 1 - buff) {
            const pollId = that.selectedPollIds?.[Math.floor(xc)],
                plantId = that.selectedPlantIds?.[Math.floor(yc)];
            const key = hortis.intIdsToKey(plantId, pollId);
            const crossCount = that.crossTable[key];
            that.hoverEvent = e;
            that.hoverCellKey.value = crossCount ? key : null;
        } else {
            that.hoverCellKey.value = null;
        }
    });

    canvas.addEventListener("mouseleave", () => that.hoverCellKey.value = null);
};

hortis.bbeaGridBucket = () => ({obsCount: 0, byTaxonId: {}, plantByTaxonId: {}});

hortis.indexBbeaObs = function (bucket, row, index) {
    fluid.pushArray(bucket.byTaxonId, row.pollinatorINatId, index);
    fluid.pushArray(bucket.plantByTaxonId, row.plantINatId, index);
};

fluid.defaults("hortis.bbeaObsQuantiser", {
    members: {
        // Not invokers for performance
        newBucket: hortis.bbeaGridBucket,
        indexObs: hortis.indexBbeaObs
    }
});

hortis.bbeaGridTooltipTemplate =
`<div class="imerss-tooltip imerss-bbea-grid-tooltip">
    <div><b>Observations:</b> %obsCount</div>
    <div class="text"><b>Bees:</b> %beeCount<div>%beeTaxa</div></div>
    %footer
</div>`;

fluid.defaults("hortis.bbeaLibreMap", {
    gradeNames: ["hortis.libreObsMap", "hortis.libreMap.withTiles", "hortis.libreMap.streetmapTiles", "hortis.libreMap.usEcoL3Tiles", "hortis.libreMap.withPolygonDraw"],
    gridResolution: 6000,
    components: {
        gridTooltip: {
            options: {
                invokers: {
                    renderTooltip: "hortis.renderBbeaGridTooltip({that}, {obsQuantiser}.grid.value, {taxa}.rowById.value, {arguments}.0)"
                }
            }
        },
        obsQuantiser: {
            type: "hortis.obsQuantiser",
            options: {
                gradeNames: "hortis.bbeaObsQuantiser",
                members: {
                    baseLatitude: "@expand:signal(44)"
                }
            }
        }
    }
});


hortis.renderBbeaGridTooltip = function (that, grid, rowById, cellId) {
    const bucket = grid.buckets[cellId];

    const rowTemplate = "<div>%beeName: %obsCount observation%s</div>";

    const rows = Object.entries(bucket.byTaxonId).map(([taxonId, obsIds]) => ({
        beeName: rowById[taxonId].iNaturalistTaxonName,
        obsCount: obsIds.length,
        s: obsIds.length === 1 ? "" : "s"
    }));
    const sorted = rows.sort((rowa, rowb) => rowb.obsCount - rowa.obsCount);
    let footer = "";
    if (sorted.length > 10) {
        footer = `<div class="text">...</div>`;
        sorted.length = 10;
    }

    const terms = {
        obsCount: bucket.obsCount,
        beeCount: rows.length,
        beeTaxa: sorted.map(row => fluid.stringTemplate(rowTemplate, row)).join("\n"),
        footer
    };
    return fluid.stringTemplate(hortis.bbeaGridTooltipTemplate, terms);
};

fluid.defaults("hortis.sexFilter", {
    gradeNames: ["hortis.obsFilter", "fluid.stringTemplateRenderingView"],
    markup: {
        container: `
        <div class="imerss-sex-filter mf-inline">
            <span class="mf-inline-label">Sex</span>
            <label class="mf-inline-check"><span class="imerss-female-check"></span>Female</label>
            <label class="mf-inline-check"><span class="imerss-male-check"></span>Male</label>
        </div>
        `
    },
    members: {
        male: "@expand:signal(false)",
        female: "@expand:signal(false)",
        filterState: "@expand:fluid.computed(hortis.sexFilter.toState, {that}.male, {that}.female)",
        filterSummary: "@expand:fluid.computed(hortis.sexFilter.summarise, {that}.filterState)"
    },
    invokers: {
        doFilter: "hortis.sexFilter.doFilter",
        reset: "hortis.sexFilter.reset({that})"
    },
    selectors: {
        male: ".imerss-male-check",
        female: ".imerss-female-check"
    },
    components: {
        maleCheckbox: {
            type: "hortis.checkbox",
            container: "{that}.dom.male",
            options: {
                members: {
                    value: "{sexFilter}.male"
                }
            }
        },
        femaleCheckbox: {
            type: "hortis.checkbox",
            container: "{that}.dom.female",
            options: {
                members: {
                    value: "{sexFilter}.female"
                }
            }
        }
    }
});

// Roll on applier-style signalisation
hortis.sexFilter.reset = function (that) {
    that.male.value = false;
    that.female.value = false;
};

hortis.sexFilter.toState = function (male, female) {
    return {male, female};
};

/**
 * Summarise the sex filter by the number of sexes selected.
 * @param {Object} filterState - The filter state, with Boolean members `male` and `female`
 * @return {FilterSummary} The summary of the filter
 */
hortis.sexFilter.summarise = function (filterState) {
    return hortis.countSummary((filterState.male ? 1 : 0) + (filterState.female ? 1 : 0), ["sex", "sexes"]);
};

hortis.sexFilter.doFilter = function (obsRows, filterState) {
    const now = Date.now();
    const all = !(filterState.female || filterState.male);

    const togo = all ? obsRows :
        obsRows.filter(row => row.sex === "F" && filterState.female || row.sex === "M" && filterState.male);
    const delay = Date.now() - now;
    fluid.log("Filtered " + obsRows.length + " obs to " + togo.length + " in " + delay + " ms");
    return togo;
};



fluid.defaults("hortis.phenologyFilter", {
    gradeNames: ["hortis.filter", "hortis.obsDrivenFilter", "fluid.stringTemplateRenderingView"],
    ranges: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
    markup: {
        container: `
        <div class="imerss-phenology-filter">
            <div class="imerss-filter-title">Phenology:</div>
            <div class="imerss-filter-body imerss-region-filter-rows">%rows</div>
        </div>
        `,
        row: `
        <div class="imerss-filter-row">
            <div class="imerss-row-checkbox">%checkbox</div>
            <div class="imerss-phenology-label">%rowLabel</div>
        </div>
        `
    },
    // fieldName
    // filterName
    members: {
        // Dummy value to cache months on rows
        rangeCache: "@expand:fluid.computed(hortis.phenologyFilter.rangeCache, {that}.obsRows)",
        filterState: "@expand:signal([])",
        filterSummary: "@expand:fluid.computed(hortis.phenologyFilter.summarise, {that}.filterState)",
        renderModel: `@expand:fluid.computed(hortis.phenologyFilter.renderModel, {that}.options.ranges, {that}.options.markup)`
    },
    invokers: {
        doFilter: "hortis.phenologyFilter.doFilter({arguments}.0, {arguments}.1, {that}.rangeCache.value)",
        reset: "hortis.phenologyFilter.reset({that})"
    },
    listeners: {
        "onCreate.bindClick": "hortis.phenologyFilter.bindClick"
    }
});

hortis.phenologyFilter.reset = function (that) {
    that.filterState.value = [];
    hortis.resetChecks(that.container[0]);
};

hortis.phenologyFilter.renderRow = function (template, rowLabel, rowId) {
    return fluid.stringTemplate(template, {
        rowLabel,
        checkbox: hortis.rowCheckbox(rowId)
    });
};

hortis.phenologyFilter.renderModel = function (ranges, markup) {
    return {
        rows: ranges.map((range, i) => hortis.phenologyFilter.renderRow(markup.row, range, i)).join("\n")
    };
};


// Compute cache of millisecond range bounds for each year in range found in data (necessary because leap years may disturb)
// side-effect: initialises row with "timestamp" in milliseconds
hortis.phenologyFilter.rangeCache = function (obsRows) {
    obsRows.forEach(row => {
        const date = new Date(row.eventDate);
        const month = date.getMonth();
        // OCTOPOKHO: Side effect initialising month
        row.month = month;
    });
    return true;
};

/**
 * Summarise the phenology filter by the number of months selected.
 * @param {Boolean[]} filterState - The filter state, holding `true` at the index of each selected month
 * @return {FilterSummary} The summary of the filter
 */
hortis.phenologyFilter.summarise = function (filterState) {
    return hortis.countSummary(filterState.filter(checked => checked).length, ["month", "months"]);
};

hortis.phenologyFilter.doFilter = function (obsRows, filterState) {
    const none = filterState.every(oneFilter => !oneFilter);
    const passFilter = (row, monthIndex) => row.month === monthIndex;

    return none ? obsRows : obsRows.filter(row => filterState.some((checked, rangeIndex) => checked ? passFilter(row, rangeIndex) : false));
};

// cf. hortis.checklist.bindCheckboxClick
hortis.phenologyFilter.bindClick = function (that) {
    that.container.on("click", ".pretty input", function () {
        const id = this.dataset.rowId;
        fluid.log("Filter clicked with row " + id);
        const filterState = [...that.filterState.value];
        filterState[id] = this.checked;
        that.filterState.value = filterState;
    });
};

fluid.defaults("hortis.elevationFilter", {
    gradeNames: ["hortis.filter", "hortis.obsDrivenFilter", "fluid.stringTemplateRenderingView"],
    markup: {
        container: `
        <div class="imerss-elevation-filter">
            <div class="imerss-filter-title">Elevation:</div>
            <div class="imerss-filter-body"></div>
        </div>
        `
    },
    selectors: {
        filterBody: ".imerss-filter-body"
    },
    // fieldName
    // filterName
    members: {
        rangeCache: "@expand:fluid.computed(hortis.elevationFilter.rangeCache, {that}.obsRows, {that}.options.fieldName)",
        filterState: {
            // So perverse! Hopefully in new framework this is simply filterState: {lower: {dualRangeInput}.min, upper: {dualRangeInput}.max}
            expander: { // So perverse!!
                func: (minSignal, maxSignal) => fluid.computed( (min, max) => ({lower: min, upper: max}), minSignal, maxSignal),
                args: ["{dualRangeInput}.min", "{dualRangeInput}.max"]
            }
        },
        filterSummary: "@expand:fluid.computed(hortis.elevationFilter.summarise, {that}.filterState, {that}.rangeCache)"
    },
    components: {
        dualRangeInput: {
            type: "hortis.dualRangeInput",
            container: "{that}.dom.filterBody",
            options: {
                members: {
                    minRange: "@expand:fluid.derefSignal({elevationFilter}.rangeCache, lower)",
                    maxRange: "@expand:fluid.derefSignal({elevationFilter}.rangeCache, upper)"
                },
                markup: {
                    valuesTemplate: `
            <span>%minRange m</span>
            <span>%min - %max m</span>
            <span>%maxRange m</span>`
                }
            }
        }
    },
    invokers: {
        doFilter: "hortis.elevationFilter.doFilter({arguments}.0, {arguments}.1, {that}.options.fieldName, {that}.rangeCache.value)",
        reset: {
            func: "{dualRangeInput}.reset"
        }
    }

});

hortis.elevationFilter.rangeCache = function (obsRows, fieldName) {
    const range = {lower: Number.POSITIVE_INFINITY, upper: Number.NEGATIVE_INFINITY};
    obsRows.forEach(row => {
        const elevation = +row[fieldName];
        // OCTOPOKHO: Side effect converting type
        row[fieldName] = elevation;

        range.lower = Math.min(elevation, range.lower);
        range.upper = Math.max(elevation, range.upper);
    });
    return range;
};

/**
 * Summarise the elevation filter, which is active when its range has been narrowed from the full range of the data.
 * @param {Object} filterState - The selected range, with members `lower` and `upper`
 * @param {Object} rangeCache - The full range of elevations in the data, with members `lower` and `upper`
 * @return {FilterSummary} The summary of the filter
 */
hortis.elevationFilter.summarise = function (filterState, rangeCache) {
    const narrowed = filterState.lower !== rangeCache.lower || filterState.upper !== rangeCache.upper;
    return {
        count: narrowed ? 1 : 0,
        dot: true,
        title: "An elevation range is set"
    };
};

hortis.elevationFilter.doFilter = function (obsRows, filterState, fieldName, rangeCache) {
    const none = filterState.lower === rangeCache.lower && filterState.upper === rangeCache.upper;

    return none ? obsRows : obsRows.filter(row => {
        const elevation = row[fieldName];
        return elevation >= filterState.lower && elevation <= filterState.upper;
    });
};

fluid.defaults("hortis.bbeaFilters", {
    // Not a rendering view - each filter renders into its own slot in the filter concertina supplied in the page markup
    gradeNames: ["hortis.obsFilters", "fluid.viewComponent"],
    members: {
        obsRows: "{vizLoader}.obsRows"
    },
    selectors: {
        collectorFilter: ".imerss-collector-filter",
        regionFilter: ".imerss-region-filter",
        phenologyFilter: ".imerss-phenology-filter",
        elevationFilter: ".imerss-elevation-filter"
    },
    components: {
        filterRoot: "{vizLoader}",
        collectorFilter: {
            type: "hortis.collectorFilter",
            container: "{that}.dom.collectorFilter",
            options: {
                filterName: "Collector",
                fieldName: "recordedBy",
                components: {
                    autocomplete: {
                        options: {
                            widgetOptions: {
                                placeholder: "Volunteer name"
                            }
                        }
                    }
                }
            }
        },
        regionFilter: {
            type: "hortis.groupedRegionFilter",
            container: "{that}.dom.regionFilter",
            options: {
                filterName: "Filter by region",
                leadingFields: ["US Ecoregions Level III"],
                members: {
                    indirectionRows: "{regionIndirection}.rows"
                }
            }
        },
        phenologyFilter: {
            type: "hortis.phenologyFilter",
            container: "{that}.dom.phenologyFilter"
        },
        elevationFilter: {
            type: "hortis.elevationFilter",
            container: "{that}.dom.elevationFilter",
            options: {
                fieldName: "verbatimElevation"
            }
        }
    }
});

// A fake 1-element "filters" block currently just to relocate the sex filter to above the bee checklist as
// requested by Michael O'Laughlin

hortis.bbeaBbeaFiltersTemplate = `
    <div>
        <div class="imerss-sex-filter imerss-filter"></div>
    </div>
`;

fluid.defaults("hortis.bbeaBbeaFilters", {
    gradeNames: ["fluid.stringTemplateRenderingView"],
    markup: { // Clearly unsatisfactory, have to move over to preactish rendering before long
        container: hortis.bbeaBbeaFiltersTemplate,
        fallbackContainer: hortis.bbeaBbeaFiltersTemplate
    },
    selectors: {
        sexFilter: ".imerss-sex-filter"
    },
    components: {
        sexFilter: {
            type: "hortis.sexFilter",
            container: "{that}.dom.sexFilter"
        }
    }
});

/** Taxonomic helpers for the views pane **/

/**
 * Find the nearest ancestor of a taxon, including the taxon itself, at a particular rank.
 * @param {Object} row - A taxon row, with `parent` assigned by `hortis.taxa.map`
 * @param {String} rank - The rank sought
 * @return {Object|undefined} The ancestor row at that rank, or `undefined` if there is none
 */
hortis.ancestorAtRank = function (row, rank) {
    let move = row;
    while (move && move.rank !== rank) {
        move = move.parent;
    }
    return move;
};

/**
 * Find the species to which a taxon belongs, so that infraspecific taxa are counted with their species. A taxon
 * identified only above species level stands for itself.
 * @param {Object} row - A taxon row
 * @return {Object} The row for the taxon's species, or the row itself if it has no species
 */
hortis.speciesRowOf = function (row) {
    return hortis.ancestorAtRank(row, "species") || row;
};

/**
 * Find the name of the family to which a taxon belongs.
 * @param {Object} row - A taxon row
 * @return {String} The family's name, or "Unplaced" if the taxon has no family
 */
hortis.familyNameOf = function (row) {
    return hortis.ancestorAtRank(row, "family")?.iNaturalistTaxonName || "Unplaced";
};

/**
 * Label a taxon by its scientific name, noting its rank if it was not identified to species.
 * @param {Object} row - A taxon row
 * @return {String} The label, e.g. "Bombus mixtus" or "Nomada (genus)"
 */
hortis.taxonLabel = function (row) {
    const name = hortis.rowToScientific(row);
    return row.rank && row.rank !== "species" ? `${name} (${row.rank})` : name;
};

/**
 * Render a taxon's scientific name as markup, followed by its rank in Roman type if it was not identified to species.
 * @param {Object} row - A taxon row
 * @return {String} The markup
 */
hortis.taxonNameMarkup = function (row) {
    const name = `<em>${hortis.renderSpeciesName(hortis.encodeHTML(hortis.rowToScientific(row)))}</em>`;
    return row.rank && row.rank !== "species" ? `${name} <span class="mf-rank">${row.rank}</span>` : name;
};

/** Taxon list views - one per bee and plant **/

fluid.defaults("hortis.taxonListView", {
    gradeNames: ["fluid.viewComponent", "hortis.withTaxonHover"],
    // tabId: String - the views pane tab holding this list
    // idField: String - the observation field holding the taxon id listed
    // colourByFamily: Boolean - whether family headings carry a colour chip
    // noun: String - "bee" or "plant"
    // downloadFile: String
    selectors: {
        arrange: ".mf-seg-btn",
        count: ".mf-listbar-count",
        body: ".mf-listbody",
        hoverable: ".mf-taxon-name"
    },
    members: {
        obsRows: "{vizLoader}.finalFilteredObs",
        rowById: "{taxa}.rowById",
        active: "@expand:hortis.viewTabs.isSelected({viewTabs}.selectedTab, {that}.options.tabId)",
        arrange: "@expand:signal(family)",
        listRows: "@expand:fluid.computed(hortis.taxonListView.computeRows, {that}.obsRows, {that}.rowById, {that}.options.idField)",
        render: "@expand:fluid.effect(hortis.taxonListView.render, {that}, {that}.active, {that}.arrange)"
    },
    invokers: {
        download: "hortis.taxonListView.download({that})"
    },
    listeners: {
        "onCreate.bindArrange": "hortis.taxonListView.bindArrange"
    }
});

// Ranks at or below species, whose taxa are always listed
hortis.taxonListView.terminalRanks = ["species", "subspecies", "variety", "form", "hybrid"];

/**
 * Determine whether a taxon should have its own row in the display of a taxon list - its observations are counted
 * in the list's totals regardless. Taxa at or below species are always listed.
 * An intermediate taxon such as a genus, subgenus, section or complex is listed only if no other taxon is recorded
 * within it. Since the taxa table attaches species directly to their genus even when a subgenus is recorded, an
 * intermediate taxon below genus is judged by its genus - it is listed only if the genus holds no other taxon.
 * @param {Object} row - A taxon row
 * @return {Boolean} `true` if the taxon should be listed
 */
hortis.taxonListView.isListable = function (row) {
    const scope = hortis.ancestorAtRank(row, "genus") || row;
    const othersWithin = scope === row ? row.children.length > 0 : scope.children.some(child => child !== row);
    return hortis.taxonListView.terminalRanks.includes(row.rank) || !othersWithin;
};

/**
 * Count the observations of each taxon in a set of observations, rolling infraspecific taxa up into their species.
 * Records for intermediate taxa such as a genus or subgenus are marked as not `listed` unless no other taxon is
 * recorded within them - see `hortis.taxonListView.isListable`.
 * @param {Object[]} obsRows - The observations
 * @param {Object<String, Object>} rowById - Map of taxon id to taxon row
 * @param {String} idField - The observation field holding the taxon id to be counted
 * @return {Object[]} One record per taxon with members `id`, `row`, `label`, `family`, `count` and `listed`
 */
hortis.taxonListView.computeRows = function (obsRows, rowById, idField) {
    const byId = new Map();
    obsRows.forEach(obsRow => {
        const row = rowById[obsRow[idField]];
        if (row) {
            const speciesRow = hortis.speciesRowOf(row);
            const existing = byId.get(speciesRow.id);
            if (existing) {
                ++existing.count;
            } else {
                byId.set(speciesRow.id, {row: speciesRow, count: 1});
            }
        }
    });
    return [...byId.values()].map(({row, count}) => ({
        id: row.id,
        row,
        label: hortis.taxonLabel(row),
        family: hortis.familyNameOf(row),
        count,
        listed: hortis.taxonListView.isListable(row)
    }));
};

/**
 * Group list records by family, families being ordered by their total number of observations, and records within
 * each family alphabetically.
 * @param {Object[]} listRows - Records as produced by `hortis.taxonListView.computeRows`
 * @return {Object[]} One record per family with members `family`, `count` and `rows`
 */
hortis.taxonListView.byFamily = function (listRows) {
    const families = new Map();
    listRows.forEach(listRow => {
        const existing = families.get(listRow.family);
        if (existing) {
            existing.count += listRow.count;
            existing.rows.push(listRow);
        } else {
            families.set(listRow.family, {family: listRow.family, count: listRow.count, rows: [listRow]});
        }
    });
    const togo = [...families.values()].sort((a, b) => b.count - a.count || a.family.localeCompare(b.family));
    togo.forEach(family => family.rows.sort((a, b) => a.label.localeCompare(b.label)));
    return togo;
};

hortis.taxonListView.rowMarkup = function (listRow, noun) {
    const count = hortis.formatInt(listRow.count);
    const tip = `${hortis.plural(listRow.count, "observation")} of this ${noun} in the current selection`;
    return `<div class="mf-taxon"><span class="mf-taxon-name" data-row-id="${listRow.id}">${hortis.taxonNameMarkup(listRow.row)}</span>` +
        `<i title="${tip}">${count}</i></div>`;
};

hortis.taxonListView.render = function (that, active, arrange) {
    that.locate("arrange").each((index, button) => {
        button.classList.toggle("mf-seg-on", button.dataset.arrange === arrange);
    });
    if (active) {
        const listRows = that.listRows.value;
        if (listRows) {
            const noun = that.options.noun;
            // Totals count every observation, including those of intermediate taxa which have no row of their own
            const total = listRows.reduce((sum, listRow) => sum + listRow.count, 0);
            const listed = rows => rows.filter(listRow => listRow.listed);
            const shownCount = listed(listRows).length;
            that.locate("count").html(
                `<span title="Number of distinct ${noun} taxa listed - species, or coarser where nothing more specific was recorded">${hortis.plural(shownCount, "taxon", "taxa")}</span>` +
                ` &middot; <span title="Number of observation records in the current selection, including those identified only to genus or subgenus">${hortis.plural(total, "observation")}</span>`);
            let markup;
            if (listRows.length === 0) {
                markup = `<p class="mf-empty">No ${noun}s match the current filters and selections.</p>`;
            } else if (arrange === "family") {
                markup = hortis.taxonListView.byFamily(listRows).map(family => {
                    const familyRows = listed(family.rows);
                    const colour = hortis.pollColours.family[family.family];
                    const chip = that.options.colourByFamily ? `<b style="background: ${colour || "#999"}"></b>` : "";
                    const tip = `${hortis.plural(familyRows.length, noun + " taxon", noun + " taxa")} listed, with ${hortis.plural(family.count, "observation")} in ${family.family}`;
                    return `<div class="mf-famhead">${chip}<span>${hortis.encodeHTML(family.family)}</span><i title="${tip}">${hortis.plural(familyRows.length, "taxon", "taxa")}</i></div>` +
                        familyRows.map(listRow => hortis.taxonListView.rowMarkup(listRow, noun)).join("");
                }).join("");
            } else {
                markup = listed(listRows).sort((a, b) => a.label.localeCompare(b.label))
                    .map(listRow => hortis.taxonListView.rowMarkup(listRow, noun)).join("");
            }
            that.locate("body").html(`<div class="mf-taxa">${markup}</div>`);
        }
    }
};

hortis.taxonListView.bindArrange = function (that) {
    that.container.on("click", ".mf-seg-btn", function () {
        that.arrange.value = this.dataset.arrange;
    });
};

hortis.taxonListView.download = function (that) {
    const families = hortis.taxonListView.byFamily(that.listRows.value || []);
    const rows = families.flatMap(family => family.rows.map(listRow => [listRow.label, listRow.family, listRow.count]));
    hortis.downloadCSV(["taxon", "family", "observations"], rows, that.options.downloadFile);
};

/** Bar charts drawn as SVG markup **/

/**
 * Choose a round step and upper bound for a count axis with about four intervals.
 * @param {Number} max - The largest value to be plotted
 * @return {Object} Members `step`, a whole number, and `top`, the smallest multiple of `step` at least `max`
 */
hortis.niceScale = function (max) {
    const bounded = Math.max(max, 1);
    const raw = bounded / 4;
    const magnitude = Math.pow(10, Math.floor(Math.log10(raw)));
    const normal = raw / magnitude;
    const nice = normal <= 1 ? 1 : normal <= 2 ? 2 : normal <= 5 ? 5 : 10;
    const step = Math.max(1, nice * magnitude);
    return {step, top: step * Math.ceil(bounded / step)};
};

/**
 * Truncate a label to a maximum length, marking the truncation with an ellipsis.
 * @param {String} label - The label
 * @param {Number} maxLength - The maximum length of the returned label
 * @return {String} The possibly truncated label
 */
hortis.truncateLabel = function (label, maxLength) {
    return label.length > maxLength ? label.substring(0, maxLength - 1) + "…" : label;
};

/**
 * Render a vertical bar chart of counts, one bar per row, as SVG markup.
 * @param {Object[]} rows - Records each with members `label` and `count`, in display order
 * @param {Object} opts - Chart options:
 *     width, height: Number - dimensions in pixels
 *     foot: Number - height in pixels reserved below the plot for bar labels and the x axis label
 *     angle: Number - rotation of bar labels in degrees
 *     title, titleTip: String - the chart heading and its tooltip
 *     xLabel, xTip, yLabel, yTip: String - the axis labels and their tooltips
 *     colourOf: Function - maps a row to its bar colour
 *     rowTip: Function - maps a row to the tooltip for its bar
 * @return {String} The chart's SVG markup
 */
hortis.barChartMarkup = function (rows, opts) {
    const enc = hortis.encodeHTML;
    const left = 58, right = opts.width - 10, top = 34;
    const base = opts.height - opts.foot;
    const {step, top: scaleTop} = hortis.niceScale(rows.reduce((max, row) => Math.max(max, row.count), 0));
    const band = (right - left) / Math.max(rows.length, 1);
    const barWidth = Math.min(30, band * 0.7);
    const yOf = value => base - value / scaleTop * (base - top);
    const parts = [];
    parts.push(`<text x="${left}" y="18" class="mf-chart-title">${enc(opts.title)}<title>${enc(opts.titleTip)}</title></text>`);
    for (let value = 0; value <= scaleTop; value += step) {
        const y = yOf(value);
        parts.push(`<line x1="${left}" y1="${y}" x2="${right}" y2="${y}" class="mf-chart-grid"/>`);
        parts.push(`<text x="${left - 7}" y="${y + 4}" text-anchor="end" class="mf-chart-tick">${hortis.formatInt(value)}<title>${enc(hortis.formatInt(value) + " " + opts.yLabel.toLowerCase())}</title></text>`);
    }
    rows.forEach((row, i) => {
        const height = base - yOf(row.count);
        const x = left + band * i + (band - barWidth) / 2;
        const tip = enc(opts.rowTip(row));
        parts.push(`<rect x="${x}" y="${base - height}" width="${barWidth}" height="${height}" fill="${opts.colourOf(row)}" class="mf-chart-bar"><title>${tip}</title></rect>`);
        parts.push(`<text x="0" y="0" text-anchor="end" class="mf-chart-label" transform="translate(${x + barWidth / 2 + 3} ${base + 9}) rotate(${opts.angle})">` +
            `${enc(hortis.truncateLabel(row.label, 30))}<title>${tip}</title></text>`);
    });
    parts.push(`<line x1="${left}" y1="${base}" x2="${right}" y2="${base}" class="mf-chart-axis-line"/>`);
    parts.push(`<text x="0" y="0" text-anchor="middle" class="mf-chart-axis" transform="translate(16 ${(top + base) / 2}) rotate(-90)">${enc(opts.yLabel)}<title>${enc(opts.yTip)}</title></text>`);
    parts.push(`<text x="${(left + right) / 2}" y="${opts.height - 6}" text-anchor="middle" class="mf-chart-axis">${enc(opts.xLabel)}<title>${enc(opts.xTip)}</title></text>`);
    return `<svg class="mf-chart" width="${opts.width}" height="${opts.height}" viewBox="0 0 ${opts.width} ${opts.height}" role="img" aria-label="${enc(opts.title)}">${parts.join("")}</svg>`;
};

/** Bee abundance view **/

fluid.defaults("hortis.beeAbundance", {
    gradeNames: "fluid.viewComponent",
    tabId: "abund",
    // Maximum number of bars drawn in each chart
    chartLimits: {
        family: 50,
        genus: 40,
        species: 40
    },
    // Minimum width in pixels allotted to each bar - charts wider than the pane scroll horizontally
    minBand: 16,
    // Maximum width in pixels allotted to each bar
    maxBand: 80,
    selectors: {
        key: ".mf-key",
        charts: ".mf-charts"
    },
    members: {
        obsRows: "{vizLoader}.finalFilteredObs",
        rowById: "{taxa}.rowById",
        active: "@expand:hortis.viewTabs.isSelected({viewTabs}.selectedTab, {that}.options.tabId)",
        width: "@expand:hortis.widthSignal({that}.dom.charts.0)",
        abundance: "@expand:fluid.computed(hortis.beeAbundance.compute, {that}.obsRows, {that}.rowById)",
        render: "@expand:fluid.effect(hortis.beeAbundance.render, {that}, {that}.active, {that}.width)"
    },
    invokers: {
        download: "hortis.beeAbundance.download({that})"
    }
});

/**
 * Count bee observations by family, genus and species.
 * @param {Object[]} obsRows - The observations
 * @param {Object<String, Object>} rowById - Map of taxon id to taxon row
 * @return {Object} Members `family`, `genus` and `species`, each an array of records with members `label`, `family`
 * and `count` sorted by descending count
 */
hortis.beeAbundance.compute = function (obsRows, rowById) {
    const tallies = {family: new Map(), genus: new Map(), species: new Map()};
    const tally = (map, key, label, family) => {
        const existing = map.get(key);
        if (existing) {
            ++existing.count;
        } else {
            map.set(key, {label, family, count: 1});
        }
    };
    obsRows.forEach(obsRow => {
        const row = rowById[obsRow.pollinatorINatId];
        if (row) {
            const family = hortis.familyNameOf(row);
            const genusRow = hortis.ancestorAtRank(row, "genus");
            const speciesRow = hortis.speciesRowOf(row);
            tally(tallies.family, family, family, family);
            if (genusRow) {
                tally(tallies.genus, genusRow.id, genusRow.iNaturalistTaxonName, family);
            }
            tally(tallies.species, speciesRow.id, hortis.taxonLabel(speciesRow), family);
        }
    });
    const sorted = map => [...map.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
    return fluid.transform(tallies, sorted);
};

hortis.beeAbundance.render = function (that, active, width) {
    if (active) {
        const abundance = that.abundance.value;
        if (abundance) {
            const colours = hortis.pollColours.family;
            const colourOf = row => colours[row.family] || "#999";
            that.locate("key").html(abundance.family.map(row =>
                `<span><b style="background: ${colourOf(row)}"></b><span>${hortis.encodeHTML(row.label)}</span></span>`).join(""));
            const limits = that.options.chartLimits;
            const chart = (key, plural, foot, angle) => {
                const all = abundance[key];
                const rows = all.slice(0, limits[key]);
                // Fill the pane, but don't spread a few bars too thinly, nor squeeze many bars below their minimum width
                const chartWidth = Math.max(Math.min(Math.floor(width), 70 + rows.length * that.options.maxBand),
                    70 + rows.length * that.options.minBand);
                const shown = rows.length < all.length ? `top ${rows.length} of ${all.length}` : `${all.length} total`;
                return hortis.barChartMarkup(rows, {
                    width: chartWidth,
                    height: 150 + foot,
                    foot,
                    angle,
                    title: `Bee ${plural} (${shown})`,
                    titleTip: `Number of distinct bee ${plural} in the current selection` +
                        (rows.length < all.length ? `, of which the ${rows.length} most observed are shown` : ""),
                    xLabel: hortis.capitalize(key),
                    xTip: `Bee ${plural}, coloured by family and ordered by number of observations`,
                    yLabel: "Observations",
                    yTip: "Number of observation records in the current selection",
                    colourOf,
                    rowTip: row => `${row.label} (${row.family}): ${hortis.plural(row.count, "observation")}`
                });
            };
            that.locate("charts").html(abundance.family.length === 0 ? "<p class=\"mf-empty\">No bees match the current filters and selections.</p>" :
                chart("family", "families", 110, -40) + chart("genus", "genera", 120, -45) + chart("species", "species", 190, -55));
        }
    }
};

// Presentational properties copied from the page's stylesheet onto each element of an SVG exported as a standalone file
hortis.svgInlinedProperties = ["fill", "stroke", "stroke-width", "font-family", "font-size", "font-weight"];

/**
 * Copy the computed values of the presentational properties of each element of a rendered SVG onto the
 * corresponding element of its clone, so that the clone renders identically without the page's stylesheet.
 * @param {SVGElement} source - The SVG element as rendered in the page
 * @param {SVGElement} clone - A deep clone of `source`, which will be modified
 */
hortis.inlineSVGStyles = function (source, clone) {
    const sources = [source, ...source.querySelectorAll("*")];
    const clones = [clone, ...clone.querySelectorAll("*")];
    sources.forEach((node, i) => {
        const computed = getComputedStyle(node);
        clones[i].setAttribute("style", hortis.svgInlinedProperties.map(prop => `${prop}: ${computed.getPropertyValue(prop)}`).join("; "));
    });
};

/**
 * Download the bee abundance charts as a single standalone SVG file, with the family colour key drawn above them as
 * it is laid out on the page.
 * @param {hortis.beeAbundance} that - The bee abundance component, whose charts are currently rendered
 */
hortis.beeAbundance.download = function (that) {
    const enc = hortis.encodeHTML;
    const key = that.locate("key")[0];
    const charts = that.locate("charts")[0];
    const gap = parseFloat(getComputedStyle(charts).rowGap) || 0;
    const keyBox = key.getBoundingClientRect();
    const keyStyle = getComputedStyle(key);
    const keyParts = [...key.children].map(item => {
        const swatch = item.querySelector("b");
        const swatchBox = swatch.getBoundingClientRect();
        const labelBox = item.querySelector("span").getBoundingClientRect();
        return `<rect x="${swatchBox.left - keyBox.left}" y="${swatchBox.top - keyBox.top}" width="${swatchBox.width}" height="${swatchBox.height}" rx="2" ` +
            `fill="${getComputedStyle(swatch).backgroundColor}"/>` +
            `<text x="${labelBox.left - keyBox.left}" y="${labelBox.top - keyBox.top + labelBox.height / 2}" dominant-baseline="central" ` +
            `fill="${getComputedStyle(item).color}">${enc(item.textContent)}</text>`;
    });
    const serializer = new XMLSerializer();
    let y = keyBox.height + gap;
    let width = keyBox.width;
    const chartParts = [...charts.querySelectorAll("svg.mf-chart")].map(svg => {
        const clone = svg.cloneNode(true);
        hortis.inlineSVGStyles(svg, clone);
        clone.removeAttribute("class");
        clone.setAttribute("x", "0");
        clone.setAttribute("y", String(y));
        y += svg.height.baseVal.value + gap;
        width = Math.max(width, svg.width.baseVal.value);
        return serializer.serializeToString(clone);
    });
    const height = Math.max(y - gap, 0);
    const content = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
        `<rect width="100%" height="100%" fill="#fff"/>` +
        `<g style="font-family: ${enc(keyStyle.fontFamily)}; font-size: ${keyStyle.fontSize}">${keyParts.join("")}</g>` +
        chartParts.join("") + "</svg>";
    hortis.triggerDownload(content, "image/svg+xml", "bee-abundance.svg");
};

/** Seed mix evaluator **/

fluid.defaults("hortis.seedMix", {
    gradeNames: "fluid.viewComponent",
    tabId: "seed",
    // Number of candidate plants listed before the user asks to see them all
    shortListLength: 60,
    selectors: {
        note: ".mf-seednote",
        list: ".mf-seed-list",
        fill: ".mf-meter-fill",
        meter: ".mf-meter",
        read: ".mf-seedread",
        chart: ".mf-seedchart-holder"
    },
    members: {
        allObs: "{vizLoader}.obsRows",
        // Observations passing the filters but not the bee and plant selections - these define the site
        siteObs: "{vizLoader}.filteredObs",
        rowById: "{taxa}.rowById",
        active: "@expand:hortis.viewTabs.isSelected({viewTabs}.selectedTab, {that}.options.tabId)",
        network: "@expand:fluid.computed(hortis.seedMix.computeNetwork, {that}.allObs, {that}.rowById)",
        established: "@expand:fluid.computed(hortis.seedMix.computeEstablished, {that}.siteObs, {that}.allObs, {that}.rowById)",
        // Ids of established plants which the user has unticked
        removed: "@expand:hortis.seedMix.setSignal()",
        // Ids of further plants which the user has ticked
        added: "@expand:hortis.seedMix.setSignal()",
        query: "@expand:signal(null)", // null rather than empty string, which the expander can't express
        showAll: "@expand:signal(false)",
        // Bumped to force the plant list to rerender when the selection is reset
        listVersion: "@expand:signal(0)",
        renderList: "@expand:fluid.effect(hortis.seedMix.renderList, {that}, {that}.active, {that}.query, {that}.showAll, {that}.listVersion)",
        renderOutput: "@expand:fluid.effect(hortis.seedMix.renderOutput, {that}, {that}.active, {that}.removed, {that}.added)"
    },
    invokers: {
        download: "hortis.seedMix.download({that})"
    },
    listeners: {
        "onCreate.bindEvents": "hortis.seedMix.bindEvents"
    }
});

hortis.seedMix.setSignal = () => signal(new Set());

/**
 * Index the whole dataset's plant-pollinator network at the level of species.
 * @param {Object[]} obsRows - All observations in the dataset
 * @param {Object<String, Object>} rowById - Map of taxon id to taxon row
 * @return {Object} Members `plants`, a Map of plant id to `{id, label, bees}` where `bees` is the Set of ids of bee
 * species recorded visiting it, and `beeFamily`, a Map of the id of each bee species recorded on any plant to its family
 */
hortis.seedMix.computeNetwork = function (obsRows, rowById) {
    const plants = new Map();
    const beeFamily = new Map();
    obsRows.forEach(obsRow => {
        const plantRow = rowById[obsRow.plantINatId];
        const beeRow = rowById[obsRow.pollinatorINatId];
        if (plantRow && beeRow) {
            const plant = hortis.speciesRowOf(plantRow);
            const bee = hortis.speciesRowOf(beeRow);
            let entry = plants.get(plant.id);
            if (!entry) {
                entry = {id: plant.id, row: plant, label: hortis.taxonLabel(plant), bees: new Set()};
                plants.set(plant.id, entry);
            }
            entry.bees.add(bee.id);
            if (!beeFamily.has(bee.id)) {
                beeFamily.set(bee.id, hortis.familyNameOf(bee));
            }
        }
    });
    return {plants, beeFamily};
};

/**
 * Determine which plants are already established on the site - those recorded in observations passing the current
 * filters. If no filter is active there is no site, and no plant is established.
 * @param {Object[]} siteObs - Observations passing the current filters
 * @param {Object[]} allObs - All observations in the dataset
 * @param {Object<String, Object>} rowById - Map of taxon id to taxon row
 * @return {Set<String>} The ids of established plant species
 */
hortis.seedMix.computeEstablished = function (siteObs, allObs, rowById) {
    const togo = new Set();
    if (siteObs.length < allObs.length) {
        siteObs.forEach(obsRow => {
            const plantRow = rowById[obsRow.plantINatId];
            if (plantRow && rowById[obsRow.pollinatorINatId]) {
                togo.add(hortis.speciesRowOf(plantRow).id);
            }
        });
    }
    return togo;
};

/**
 * Compute the plants currently making up the seed mix.
 * @param {Set<String>} established - Ids of plants established on the site
 * @param {Set<String>} removed - Ids of established plants the user has unticked
 * @param {Set<String>} added - Ids of further plants the user has ticked
 * @return {Set<String>} Ids of the plants in the mix
 */
hortis.seedMix.mix = function (established, removed, added) {
    const mix = new Set([...established].filter(id => !removed.has(id)));
    added.forEach(id => mix.add(id));
    return mix;
};

hortis.seedMix.plantMarkup = function (plant, checked) {
    const beeCount = plant.bees.size;
    return `<label class="mf-taxon"><input type="checkbox" data-seed="${plant.id}"${checked ? " checked" : ""}>` +
        `<span>${hortis.taxonNameMarkup(plant.row)}</span>` +
        `<i title="Visited by ${hortis.plural(beeCount, "bee species", "bee species")} across the whole dataset">${beeCount}</i></label>`;
};

hortis.seedMix.renderList = function (that, active, query) {
    if (active) {
        const network = that.network.value;
        const established = that.established.value;
        if (network && established) {
            const removed = that.removed.peek();
            const added = that.added.peek();
            that.locate("note").text(established.size > 0 ?
                "Plants recorded under the current filters are treated as already established on the site, and start ticked - " +
                "untick any which will be removed. Tick further plants to model a seed mix." :
                "No site is defined. Use the Region filter, draw a polygon on the map or click a map cell to define one, " +
                "and plants recorded there will be listed as already established. Meanwhile, tick plants to model a seed mix.");
            const words = (query || "").toLowerCase().split(" ").filter(word => word.trim().length > 0);
            const matches = plant => words.every(word => plant.label.toLowerCase().includes(word));
            const byBees = (a, b) => b.bees.size - a.bees.size || a.label.localeCompare(b.label);
            const establishedPlants = [...established].map(id => network.plants.get(id))
                .filter(plant => plant && matches(plant)).sort(byBees);
            const candidates = [...network.plants.values()]
                .filter(plant => !established.has(plant.id) && matches(plant)).sort(byBees);
            const limit = that.showAll.value || words.length > 0 ? candidates.length : that.options.shortListLength;
            const groupHead = (title, tip) => `<p class="mf-seedgroup" title="${tip}">${title}</p>`;
            let markup = "";
            if (establishedPlants.length > 0) {
                markup += groupHead(`Already established on site (${establishedPlants.length})`,
                    `${hortis.plural(establishedPlants.length, "plant species", "plant species")} recorded under the current filters`) +
                    `<div class="mf-taxa mf-taxa-cols">${establishedPlants.map(plant => hortis.seedMix.plantMarkup(plant, !removed.has(plant.id))).join("")}</div>`;
            }
            markup += groupHead(`Available for seed mixes (${candidates.length})`,
                `${hortis.plural(candidates.length, "further plant species", "further plant species")} recorded in the dataset, ordered by the number of bee species visiting them`) +
                `<div class="mf-taxa mf-taxa-cols">${candidates.slice(0, limit).map(plant => hortis.seedMix.plantMarkup(plant, added.has(plant.id))).join("")}</div>`;
            if (limit < candidates.length) {
                markup += `<button type="button" class="mf-linkbtn imerss-seed-more">Show all ${hortis.formatInt(candidates.length)} plants</button>`;
            }
            that.locate("list").html(markup);
        }
    }
};

hortis.seedMix.renderOutput = function (that, active, removed, added) {
    if (active) {
        const network = that.network.value;
        const established = that.established.value;
        if (network && established) {
            const mix = hortis.seedMix.mix(established, removed, added);
            const supported = new Set();
            mix.forEach(id => network.plants.get(id)?.bees.forEach(bee => supported.add(bee)));
            const all = network.beeFamily.size;
            const share = all > 0 ? Math.round(supported.size / all * 100) : 0;
            that.locate("fill").css("width", share + "%");
            that.locate("meter").attr("title", `${share}% of the bee species recorded on plants in this dataset visit a plant in the mix`);
            that.locate("read").html(
                `<b title="Bee species recorded visiting at least one plant in the mix">${hortis.formatInt(supported.size)}</b> of ` +
                `<span title="All bee species recorded visiting plants anywhere in this dataset">${hortis.formatInt(all)}</span> bee species supported` +
                ` &mdash; <span title="Share of the dataset's bee species supported by the mix">${share}%</span>` +
                `<br/><span title="Number of plant species currently ticked">${hortis.plural(mix.size, "plant species", "plant species")} in the mix</span>`);

            const totals = new Map();
            network.beeFamily.forEach(family => totals.set(family, (totals.get(family) || 0) + 1));
            const reached = new Map();
            supported.forEach(bee => {
                const family = network.beeFamily.get(bee);
                reached.set(family, (reached.get(family) || 0) + 1);
            });
            const families = [...totals.keys()].sort((a, b) => totals.get(b) - totals.get(a));
            that.locate("chart").html(hortis.seedMix.familyChart(families, totals, reached));
        }
    }
};

/**
 * Render the chart of the share of each bee family's species supported by the seed mix, as SVG markup.
 * @param {String[]} families - The bee families, in display order
 * @param {Map<String, Number>} totals - Number of species of each family recorded on plants in the dataset
 * @param {Map<String, Number>} reached - Number of species of each family supported by the mix
 * @return {String} The chart's SVG markup
 */
hortis.seedMix.familyChart = function (families, totals, reached) {
    const width = 340, height = 230, left = 44, right = width - 8, top = 22, base = 150;
    const band = (right - left) / Math.max(families.length, 1);
    const barWidth = band * 0.6;
    const parts = [];
    [0, 50, 100].forEach(percent => {
        const y = base - percent / 100 * (base - top);
        parts.push(`<line x1="${left}" y1="${y}" x2="${right}" y2="${y}" class="mf-chart-grid"/>`);
        parts.push(`<text x="${left - 6}" y="${y + 4}" text-anchor="end" class="mf-chart-tick">${percent}%<title>${percent}% of the family's species supported</title></text>`);
    });
    families.forEach((family, i) => {
        const total = totals.get(family);
        const count = reached.get(family) || 0;
        const x = left + band * i + (band - barWidth) / 2;
        const full = base - top;
        const h = count / total * full;
        const tip = `${family}: ${count} of ${hortis.plural(total, "species", "species")} supported by the mix`;
        parts.push(`<rect x="${x}" y="${top}" width="${barWidth}" height="${full}" class="mf-chart-track"><title>${tip}</title></rect>`);
        parts.push(`<rect x="${x}" y="${base - h}" width="${barWidth}" height="${h}" fill="${hortis.pollColours.family[family] || "#999"}"><title>${tip}</title></rect>`);
        parts.push(`<text x="${x + barWidth / 2}" y="${top - 5}" text-anchor="middle" class="mf-chart-tick">${count}/${total}<title>${tip}</title></text>`);
        parts.push(`<text x="0" y="0" text-anchor="end" class="mf-chart-label" transform="translate(${x + barWidth / 2 + 3} ${base + 9}) rotate(-40)">${hortis.encodeHTML(family)}<title>${tip}</title></text>`);
    });
    parts.push(`<line x1="${left}" y1="${base}" x2="${right}" y2="${base}" class="mf-chart-axis-line"/>`);
    parts.push(`<text x="0" y="0" text-anchor="middle" class="mf-chart-axis" transform="translate(12 ${(top + base) / 2}) rotate(-90)">Species supported<title>Share of each family's species recorded visiting a plant in the mix</title></text>`);
    parts.push(`<text x="${(left + right) / 2}" y="${height - 4}" text-anchor="middle" class="mf-chart-axis">Bee family<title>Bee families recorded on plants in this dataset</title></text>`);
    return `<svg class="mf-seedchart" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Share of each bee family supported">${parts.join("")}</svg>`;
};

/**
 * Toggle membership of an id in a signal holding a Set, replacing the Set so that the signal notifies.
 * @param {Signal<Set>} setSignal - The signal to be updated
 * @param {String} id - The id to be added or removed
 * @param {Boolean} present - `true` to add the id, `false` to remove it
 */
hortis.seedMix.updateSet = function (setSignal, id, present) {
    const updated = new Set(setSignal.value);
    if (present) {
        updated.add(id);
    } else {
        updated.delete(id);
    }
    setSignal.value = updated;
};

hortis.seedMix.bindEvents = function (that) {
    that.container.on("change", "input[data-seed]", function () {
        const id = this.dataset.seed;
        if (that.established.value.has(id)) {
            hortis.seedMix.updateSet(that.removed, id, !this.checked);
        } else {
            hortis.seedMix.updateSet(that.added, id, this.checked);
        }
    });
    that.container.on("input", ".mf-seed-search", function () {
        that.query.value = this.value;
    });
    that.container.on("click", ".imerss-seed-more", () => {
        that.showAll.value = true;
    });
    that.container.on("click", ".imerss-seed-reset", () => {
        batch(() => {
            that.removed.value = new Set();
            that.added.value = new Set();
            that.listVersion.value = that.listVersion.value + 1;
        });
    });
};

hortis.seedMix.download = function (that) {
    const network = that.network.value;
    const established = that.established.value;
    const mix = hortis.seedMix.mix(established, that.removed.value, that.added.value);
    const ids = new Set([...established, ...mix]);
    const rows = [...ids].map(id => network.plants.get(id)).filter(plant => plant).map(plant => [
        plant.label,
        established.has(plant.id) ? "established" : "added",
        mix.has(plant.id) ? "yes" : "no",
        plant.bees.size
    ]);
    hortis.downloadCSV(["plant", "status", "inMix", "beeSpeciesVisiting"], rows, "seed-mix.csv");
};
