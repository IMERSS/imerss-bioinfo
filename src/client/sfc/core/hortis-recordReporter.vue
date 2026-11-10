<script src="../../js/i6/imerss-core.js"></script>
<script>
"use strict";

// Reports how many observations survive the filters and selections
fluid.def("hortis.recordReporter", {
    $layers: "fluid.component",
    // filteredRows: Object[]
    // allRows: Object[]
    counts: "$compute:hortis.recordReporter.renderModel({self}.filteredRows, {self}.allRows)"
});

hortis.recordReporter.renderModel = function (filteredRows, allRows) {
    return {
        filteredRows: hortis.formatInt(filteredRows.length),
        allRows: hortis.formatInt(allRows.length)
    };
};
</script>

<template>
    <div class="imerss-reporter imerss-record-reporter">
        <p>Displaying <b title="Observation records matching every filter and the current bee and plant selections">@{counts.filteredRows}</b>
            of <span title="Total number of observation records in this dataset">@{counts.allRows}</span> records</p>
    </div>
</template>
