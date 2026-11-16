<script src="../../js/i6/imerss-core.js"></script>
<script>
"use strict";

// Reports how many observations survive the filters and selections
fluid.def("hortis.recordReporter", {
    $layers: "fluid.component",
    // filtered: Selection - the observations shown
    // all: Selection - every observation
    counts: "$compute:hortis.recordReporter.renderModel({self}.filtered, {self}.all)"
});

/**
 * Render the counts of the observations shown and of all of them.
 * @param {Selection} filtered - The observations shown
 * @param {Selection} all - Every observation
 * @return {Object} Members `filteredRows` and `allRows`, the counts formatted
 */
hortis.recordReporter.renderModel = function (filtered, all) {
    return {
        filteredRows: hortis.formatInt(filtered.count),
        allRows: hortis.formatInt(all.count)
    };
};
</script>

<template>
    <div class="imerss-reporter imerss-record-reporter">
        <p>Displaying <b title="Observation records matching every filter and the current bee and plant selections">@{counts.filteredRows}</b>
            of <span title="Total number of observation records in this dataset">@{counts.allRows}</span> records</p>
    </div>
</template>
