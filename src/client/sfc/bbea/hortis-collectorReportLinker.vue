<script src="../../js/i6/imerss-core.js"></script>
<script>
"use strict";

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
    view: {
        $component: {
            $layers: "fluid.viewComponent",
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

hortis.collectorReportLinker.renderTree = function (collectorName, collectorReports, linkText, linkTarget) {
    const links = collectorReports.map(({state, year, report}) => ({tag: "div", attrs: {}, children: [
        {tag: "a", attrs: {href: hortis.stringTemplate(linkTarget, {reportPath: report}), target: "_blank"}, children: [
            {text: hortis.stringTemplate(linkText, {collectorName, state, year})}
        ]},
        {tag: "span", attrs: {"class": "external-link"}, children: []}
    ]}));
    // The root is elided onto the container, which is hidden when there are no reports
    const rootClass = "imerss-collector-report" + (collectorReports.length === 0 ? " fl-hidden" : "");
    return {tag: "fragment", children: [{tag: "div", attrs: {"class": rootClass}, children: [fluid.markVerbatim({tag: "div", attrs: {}, children: [
        {tag: "div", attrs: {}, children: [{text: "Volunteer reports available:"}]},
        ...links
    ]})]}]};
};
</script>
