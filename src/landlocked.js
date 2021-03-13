/* eslint-env node */

"use strict";

var fluid = require("infusion");
var minimist = require("minimist");
fluid.require("%bagatelle");

require("./utils/utils.js");
require("./dataProcessing/readJSON.js");
require("./dataProcessing/readCSV.js");
require("./dataProcessing/readCSVwithMap.js");
require("./dataProcessing/readCSVwithoutMap.js");
require("./dataProcessing/writeCSV.js");
require("./lib/point-in-polygon.js");
require("./geom/geoJSON.js");

var hortis = fluid.registerNamespace("hortis");

fluid.setLogging(true);

fluid.loadInContext(fluid.module.resolvePath("%bagatelle/data/Galiano/Galiano_map_0.js"), true);  // produces json_Galiano_map_0
fluid.loadInContext(fluid.module.resolvePath("%bagatelle/data/Xetthecum/Site_class_4.js"), true); // produces json_Site_Class_4
fluid.loadInContext(fluid.module.resolvePath("%bagatelle/data/Xetthecum/Trincomali_2.js"), true); // produces json_Trincomali_2
var xetthecum_boundary = hortis.readJSONSync(fluid.module.resolvePath("%bagatelle/data/Xetthecum/Xetthecum_Project_Boundary_WGS_84.geojson"), "Xetthecum boundary");

var parsedArgs = minimist(process.argv.slice(2));

var outputFile = parsedArgs.o || "landlocked.csv";
var inputFile = parsedArgs._[0] || "%bagatelle/data/dataPaper/reintegrated-obs.csv";
var mapFile = parsedArgs.map || "%bagatelle/data/dataPaper/combinedOutMap-obs.json";

var map = hortis.readJSONSync(fluid.module.resolvePath(mapFile), "reading map file");

var reader = hortis.csvReaderWithMap({
    inputFile: fluid.module.resolvePath(inputFile),
    mapColumns: map.columns
});

var Galiano_island = fluid.global.json_Galiano_map_0.features;
var Xetthecum_site_class = fluid.global.json_Site_Class_4.features;
var Trincomali = fluid.global.json_Trincomali_2.features;

var Xetthecum_extract_props = ["CLASS", "SUB_CLASS"];
var Xetthecum_id_prop = "fid";

hortis.intersectsAnyFeature = function (features, row) {
    var intersects = features.map(function (feature) {
        return hortis.intersectsFeature(feature, row);
    });
    var intersectCount = hortis.countTrue(intersects);
    return intersectCount > 0;
};

hortis.findFeatureProperties = function (allFeatures, row, properties, idprop) {
    var features = allFeatures.filter(function (feature) {
        return hortis.intersectsFeature(feature, row);
    });
    // features array of each feature which contains the row
    var propValues = properties.map(function (propKey) {
        return fluid.getMembers(features, ["properties", propKey]);
    });
    // propValues has one element for each property, element for each feature containing property value
    var propVals = propValues.map(function (propList, index) {
        var hash = fluid.arrayToHash(propList);
        var keys = Object.keys(hash);
        if (keys.length > 1) {
            console.log("Warning: row ", row, " matched multiple features with ids ", fluid.getMembers(features, idprop),
               " with mismatching values for property " + properties[index] + ": values were ", keys);
        }
        return keys[0];
    });
    return propVals;
};

var TrincomaliFeature = fluid.extend(true, Trincomali[0], {
    properties: {
        fid: 99,
        CLASS: "Trincomali",
        SUB_CLASS: ""
    }
});

var allXetthecumFeatures = Xetthecum_site_class.concat(TrincomaliFeature);

hortis.getXetthecumProps = function (obsRows) {
    var now = Date.now();
    var extractedProps = obsRows.map(function (row) {
        row.point = [hortis.parseFloat(row.longitude), hortis.parseFloat(row.latitude)];
        return hortis.findFeatureProperties(allXetthecumFeatures, row, Xetthecum_extract_props, Xetthecum_id_prop);
    });
    console.log("Evaluated " + hortis.intersections + " intersections in " + (Date.now() - now) + " ms");
    var filtered = [];
    obsRows.forEach(function (row, index) {
        if (extractedProps[index][0]) {
            var asProps = {};
            Xetthecum_extract_props.forEach(function (prop, propIndex) {
                asProps[prop] = extractedProps[index][propIndex];
            });
            filtered.push(fluid.extend(true, {}, row, asProps));
        }
    });
    return filtered;
};

fluid.registerNamespace("hortis.filters");

hortis.filters.Xetthecum = {
    filter: function (rows) {
        var newRows = hortis.getXetthecumProps(pkg.rows);
    },
    extraProps: Xetthecum_extract_props
};

hortis.filters.Galiano = {
    filter: function (rows) {
        return rows.filter(function (row) {
            row.point = [hortis.parseFloat(row.longitude), hortis.parseFloat(row.latitude)];
            return hortis.intersectsAnyFeature(Galiano_island, row);
        });
    },
    extraProps: []
};

var activeFilter = 
    // hortis.filters.Xetthecum;
    hortis.filters.Galiano;

reader.completionPromise.then(function () {
    var obsRows = reader.rows;
    console.log("Matching against " + obsRows.length + " observations");

    var filtered = activeFilter.filter(obsRows); 
    
    var mapped = filtered.map(function (row) {
        var outRow = {
            observationId: row.observationId,
            latitude: row.point[1],
            longitude: row.point[0],
            iNaturalistTaxonName: row.iNaturalistTaxonName
        };
        activeFilter.extraProps.forEach(function (prop) {
            outRow[prop] = row[prop];
        });
        return outRow;
    });
    var completion = fluid.promise();
    hortis.writeCSV(fluid.module.resolvePath(outputFile), ["observationId", "latitude", "longitude", "iNaturalistTaxonName"].concat(activeFilter.extraProps), mapped, completion);
});
