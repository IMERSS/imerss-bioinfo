/* eslint-env node */
/* eslint dot-notation: "off"*/
/* eslint new-cap: "off"*/

"use strict";

var fs = require("fs"),
    es = require("event-stream");

var now = Date.now();
var lines = 0;
var allLines = [];

var CSVtoRow = function (str) {
    var quote = false;
    var togo = [""];
    var c = 0, col = 0;
    var sstart = -1;
    var out = function () {
        if (sstart !== -1) {
            togo[col] += str.substring(sstart, c);
        }
        sstart = -1;
    };
    for (c = 0; c < str.length; ++c) {
        var cc = str[c], nc = str[c + 1];

        // If the current character is a quotation mark, and we're inside a
        // quoted field, and the next character is also a quotation mark,
        // add a quotation mark to the current column and skip the next character
        if (quote && cc === "\"" && nc === "\"") {
            out();
            togo[col] += cc;
            ++c;
            continue;
        }

        // If it's just one quotation mark, begin/end quoted field
        if (cc === "\"") {
            if (quote) {
                out();
            }
            quote = !quote;
            sstart = -1;
            continue;
        }

        // If it's a comma and we're not in a quoted field, move on to the next column
        if (cc === "," && !quote) {
            out();
            ++col;
            togo[col] = "";
            continue;
        }
        if (sstart === -1) {
            sstart = c;
        }
    }
    out();
    return togo;
};


fs.createReadStream("data/iNaturalist/iNaturalist-taxa.csv", {flags: "r"})
    .pipe(es.split())
    .pipe(es.mapSync(function (line) {
        var row = CSVtoRow(line);
        allLines.push(row);
        ++lines;
    })
).on("end", function () {
    console.log("Read " + lines + " lines in " + (Date.now() - now) + "ms");
});



/*
fs.createReadStream("data/iNaturalist/iNaturalist-taxa.csv", {flags: 'r'})
  .pipe(csvModule())
  .on("data", function (line) {
      ++ lines;
      allLines.push(line);
  }).on("end", function () {
     console.log("Read " + lines + " lines in " + (Date.now() - now) + "ms");
  });
*/

//var taxa = fs.readFileSync("../iNaturalist-taxa.json");
//console.log("Read " + taxa.length + " lines in " + (Date.now() - now) + "ms");
