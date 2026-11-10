<script>
"use strict";

// One tab of hortis.pageTabs
fluid.def("hortis.pageTabs.tab", {
    $layers: "fluid.component",
    selected: "$compute:hortis.pageTabs.isSelected({pageTabs}.selectedTab, {self}.tab.id)",
    select: "$method:hortis.pageTabs.select({pageTabs}, {self}.tab.id)"
});
</script>

<template>
    <li class="ui-tabs-tab ui-tab ui-state-default" @class="ui-tabs-active:@{selected}, ui-state-active:@{selected}" role="tab"
        aria-selected="@{selected}">
        <a class="ui-tabs-anchor" href="#@{tab.panelId}" @onclick="hortis.pageTabs.click({0}, {self})">@{tab.label}</a>
    </li>
</template>
