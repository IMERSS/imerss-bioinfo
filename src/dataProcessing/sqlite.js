/* eslint-env node */

"use strict";

const fluid = require("infusion");
const hortis = fluid.registerNamespace("hortis");

const sqlite = require("sqlite");
const sqlite3 = require("sqlite3");
const pako = require("pako");

fluid.registerNamespace("hortis.codecs.zlib");

hortis.codecs.zlib.encode = function (obj) {
    const string = JSON.stringify(obj);
    const togo = string === undefined ? undefined : pako.deflate(string);
    return togo;
};

hortis.codecs.zlib.decode = function (buffer) {
    if (!buffer) {
        return buffer;
    } else {
        const string = pako.inflate(buffer, {to: "string"});
        return JSON.parse(string);
    }
};

fluid.defaults("hortis.sqliteDB", {
    gradeNames: ["fluid.modelComponent", "fluid.resourceLoader"],
    // dbFile: String
    model: {
        db: "{that}.resources.db.parsed"
    },
    invokers: {
        beginTransaction: "hortis.sqliteDB.beginTransaction({that}.model.db)",
        endTransaction: "hortis.sqliteDB.endTransaction({that}.model.db)"
    },
    resources: {
        db: {
            promiseFunc: "hortis.sqliteDB.openDB",
            promiseArgs: ["{that}.options.dbFile"]
        }
    }
});

hortis.sqliteDB.beginTransaction = function (db) {
    return db.run("BEGIN");
};

hortis.sqliteDB.endTransaction = function (db) {
    return db.run("COMMIT");
};

/** Opens an SQLite database held at the supplied module-relative path
 * @param {String }dbFile - The (possibly module-qualified) filesystem path holding the database
 * @return {Promise<Database>} A promise for an "sqlite" wrapper for the opened SQLite database
 */
hortis.sqliteDB.openDB = async function (dbFile) {
    const path = fluid.module.resolvePath(dbFile);
    try {
        return sqlite.open({
            filename: path,
            driver: sqlite3.Database
        });
    } catch (err) {
        console.log("Error opening database ", err);
    }
};

fluid.defaults("hortis.sqliteSource", {
    gradeNames: ["fluid.dataSource", "fluid.dataSource.noencoding", "fluid.dataSource.writable", "fluid.resourceLoader"],
    // createString: String
    // readQuery: Object
    // writeQuery: Object
    // columnCodecs: Object
    model: {
        db: "{that}.db.model.db",
        tableCreated: "{that}.resources.table.parsed"
    },
    components: {
        db: "{hortis.sqliteDB}"
    },
    resources: {
        table: {
            promiseFunc: "hortis.sqliteSource.createTable",
            promiseArgs: ["{that}.db", "{that}.options.createString"]
        }
    },
    listeners: {
        "onRead.impl": {
            func: "hortis.sqliteSource.read",            // payload, options
            args: ["{that}", "{that}.options.readQuery", "{arguments}.0", "{arguments}.1"] // can't be {that}.model.db because of FLUID-6752
        },
        "onWrite.impl": {
            func: "hortis.sqliteSource.write",            // payload
            args: ["{that}", "{that}.options.writeQuery", "{arguments}.0"]
        }
    }
});

fluid.defaults("hortis.listableSqliteSource", {
    gradeNames: ["hortis.sqliteSource", "fluid.dataSource.listable"],
    // listQuery: Object
    invokers: {
        list: "hortis.sqliteSource.list({that}.model.db, {that}.options.listQuery)"
    }
});

hortis.sqliteSource.createTable = function (dbThat, createString) {
    console.log("Beginning to create table");
    const togo = fluid.promise();
    // Note that we can't expect the database component itself to construct until the entire tree constructs, we need
    // to wait for the individual resource. Note also that the promise itself doesn't resolve to much useful.
    // What do we expect about this in the future? That every "observation" of a model value is promisified? Or that it
    // just has a reducer syntax.
    dbThat.resources.db.promise.then(function () {
        const db = dbThat.model.db;
        console.log("Database opened");
        db.run(createString).then(function () {
            console.log("Table created");
            togo.resolve(true);
        }, function (err) {
            togo.reject("Error creating table " + err);
        });
    }, function (err) {
        togo.reject("Error waiting for database " + err);
    });
    return togo;
};

hortis.sqliteSource.prepareQueryArgs = function (args, directModel) {
    return fluid.transform(args, function (arg) {
        return typeof(arg) === "string" && arg.charAt(0) === "%" ?
            fluid.get(directModel, arg.slice(1)) : arg;
    });
};

hortis.deprefixColumn = function (column) {
    return column.startsWith("$") ? column.substring(1) : column;
};

hortis.transcodeColumns = function (direction, columns, columnCodecs) {
    return fluid.transform(columns, function (value, key) {
        const column = hortis.deprefixColumn(key);
        const codec = columnCodecs[column];
        if (codec) {
            const holder = hortis.codecs[codec];
            if (!holder) {
                fluid.fail("Unknown column codec ", codec, " allowable options are ", Object.keys(hortis.codecs).join(", "));
            }
            return holder[direction](value);
        } else {
            return value;
        }
    });
};

hortis.sqliteSource.read = async function (that, readQuery, value, options) {
    const db = that.model.db; // for FLUID-6752
    const result = await db.get(readQuery.query, hortis.sqliteSource.prepareQueryArgs(readQuery.args, options.directModel));
    return hortis.transcodeColumns("decode", result, that.options.columnCodecs);
};

hortis.sqliteSource.write = function (that, writeQuery, value) {
    const db = that.model.db;
    const prepared = hortis.sqliteSource.prepareQueryArgs(writeQuery.args, value);
    const encoded = hortis.transcodeColumns("encode", prepared, that.options.columnCodecs);
    return db.run(writeQuery.query, encoded);
};

hortis.sqliteSource.list = function (db, writeQuery) {
    return db.all(writeQuery.query);
};
