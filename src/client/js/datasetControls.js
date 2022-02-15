"use strict";

var hortis = fluid.registerNamespace("hortis");

// Weird, non-general purpose intersect which modifies target by excluding source
hortis.intersect = function (target, source) {
    fluid.each(target, function (value, key) {
        if (!(key in source)) {
            delete target[key];
        }
    });
};

hortis.combineDatasets = function (enabledList, quantiserDatasets) {
    var intersect;
    var union = {
        obsCount: 0,
        buckets: {},
        byTaxonId: {}
    };
    enabledList.forEach(function (enabled) {
        var dataset = quantiserDatasets[enabled];
        if (!intersect) {
            intersect = {
                buckets: fluid.extend({}, dataset.buckets),
                byTaxonId: fluid.extend({}, dataset.byTaxonId)
            };
        } else {
            hortis.intersect(intersect.buckets, dataset.buckets);
            hortis.intersect(intersect.byTaxonId, dataset.byTaxonId);
        }
        fluid.extend(union.buckets, dataset.buckets);
        fluid.extend(union.byTaxonId, dataset.byTaxonId);
        union.obsCount += dataset.totalCount;
    });
    return {
        intersect: intersect,
        union: union
    };
};

hortis.renderDatasetControls = function (datasetEnabled, squareSide, datasets, quantiser, indexVersion) {
    console.log("renderDatasetControls executing for indexVersion " + indexVersion);
    var togo = [{
        type: "hortis.datasetControlHeader"
    }];

    fluid.each(datasets, function (dataset, datasetId) {
        togo.push({
            type: "hortis.datasetControl",
            datasetId: datasetId,
            dataset: dataset,
            quantiserDataset: quantiser.datasets[datasetId]
        });
    });
    var enabledList = fluid.transforms.setMembershipToArray(datasetEnabled);

    var createFooter = function (prefix, dataset) {
        if (prefix) {
            hortis.quantiser.datasetToSummary(dataset, squareSide);
            dataset.obsCount = (prefix === "Union" ? dataset.obsCount : "");
        } else {
            dataset.taxaCount = dataset.area = dataset.obsCount = "";
        }
        togo.push(fluid.extend({
            type: "hortis.datasetControlFooter",
            text: prefix ? prefix + " of " + enabledList.length + " datasets" : ""
        }, dataset));
    };
    if (enabledList.length > 1 && Object.keys(quantiser.datasets).length > 0) { // TODO: Ensure that relay pulls quantiser on startup!
        var combinedDatasets = hortis.combineDatasets(enabledList, quantiser.datasets);
        createFooter("Intersection", combinedDatasets.intersect);
        createFooter("Union", combinedDatasets.union);
    } else {
        createFooter("", {});
        createFooter("", {});
    }
    return togo;
};


fluid.defaults("hortis.datasetControlBase", {
    gradeNames: "fluid.containerRenderingView",
    parentContainer: "{leafletMap}.dom.datasetControls"
});

fluid.defaults("hortis.datasetControlHeader", {
    gradeNames: "hortis.datasetControlBase",
    markup: {
        container: "<tr class=\"fld-bagatelle-dataset-control\">" +
                 "<td fl-bagatelle-dataset-legend-column></td>" +
                 "<td fl-bagatelle-dataset-checkbox-column></td>" +
                 "<td fl-bagatelle-dataset-name-column></td>" +
                 "%extraColumns</tr>",
        cell: "<td class=\"%columnClass\">%text</td>"
    },
    invokers: {
        renderMarkup: "hortis.datasetControl.renderMarkup({that}.options.markup, true)"
    }
});

fluid.defaults("hortis.datasetControl", {
    gradeNames: "hortis.datasetControlBase",
    selectors: {
        legend: ".fld-bagatelle-dataset-legend",
        enable: ".fld-bagatelle-dataset-checkbox",
        name: ".fld-bagatelle-dataset-name"
    },
    datasetId: "{source}.datasetId", // Stupid, creates circularity if we try to resolve model segment from model on line 274
    model: {
        datasetEnabled: true
    },
    modelRelay: {
        checkbox: { // TODO: avoid the footgun where the user has not written "value" on the checkbox markup
            source: "dom.enable.value",
            target: "datasetEnabled"
        },
        name: {
            source: "datasetControl.dataset.name",
            target: "dom.name.text"
        },
        // TODO: bind legend using integral style
        datasetEnabled: {
            target: "datasetEnabled",
            source: {
                context: "hortis.leafletMap",
                segs: ["datasetEnabled", "{that}.options.datasetId"]
            }
        },
        colour: {
            source: "datasetControl.dataset.colour",
            target: "dom.legend.style.backgroundColor"
        }
    },
    invokers: {
        renderMarkup: "hortis.datasetControl.renderMarkup({that}.options.markup, false, {that}.model.dataset, {quantiser}.datasets, {that}.options.datasetId)"
    },
    markup: {
        container: "<tr class=\"fld-bagatelle-dataset-control\">" +
                 "<td fl-bagatelle-dataset-legend-column><span class=\"fld-bagatelle-dataset-legend\"></span></td>" +
                 "<td fl-bagatelle-dataset-checkbox-column><input class=\"fld-bagatelle-dataset-checkbox\" type=\"checkbox\" value=\"true\"/></td>" +
                 "<td fl-bagatelle-dataset-name-column><span class=\"fld-bagatelle-dataset-name\"></span></td>" +
                 "%extraColumns</tr>",
        cell: "<td class=\"%columnClass\">%text</td>"
    }
});

fluid.defaults("hortis.datasetControlFooter", {
    gradeNames: "hortis.datasetControlBase",
    selectors: {
        text: ".fl-bagatelle-dataset-text",
        obsCount: ".fl-bagatelle-dataset-obs",
        taxaCount: ".fl-bagatelle-dataset-taxa",
        area: ".fl-bagatelle-dataset-area"
    },
    markup: {
        container: "<tr><td></td><td></td><td class=\"fl-bagatelle-dataset-text\"></td><td class=\"fl-bagatelle-dataset-obs\"></td><td class=\"fl-bagatelle-dataset-taxa\"></td><td class=\"fl-bagatelle-dataset-area\"></td></tr>"
    },
    modelRelay: {
        text: {
            source: "datasetControl.text",
            target: "dom.text.text"
        },
        obsCount: {
            source: "datasetControl.obsCount",
            target: "dom.obsCount.text"
        },
        taxaCount: {
            source: "datasetControl.taxaCount",
            target: "dom.taxaCount.text"
        },
        area: {
            source: "datasetControl.area",
            target: "dom.area.text"
        }
    }
});


hortis.datasetControl.columnNames = {
    totalCount: {
        name: "Obs count",
        clazz: "fl-bagatelle-obs-count-column"
    },
    taxaCount: {
        name: "Richness",
        clazz: "fl-bagatelle-taxa-count-column"
    },
    area: {
        name: "Area (km²)",
        clazz: "fl-bagatelle-area-column"
    }
};

hortis.datasetControl.renderExtraColumns = function (markup, isHeader, dataset, quantiserDataset) {
    var extraColumns = fluid.transform(hortis.datasetControl.columnNames, function (columnInfo, key) {
        return fluid.stringTemplate(markup, {
            columnClass: columnInfo.clazz,
            text: isHeader ? columnInfo.name : quantiserDataset[key]
        });
    });
    return Object.values(extraColumns).join("\n");
};

hortis.datasetControl.renderMarkup = function (markup, isHeader, dataset, quantiserDatasets, datasetId) {
    // Whilst we believe we have stuck this into the "source" model, it never actually arrives in the parent relay before rendering starts
    var quantiserDataset = quantiserDatasets && quantiserDatasets[datasetId];
    var extraColumns = hortis.datasetControl.renderExtraColumns(markup.cell, isHeader, dataset, quantiserDataset);
    return fluid.stringTemplate(markup.container, {
        extraColumns: extraColumns
    });
};
