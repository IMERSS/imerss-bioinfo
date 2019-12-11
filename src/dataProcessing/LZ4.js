/* eslint-env node */

"use strict";

var fluid = require("infusion");
var lz4 = require("lz4");
var fs = require("fs");
var stream = require("stream");

var hortis = fluid.registerNamespace("hortis");

// TODO: move to pako https://github.com/nodeca/pako

hortis.writeLZ4File = function (text, filename) {
    var input = new stream.Readable();
    input.push(text);
    input.push(null);

    var output = fs.createWriteStream(filename);

    var encoder = lz4.createEncoderStream();
    input.pipe(encoder).pipe(output);
    output.on("finish", function () {
        var stats = fs.statSync(filename);
        console.log("Written " + stats.size + " bytes to " + filename);
    });
};
