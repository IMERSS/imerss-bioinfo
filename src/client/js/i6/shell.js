/*
Copyright 2025-2026 Antranig Basman
Licensed under the Educational Community License (ECL), Version 2.0 or the New
BSD license. You may not use this file except in compliance with one these
Licenses.
You may obtain a copy of the ECL 2.0 License and BSD License at
https://github.com/fluid-project/infusion/raw/master/Infusion-LICENSE.txt
*/

"use strict";

// The shell of the BBEA page, ported to Infusion 6 from src/client/js/new/imerss-bbea.js - the grips resizing and
// collapsing its panes, the concertina of filter sections, the tabs of the views pane and the fullscreen control.
// Their markup is supplied by the page, so each binds its behaviour to it with a $bindable rather than rendering it.

// noinspection ES6ConvertVarToLetConst // otherwise this is a duplicate on minifying
var hortis = fluid.registerNamespace("hortis");

// A component whose behaviour is bound to markup supplied by the page, found by `selector`
fluid.def("hortis.pageMarkupComponent", {
    $layers: "fluid.component",
    // selector: String
    container: "$compute:hortis.locateContainer({self}.selector, {global}.document)"
});

/** Shell grips **/

// Manages the draggable and collapsible bars separating the shell's panes
fluid.def("hortis.mfShell", {
    $layers: "hortis.pageMarkupComponent",
    selector: ".imerss-container",
    // Distance in pixels a pointer must move on a grip's tab before a press counts as a drag
    dragSlop: 3,
    grips: {
        $bindable: {
            bind: "hortis.mfShell.bindGrips({self}.container, {self}.dragSlop)",
            unbind: "hortis.mfShell.unbindGrips({boundValue})"
        }
    }
});

/**
 * Collapse or restore the pane beside a grip.
 * @param {HTMLElement} root - The shell's root element
 * @param {HTMLElement} grip - A `.mf-grip` element carrying `data-flag` and `data-axis`
 */
hortis.mfShell.toggleGrip = function (root, grip) {
    const host = grip.dataset.axis === "y" ? root.querySelector(".mf-middle") : root.querySelector(".mf-shell");
    const closed = host.classList.toggle("mf-" + grip.dataset.flag);
    grip.classList.toggle("mf-closed", closed);
    const tab = grip.querySelector(".mf-grip-tab");
    const what = grip.dataset.axis === "y" ? "views" : "filters";
    tab.setAttribute("aria-label", (closed ? "Expand " : "Collapse ") + what);
    tab.setAttribute("title", (closed ? "Expand " : "Collapse ") + what);
};

/**
 * Resize the panes beside a grip.
 * @param {HTMLElement} root - The shell's root element
 * @param {HTMLElement} grip - The grip being moved
 * @param {Number} position - The new position of the grip in client coordinates on its axis
 */
hortis.mfShell.moveGrip = function (root, grip, position) {
    if (grip.dataset.axis === "y") {
        const box = root.querySelector(".mf-middle").getBoundingClientRect();
        const raw = (position - box.top) / box.height * 100;
        const share = Math.min(82, Math.max(18, raw));
        root.style.setProperty("--mf-row-map", share + "fr");
        root.style.setProperty("--mf-row-net", (100 - share) + "fr");
    } else {
        const box = root.querySelector(".mf-shell").getBoundingClientRect();
        const size = position - box.left;
        const clamped = Math.min(Number(grip.dataset.max), Math.max(Number(grip.dataset.min), size));
        root.style.setProperty(grip.dataset.var, clamped + "px");
    }
};

/**
 * Bind the pointer and keyboard handling of one grip.
 * @param {HTMLElement} root - The shell's root element
 * @param {HTMLElement} grip - The grip
 * @param {Number} dragSlop - Distance in pixels a pointer must move before a press counts as a drag
 * @return {Object} A record of the bound listeners, as returned by `hortis.bindDomListeners`
 */
hortis.mfShell.bindGrip = function (root, grip, dragSlop) {
    const tab = grip.querySelector(".mf-grip-tab");
    const axisPos = event => grip.dataset.axis === "y" ? event.clientY : event.clientX;
    let origin = null;
    let moved = false;
    let onTab = false;
    return hortis.bindDomListeners(grip, [{
        event: "pointerdown",
        listener: event => {
            origin = axisPos(event);
            moved = false;
            // Capture retargets later events to the grip, so decide here whether the press began on the tab
            onTab = tab !== null && tab.contains(event.target);
            grip.setPointerCapture(event.pointerId);
            root.classList.add("mf-dragging");
        }
    }, {
        event: "pointermove",
        listener: event => {
            if (origin !== null) {
                if (Math.abs(axisPos(event) - origin) > dragSlop) {
                    moved = true;
                }
                if (moved) {
                    hortis.mfShell.moveGrip(root, grip, axisPos(event));
                }
            }
        }
    }, {
        event: "pointerup",
        listener: event => {
            const wasTab = onTab;
            const wasDrag = moved;
            if (origin !== null) {
                grip.releasePointerCapture(event.pointerId);
            }
            origin = null;
            onTab = false;
            root.classList.remove("mf-dragging");
            if (wasTab && !wasDrag) {
                hortis.mfShell.toggleGrip(root, grip);
            }
        }
    }, {
        event: "keydown",
        listener: event => {
            const less = event.key === "ArrowLeft" || event.key === "ArrowUp";
            const more = event.key === "ArrowRight" || event.key === "ArrowDown";
            if (less || more) {
                event.preventDefault();
                const box = grip.getBoundingClientRect();
                const centre = grip.dataset.axis === "y" ? box.top + box.height / 2 : box.left + box.width / 2;
                hortis.mfShell.moveGrip(root, grip, centre + (more ? 20 : -20));
            } else if (event.key === "Enter") {
                event.preventDefault();
                hortis.mfShell.toggleGrip(root, grip);
            }
        }
    }]);
};

hortis.mfShell.bindGrips = function (root, dragSlop) {
    return [...root.querySelectorAll(".mf-grip")].map(grip => hortis.mfShell.bindGrip(root, grip, dragSlop));
};

hortis.mfShell.unbindGrips = function (records) {
    records.forEach(hortis.unbindDomListeners);
};

/** Filter concertina **/

// The concertina of filter sections in the filter pane, each with a badge in its header summing the summaries of the
// filters whose views it holds - see hortis.summarisedFilter
fluid.def("hortis.filterConcertina", {
    $layers: "hortis.pageMarkupComponent",
    selector: ".mf-pane-filters",
    filters: "{vizLoader hortis.summarisedFilter}",
    facetSummaries: "$compute:hortis.filterConcertina.facetSummaries({self}.filters)",
    renderBadges: "$effect:hortis.filterConcertina.renderBadges({self}.container, {self}.facetSummaries)",
    domBinding: {
        $bindable: {
            bind: "hortis.filterConcertina.bindEvents({self}.container)",
            unbind: "hortis.unbindDomListeners({boundValue})"
        }
    }
});

/**
 * Combine the summaries of the filters within each section of the concertina. Filters with no view, such as the map's
 * grid selection, belong to no section.
 * @param {hortis.summarisedFilter[]} filters - The filters to be summarised
 * @return {Map<HTMLElement, FilterSummary>} Map of each section's element to its combined summary, which shows a plain
 * marker only if every active filter within it does
 */
hortis.filterConcertina.facetSummaries = function (filters) {
    const summaries = new Map();
    filters.forEach(filter => {
        const summary = filter.filterSummary;
        const container = filter.view?.container;
        const facet = container?.closest?.(".mf-facet");
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
};

/**
 * Update the badge in each filter section's header from the current section summaries.
 * @param {HTMLElement} container - The filter pane
 * @param {Map<HTMLElement, FilterSummary>} facetSummaries - Map of section element to its summary
 */
hortis.filterConcertina.renderBadges = function (container, facetSummaries) {
    container.querySelectorAll(".mf-facet").forEach(facet => {
        const summary = facetSummaries.get(facet);
        const badge = facet.querySelector("[data-state]");
        facet.classList.toggle("mf-facet-live", !!summary);
        badge.hidden = !summary;
        badge.classList.toggle("mf-facet-state-dot", !!summary?.dot);
        badge.textContent = summary && !summary.dot ? String(summary.count) : "";
        if (summary) {
            badge.setAttribute("title", summary.title);
            badge.setAttribute("aria-label", summary.title);
        }
    });
};

hortis.filterConcertina.setOpen = function (head, open) {
    head.setAttribute("aria-expanded", open ? "true" : "false");
    head.ownerDocument.getElementById(head.getAttribute("aria-controls")).hidden = !open;
};

hortis.filterConcertina.bindEvents = function (container) {
    return hortis.bindDomListeners(container, [{
        event: "click",
        selector: ".mf-facet-head",
        listener: (event, head) => hortis.filterConcertina.setOpen(head, head.getAttribute("aria-expanded") !== "true")
    }, {
        event: "click",
        selector: ".imerss-collapse-facets",
        listener: () => container.querySelectorAll(".mf-facet-head").forEach(head => hortis.filterConcertina.setOpen(head, false))
    }]);
};

/** View tabs **/

// The tabs heading the views pane, which let each view know whether it is showing, so that it need only render when it is
fluid.def("hortis.viewTabs", {
    $layers: "hortis.pageMarkupComponent",
    selector: ".mf-pane-views",
    selectedTab: "net",
    downloadTitles: {
        net: "Download the network as a PNG image",
        mtx: "Download the interaction counts as CSV",
        bees: "Download the bee list as CSV",
        plants: "Download the plant list as CSV",
        abund: "Download bee abundance counts as CSV",
        seed: "Download the seed mix as CSV"
    },
    renderTabs: "$effect:hortis.viewTabs.render({self}.container, {self}.selectedTab, {self}.downloadTitles)",
    domBinding: {
        $bindable: {
            bind: "hortis.viewTabs.bindEvents({self}, {self}.container)",
            unbind: "hortis.unbindDomListeners({boundValue})"
        }
    }
});

hortis.viewTabs.render = function (container, selectedTab, downloadTitles) {
    container.querySelectorAll(".mf-tab").forEach(tab => {
        const on = tab.dataset.tab === selectedTab;
        tab.classList.toggle("mf-tab-on", on);
        tab.setAttribute("aria-selected", on ? "true" : "false");
        tab.setAttribute("tabindex", on ? "0" : "-1");
    });
    container.querySelectorAll("[data-panel]").forEach(panel => {
        panel.hidden = panel.dataset.panel !== selectedTab;
    });
    const title = downloadTitles[selectedTab];
    const download = container.querySelector(".imerss-view-download");
    if (download && title) {
        download.setAttribute("title", title);
        download.setAttribute("aria-label", title);
    }
};

hortis.viewTabs.bindEvents = function (that, container) {
    return hortis.bindDomListeners(container, [{
        event: "click",
        selector: ".mf-tab",
        listener: (event, tab) => that.selectedTab = tab.dataset.tab
    }, {
        event: "keydown",
        selector: ".mf-tab",
        listener: (event, tab) => {
            const tabs = [...container.querySelectorAll(".mf-tab")];
            const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
            if (step !== 0) {
                event.preventDefault();
                const next = tabs[(tabs.indexOf(tab) + step + tabs.length) % tabs.length];
                that.selectedTab = next.dataset.tab;
                next.focus();
            }
        }
    }]);
};

/**
 * Determine whether a particular tab of the views pane is selected.
 * @param {String} selectedTab - The id of the currently selected tab
 * @param {String} tabId - The id of the tab of interest
 * @return {Boolean} `true` if the tab is selected
 */
hortis.viewTabs.isSelected = (selectedTab, tabId) => selectedTab === tabId;

// The download button in the views pane's tab strip, which downloads the contents of the selected view
fluid.def("hortis.viewDownload", {
    $layers: "hortis.pageMarkupComponent",
    selector: ".imerss-view-download",
    // Components bearing hortis.downloadableView, each holding the `tabId` of its view and a `download` method
    views: "{vizLoader hortis.downloadableView}",
    download: "$method:hortis.viewDownload.download({self}.views, {viewTabs}.selectedTab)",
    domBinding: {
        $bindable: {
            bind: "hortis.viewDownload.bindClick({self}, {self}.container)",
            unbind: "hortis.unbindDomListeners({boundValue})"
        }
    }
});

// A view in the views pane which can download its contents
fluid.def("hortis.downloadableView", {
    $layers: "fluid.component"
    // tabId: String
    // download: $method
});

hortis.viewDownload.download = function (views, selectedTab) {
    views.find(view => view.tabId === selectedTab)?.download();
};

hortis.viewDownload.bindClick = function (that, container) {
    return hortis.bindDomListeners(container, [{event: "click", listener: () => that.download()}]);
};

/** Fullscreen control **/

fluid.def("hortis.fullScreenControl", {
    $layers: "hortis.pageMarkupComponent",
    selector: ".imerss-fullscreen",
    // The element to be shown in full screen
    fullScreenSelector: ".imerss-container",
    enabled: false,
    fullScreenEffect: "$effect:hortis.fullScreenControl.apply({self}.enabled, {self}.fullScreenSelector, {global}.document)",
    domBinding: {
        $bindable: {
            bind: "hortis.fullScreenControl.bindClick({self}, {self}.container)",
            unbind: "hortis.unbindDomListeners({boundValue})"
        }
    }
});

/**
 * Enter or leave full screen mode. Since the effect runs once on startup, leaving full screen when not in it is
 * harmless.
 * @param {Boolean} enabled - `true` if full screen mode is to be entered
 * @param {String} fullScreenSelector - The selector of the element to be shown in full screen
 * @param {Document} dokkument - The document holding the element
 */
hortis.fullScreenControl.apply = async function (enabled, fullScreenSelector, dokkument) {
    dokkument.body.classList.toggle("imerss-fullscreen-mode", enabled);
    try {
        if (enabled) {
            await dokkument.querySelector(fullScreenSelector).requestFullscreen();
        } else if (dokkument.fullscreenElement) {
            await dokkument.exitFullscreen();
        }
    } catch (e) {
        fluid.log("Full screen request failed: ", e);
    }
};

hortis.fullScreenControl.bindClick = function (that, container) {
    return hortis.bindDomListeners(container, [{event: "click", listener: () => that.enabled = !that.enabled}]);
};

/** Collector report links **/

// Links to volunteers' reports, shown when the collector filter has chosen a volunteer with reports
fluid.def("hortis.collectorReportLinker", {
    $layers: "fluid.component",
    // collectorName: String|null
    // stateCode: String
    reportIndexUrl: "https://oregon-bee-project.github.io/melittoflora/reportIndex.json",
    linkText: "%collectorName %state Summary (%year)",
    linkTarget: "https://oregon-bee-project.github.io/melittoflora/reports/%reportPath",
    reportIndex: "$compute:fluid.fetchJSON({self}.reportIndexUrl)",
    collectorReports: "$compute:hortis.collectorReportLinker.find({self}.collectorName, {self}.reportIndex, {self}.stateCode)",
    showControl: "$effect:hortis.collectorReportLinker.show({self}.view.container, {self}.collectorReports)",
    view: {
        $component: {
            $layers: "hortis.selectorContainerView",
            selector: ".imerss-collector-report",
            templateTree: `$compute:hortis.collectorReportLinker.renderTree({$parent}.collectorName, {$parent}.collectorReports,
                {$parent}.linkText, {$parent}.linkTarget)`
        }
    }
});

/**
 * Find the reports of a collector.
 * @param {String|null} collectorName - The collector's name, which may join several with "|"
 * @param {Object<String, Object[]>} reportIndex - Map of collector name to their reports, each with members `state`,
 * `year` and `report`
 * @param {String} [stateCode] - If supplied, only reports for this state are found
 * @return {Object[]} The collector's reports, empty if there are none or no collector is chosen
 */
hortis.collectorReportLinker.find = function (collectorName, reportIndex, stateCode) {
    const reports = collectorName ? reportIndex[collectorName.replaceAll("|", "and")] || [] : [];
    return stateCode ? reports.filter(oneReport => oneReport.state === stateCode) : reports;
};

hortis.collectorReportLinker.show = function (container, collectorReports) {
    hortis.toggleClass(container, "fl-hidden", collectorReports.length === 0);
};

hortis.collectorReportLinker.renderTree = function (collectorName, collectorReports, linkText, linkTarget) {
    const links = collectorReports.map(({state, year, report}) => ({tag: "div", attrs: {}, children: [
        {tag: "a", attrs: {href: hortis.stringTemplate(linkTarget, {reportPath: report}), target: "_blank"}, children: [
            {text: hortis.stringTemplate(linkText, {collectorName, state, year})}
        ]},
        {tag: "span", attrs: {"class": "external-link"}, children: []}
    ]}));
    return {tag: "fragment", children: [fluid.markVerbatim({tag: "div", attrs: {}, children: [
        {tag: "div", attrs: {}, children: [{text: "Volunteer reports available:"}]},
        ...links
    ]})]};
};
