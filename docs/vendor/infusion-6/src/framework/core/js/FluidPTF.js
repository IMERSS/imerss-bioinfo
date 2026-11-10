"use strict";

// import fluid from "./FluidView.js"

// The "Potentia Transmission Format" (PTF) - a MIME multipart (RFC 1341, RFC 2046) document holding all of the layer
// definitions, user potentia and live layer contents required to reconstruct a component instance at another location.
// See FLUID-7015

const fluidPTFScope = function (fluid) {
    const $t = fluid.proxySymbol;

    fluid.registerNamespace("fluid.ptf");

    // Matches the beginning of a function's source which may stand as an expression in its own right, as opposed to
    // a method shorthand such as `foo(a) {...}` which may only appear inside an object literal
    const functionExpressionRE = /^(async\s+)?(function\b|class\b|\(|[A-Za-z_$][\w$]*\s*=>)/;

    /**
     * Render a value as JavaScript source text. Plain objects and arrays are rendered recursively, functions by means
     * of their own source text and all other values as JSON.
     * @param {any} value - The value to be rendered
     * @param {String} indent - The indentation of the line on which the value begins
     * @return {String} JavaScript source text for the value
     */
    fluid.valueToJavaScript = function (value, indent = "") {
        const inner = indent + "    ";
        let togo;
        if (typeof(value) === "function") {
            const source = value.toString();
            if (source.includes("[native code]")) {
                togo = `fluid.unavailable(${JSON.stringify("Native function " + value.name + " cannot be transmitted")})`;
            } else {
                togo = functionExpressionRE.test(source) ? source : "function " + source;
            }
        } else if (Array.isArray(value)) {
            const elements = value.map(element => inner + fluid.valueToJavaScript(element, inner));
            togo = value.length === 0 ? "[]" : "[\n" + elements.join(",\n") + "\n" + indent + "]";
        } else if (fluid.isPlainObject(value, true)) {
            const keys = Object.keys(value);
            const members = keys.map(key => {
                const keyText = /^[A-Za-z_$][\w$]*$/.test(key) ? key : JSON.stringify(key);
                return inner + keyText + ": " + fluid.valueToJavaScript(value[key], inner);
            });
            togo = keys.length === 0 ? "{}" : "{\n" + members.join(",\n") + "\n" + indent + "}";
        } else {
            togo = value === undefined ? "undefined" : JSON.stringify(value);
        }
        return togo;
    };

    /**
     * Render a layer definition as a `fluid.def` call in JavaScript source text. Note that any global functions
     * referenced by name from the definition are not included.
     * @param {String} layerName - The name of the layer
     * @param {LayerDef|Signal<LayerDef>} layerDef - The layer's definition
     * @return {String} JavaScript source text which will register the layer definition when evaluated
     */
    fluid.layerToJavaScript = function (layerName, layerDef) {
        return `fluid.def(${JSON.stringify(layerName)}, ${fluid.valueToJavaScript(fluid.deSignal(layerDef))});\n`;
    };

    /**
     * Determine the MIME type in which the named layer should be transmitted or edited. Live layers, whose names are
     * rendered sites beginning with `{`, are JSON. Layers whose own definition carries the tag layer
     * `fluid.sfcLayer` were loaded from a Single File Component. All other layers are JavaScript.
     * @param {String} layerName - The name of the layer
     * @return {String} The MIME type for the layer, one of the values in `fluid.layerMimeTypes`
     */
    fluid.layerMimeType = function (layerName) {
        let togo = fluid.layerMimeTypes.javascript;
        if (layerName.startsWith("{")) {
            togo = fluid.layerMimeTypes.json;
        } else {
            const layerDef = fluid.deSignal(fluid.readLayer(layerName).get().raw);
            if (fluid.isPlainObject(layerDef, true) && !fluid.isUnavailable(layerDef)
                && fluid.makeArray(layerDef.$layers).includes("fluid.sfcLayer")) {
                togo = fluid.layerMimeTypes.sfc;
            }
        }
        return togo;
    };

    /**
     * @typedef {Object} JSLayerSource
     * @property {String} body - The text of a JavaScript layer part, as registered by `fluid.ptf.registerLayerPart`
     * @property {Object|null} def - The definition of the layer which evaluating the text produced, or `null` whilst it
     * is being evaluated
     */

    // The text of each layer registered from a JavaScript layer part. Unlike a layer's definition, from which its text
    // is otherwise rendered by fluid.layerToJavaScript, this holds everything else the text does - e.g. functions it
    // assigns alongside its fluid.def call, which the definition refers to by name, and any comments.
    /** @type {Object<String, JSLayerSource>} */
    fluid.ptf.jsLayerSources = Object.create(null);

    /**
     * Retrieve the text from which a JavaScript layer was registered, if it is still current - that is, the layer has
     * not been redefined since by other means, e.g. by a direct call to `fluid.def`
     * @param {String} layerName - The name of the layer
     * @return {String|undefined} The text of the layer, or `undefined` if there is none current
     */
    fluid.ptf.jsLayerSourceText = function (layerName) {
        const record = fluid.ptf.jsLayerSources[layerName];
        return record && (record.def === null || record.def === fluid.def(layerName)) ? record.body : undefined;
    };

    // Readers and writers of the provenance recorded in the text of a layer, keyed by the layer's MIME type - see
    // fluid.readSFCProvenance and fluid.readJSProvenance
    fluid.ptf.provenanceAccessors = {
        [fluid.layerMimeTypes.sfc]: {read: text => fluid.readSFCProvenance(text), write: (text, provenance) => fluid.writeSFCProvenance(text, provenance)},
        [fluid.layerMimeTypes.javascript]: {read: text => fluid.readJSProvenance(text), write: (text, provenance) => fluid.writeJSProvenance(text, provenance)}
    };

    /**
     * Read the provenance recorded in a layer part
     * @param {PTFPart} part - The layer part
     * @return {SFCProvenance|null} The provenance it records, or `null` if it records none or its type cannot hold any
     */
    fluid.ptf.readLayerProvenance = function (part) {
        const accessors = fluid.ptf.provenanceAccessors[part.contentType];
        return accessors ? accessors.read(part.body) : null;
    };

    /**
     * Write provenance into a layer part, replacing any it already records
     * @param {PTFPart} part - The layer part
     * @param {SFCProvenance} provenance - The provenance to be written
     * @return {PTFPart} A copy of the part recording the provenance, or the part itself if its type cannot hold any
     */
    fluid.ptf.writeLayerProvenance = function (part, provenance) {
        const accessors = fluid.ptf.provenanceAccessors[part.contentType];
        return accessors ? {...part, body: accessors.write(part.body, provenance)} : part;
    };

    /**
     * Determine the source text for the named layer in the representation given by `fluid.layerMimeType`.
     * @param {String} layerName - The name of the layer
     * @return {PTFPart} A layer part holding the layer's source text and MIME type
     */
    fluid.ptf.layerToPart = function (layerName) {
        const mimeType = fluid.layerMimeType(layerName);
        const sfcText = mimeType === fluid.layerMimeTypes.sfc ? fluid.sfcStore[layerName]?.textSignal.get() : undefined;
        const jsText = mimeType === fluid.layerMimeTypes.javascript ? fluid.ptf.jsLayerSourceText(layerName) : undefined;
        let togo;
        if (typeof(sfcText) === "string") {
            togo = {kind: "layer", contentType: mimeType, filename: layerName, body: sfcText};
        } else if (jsText !== undefined) {
            togo = {kind: "layer", contentType: mimeType, filename: layerName, body: jsText};
        } else {
            togo = {
                kind: "layer",
                contentType: fluid.layerMimeTypes.javascript,
                filename: layerName,
                body: fluid.layerToJavaScript(layerName, fluid.readLayer(layerName).get().raw)
            };
        }
        return togo;
    };

    /**
     * A single part of a PTF document.
     * @typedef {Object} PTFPart
     * @property {String} kind - The part's kind, transmitted as its Content-Description - "layer" for a layer
     * definition ("Potentia I"), "potentia" for a user potentia or "live" for a component's live layer ("Potentia II")
     * @property {String} contentType - The MIME type of the part's body
     * @property {String} filename - For a layer part, the layer name - otherwise, the path of the component relative to
     * the transmitted component as rendered by `fluid.ptf.segsToFilename`
     * @property {String} body - The text of the part
     * @property {PTFPart[]} [parts] - For a part which is itself a multipart entity, its nested parts. When encoding, these
     * are supplied in place of `body`
     * @property {Object<String, String>} [headers] - All headers of a decoded part, keyed by lower-cased header name
     */

    /**
     * Render the path segments of a component relative to the transmitted component as a part filename. The
     * transmitted component itself is rendered as `/`.
     * @param {String[]} segs - Path segments relative to the transmitted component
     * @return {String} The filename for the component's parts
     */
    fluid.ptf.segsToFilename = function (segs) {
        return "/" + segs.map(seg => encodeURIComponent(seg)).join("/");
    };

    /**
     * Parse a part filename rendered by `fluid.ptf.segsToFilename` back into path segments.
     * @param {String} filename - The part filename
     * @return {String[]} The path segments relative to the transmitted component
     */
    fluid.ptf.filenameToSegs = function (filename) {
        return filename.split("/").filter(seg => seg !== "").map(seg => decodeURIComponent(seg));
    };

    /**
     * Flatten a live layer, which holds signals at the paths which have been written during the component's
     * lifetime, into a map of paths to the current values of those signals.
     * @param {Object} liveLayer - The live layer of a component's shadow
     * @param {String[]} segs - The path segments of `liveLayer` within the component's live layer
     * @param {Object<String, any>} togo - Accumulates the flattened paths and values
     * @return {Object<String, any>} The map of paths to values
     */
    fluid.ptf.flattenLiveLayer = function (liveLayer, segs = [], togo = {}) {
        fluid.each(liveLayer, (value, key) => {
            const childSegs = [...segs, key];
            if (fluid.isSignal(value)) {
                const amenable = fluid.ptf.toJSONAmenable(fluid.deSignal(value.get()));
                if (amenable !== undefined) {
                    togo[fluid.composeSegments(childSegs)] = amenable;
                }
            } else {
                fluid.ptf.flattenLiveLayer(value, childSegs, togo);
            }
        });
        return togo;
    };

    /**
     * Reduce a value to the parts of it which can be faithfully transmitted as JSON. Primitives, plain objects and
     * arrays are retained, whereas any other values such as functions or DOM nodes, which are typically supplied by the
     * host environment (for example the `container` of a component's view), are discarded, as are any objects all of
     * whose members are discarded.
     * @param {any} value - The value to be reduced
     * @return {any} The JSON-amenable parts of the value, or `undefined` if none of it is amenable
     */
    fluid.ptf.toJSONAmenable = function (value) {
        let togo;
        if (Array.isArray(value)) {
            togo = value.map(element => fluid.ptf.toJSONAmenable(element) ?? null);
        } else if (fluid.isPlainObject(value, true)) {
            const amenable = {};
            fluid.each(value, (member, key) => {
                const amenableMember = fluid.ptf.toJSONAmenable(member);
                if (amenableMember !== undefined) {
                    amenable[key] = amenableMember;
                }
            });
            // An object all of whose members were discarded, e.g. a view holding just a container, is itself discarded
            const allDiscarded = Object.keys(value).length > 0 && Object.keys(amenable).length === 0;
            togo = allDiscarded ? undefined : amenable;
        } else if (value === null || ["string", "number", "boolean"].includes(typeof(value))) {
            togo = value;
        }
        return togo;
    };

    /**
     * Render the user potentia of a component as a JSON-amenable object. For the transmitted component, its full list
     * of directly applied layer names is written as `$layers`.
     * @param {Shadow} shadow - The shadow of the component
     * @param {Boolean} isRoot - `true` if this is the transmitted component
     * @return {Object|null} The component's user potentia, or `null` if it has none
     */
    fluid.ptf.shadowToPotentia = function (shadow, isRoot) {
        const potentia = shadow.potentia.get();
        const userRecords = potentia.mergeRecords.filter(mergeRecord => mergeRecord.mergeRecordType === "user" && mergeRecord.layer);
        const merged = fluid.ptf.toJSONAmenable(Object.assign({}, ...userRecords.map(mergeRecord => mergeRecord.layer)));
        let togo = null;
        if (isRoot) {
            // Written first for legibility, and last so that it overrides any partial $layers in the user records
            togo = Object.assign({$layers: potentia.layerNames}, merged, {$layers: potentia.layerNames});
        } else if (userRecords.length > 0) {
            togo = merged;
        }
        return togo;
    };

    /**
     * Retrieve the shadow of a component from its proxy. Unlike reading its metadata, this succeeds even while the
     * component is unavailable, for example while its layers are loading.
     * @param {fluid.component} component - The proxy for the component
     * @return {Shadow} The component's shadow
     */
    fluid.ptf.componentToShadow = function (component) {
        return component[$t].shadow;
    };

    /**
     * Determine the names of the layers from which a layer derives, whether directly or through its parents
     * @param {String} layerName - The name of the layer
     * @param {Set<String>} [togo] - Accumulates the names found
     * @return {Set<String>} The names of all of the layer's ancestors
     */
    fluid.ptf.layerAncestors = function (layerName, togo = new Set()) {
        const layerRec = fluid.readLayer(layerName).get();
        const def = fluid.isUnavailable(layerRec) ? null : fluid.deSignal(layerRec.raw);
        const parents = fluid.isPlainObject(def, true) ? fluid.makeArray(def.$layers) : [];
        parents.filter(parent => typeof(parent) === "string" && !togo.has(parent)).forEach(parent => {
            togo.add(parent);
            fluid.ptf.layerAncestors(parent, togo);
        });
        return togo;
    };

    /**
     * Sort layer names so that the most derived layers of any hierarchy come first and its base layers last. Each
     * layer is ranked by the length of the longest chain of layers among those supplied which derive from it, and
     * layers of equal rank retain their supplied order - so that if the layer of a transmitted component is supplied
     * first, it comes first.
     * @param {String[]} layerNames - The names of the layers
     * @return {String[]} The sorted names
     */
    fluid.ptf.sortLayerNames = function (layerNames) {
        const ancestors = new Map(layerNames.map(layerName => [layerName, fluid.ptf.layerAncestors(layerName)]));
        const ranks = new Map();
        const rank = function (layerName, visiting) {
            if (!ranks.has(layerName)) {
                // A cycle, which no registered layers can form, is broken where it is found
                const derived = layerNames.filter(other => !visiting.has(other) && ancestors.get(other).has(layerName));
                const nextVisiting = new Set([...visiting, layerName]);
                ranks.set(layerName, derived.reduce((acc, other) => Math.max(acc, rank(other, nextVisiting) + 1), 0));
            }
            return ranks.get(layerName);
        };
        return layerNames.map((layerName, index) => ({layerName, index, rank: rank(layerName, new Set())}))
            .sort((a, b) => a.rank - b.rank || a.index - b.index)
            .map(({layerName}) => layerName);
    };

    /**
     * Assemble all of the parts required to reconstruct the supplied component at another location. These are
     * i) the definitions of all user layers resolved in the `$layers` of the component and any of its subcomponents,
     * sorted by `fluid.ptf.sortLayerNames` so that the layer of the component itself comes first,
     * ii) the user potentia of the component and any subcomponents having one and iii) the contents of the live layers
     * of the component and its subcomponents.
     * @param {fluid.component} component - The component to be transmitted
     * @return {PTFPart[]} The parts required to reconstruct the component
     */
    fluid.ptf.componentToParts = function (component) {
        const rootShadow = fluid.ptf.componentToShadow(component);
        // The layers applied to the component itself are found first, so that they come first amongst those of equal rank
        const layerNames = new Set(rootShadow.potentia.get().layerNames.filter(layerName =>
            !fluid.isReferenceOrExpander(layerName) && fluid.isUserLayer(layerName)));
        const potentiaParts = [];
        const liveParts = [];
        const visit = function (shadow, segs) {
            const isRoot = segs.length === 0;
            fluid.deSignal(shadow.that.$layers).forEach(layerName => {
                if (fluid.isUserLayer(layerName)) {
                    layerNames.add(layerName);
                }
            });
            const filename = fluid.ptf.segsToFilename(segs);
            const potentia = fluid.ptf.shadowToPotentia(shadow, isRoot);
            if (potentia) {
                potentiaParts.push({kind: "potentia", contentType: fluid.layerMimeTypes.json, filename, body: JSON.stringify(potentia, null, 4)});
            }
            const live = fluid.ptf.flattenLiveLayer(shadow.liveLayer);
            if (Object.keys(live).length > 0) {
                liveParts.push({kind: "live", contentType: fluid.layerMimeTypes.json, filename, body: JSON.stringify(live, null, 4)});
            }
            fluid.each(shadow.childComponents, (childShadow, memberName) => {
                // Only visit components created in place - one injected from elsewhere, perhaps an ancestor, will be
                // reconstructed from the reference held in its parent's potentia
                if (childShadow.path === fluid.composeSegment(shadow.path, memberName)) {
                    visit(childShadow, [...segs, memberName]);
                }
            });
        };
        visit(rootShadow, []);
        const layerParts = fluid.ptf.sortLayerNames([...layerNames]).map(layerName => fluid.ptf.layerToPart(layerName));
        return [...layerParts, ...potentiaParts, ...liveParts];
    };

    fluid.ptf.preamble = "This is a Potentia Transmission Format (PTF) document holding the layers and potentia of an Infusion component.";

    /**
     * Allocate a multipart boundary which does not occur in any of the supplied texts.
     * @param {String[]} texts - The texts of the parts to be encoded
     * @return {String} A suitable boundary
     */
    fluid.ptf.allocateBoundary = function (texts) {
        let boundary;
        do {
            boundary = "ptf-boundary-" + Math.random().toString(36).substring(2, 12);
        } while (texts.some(text => text.includes(boundary)));
        return boundary;
    };

    /**
     * Encode a set of parts as the body of a multipart entity. A part holding nested `parts` rather than a `body` is
     * encoded as a nested multipart entity with its own boundary, as described in RFC 2046 section 5.1.1.
     * @param {PTFPart[]} parts - The parts to be encoded
     * @param {String} [preamble] - Text to be placed before the first part, which is ignored on decoding
     * @return {Object} A record with members `boundary` holding the allocated boundary and `body` holding the encoded body
     */
    fluid.ptf.encodeBody = function (parts, preamble) {
        const encoded = parts.map(part => {
            let togo;
            if (part.parts) {
                const nested = fluid.ptf.encodeBody(part.parts);
                togo = {contentType: `multipart/mixed; boundary="${nested.boundary}"`, body: nested.body};
            } else {
                togo = {contentType: `${part.contentType}; charset=utf-8`, body: part.body};
            }
            return togo;
        });
        const boundary = fluid.ptf.allocateBoundary(encoded.map(rec => rec.body));
        const blocks = parts.map((part, i) =>
            `--${boundary}\n` +
            `Content-Type: ${encoded[i].contentType}\n` +
            `Content-Disposition: attachment; filename=${JSON.stringify(part.filename)}\n` +
            `Content-Description: ${part.kind}\n` +
            "\n" +
            // The line break preceding each delimiter belongs to the delimiter rather than the body
            encoded[i].body + "\n"
        );
        const body = (preamble ? preamble + "\n" : "") + blocks.join("") + `--${boundary}--`;
        return {boundary, body};
    };

    /**
     * Encode a set of parts as a PTF document. Lines are separated with plain LF rather than the CRLF of RFC 1341 so
     * that the document can be read and edited as ordinary text - `fluid.ptf.decode` accepts either.
     * @param {PTFPart[]} parts - The parts to be encoded
     * @param {String} [preamble] - Text to be placed before the first part, defaulting to `fluid.ptf.preamble`
     * @return {String} The text of the PTF document
     */
    fluid.ptf.encode = function (parts, preamble = fluid.ptf.preamble) {
        const {boundary, body} = fluid.ptf.encodeBody(parts, preamble);
        return "MIME-Version: 1.0\n" +
            `Content-Type: multipart/mixed; boundary="${boundary}"\n` +
            "\n" +
            body + "\n";
    };

    /**
     * Encode the supplied component as a PTF document.
     * @param {fluid.component} component - The component to be transmitted
     * @return {String} The text of the PTF document
     */
    fluid.ptf.componentToPTF = function (component) {
        return fluid.ptf.encode(fluid.ptf.componentToParts(component));
    };

    /**
     * Parse a block of MIME headers into a map keyed by lower-cased header name. Folded continuation lines are joined.
     * @param {String[]} lines - The header lines
     * @return {Object<String, String>} The parsed headers
     */
    fluid.ptf.parseHeaders = function (lines) {
        const headers = {};
        let lastKey = null;
        lines.forEach(line => {
            if (/^[ \t]/.test(line)) {
                if (lastKey) {
                    headers[lastKey] += " " + line.trim();
                }
            } else {
                const colon = line.indexOf(":");
                if (colon !== -1) {
                    lastKey = line.substring(0, colon).trim().toLowerCase();
                    headers[lastKey] = line.substring(colon + 1).trim();
                }
            }
        });
        return headers;
    };

    /**
     * Parse a structured header value such as `multipart/mixed; boundary="xyz"` into its main value and parameters.
     * @param {String} [value] - The header value
     * @return {Object} A record with member `value` holding the main value (lower-cased) and `params` holding the parameters keyed
     * by lower-cased name
     */
    fluid.ptf.parseHeaderValue = function (value = "") {
        const semi = value.indexOf(";");
        const main = semi === -1 ? value : value.substring(0, semi);
        const params = {};
        const paramRE = /;\s*([^=;\s]+)\s*=\s*("((?:[^"\\]|\\.)*)"|[^;\s]*)/g;
        let match;
        while ((match = paramRE.exec(value)) !== null) {
            params[match[1].toLowerCase()] = match[3] !== undefined ? match[3].replace(/\\(.)/g, "$1") : match[2];
        }
        return {value: main.trim().toLowerCase(), params};
    };

    /**
     * Split text into a header block and body at the first empty line.
     * @param {String} text - Text with LF line endings beginning with a header block
     * @return {Object} A record with members `headers` holding the parsed headers and `body` holding the remaining text
     */
    fluid.ptf.splitHeaders = function (text) {
        const blank = text.indexOf("\n\n");
        const headerText = blank === -1 ? text : text.substring(0, blank);
        const body = blank === -1 ? "" : text.substring(blank + 2);
        return {headers: fluid.ptf.parseHeaders(headerText.split("\n")), body};
    };

    // Matches the header with which a PTF document begins
    fluid.ptf.startRE = /MIME-Version:[ \t]*1\.0/i;

    /**
     * Extract a PTF document from text which may hold other material before it, e.g. a covering message pasted
     * together with it, by discarding everything before the first occurrence of `MIME-Version: 1.0`. Line endings are
     * normalised to LF. Any material following the document's close delimiter is discarded on decoding.
     * @param {String} text - The text holding the document
     * @return {String|null} The text of the document, or `null` if the text holds no `MIME-Version: 1.0` header
     */
    fluid.ptf.extractDocument = function (text) {
        const start = typeof(text) === "string" ? text.search(fluid.ptf.startRE) : -1;
        return start === -1 ? null : text.substring(start).replace(/\r\n/g, "\n");
    };

    /**
     * Determine whether the supplied text holds a PTF document - that is, a multipart MIME document whose top-level
     * Content-Type specifies a boundary, beginning with `MIME-Version: 1.0` after any other material. Suitable for
     * sniffing clipboard contents on paste.
     * @param {String} text - The text to be tested
     * @return {Boolean} `true` if the text appears to hold a PTF document
     */
    fluid.ptf.isPTF = function (text) {
        const extracted = fluid.ptf.extractDocument(text);
        let togo = false;
        if (extracted !== null) {
            const {headers} = fluid.ptf.splitHeaders(extracted);
            const contentType = fluid.ptf.parseHeaderValue(headers["content-type"]);
            togo = contentType.value.startsWith("multipart/") && !!contentType.params.boundary;
        }
        return togo;
    };

    /**
     * Decode the body of a multipart entity into its parts. Any part which is itself a multipart entity is decoded
     * recursively into its `parts` member.
     * @param {String} body - The body of the multipart entity, with LF line endings
     * @param {String} boundary - The entity's boundary
     * @return {PTFPart[]} The decoded parts
     */
    fluid.ptf.decodeBody = function (body, boundary) {
        const delimiter = "--" + boundary;
        // Each delimiter must begin a line - the first may begin the body if the preamble is empty
        const segments = ("\n" + body).split("\n" + delimiter);
        // Discard the preamble and anything following the close delimiter
        const closeIndex = segments.findIndex(segment => segment.startsWith("--"));
        const partSegments = segments.slice(1, closeIndex === -1 ? segments.length : closeIndex);
        return partSegments.map(segment => {
            // Discard any transport padding and the line break following the delimiter
            const partText = segment.replace(/^[ \t]*\n/, "");
            const split = fluid.ptf.splitHeaders(partText);
            const contentType = fluid.ptf.parseHeaderValue(split.headers["content-type"] || "text/plain");
            const disposition = fluid.ptf.parseHeaderValue(split.headers["content-disposition"]);
            const part = {
                kind: (split.headers["content-description"] || "").trim().toLowerCase(),
                contentType: contentType.value,
                filename: disposition.params.filename,
                body: split.body,
                headers: split.headers
            };
            if (contentType.value.startsWith("multipart/") && contentType.params.boundary) {
                part.parts = fluid.ptf.decodeBody(split.body, contentType.params.boundary);
            }
            return part;
        });
    };

    /**
     * Decode a PTF document into its parts.
     * @param {String} text - The text of the PTF document, with either LF or CRLF line endings, which may be preceded
     * by other material as described for `fluid.ptf.extractDocument`
     * @return {PTFPart[]|Unavailable} The decoded parts, or an unavailable value if the text is not a PTF document
     */
    fluid.ptf.decode = function (text) {
        let togo;
        if (fluid.ptf.isPTF(text)) {
            const {headers, body} = fluid.ptf.splitHeaders(fluid.ptf.extractDocument(text));
            const boundary = fluid.ptf.parseHeaderValue(headers["content-type"]).params.boundary;
            togo = fluid.ptf.decodeBody(body, boundary);
        } else {
            togo = fluid.unavailable("Text is not a Potentia Transmission Format document", "error");
        }
        return togo;
    };

    /**
     * Register a Single File Component whose text is supplied directly rather than fetched from a URL, and
     * arrange that its injections will be bound into documents when the layer is demanded.
     * @param {String} layerName - The name of the layer defined by the SFC
     * @param {String} text - The text of the SFC
     * @return {SFCRecord} The record tracking the SFC
     */
    fluid.loadSFCText = function (layerName, text) {
        const rec = fluid.readSFC(layerName);
        if (!rec.parseEffect) {
            rec.loadCompletion = fluid.cell(fluid.unavailable(`SFC for ${layerName} is loading`, "pending"),
                {name: `load completion for SFC for layer ${layerName}`});
            rec.textSignal.set(text);
            rec.parseEffect = fluid.parseSFC(rec, layerName);
        } else {
            rec.textSignal.set(text);
        }
        fluid.importMap[layerName] ||= {loadStyle: "sfc"};
        return rec;
    };

    /**
     * Register the layer definition held in a PTF layer part. The injections of an SFC are bound into the default
     * document straight away, as for one imported by `<fluid-import>`, since its layer is otherwise only defined once
     * some component demands it - a host which awaits the layer before constructing anything would wait forever.
     * @param {PTFPart} part - The layer part
     */
    fluid.ptf.registerLayerPart = function (part) {
        if (part.contentType === fluid.layerMimeTypes.sfc) {
            fluid.loadSFCText(part.filename, part.body);
            if (fluid.defaultDocument) {
                fluid.subscribeDocToInjections(part.filename, fluid.defaultDocument);
            }
        } else if (part.contentType === fluid.layerMimeTypes.javascript) {
            // The text is recorded before it is evaluated, so that the history of the layer's definition, which is
            // recorded synchronously as it is defined, records the text rather than a rendering of the definition
            const record = {body: part.body, def: null};
            fluid.ptf.jsLayerSources[part.filename] = record;
            try {
                // Evaluating a transmitted layer is equivalent in trust to loading an SFC from the same source
                new Function("fluid", part.body)(fluid);
                record.def = fluid.def(part.filename);
            } finally {
                if (record.def === null) {
                    delete fluid.ptf.jsLayerSources[part.filename];
                }
            }
        } else if (part.contentType === fluid.layerMimeTypes.json) {
            fluid.def(part.filename, JSON.parse(part.body));
        } else {
            fluid.log(fluid.logLevel.WARN, `Ignoring PTF layer part for ${part.filename} with unrecognised content type ${part.contentType}`);
        }
    };

    /**
     * Resolve the shadow of the component found at the supplied path segments relative to a root shadow.
     * @param {Shadow} rootShadow - The shadow from which to resolve
     * @param {String[]} segs - Path segments relative to the root shadow
     * @return {Shadow|undefined} The resolved shadow, or `undefined` if there is no component at the path
     */
    fluid.ptf.resolveShadow = function (rootShadow, segs) {
        return segs.reduce((shadow, seg) => shadow?.childComponents[seg], rootShadow);
    };

    /**
     * Await the availability of a component.
     * @param {Shadow} shadow - The shadow of the component
     * @return {Promise<fluid.component>} A promise resolving once the component is available
     */
    fluid.ptf.awaitAvailable = function (shadow) {
        return fluid.cell.waitFor(shadow.availableInstance);
    };

    /**
     * @typedef {Object} PTFInstantiation
     * @property {fluid.component} that - The reconstructed component
     * @property {String[]} unresolved - The filenames of any potentia or live parts which could not be applied since
     * no component was found at their path
     */

    /**
     * Register the layer definitions held in the layer parts of a PTF document. Any layers which are not already
     * defined are registered, unless `overrideLayers` is set in which case all transmitted layers are registered.
     * @param {PTFPart[]} parts - The decoded parts of the PTF document - any which are not layer parts are ignored
     * @param {Boolean} [overrideLayers] - If `true`, transmitted layers override any existing definitions
     */
    fluid.ptf.registerLayerParts = function (parts, overrideLayers) {
        parts.filter(part => part.kind === "layer").forEach(part => {
            const existing = fluid.readLayer(part.filename).get();
            if (overrideLayers || fluid.isUnavailable(existing) || fluid.isUnavailable(fluid.deSignal(existing.raw))) {
                fluid.ptf.registerLayerPart(part);
            }
        });
    };

    /**
     * Determine whether a part of a PTF document holds the potentia of its root component.
     * @param {PTFPart} part - The part to be tested
     * @return {Boolean} `true` if the part is a potentia part for the path `/`
     */
    fluid.ptf.isRootPotentiaPart = function (part) {
        return part.kind === "potentia" && fluid.ptf.filenameToSegs(part.filename).length === 0;
    };

    /**
     * Apply the potentia of subcomponents and the live layer contents held in the parts of a PTF document to an
     * existing component and its subcomponents. Any potentia for the root component itself is ignored, since this
     * determines how the component is created rather than anything which can be applied to it. The live layer contents
     * are restored state rather than fresh changes, and so are not recorded in the history.
     * @param {fluid.component} that - The component to which the parts are to be applied
     * @param {PTFPart[]} parts - The decoded parts of the PTF document - any which are not potentia or live parts are ignored
     * @return {Promise<String[]>} A promise for the filenames of any parts which could not be applied since no
     * component was found at their path, resolving once all parts have been applied
     */
    fluid.ptf.applyParts = async function (that, parts) {
        const rootShadow = fluid.ptf.componentToShadow(that);
        await fluid.ptf.awaitAvailable(rootShadow);
        const unresolved = [];
        parts.filter(part => part.kind === "potentia" && !fluid.ptf.isRootPotentiaPart(part)).forEach(part => {
            const segs = fluid.ptf.filenameToSegs(part.filename);
            const parentShadow = fluid.ptf.resolveShadow(rootShadow, segs.slice(0, -1));
            if (parentShadow) {
                const layer = JSON.parse(part.body);
                fluid.pushPotentia(parentShadow, fluid.peek(segs), [{mergeRecordType: "user", layer}], fluid.makeArray(layer.$layers));
            } else {
                unresolved.push(part.filename);
            }
        });
        fluid.cell.stabilize();
        for (const part of parts.filter(part => part.kind === "live")) {
            const shadow = fluid.ptf.resolveShadow(rootShadow, fluid.ptf.filenameToSegs(part.filename));
            if (shadow) {
                await fluid.ptf.awaitAvailable(shadow);
                fluid.history.withoutRecording(() => fluid.each(JSON.parse(part.body), (value, path) => {
                    fluid.setForComponent(shadow.that, path, value);
                }));
            } else {
                unresolved.push(part.filename);
            }
        }
        fluid.cell.stabilize();
        return unresolved;
    };

    /**
     * Reconstruct a component from the parts of a PTF document. Its layers are registered as by
     * `fluid.ptf.registerLayerParts`. The component is constructed as a free component from the root potentia, and
     * once it becomes available, any further potentia and live layer contents are applied to it and its subcomponents.
     * @param {PTFPart[]} parts - The decoded parts of the PTF document
     * @param {Object} [options] - Options governing reconstruction
     * @param {Boolean} [options.overrideLayers] - If `true`, transmitted layers override any existing definitions
     * @param {Object} [options.potentia] - Further potentia supplied by the receiving environment, for example a
     * `container`, which is merged over the transmitted root potentia
     * @param {fluid.component} [options.parent] - A component within which the root component is to be constructed, as
     * by `fluid.initChildComponent` - by default it is constructed as a free component at the root. Its parts are
     * written relative to the root component wherever it is constructed.
     * @param {String} [options.memberName] - The member name under which the root component is to be constructed within
     * `options.parent`, as by `fluid.initChildComponent`
     * @return {Promise<PTFInstantiation>} A promise resolving once the component and its transmitted state are available
     */
    fluid.ptf.instantiateParts = async function (parts, options = {}) {
        const that = fluid.ptf.constructParts(parts, options);
        const unresolved = await fluid.ptf.applyParts(that, parts);
        return {that, unresolved};
    };

    /**
     * Construct the root component of a PTF document without waiting for it to become available, or applying any of
     * the document's further potentia or live parts, which may then be applied by `fluid.ptf.applyParts`. Its layers
     * are registered as by `fluid.ptf.registerLayerParts`. This allows a host to take responsibility for the component,
     * e.g. for destroying it, whilst it is still unavailable.
     * @param {PTFPart[]} parts - The decoded parts of the PTF document
     * @param {Object} [options] - Options governing reconstruction, as for `fluid.ptf.instantiateParts`
     * @return {fluid.component} The freshly constructed component, which may not yet be available
     */
    fluid.ptf.constructParts = function (parts, options = {}) {
        fluid.ptf.registerLayerParts(parts, options.overrideLayers);
        const rootPart = parts.find(fluid.ptf.isRootPotentiaPart);
        let togo;
        if (rootPart) {
            const rootPotentia = JSON.parse(rootPart.body);
            const [componentName, ...layerNames] = fluid.makeArray(rootPotentia.$layers);
            const argLayer = {...rootPotentia, ...options.potentia, $layers: layerNames};
            togo = options.parent ? fluid.initChildComponent(options.parent, componentName, argLayer, options.memberName) :
                fluid.initFreeComponent(componentName, argLayer);
        } else {
            throw fluid.unavailable("PTF document has no potentia for its root component", "error");
        }
        return togo;
    };

    /**
     * Reconstruct a component from a PTF document - see `fluid.ptf.instantiateParts`.
     * @param {String} text - The text of the PTF document
     * @param {Object} [options] - Options governing reconstruction, as for `fluid.ptf.instantiateParts`
     * @return {Promise<PTFInstantiation>} A promise resolving once the component and its transmitted state are available
     */
    fluid.ptf.instantiate = function (text, options) {
        const parts = fluid.ptf.decode(text);
        return fluid.isUnavailable(parts) ? Promise.reject(parts) : fluid.ptf.instantiateParts(parts, options);
    };

    /*** Undoable histories of an arena, and their persistence ***/

    // The undoable histories of live state and of layer definitions are kept by Fluid.js - see fluid.history.live and
    // fluid.history.definitions. PTF holds the source of a layer as the text from which it was loaded, e.g. that of its
    // Single File Component, so that a redefinition of the layer can be undone, and the histories persisted. The
    // following three functions replace those of Fluid.js, whose defaults hold the definition objects themselves.

    /**
     * Determine the source of a layer as currently defined, as the text of its layer part - replacing the default of
     * Fluid.js, which renders its definition
     * @param {String} layerName - The name of the layer
     * @return {LayerSource} Its source
     */
    fluid.history.layerSource = function (layerName) {
        const {contentType, body} = fluid.ptf.layerToPart(layerName);
        return {contentType, body};
    };

    /**
     * Determine the source of a layer from a definition of it, rendered as JavaScript - replacing the default of
     * Fluid.js, which holds the definition itself
     * @param {String} layerName - The name of the layer
     * @param {LayerDef} def - The definition
     * @return {LayerSource} The source
     */
    fluid.history.sourceFromDef = function (layerName, def) {
        return {contentType: fluid.layerMimeTypes.javascript, body: fluid.layerToJavaScript(layerName, def)};
    };

    /**
     * Define a layer from its source, by registering it as a layer part, without recording its redefinition -
     * replacing the default of Fluid.js, which writes a definition
     * @param {String} layerName - The name of the layer
     * @param {LayerSource} source - The source
     */
    fluid.history.applySource = function (layerName, source) {
        fluid.ptf.registerLayerPartQuietly({kind: "layer", filename: layerName, ...source});
    };

    /**
     * Determine whether a layer currently holds a definition
     * @param {String} layerName - The name of the layer
     * @return {Boolean} `true` if the layer is defined
     */
    fluid.ptf.isLayerDefined = function (layerName) {
        const existing = fluid.deSignal(fluid.readLayer(layerName).get().raw);
        return fluid.isPlainObject(existing, true) && !fluid.isUnavailable(existing);
    };

    /**
     * Register a layer part without recording it in `fluid.history.definitions`, e.g. whilst applying a record of the
     * history itself, or restoring a persisted arena
     * @param {PTFPart} part - The layer part
     */
    fluid.ptf.registerLayerPartQuietly = function (part) {
        const defined = fluid.ptf.isLayerDefined(part.filename);
        const source = {contentType: part.contentType, body: part.body};
        if (part.contentType === fluid.layerMimeTypes.sfc) {
            // An SFC is redefined once it has been parsed and injected, which may follow asynchronously - but not at all if
            // its text is unchanged
            if (defined && fluid.readSFC(part.filename).textSignal.get() !== part.body) {
                fluid.history.expectedRedefinitions.set(part.filename, Date.now() + fluid.history.expectedRedefinitionLifetime);
            }
            fluid.ptf.registerLayerPart(part);
        } else {
            fluid.history.withoutRecording(() => fluid.ptf.registerLayerPart(part));
        }
        fluid.history.layerSources.set(part.filename, source);
    };

    /**
     * @typedef {Object} PersistedHistory
     * @property {Object[]} records - The persisted records, oldest first
     * @property {Number} index - The number of records applied
     */

    /**
     * Render a history stack in a form which can be persisted as JSON. Records which cannot be persisted are omitted.
     * @param {HistoryStack} stack - The stack
     * @param {Function} [encode] - Accepts a record and returns a JSON-amenable form of it, or `null` if it cannot be
     * persisted - by default, records are persisted as they stand
     * @return {PersistedHistory} The stack's persistable form
     */
    fluid.ptf.historyToJSON = function (stack, encode = fluid.identity) {
        const index = stack.index.get();
        const encoded = stack.records.get().map(record => encode(record));
        return {
            records: encoded.filter(record => record !== null),
            index: encoded.slice(0, index).filter(record => record !== null).length
        };
    };

    /**
     * Restore a history stack from its persisted form. Records which can no longer be restored are omitted.
     * @param {HistoryStack} stack - The stack
     * @param {PersistedHistory} persisted - The persisted form of the stack, as produced by `fluid.ptf.historyToJSON`
     * @param {Function} [decode] - Accepts a persisted record and returns the record, or `null` if it can no longer be
     * restored - by default, records are restored as they stand
     */
    fluid.ptf.historyFromJSON = function (stack, persisted, decode = fluid.identity) {
        const decoded = persisted.records.map(record => decode(record));
        stack.records.set(decoded.filter(record => record !== null));
        stack.index.set(decoded.slice(0, persisted.index).filter(record => record !== null).length);
    };

    /**
     * Render a live history record in a form which can be persisted, referring to its site by its reference relative
     * to the root of the arena, which will remain valid once the arena has been restored - see `fluid.history.arenaRoot`
     * @param {LiveHistoryRec} record - The record
     * @return {Object} The persistable record
     */
    fluid.ptf.encodeLiveRecord = function (record) {
        return {
            type: "live",
            ref: record.ref,
            oldValue: fluid.ptf.toJSONAmenable(record.oldValue) ?? null,
            newValue: fluid.ptf.toJSONAmenable(record.newValue) ?? null
        };
    };

    /**
     * Restore a live history record from its persisted form. The record is retained with its reference even if this does
     * not currently resolve, since its component may be reconstructed later, e.g. on undoing its deletion.
     * @param {Object} persisted - The persisted record, as produced by `fluid.ptf.encodeLiveRecord`
     * @return {LiveHistoryRec|null} The record, or `null` if it was persisted with a reference of some other form
     */
    fluid.ptf.decodeLiveRecord = function (persisted) {
        return Array.isArray(persisted.ref?.segs) ? {type: "live", site: fluid.history.refToSite(persisted.ref), ref: persisted.ref,
            oldValue: persisted.oldValue, newValue: persisted.newValue} : null;
    };

    /**
     * @typedef {Object} PersistenceAdapter
     * @property {Function} load - Returns the text of the persisted arena, or `null` if none has been persisted
     * @property {Function} save - Accepts the text of the arena to be persisted
     */

    /**
     * A persistence adapter which persists nothing
     * @type {PersistenceAdapter}
     */
    fluid.emptyPersistenceAdapter = {
        load: () => null,
        save: () => {}
    };

    /**
     * The adapter through which a host persists its arena - by default, nothing is persisted. A host, e.g. the tldraw
     * demo, replaces this, typically with an adapter constructed by `fluid.makeLocalStoragePersistenceAdapter`.
     * @type {PersistenceAdapter}
     */
    fluid.persistenceAdapter = fluid.emptyPersistenceAdapter;

    // The URL parameter by which several arenas may be persisted for the same page
    fluid.arenaIdParam = "infusionArenaId";

    /**
     * Determine the id of the arena persisted for a page, from its `infusionArenaId` URL parameter
     * @param {Location|URL} location - The location of the page
     * @return {String} The arena's id, or "0" if the page has no such parameter
     */
    fluid.arenaId = function (location) {
        return new URLSearchParams(location.search).get(fluid.arenaIdParam) || "0";
    };

    /**
     * Construct a persistence adapter which persists an arena in a browser's local storage, under a key derived from
     * the page's URL, without its query or fragment, and the arena's id, as determined by `fluid.arenaId`
     * @param {Storage} [storage] - The storage to be used, by default the browser's local storage
     * @param {Location|URL} [location] - The location of the page, by default the current one
     * @return {PersistenceAdapter} The adapter, with a further member `key` holding the key under which it persists
     */
    fluid.makeLocalStoragePersistenceAdapter = function (storage = window.localStorage, location = window.location) {
        const key = `infusion-arena:${location.origin}${location.pathname}#${fluid.arenaId(location)}`;
        return {
            key,
            load: function () {
                let togo = null;
                try {
                    togo = storage.getItem(key);
                } catch (e) {
                    fluid.log(fluid.logLevel.WARN, "Local storage is unavailable - the arena cannot be restored: ", e.message);
                }
                return togo;
            },
            save: function (text) {
                try {
                    storage.setItem(key, text);
                } catch (e) {
                    fluid.log(fluid.logLevel.WARN, "The arena could not be saved to local storage: ", e.message);
                }
            }
        };
    };
};

if (typeof(fluid) !== "undefined") {
    fluidPTFScope(fluid);
}
