/* eslint-env node */

"use strict";

const fs = require("fs");
const sqlite = require("sqlite");
const sqlite3 = require("sqlite3");
const csv = require("csv-parser");

const obsFilePath = "data/b-team/plant-pollinators-OBA-2025-assigned-subset-labels.csv"; // Change this to your CSV file path
const dbFilePath = "vizData.db";

async function readCSV(path) {
    return new Promise((resolve, reject) => {
        const columns = new Set();
        const rows = [];

        fs.createReadStream(path)
            .pipe(csv())
            .on("data", (row) => {
                Object.keys(row).forEach((col) => columns.add(col));
                rows.push(row);
            })
            .on("end", () => resolve({ columns: Array.from(columns), rows }))
            .on("error", reject);
    });
}

async function createTable(db, columns, tableName) {
    const columnDefs = columns.map(col => `"${col}" TEXT`).join(", ");
    await db.exec(`DROP TABLE IF EXISTS ${tableName}`);
    await db.exec(`CREATE TABLE ${tableName} (${columnDefs})`);
}

async function insertData(db, columns, rows, tableName) {
    const placeholders = columns.map(() => "?").join(", ");
    const insertStmt = `INSERT INTO ${tableName} (${columns.map(col => `"${col}"`).join(", ")}) VALUES (${placeholders})`;
    const stmt = await db.prepare(insertStmt);

    await db.exec("BEGIN TRANSACTION");

    for (let i = 0; i < rows.length; ++i) {
        const row = rows[i];
        const values = columns.map(col => row[col] || "");
        await stmt.run(values);
        if (i % 1000 === 0) {
            process.stdout.write(i + " ... ");
        }
    }
    await db.exec("COMMIT");
    await stmt.finalize();
}

async function dataToTable(db, csvPath, tableName) {
    const now = Date.now();
    const { columns, rows } = await readCSV(csvPath);
    console.log(`${rows.length} rows read from CSV in ${(Date.now() - now)}ms`);
    console.log(`${columns.length} columns detected:`, columns);

    const now2 = Date.now();
    await createTable(db, columns, tableName);
    await insertData(db, columns, rows, tableName);
    console.log(`${rows.length} rows written to database in ${(Date.now() - now2)}ms`);
}

(async () => {
    try {
        const db = await sqlite.open({ filename: dbFilePath, driver: sqlite3.Database });

        await dataToTable(db, obsFilePath, "obs");

        await db.close();
    } catch (err) {
        console.error("Error:", err);
    }

    try {
        const db = await sqlite.open({ filename: dbFilePath, driver: sqlite3.Database });

        const now = Date.now();
        const rows = await db.all(`SELECT * FROM obs`);
        console.log(`${rows.length} rows read from database in ${(Date.now() - now)}ms`);

        await db.close();
    } catch (err) {
        console.error("Error:", err);
    }

})();
