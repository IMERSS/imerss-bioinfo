/*
Copyright 2026 Antranig Basman
Licensed under the Educational Community License (ECL), Version 2.0 or the New
BSD license. You may not use this file except in compliance with one these
Licenses.
You may obtain a copy of the ECL 2.0 License and BSD License at
https://github.com/fluid-project/infusion/raw/master/Infusion-LICENSE.txt
*/

/* global require, module, globalThis */

"use strict";

// The executor of the query description language, answering queries over the tables of a columnar data package in
// one pass over the columns each reads - see notes/query-description-language.md. Like vizPackage.js, it has no
// dependency on Infusion, so that a page, a Web Worker and node load it alike - in node, by require, which returns
// `hortis.qdl`.

(function (root) {

    const viz = root.hortis?.viz || require("./vizPackage.js");
    const qdl = {};

    // The columns computed for each table, by the canonical text of the expression computing them
    qdl.derivedCache = new WeakMap();
    // The indexes built over each package, e.g. of its taxonomy
    qdl.indexCache = new WeakMap();

    /**
     * Convert a day in ISO 8601's form to the number of days since the Unix epoch, the value of a `date32` column.
     * @param {String} day - The day, e.g. "2020-01-01"
     * @return {Number} The number of days, e.g. 18262
     */
    qdl.day = day => Date.UTC(Number(day.substring(0, 4)), Number(day.substring(5, 7)) - 1, Number(day.substring(8, 10))) / 86400000;

    /**
     * Write a query in its canonical form - the members of every object sorted, so that two queries meaning the same
     * are equal as text.
     * @param {any} query - The query, or any part of it
     * @return {String} The canonical text
     */
    qdl.canonical = function (query) {
        let togo;
        if (Array.isArray(query)) {
            togo = "[" + query.map(qdl.canonical).join(",") + "]";
        } else if (query && typeof(query) === "object") {
            togo = "{" + Object.keys(query).filter(key => query[key] !== undefined).sort()
                .map(key => JSON.stringify(key) + ":" + qdl.canonical(query[key])).join(",") + "}";
        } else {
            togo = JSON.stringify(query);
        }
        return togo;
    };

    /**
     * Hash a query together with the hash of the table it queries, so that a result cached for it is found only for
     * the same query over the same data - by FNV-1a, which needs no library and suffices for a key of a cache.
     * @param {Object} query - The query
     * @param {VizPackage} pkg - The package it queries
     * @return {String} The hash, as 8 hexadecimal digits followed by the table's own hash
     */
    qdl.hash = function (query, pkg) {
        const text = qdl.canonical(query);
        let hash = 0x811c9dc5;
        for (let i = 0; i < text.length; ++i) {
            hash ^= text.charCodeAt(i);
            hash = Math.imul(hash, 0x01000193) >>> 0;
        }
        return hash.toString(16).padStart(8, "0") + "-" + (pkg.tables[query.from]?.hash || "");
    };

    /** Columns **/

    /**
     * A column as the executor reads it - one of two kinds, numeric or coded:
     * @typedef {Object} QdlColumn
     * @property {String} kind - "numeric", whose `values` are Numbers, or "coded", whose `codes` index `dictionary`
     * @property {TypedArray} [values] - The values of a numeric column, scaled by `divisor`, `nullValue` being empty
     * @property {Number} [divisor] - The divisor of its values, so that a row's value is `values[i] / divisor`
     * @property {Number} [nullValue] - The value standing for an empty value, which may be NaN
     * @property {TypedArray} [codes] - The codes of a coded column
     * @property {String[]} [dictionary] - Its dictionary, "" being empty
     * @property {Function} [getString] - For a column of neither kind, read a row's text
     */

    /**
     * Read a column of a package's table as the executor does.
     * @param {VizColumn} column - The package's column
     * @return {QdlColumn} The column as the executor reads it
     */
    qdl.readColumn = function (column) {
        let togo;
        const encoding = column.encoding;
        if (encoding === "int") {
            togo = {kind: "numeric", values: column.values, divisor: 1, nullValue: column.nullValue};
        } else if (encoding === "decimal") {
            togo = {kind: "numeric", values: column.values, divisor: Math.pow(10, column.scale), nullValue: column.nullValue};
        } else if (encoding === "float") {
            togo = {kind: "numeric", values: column.values, divisor: 1, nullValue: NaN};
        } else if (encoding === "date32") {
            togo = {kind: "numeric", values: column.days, divisor: 1, nullValue: column.nullValue};
        } else if (encoding === "dict") {
            togo = {kind: "coded", codes: column.codes, dictionary: column.dictionary};
        } else if (encoding === "empty") {
            togo = {kind: "coded", codes: new Uint8Array(column.rows), dictionary: [""]};
        } else {
            togo = {kind: "text", getString: column.getString, rows: column.rows};
        }
        return togo;
    };

    /**
     * Find, or compute and keep, a derived column of a table.
     * @param {VizTable} table - The table
     * @param {String} key - The key of the derived column, e.g. the canonical text of its expression
     * @param {Function} compute - Computes the column if it has not been
     * @return {QdlColumn} The column
     */
    qdl.derived = function (table, key, compute) {
        let cache = qdl.derivedCache.get(table);
        if (!cache) {
            cache = new Map();
            qdl.derivedCache.set(table, cache);
        }
        let togo = cache.get(key);
        if (!togo) {
            togo = compute();
            cache.set(key, togo);
        }
        return togo;
    };

    /**
     * Read a column of Numbers, as Float64 values with NaN for empty, of any column whose values are numbers.
     * @param {VizTable} table - The table
     * @param {String} field - The field
     * @return {Float64Array} Its values
     */
    qdl.float64 = (table, field) => qdl.derived(table, "float64:" + field, () => ({kind: "numeric", values: viz.toFloat64(qdl.tableColumn(table, field)), divisor: 1, nullValue: NaN})).values;

    /**
     * Find a field's column in a table, or fail.
     * @param {VizTable} table - The table
     * @param {String} field - The field
     * @return {VizColumn} The column
     */
    qdl.tableColumn = function (table, field) {
        const column = table.columns[field];
        if (!column) {
            throw new Error("Table " + table.name + " has no field " + field);
        }
        return column;
    };

    /**
     * Resolve a field or expression of a query to a column, computing an expression's column on first use.
     * @param {VizPackage} pkg - The package
     * @param {VizTable} table - The table queried
     * @param {String|Object} field - A field's name, a name of the query's `let`, or an expression
     * @param {Object} lets - The query's `let`
     * @return {QdlColumn} The column
     */
    qdl.resolve = function (pkg, table, field, lets) {
        let togo;
        if (typeof(field) === "string") {
            togo = lets && lets[field] ? qdl.resolve(pkg, table, lets[field], null) : qdl.readColumn(qdl.tableColumn(table, field));
        } else if (field.field) {
            togo = qdl.resolve(pkg, table, field.field, lets);
        } else {
            const key = qdl.canonical(field);
            togo = qdl.derived(table, key, () => qdl.computeExpression(pkg, table, field));
        }
        return togo;
    };

    /**
     * Compute the column of an expression - see "Expressions" in notes/query-description-language.md.
     * @param {VizPackage} pkg - The package
     * @param {VizTable} table - The table
     * @param {Object} expr - The expression
     * @return {QdlColumn} Its column
     */
    qdl.computeExpression = function (pkg, table, expr) {
        let togo;
        const rows = table.rowCount;
        if (expr.year || expr.month || expr.dayOfYear) {
            const days = qdl.readColumn(qdl.tableColumn(table, expr.year || expr.month || expr.dayOfYear));
            const values = new Int16Array(rows);
            const part = expr.year ? "year" : expr.month ? "month" : "dayOfYear";
            for (let i = 0; i < rows; ++i) {
                values[i] = days.values[i] === days.nullValue ? -1 : qdl.dateParts[part](days.values[i]);
            }
            togo = {kind: "numeric", values, divisor: 1, nullValue: -1};
        } else if (expr.number) {
            // The field's values read as Numbers, whatever its encoding - NaN for one which is not a number
            togo = {kind: "numeric", values: qdl.float64(table, expr.number), divisor: 1, nullValue: NaN};
        } else if (expr.snapToGrid) {
            const cells = qdl.gridCells(table, expr);
            togo = {kind: "numeric", values: cells, divisor: 1, nullValue: NaN};
        } else if (expr.lookup) {
            togo = qdl.lookupColumn(pkg, table, expr);
        } else if (expr.ancestorAtRank) {
            const taxonomy = qdl.taxonomy(pkg);
            const ids = qdl.float64(table, expr.ancestorAtRank);
            const values = new Float64Array(rows);
            for (let i = 0; i < rows; ++i) {
                values[i] = isNaN(ids[i]) ? NaN : taxonomy.ancestorAtRank(ids[i], expr.rank);
            }
            togo = {kind: "numeric", values, divisor: 1, nullValue: NaN};
        } else {
            throw new Error("Unknown expression " + qdl.canonical(expr));
        }
        return togo;
    };

    // Each part of a day, as days since the Unix epoch
    qdl.dateParts = {
        year: day => new Date(day * 86400000).getUTCFullYear(),
        month: day => new Date(day * 86400000).getUTCMonth() + 1,
        // The day's place in a leap year, from 0 for 1 January, so that a month and day have the same number in every
        // year - 1 March is always 60 - as the phenology filter counts them
        dayOfYear: function (day) {
            const date = new Date(day * 86400000);
            return (Date.UTC(2000, date.getUTCMonth(), date.getUTCDate()) - Date.UTC(2000, 0, 1)) / 86400000;
        }
    };

    /** The grid **/

    /**
     * The resolution of a grid in degrees of latitude and longitude, as hortis.obsQuantiser computes it - a cell is
     * `metres` across in longitude at `baseLatitude`, and as many degrees of latitude as make it square there.
     * @param {Object} expr - The grid's `snapToGrid` expression, with members `metres` and `baseLatitude`
     * @return {Object} Members `latRes` and `longRes`, in degrees
     */
    qdl.gridResolution = function (expr) {
        const a = 6378137, b = 6356752.3142, e2 = (a * a - b * b) / (a * a);
        const latrad = Math.PI * expr.baseLatitude / 180, sinrad = Math.sin(latrad);
        const longLength = Math.PI * a * Math.cos(latrad) / (180 * Math.sqrt(1 - e2 * sinrad * sinrad));
        const latLength = Math.PI * a * (1 - e2) / (180 * Math.pow(1 - e2 * sinrad * sinrad, 1.5));
        const longRes = expr.metres / longLength;
        return {longRes, latRes: longRes * longLength / latLength};
    };

    // The cell number of a grid's cell packs its indices of latitude and longitude, each floor(coordinate / resolution),
    // into one exact Float64 - the longitude's index offset so that it is never negative
    qdl.CELL_SHIFT = 1 << 24;
    qdl.CELL_OFFSET = 1 << 23;

    /**
     * Pack a cell's indices into its number.
     * @param {Number} latIndex - Its index of latitude
     * @param {Number} longIndex - Its index of longitude
     * @return {Number} The cell's number
     */
    qdl.cellNumber = (latIndex, longIndex) => latIndex * qdl.CELL_SHIFT + longIndex + qdl.CELL_OFFSET;

    /**
     * Unpack a cell's number into its indices.
     * @param {Number} cell - The cell's number
     * @return {Number[]} Its indices of latitude and longitude
     */
    qdl.cellIndices = function (cell) {
        const latIndex = Math.floor(cell / qdl.CELL_SHIFT);
        return [latIndex, cell - latIndex * qdl.CELL_SHIFT - qdl.CELL_OFFSET];
    };

    /**
     * Compute the cell of each row's point, as hortis.obsQuantiser.coordToCellId did.
     * @param {VizTable} table - The table
     * @param {Object} expr - The `snapToGrid` expression
     * @return {Float64Array} The cell number of each row, or NaN if it has no position
     */
    qdl.gridCells = function (table, expr) {
        const [lngField, latField] = expr.snapToGrid;
        const lngs = qdl.float64(table, lngField), lats = qdl.float64(table, latField);
        const {latRes, longRes} = qdl.gridResolution(expr);
        const cells = new Float64Array(table.rowCount);
        for (let i = 0; i < cells.length; ++i) {
            cells[i] = qdl.hasPoint(lngs[i], lats[i]) ? qdl.cellNumber(Math.floor(lats[i] / latRes), Math.floor(lngs[i] / longRes)) : NaN;
        }
        return cells;
    };

    /**
     * Determine whether a row has a position. As hortis.rowPoint, a coordinate which is empty or not a number is no
     * position, and nor is the point at 0, 0, which is a common placeholder for one.
     * @param {Number} lng - Its longitude
     * @param {Number} lat - Its latitude
     * @return {Boolean} `true` if it has a position
     */
    qdl.hasPoint = (lng, lat) => !isNaN(lng) && !isNaN(lat) && !(lng === 0 && lat === 0);

    /** The taxonomy **/

    /**
     * Index the taxonomy held by a package's table of taxa, with members `id` and `parentId`.
     * @param {VizPackage} pkg - The package
     * @return {Object} The taxonomy, with members `ids`, the id of each taxon, `parents`, the index of each taxon's
     * parent or -1, `indexOf`, a Map of id to index, `rank`, the rank of each, and the methods `within`, building a
     * membership of the taxa beneath a set, and `ancestorAtRank`
     */
    qdl.taxonomy = function (pkg) {
        let index = qdl.indexCache.get(pkg);
        if (!index) {
            index = {};
            qdl.indexCache.set(pkg, index);
        }
        if (!index.taxonomy) {
            const taxa = pkg.tables.taxa;
            const ids = qdl.float64(taxa, "id"), parentIds = qdl.float64(taxa, "parentId");
            const rankColumn = taxa.columns.rank;
            const indexOf = new Map();
            ids.forEach((id, i) => indexOf.set(id, i));
            const parents = new Int32Array(ids.length);
            parentIds.forEach((parentId, i) => {
                parents[i] = isNaN(parentId) ? -1 : indexOf.get(parentId) ?? -1;
            });
            const rank = i => rankColumn ? rankColumn.getString(i) : "";
            const memberships = new Map();
            index.taxonomy = {
                ids, parents, indexOf, rank,
                /**
                 * Find which taxa are, or are beneath, one of a set of taxa.
                 * @param {Array} taxonIds - The ids of the set, as Numbers or Strings
                 * @return {Set<Number>} The ids of the taxa within the set
                 */
                within: function (taxonIds) {
                    const key = taxonIds.map(Number).sort((a, b) => a - b).join(",");
                    let togo = memberships.get(key);
                    if (!togo) {
                        const roots = new Set(taxonIds.map(Number));
                        const inside = new Int8Array(ids.length); // 0 unknown, 1 within, -1 not
                        const isWithin = function (i) {
                            const path = [];
                            let move = i, verdict = 0;
                            while (move !== -1 && verdict === 0) {
                                if (inside[move] !== 0) {
                                    verdict = inside[move];
                                } else if (roots.has(ids[move])) {
                                    verdict = 1;
                                    path.push(move);
                                } else {
                                    path.push(move);
                                    move = parents[move];
                                }
                            }
                            const final = verdict === 1 ? 1 : -1;
                            path.forEach(visited => {
                                inside[visited] = final;
                            });
                            return final === 1;
                        };
                        togo = new Set();
                        for (let i = 0; i < ids.length; ++i) {
                            if (isWithin(i)) {
                                togo.add(ids[i]);
                            }
                        }
                        memberships.set(key, togo);
                    }
                    return togo;
                },
                ancestorAtRank: function (id, wantRank) {
                    let move = indexOf.get(id) ?? -1;
                    while (move !== -1 && rank(move) !== wantRank) {
                        move = parents[move];
                    }
                    return move === -1 ? NaN : ids[move];
                }
            };
        }
        return index.taxonomy;
    };

    /**
     * Compute the column of a `lookup` expression - the value of a field of the row of another table to which a field
     * of each row refers, as a coded column of the looked-up values.
     * @param {VizPackage} pkg - The package
     * @param {VizTable} table - The table queried
     * @param {Object} expr - The expression, with members `lookup`, `table`, `key` and `value`
     * @return {QdlColumn} The coded column
     */
    qdl.lookupColumn = function (pkg, table, expr) {
        const other = pkg.tables[expr.table];
        const keys = qdl.float64(other, expr.key);
        const valueColumn = qdl.tableColumn(other, expr.value);
        const byKey = new Map();
        keys.forEach((key, i) => byKey.set(key, valueColumn.getString(i)));
        const dictionary = ["", ...new Set(byKey.values())].filter((value, i, all) => all.indexOf(value) === i);
        const codeOf = new Map(dictionary.map((value, code) => [value, code]));
        const codeByKey = new Map([...byKey].map(([key, value]) => [key, codeOf.get(value)]));
        const refs = qdl.float64(table, expr.lookup);
        const codes = dictionary.length <= 256 ? new Uint8Array(refs.length) : new Uint16Array(refs.length);
        for (let i = 0; i < refs.length; ++i) {
            codes[i] = codeByKey.get(refs[i]) ?? 0;
        }
        return {kind: "coded", codes, dictionary};
    };

    /** Predicates **/

    /**
     * Compile a predicate of a query to a test of a row index.
     * @param {VizPackage} pkg - The package
     * @param {VizTable} table - The table queried
     * @param {Object} pred - The predicate - see "Predicates" in notes/query-description-language.md
     * @param {Object} lets - The query's `let`
     * @return {Function} A function accepting a row index and returning `true` if the row passes
     */
    qdl.compilePredicate = function (pkg, table, pred, lets) {
        let togo;
        if (pred.any) {
            const tests = pred.any.map(sub => qdl.compilePredicate(pkg, table, sub, lets));
            togo = i => tests.some(test => test(i));
        } else if (pred.all) {
            const tests = pred.all.map(sub => qdl.compilePredicate(pkg, table, sub, lets));
            togo = i => tests.every(test => test(i));
        } else if (pred.not) {
            const test = qdl.compilePredicate(pkg, table, pred.not, lets);
            togo = i => !test(i);
        } else if (pred.op === "inBox" || pred.op === "inPolygons") {
            togo = qdl.compileSpatial(table, pred);
        } else {
            togo = qdl.compileValueTest(pkg, table, qdl.resolve(pkg, table, pred.field, lets), pred);
        }
        return togo;
    };

    /**
     * Compile a test of a single value of a row - every predicate other than a combination of others or a spatial one.
     * @param {VizPackage} pkg - The package
     * @param {VizTable} table - The table queried
     * @param {QdlColumn} column - The column of the predicate's field
     * @param {Object} pred - The predicate
     * @return {Function} The test of a row index
     */
    qdl.compileValueTest = function (pkg, table, column, pred) {
        let togo;
        const op = pred.op;
        if (column.kind === "coded") {
            // Each code's verdict is found once, so that a row's test is one lookup
            const valueTest = qdl.stringTest(pkg, pred);
            const verdicts = new Uint8Array(column.dictionary.length);
            column.dictionary.forEach((value, code) => {
                verdicts[code] = valueTest(value === "" ? null : value) ? 1 : 0;
            });
            const codes = column.codes;
            togo = i => verdicts[codes[i]] === 1;
        } else if (column.kind === "numeric") {
            const values = column.values, nullValue = column.nullValue, divisor = column.divisor;
            const isNull = isNaN(nullValue) ? i => isNaN(values[i]) : i => values[i] === nullValue;
            if (op === "isNull") {
                togo = isNull;
            } else if (op === "notNull") {
                togo = i => !isNull(i);
            } else if (op === "within") {
                const members = qdl.taxonomy(pkg).within(pred.taxa);
                togo = i => !isNull(i) && members.has(values[i] / divisor);
            } else if (op === "monthIn" || op === "dayOfYearBetween") {
                const part = qdl.resolve(pkg, table, op === "monthIn" ? {month: pred.field} : {dayOfYear: pred.field});
                togo = qdl.compileValueTest(pkg, table, part, {op: op === "monthIn" ? "in" : "dayRange", value: pred.value});
            } else if (op === "dayRange") {
                // A range of days of the year, which wraps past the new year if its start follows its end
                const [from, to] = pred.value;
                togo = from <= to ? i => values[i] >= from && values[i] <= to : i => values[i] !== nullValue && (values[i] >= from || values[i] <= to);
            } else {
                const valueTest = qdl.numberTest(pred);
                togo = i => !isNull(i) && valueTest(values[i] / divisor);
            }
        } else {
            const valueTest = qdl.stringTest(pkg, pred);
            togo = function (i) {
                const value = column.getString(i);
                return valueTest(value === "" ? null : value);
            };
        }
        return togo;
    };

    /**
     * Compile a test of a Number, for a predicate comparing a numeric column with its value.
     * @param {Object} pred - The predicate
     * @return {Function} The test of a non-empty value
     */
    qdl.numberTest = function (pred) {
        const op = pred.op;
        // A value given as text, e.g. an id of the region indirection, is compared as the Number it names
        const value = Array.isArray(pred.value) ? pred.value.map(Number) : Number(pred.value);
        const tests = {
            "=": v => v === value,
            "!=": v => v !== value,
            "<": v => v < value,
            "<=": v => v <= value,
            ">": v => v > value,
            ">=": v => v >= value,
            "between": v => v >= value[0] && v <= value[1],
            "in": (set => v => set.has(v))(new Set(Array.isArray(value) ? value.map(Number) : []))
        };
        const togo = tests[op];
        if (!togo) {
            throw new Error("Unknown operator " + op + " for a numeric field");
        }
        return togo;
    };

    /**
     * Compile a test of one value of a column of text, for a predicate comparing it, which is applied once to each
     * value of a dictionary, or to each row of a column of free text.
     * @param {VizPackage} pkg - The package
     * @param {Object} pred - The predicate
     * @return {Function} The test of a value, `null` standing for empty
     */
    qdl.stringTest = function (pkg, pred) {
        const op = pred.op, value = pred.value;
        let togo;
        if (op === "isNull") {
            togo = v => v === null;
        } else if (op === "notNull") {
            togo = v => v !== null;
        } else if (op === "=") {
            togo = v => v === (value === null ? null : String(value));
        } else if (op === "!=") {
            togo = v => v !== (value === null ? null : String(value));
        } else if (op === "in") {
            const set = new Set(value.map(String));
            togo = v => v !== null && set.has(v);
        } else if (op === "contains") {
            const lower = String(value).toLowerCase();
            togo = v => v !== null && v.toLowerCase().includes(lower);
        } else if (op === "within") {
            const members = qdl.taxonomy(pkg).within(pred.taxa);
            togo = v => v !== null && members.has(Number(v));
        } else if (op === "between") {
            togo = v => v !== null && v >= value[0] && v <= value[1];
        } else {
            throw new Error("Unknown operator " + op + " for a field of text");
        }
        return togo;
    };

    /**
     * Compile a spatial predicate, `inBox` or `inPolygons`.
     * @param {VizTable} table - The table queried
     * @param {Object} pred - The predicate, whose `field` is a pair of the fields of longitude and latitude
     * @return {Function} The test of a row index
     */
    qdl.compileSpatial = function (table, pred) {
        const [lngField, latField] = pred.field;
        const lngs = qdl.float64(table, lngField), lats = qdl.float64(table, latField);
        let togo;
        if (pred.op === "inBox") {
            const [[west, south], [east, north]] = pred.value;
            togo = i => lngs[i] >= west && lngs[i] <= east && lats[i] >= south && lats[i] <= north;
        } else {
            const polygons = qdl.polygonsOf(pred.value);
            togo = i => qdl.hasPoint(lngs[i], lats[i]) && polygons.some(polygon => qdl.inPolygon(lngs[i], lats[i], polygon));
        }
        return togo;
    };

    /**
     * Gather the polygons of a GeoJSON object, each with the bounding box of its outer ring.
     * @param {Object} geojson - A FeatureCollection, Feature, Polygon or MultiPolygon
     * @return {Object[]} The polygons, each with members `rings` and `bounds`
     */
    qdl.polygonsOf = function (geojson) {
        const togo = [];
        const visit = function (node) {
            if (node.type === "FeatureCollection") {
                node.features.forEach(visit);
            } else if (node.type === "Feature") {
                visit(node.geometry);
            } else if (node.type === "Polygon") {
                togo.push(node.coordinates);
            } else if (node.type === "MultiPolygon") {
                node.coordinates.forEach(rings => togo.push(rings));
            }
        };
        visit(geojson);
        return togo.map(rings => {
            const bounds = [Infinity, Infinity, -Infinity, -Infinity];
            rings[0].forEach(([x, y]) => {
                bounds[0] = Math.min(bounds[0], x);
                bounds[1] = Math.min(bounds[1], y);
                bounds[2] = Math.max(bounds[2], x);
                bounds[3] = Math.max(bounds[3], y);
            });
            return {rings, bounds};
        });
    };

    /**
     * Determine whether a point lies in a polygon, by the crossings of a ray from it with each of the polygon's rings,
     * so that a hole excludes it.
     * @param {Number} x - The point's longitude
     * @param {Number} y - Its latitude
     * @param {Object} polygon - The polygon, as gathered by qdl.polygonsOf
     * @return {Boolean} `true` if the point is within it
     */
    qdl.inPolygon = function (x, y, polygon) {
        const b = polygon.bounds;
        let inside = false;
        if (x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3]) {
            polygon.rings.forEach(ring => {
                for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
                    const [xi, yi] = ring[i], [xj, yj] = ring[j];
                    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) {
                        inside = !inside;
                    }
                }
            });
        }
        return inside;
    };

    /** Execution **/

    /**
     * Compute the selection of a query's `where` - which rows of its table pass every predicate.
     * @param {VizPackage} pkg - The package
     * @param {Object} query - The query
     * @param {Uint8Array} [within] - A selection computed earlier, which the query's `where` narrows
     * @return {Object} Members `selection`, a Uint8Array holding 1 for each row passing, and `count`, their number
     */
    qdl.select = function (pkg, query, within) {
        const table = qdl.table(pkg, query.from);
        const rows = table.rowCount;
        const selection = new Uint8Array(rows);
        const preds = qdl.flatPredicates(query.where);
        let count = 0;
        if (within) {
            const base = within;
            const tests = preds.map(pred => qdl.compilePredicate(pkg, table, pred, query.let));
            for (let i = 0; i < rows; ++i) {
                if (base[i] === 1 && tests.every(test => test(i))) {
                    selection[i] = 1;
                    ++count;
                }
            }
        } else if (preds.length === 0) {
            selection.fill(1);
            count = rows;
        } else {
            const tests = preds.map(pred => qdl.compilePredicate(pkg, table, pred, query.let));
            const [first, ...rest] = tests;
            for (let i = 0; i < rows; ++i) {
                if (first(i) && rest.every(test => test(i))) {
                    selection[i] = 1;
                    ++count;
                }
            }
        }
        return {selection, count};
    };

    /**
     * Flatten a query's `where`, which may nest lists of predicates as a filter contributes them.
     * @param {Array|undefined} where - The predicates
     * @return {Object[]} The predicates, flat
     */
    qdl.flatPredicates = where => (where || []).flat(Infinity).filter(pred => pred);

    /**
     * Find a table of a package, or fail.
     * @param {VizPackage} pkg - The package
     * @param {String} name - The table's name
     * @return {VizTable} The table
     */
    qdl.table = function (pkg, name) {
        const table = pkg.tables[name];
        if (!table) {
            throw new Error("The data package has no table " + name);
        }
        return table;
    };

    /**
     * Execute a query over a package - see notes/query-description-language.md for its form and its results.
     * @param {VizPackage} pkg - The package
     * @param {Object} query - The query
     * @param {Uint8Array} [within] - A selection already computed, a Uint8Array over the table's rows holding 1 for
     * each row selected, which the query's `where` narrows - so that a view adding to the visualisation's filters does
     * not filter afresh. It is not part of the query, so that the query stays plain data: a cache of a query's results
     * keys them by the query which computed the selection too
     * @return {Object} The result
     */
    qdl.execute = function (pkg, query, within) {
        const now = Date.now();
        const table = qdl.table(pkg, query.from);
        const {selection, count} = qdl.select(pkg, query, within);
        let togo;
        if (query.select) {
            togo = qdl.selectRows(pkg, table, query, selection);
        } else if (query.groupBy && query.groupBy.length > 0) {
            togo = qdl.group(pkg, table, query, selection);
        } else if (query.measures) {
            togo = qdl.measureAll(pkg, table, query, selection, count);
        } else {
            togo = {rowCount: table.rowCount, count, selection};
        }
        qdl.log("Executed query over " + table.rowCount + " rows of " + query.from + " in " + (Date.now() - now) + " ms");
        return togo;
    };

    qdl.log = root.fluid ? message => root.fluid.log(message) : () => {};

    /**
     * Compile a measure into an accumulator, which is fed the rows of each group.
     * @param {VizPackage} pkg - The package
     * @param {VizTable} table - The table queried
     * @param {Object} measure - The measure
     * @param {Object} lets - The query's `let`
     * @return {Object} The accumulator, with methods `add(group, i)` and `result(groups)`
     */
    qdl.compileMeasure = function (pkg, table, measure, lets) {
        const filter = measure.filter ? qdl.flatPredicates(measure.filter).map(pred => qdl.compilePredicate(pkg, table, pred, lets)) : null;
        const passes = filter ? i => filter.every(test => test(i)) : () => true;
        let togo;
        const valuesOf = function (field) {
            const column = qdl.resolve(pkg, table, field, lets);
            return column.kind === "numeric" ? {column, read: qdl.numberReader(column)} : {column, read: qdl.codeReader(column)};
        };
        if (measure.count) {
            const counts = [];
            togo = {
                add: (group, i) => {
                    if (passes(i)) {
                        counts[group] = (counts[group] || 0) + 1;
                    }
                },
                result: groups => Uint32Array.from({length: groups}, (x, g) => counts[g] || 0)
            };
        } else if (measure.countDistinct || measure.distinct) {
            const {column, read} = valuesOf(measure.countDistinct || measure.distinct);
            const sets = [];
            togo = {
                add: (group, i) => {
                    const value = read(i);
                    if (value !== null && passes(i)) {
                        (sets[group] || (sets[group] = new Set())).add(value);
                    }
                },
                result: groups => measure.countDistinct ? Uint32Array.from({length: groups}, (x, g) => sets[g] ? sets[g].size : 0)
                    : qdl.flatten(groups, g => sets[g] ? [...sets[g]] : [], column.kind === "numeric" ? Float64Array : Uint32Array)
            };
            togo.column = column;
        } else if (measure.min || measure.max) {
            const {read} = valuesOf(measure.min || measure.max);
            const isMin = !!measure.min;
            const extremes = [];
            togo = {
                add: (group, i) => {
                    const value = read(i);
                    if (value !== null && passes(i) && (extremes[group] === undefined || (isMin ? value < extremes[group] : value > extremes[group]))) {
                        extremes[group] = value;
                    }
                },
                result: groups => Float64Array.from({length: groups}, (x, g) => extremes[g] ?? NaN)
            };
        } else if (measure.extent) {
            const [lngField, latField] = measure.extent;
            const lngs = qdl.float64(table, lngField), lats = qdl.float64(table, latField);
            const boxes = [];
            togo = {
                add: (group, i) => {
                    if (qdl.hasPoint(lngs[i], lats[i]) && passes(i)) {
                        const box = boxes[group] || (boxes[group] = [Infinity, Infinity, -Infinity, -Infinity]);
                        box[0] = Math.min(box[0], lngs[i]);
                        box[1] = Math.min(box[1], lats[i]);
                        box[2] = Math.max(box[2], lngs[i]);
                        box[3] = Math.max(box[3], lats[i]);
                    }
                },
                result: groups => Array.from({length: groups}, (x, g) => boxes[g] ? [[boxes[g][0], boxes[g][1]], [boxes[g][2], boxes[g][3]]] : null)
            };
        } else if (measure.rows) {
            const rows = [];
            togo = {
                add: (group, i) => {
                    if (passes(i)) {
                        (rows[group] || (rows[group] = [])).push(i);
                    }
                },
                result: groups => qdl.flatten(groups, g => rows[g] || [], Int32Array)
            };
        } else {
            throw new Error("Unknown measure " + qdl.canonical(measure));
        }
        return togo;
    };

    /**
     * Flatten a list of values for each group into one typed array, with the offset of each group's values.
     * @param {Number} groups - The number of groups
     * @param {Function} valuesOf - Returns the values of a group, by its index
     * @param {Function} ArrayType - The constructor of the typed array of values
     * @return {Object} Members `offsets`, an Int32Array of one more than the groups, and `values`
     */
    qdl.flatten = function (groups, valuesOf, ArrayType) {
        const lists = Array.from({length: groups}, (x, g) => valuesOf(g));
        const offsets = new Int32Array(groups + 1);
        lists.forEach((list, g) => {
            offsets[g + 1] = offsets[g] + list.length;
        });
        const values = new ArrayType(offsets[groups]);
        lists.forEach((list, g) => values.set(list, offsets[g]));
        return {offsets, values};
    };

    /**
     * Read a numeric column's values as Numbers, `null` for empty.
     * @param {QdlColumn} column - The column
     * @return {Function} The reader of a row index
     */
    qdl.numberReader = function (column) {
        const values = column.values, nullValue = column.nullValue, divisor = column.divisor;
        return isNaN(nullValue) ? i => isNaN(values[i]) ? null : values[i] / divisor : i => values[i] === nullValue ? null : values[i] / divisor;
    };

    /**
     * Read a coded column's codes, `null` for the code of the empty value. A column of text is read by its text.
     * @param {QdlColumn} column - The column
     * @return {Function} The reader of a row index
     */
    qdl.codeReader = function (column) {
        let togo;
        if (column.kind === "coded") {
            const codes = column.codes, empty = column.dictionary.indexOf("");
            togo = i => codes[i] === empty ? null : codes[i];
        } else {
            togo = function (i) {
                const value = column.getString(i);
                return value === "" ? null : value;
            };
        }
        return togo;
    };

    /**
     * Compute the measures of a query over its whole selection.
     * @param {VizPackage} pkg - The package
     * @param {VizTable} table - The table
     * @param {Object} query - The query
     * @param {Uint8Array} selection - Its selection
     * @param {Number} count - The number of rows selected
     * @return {Object} The value of each measure, by name, together with `count`
     */
    qdl.measureAll = function (pkg, table, query, selection, count) {
        const accumulators = Object.entries(query.measures).map(([name, measure]) => [name, qdl.compileMeasure(pkg, table, measure, query.let)]);
        for (let i = 0; i < selection.length; ++i) {
            if (selection[i] === 1) {
                accumulators.forEach(([, acc]) => acc.add(0, i));
            }
        }
        const togo = {count};
        accumulators.forEach(([name, acc]) => {
            const result = acc.result(1);
            togo[name] = result.offsets ? result.values : result[0];
        });
        return togo;
    };

    /**
     * Group a query's selection by one or two keys, and compute its measures for each group. A row whose key is empty
     * is in no group.
     * @param {VizPackage} pkg - The package
     * @param {VizTable} table - The table
     * @param {Object} query - The query
     * @param {Uint8Array} selection - Its selection
     * @return {Object} Members `groups`, their number, `keys`, a typed array of each key's values for each group, and
     * `measures`, the value of each measure for each group, the groups in ascending order of their keys
     */
    qdl.group = function (pkg, table, query, selection) {
        const keyColumns = query.groupBy.map(field => qdl.resolve(pkg, table, field, query.let));
        const readers = keyColumns.map(column => column.kind === "numeric" ? qdl.numberReader(column) : qdl.codeReader(column));
        const accumulators = Object.entries(query.measures || {}).map(([name, measure]) => [name, qdl.compileMeasure(pkg, table, measure, query.let)]);
        const groupOf = new Map();
        const keyValues = readers.map(() => []);
        for (let i = 0; i < selection.length; ++i) {
            if (selection[i] === 1) {
                const k0 = readers[0](i);
                const k1 = readers.length > 1 ? readers[1](i) : 0;
                if (k0 !== null && k1 !== null) {
                    const compound = readers.length > 1 ? k0 + "|" + k1 : k0;
                    let group = groupOf.get(compound);
                    if (group === undefined) {
                        group = groupOf.size;
                        groupOf.set(compound, group);
                        keyValues[0].push(k0);
                        if (readers.length > 1) {
                            keyValues[1].push(k1);
                        }
                    }
                    accumulators.forEach(([, acc]) => acc.add(group, i));
                }
            }
        }
        const groups = groupOf.size;
        // Order the groups by their keys
        const order = Array.from({length: groups}, (x, g) => g).sort((a, b) => {
            let cmp = 0;
            for (let k = 0; k < keyValues.length && cmp === 0; ++k) {
                const va = keyValues[k][a], vb = keyValues[k][b];
                cmp = va < vb ? -1 : va > vb ? 1 : 0;
            }
            return cmp;
        });
        const keys = {};
        query.groupBy.forEach((field, k) => {
            const name = typeof(field) === "string" ? field : qdl.canonical(field);
            const ArrayType = keyColumns[k].kind === "numeric" ? Float64Array : Uint32Array;
            keys[name] = ArrayType.from(order, g => keyValues[k][g]);
        });
        const measures = {};
        accumulators.forEach(([name, acc]) => {
            measures[name] = qdl.reorder(acc.result(groups), order);
        });
        return {groups, keys, measures};
    };

    /**
     * Reorder a measure's values for each group.
     * @param {TypedArray|Array|Object} result - The values for each group, or the flattened lists of qdl.flatten
     * @param {Number[]} order - The index of each group in its new order
     * @return {TypedArray|Array|Object} The values reordered
     */
    qdl.reorder = function (result, order) {
        let togo;
        if (result.offsets) {
            const {offsets, values} = result;
            togo = qdl.flatten(order.length, g => values.subarray(offsets[order[g]], offsets[order[g] + 1]), values.constructor);
        } else if (Array.isArray(result)) {
            togo = order.map(g => result[g]);
        } else {
            togo = result.constructor.from(order, g => result[g]);
        }
        return togo;
    };

    /**
     * Compute the ids of a query's selected rows, optionally ordered and windowed by its `select`.
     * @param {VizPackage} pkg - The package
     * @param {VizTable} table - The table
     * @param {Object} query - The query, whose `select` may have members `orderBy`, `offset` and `limit`
     * @param {Uint8Array} selection - Its selection
     * @return {Object} Members `rows`, an Int32Array of the ids, and `count`, the number of rows selected
     */
    qdl.selectRows = function (pkg, table, query, selection) {
        let ids = [];
        for (let i = 0; i < selection.length; ++i) {
            if (selection[i] === 1) {
                ids.push(i);
            }
        }
        const count = ids.length;
        const orderBy = query.select.orderBy || [];
        if (orderBy.length > 0) {
            const comparators = orderBy.map(({field, direction}) => {
                const column = qdl.resolve(pkg, table, field, query.let);
                const sign = direction === "desc" ? -1 : 1;
                let compare;
                if (column.kind === "numeric") {
                    const read = qdl.numberReader(column);
                    compare = (a, b) => {
                        const va = read(a), vb = read(b);
                        return va === vb ? 0 : va === null ? 1 : vb === null ? -1 : sign * (va - vb);
                    };
                } else if (column.kind === "coded") {
                    // A dictionary of the package is sorted, so that codes compare as their values do
                    const codes = column.codes;
                    compare = (a, b) => sign * (codes[a] - codes[b]);
                } else {
                    compare = (a, b) => sign * column.getString(a).localeCompare(column.getString(b));
                }
                return compare;
            });
            ids.sort((a, b) => {
                let cmp = 0;
                for (let c = 0; c < comparators.length && cmp === 0; ++c) {
                    cmp = comparators[c](a, b);
                }
                return cmp;
            });
        }
        const offset = query.select.offset || 0;
        if (offset > 0 || query.select.limit !== undefined) {
            ids = ids.slice(offset, query.select.limit === undefined ? undefined : offset + query.select.limit);
        }
        return {rows: Int32Array.from(ids), count};
    };

    /** Reading rows **/

    /**
     * Read one row of a table as an object of the text of each of its fields, as Papa Parse produced from its source -
     * for a view showing records one at a time, e.g. a tooltip or a marker. The object bears the row's index under
     * `qdl.rowIndexSymbol`.
     * @param {VizTable} table - The table
     * @param {Number} i - The row's index
     * @return {Object} The row
     */
    qdl.rowObject = function (table, i) {
        const row = {};
        table.fields.forEach(field => {
            row[field] = table.columns[field].getString(i);
        });
        row[qdl.rowIndexSymbol] = i;
        return row;
    };

    qdl.rowIndexSymbol = Symbol("rowIndex");

    /**
     * Read the rows of a table with the given ids.
     * @param {VizTable} table - The table
     * @param {Int32Array|Number[]} ids - The ids
     * @return {Object[]} The rows
     */
    qdl.rowObjects = (table, ids) => Array.from(ids, i => qdl.rowObject(table, i));

    /**
     * Find the rows of a table with a given value of a field, scanning its column, e.g. the record named by a URL.
     * @param {VizTable} table - The table
     * @param {String} field - The field
     * @param {String} value - The value sought
     * @return {Number} The index of the first such row, or -1 if there is none
     */
    qdl.findRow = function (table, field, value) {
        const column = table.columns[field];
        let togo = -1;
        if (column) {
            for (let i = 0; i < table.rowCount && togo === -1; ++i) {
                if (column.getString(i) === value) {
                    togo = i;
                }
            }
        }
        return togo;
    };

    /**
     * Read the value of a key or measure of a grouped result as text, a code resolving through its column's
     * dictionary.
     * @param {VizPackage} pkg - The package
     * @param {Object} query - The query
     * @param {String|Object} field - The field or expression
     * @param {Number|null} value - A value of its key or measure
     * @return {String|Number|null} The value as text, if its column is coded, else the value
     */
    qdl.decode = function (pkg, query, field, value) {
        const column = qdl.resolve(pkg, qdl.table(pkg, query.from), field, query.let);
        return column.kind === "coded" && value !== null ? column.dictionary[value] : value;
    };

    /**
     * Iterate over the ids of the rows of a selection.
     * @param {Uint8Array} selection - The selection
     * @param {Function} func - Called with the id of each row selected
     */
    qdl.forEachSelected = function (selection, func) {
        for (let i = 0; i < selection.length; ++i) {
            if (selection[i] === 1) {
                func(i);
            }
        }
    };

    if (typeof(module) !== "undefined" && module.exports) {
        module.exports = qdl;
    }
    if (root.fluid) {
        const hortis = root.fluid.registerNamespace("hortis");
        hortis.qdl = qdl;
    } else {
        root.hortis = root.hortis || {};
        root.hortis.qdl = qdl;
    }
})(typeof(globalThis) !== "undefined" ? globalThis : this);
