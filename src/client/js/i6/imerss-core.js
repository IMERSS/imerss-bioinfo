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

// Core of the IMERSS visualisations ported to Infusion 6 - resource loading, the taxon table, and the utilities
// shared by every visualisation. Corresponds to the framework-independent parts of src/client/js/new/imerss-new.js,
// fluidNew.js and filters.js, which will be retired once the port is complete.

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

// Helpful answer: https://stackoverflow.com/a/35759874
hortis.parseFloat = function (str) {
    return isNaN(str) ? NaN : parseFloat(str);
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

/** Resource loading **/

hortis.inflateUint8Array = async function (url) {
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    const byteArray = new Uint8Array(arrayBuffer);
    return pako.inflate(byteArray, {to: "string"});
};

// A loader for a CSV file at `url` - this is one of the ways the port resolves the Infusion 6 gap G1 in
// a-scratch/reports/requirements-imerss.md of the Infusion 6 repository, by returning a cell from a $compute
fluid.def("hortis.csvReader", {
    $layers: "fluid.component",
    // url: String
    csvOptions: {
        header: true,
        skipEmptyLines: true
    },
    parsed: "$compute:hortis.csvReader.load({self}.url, {self}.csvOptions)",
    rows: "{self}.parsed.data",
    headers: "{self}.parsed.meta.fields"
});

/**
 * Load and parse a CSV file, either plain (".csv") or deflated (".viz").
 * @param {String} url - The URL of the file
 * @param {Object} csvOptions - Options for Papa Parse
 * @return {Cell<Object>} A cell holding Papa Parse's results, with members `data` and `meta`, which is unavailable
 * until the file has been loaded and parsed
 */
hortis.csvReader.load = function (url, csvOptions) {
    const togo = fluid.cell(fluid.unavailable({message: "Pending I/O for CSV file " + url, variety: "pending"}),
        {name: "CSV file " + url});
    const fail = err => togo.set(fluid.unavailable({message: "Error parsing CSV file " + url + ": " + err, variety: "error"}));
    if (url.endsWith(".csv")) {
        Papa.parse(url, {...csvOptions, download: true, complete: results => togo.set(results), error: fail});
    } else if (url.endsWith(".viz")) {
        hortis.inflateUint8Array(url).then(data => togo.set(Papa.parse(data, {...csvOptions})), fail);
    } else {
        fail("Unrecognised CSV URL suffix");
    }
    return togo;
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

/** The visualisation loader **/

// Loads the observation and taxon tables and holds the observations surviving the filters
fluid.def("hortis.vizLoader", {
    $layers: "fluid.component",
    // obsFile: String
    // taxaFile: String
    taxaLoader: {
        $component: {
            $layers: "hortis.csvReader",
            url: "{vizLoader}.taxaFile"
        }
    },
    obsLoader: {
        $component: {
            $layers: "hortis.csvReader",
            url: "{vizLoader}.obsFile"
        }
    },
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

/** Views **/

/**
 * Locate the container of a view in markup supplied by the page.
 * @param {String} selector - A CSS selector for the container
 * @param {Document} dokkument - The document holding the container
 * @return {Element|Unavailable} The container, or an unavailable value if none is found
 */
hortis.locateContainer = function (selector, dokkument) {
    return dokkument.querySelector(selector) || fluid.unavailable({message: "No container found for selector " + selector, variety: "config"});
};

// A view whose container is found in markup supplied by the page rather than in its parent's template - see gap G8 in
// a-scratch/reports/requirements-imerss.md of the Infusion 6 repository
fluid.def("hortis.selectorContainerView", {
    $layers: "fluid.viewComponent",
    // selector: String
    // Render the template's root within the container, so that the classes the page has given the container survive
    elideParent: false,
    container: "$compute:hortis.locateContainer({self}.selector, {global}.document)"
});

// As hortis.selectorContainerView, rendering a template
fluid.def("hortis.selectorTemplateView", {
    $layers: ["hortis.selectorContainerView", "fluid.templateViewComponent"]
});

// Reports how many observations survive the filters and selections
fluid.def("hortis.recordReporter", {
    $layers: "fluid.component",
    // filteredRows: Object[]
    // allRows: Object[]
    counts: "$compute:hortis.recordReporter.renderModel({self}.filteredRows, {self}.allRows)",
    view: {
        $component: {
            $layers: "hortis.selectorTemplateView",
            template: `<div>
                <p>Displaying <b title="Observation records matching every filter and the current bee and plant selections">@{counts.filteredRows}</b>
                    of <span title="Total number of observation records in this dataset">@{counts.allRows}</span> records</p>
            </div>`
        }
    }
});

hortis.recordReporter.renderModel = function (filteredRows, allRows) {
    return {
        filteredRows: hortis.formatInt(filteredRows.length),
        allRows: hortis.formatInt(allRows.length)
    };
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
 * @return {Cell<Number>} The content width of the element, updated whenever it is laid out with nonzero width - or, if
 * there is no ResizeObserver, its width at the time of binding
 */
hortis.widthCell = function (node, global) {
    const togo = fluid.cell(fluid.unavailable({message: "Element not yet laid out", variety: "pending"}), {name: "Element width"});
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
