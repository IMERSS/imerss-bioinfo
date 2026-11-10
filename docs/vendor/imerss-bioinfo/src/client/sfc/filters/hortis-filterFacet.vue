<fluid-import src="../core/hortis-icons.vue"></fluid-import>
<script src="../../js/i6/imerss-core.js"></script>
<script src="../../js/i6/filters.js"></script>
<script>
"use strict";

// A collapsible section of the filter concertina, headed by its name and a badge summing the summaries of the filters
// within it. Its body is a subcomponent rendering the markup held as its `template`, into which the section's filters,
// held as the body's subcomponents, are rendered at their @ids, e.g.
//     collectorFacet: {
//         $component: {
//             $layers: "hortis.filterFacet",
//             facet: "collector",
//             name: "Collector",
//             body: {
//                 $component: {
//                     template: `<div><div @id="collectorFilter"></div></div>`,
//                     collectorFilter: {$component: {$layers: "hortis.collectorFilter"}}
//                 }
//             }
//         }
//     }
// The root element of the body's template is elided onto the section's body, so that it may hold several filters
fluid.def("hortis.filterFacet", {
    $layers: ["hortis.icons", "fluid.component"],
    // facet: String - the name of the section, borne as its data-facet
    // name: String - the name shown in its header
    open: false,
    closed: "$compute:hortis.negate({self}.open)",
    // Every filter within the section, whose summaries are summed into its badge
    filters: "{self hortis.summarisedFilter}",
    badge: "$compute:hortis.filterFacet.badge({self}.filters)",
    toggle: "$method:hortis.filterFacet.toggle({self})",
    body: {
        $component: {
            $layers: "hortis.filterFacet.body"
        }
    }
});

// The body of a section of the filter concertina, rendering the markup held as its `template`
fluid.def("hortis.filterFacet.body", {
    $layers: "fluid.component",
    // template: String
    view: {
        $component: {
            $layers: "fluid.templateViewComponent",
            template: "{$parent}.template"
        }
    }
});

hortis.filterFacet.toggle = function (that) {
    that.open = !that.open;
};

/**
 * @typedef {Object} FacetBadge
 * @property {Boolean} live - `true` if any filter within the section is active
 * @property {Boolean} hidden - `true` if the badge is not shown
 * @property {Boolean} dot - `true` if the badge shows a plain marker rather than a count
 * @property {String} text - The text of the badge
 * @property {String|null} title - The description of the section's active filters
 */

/**
 * Combine the summaries of the filters within a section of the concertina into the badge in its header.
 * @param {hortis.summarisedFilter[]} filters - The filters within the section
 * @return {FacetBadge} The section's badge, which shows a plain marker only if every active filter within it does
 */
hortis.filterFacet.badge = function (filters) {
    const summaries = filters.map(filter => filter.filterSummary).filter(summary => summary && summary.count > 0);
    const live = summaries.length > 0;
    const count = summaries.reduce((sum, summary) => sum + summary.count, 0);
    const dot = live && summaries.every(summary => !!summary.dot);
    return {
        live,
        hidden: !live,
        dot,
        text: live && !dot ? String(count) : "",
        title: live ? summaries.map(summary => summary.title).join("; ") : null
    };
};

// The concertina of sections in the filter pane, which may all be closed at once
fluid.def("hortis.filterConcertina", {
    $layers: "fluid.component",
    facets: "{vizLoader hortis.filterFacet}",
    collapseAll: "$method:hortis.filterConcertina.collapseAll({self}.facets)"
});

hortis.filterConcertina.collapseAll = function (facets) {
    facets.forEach(facet => {
        facet.open = false;
    });
};
</script>

<template>
    <section class="imerss-facet" data-facet="@{facet}" @class="imerss-facet-live:@{badge.live}">
        <h3 class="imerss-facet-h">
            <button class="imerss-facet-head" type="button" aria-expanded="@{open}" aria-controls="imerss-facet-@{facet}" @onclick="{self}.toggle()">
                <svg class="imerss-facet-chev" width="14" height="14" aria-hidden="true"><use href="#imerss-i-chev"/></svg>
                <span class="imerss-facet-name">@{name}</span>
                <span class="imerss-facet-state" data-state="" hidden="@{badge.hidden}" @class="imerss-facet-state-dot:@{badge.dot}"
                    title="@{badge.title}" aria-label="@{badge.title}">@{badge.text}</span>
            </button>
        </h3>
        <div class="imerss-facet-body" id="imerss-facet-@{facet}" hidden="@{closed}" @id="body"></div>
    </section>
</template>
