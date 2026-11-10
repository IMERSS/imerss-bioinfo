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
        <path d="M6 3l5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
    </symbol>
    <symbol id="imerss-i-search" viewBox="0 0 16 16">
        <circle cx="7" cy="7" r="4.4" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M10.4 10.4L14 14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
    </symbol>
    <symbol id="imerss-i-download" viewBox="0 0 16 16">
        <path d="M8 2v8M4.6 6.8L8 10.2l3.4-3.4M2.6 13h10.8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
    </symbol>
    <symbol id="imerss-i-reset" viewBox="0 0 16 16">
        <path d="M13.5 8a5.5 5.5 0 1 1-1.7-3.96M13.4 1.6v3.2h-3.2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
    </symbol>
</symbols>
