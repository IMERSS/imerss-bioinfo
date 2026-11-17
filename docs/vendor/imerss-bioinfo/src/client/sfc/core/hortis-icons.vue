<script>
"use strict";

// The icons of the BBEA visualisation's interface, shared by several of its components. A component whose template
// refers to one of them bears this layer, so that the icons are injected into any document it renders into
fluid.def("hortis.icons", {
    $layers: "fluid.component"
});
</script>

<symbols>
    <symbol id="imerss-i-chev" viewBox="0 0 16 16">
        <path d="M6 3l5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path>
    </symbol>
    <symbol id="imerss-i-search" viewBox="0 0 16 16">
        <circle cx="7" cy="7" r="4.4" fill="none" stroke="currentColor" stroke-width="1.6"></circle><path d="M10.4 10.4L14 14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"></path>
    </symbol>
    <symbol id="imerss-i-download" viewBox="0 0 16 16">
        <path d="M8 2v8M4.6 6.8L8 10.2l3.4-3.4M2.6 13h10.8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"></path>
    </symbol>
    <symbol id="imerss-i-reset" viewBox="0 0 16 16">
        <path d="M13.5 8a5.5 5.5 0 1 1-1.7-3.96M13.4 1.6v3.2h-3.2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"></path>
    </symbol>
    <!-- Resetting filters, or anything which a reset restores, e.g. a seed mix - a funnel with a reset arrow, as the
         bioReportR stories' "Reset all filters" control shows it. Its paths take the fill of the svg using it -->
    <symbol id="imerss-i-filter-reset" viewBox="0 0 32 32">
        <path d="M22.5,9A7.4522,7.4522,0,0,0,16,12.792V8H14v8h8V14H17.6167A5.4941,5.4941,0,1,1,22.5,22H22v2h.5a7.5,7.5,0,0,0,0-15Z"></path>
        <path d="M26,6H4V9.171l7.4142,7.4143L12,17.171V26h4V24h2v2a2,2,0,0,1-2,2H12a2,2,0,0,1-2-2V18L2.5858,10.5853A2,2,0,0,1,2,9.171V6A2,2,0,0,1,4,4H26Z"></path>
    </symbol>
    <!-- Clearing a selection, e.g. every plant of a seed mix - an empty circle. Its path takes the fill of the svg using it -->
    <symbol id="imerss-i-clear" viewBox="0 0 24 24">
        <path d="M12,22q-2.07,0-3.9-0.79q-1.82-0.79-3.17-2.14Q3.58,17.73 2.79,15.9T2,12Q2,9.92 2.79,8.1Q3.58,6.27 4.93,4.93Q6.28,3.57 8.1,2.79Q9.93,2 12,2t3.9,0.79t3.17,2.14q1.35,1.35 2.14,3.17Q22,9.92 22,12t-0.79,3.9t-2.14,3.17q-1.35,1.35-3.17,2.14T12,22Zm0-2q3.35,0 5.68-2.32T20,12T17.68,6.32T12,4T6.33,6.32T4,12t2.33,5.68T12,20Zm0-8Z"></path>
    </symbol>
</symbols>
