<fluid-import src="hortis-standardVizLoader.vue"></fluid-import>
<fluid-import src="hortis-blitzRecords.vue"></fluid-import>
<script src="../../js/i6/blitz.js"></script>
<script>
"use strict";

// The visualisation of the outcomes of a BioBlitz - the standard visualisation, together with the counts of taxa by
// reporting status, which filter the observations, and checklist rows decorated by their status
fluid.def("hortis.blitzVizLoader", {
    $layers: "hortis.standardVizLoader",
    // By default the placeholder declared below, whose taxa bear their reporting status
    vizFile: "placeholder://hortis.blitzVizLoader/viz",
    records: {
        $component: {
            $layers: "hortis.blitzRecords"
        }
    },
    checklist: {
        $component: {
            decorate: "hortis.blitzChecklistDecoration"
        }
    }
});
</script>

<symbols>
    <symbol id="imerss-i-exclamation" viewBox="0 0 24 24" stroke="#f5f300">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M13.253 5.98 12 13.5l-1.253-7.52a1.27 1.27 0 1 1 2.506 0Z"/>
        <circle cx="12" cy="19" r="1" stroke-width="2"/>
    </symbol>
    <symbol id="imerss-i-question" viewBox="0 0 512 512" fill="#55b">
        <g transform="translate(256,256) scale(0.8) translate(-256,-256)">
            <path d="M396,85c-13-25-34-46-59-61C311,9,280,0,247,0c-41-0-76,11-101,26c-26,15-37,32-37,32c-4,4-7,9-7,15 c0,6,3,11,7,15l36,29c7,6,18,6,25-1c0,0,4-8,18-16c14-8,32-14,59-14c24,0,44,9,58,21c7,6,12,13,15,19c3,6,4,11,4,16 c0,14-3,23-7,30c-3,6-7,11-12,16c-7,7-17,14-29,20c-11,6-23,12-36,19c-14,8-29,19-40,36c-5,8-10,18-12,28 c-3,10-4,20-4,31c0,11,0,21,0,21c0,11,9,19,19,19h47c11,0,19-9,19-19c0,0,0-9,0-21c0-4,0-7,1-8c1-3,1-3,2-5 c1-1,4-4,9-6c7-4,18-9,31-16c19-10,42-25,62-48c10-12,18-26,24-42c6-16,9-34,9-54C410,121,405,102,396,85z"/>
            <path d="M229,406c-29,0-53,24-53,53c0,29,24,53,53,53c29,0,53-24,53-53C282,430,258,406,229,406z"/>
        </g>
    </symbol>
    <symbol id="imerss-i-tick" viewBox="0 0 70 70" fill="#5b5">
        <g transform="translate(35,35) scale(0.75) translate(-35,-35)">
            <path d="M26.474,70c-2.176,0-4.234-1.018-5.557-2.764L3.049,43.639C0.725,40.57,1.33,36.2,4.399,33.875 c3.074-2.326,7.441-1.717,9.766,1.35l11.752,15.518L55.474,3.285c2.035-3.265,6.332-4.264,9.604-2.232 c3.268,2.034,4.266,6.334,2.23,9.602l-34.916,56.06c-1.213,1.949-3.307,3.175-5.6,3.279C26.685,69.998,26.58,70,26.474,70z"/>
        </g>
    </symbol>
</symbols>
<placeholder name="viz" type="application/octet-stream" encoding="base64">
    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
    AA==
</placeholder>
