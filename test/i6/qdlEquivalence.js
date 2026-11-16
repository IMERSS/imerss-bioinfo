/* eslint-env node */
"use strict";

// Test that queries of the query description language, run by src/client/js/i6/qdl.js over a columnar data package,
// give the same results as the computations over row objects which they replace - the filters, the map's grid, the
// taxa of a selection and the plant-pollinator interactions - each of which is rewritten here as it was before the
// port, over the compatibility rows of the same package. Run from this checkout with
//     node test/i6/qdlEquivalence.js [<package.viz> ...]
// which by default tests the packages of the Oregon and Washington Bee Atlases and of the Galiano BioBlitz

const fs = require("fs");

const viz = require("../../src/client/js/i6/vizPackage.js"),
    qdl = require("../../src/client/js/i6/qdl.js");

const defaultPackages = [
    "data/b-team/plant-pollinators-OBA-2025.viz",
    "data/b-team/plant-pollinators-WaBA-2026.viz",
    "data/Galiano 2023 BioBlitz/Galiano_Island_vascular_plant_records_consolidated-prepared.viz"
];

const failures = [];
const expectEqual = function (name, got, want) {
    const gotText = JSON.stringify(got), wantText = JSON.stringify(want);
    if (gotText === wantText) {
        console.log("  PASS " + name);
    } else {
        failures.push(name + ": got " + gotText.substring(0, 300) + "\n    wanted " + wantText.substring(0, 300));
        console.log("  FAIL " + name);
    }
};

const timed = function (func) {
    const now = Date.now();
    const result = func();
    return {result, time: Date.now() - now};
};

// The old computations, as they were in imerss-core.js, libreMap.js and the filters' Single File Components

const rowPoint = function (row) {
    const lat = row.decimalLatitude, long = row.decimalLongitude;
    const latNum = lat === "" || lat === undefined ? NaN : +lat, longNum = long === "" || long === undefined ? NaN : +long;
    return Number.isFinite(latNum) && Number.isFinite(longNum) && !(latNum === 0 && longNum === 0) ? [longNum, latNum] : null;
};

const oldGrid = function (rows, latRes, longRes, taxonField) {
    const buckets = {};
    rows.forEach(row => {
        const point = rowPoint(row);
        if (point) {
            const cellId = Math.floor(point[1] / latRes) + "|" + Math.floor(point[0] / longRes);
            const bucket = buckets[cellId] || (buckets[cellId] = {obsCount: 0, taxa: new Set()});
            bucket.obsCount++;
            bucket.taxa.add(row[taxonField]);
        }
    });
    return Object.keys(buckets).sort().map(key => [key, buckets[key].obsCount, buckets[key].taxa.size]);
};

const newGrid = function (pkg, base, metres, taxonField) {
    const query = {
        ...base,
        let: {cell: {snapToGrid: ["decimalLongitude", "decimalLatitude"], metres, baseLatitude: 49}},
        groupBy: ["cell"],
        measures: {records: {count: true}, taxa: {countDistinct: taxonField}}
    };
    const result = qdl.execute(pkg, query);
    const togo = [];
    for (let g = 0; g < result.groups; ++g) {
        const [latIndex, longIndex] = qdl.cellIndices(result.keys.cell[g]);
        togo.push([latIndex + "|" + longIndex, result.measures.records[g], result.measures.taxa[g]]);
    }
    return togo.sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
};

const run = async function () {
    const args = process.argv.slice(2);
    const packages = args.length > 0 ? args : defaultPackages;
    for (const file of packages) {
        console.log(file);
        const pkg = await viz.read(fs.readFileSync(file));
        const obs = pkg.tables.obs;
        const {result: rows, time: rowsTime} = timed(() => viz.toRows(obs));
        console.log("  " + obs.rowCount + " rows, materialised in " + rowsTime + " ms");
        const isBee = obs.fields.includes("plantINatId");
        const taxonField = isBee ? "pollinatorINatId" : "iNaturalistTaxonId";
        const base = {from: "obs"};

        // The grid, at the resolutions of the visualisations
        const {latRes, longRes} = qdl.gridResolution({metres: 1000, baseLatitude: 49});
        const oldG = timed(() => oldGrid(rows, latRes, longRes, taxonField));
        const newG = timed(() => newGrid(pkg, base, 1000, taxonField));
        expectEqual("grid of 1 km - " + oldG.result.length + " cells, " + oldG.time + " ms by rows, " + newG.time + " ms by query", newG.result, oldG.result);

        // The taxa of all records - hortis.taxaFromObs before closing them upwards
        const oldTaxa = [...new Set(rows.map(row => row[taxonField]).filter(id => id !== ""))].map(Number).sort((a, b) => a - b);
        const newTaxa = Array.from(qdl.execute(pkg, {...base, measures: {taxa: {distinct: taxonField}}}).taxa).sort((a, b) => a - b);
        expectEqual("distinct taxa - " + oldTaxa.length, newTaxa, oldTaxa);

        // The collector filter
        const someone = rows.find(row => row.recordedBy)?.recordedBy.split(";")[0].trim();
        if (someone) {
            const oldCount = rows.filter(row => (row.recordedBy || "").includes(someone)).length;
            const newCount = qdl.execute(pkg, {...base, where: [{field: "recordedBy", op: "contains", value: someone}]}).count;
            // The old filter was case-sensitive, the new is not, so they agree for a name which differs from no other only in case
            expectEqual("collector filter, " + someone + " - " + oldCount, newCount, oldCount);
        }

        // A region filter, on the first region field of the indirection
        const regions = viz.toRows(pkg.tables.regionIndirection);
        if (regions.length > 0) {
            const region = regions[0];
            const oldCount = rows.filter(row => row[region.regionField] === region.id).length;
            const newCount = qdl.execute(pkg, {...base, where: [{field: region.regionField, op: "in", value: [Number(region.id)]}]}).count;
            expectEqual("region filter, " + region.regionField + " = " + region.label + " - " + oldCount, newCount, oldCount);
        }

        // The taxon search filter, for the taxon with most records beneath it
        const taxa = viz.toRows(pkg.tables.taxa);
        const byId = new Map(taxa.map(row => [row.id, row]));
        // The family of the taxon of the first record which has one
        let someTaxon = byId.get(rows.find(row => byId.has(row[taxonField]))[taxonField]);
        while (someTaxon.rank !== "family" && byId.get(someTaxon.parentId)) {
            someTaxon = byId.get(someTaxon.parentId);
        }
        const isBeneath = function (id) {
            let row = byId.get(id);
            while (row && row.id !== someTaxon.id) {
                row = byId.get(row.parentId);
            }
            return !!row;
        };
        const oldWithin = rows.filter(row => isBeneath(row[taxonField])).length;
        const newWithin = qdl.execute(pkg, {...base, where: [{field: taxonField, op: "within", taxa: [someTaxon.id]}]}).count;
        expectEqual("taxon search filter, " + someTaxon.iNaturalistTaxonName + " - " + oldWithin, newWithin, oldWithin);

        // The phenology filter, by months, and by days
        const months = [3, 4];
        const oldMonths = rows.filter(row => months.includes(new Date(row.eventDate.substring(0, 10)).getUTCMonth())).length;
        const newMonths = qdl.execute(pkg, {...base, where: [{field: "eventDate", op: "monthIn", value: months.map(month => month + 1)}]}).count;
        expectEqual("phenology filter, April and May - " + oldMonths, newMonths, oldMonths);
        const toDay = function (eventDate) {
            const millis = Date.parse(eventDate.substring(0, 10));
            const date = new Date(millis);
            return isNaN(millis) ? NaN : (Date.UTC(2000, date.getUTCMonth(), date.getUTCDate()) - Date.UTC(2000, 0, 1)) / 86400000;
        };
        const oldDays = rows.filter(row => {
            const day = toDay(row.eventDate);
            return day >= 100 && day <= 160;
        }).length;
        const newDays = qdl.execute(pkg, {...base, where: [{field: "eventDate", op: "dayOfYearBetween", value: [100, 160]}]}).count;
        expectEqual("phenology filter, days 100 to 160 - " + oldDays, newDays, oldDays);

        // The elevation filter
        if (obs.fields.includes("verbatimElevation")) {
            const oldElev = rows.filter(row => {
                const elevation = isNaN(row.verbatimElevation) ? NaN : parseFloat(row.verbatimElevation);
                return elevation >= 100 && elevation <= 500;
            }).length;
            const newElev = qdl.execute(pkg, {...base, where: [{field: "verbatimElevation", op: "between", value: [100, 500]}]}).count;
            expectEqual("elevation filter, 100 to 500 - " + oldElev, newElev, oldElev);
            const range = qdl.execute(pkg, {...base, measures: {lower: {min: "verbatimElevation"}, upper: {max: "verbatimElevation"}}});
            const elevations = rows.map(row => isNaN(row.verbatimElevation) ? NaN : parseFloat(row.verbatimElevation)).filter(e => !isNaN(e));
            expectEqual("elevation range", [range.lower, range.upper], [elevations.reduce((a, b) => Math.min(a, b)), elevations.reduce((a, b) => Math.max(a, b))]);
        }

        // The sex filter
        if (obs.fields.includes("sex")) {
            const oldSex = rows.filter(row => row.sex === "F").length;
            const newSex = qdl.execute(pkg, {...base, where: [{field: "sex", op: "in", value: ["F"]}]}).count;
            expectEqual("sex filter, female - " + oldSex, newSex, oldSex);
        }

        // Filters combined, and the viewport
        const box = [[-124, 44], [-122, 46]];
        const oldBox = rows.filter(row => {
            const point = rowPoint(row);
            return point && point[0] >= box[0][0] && point[0] <= box[1][0] && point[1] >= box[0][1] && point[1] <= box[1][1]
                && new Date(row.eventDate.substring(0, 10)).getUTCMonth() === 4;
        }).length;
        const newBox = qdl.execute(pkg, {...base, where: [{field: ["decimalLongitude", "decimalLatitude"], op: "inBox", value: box},
            {field: "eventDate", op: "monthIn", value: [5]}]}).count;
        expectEqual("viewport and May - " + oldBox, newBox, oldBox);

        // The plant-pollinator cross table, unfiltered
        if (isBee) {
            const oldCross = {};
            rows.forEach(row => {
                const key = row.plantINatId + "|" + row.pollinatorINatId;
                oldCross[key] = (oldCross[key] || 0) + 1;
            });
            const crossTime = timed(() => qdl.execute(pkg, {...base, groupBy: ["plantINatId", "pollinatorINatId"], measures: {count: {count: true}}}));
            const cross = crossTime.result;
            const newCross = {};
            for (let g = 0; g < cross.groups; ++g) {
                newCross[cross.keys.plantINatId[g] + "|" + cross.keys.pollinatorINatId[g]] = cross.measures.count[g];
            }
            const sortedEntries = hash => Object.entries(hash).filter(([key]) => !key.split("|").includes("")).sort();
            expectEqual("cross table - " + Object.keys(oldCross).length + " pairs, " + crossTime.time + " ms", sortedEntries(newCross), sortedEntries(oldCross));
        }

        // Rows read back by id
        const ids = qdl.execute(pkg, {...base, where: [{field: "eventDate", op: "monthIn", value: [6]}], select: {rows: true, limit: 5}}).rows;
        expectEqual("rows by id", qdl.rowObjects(obs, ids).map(row => ({...row})), Array.from(ids, i => rows[i]));
    }
    if (failures.length === 0) {
        console.log("All queries agree with the computations over rows");
    } else {
        console.log(failures.join("\n"));
        process.exitCode = 1;
    }
};

run();
