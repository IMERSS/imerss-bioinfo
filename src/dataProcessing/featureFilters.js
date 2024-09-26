/* eslint-env node */

"use strict";

const fluid = require("infusion");

const hortis = fluid.registerNamespace("hortis");

hortis.rowToLoggable = function (row) {
    return fluid.filterKeys(row, ["iNaturalistTaxonName", "observationId", "placeName", "latitude", "longitude"]);
};

hortis.makeFeatureRowFilter = function (feature, options) {
    options = options || {};
    return function (rows) {
        let rejections = 0;
        const togo = rows.filter(function (row) {
            row.point = [hortis.parseFloat(row.longitude), hortis.parseFloat(row.latitude)];
            const accept = hortis.intersectsAnyFeature(feature, row);
            if (!accept) {
                ++rejections;
                if (options.logRejection) {
                    const tolog = hortis.rowToLoggable(row);
                    console.log("Rejecting observation ", tolog, " as lying outside polygon " + options.featureName);
                }
            }
            return accept;
        });
        console.log("Rejecting " + rejections + " observations as lying outside polygon " + options.featureName);
        return togo;
    };
};

hortis.processRegionFilter = function (resolved, patch, key) {
    const filter = hortis.makeFeatureRowFilter(patch.patchData.features, {
        logRejection: patch.logRejection,
        featureName: key
    });
    // TODO: MATT-based immutable filtering!
    resolved.obsRows = filter(resolved.obsRows);
};

hortis.processAssignFeature = function (resolved, patch) {
    const extraCols = {};
    const features = patch.patchData.features;
    const last = Date.now();
    resolved.obsRows.forEach(function (row) {
        row.point = [hortis.parseFloat(row.longitude), hortis.parseFloat(row.latitude)];
        const intersects = features.filter(function (feature) {
            return hortis.intersectsFeature(feature, row);
        });
        if (intersects.length === 0) {
            console.log("Warning: row ", hortis.rowToLoggable(row), " did not intersect any feature");
        } else {
            if (intersects.length > 1) {
                const allProps = fluid.getMembers(intersects, "properties");
                console.log("Warning: row ", hortis.rowToLoggable(row), " intersected multiple features: ", allProps);
            }
            const props = intersects[0].properties;
            fluid.extend(row, props);
            fluid.extend(extraCols, props);
        }
    });
    console.log("Intersected " + resolved.obsRows.length + " observations in " + (Date.now() - last) + " ms");
    const extraOutMap = {
        columns: fluid.transform(extraCols, function (junk, key) {
            return key;
        })
    };
    resolved.combinedObsOutMap = hortis.combineMaps([resolved.combinedObsOutMap, extraOutMap], true);
};
