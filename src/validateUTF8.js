/* eslint-env node */

"use strict";

const fs = require("fs");
const path = require("path");

/**
 * Describes a single UTF-8 validation error at a specific byte offset.
 * @typedef {{ offset: Number, bytes: Number[], reason: String }} Utf8Error
 */

/**
 * Validates a Buffer for well-formed UTF-8 encoding.
 * Returns an array of errors, each with the byte offset, raw bytes and reason.
 *
 * UTF-8 encoding rules:
 *   1-byte  (ASCII):  0xxxxxxx  (0x00–0x7F)
 *   2-byte sequence:  110xxxxx 10xxxxxx
 *   3-byte sequence:  1110xxxx 10xxxxxx 10xxxxxx
 *   4-byte sequence:  11110xxx 10xxxxxx 10xxxxxx 10xxxxxx
 *
 * @param {Buffer} buf - Raw file contents
 * @return {Utf8Error[]} Array of errors (empty = valid)
 */
function validateUtf8(buf) {
    const errors = [];
    let i = 0;

    while (i < buf.length) {
        const byte = buf[i];
        let seqLen = 0;

        if ((byte & 0x80) === 0x00) {
            // Single-byte ASCII — always valid
            i++;
            continue;
        } else if ((byte & 0xE0) === 0xC0) {
            seqLen = 2;
        } else if ((byte & 0xF0) === 0xE0) {
            seqLen = 3;
        } else if ((byte & 0xF8) === 0xF0) {
            seqLen = 4;
        } else {
            // 0x80–0xBF  → unexpected continuation byte
            // 0xF8–0xFF  → invalid leading byte
            errors.push({
                offset: i,
                bytes: [byte],
                reason: (byte & 0xC0) === 0x80
                    ? "Unexpected continuation byte (no leading byte)"
                    : "Invalid leading byte"
            });
            i++;
            continue;
        }

        // Collect the full sequence
        const seqStart = i;
        const seqBytes = [byte];

        for (let k = 1; k < seqLen; k++) {
            if (i + k >= buf.length) {
                errors.push({
                    offset: seqStart,
                    bytes: seqBytes,
                    reason: `Truncated ${seqLen}-byte sequence (file ended early)`
                });
                seqBytes.push(null); // sentinel so we can skip past end
                break;
            }
            const cont = buf[i + k];
            if ((cont & 0xC0) !== 0x80) {
                errors.push({
                    offset: seqStart,
                    bytes: [...seqBytes, cont],
                    reason: `Invalid continuation byte at offset ${i + k} (expected 10xxxxxx, got 0x${cont.toString(16).padStart(2, "0").toUpperCase()})`
                });
                // Restart scan from the offending byte
                i += k;
                seqBytes.push(null);
                break;
            }
            seqBytes.push(cont);
        }

        // If the sequence completed without errors, check for overlong / out-of-range
        if (!seqBytes.includes(null)) {
            const codePoint = decodeCodePoint(seqBytes, seqLen);

            if (codePoint === null) {
                errors.push({
                    offset: seqStart,
                    bytes: seqBytes,
                    reason: "Could not decode code point"
                });
            } else if (isOverlong(codePoint, seqLen)) {
                errors.push({
                    offset: seqStart,
                    bytes: seqBytes,
                    reason: `Overlong encoding (U+${codePoint.toString(16).toUpperCase().padStart(4, "0")} should use fewer bytes)`
                });
            } else if (codePoint > 0x10FFFF) {
                errors.push({
                    offset: seqStart,
                    bytes: seqBytes,
                    reason: `Code point U+${codePoint.toString(16).toUpperCase()} exceeds Unicode maximum (U+10FFFF)`
                });
            } else if (codePoint >= 0xD800 && codePoint <= 0xDFFF) {
                errors.push({
                    offset: seqStart,
                    bytes: seqBytes,
                    reason: `Surrogate code point U+${codePoint.toString(16).toUpperCase().padStart(4, "0")} is not valid in UTF-8`
                });
            }
            i += seqLen;
        }
    }

    return errors;
}

/**
 * Decodes the Unicode code point from a completed multi-byte sequence.
 * @param {Number[]} bytes - The raw bytes of the sequence
 * @param {Number} seqLen  - Expected sequence length (2, 3, or 4)
 * @return {Number|null} The code point, or null on failure
 */
function decodeCodePoint(bytes, seqLen) {
    const masks = [0, 0, 0x1F, 0x0F, 0x07];
    let cp = bytes[0] & masks[seqLen];
    for (let k = 1; k < seqLen; k++) {
        cp = (cp << 6) | (bytes[k] & 0x3F);
    }
    return cp;
}

/**
 * Returns true if a code point was encoded with more bytes than necessary.
 * @param {Number} codePoint
 * @param {Number} seqLen - The number of bytes actually used
 * @return {Boolean}
 */
function isOverlong(codePoint, seqLen) {
    if (seqLen === 2 && codePoint < 0x80)  return true;
    if (seqLen === 3 && codePoint < 0x800) return true;
    if (seqLen === 4 && codePoint < 0x10000) return true;
    return false;
}

/**
 * Formats a row of context bytes from the buffer around an error offset,
 * highlighting the offending bytes in a hex+ASCII dump style.
 * @param {Buffer} buf
 * @param {Number} offset       - Start offset of the bad sequence
 * @param {Number[]} badBytes   - The bytes that caused the error
 * @return {String}
 */
function formatContext(buf, offset, badBytes) {
    const CONTEXT = 4;
    const start = Math.max(0, offset - CONTEXT);
    const end   = Math.min(buf.length, offset + badBytes.length + CONTEXT);
    const badEnd = offset + badBytes.length;

    const hexParts = [];
    const charParts = [];

    for (let i = start; i < end; i++) {
        const b = buf[i];
        const hex = b.toString(16).padStart(2, "0").toUpperCase();
        const isBad = i >= offset && i < badEnd;
        hexParts.push(isBad ? `[${hex}]` : ` ${hex} `);
        charParts.push(b >= 0x20 && b < 0x7F ? String.fromCharCode(b) : ".");
    }

    return `  Hex  : ${hexParts.join(" ")}\n  ASCII: ${charParts.join("  ")}`;
}

/**
 * Entry point — reads the file given as the first CLI argument and validates it.
 * @return {void}
 */
function main() {
    const filePath = process.argv[2];

    if (!filePath) {
        console.error("Usage: node validate-utf8.js <file>");
        process.exit(1);
    }

    const resolved = path.resolve(filePath);

    if (!fs.existsSync(resolved)) {
        console.error(`File not found: ${resolved}`);
        process.exit(1);
    }

    const buf = fs.readFileSync(resolved);
    console.log(`Validating: ${resolved}  (${buf.length} bytes)\n`);

    const errors = validateUtf8(buf);

    if (errors.length === 0) {
        console.log("✓ File is valid UTF-8.");
        process.exit(0);
    }

    console.log(`✗ Found ${errors.length} UTF-8 error${errors.length === 1 ? "" : "s"}:\n`);

    for (const err of errors) {
        const hexList = err.bytes
            .filter(b => b !== null)
            .map(b => `0x${b.toString(16).padStart(2, "0").toUpperCase()}`)
            .join(", ");

        console.log(`  Offset ${err.offset} (0x${err.offset.toString(16).toUpperCase().padStart(6, "0")})`);
        console.log(`  Bytes  : ${hexList}`);
        console.log(`  Reason : ${err.reason}`);
        console.log(formatContext(buf, err.offset, err.bytes.filter(b => b !== null)));
        console.log();
    }

    process.exit(1);
}

main();
