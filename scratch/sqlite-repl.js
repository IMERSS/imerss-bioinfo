/* eslint-env node */
"use strict";

const sqlite3 = require("sqlite3");
const repl = require("repl");

const args = process.argv.slice(2);
const dbFileName = (args.length >= 1 && args[0] !== "-") ? args[0] : ":memory:";
const db = new sqlite3.Database(dbFileName);

db.on("error", (err) => console.log(err));
db.on("open", () => {
    db.serialize();

    let buffer = "";
    const replServer = repl.start({
        ignoreUndefined: true,

        eval: (line, context, filename, cb) => {
            buffer += line;
            let statements = buffer.split(";");

            if (statements.length > 1) {
                buffer = statements[statements.length - 1];

                let promises = [];
                for (let i = 0, count = statements.length - 1; i < count; i++) {
                    let statement = statements[i];
                    promises.push(new Promise((resolve, reject) => {
                        db.all(statement, (err, rows) => {
                            if (err !== null) {
                                reject(err);
                            } else {
                                resolve(rows);
                            }
                        });
                    }));
                }
                Promise.all(promises)
                    .then((results) => {
                        if (promises.length === 1) {
                            // If only a single statement, output the result directly (instead of an array)
                            cb(null, results[0]);
                        } else {
                            cb(null, results);
                        }
                    })
                    .catch((err) => cb(err));
            } else {
                // Input is mid-statement; suppress output
                cb(null, undefined);
            }
        },
    });
    replServer.on("exit", () => {
        db.close();
    });
});

