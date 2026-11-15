/*
Copyright 2017-2026 Antranig Basman
Licensed under the Educational Community License (ECL), Version 2.0 or the New
BSD license. You may not use this file except in compliance with one these
Licenses.
You may obtain a copy of the ECL 2.0 License and BSD License at
https://github.com/fluid-project/infusion/raw/master/Infusion-LICENSE.txt
*/

/* global Papa, pako */

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

// A loader for a CSV file at `url`. Its `parsed` member is pending until the file has been loaded and parsed. It fetches
// its `fetchUrl`, which is its `url` unless it bears fluid.withPlaceholder, which supplies a placeholder fetched in its
// place when the page is rendered statically
fluid.def("hortis.csvReader", {
    $layers: "fluid.component",
    // url: String
    fetchUrl: "{self}.url",
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

hortis.rowToScientific = function (row) {
    return row.taxonName || row.iNaturalistTaxonName || row.linkTaxonName;
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

/**
 * Find the taxa of a set of observations, together with all their ancestors.
 * @param {Object[]} filteredObs - The observations, each with an `iNaturalistTaxonId`
 * @param {Object<String, TaxonRow>} rowById - Map of taxon id to indexed taxon row
 * @return {Object<String, Boolean>} Map of the id of each such taxon to true
 */
hortis.taxaFromObs = function (filteredObs, rowById) {
    const taxonIds = {};
    filteredObs.forEach(row => {
        taxonIds[row.iNaturalistTaxonId] = true;
    });
    return hortis.closeParentTaxa(taxonIds, rowById);
};

/** The visualisation loader **/

// Loads the observation and taxon tables and holds the observations surviving the filters
fluid.def("hortis.vizLoader", {
    $layers: "fluid.component",
    // obsFile: String
    // taxaFile: String
    // Each file may name beside it a placeholder, a short file of the same shape which is loaded in its place when the
    // page is rendered statically - see fluid.withPlaceholder
    obsPlaceholderFile: null,
    taxaPlaceholderFile: null,
    // The file of a visualisation's region indirection table, if it has one, and its placeholder
    regionIndirectionPlaceholderFile: null,
    taxaLoader: {
        $component: {
            $layers: ["hortis.csvReader", "fluid.withPlaceholder"],
            url: "{vizLoader}.taxaFile",
            placeholderUrl: "{vizLoader}.taxaPlaceholderFile"
        }
    },
    obsLoader: {
        $component: {
            $layers: ["hortis.csvReader", "fluid.withPlaceholder"],
            url: "{vizLoader}.obsFile",
            placeholderUrl: "{vizLoader}.obsPlaceholderFile"
        }
    },
    // `true` if the visualisation is rendered from placeholders, e.g. by a static build of its page
    isPlaceholder: "$compute:fluid.withPlaceholder.any({self}.taxaLoader.isPlaceholder, {self}.obsLoader.isPlaceholder)",
    taxaRows: "{self}.taxaLoader.rows",
    obsRows: "{self}.obsLoader.rows",
    taxa: {
        $component: {
            $layers: "hortis.taxa",
            rows: "{vizLoader}.taxaRows"
        }
    },
    // Overridden by visualisations with filters
    filteredObs: "{self}.obsRows",
    // Overridden by visualisations with a further taxon-based selection
    finalFilteredObs: "{self}.filteredObs"
});
