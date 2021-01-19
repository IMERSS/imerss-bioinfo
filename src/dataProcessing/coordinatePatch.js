/* eslint-env node */

"use strict";

var fluid = require("infusion");

var hortis = fluid.registerNamespace("hortis");

// TODO: grab this from the fusion's input map
hortis.stableDatasetIds = {
    iNat: true,
    CMN: true,
    RBCM: true
};

// Also in leafletMap.js
hortis.datasetIdFromObs = function (obsId) {
    var colpos = obsId.indexOf(":");
    return obsId.substring(0, colpos);
};

hortis.equalCoordinate = function (a, b) {
    // 6 decimals is a common standard - about 10cm accuracy, e.g. RBCM truncated to this
    return Math.abs(a - b) < 1e-6;
}

hortis.equalCoordinates = function (lat1, long1, lat2, long2) {
    return hortis.equalCoordinate(lat1, lat2) && hortis.equalCoordinate(long1, long2);
};

hortis.matchOnePatchRow = function (patchRow, obsRow) {
    var score = 0;
    if (patchRow.id === obsRow.observationId) {
        var dataset = hortis.datasetIdFromObs(patchRow.id);
        score += hortis.stableDatasetIds[dataset] ? 1 : 0.5;
    }
    if (hortis.equalCoordinates(patchRow.latitude, patchRow.longitude, obsRow.latitude, obsRow.longitude)) {
        score += 1;
    }
    if (patchRow.iNaturalistTaxonName === obsRow.iNaturalistTaxonName) {
        score += 1;
    }
    return score;
};

hortis.dumpPatchRow = function (patchRow, loc) {
    return Object.values(patchRow).join(", ") + loc;
};

hortis.dumpObsMatch = function (match) {
    var obs = match.obsRow;
    return "obs of " + obs.iNaturalistTaxonName + " with coordinates " + JSON.stringify(obs.latitude) + ", " + JSON.stringify(obs.longitude) +
        " with id " + obs.observationId + " at index " + match.obsIndex;
};

/** Returns one match or null, plus some side-effects
 * @param {Object} patchRow - One row of the patch file
 * @param {ObsRow[]} obsRows - All observation rows
 * @param {String} loc - A diagnostic string indicating the location of the `patchRow`
 * @return {ObsRow|Null} The best matching observation row, or null
 */
hortis.matchCoordinatePatch = function (patchRow, obsRows, loc) {
    var matches = [];
    obsRows.forEach(function (obsRow, obsIndex) {
        var score = hortis.matchOnePatchRow(patchRow, obsRow);
        if (score > 0) {
            matches.push({
                score: score,
                obsRow: obsRow,
                obsIndex: obsIndex
            });
        }
    });
    var diag = "Warning: patch " + hortis.dumpPatchRow(patchRow, loc);
    if (matches.length === 0) {
        console.log(diag + " failed to match in any coordinate");
        return null;
    } else {
        matches.sort(function (a, b) {
            return b.score - a.score;
        });
        var topScore = matches[0].score;
        var topScoring = matches.filter(function (match) {
            return match.score === topScore;
        });
        if (topScoring.length > 1) {
            console.log(diag + " matched " + topScoring.length + " rows equally well: these were: "
                + topScoring.map(hortis.dumpObsMatch).join("\n"));
        } else if (topScore < 2.5) {
            console.log(diag + " matched " + hortis.dumpObsMatch(topScoring[0]) + " with reduced accuracy of " + topScore);
            var obsRow = topScoring[0].obsRow;
            console.log(hortis.equalCoordinates(patchRow.latitude, patchRow.longitude, obsRow.latitude, obsRow.longitude));
        }
        return topScoring[0].obsRow;
    }
};

hortis.coordinatesOutMap = {
    columns: {
        cooordinatesCorrected: "Coordinates Corrected",
        coordinatesCorrectedNote: "Coordinates Corrected Note"
    }
};

hortis.parseToNumber = function (row, field) {
    var parsed = hortis.parseFloat(row[field]);
    row[field] = parsed;
};

hortis.patchNumberFields = ["latitude", "longitude", "latitudeOut", "longitudeOut"];

/**
 * Resolve a coordinate patch file against the observation list
 * @param {Object} resolved - Resolved observations containing members obsOutMap and obsRows which will be modified
 * @param {PatchFile} patch - The loaded patch structure
 * @param {String} key - Key of the patch
 */
hortis.processCoordinatePatch = function (resolved, patch, key) {

    patch.patchData.rows.forEach(function (patchRow, index) {
        var loc = " at row " + index + " of patch " + key;
        hortis.patchNumberFields.forEach(function (field) {
            hortis.parseToNumber(patchRow, field);
        });
        var match = hortis.matchCoordinatePatch(patchRow, resolved.obsRows, loc);

        var expectCoordinates = function (testEqual) {
            var equal = hortis.equalCoordinates(match.latitude, match.longitude, patchRow.latitudeOut, patchRow.longitudeOut);
            if (equal !== testEqual) {
                console.log("Error: Coordinate corrected value for patch " + hortis.dumpPatchRow(patchRow, loc) + " does not conform with original coordinates "
                    + match.latitude + ", " + match.longitude + " since value of \"Corrected\" is " + patchRow.corrected);
            }
        };

        if (match) {
            if (patchRow.corrected === "yes") {
                expectCoordinates(false);
                match.cooordinatesCorrected = "yes";
            } else if (patchRow.corrected === "no") {
                expectCoordinates(true);
                match.cooordinatesCorrected = "no";
            } else {
                console.log("Unexpected \"Corrected\" value " + patchRow.corrected + " for patch " + hortis.dumpPatchRow(patchRow, loc));
            }
            match.latitude = patchRow.latitudeOut;
            match.longitude = patchRow.longitudeOut;
            match.coordinatesCorrectedNote = match.correction;
        }
    });
    resolved.combinedObsOutMap = hortis.combineMaps(resolved.combinedObsOutMap, hortis.coordinatesOutMap);
};
