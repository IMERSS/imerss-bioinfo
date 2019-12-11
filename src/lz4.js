/* eslint-env node */

"use strict";

var fs = require("fs");
var minimist = require("minimist");
var lz4 = require("lz4");

var parsedArgs = minimist(process.argv.slice(2), {
    "boolean": "d"
});

var inFilename = parsedArgs._[0];
console.log(parsedArgs);

var computeDecompressName = function (inFilename) {
    return inFilename.endsWith(".lz4") ? inFilename.substring(0, inFilename.length - 4) : "decompressed";
};

var output, outFilename, transcoder;
var input = fs.createReadStream(inFilename);

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
    var stats = fs.statSync(outFilename);
    console.log("Written " + stats.size + " bytes to " + outFilename);
});
