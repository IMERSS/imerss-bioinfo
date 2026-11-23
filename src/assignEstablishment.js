/* eslint-env node */
"use strict";

// Assign to the plant taxa of a taxa table, as written by assignBNames.js, iNaturalist's establishment means - native,
// introduced or endemic - within each of a set of places, e.g. the states of a combined atlas. Each taxon's means in a
// place is read from iNaturalist's taxa API, which, given a preferred_place_id, reports the taxon's listing in that
// place's checklist, many taxa at once - e.g.
//     https://api.inaturalist.org/v1/taxa?id=53387,57983&preferred_place_id=46
// A taxon which the place's checklist does not list is reported with no means, and is written with none.
//
// Each response is cached, one row for each taxon and place, in the table iNatEstablishment of the SQLite cache of
// iNaturalist's taxa which assignBNames.js uses, so that a taxon already looked up is not looked up again. Requests are
// made no more than once each 2 seconds, as are those of assignBNames.js - see hortis.iNatAPILimiter in
// src/iNaturalist/taxonAPI.js.
//
// Run from the root of this checkout, as is assignBNames.js, so that the cache is found, as
//     node src/assignEstablishment.js <taxa.csv> [--places OR=10,WA=46,ID=22,BC=7085] [--root 47126] [-o <out.csv>]
//         [--refresh]
// which writes beside <taxa.csv>, by default, <trunk>-establishment.csv, with columns id, iNaturalistTaxonName and,
// for each place, establishment<code>, e.g. establishmentOR - one row for each taxon descended from --root, by default
// Plantae. --refresh looks up again every taxon, even those cached.

const fs = require("fs"),
    path = require("path"),
    minimist = require("minimist"),
    Papa = require("papaparse"),
    sqlite = require("sqlite"),
    sqlite3 = require("sqlite3");

const establishment = {};

// The cache shared with assignBNames.js - see hortis.iNatTaxonAPI.dbTaxonAPIs in src/iNaturalist/taxonAPI.js
establishment.dbFile = "data/iNaturalist/taxa.db/taxa.sqlite3";
establishment.createString = "CREATE TABLE IF NOT EXISTS iNatEstablishment (taxon_id INTEGER, place_id INTEGER, fetched_at TEXT, " +
    "establishment_means TEXT, doc TEXT, PRIMARY KEY (taxon_id, place_id))";

establishment.apiBase = "https://api.inaturalist.org/v1/taxa";
// The number of taxa looked up in one request - each id adds to the URL, which should stay well within its limit
establishment.batchSize = 30;
// The least interval between requests, in milliseconds, as that of hortis.iNatAPILimiter
establishment.rateLimit = 2000;
establishment.userAgent = "imerss-bioinfo assignEstablishment.js";

establishment.defaultPlaces = "OR=10,WA=46,ID=22,BC=7085";

/**
 * Parse the places to be looked up.
 * @param {String} text - The places, as comma-separated pairs of code and iNaturalist place id, e.g. "OR=10,WA=46"
 * @return {Object[]} The places, each with members `code` and `placeId`
 */
establishment.parsePlaces = function (text) {
    return text.split(",").map(function (pair) {
        const [code, placeId] = pair.split("=");
        if (!code || !/^[0-9]+$/.test(placeId || "")) {
            throw new Error("Cannot parse place " + JSON.stringify(pair) + " - expected e.g. OR=10");
        }
        return {code, placeId: Number(placeId)};
    });
};

/**
 * Find the ids of the taxa of a taxa table descended from a root taxon, by following their `parentId`s.
 * @param {Object[]} rows - The rows of the taxa table, each with members `id` and `parentId`
 * @param {String} rootId - The id of the root taxon
 * @return {Object[]} The rows descended from the root, including any row of the root itself
 */
establishment.descendants = function (rows, rootId) {
    const byId = new Map(rows.map(row => [row.id, row]));
    const memo = new Map();
    const isDescendant = function (id) {
        let togo = memo.get(id);
        if (togo === undefined) {
            const row = byId.get(id);
            memo.set(id, false); // Guard against any cycle
            togo = id === rootId ? true : (row && row.parentId ? isDescendant(row.parentId) : false);
            memo.set(id, togo);
        }
        return togo;
    };
    return rows.filter(row => isDescendant(row.id));
};

/**
 * Wait for an interval.
 * @param {Number} ms - The interval, in milliseconds
 * @return {Promise} A promise which resolves once it has passed
 */
establishment.delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// The time at which the last request was made, so that requests are spaced by establishment.rateLimit
establishment.lastRequest = 0;

/**
 * Look up the establishment means of a batch of taxa in one place.
 * @param {Number[]} ids - The ids of the taxa
 * @param {Number} placeId - The id of the place
 * @return {Promise<Map<Number, Object|null>>} A promise for a map of each taxon's id to the `establishment_means` record
 * reported for it - with members `establishment_means` and `place` - or `null` if it has none in the place
 */
establishment.fetchBatch = async function (ids, placeId) {
    const wait = establishment.lastRequest + establishment.rateLimit - Date.now();
    if (wait > 0) {
        await establishment.delay(wait);
    }
    const url = establishment.apiBase + "?id=" + ids.join(",") + "&preferred_place_id=" + placeId + "&per_page=" + ids.length;
    console.log("GET " + url);
    establishment.lastRequest = Date.now();
    const response = await fetch(url, {headers: {"User-Agent": establishment.userAgent, "Accept": "application/json"}});
    if (!response.ok) {
        throw new Error("Request " + url + " failed with status " + response.status);
    }
    const body = await response.json();
    const togo = new Map(ids.map(id => [id, null]));
    body.results.forEach(function (result) {
        if (togo.has(result.id)) {
            togo.set(result.id, result.establishment_means || null);
        }
    });
    return togo;
};

/**
 * Assign the establishment means of each plant of a taxa table in each place, from the cache or else from
 * iNaturalist, caching each response.
 * @param {Object} options - Members `input`, the taxa table, `output`, the CSV file to be written, `places`, as parsed
 * by establishment.parsePlaces, `rootId`, the taxon whose descendants are looked up, and `refresh`, `true` if cached
 * responses are not to be used
 * @return {Promise<Object>} A promise for members `rows`, the rows written, and `fetched`, the number of lookups made
 */
establishment.assign = async function (options) {
    const parsed = Papa.parse(fs.readFileSync(options.input, "utf8"), {header: true, skipEmptyLines: true});
    const plants = establishment.descendants(parsed.data, options.rootId);
    console.log("Found " + plants.length + " taxa descended from " + options.rootId + " of " + parsed.data.length + " in " + options.input);
    fs.mkdirSync(path.dirname(establishment.dbFile), {recursive: true});
    const db = await sqlite.open({filename: establishment.dbFile, driver: sqlite3.Database});
    await db.exec(establishment.createString);
    let fetched = 0;
    const meansByPlace = {};
    for (const place of options.places) {
        const means = new Map();
        const toFetch = [];
        for (const plant of plants) {
            const cached = options.refresh ? undefined :
                await db.get("SELECT establishment_means FROM iNatEstablishment WHERE taxon_id = ? AND place_id = ?", Number(plant.id), place.placeId);
            if (cached) {
                means.set(Number(plant.id), cached.establishment_means);
            } else {
                toFetch.push(Number(plant.id));
            }
        }
        console.log(place.code + " (place " + place.placeId + "): " + means.size + " taxa cached, " + toFetch.length + " to look up");
        for (let i = 0; i < toFetch.length; i += establishment.batchSize) {
            const batch = toFetch.slice(i, i + establishment.batchSize);
            const results = await establishment.fetchBatch(batch, place.placeId);
            const fetchedAt = new Date().toISOString();
            await db.exec("BEGIN");
            for (const [id, record] of results) {
                // Stored as "" for a taxon the place does not list, so that the lookup is not made again
                const value = record ? record.establishment_means || "" : "";
                await db.run("INSERT OR REPLACE INTO iNatEstablishment (taxon_id, place_id, fetched_at, establishment_means, doc) VALUES (?, ?, ?, ?, ?)",
                    id, place.placeId, fetchedAt, value, JSON.stringify(record));
                means.set(id, value);
            }
            await db.exec("COMMIT");
            fetched += batch.length;
        }
        meansByPlace[place.code] = means;
    }
    await db.close();
    const rows = plants.map(function (plant) {
        const row = {id: plant.id, iNaturalistTaxonName: plant.iNaturalistTaxonName};
        options.places.forEach(function (place) {
            row["establishment" + place.code] = meansByPlace[place.code].get(Number(plant.id)) || "";
        });
        return row;
    });
    fs.writeFileSync(options.output, Papa.unparse(rows, {newline: "\n"}) + "\n", "utf8");
    return {rows, fetched};
};

/**
 * Summarise the means assigned in each place, for logging.
 * @param {Object[]} rows - The rows written
 * @param {Object[]} places - The places
 * @return {String} The summary
 */
establishment.summarise = function (rows, places) {
    return places.map(function (place) {
        const counts = {};
        rows.forEach(function (row) {
            const value = row["establishment" + place.code] || "(none)";
            counts[value] = (counts[value] || 0) + 1;
        });
        return "  " + place.code + ": " + JSON.stringify(counts);
    }).join("\n");
};

if (require.main === module) {
    const args = minimist(process.argv.slice(2), {string: ["places", "root", "o"], boolean: ["refresh"]});
    const input = args._[0];
    if (!input) {
        console.log("Usage: node src/assignEstablishment.js <taxa.csv> [--places OR=10,WA=46,ID=22,BC=7085] [--root 47126] [-o <out.csv>] [--refresh]");
        process.exitCode = 1;
    } else {
        const places = establishment.parsePlaces(args.places || establishment.defaultPlaces);
        // e.g. plant-pollinators-Atlas-assigned-taxa.csv -> plant-pollinators-Atlas-establishment.csv
        const output = args.o || input.replace(/(-assigned)?-taxa\.csv$|\.csv$/, "") + "-establishment.csv";
        const start = Date.now();
        establishment.assign({input, output, places, rootId: args.root || "47126", refresh: args.refresh}).then(function (result) {
            console.log("Written " + result.rows.length + " taxa to " + output + " after " + result.fetched + " lookups in " +
                Math.round((Date.now() - start) / 1000) + " s\n" + establishment.summarise(result.rows, places));
        }, function (error) {
            console.log("Error assigning establishment means: ", error);
            process.exitCode = 1;
        });
    }
}

module.exports = establishment;
