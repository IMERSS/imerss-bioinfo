<script src="../../js/i6/imerss-core.js"></script>
<script src="../../js/i6/filters.js"></script>
<script src="../../js/i6/blitz.js"></script>
<script>
"use strict";

// The counts of taxa by reporting status of a BioBlitz - historical records, which are confirmed or unconfirmed by its
// contributors, and new ones. The confirmed, unconfirmed and new counts are buttons which together filter the
// observations to taxa of the chosen statuses
fluid.def("hortis.blitzRecords", {
    $layers: ["hortis.obsFilter", "hortis.urlMappedFilter"],
    urlKey: "status",
    urlCodec: "hortis.blitzRecords.urlCodec",
    rowById: "{vizLoader}.taxa.rowById",
    filterState: {
        $reactiveRoot: {confirmed: false, unconfirmed: false, new: false}
    },
    statusById: "$compute:hortis.reportingStatusById({self}.rowById)",
    counts: "$compute:hortis.blitzRecords.counts({self}.statusById)",
    filterSummary: "$compute:hortis.blitzRecords.summarise({self}.filterState)",
    doFilter: "$method:hortis.blitzRecords.doFilter({0}:obsRows, {1}:filterState, {self}.statusById)",
    toggle: "$method:hortis.blitzRecords.toggle({self}, {0}:status)",
    reset: "$method:hortis.blitzRecords.reset({self})"
});

hortis.blitzRecords.urlCodec = hortis.urlCodecs.flags(["confirmed", "unconfirmed", "new"]);

hortis.blitzRecords.counts = function (statusById) {
    const counts = {confirmed: 0, unconfirmed: 0, new: 0};
    Object.values(statusById).forEach(status => ++counts[status]);
    return {
        historical: hortis.formatInt(counts.confirmed + counts.unconfirmed),
        confirmed: hortis.formatInt(counts.confirmed),
        unconfirmed: hortis.formatInt(counts.unconfirmed),
        new: hortis.formatInt(counts.new)
    };
};

hortis.blitzRecords.summarise = function (filterState) {
    return hortis.countSummary(filterState.confirmed + filterState.unconfirmed + filterState.new, ["record status", "record statuses"]);
};

hortis.blitzRecords.doFilter = function (obsRows, filterState, statusById) {
    const count = filterState.confirmed + filterState.unconfirmed + filterState.new;
    const all = count === 0 || count === 3;
    return all ? obsRows : obsRows.filter(obsRow => filterState[statusById[obsRow.iNaturalistTaxonId]]);
};

hortis.blitzRecords.toggle = function (that, status) {
    that.filterState = {...that.filterState, [status]: !that.filterState[status]};
};

hortis.blitzRecords.reset = function (that) {
    that.filterState = {confirmed: false, unconfirmed: false, new: false};
};
</script>

<template>
    <div class="imerss-blitz-records">
        <div class="imerss-records-historical imerss-records">
            <div class="records-label">Historical Records</div>
            <div class="records-value">@{counts.historical}</div>
        </div>
        <button class="imerss-records-confirmed imerss-records" @class="selected:@{filterState.confirmed}" type="button"
            @onclick="{self}.toggle(confirmed)">
            <div class="records-label">Confirmed Records</div>
            <div class="records-value">@{counts.confirmed}</div>
        </button>
        <button class="imerss-records-unconfirmed imerss-records" @class="selected:@{filterState.unconfirmed}" type="button"
            @onclick="{self}.toggle(unconfirmed)">
            <div class="records-label">Unconfirmed Records</div>
            <div class="records-value">@{counts.unconfirmed}</div>
        </button>
        <button class="imerss-records-new imerss-records" @class="selected:@{filterState.new}" type="button"
            @onclick="{self}.toggle(new)">
            <div class="records-label">New Records</div>
            <div class="records-value">@{counts.new}</div>
        </button>
    </div>
</template>
