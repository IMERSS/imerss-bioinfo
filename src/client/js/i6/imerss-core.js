/*
Copyright 2017-2026 Antranig Basman
Licensed under the Educational Community License (ECL), Version 2.0 or the New
BSD license. You may not use this file except in compliance with one these
Licenses.
You may obtain a copy of the ECL 2.0 License and BSD License at
https://github.com/fluid-project/infusion/raw/master/Infusion-LICENSE.txt
*/

/* global Papa, pako, require */

"use strict";

// Core of the IMERSS visualisations ported to Infusion 6. General utilities come first - formatting, downloads, DOM
// listeners, images and SVG, resource loading and views - which know nothing of taxa or observations, followed by
// those concerned with biodiversity information - taxon rows, the taxon table and the visualisation loader.
// Corresponds to the framework-independent parts of src/client/js/new/imerss-new.js, fluidNew.js and filters.js,
// which will be retired once the port is complete.

// noinspection ES6ConvertVarToLetConst // otherwise this is a duplicate on minifying
var hortis = fluid.registerNamespace("hortis");

/** General utilities **/

/**
 * Determine whether a value is neither `null` nor `undefined`.
 * @param {any} value - The value to be tested
 * @return {Boolean} `true` if the value is neither `null` nor `undefined`
 */
hortis.isValue = function (value) {
    return value !== null && value !== undefined;
};

hortis.negate = value => !value;

// Helpful answer: https://stackoverflow.com/a/35759874
hortis.parseFloat = function (str) {
    return isNaN(str) ? NaN : parseFloat(str);
};

// The key under which an observation's point is kept on it - shared with geoJSON.js, whichever is loaded first
hortis.pointSymbol = hortis.pointSymbol || Symbol("point");

/**
 * The position of an observation, as its point [longitude, latitude], or `null` if it has none - its coordinates
 * missing, not numbers, or both zero. A row's coordinates are held as the strings read from its CSV, and every pass
 * over the observations which needs them, e.g. to grid them, to find those within the map's viewport, or to filter them
 * by a polygon drawn, would otherwise parse them afresh. Each row's point is parsed once, and kept on the row under
 * `hortis.pointSymbol`, as geoJSON.js reads it. It is kept on the bare row, since a row read through a component's
 * proxy would take a write as one to the component's state.
 * @param {Object} row - The observation, possibly read through a proxy
 * @return {Number[]|null} Its point, as [longitude, latitude], or `null` if it has none
 */
hortis.rowPoint = function (row) {
    let point = row[hortis.pointSymbol];
    if (point === undefined) {
        const lat = row.decimalLatitude, long = row.decimalLongitude;
        const latNum = lat === "" || !hortis.isValue(lat) ? NaN : +lat, longNum = long === "" || !hortis.isValue(long) ? NaN : +long;
        point = Number.isFinite(latNum) && Number.isFinite(longNum) && !(latNum === 0 && longNum === 0) ? [longNum, latNum] : null;
        fluid.unwrapProxy(row)[hortis.pointSymbol] = point;
    }
    return point;
};

/**
 * Interpolate the terms of a template written with %term placeholders, as for Infusion 4's fluid.stringTemplate.
 * Longer terms are substituted first, so that a term which is a prefix of another does not disturb it.
 * @param {String} template - The template
 * @param {Object<String, any>} terms - The terms to be interpolated
 * @return {String} The interpolated template
 */
hortis.stringTemplate = function (template, terms) {
    const keys = Object.keys(terms).sort((a, b) => b.length - a.length);
    return keys.reduce((acc, key) => acc.split("%" + key).join(terms[key]), template);
};

/**
 * Render an integer with thousands separators.
 * @param {Number} value - The integer to be rendered
 * @return {String} The value grouped in threes, e.g. "3,000"
 */
hortis.formatInt = function (value) {
    return Math.round(value).toLocaleString("en-US");
};

/**
 * Pluralise a noun according to a count.
 * @param {Number} count - The count
 * @param {String} noun - The singular form of the noun
 * @param {String} [nouns] - The plural form of the noun, defaulting to the singular with "s" appended
 * @return {String} The count followed by the appropriate form of the noun
 */
hortis.plural = function (count, noun, nouns = noun + "s") {
    return hortis.formatInt(count) + " " + (count === 1 ? noun : nouns);
};

hortis.capitalize = function (string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
};

hortis.encodeHTML = function (str) {
    return str.replace(/[&<>'"]/g, function (tag) {
        return {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            "'": "&#39;",
            "\"": "&quot;"
        }[tag];
    });
};

// Approach taken from https://stackoverflow.com/a/64908345/1381443
hortis.triggerDownload = function (content, mimeType, filename) {
    const a = document.createElement("a");
    const blob = new Blob([content], {type: mimeType});
    const url = URL.createObjectURL(blob);
    a.setAttribute("href", url);
    a.setAttribute("download", filename);
    a.click(); // Start downloading
};

/** DOM listeners **/

/**
 * A listener to be bound to an element, optionally delegated to its descendants matching a selector.
 * @typedef {Object} DomListenerSpec
 * @property {String} event - The name of the DOM event
 * @property {String} [selector] - If present, the listener is notified only of events whose target lies within a
 * descendant matching the selector, which is supplied to it as `this` and as its second argument
 * @property {Function} listener - The listener, accepting the event and the matched element
 */

/**
 * Bind a set of listeners to an element whose markup is supplied by the page or owned by a widget, for use as the
 * `bind` of a `$bindable` whose `unbind` is `hortis.unbindDomListeners` - this takes the place of Infusion 4's
 * delegated jQuery handlers bound at onCreate, which were never unbound.
 * @param {Element} element - The element to which the listeners are to be bound
 * @param {DomListenerSpec[]} specs - The listeners to be bound
 * @return {Object} A record of the bound listeners to be supplied to `hortis.unbindDomListeners`
 */
hortis.bindDomListeners = function (element, specs) {
    const bound = specs.map(spec => {
        const raw = function (event) {
            if (spec.selector) {
                const matched = event.target.closest?.(spec.selector);
                if (matched && element.contains(matched)) {
                    spec.listener.call(matched, event, matched);
                }
            } else {
                spec.listener.call(element, event, element);
            }
        };
        element.addEventListener(spec.event, raw);
        return {event: spec.event, raw};
    });
    return {element, bound};
};

hortis.unbindDomListeners = function (record) {
    record.bound.forEach(({event, raw}) => record.element.removeEventListener(event, raw));
};

/**
 * Track the content width of an element in a cell, for use as the `bind` of a `$bindable` whose `unbind` is
 * `hortis.unobserveWidth`.
 * @param {Element} node - The element to be observed
 * @param {Object} global - The global object, which may supply ResizeObserver - this is passed whole since a reference
 * {global}.ResizeObserver to a missing global would be unavailable
 * @param {Number} [initial] - The width to be held until the element is first laid out - if absent, the cell is
 * pending until then
 * @return {Cell<Number>} The content width of the element, updated whenever it is laid out with nonzero width - or, if
 * there is no ResizeObserver, its width at the time of binding
 */
hortis.widthCell = function (node, global, initial) {
    const togo = fluid.cell(initial ?? fluid.unavailable({message: "Element not yet laid out", variety: "pending"}), {name: "Element width"});
    if (global.ResizeObserver) {
        togo.observer = new global.ResizeObserver(entries => {
            entries.forEach(entry => {
                if (entry.contentRect.width > 0) {
                    togo.set(entry.contentRect.width);
                }
            });
        });
        togo.observer.observe(node);
    } else {
        togo.set(node.clientWidth || 0);
    }
    return togo;
};

hortis.unobserveWidth = function (widthCell) {
    widthCell.observer?.disconnect();
};

/**
 * Toggles a CSS class on a DOM element based on a boolean value.
 * @param {HTMLElement} container - The DOM element to modify.
 * @param {String} clazz - The CSS class to add or remove.
 * @param {Boolean} value - If true, the class will be added; if false, it will be removed.
 * @param {Boolean} [inverse] - If true, inverts the logic (adds the class when value is false).
 */
hortis.toggleClass = function (container, clazz, value, inverse) {
    container.classList.toggle(clazz, !!(!!value ^ !!inverse));
};

/**
 * Trigger the download of a table as a CSV file.
 * @param {String[]} headers - The column headers
 * @param {Array[]} rows - The rows of the table, each an array of cell values
 * @param {String} filename - The name of the file to be downloaded
 */
hortis.downloadCSV = function (headers, rows, filename) {
    const content = Papa.unparse({fields: headers, data: rows});
    hortis.triggerDownload(content, "text/csv", filename);
};

/** Images and SVG **/

hortis.loadImage = async url => {
    const $img = document.createElement("img");
    $img.src = url;
    return new Promise((resolve) => {
        $img.onload = () => resolve($img);
        $img.onerror = e => {
            console.log("Got error ", e);
        };
        $img.src = url;
    });
};

hortis.getCanvasBlob = async (svgURL, { format, quality, scale }) => {
    const img = await hortis.loadImage(svgURL);

    const $canvas = document.createElement("canvas");
    $canvas.width = img.naturalWidth * scale;
    $canvas.height = img.naturalHeight * scale;
    $canvas.getContext("2d").drawImage(img, 0, 0, img.naturalWidth * scale, img.naturalHeight * scale);

    const blob = await new Promise(resolve => $canvas.toBlob(resolve, `image/${format}`, quality));
    return blob;
};

// Presentational properties copied from the page's stylesheet onto each element of an SVG exported as a standalone file
hortis.svgInlinedProperties = ["fill", "stroke", "stroke-width", "font-family", "font-size", "font-weight"];

/**
 * Copy the computed values of the presentational properties of each element of a rendered SVG onto the
 * corresponding element of its clone, so that the clone renders identically without the page's stylesheet.
 * @param {SVGElement} source - The SVG element as rendered in the page
 * @param {SVGElement} clone - A deep clone of `source`, which will be modified
 */
hortis.inlineSVGStyles = function (source, clone) {
    const sources = [source, ...source.querySelectorAll("*")];
    const clones = [clone, ...clone.querySelectorAll("*")];
    sources.forEach((node, i) => {
        const computed = getComputedStyle(node);
        clones[i].setAttribute("style", hortis.svgInlinedProperties.map(prop => `${prop}: ${computed.getPropertyValue(prop)}`).join("; "));
    });
};

/** Reducers **/

hortis.maxReducer = function () {
    const togo = {
        value: Number.NEGATIVE_INFINITY,
        reduce: next => {togo.value = Math.max(next, togo.value);}
    };
    return togo;
};

hortis.minReducer = function () {
    const togo = {
        value: Number.POSITIVE_INFINITY,
        reduce: next => {togo.value = Math.min(next, togo.value);}
    };
    return togo;
};

hortis.querySelectorIn = (container, selector) => container.querySelector(selector) || fluid.unavailable({message: "No element for " + selector, variety: "config"});

/** Resource loading **/

hortis.inflateUint8Array = async function (url) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(response.status + " " + response.statusText);
    }
    const arrayBuffer = await response.arrayBuffer();
    const byteArray = new Uint8Array(arrayBuffer);
    return pako.inflate(byteArray, {to: "string"});
};

// A loader for a CSV file at `url`, which may be that of a placeholder - see fluid.resolveUrl. Its `parsed` member is
// pending until the file has been loaded and parsed
fluid.def("hortis.csvReader", {
    $layers: "fluid.component",
    // url: String
    fetchUrl: "$compute:fluid.resolveUrl({self}.url)",
    csvOptions: {
        header: true,
        skipEmptyLines: true
    },
    parsed: "$compute:hortis.csvReader.load({self}.fetchUrl, {self}.csvOptions)",
    rows: "{self}.parsed.data",
    headers: "{self}.parsed.meta.fields"
});

/**
 * Load and parse a CSV file, either plain (".csv") or deflated (".viz").
 * @param {String} url - The URL of the file
 * @param {Object} csvOptions - Options for Papa Parse
 * @return {Promise<Object>} A promise for Papa Parse's results, with members `data` and `meta`, or for an unavailable
 * value if the file could not be loaded or parsed
 */
hortis.csvReader.load = function (url, csvOptions) {
    const fail = err => fluid.unavailable({message: "Error parsing CSV file " + url + ": " + err, variety: "error"});
    let parsed;
    if (url.endsWith(".csv")) {
        // Fetched rather than downloaded by Papa Parse, whose XMLHttpRequest is not available when rendering under node
        parsed = fetch(url).then(response => response.ok ? response.text() : Promise.reject(response.status + " " + response.statusText))
            .then(data => Papa.parse(data, {...csvOptions}));
    } else if (url.endsWith(".viz")) {
        parsed = hortis.inflateUint8Array(url).then(data => Papa.parse(data, {...csvOptions}));
    } else {
        parsed = Promise.reject("Unrecognised CSV URL suffix");
    }
    return parsed.catch(fail);
};

/** Views **/

// A slot rendering markup computed as a string, e.g. a long list for which a component per row would be too costly.
// The markup is rendered verbatim, so that it is not scanned for bindings - any events within it should be delegated
// to a handler on an enclosing element of a template. It is reconciled against the DOM as for any other template
fluid.def("hortis.verbatimSlot", {
    $layers: "fluid.component",
    markup: "",
    view: {
        $component: {
            $layers: "fluid.templateViewComponent",
            verbatim: true,
            template: "{$parent}.markup"
        }
    }
});

/** Taxon rows **/

// cf arphify.js line 80 hortis.axeFromName and hortis.qualForming
hortis.sppAnnotations = ["agg.", "aff.", "s.lat.", "cf", "sp.nov.", "var.", "sp.", "ssp.", "spp.", "complex"];
hortis.annoteRegex = new RegExp("(" + hortis.sppAnnotations.map(annot => annot.replace(".", "\\.")).join("|") + ")", "g");

/**
 * Render a species name as a list of VNodes, with any annotation such as "ssp." held in a span so that it can be set
 * in Roman type.
 * @param {String} name - The species name
 * @return {VNode[]} The VNodes rendering the name
 */
hortis.speciesNameNodes = function (name) {
    // Splitting on a regex with a capturing group places the captured annotations at odd indices
    return name.split(hortis.annoteRegex).filter(seg => seg !== "").map(seg =>
        hortis.sppAnnotations.includes(seg) ? {tag: "span", attrs: {"class": "checklist-annote"}, children: [{text: seg}]} : {text: seg});
};

// Render a species name as markup, with any annotation such as "ssp." in a span so that it can be set in Roman type
hortis.renderSpeciesName = function (name) {
    return name.replace(hortis.annoteRegex, `<span class="checklist-annote">$1</span>`);
};

// The annotation written between the species and infraspecific epithets of a name of each infraspecific rank, as
// community standards write them, which iNaturalist's names omit
hortis.infraRankAnnotations = {
    subspecies: "ssp.",
    variety: "var."
};

/**
 * Normalise an iNaturalist taxon name to community standards, by inserting the annotation of its infraspecific rank
 * between its second and third components - e.g. "Anthidiellum notatum robertsoni" of rank "subspecies" becomes
 * "Anthidiellum notatum ssp. robertsoni". A name of any other rank, of other than three components, or already bearing
 * an annotation, is returned unchanged.
 * @param {String} name - The iNaturalist taxon name
 * @param {String} [rank] - The taxon's rank
 * @return {String} The normalised name
 */
hortis.normaliseINatName = function (name, rank) {
    const annotation = hortis.infraRankAnnotations[rank];
    const parts = name.split(" ");
    let togo = name;
    if (annotation && parts.length === 3 && !parts.some(part => hortis.sppAnnotations.includes(part))) {
        togo = [parts[0], parts[1], annotation, parts[2]].join(" ");
    }
    return togo;
};

/**
 * The scientific name by which a taxon is displayed - the authoritative name supplied for it by the checklist, as its
 * curated `taxonName` or its `scientificName`, if it has one, or else its iNaturalist name normalised to community
 * standards - see hortis.normaliseINatName
 * @param {TaxonRow} row - The taxon's row
 * @return {String} The name
 */
hortis.rowToScientific = function (row) {
    const authoritative = row.taxonName || row.scientificName;
    return authoritative || (row.iNaturalistTaxonName ? hortis.normaliseINatName(row.iNaturalistTaxonName, row.rank) : row.linkTaxonName);
};

hortis.rowToLinkTaxonName = function (row) {
    return row.iNaturalistTaxonName || row.linkTaxonName;
};

hortis.rowToLinkTaxonImage = function (row) {
    return row.iNaturalistTaxonImage || row.linkTaxonImage;
};

hortis.rowToLinkTaxonId = function (row) {
    return row.linkTaxonId ?? row.iNaturalistTaxonId;
};

/**
 * Close a set of taxon ids upwards, so that it holds every ancestor of each of its members.
 * @param {Object<String, Boolean>} rowFocus - Hash of taxon ids to `true`, which will be modified
 * @param {Object<String, TaxonRow>} rowById - Map of taxon id to taxon row
 * @return {Object<String, Boolean>} The closed `rowFocus`
 */
hortis.closeParentTaxa = function (rowFocus, rowById) {
    Object.keys(rowFocus).forEach(function (id) {
        let row = rowById[id];
        while (row) {
            rowFocus[row.id] = true;
            row = row.parent;
        }
    });
    return rowFocus;
};

hortis.idToTaxonLink = taxonId => "https://www.inaturalist.org/taxa/" + taxonId;

/**
 * Render the image of a taxon, with a link to its page on iNaturalist.
 * @param {String} url - The URL of the image
 * @param {String} [taxonId] - The taxon's id
 * @return {String} The markup of the image
 */
hortis.renderTaxonImage = function (url, taxonId) {
    const extern = taxonId ? `<a href="${hortis.idToTaxonLink(taxonId)}" target="_blank" class="taxonDisplay-iNat-extern">iNaturalist<span class="external-link"></span></a>` : "";
    return `<div class="taxonDisplay-image-holder"><div class="imerss-photo" style="background-image: url(${url})"></div>${extern}</div>`;
};

/**
 * Find the nearest ancestor of a taxon, including the taxon itself, at a particular rank.
 * @param {Object} row - A taxon row, with `parent` assigned by `hortis.taxa.map`
 * @param {String} rank - The rank sought
 * @return {Object|undefined} The ancestor row at that rank, or `undefined` if there is none
 */
hortis.ancestorAtRank = function (row, rank) {
    let move = row;
    while (move && move.rank !== rank) {
        move = move.parent;
    }
    return move;
};

/**
 * Find the species to which a taxon belongs, so that infraspecific taxa are counted with their species. A taxon
 * identified only above species level stands for itself.
 * @param {Object} row - A taxon row
 * @return {Object} The row for the taxon's species, or the row itself if it has no species
 */
hortis.speciesRowOf = function (row) {
    return hortis.ancestorAtRank(row, "species") || row;
};

/**
 * Find the name of the family to which a taxon belongs.
 * @param {Object} row - A taxon row
 * @return {String} The family's name, or "Unplaced" if the taxon has no family
 */
hortis.familyNameOf = function (row) {
    return hortis.ancestorAtRank(row, "family")?.iNaturalistTaxonName || "Unplaced";
};

/**
 * Label a taxon by its scientific name, noting its rank if it was not identified to species.
 * @param {Object} row - A taxon row
 * @return {String} The label, e.g. "Bombus mixtus" or "Nomada (genus)"
 */
hortis.taxonLabel = function (row) {
    const name = hortis.rowToScientific(row);
    return row.rank && row.rank !== "species" ? `${name} (${row.rank})` : name;
};

/**
 * Render a taxon's scientific name as markup, followed by its rank in Roman type if it was not identified to species.
 * @param {Object} row - A taxon row
 * @return {String} The markup
 */
hortis.taxonNameMarkup = function (row) {
    const name = `<em>${hortis.renderSpeciesName(hortis.encodeHTML(hortis.rowToScientific(row)))}</em>`;
    return row.rank && row.rank !== "species" ? `${name} <span class="imerss-rank">${row.rank}</span>` : name;
};

/** The taxon table **/

fluid.def("hortis.taxa", {
    $layers: "fluid.component",
    // rows: Object[] - the raw taxon table
    indexed: "$compute:hortis.taxa.index({self}.rows)",
    rowById: "{self}.indexed.rowById",
    allRows: "{self}.indexed.rows",
    //                                                     query, maxSuggestions
    lookupTaxon: "$method:hortis.lookupTaxon({self}.allRows, {0}:query, {1}:maxSuggestions)"
});

/**
 * Index a flat, sorted taxon table, linking each row to its parent and children and assigning its depth and the number
 * of leaves below it. The rows are copied rather than modified, since they may be shared configuration.
 * @param {Object[]} rows - The taxon table, each row with members `id` and `parentId`, sorted so that the root is first
 * @return {Object} Members `rows`, the copied rows, and `rowById`, a map of taxon id to copied row
 */
hortis.taxa.index = function (rows) {
    const rowById = {};
    const copied = rows.map((row, flatIndex) => {
        const togo = {...row, flatIndex, children: []};
        rowById[row.id] = togo;
        return togo;
    });
    copied.forEach(row => {
        if (row.parentId) {
            const parent = rowById[row.parentId];
            row.parent = parent;
            parent.children.push(row);
        }
    });
    const assignDepth = function (node, childCount, depth) {
        node.depth = depth;
        const isLeaf = node.children.length === 0;
        node.childCount = node.children.reduce((count, child) => assignDepth(child, count, depth + 1), isLeaf ? 1 : 0);
        return node.childCount + childCount;
    };
    if (copied.length > 0) {
        assignDepth(copied[0], 0, 0);
    }
    return {rows: copied, rowById};
};


hortis.labelForAutocompleteRow = function (row) {
    let name = hortis.rowToScientific(row);
    if (row.hulqName) {
        name += " - " + row.hulqName;
    }
    return hortis.capitalize(name);
};

hortis.autocompleteInputForTaxonRow = function (row) {
    return row ? hortis.labelForAutocompleteRow(row) + (row.commonName ? " (" + row.commonName + ")" : "") : row;
};

hortis.autocompleteSuggestionForTaxonRow = function (row) {
    return hortis.autocompleteInputForTaxonRow(row) + (row.childCount > 1 ? " (" + row.childCount + " species)" : "");
};

hortis.lookupTaxon = function (rows, query, maxSuggestions = 1) {
    const output = [];
    const lowerQuery = query.toLowerCase();
    for (let i = 0; i < rows.length && output.length < maxSuggestions; ++i) {
        const row = rows[i];
        if (hortis.autocompleteInputForTaxonRow(row).toLowerCase().includes(lowerQuery)) {
            output.push(row);
        }
    }
    return maxSuggestions === 1 ? output[0] : output;
};

/** Queries **/

/**
 * A set of the observations, as the visualisation passes it between its parts in place of an array of rows.
 * @typedef {Object} Selection
 * @property {Uint8Array} selection - 1 for each row of the table selected, else 0
 * @property {Number} count - The number of rows selected
 * @property {Number} rowCount - The number of rows of the table
 * @property {String} key - The key of the query which computed it, by which a query narrowing it is cached - see
 * hortis.queryCache
 */

/**
 * Execute a query of the query description language over the visualisation's data package - see qdl.js and
 * notes/query-description-language.md. The package and any selection are read bare, since the executor visits every
 * row, and the query is copied bare from any proxy through which it was read.
 * @param {VizPackage} pkg - The package
 * @param {Object} query - The query
 * @param {Selection} [within] - A selection which the query narrows
 * @return {Object} The result of the query
 */
hortis.query = function (pkg, query, within) {
    const barePkg = fluid.unwrapProxy(pkg), bareQuery = hortis.bareQuery(query);
    const bareWithin = within ? fluid.unwrapProxy(within) : undefined;
    const key = hortis.queryCache.key(barePkg, bareQuery, bareWithin);
    let togo = hortis.queryCache.restore(key);
    if (togo === undefined) {
        togo = hortis.qdl.execute(barePkg, bareQuery, bareWithin?.selection);
        hortis.queryCache.record(key, togo);
    }
    return togo;
};

/** The cache of the queries of startup, captured at hydration **/

// When a page is rendered statically by Infusion 6's hydrate.js, against its real data, every query it executes is
// recorded with its result, and written into the page as a script element of JSON - which dehydrate.js removes again,
// since it is not of the page's source. When the hydrated page boots in the browser, each of those queries is answered
// from it, once, rather than executed. A query is keyed by its canonical form together with the hash of the table it
// queries and the key of the selection it narrows, so that a page whose data has changed since it was hydrated finds
// none of its queries, and executes them all as usual
fluid.registerNamespace("hortis.queryCache");

hortis.queryCache.scriptId = "hortis-query-cache";
// The largest result recorded, as encoded - a larger one, e.g. the ids of every row, is cheaper executed than read
hortis.queryCache.maxEntryLength = 65536;
// The results recorded under node, by key, as encoded
hortis.queryCache.recorded = new Map();
// The results restored in the browser from the page, by key, as encoded - read when first needed
hortis.queryCache.restored = null;
// The number of queries answered from the page, e.g. for a test
hortis.queryCache.hits = 0;

/**
 * Compute the key of a query.
 * @param {VizPackage} pkg - The data package
 * @param {Object} query - The query, bare
 * @param {Selection} [within] - The selection it narrows
 * @return {String} The key
 */
// Base64, which the sandbox in which Infusion renders a page under node does not hold as a global
/* eslint-disable jsdoc/require-jsdoc */
// They are wrapped, since the browser's are called only as functions of the window
hortis.queryCache.btoa = typeof(btoa) !== "undefined" ? binary => btoa(binary) : binary => require("buffer").Buffer.from(binary, "latin1").toString("base64");
hortis.queryCache.atob = typeof(atob) !== "undefined" ? text => atob(text) : text => require("buffer").Buffer.from(text, "base64").toString("latin1");
/* eslint-enable jsdoc/require-jsdoc */

hortis.queryCache.key = (pkg, query, within) => hortis.qdl.hash(query, pkg) + (within ? "|" + within.key : "");

// The document of the visualisation, bound by hortis.vizLoader once it has rendered - under node, where there is no
// global document, the page being rendered
hortis.queryCache.boundDocument = null;

/**
 * Find the document into which results are written, or from which they are read.
 * @return {Document|null} The document, if there is one
 */
hortis.queryCache.document = () => hortis.queryCache.boundDocument || fluid.global.document || null;

/**
 * Bind the document of a rendered visualisation, and write into it any results recorded before it was rendered.
 * @param {Element} container - The visualisation's rendered container
 * @return {Document} Its document
 */
hortis.queryCache.bindDocument = function (container) {
    const dokkument = container.ownerDocument;
    hortis.queryCache.boundDocument = dokkument;
    hortis.queryCache.write();
    return dokkument;
};

/**
 * Write the results recorded into the document, as a script element of JSON in its head, if the page is rendered
 * statically.
 */
hortis.queryCache.write = function () {
    const dokkument = hortis.queryCache.document();
    if (fluid.renderingStatically && dokkument && hortis.queryCache.recorded.size > 0) {
        let element = dokkument.getElementById(hortis.queryCache.scriptId);
        if (!element) {
            element = dokkument.createElement("script");
            element.setAttribute("type", "application/json");
            element.setAttribute("id", hortis.queryCache.scriptId);
            dokkument.head.appendChild(element);
        }
        element.textContent = JSON.stringify(Object.fromEntries(hortis.queryCache.recorded));
    }
};

/**
 * Restore a query's result from those written into the page at hydration, if it holds it.
 * @param {String} key - The query's key
 * @return {Object|undefined} The result, or `undefined` if the page does not hold it
 */
hortis.queryCache.restore = function (key) {
    let togo;
    if (!fluid.renderingStatically) {
        if (hortis.queryCache.restored === null) {
            const element = hortis.queryCache.document()?.getElementById(hortis.queryCache.scriptId);
            hortis.queryCache.restored = new Map(element ? Object.entries(JSON.parse(element.textContent)) : []);
        }
        const encoded = hortis.queryCache.restored.get(key);
        if (encoded !== undefined) {
            // Each result is restored once, since the next execution of the same query is of a later state of the page
            hortis.queryCache.restored.delete(key);
            try {
                togo = hortis.queryCache.decode(encoded);
                ++hortis.queryCache.hits;
            } catch (e) {
                // A result which can't be read is executed instead
                fluid.log("Failed to restore the cached result of query " + key + ": " + e);
            }
        }
    }
    return togo;
};

/**
 * Record a query's result, if the page is rendered statically, and write the results recorded into the document.
 * @param {String} key - The query's key
 * @param {Object} result - Its result
 */
hortis.queryCache.record = function (key, result) {
    if (fluid.renderingStatically) {
        const encoded = hortis.queryCache.encode(result);
        if (JSON.stringify(encoded).length <= hortis.queryCache.maxEntryLength) {
            hortis.queryCache.recorded.set(key, encoded);
            hortis.queryCache.write();
        }
    }
};

/**
 * Encode a result as JSON, each typed array as its type and its bytes in base64 - a selection, a Uint8Array of 0s and
 * 1s, as the runs of its 1s.
 * @param {any} value - The result, or any part of it
 * @return {any} The encoded value
 */
hortis.queryCache.encode = function (value) {
    let togo;
    if (value instanceof Uint8Array) {
        const runs = [];
        for (let i = 0; i < value.length; ++i) {
            if (value[i] === 1 && (i === 0 || value[i - 1] === 0)) {
                runs.push(i);
            } else if (value[i] === 0 && i > 0 && value[i - 1] === 1) {
                runs.push(i);
            }
        }
        if (value.length > 0 && value[value.length - 1] === 1) {
            runs.push(value.length);
        }
        togo = {$selection: value.length, runs: hortis.queryCache.encode(Int32Array.from(runs))};
    } else if (ArrayBuffer.isView(value)) {
        const bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
        let binary = "";
        for (let i = 0; i < bytes.length; i += 32768) {
            binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 32768));
        }
        togo = {$typed: value.constructor.name, base64: hortis.queryCache.btoa(binary)};
    } else if (Array.isArray(value)) {
        togo = value.map(hortis.queryCache.encode);
    } else if (value && typeof(value) === "object") {
        togo = fluid.transform(value, hortis.queryCache.encode);
    } else if (typeof(value) === "number" && !isFinite(value)) {
        togo = {$number: String(value)};
    } else {
        togo = value;
    }
    return togo;
};

/**
 * Decode a result encoded by hortis.queryCache.encode.
 * @param {any} value - The encoded result, or any part of it
 * @return {any} The result
 */
hortis.queryCache.decode = function (value) {
    let togo;
    if (Array.isArray(value)) {
        togo = value.map(hortis.queryCache.decode);
    } else if (value && typeof(value) === "object" && value.$selection !== undefined) {
        togo = new Uint8Array(value.$selection);
        const runs = hortis.queryCache.decode(value.runs);
        for (let r = 0; r < runs.length; r += 2) {
            togo.fill(1, runs[r], runs[r + 1]);
        }
    } else if (value && typeof(value) === "object" && value.$typed !== undefined) {
        const binary = hortis.queryCache.atob(value.base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; ++i) {
            bytes[i] = binary.charCodeAt(i);
        }
        togo = new hortis.viz.arrayTypes[value.$typed.replace(/Array$/, "")](bytes.buffer);
    } else if (value && typeof(value) === "object" && value.$number !== undefined) {
        togo = Number(value.$number);
    } else if (value && typeof(value) === "object") {
        togo = fluid.transform(value, hortis.queryCache.decode);
    } else {
        togo = value;
    }
    return togo;
};

/**
 * Copy a query, or part of one, bare from any proxy through which it was read - a proxy must not itself be serialised,
 * since it answers for any member, `toJSON` among them.
 * @param {Object} query - The query
 * @return {Object} The bare copy
 */
hortis.bareQuery = query => JSON.parse(JSON.stringify(fluid.unwrapProxy(query)));

/**
 * Select the observations passing a list of predicates.
 * @param {VizPackage} pkg - The package
 * @param {Object[]} predicates - The predicates, as gathered from the visualisation's filters
 * @param {Selection} [within] - A selection which they narrow
 * @return {Selection} The rows selected
 */
hortis.selectObs = function (pkg, predicates, within) {
    const barePkg = fluid.unwrapProxy(pkg), query = {from: "obs", where: hortis.bareQuery(predicates)};
    const bareWithin = within ? fluid.unwrapProxy(within) : undefined;
    // The key by which a query narrowing this selection is cached - that of the queries which computed it
    const key = hortis.queryCache.key(barePkg, query, bareWithin);
    // A selection made again by the same query over the same data is the identical one, so that whatever depends on it
    // is cut off from recomputing
    let selections = hortis.selectObs.memo.get(barePkg);
    if (!selections) {
        selections = new Map();
        hortis.selectObs.memo.set(barePkg, selections);
    }
    let togo = selections.get(key);
    if (!togo) {
        const result = hortis.query(barePkg, query, bareWithin);
        togo = {selection: result.selection, count: result.count, rowCount: result.rowCount, key};
        // Only the most recent selections are kept - those of the states between which a viewer moves back and forth
        if (selections.size >= hortis.selectObs.memoSize) {
            selections.delete(selections.keys().next().value);
        }
        selections.set(key, togo);
    }
    return togo;
};

// The selections made over each package, by key - see hortis.selectObs
hortis.selectObs.memo = new WeakMap();
hortis.selectObs.memoSize = 32;

// The predicates of the observations which have a position, as hortis.rowPoint holds - neither coordinate empty, nor
// both of them 0, a common placeholder for none
hortis.mappedPredicates = [
    {field: "decimalLatitude", op: "notNull"}, {field: "decimalLongitude", op: "notNull"},
    {not: {all: [{field: "decimalLatitude", op: "=", value: 0}, {field: "decimalLongitude", op: "=", value: 0}]}}
];

/**
 * Select every observation.
 * @param {VizPackage} pkg - The package
 * @return {Selection} Every row of its table of observations
 */
hortis.selectAllObs = pkg => hortis.selectObs(pkg, []);

/**
 * Count a selection's observations by the value of a field, e.g. of a taxon.
 * @param {VizPackage} pkg - The package
 * @param {Selection} selection - The observations
 * @param {String} field - The field
 * @return {Map<String, Number>} Map of each value, as text, to its count
 */
hortis.countObsBy = function (pkg, selection, field) {
    const result = hortis.query(pkg, {from: "obs", groupBy: [field], measures: {count: {count: true}}}, selection);
    const bare = fluid.unwrapProxy(pkg);
    const togo = new Map();
    for (let g = 0; g < result.groups; ++g) {
        togo.set(String(hortis.qdl.decode(bare, {from: "obs"}, field, result.keys[field][g])), result.measures.count[g]);
    }
    return togo;
};

/**
 * Count a selection's observations by each pair of values of two fields, e.g. a plant and its pollinator.
 * @param {VizPackage} pkg - The package
 * @param {Selection} selection - The observations
 * @param {String} field1 - The first field
 * @param {String} field2 - The second
 * @return {Array[]} The pairs, each an array of the two values, as text, and their count
 */
hortis.countObsByPair = function (pkg, selection, field1, field2) {
    const result = hortis.query(pkg, {from: "obs", groupBy: [field1, field2], measures: {count: {count: true}}}, selection);
    const bare = fluid.unwrapProxy(pkg);
    const decode = (field, value) => String(hortis.qdl.decode(bare, {from: "obs"}, field, value));
    return Array.from({length: result.groups}, (x, g) => [decode(field1, result.keys[field1][g]), decode(field2, result.keys[field2][g]), result.measures.count[g]]);
};

/**
 * Find the distinct values of a field over a selection of the observations.
 * @param {VizPackage} pkg - The package
 * @param {Selection|null} selection - The observations, or `null` for all of them
 * @param {String} field - The field
 * @return {String[]} The values, as text
 */
hortis.distinctObs = function (pkg, selection, field) {
    const result = hortis.query(pkg, {from: "obs", measures: {values: {distinct: field}}}, selection || undefined);
    const bare = fluid.unwrapProxy(pkg);
    return Array.from(result.values, value => String(hortis.qdl.decode(bare, {from: "obs"}, field, value)));
};

/**
 * Read the observations of a selection as row objects, for a view which shows them one by one, e.g. a download of the
 * records. The text of each field is as in the package's source.
 * @param {VizPackage} pkg - The package
 * @param {Selection} selection - The observations
 * @return {Object[]} The rows
 */
hortis.selectionRows = function (pkg, selection) {
    const result = hortis.query(pkg, {from: "obs", select: {rows: true}}, selection);
    return hortis.qdl.rowObjects(fluid.unwrapProxy(pkg).tables.obs, result.rows);
};

/**
 * The rows of a selection of the observations, as a table shows them - read by index as row objects only as they are
 * shown, so that a table of hundreds of thousands of records builds an object only for each row it renders. It stands
 * in for an array of rows, with `length`, `at(i)` and `slice(start, end)`, and sorts by a field through a query.
 */
hortis.SelectionRows = class {
    /**
     * @param {VizPackage} pkg - The data package, bare
     * @param {Selection} selection - The observations
     * @param {Int32Array} ids - The ids of their rows, in the order shown
     */
    constructor(pkg, selection, ids) {
        this.pkg = pkg;
        this.selection = selection;
        this.ids = ids;
        this.table = pkg.tables.obs;
        this.cache = new Map();
    }
    get length() {
        return this.ids.length;
    }
    at(i) {
        let row = this.cache.get(i);
        if (!row) {
            row = hortis.qdl.rowObject(this.table, this.ids[i]);
            this.cache.set(i, row);
        }
        return row;
    }
    slice(start = 0, end = this.length) {
        const togo = [];
        for (let i = start; i < Math.min(end, this.length); ++i) {
            togo.push(this.at(i));
        }
        return togo;
    }
    /**
     * Sort the rows by a field, through a query ordering the selection's ids.
     * @param {String} field - The field - if it is not one of the table's, the rows are left in their order
     * @param {Number} direction - 1 for ascending, -1 for descending
     * @return {hortis.SelectionRows} The rows sorted
     */
    sortedBy(field, direction) {
        let togo = this;
        if (this.table.columns[field]) {
            const ids = hortis.qdl.execute(this.pkg, {from: "obs", select: {rows: true, orderBy: [{field, direction: direction === -1 ? "desc" : "asc"}]}},
                this.selection.selection).rows;
            togo = new hortis.SelectionRows(this.pkg, this.selection, ids);
        }
        return togo;
    }
};

/**
 * Show a selection of the observations as the rows of a table - see hortis.SelectionRows.
 * @param {VizPackage} pkg - The data package
 * @param {Selection} selection - The observations
 * @return {hortis.SelectionRows} The rows
 */
hortis.selectionRowSource = function (pkg, selection) {
    const bare = fluid.unwrapProxy(pkg), bareSelection = fluid.unwrapProxy(selection);
    const ids = hortis.qdl.execute(bare, {from: "obs", select: {rows: true}}, bareSelection.selection).rows;
    return new hortis.SelectionRows(bare, bareSelection, ids);
};

/**
 * Determine whether two rows are the same observation - the same object, or two row objects read from the same row of
 * the data package.
 * @param {Object|null} a - A row
 * @param {Object|null} b - Another
 * @return {Boolean} `true` if they are the same
 */
hortis.sameRow = (a, b) => a === b || !!a && !!b && a[hortis.qdl.rowIndexSymbol] !== undefined && a[hortis.qdl.rowIndexSymbol] === b[hortis.qdl.rowIndexSymbol];

/**
 * Find the taxa of a set of observations, together with all their ancestors.
 * @param {VizPackage} pkg - The package
 * @param {Selection} selection - The observations
 * @param {Object<String, TaxonRow>} rowById - Map of taxon id to indexed taxon row
 * @param {String} [taxonField] - The field of the observations holding their taxon's id
 * @return {Object<String, Boolean>} Map of the id of each such taxon to true
 */
hortis.taxaFromObs = function (pkg, selection, rowById, taxonField = "iNaturalistTaxonId") {
    const taxonIds = {};
    hortis.distinctObs(pkg, selection, taxonField).forEach(id => {
        taxonIds[id] = true;
    });
    return hortis.closeParentTaxa(taxonIds, fluid.unwrapProxy(rowById));
};

/** The columnar data package **/

// A loader for a columnar data package at `url` - see vizPackage.js and notes/columnar-data-package.md. It is held in
// a visualisation as its member `dataLoader`, so that the visualisation's parts refer to its tables as
// {dataLoader}.obs, {dataLoader}.taxa, {dataLoader}.regionIndirection, and to any further table under its own name.
// Each table is a VizTable, whose columns are typed arrays. Its `package` member is pending until the package is
// loaded. Its `url` may be that of a placeholder - see fluid.resolveUrl
fluid.def("hortis.dataLoader", {
    $layers: "fluid.component",
    // url: String
    fetchUrl: "$compute:fluid.resolveUrl({self}.url)",
    package: "$compute:hortis.dataLoader.load({self}.fetchUrl)",
    tables: "{self}.package.tables",
    obs: "{self}.tables.obs",
    taxa: "{self}.tables.taxa",
    // A visualisation without a region indirection table is given an empty one
    regionIndirection: "$compute:hortis.dataLoader.regionIndirection({self}.tables)",
    // The package once its details - the columns it holds in full only once the visualisation is shown, e.g. the
    // times of its dates - are attached to it, or the package itself if it has none. Nothing shown at startup waits for
    // them: a column with details reads its text from them once they are attached
    detailed: "$compute:hortis.dataLoader.loadDetails({self}.fetchUrl, {self}.package)"
});

/**
 * Load the details of a package and attach them to it.
 * @param {String} url - The URL of the package
 * @param {VizPackage} pkg - The package
 * @return {Promise<VizPackage>|VizPackage} A promise for the package, once its details are attached, or the package
 * itself if it has no details
 */
hortis.dataLoader.loadDetails = function (url, pkg) {
    const bare = fluid.unwrapProxy(pkg);
    const detailsUrl = hortis.viz.detailsUrl(url, bare);
    let togo = bare;
    if (detailsUrl) {
        const now = Date.now();
        togo = hortis.viz.load(detailsUrl).then(details => {
            fluid.log("Loaded details of data package " + url + " in " + (Date.now() - now) + " ms");
            return hortis.viz.attachDetails(bare, details);
        }, err => fluid.unavailable({message: "Error loading details of data package " + url + ": " + err, variety: "error"}));
    }
    return togo;
};

/**
 * Load a columnar data package.
 * @param {String} url - The URL of the package
 * @return {Promise<VizPackage>} A promise for the package, or for an unavailable value if it could not be loaded
 */
hortis.dataLoader.load = function (url) {
    const now = Date.now();
    return hortis.viz.load(url).then(pkg => {
        fluid.log("Loaded data package " + url + " in " + (Date.now() - now) + " ms");
        return pkg;
    }, err => fluid.unavailable({message: "Error loading data package " + url + ": " + err, variety: "error"}));
};

/**
 * Find a table of a package which it may not hold, an empty table standing in for it if it does not.
 * @param {Object<String, VizTable>} tables - The package's tables
 * @param {String} name - The table's name
 * @return {VizTable} The table
 */
hortis.dataLoader.optionalTable = (tables, name) => tables[name] || {name, rowCount: 0, fields: [], columns: {}};

hortis.dataLoader.regionIndirection = tables => hortis.dataLoader.optionalTable(tables, "regionIndirection");

/** The visualisation loader **/

// Loads the visualisation's data package and holds the observations surviving the filters, as a Selection. Every part
// of the visualisation reads the observations through queries of the query description language - see qdl.js and
// notes/query-description-language.md - over {dataLoader}.package, narrowing a Selection such as {vizLoader}.
// filteredObs. The small tables of taxa and of the region indirection are also materialised as row objects, at
// taxaRows and regionIndirectionRows, from which the taxonomy and the region filters are built
fluid.def("hortis.vizLoader", {
    $layers: "fluid.component",
    // Shows the title of any element of the visualisation in a styled tooltip placed by Popper, in place of the
    // browser's - see tooltip.js, which a page hosting a visualisation loads, as does the SFC of each variant's loader
    titleTooltips: {
        $component: {
            $layers: "hortis.titleTooltips"
        }
    },
    // vizFile: String - the columnar data package. Each variant of the visualisation supplies as its default a
    // placeholder, placeholder://{layerName}/viz, a minimal package representative of the data, from which a test
    // fixture renders - a page which is a runnable application overrides it with its real data. See FLUID-7032
    dataLoader: {
        $component: {
            $layers: ["hortis.dataLoader", "fluid.withPlaceholder"],
            url: "{vizLoader}.vizFile"
        }
    },
    // `true` if the visualisation is rendered from its placeholder, as in a test fixture
    isPlaceholder: "{self}.dataLoader.isPlaceholder",
    pkg: "{self}.dataLoader.package",
    taxaRows: "$compute:hortis.viz.toRows({dataLoader}.taxa)",
    regionIndirectionRows: "$compute:hortis.viz.toRows({dataLoader}.regionIndirection)",
    // Every observation, as a Selection
    allObs: "$compute:hortis.selectAllObs({self}.pkg)",
    taxa: {
        $component: {
            $layers: "hortis.taxa",
            rows: "{vizLoader}.taxaRows"
        }
    },
    // Overridden by visualisations with filters - the observations surviving them, as a Selection
    filteredObs: "{self}.allObs",
    // Overridden by visualisations with a further taxon-based selection
    finalFilteredObs: "{self}.filteredObs",
    // The document into which the queries of startup are written when the page is rendered statically - see
    // hortis.queryCache. A visualisation which is not a view has no container, and binds none
    queryCacheDocument: "$effect:hortis.queryCache.bindDocument({self}.view.renderedContainer)"
});
