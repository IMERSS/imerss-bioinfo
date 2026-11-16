/*
Copyright 2026 Antranig Basman
Licensed under the Educational Community License (ECL), Version 2.0 or the New
BSD license. You may not use this file except in compliance with one these
Licenses.
You may obtain a copy of the ECL 2.0 License and BSD License at
https://github.com/fluid-project/infusion/raw/master/Infusion-LICENSE.txt
*/

/* global pako, require, module, globalThis */

"use strict";

// Reader of the columnar data package, a ".viz" file holding every table of a visualisation - its observations, taxa,
// region indirection and any others - as typed-array columns described by a JSON header. See
// notes/columnar-data-package.md for the format. The reader has no dependency on Infusion, so that it is loaded alike
// by a page, a Web Worker and node - in node, by require, which returns `hortis.viz`. The writer is src/vizPack.js.

(function (root) {

    const viz = {};

    viz.MAGIC = "IMVZ";
    viz.VERSION = 1;
    // Bytes of the preamble: the magic, the version and the length of the header, each 4 bytes
    viz.PREAMBLE_LENGTH = 12;

    // A TextDecoder, which the sandbox in which Infusion renders a page under node does not hold as a global
    viz.TextDecoder = typeof(TextDecoder) !== "undefined" ? TextDecoder : require("util").TextDecoder;

    // The constructors of the typed arrays a column's values may be held in, by the name of their type in the header
    viz.arrayTypes = {
        Int8: Int8Array,
        Uint8: Uint8Array,
        Int16: Int16Array,
        Uint16: Uint16Array,
        Int32: Int32Array,
        Uint32: Uint32Array,
        Float32: Float32Array,
        Float64: Float64Array
    };

    /**
     * Determine whether a buffer begins with gzip's magic number.
     * @param {Uint8Array} bytes - The buffer's bytes
     * @return {Boolean} `true` if the buffer is gzipped
     */
    viz.isGzipped = bytes => bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;

    /**
     * Decompress a gzipped buffer, by the browser's own DecompressionStream where there is one, else by pako.
     * @param {Uint8Array} bytes - The gzipped bytes
     * @return {Promise<ArrayBuffer>} A promise for the decompressed bytes
     */
    viz.gunzip = function (bytes) {
        let togo;
        if (typeof(DecompressionStream) !== "undefined" && typeof(Response) !== "undefined") {
            const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
            togo = new Response(stream).arrayBuffer();
        } else {
            const inflater = typeof(pako) !== "undefined" ? pako : require("pako");
            const inflated = inflater.inflate(bytes);
            togo = Promise.resolve(inflated.buffer.slice(inflated.byteOffset, inflated.byteOffset + inflated.byteLength));
        }
        return togo;
    };

    /**
     * Read a package's bytes, which may be gzipped, into its decoded form.
     * @param {ArrayBuffer|Uint8Array} buffer - The bytes of the file, or a view of them, e.g. a node Buffer, which may
     * be a view of a larger pool
     * @return {Promise<VizPackage>} A promise for the decoded package
     */
    viz.read = async function (buffer) {
        // Tested by isView rather than instanceof, since a buffer may come from another realm, e.g. node's fetch seen from
        // the sandbox in which Infusion renders a page
        const bytes = ArrayBuffer.isView(buffer) ? new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength) : new Uint8Array(buffer);
        const raw = viz.isGzipped(bytes) ? await viz.gunzip(bytes) : bytes.slice().buffer;
        return viz.decode(raw);
    };

    /**
     * Fetch and decode a package.
     * @param {String} url - The URL of the package
     * @return {Promise<VizPackage>} A promise for the decoded package
     */
    viz.load = async function (url) {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error("Error fetching data package " + url + ": " + response.status + " " + response.statusText);
        }
        return viz.read(await response.arrayBuffer());
    };

    /**
     * Read the header of a decompressed package.
     * @param {ArrayBuffer} buffer - The decompressed bytes of the package
     * @return {Object} Members `header`, the parsed header, and `bodyOffset`, the byte offset of the body
     */
    viz.readHeader = function (buffer) {
        const view = new DataView(buffer);
        const magic = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
        if (magic !== viz.MAGIC) {
            throw new Error("Not a data package - expected magic " + viz.MAGIC + " but found " + JSON.stringify(magic));
        }
        const version = view.getUint32(4, true);
        if (version > viz.VERSION) {
            throw new Error("Data package is of version " + version + ", but this reader reads only up to version " + viz.VERSION);
        }
        const headerLength = view.getUint32(8, true);
        const headerBytes = new Uint8Array(buffer, viz.PREAMBLE_LENGTH, headerLength);
        const header = JSON.parse(new viz.TextDecoder().decode(headerBytes));
        return {header, bodyOffset: viz.align(viz.PREAMBLE_LENGTH + headerLength)};
    };

    /**
     * Round an offset up to the alignment of the package's buffers, 8 bytes.
     * @param {Number} offset - The offset
     * @return {Number} The aligned offset
     */
    viz.align = offset => Math.ceil(offset / 8) * 8;

    /**
     * Decode a decompressed package, taking views of its buffers without copying them.
     * @param {ArrayBuffer} buffer - The decompressed bytes of the package
     * @return {VizPackage} The decoded package, with members `header` and `tables`, a map of table name to VizTable
     */
    viz.decode = function (buffer) {
        const {header, bodyOffset} = viz.readHeader(buffer);
        const tables = {};
        Object.entries(header.tables).forEach(([name, tableHeader]) => {
            tables[name] = viz.decodeTable(buffer, bodyOffset, name, tableHeader);
        });
        return {header, tables};
    };

    /**
     * Take typed-array views of each of a column's buffers in a package's body.
     * @param {ArrayBuffer} buffer - The package's bytes
     * @param {Number} bodyOffset - The offset of its body
     * @param {Object<String, Object>} buffers - The column's buffers, as described in the header, each with members
     * `type`, `offset` and `length`, in elements
     * @return {Object<String, TypedArray>} The views, by the name of each buffer
     */
    viz.views = function (buffer, bodyOffset, buffers) {
        return Object.fromEntries(Object.entries(buffers || {}).map(([name, desc]) =>
            [name, new viz.arrayTypes[desc.type](buffer, bodyOffset + desc.offset, desc.length)]));
    };

    /**
     * Decode one table of a package.
     * @param {ArrayBuffer} buffer - The package's bytes
     * @param {Number} bodyOffset - The offset of its body
     * @param {String} name - The table's name
     * @param {Object} tableHeader - The table's entry in the header
     * @return {VizTable} The table
     */
    viz.decodeTable = function (buffer, bodyOffset, name, tableHeader) {
        const columns = {};
        tableHeader.fields.forEach(field => {
            columns[field] = viz.decodeColumn(buffer, bodyOffset, field, tableHeader.columns[field], tableHeader.rows);
        });
        return {
            name,
            rowCount: tableHeader.rows,
            fields: tableHeader.fields,
            hash: tableHeader.hash,
            columns,
            header: tableHeader
        };
    };

    /**
     * Decode one column of a table into a VizColumn, bearing its typed values and accessors for its values.
     * @param {ArrayBuffer} buffer - The package's bytes
     * @param {Number} bodyOffset - The offset of its body
     * @param {String} field - The column's field name
     * @param {Object} col - The column's entry in the header
     * @param {Number} rows - The number of rows of its table
     * @return {VizColumn} The column
     */
    viz.decodeColumn = (buffer, bodyOffset, field, col, rows) => viz.makeColumn(field, col, rows, viz.views(buffer, bodyOffset, col.buffers));

    /**
     * Make a VizColumn from the description of a column in a header and views of its buffers.
     * @param {String} field - The column's field name
     * @param {Object} col - The column's description, as in the header
     * @param {Number} rows - The number of rows of its table
     * @param {Object<String, TypedArray>} views - Its buffers, by name
     * @return {VizColumn} The column
     */
    viz.makeColumn = function (field, col, rows, views) {
        const exceptions = col.exceptions || {};
        const togo = {field, encoding: col.encoding, rows, header: col, ...views};
        if (col.encoding === "empty") {
            togo.getString = () => "";
        } else if (col.encoding === "dict") {
            const codes = views.codes, dictionary = col.dictionary;
            togo.dictionary = dictionary;
            togo.getString = i => dictionary[codes[i]];
        } else if (col.encoding === "int") {
            const values = views.values, nullValue = col.nullValue;
            togo.nullValue = nullValue;
            togo.get = i => values[i] === nullValue ? null : values[i];
            togo.getString = i => values[i] === nullValue ? "" : String(values[i]);
        } else if (col.encoding === "decimal") {
            const values = views.values, nullValue = col.nullValue, divisor = Math.pow(10, col.scale);
            togo.scale = col.scale;
            togo.nullValue = nullValue;
            togo.get = i => values[i] === nullValue ? null : values[i] / divisor;
            togo.getString = i => values[i] === nullValue ? "" : String(values[i] / divisor);
        } else if (col.encoding === "float") {
            const values = views.values;
            togo.nullValue = NaN;
            togo.get = i => isNaN(values[i]) ? null : values[i];
            togo.getString = i => isNaN(values[i]) ? "" : String(values[i]);
        } else if (col.encoding === "date32") {
            // Apache Arrow's Date32 - days since the Unix epoch. Its text is the day, unless the column's details hold it
            // in full, e.g. with its time
            const days = views.days, nullValue = col.nullValue;
            togo.nullValue = nullValue;
            togo.get = i => days[i] === nullValue ? null : days[i];
            togo.getString = i => togo.details ? togo.details.getString(i) : days[i] === nullValue ? "" : viz.dayString(days[i]);
        } else if (col.encoding === "deferred") {
            // A column held only among the package's details, which is empty until they are loaded
            togo.getString = i => togo.details ? togo.details.getString(i) : "";
        } else if (col.encoding === "prefixed") {
            const codes = views.codes, numbers = views.numbers, prefixes = col.dictionary;
            togo.dictionary = prefixes;
            togo.getString = i => exceptions[i] ?? (numbers[i] === -1 ? "" : prefixes[codes[i]] + numbers[i]);
        } else if (col.encoding === "text") {
            const offsets = views.offsets, bytes = views.bytes;
            const decoder = new viz.TextDecoder();
            togo.getString = i => offsets[i] === offsets[i + 1] ? "" : decoder.decode(bytes.subarray(offsets[i], offsets[i + 1]));
        } else {
            throw new Error("Unknown encoding " + col.encoding + " of column " + field);
        }
        if (!togo.get) {
            togo.get = function (i) {
                const text = togo.getString(i);
                return text === "" ? null : text;
            };
        }
        return togo;
    };

    /**
     * Write a day, as a number of days since the Unix epoch, in ISO 8601's form, e.g. "2025-04-26".
     * @param {Number} day - The day
     * @return {String} The day's text
     */
    viz.dayString = day => new Date(day * 86400000).toISOString().substring(0, 10);

    /**
     * Attach a package's details - the columns it holds in full only once they are loaded - to its tables, so that
     * each column of the package which has details reads its text from them.
     * @param {VizPackage} pkg - The package, which is modified
     * @param {VizPackage} details - Its details
     * @return {VizPackage} The package
     */
    viz.attachDetails = function (pkg, details) {
        Object.entries(details.tables).forEach(([name, detailTable]) => {
            const table = pkg.tables[name];
            detailTable.fields.forEach(field => {
                table.columns[field].details = detailTable.columns[field];
            });
        });
        pkg.detailsAttached = true;
        return pkg;
    };

    /**
     * Find the URL of a package's details, which are beside it.
     * @param {String} url - The URL of the package
     * @param {VizPackage} pkg - The package
     * @return {String|null} The URL of its details, or `null` if it has none
     */
    viz.detailsUrl = (url, pkg) => pkg.header.details ? new URL(pkg.header.details.file, new URL(url, viz.baseUrl())).href : null;

    viz.baseUrl = () => typeof(document) !== "undefined" && document.baseURI ? document.baseURI : typeof(location) !== "undefined" ? location.href : "file:///";

    /**
     * Make a package in memory from tables of row objects, e.g. a small table built by a page, or a test's data - each
     * column a `date32` if all its values are days in ISO 8601's form, an `int` if all are integers, a `float` if all
     * are numbers, and otherwise a `dict`. The text of each value is as `String` writes it, an absent value being
     * empty.
     * @param {Object<String, Object[]>} tables - Map of table name to its rows
     * @return {VizPackage} The package
     */
    viz.fromRows = function (tables) {
        const togo = {header: {format: "imerss-viz", version: viz.VERSION, tables: {}}, tables: {}};
        Object.entries(tables).forEach(([name, rows]) => {
            const fields = [];
            rows.forEach(row => Object.keys(row).forEach(field => {
                if (!fields.includes(field)) {
                    fields.push(field);
                }
            }));
            const columns = {};
            fields.forEach(field => {
                const values = rows.map(row => row[field] === undefined || row[field] === null ? "" : String(row[field]));
                const present = values.filter(value => value !== "");
                const canonical = value => String(Number(value)) === value;
                let col, views;
                if (present.length > 0 && present.every(value => /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value))) {
                    const nullValue = -2147483648;
                    col = {encoding: "date32", nullValue};
                    views = {days: Int32Array.from(values, value => value === "" ? nullValue : Date.parse(value + "T00:00:00Z") / 86400000)};
                } else if (present.length > 0 && present.every(value => /^-?[0-9]+$/.test(value) && canonical(value) && Math.abs(Number(value)) < 2147483647)) {
                    const nullValue = -2147483648;
                    col = {encoding: "int", nullValue};
                    views = {values: Int32Array.from(values, value => value === "" ? nullValue : Number(value))};
                } else if (present.length > 0 && present.every(canonical)) {
                    col = {encoding: "float"};
                    views = {values: Float64Array.from(values, value => value === "" ? NaN : Number(value))};
                } else {
                    const dictionary = [...new Set(["", ...values])].sort();
                    const codeOf = new Map(dictionary.map((value, code) => [value, code]));
                    col = {encoding: "dict", dictionary};
                    views = {codes: Uint32Array.from(values, value => codeOf.get(value))};
                }
                columns[field] = viz.makeColumn(field, col, rows.length, views);
            });
            togo.header.tables[name] = {rows: rows.length, fields, hash: "rows-" + name + "-" + rows.length};
            togo.tables[name] = {name, rowCount: rows.length, fields, hash: togo.header.tables[name].hash, columns, header: togo.header.tables[name]};
        });
        return togo;
    };

    /**
     * Materialise a column's values as an array of Numbers, a value of `null` being NaN - for the `int` and `decimal`
     * encodings, which hold numbers.
     * @param {VizColumn} column - The column
     * @return {Float64Array} The column's values
     */
    viz.toFloat64 = function (column) {
        const togo = new Float64Array(column.rows);
        if (column.encoding === "float") {
            togo.set(column.values);
        } else if (column.encoding === "int" || column.encoding === "decimal") {
            const values = column.values, nullValue = column.nullValue, divisor = Math.pow(10, column.scale || 0);
            for (let i = 0; i < togo.length; ++i) {
                togo[i] = values[i] === nullValue ? NaN : values[i] / divisor;
            }
        } else {
            for (let i = 0; i < togo.length; ++i) {
                const value = column.get(i);
                togo[i] = value === null ? NaN : Number(value);
            }
        }
        return togo;
    };

    /**
     * Materialise a table as an array of row objects, each holding the text of each of its fields, exactly as Papa
     * Parse produces from the CSV file from which the table was packed. This is the compatibility form for code not yet
     * written against the columns.
     * @param {VizTable} table - The table
     * @return {Object[]} The rows
     */
    viz.toRows = function (table) {
        const fields = table.fields, columns = fields.map(field => table.columns[field]);
        // Text decoded a column at a time is far cheaper than a value at a time, through a decoder per column
        const strings = columns.map(viz.columnStrings);
        const togo = new Array(table.rowCount);
        for (let i = 0; i < table.rowCount; ++i) {
            const row = {};
            for (let c = 0; c < fields.length; ++c) {
                row[fields[c]] = strings[c] ? strings[c][i] : columns[c].getString(i);
            }
            togo[i] = row;
        }
        return togo;
    };

    /**
     * Decode every value of a column at once, where that is cheaper than a value at a time.
     * @param {VizColumn} column - The column
     * @return {String[]|null} Its values, or `null` if they are as cheaply read one at a time
     */
    viz.columnStrings = function (column) {
        const source = column.details || column;
        let togo = null;
        if (source.encoding === "text") {
            togo = viz.textStrings(source);
        } else if (source.encoding === "date32") {
            const cache = new Map();
            togo = new Array(source.rows);
            for (let i = 0; i < source.rows; ++i) {
                const day = source.days[i];
                let text = cache.get(day);
                if (text === undefined) {
                    text = day === source.nullValue ? "" : viz.dayString(day);
                    cache.set(day, text);
                }
                togo[i] = text;
            }
        }
        return togo;
    };

    /**
     * Decode every value of a text column at once.
     * @param {VizColumn} column - A column of the `text` encoding
     * @return {String[]} Its values
     */
    viz.textStrings = function (column) {
        const all = new viz.TextDecoder().decode(column.bytes);
        const offsets = column.offsets, togo = new Array(column.rows);
        // Offsets are of bytes, whereas `all` is indexed by UTF-16 code units, so they agree only for ASCII
        const ascii = all.length === column.bytes.length;
        for (let i = 0; i < column.rows; ++i) {
            togo[i] = ascii ? all.substring(offsets[i], offsets[i + 1]) : column.getString(i);
        }
        return togo;
    };

    if (typeof(module) !== "undefined" && module.exports) {
        module.exports = viz;
    }
    if (root.fluid) {
        const hortis = root.fluid.registerNamespace("hortis");
        hortis.viz = viz;
    } else {
        root.hortis = root.hortis || {};
        root.hortis.viz = viz;
    }
})(typeof(globalThis) !== "undefined" ? globalThis : this);
