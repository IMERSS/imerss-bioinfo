/* eslint-env node */
"use strict";

// Writer of the columnar data package, a ".viz" file holding every table of a visualisation as typed-array columns
// described by a JSON header - see notes/columnar-data-package.md for the format, and
// src/client/js/i6/vizPackage.js for its reader. Each table is read from a CSV file, or from a deflated CSV file of the
// earlier ".viz" form, exactly as the visualisation's own loader read it, so that the reader's compatibility rows are
// identical to those Papa Parse produced from the file.
//
// Run as
//     node src/vizPack.js <spec.json>
// or
//     node src/vizPack.js --out <file.viz> --table <name>=<file> [--table <name>=<file> ...]
//         [--relation <table>.<field>=<table>.<field> ...] [--details <table>.<field> ...]
// where a spec is a JSON file of the form
//     {"output": "x.viz", "tables": {"obs": "obs.csv", "taxa": "taxa.csv"},
//      "relations": [{"table": "obs", "field": "iNaturalistTaxonId", "references": {"table": "taxa", "field": "id"}}],
//      "detailFields": {"obs": ["occurrenceID"]}}
// A package's details - columns held in full only once the visualisation is shown - are written beside it, with
// "-details" before its suffix, e.g. "x-details.viz"
// whose paths are resolved against the directory holding it.

const fs = require("fs"),
    path = require("path"),
    zlib = require("zlib"),
    crypto = require("crypto"),
    Papa = require("papaparse"),
    pako = require("pako");

const viz = require("./client/js/i6/vizPackage.js");

const vizPack = {};

// The options with which the visualisations' loader, hortis.csvReader, parses a CSV file
vizPack.csvOptions = {
    header: true,
    skipEmptyLines: true
};

// The largest number of decimal places held by the `decimal` encoding - 7 places is about a centimetre of latitude
vizPack.maxScale = 7;
// The largest dictionary written - beyond it, a column is written as text
vizPack.maxDictionary = 65535;

/**
 * Read a table's file as Papa Parse's rows - plain CSV, or the deflated CSV of the earlier ".viz" form.
 * @param {String} file - The path of the file
 * @return {Object} Members `fields`, the names of the table's fields, and `rows`, its rows
 */
vizPack.readTable = function (file) {
    const bytes = fs.readFileSync(file);
    let text;
    if (file.endsWith(".csv")) {
        text = bytes.toString("utf8");
    } else {
        text = pako.inflate(bytes, {to: "string"});
    }
    const parsed = Papa.parse(text, vizPack.csvOptions);
    if (parsed.errors.length > 0) {
        console.log("Warning: " + parsed.errors.length + " errors parsing " + file + ", e.g. " + JSON.stringify(parsed.errors[0]));
    }
    return {fields: parsed.meta.fields, rows: parsed.data};
};

const intRegex = /^-?(0|[1-9][0-9]*)$/,
    decimalRegex = /^-?(0|[1-9][0-9]*)\.([0-9]+)$/;

// Narrowest signed integer types, each with the sentinel standing for an empty value, its smallest value
vizPack.intTypes = [
    {type: "Int8", min: -128, max: 127, Array: Int8Array},
    {type: "Int16", min: -32768, max: 32767, Array: Int16Array},
    {type: "Int32", min: -2147483648, max: 2147483647, Array: Int32Array}
];

/**
 * Choose the narrowest integer type holding a range of values together with a sentinel below them.
 * @param {Number} min - The least value
 * @param {Number} max - The greatest value
 * @return {Object|undefined} The type, or `undefined` if none holds them
 */
vizPack.intType = (min, max) => vizPack.intTypes.find(type => min > type.min && max <= type.max);

/**
 * Try to encode a column of text as integers, which succeeds if every value is empty or the canonical form of an
 * integer, so that it is written again by `String` exactly as it was.
 * @param {String[]} values - The column's values
 * @return {Object|null} The column's encoding, with its header and buffer, or `null` if it is not of integers
 */
vizPack.tryInt = function (values) {
    let min = Infinity, max = -Infinity, ok = true;
    for (let i = 0; i < values.length && ok; ++i) {
        const value = values[i];
        if (value !== "") {
            const num = Number(value);
            ok = intRegex.test(value) && String(num) === value;
            min = Math.min(min, num);
            max = Math.max(max, num);
        }
    }
    const type = ok && min <= max ? vizPack.intType(min, max) : undefined;
    let togo = null;
    if (type) {
        const array = new type.Array(values.length);
        for (let i = 0; i < values.length; ++i) {
            array[i] = values[i] === "" ? type.min : Number(values[i]);
        }
        togo = {header: {encoding: "int", nullValue: type.min}, buffers: {values: array}};
    }
    return togo;
};

/**
 * Convert the text of a decimal number to an integer multiple of 10^-scale, exactly, by moving its decimal point.
 * @param {String} value - The number's canonical text
 * @param {Number} scale - The number of decimal places
 * @return {Number} The integer
 */
vizPack.scaleDecimal = function (value, scale) {
    const negative = value.startsWith("-");
    const unsigned = negative ? value.substring(1) : value;
    const [whole, fraction = ""] = unsigned.split(".");
    const digits = whole + fraction.padEnd(scale, "0");
    const magnitude = Number(digits);
    return negative ? -magnitude : magnitude;
};

/**
 * Try to encode a column of text as decimal numbers, held as Int32 multiples of a power of ten, which succeeds if
 * every value is empty or the canonical text of a number of at most `vizPack.maxScale` decimal places, which the
 * reader writes again exactly as it was.
 * @param {String[]} values - The column's values
 * @return {Object|null} The column's encoding, with its header and buffer, or `null` if it is not of such numbers
 */
vizPack.tryDecimal = function (values) {
    let scale = 0, ok = true, any = false;
    for (let i = 0; i < values.length && ok; ++i) {
        const value = values[i];
        if (value !== "") {
            const match = decimalRegex.exec(value);
            ok = (!!match || intRegex.test(value)) && String(Number(value)) === value;
            if (match) {
                any = true;
                scale = Math.max(scale, match[2].length);
            }
        }
    }
    let togo = null;
    if (ok && any && scale <= vizPack.maxScale) {
        const type = vizPack.intTypes[2], divisor = Math.pow(10, scale);
        const array = new Int32Array(values.length);
        for (let i = 0; i < values.length && ok; ++i) {
            const value = values[i];
            if (value === "") {
                array[i] = type.min;
            } else {
                const scaled = vizPack.scaleDecimal(value, scale);
                ok = scaled > type.min && scaled <= type.max && String(scaled / divisor) === value;
                array[i] = scaled;
            }
        }
        togo = ok ? {header: {encoding: "decimal", scale, nullValue: type.min}, buffers: {values: array}} : null;
    }
    return togo;
};

/**
 * Try to encode a column of text as Float64 numbers, which succeeds if every value is empty or the canonical text of a
 * number - the shortest which reads back as the same double, as `String` writes it - e.g. coordinates of more decimal
 * places than the `decimal` encoding holds.
 * @param {String[]} values - The column's values
 * @return {Object|null} The column's encoding, or `null` if it is not of such numbers
 */
vizPack.tryFloat = function (values) {
    const array = new Float64Array(values.length);
    let ok = true;
    for (let i = 0; i < values.length && ok; ++i) {
        const value = values[i];
        if (value === "") {
            array[i] = NaN;
        } else {
            const num = Number(value);
            ok = (decimalRegex.test(value) || intRegex.test(value)) && String(num) === value;
            array[i] = num;
        }
    }
    return ok ? {header: {encoding: "float"}, buffers: {values: array}} : null;
};

/**
 * Encode a column of text by a dictionary of its distinct values, sorted, with a code for each row - if it has few
 * enough distinct values.
 * @param {String[]} values - The column's values
 * @return {Object|null} The column's encoding, with its header and buffer, or `null` if it has too many values
 */
vizPack.tryDict = function (values) {
    const distinct = new Set(values);
    let togo = null;
    if (distinct.size <= vizPack.maxDictionary && (distinct.size <= 256 || distinct.size * 2 <= values.length)) {
        const dictionary = [...distinct].sort();
        const codeOf = new Map(dictionary.map((value, code) => [value, code]));
        const codes = vizPack.codeArray(dictionary.length, values.length);
        for (let i = 0; i < values.length; ++i) {
            codes[i] = codeOf.get(values[i]);
        }
        togo = {header: {encoding: "dict", dictionary}, buffers: {codes}};
    }
    return togo;
};

/**
 * Encode a column of text as one buffer of its values' UTF-8 bytes, with the offset of each value's bytes.
 * @param {String[]} values - The column's values
 * @return {Object} The column's encoding, with its header and its two buffers, of offsets and of bytes
 */
vizPack.encodeText = function (values) {
    const encoded = values.map(value => Buffer.from(value, "utf8"));
    const offsets = new Int32Array(values.length + 1);
    encoded.forEach((bytes, i) => {
        offsets[i + 1] = offsets[i] + bytes.length;
    });
    const bytes = new Uint8Array(Buffer.concat(encoded));
    return {header: {encoding: "text"}, buffers: {offsets, bytes}};
};

/**
 * Allocate an array of codes into a dictionary, of the narrowest unsigned type holding them.
 * @param {Number} size - The size of the dictionary
 * @param {Number} length - The number of codes
 * @return {Uint8Array|Uint16Array|Uint32Array} The array
 */
vizPack.codeArray = (size, length) => size <= 256 ? new Uint8Array(length) : size <= 65536 ? new Uint16Array(length) : new Uint32Array(length);

/**
 * Encode the values not held by a column's main encoding as exceptions, a sparse map of row index to text, so that an
 * encoding need hold only the common forms of a column's values.
 * @param {Number[]} rows - The indices of the rows held as exceptions
 * @param {String[]} values - The column's values
 * @return {Object<String, String>} The exceptions
 */
vizPack.exceptions = (rows, values) => Object.fromEntries(rows.map(row => [row, values[row]]));

// The share of a column's values which the date and prefixed encodings must hold, the rest being held as exceptions
vizPack.minCoverage = 0.95;
// A date of ISO 8601's form, of which the month and day may be missing, followed by anything else which a date of
// Darwin Core may hold - a time, after "T" or a space, or the end of a range, after "/"
vizPack.dateRegex = /^([0-9]{4})(?:-([0-9]{2})(?:-([0-9]{2}))?)?((?:[T /].*)?)$/s;

/**
 * Convert a day in ISO 8601's form, e.g. "2025-04-26", to the number of days since the Unix epoch - Apache Arrow's
 * Date32.
 * @param {String} day - The day
 * @return {Number} The number of days since 1970-01-01
 */
vizPack.dayNumber = day => Date.UTC(Number(day.substring(0, 4)), Number(day.substring(5, 7)) - 1, Number(day.substring(8, 10))) / 86400000;

/**
 * Try to encode a column of dates, with or without a time and a zone, as in ISO 8601 - e.g. "2025-04-26" or
 * "2025-04-26T11:25:00-07:00", or of only a year or a year and month, e.g. "1988" or "1997-09", which stand for their
 * first day - as Apache Arrow's Date32, an Int32 of the number of days since the Unix epoch, an
 * empty or unreadable value being `nullValue`. No visualisation needs more than the day, so a column of which any
 * value holds more - a time, a zone, or text not of this form - is held in full among the package's details, to be
 * loaded once the visualisation is shown. At least `vizPack.minCoverage` of the column's values must be of this form.
 * @param {String[]} values - The column's values
 * @return {Object|null} The column's encoding, with members `header`, `buffers` and, if the column is held in full
 * among the details, `details`, its values - or `null` if too few of its values are dates
 */
vizPack.tryDate = function (values) {
    const nullValue = vizPack.intTypes[2].min;
    const days = new Int32Array(values.length).fill(nullValue);
    let dated = 0, other = 0, detailed = false;
    values.forEach((value, row) => {
        if (value !== "") {
            const match = vizPack.dateRegex.exec(value);
            // A date of only a year, or a year and month, stands for its first day, as Date.parse reads it
            const dayText = match ? match[1] + "-" + (match[2] || "01") + "-" + (match[3] || "01") : "";
            const day = match ? vizPack.dayNumber(dayText) : NaN;
            // A day which does not exist, e.g. "2025-02-30", is not written again as it was, so is held as other text
            if (match && !isNaN(day) && new Date(day * 86400000).toISOString().substring(0, 10) === dayText) {
                ++dated;
                days[row] = day;
                // The column's text is held in full among the details unless every value is a day and nothing more
                detailed = detailed || match[4] !== "" || match[3] === undefined;
            } else {
                ++other;
                detailed = true;
            }
        }
    });
    let togo = null;
    if (dated > 0 && other <= (1 - vizPack.minCoverage) * (dated + other)) {
        togo = {header: {encoding: "date32", nullValue, detailed}, buffers: {days}, details: detailed ? values : null};
    }
    return togo;
};

vizPack.prefixedRegex = /^(.*?)(0|[1-9][0-9]{0,8})$/s;

/**
 * Try to encode a column of identifiers ending in a number, e.g. "https://www.inaturalist.org/observations/276233132"
 * or "RBCM:Botany:V188050", as a code into a dictionary of their prefixes together with the number. Any value of
 * another form is held as an exception, if at least `vizPack.minCoverage` of the values are of this form, and the
 * prefixes are few.
 * @param {String[]} values - The column's values
 * @return {Object|null} The column's encoding, or `null` if too few of its values are of this form
 */
vizPack.tryPrefixed = function (values) {
    const matches = values.map(value => value === "" ? null : vizPack.prefixedRegex.exec(value));
    const exceptionRows = [];
    matches.forEach((match, row) => {
        if (!match && values[row] !== "") {
            exceptionRows.push(row);
        }
    });
    const prefixes = [...new Set(["", ...matches.map(match => match ? match[1] : "")])].sort();
    let togo = null;
    if (exceptionRows.length <= (1 - vizPack.minCoverage) * values.length && prefixes.length <= vizPack.maxDictionary
        && prefixes.length * 16 <= values.length) {
        const prefixOf = new Map(prefixes.map((prefix, code) => [prefix, code]));
        const codes = vizPack.codeArray(prefixes.length, values.length);
        const numbers = new Int32Array(values.length).fill(-1);
        matches.forEach((match, row) => {
            if (match) {
                codes[row] = prefixOf.get(match[1]);
                numbers[row] = Number(match[2]);
            }
        });
        togo = {
            header: {encoding: "prefixed", dictionary: prefixes, exceptions: vizPack.exceptions(exceptionRows, values)},
            buffers: {codes, numbers}
        };
    }
    return togo;
};

/**
 * Choose the encoding of one column, the first of those which holds its values exactly.
 * @param {String[]} values - The column's values, as text
 * @param {Boolean} [inDetails] - `true` if the column is written among a package's details, which hold columns in full
 * @return {Object} The column's encoding, with members `header`, `buffers` and possibly `details` - see vizPack.tryDate
 */
vizPack.encodeColumn = function (values, inDetails) {
    let togo;
    if (values.every(value => value === "")) {
        togo = {header: {encoding: "empty"}, buffers: {}};
    } else {
        togo = vizPack.tryInt(values) || vizPack.tryDecimal(values) || (inDetails ? null : vizPack.tryDate(values)) || vizPack.tryDict(values)
            || vizPack.tryFloat(values)
            || vizPack.tryPrefixed(values) || vizPack.encodeText(values);
    }
    return togo;
};

/**
 * Find the name by which the header records the type of a typed array.
 * @param {TypedArray} array - The array
 * @return {String} The name of its type, e.g. "Int32"
 */
vizPack.typeName = array => Object.keys(viz.arrayTypes).find(name => array instanceof viz.arrayTypes[name]);

/**
 * Write the bytes of a package from its tables' encoded columns.
 * @param {Object<String, Object>} tables - Map of table name to its `rows`, the number of its rows, `fields`, its field
 * names, `encoded`, map of field name to its column's encoding, and optionally `source`
 * @param {Object} extra - Further members of the package's header, e.g. `relations`
 * @return {Buffer} The package, uncompressed
 */
vizPack.write = function (tables, extra) {
    const buffers = [];
    let bodyLength = 0;
    const place = function (array) {
        const offset = bodyLength;
        const bytes = Buffer.from(array.buffer, array.byteOffset, array.byteLength);
        buffers.push({offset, bytes});
        bodyLength = viz.align(offset + bytes.length);
        return offset;
    };
    const header = {format: "imerss-viz", version: viz.VERSION, ...extra, tables: {}};
    Object.entries(tables).forEach(([name, table]) => {
        const hash = crypto.createHash("sha256");
        const columns = {};
        table.fields.forEach(field => {
            const encoded = table.encoded[field];
            const col = {...encoded.header, buffers: {}};
            hash.update(JSON.stringify([field, encoded.header]));
            Object.entries(encoded.buffers).forEach(([bufferName, array]) => {
                hash.update(Buffer.from(array.buffer, array.byteOffset, array.byteLength));
                col.buffers[bufferName] = {type: vizPack.typeName(array), offset: place(array), length: array.length};
            });
            columns[field] = col;
        });
        header.tables[name] = {
            rows: table.rows,
            ...(table.source ? {source: table.source} : {}),
            hash: hash.digest("hex").substring(0, 16),
            fields: table.fields,
            columns
        };
    });
    const headerBytes = Buffer.from(JSON.stringify(header), "utf8");
    const bodyOffset = viz.align(viz.PREAMBLE_LENGTH + headerBytes.length);
    const output = Buffer.alloc(bodyOffset + bodyLength);
    output.write(viz.MAGIC, 0, "latin1");
    output.writeUInt32LE(viz.VERSION, 4);
    output.writeUInt32LE(headerBytes.length, 8);
    headerBytes.copy(output, viz.PREAMBLE_LENGTH);
    buffers.forEach(({offset, bytes}) => bytes.copy(output, bodyOffset + offset));
    return output;
};

/**
 * Pack a set of tables into the bytes of a data package, together with those of its details - the columns held in
 * full only once the visualisation is shown. A column is among the details if its encoding holds less than its
 * values, as vizPack.tryDate's does of dates with times, or if it is named in `detailFields`, in which case the main
 * package holds it only as a column of the encoding `deferred`.
 * @param {Object<String, Object>} tables - Map of table name to its `fields` and `rows`, as read by vizPack.readTable,
 * and optionally `source`, the name of the file it was read from
 * @param {Object} [options] - Members `relations`, the foreign keys between the tables, each with members `table`,
 * `field` and `references`, itself with `table` and `field`, `detailFields`, map of table name to the fields to be held
 * among the details alone, and `detailsFile`, the name of the file of the details, relative to that of the package
 * @return {Object} Members `main` and `details`, the packages, uncompressed, the latter `null` if there are no details
 */
vizPack.pack = function (tables, options = {}) {
    const main = {}, details = {};
    Object.entries(tables).forEach(([name, table]) => {
        const deferred = (options.detailFields || {})[name] || [];
        const encoded = {}, detailEncoded = {};
        table.fields.forEach(field => {
            const values = table.rows.map(row => row[field] ?? "");
            if (deferred.includes(field)) {
                encoded[field] = {header: {encoding: "deferred"}, buffers: {}};
                detailEncoded[field] = vizPack.encodeColumn(values, true);
            } else {
                encoded[field] = vizPack.encodeColumn(values);
                if (encoded[field].details) {
                    detailEncoded[field] = vizPack.encodeColumn(encoded[field].details, true);
                }
            }
        });
        main[name] = {rows: table.rows.length, fields: table.fields, encoded, source: table.source};
        const detailFields = Object.keys(detailEncoded);
        if (detailFields.length > 0) {
            details[name] = {rows: table.rows.length, fields: detailFields, encoded: detailEncoded};
        }
    });
    const detailsPackage = Object.keys(details).length > 0 ? vizPack.write(details, {detailsOf: options.detailsFile || ""}) : null;
    const detailsHeader = detailsPackage ? {details: {file: options.detailsFile || "", hash: crypto.createHash("sha256").update(detailsPackage).digest("hex").substring(0, 16)}} : {};
    return {
        main: vizPack.write(main, {relations: options.relations || [], ...detailsHeader}),
        details: detailsPackage
    };
};

/**
 * Name the file of a package's details - beside it, with "-details" before its suffix.
 * @param {String} output - The path of the package
 * @return {String} The path of its details
 */
vizPack.detailsFile = output => output.replace(/(\.viz)?$/, "-details.viz");

/**
 * Read the header of an uncompressed package.
 * @param {Buffer} packed - The package
 * @return {Object} Its header
 */
vizPack.header = packed => viz.readHeader(packed.buffer.slice(packed.byteOffset, packed.byteOffset + packed.byteLength)).header;

/**
 * Pack tables from their files and write the gzipped package, and beside it its details if it has any.
 * @param {String} output - The path of the package to be written
 * @param {Object<String, String>} tableFiles - Map of table name to the path of its file
 * @param {Object} [options] - Members `relations` and `detailFields` - see vizPack.pack
 * @return {Object} Members `header` of the package written, its sizes `raw` and `gzipped`, in bytes, and `details`,
 * the same of its details, if any
 */
vizPack.packFiles = function (output, tableFiles, options = {}) {
    const tables = {};
    Object.entries(tableFiles).forEach(([name, file]) => {
        tables[name] = {...vizPack.readTable(file), source: path.basename(file)};
    });
    const detailsOutput = vizPack.detailsFile(output);
    const packed = vizPack.pack(tables, {...options, detailsFile: path.basename(detailsOutput)});
    const writeOne = function (file, bytes) {
        const gzipped = zlib.gzipSync(bytes, {level: 9});
        fs.mkdirSync(path.dirname(file), {recursive: true});
        fs.writeFileSync(file, gzipped);
        return {file, header: vizPack.header(bytes), raw: bytes.length, gzipped: gzipped.length};
    };
    const togo = writeOne(output, packed.main);
    if (packed.details) {
        togo.details = writeOne(detailsOutput, packed.details);
    } else if (fs.existsSync(detailsOutput)) {
        fs.unlinkSync(detailsOutput);
    }
    return togo;
};

/**
 * Pack the tables named by a spec - see the comment at the head of this file.
 * @param {Object} spec - The spec, with members `output`, `tables` and optionally `relations`
 * @param {String} [base] - The directory against which its paths are resolved
 * @return {Object} The result of vizPack.packFiles
 */
vizPack.packSpec = function (spec, base = ".") {
    const tableFiles = Object.fromEntries(Object.entries(spec.tables).map(([name, file]) => [name, path.resolve(base, file)]));
    return vizPack.packFiles(path.resolve(base, spec.output), tableFiles, {relations: spec.relations, detailFields: spec.detailFields});
};

/**
 * Parse the arguments of the command line into a spec.
 * @param {String[]} args - The arguments, after the script's name
 * @return {Object} Members `spec` and `base`, the directory its paths are resolved against
 */
vizPack.parseArgs = function (args) {
    let togo;
    if (args.length === 1 && args[0].endsWith(".json")) {
        togo = {spec: JSON.parse(fs.readFileSync(args[0], "utf8")), base: path.dirname(args[0])};
    } else {
        const spec = {tables: {}, relations: []};
        for (let i = 0; i < args.length; i += 2) {
            const [flag, value] = [args[i], args[i + 1]];
            if (flag === "--out") {
                spec.output = value;
            } else if (flag === "--table") {
                const [name, file] = value.split(/=(.*)/s);
                spec.tables[name] = file;
            } else if (flag === "--details") {
                const [table, field] = value.split(".");
                spec.detailFields = spec.detailFields || {};
                spec.detailFields[table] = (spec.detailFields[table] || []).concat([field]);
            } else if (flag === "--relation") {
                const [from, to] = value.split("=").map(ref => ref.split("."));
                spec.relations.push({table: from[0], field: from[1], references: {table: to[0], field: to[1]}});
            } else {
                throw new Error("Unrecognised argument " + flag);
            }
        }
        togo = {spec, base: "."};
    }
    return togo;
};

/**
 * Summarise a packed package's tables and the encodings of their columns, for logging.
 * @param {Object} result - The result of vizPack.packFiles
 * @return {String} The summary
 */
vizPack.summarise = function (result) {
    const tables = Object.entries(result.header.tables).map(([name, table]) => {
        const counts = {};
        Object.values(table.columns).forEach(col => {
            counts[col.encoding] = (counts[col.encoding] || 0) + 1;
        });
        return "  " + name + ": " + table.rows + " rows, " + table.fields.length + " fields - " + JSON.stringify(counts);
    });
    const details = result.details ? "\n  details " + Object.entries(result.details.header.tables).map(([name, table]) =>
        name + ": " + table.fields.join(", ")).join("; ") + " - " + result.details.raw + " bytes, " + result.details.gzipped + " gzipped" : "";
    return tables.join("\n") + "\n  " + result.raw + " bytes, " + result.gzipped + " gzipped" + details;
};

if (require.main === module) {
    const {spec, base} = vizPack.parseArgs(process.argv.slice(2));
    const now = Date.now();
    const result = vizPack.packSpec(spec, base);
    console.log("Packed " + path.resolve(base, spec.output) + " in " + (Date.now() - now) + " ms\n" + vizPack.summarise(result));
}

module.exports = vizPack;
