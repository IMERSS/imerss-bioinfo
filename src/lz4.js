/* eslint-env node */

"use strict";

const fs = require("fs");
const minimist = require("minimist");
const lz4 = require("lz4");

const parsedArgs = minimist(process.argv.slice(2), {
    "boolean": "d"
});

const inFilename = parsedArgs._[0];
console.log(parsedArgs);

const computeDecompressName = function (inFilename) {
    return inFilename.endsWith(".lz4") ? inFilename.substring(0, inFilename.length - 4) : "decompressed";
};

let output, outFilename, transcoder;
const input = fs.createReadStream(inFilename);

if (parsedArgs.d) {
    outFilename = parsedArgs.o || computeDecompressName(inFilename);
    transcoder = lz4.createDecoderStream();

} else {
    outFilename = parsedArgs.o || inFilename + ".lz4";
    transcoder = lz4.createEncoderStream();
}

console.log("opening " + outFilename);
output = fs.createWriteStream(outFilename);

input.pipe(transcoder).pipe(output);

output.on("finish", function () {
    const stats = fs.statSync(outFilename);
    console.log("Written " + stats.size + " bytes to " + outFilename);
});
