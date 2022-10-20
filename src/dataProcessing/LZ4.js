/* eslint-env node */

"use strict";

const fluid = require("infusion");
const lz4 = require("lz4");
const fs = require("fs");
const stream = require("stream");

const hortis = fluid.registerNamespace("hortis");

// TODO: move to pako https://github.com/nodeca/pako

hortis.writeLZ4File = function (text, filename) {
    const input = new stream.Readable();
    input.push(text);
    input.push(null);

    const output = fs.createWriteStream(filename);

    const encoder = lz4.createEncoderStream();
    input.pipe(encoder).pipe(output);
    output.on("finish", function () {
        const stats = fs.statSync(filename);
        console.log("Written " + stats.size + " bytes to " + filename);
    });
};
