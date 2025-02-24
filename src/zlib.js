/* eslint-env node */

"use strict";

const fs = require("fs");
const minimist = require("minimist");
const zlib = require("zlib");

const parsedArgs = minimist(process.argv.slice(2), {
    "boolean": "d"
});

const inFilename = parsedArgs._[0];

const computeCompressName = function (inFilename) {
    return inFilename.endsWith(".csv") ? inFilename.slice(0, -4) + ".viz" : inFilename + ".zz";
};

const computeDecompressName = function (inFilename) {
    return inFilename.endsWith(".zz") ? inFilename.slice(0, -3) :
        inFilename.endsWith(".viz") ? inFilename.slice(0, -4) + ".csv" : "decompressed";
};

let output, outFilename, transcoder;
const input = fs.createReadStream(inFilename);

if (parsedArgs.d) {
    outFilename = parsedArgs.o || computeDecompressName(inFilename);
    transcoder = zlib.createInflate();

} else {
    outFilename = parsedArgs.o || computeCompressName(inFilename);
    transcoder = zlib.createDeflate();
}

console.log("opening " + outFilename);
output = fs.createWriteStream(outFilename);

input.pipe(transcoder).pipe(output);

output.on("finish", function () {
    const stats = fs.statSync(outFilename);
    console.log("Written " + stats.size + " bytes to " + outFilename);
});
