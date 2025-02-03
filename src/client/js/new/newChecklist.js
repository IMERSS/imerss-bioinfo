/*
Copyright 2023 Antranig Basman
Licensed under the Educational Community License (ECL), Version 2.0 or the New
BSD license. You may not use this file except in compliance with one these
Licenses.
You may obtain a copy of the ECL 2.0 License and BSD License at
https://github.com/fluid-project/infusion/raw/master/Infusion-LICENSE.txt
*/

/* global preactSignalsCore */

"use strict";

// noinspection ES6ConvertVarToLetConst // otherwise this is a duplicate on minifying
var hortis = fluid.registerNamespace("hortis");

//
// noinspection ES6ConvertVarToLetConst
var {signal, effect, batch} = preactSignalsCore; // eslint-disable-line no-unused-vars

// cf arphify.js line 80 hortis.axeFromName and hortis.qualForming
hortis.sppAnnotations = ["agg.", "aff.", "s.lat.", "cf", "sp.nov.", "var.", "sp.", "ssp.", "spp.", "complex"];
hortis.annoteRegex = new RegExp("(" + hortis.sppAnnotations.map(annot => annot.replace(".", "\\.")).join("|") + ")", "g");

// Render a species name with annotation specially rendered in Roman font
hortis.renderSpeciesName = function (name) {
    return name.replace(hortis.annoteRegex, `<span class="checklist-annote">$1</span>`);
};

// Duplicate from renderSVG.js so we don't need to rebuild temporarily whilst we work on Xetthecum
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

hortis.rowToScientific = function (row) {
    return row.taxonName || row.iNaturalistTaxonName;
};

hortis.accessRowHulq = function (row) {
    const togo = {
        nativeName: row.hulquminumName,
        scientificName: hortis.rowToScientific(row),
        commonName: row.commonName
    };
    togo.featuredName = togo.nativeName || togo.commonName;
    return togo;
};

hortis.rowFold = function (rowid, folded) {
    const foldChar = folded === "folded" ? "chevron-right" : folded === "unfolded" ? "chevron-down" : "none";
    const active = foldChar === "none" ? "" : " active";
    return `
    <span ${rowid} class="pretty p-icon checklist-fold-control ${active}">
        <span class="state">
            <i class="icon mdi mdi-${foldChar}"></i>
            <label></label>
        </span>
    </span>`;
};

// See hortis.checklist.stateToCheck - will be nice to do this with HTM templating?

// In indeterminate state, add p-is-indeterminate to div state
// In indeterminate state remove mdi-check from i
// Problem: https://stackoverflow.com/questions/9366087/html-why-isnt-indeterminate-indeterminatetrue-respected

hortis.rowCheckbox = function (id, state) {
    const checked = state === "selected" ? "checked" : "";
    const indeterminate = `indeterminate="${state === "indeterminate"}"`;
    const rowid = ` data-row-id="${id}"`;
    return `
    <span class="pretty p-icon">
      <input type="checkbox" class="checklist-check" ${checked} ${indeterminate} ${rowid}/>
      <span class="state p-success">
        <i class="icon mdi mdi-check"></i>
        <label></label>
      </span>
    </span>`;
};

hortis.resetChecks = function (parent) {
    [...parent.querySelectorAll(".pretty input")].forEach(input => input.checked = false);
};

hortis.checklistItem = function (entry, options, state) {
    const record = entry.row,
        id = record.id;
    const rowid = `data-row-id="${id}"`;
    // Note: "species" really means "has obs " and could be a higher taxon - in the case of a simple checklist
    // we promote e.g. a genus-level obs to species level so it appears inline
    const rank = record.rank && !(options.simple && record.taxonName) ? record.rank : "species";
    const selectedClass = rank === "species" && record.id === state.selectedId ? " checklist-selected" : "";
    const header = `<li class="checklist-row checklist-rank-${rank}${selectedClass}">`;
    const accessed = options.accessRow(record);
    const render = rank === "species" ? hortis.renderSpeciesName : fluid.identity;
    const names = {};
    if (accessed.nativeName) {
        names.nativeName = `<p ${rowid} class="checklist-hulq-name"><em>${accessed.nativeName}</em></p>`;
    }
    if (accessed.scientificName) {
        names.scientificName = `<p ${rowid} class="checklist-scientific-name">${render(hortis.encodeHTML(accessed.scientificName))}</p>`;
    }
    if (accessed.commonName) {
        names.commonName = `<p ${rowid} class="checklist-common-name">${accessed.commonName}</p>`;
    }
    // TODO: Sort according to order in accessRow
    const name = Object.values(names).join(" - ");
    const rowState = state.idToState[id];
    const subList = hortis.checklistList(rowState.folded === "folded" ? [] : entry.children, options, state);
    const footer = "</li>";
    const fold = options.unfoldable ? hortis.rowFold(rowid, rowState.folded) : "";
    const check = options.selectable ? hortis.rowCheckbox(id, rowState.selected) : "";
    return header + fold + check + name + subList + footer;
};

hortis.checklistList = function (entries, options, state) {
    return entries.length ?
        "<ul>" + entries.map(function (entry) {
            return hortis.checklistItem(entry, options, state);
        }).join("") + "</ul>" : "";
};

hortis.checklistRowForId = function (container, id) {
    return container.find(`[data-row-id=${id}]`).closest("li");
};

// Note that we can't test on layoutId since it is updated asynchronously and in a complex way in hortis.changeLayoutId
// This is the kind of logic that, in the end, makes us want to render with something like Preact
// Could we return component-like things backed by markup snippets? Rather than JSX, use relay-like notation?
hortis.updateChecklistSelection = function (container, newSelectedId, oldSelectedId, rowById) {
    // TODO: Since we updated Xetthecum data we are now getting a null selected id on startup
    if (newSelectedId === null) {
        return;
    }
    const oldSelected = hortis.checklistRowForId(container, oldSelectedId);
    oldSelected.removeClass("checklist-selected");
    const row = rowById[newSelectedId];
    if (row && row.species) {
        const newSelected = hortis.checklistRowForId(container, newSelectedId);
        newSelected.addClass("checklist-selected");
    }
};

hortis.alwaysRejectRanks = [];
// We used to have
// ["subfamily", "tribe", "genus"]; // AS directive of 18/7/23
// which doubtless makes no sense in the new world

// Variety of acceptChecklistRow following work with Andrew Simon where the importance is on the number of resolved
// entities - as a result there are rules such as not producing a genus level entry if any are resolved to species level
hortis.acceptChecklistRowAS = function (row, filterRanks, rowFocus) {
    const acceptBasic = !filterRanks || filterRanks.includes(row.rank) || row.species;
    const alwaysReject = hortis.alwaysRejectRanks.includes(row.rank);
    // Special request from AS - suppress any checklist entry at species level if there are any ssp
    const rejectSpecies = row.rank === "species" && row.children.length > 0;
    // Note: Elaborated understanding - this so-called "genus level record" is actually a species - see elements
    // in document 2nd July 2023
    // "taxonName" being set will be a proxy for "there is an entry in the curated summary" so we always accept
    const acceptChecklist = row.taxonName;
    return rowFocus[row.id] && (acceptBasic && !rejectSpecies && !alwaysReject || acceptChecklist);
};

hortis.acceptChecklistRowOBA = function (row, filterRanks, idToState, rowFocus) {
    const acceptBasic = !filterRanks || filterRanks.includes(row.rank);
    const alwaysReject = hortis.alwaysRejectRanks.includes(row.rank);
    return rowFocus[row.id] && acceptBasic && !alwaysReject;
};

hortis.scientificComparator = function (entrya, entryb) {
    return hortis.rowToScientific(entrya.row) > hortis.rowToScientific(entryb.row) ? 1 : -1;
};

hortis.sortChecklistLevel = function (entries) {
    return entries.sort(hortis.scientificComparator);
};

// Accepts array of rows and returns fresh array of "entries", where entry is {row, children: array of entry}
hortis.filterTaxonomy = function (rows, depth, acceptChecklistRow, filterTaxonomy, showRoot) {
    const togo = [];
    fluid.each(rows, function (row) {
        if (acceptChecklistRow(row) || depth === 0 && showRoot) {
            togo.push({
                row: row,
                children: filterTaxonomy(row.children, depth + 1)
            });
        } else {
            const dChildren = filterTaxonomy(row.children, depth + 1);
            Array.prototype.push.apply(togo, dChildren);
        }
    });
    return hortis.sortChecklistLevel(togo);
};

fluid.defaults("hortis.checklist", {
    gradeNames: ["hortis.withPanelLabel", "fluid.viewComponent"],
    filterRanks: false, // or array to include - if set, counts as "simple"
    // disclosableRanks: array
    showRoot: false,
    selectable: false,
    unfoldable: false,
    selectors: {
        hoverable: "p",
        checklist: ".imerss-checklist"
    },
    invokers: {
        accessRow: {
            funcName: "hortis.accessRowHulq"
        },
        foldByDefault: {
            args: ["{that}.options.disclosableRanks", "{arguments}.0"],
            func: (disclosableRanks, row) => disclosableRanks && disclosableRanks.includes(row.rank)
        },
        acceptChecklistRow: {
            funcName: "hortis.acceptChecklistRowAS",
            //     row
            args: ["{arguments}.0", "{that}.options.filterRanks", "{that}.rowFocus.value"]
        },
        filterTaxonomy: {
            funcName: "hortis.filterTaxonomy",
            //     rows            , depth
            args: ["{arguments}.0", "{arguments}.1", "{that}.acceptChecklistRow", "{that}.filterTaxonomy", "{that}.options.showRoot"]
        },
        generate: { // Triggered async from scheduleRender signal
            funcName: "hortis.checklist.generate",
            args: ["{that}", "{that}.dom.checklist", "{that}.idToState.value", "{that}.rootEntry.value", "{that}.selectedId.value"]
        },
        check: "hortis.checklist.check({that}, {arguments}.0, {arguments}.1)",
        toggleFold: "hortis.checklist.toggleFold({that}, {arguments}.0)",
        reset: "hortis.checklist.reset({that})"
    },
    members: {
        // Can't return 2 signals from computeRootEntry, do this collaterally
        idToEntry: {},
        // Added throwaway dependency here since acceptChecklistRow may depend on rowFocus and it isn't computed until we have rows filtered by filters
        rootEntry: "@expand:fluid.computed(hortis.checklist.computeRootEntry, {that}, {that}.rowById, {that}.rootId, {that}.filterTaxonomy, {that}.rowFocus)",
        idToStateUIOld: null,
        idToStateUI: "@expand:signal(null)", // Must supply an initial value or else computation never starts
        scheduleRender: "@expand:signal()",
        subscribeScheduleRender: "@expand:fluid.effect({that}.generate, {that}.scheduleRender)",
        idToStateOld: null, // Cache of old value used to transfer user's selection state, preact-signals doesn't allow "peek" at self
        idToState: "@expand:fluid.computed(hortis.checklist.idToState, {that}, {that}.idToStateUI, {that}.rootEntry, {that}.rowFocus)",
        // rowById: required for tooltips
        // rowFocus: awkward - injected in and depends on filtered obs
        rowSelection: "@expand:fluid.computed(hortis.checklist.checksToSelection, {that}.idToState)",
        subscribeChecks: "@expand:fluid.effect(hortis.checklist.subscribeChecks, {that}, {that}.idToStateUI)",
        subscribeSelected: "@expand:hortis.checklist.subscribeSelected({that}, {that}.selectedId, {that}.rowById)",
        renderEffect: "@expand:fluid.effect(fluid.identity, {that}.idToState)"
    },
    listeners: {
        "onCreate.bindTaxonHover": "hortis.bindTaxonHover({that}, {layoutHolder})",
        "onCreate.bindCheckboxClick": "hortis.checklist.bindCheckboxClick({that}, {that}.dom.checklist)"
    }
});

fluid.defaults("hortis.checklist.withOBA", {
    invokers: {
        acceptChecklistRow: {
            funcName: "hortis.acceptChecklistRowOBA",
            //     row
            args: ["{arguments}.0", "{that}.options.filterRanks", "{that}.oldIdToState", "{that}.rowFocus.value"]
        }
    }
});

fluid.defaults("hortis.checklist.withCopy", {
    selectors: {
        copyButton: ".imerss-copy-checklist"
    },
    members: {
        allLeaves: "@expand:fluid.computed(hortis.checklist.computeLeaves, {that}.idToEntry, {that}.rowSelection, {that}.options.copyChecklistRanks)",
    },
    // copyButtonMessage
    // copyChecklistRanks: array
    components: {
        copyButton: {
            type: "fluid.viewComponent",
            container: "{that}.dom.copyButton",
            options: {
                gradeNames: "hortis.withTooltip",
                tooltipKey: "tooltipKey",
                members: {
                    hovered: "@expand:signal(null)",
                    inCopy: "@expand:signal(null)",
                    tooltipKey: "@expand:fluid.computed(hortis.checklist.withCopy.deriveTooltipKey, {that}.hovered, {that}.inCopy)",
                    inCopyEffect: "@expand:fluid.effect(hortis.checklist.withCopy.inCopyEffect, {that}.container.0, {that}.inCopy)"
                },
                invokers: {
                    renderTooltip: "hortis.checklist.withCopy.renderTooltip({copyButton}, {hortis.checklist})",
                    copyToClipboard: "hortis.checklist.withCopy.copyToClipboard({copyButton}, {hortis.checklist})"
                },
                listeners: {
                    "onCreate.bindHover": "hortis.checklist.withCopy.bindHover"
                }
            }
        }
    }
});

hortis.checklist.withCopy.bindHover = function (that) {
    that.container.on("mouseenter", function (e) {
        that.hoverEvent = e;
        that.hovered.value = true;
    });
    that.container.on("mouseleave", function () {
        that.hovered.value = null;
    });
    that.container.on("click", that.copyToClipboard);
};

hortis.checklist.withCopy.deriveTooltipKey = function (hovered, inCopy) {
    return inCopy ? "inCopy" : hovered;
};

hortis.checklist.withCopy.inCopyEffect = function (container, inCopy) {
    const node = container.querySelector("use");
    if (inCopy) {
        node.setAttribute("href", "#copy-check");
        container.classList.add("imerss-copy-checklist-copied");
    } else {
        node.setAttribute("href", "#copy-clipboard");
        container.classList.remove("imerss-copy-checklist-copied");
    }
};

hortis.checklist.withCopy.renderTooltip = function (copyButton, checklist) {
    if (copyButton.inCopy.value) {
        return "Copied!";
    } else {
        const leaves = checklist.allLeaves.value;
        const limit = 5;
        const truncate = leaves.length > limit;
        const message = fluid.stringTemplate(checklist.options.copyButtonMessage, {
            rows: leaves.length
        }) + ":\n" + (truncate ? [...leaves.slice(0, limit), "..."].join("\n") : leaves.join("\n"));
        return message.replaceAll("\n", "<br/>");
    }
};

hortis.checklist.withCopy.copyToClipboard = function (copyButton, checklist) {
    copyButton.inCopy.value = true;
    window.setTimeout(() => copyButton.inCopy.value = null, 2000);

    const leaves = checklist.allLeaves.value.join("\n");
    navigator.clipboard.writeText(leaves).then(function () {
        console.log("Copying to clipboard was successful!");
    }, function (err) {
        console.error("Could not copy text: ", err);
    });
};

hortis.checklist.bindCheckboxClick = function (checklist, checklistContainer) {
    checklistContainer.on("click", ".pretty input", function () {
        const id = this.dataset.rowId;
        fluid.log("Checkbox clicked with row " + id);
        checklist.check(id, this.checked);
        // checklist.applier.change(["idToState", id], this.checked);
    });

    checklistContainer.on("click", ".checklist-fold-control.active", function () {
        const id = this.dataset.rowId;
        fluid.log("Fold clicked with row " + id);
        checklist.toggleFold(id);
    });
};

hortis.checklist.stateToCheck = function (checklist, state, id) {
    const node = checklist.idToNode?.[id];
    if (node) {
        node.checked = state.selected === "selected";
        // Don't use "indeterminate" property since we can't control this from markup
        node.setAttribute("indeterminate", state.selected === "indeterminate");
        const holder = node.closest(".p-icon");
        const ui = holder.querySelector(".icon");
        $(ui).toggleClass("mdi-check", state.selected !== "indeterminate");
    }
};

// This used to read:
// modelToCheck: {
//     path: "idToState.*",
//         func: "hortis.checklist.stateToCheck",
//         args: ["{that}", "{change}.value", "{change}.path"]
// }

hortis.checklist.subscribeChecks = function (checklist, idToStateUI) {
    const oldIdToState = checklist.idToStateUIOld;
    fluid.each(idToStateUI, (newState, id) => {
        const oldState = oldIdToState[id];
        if (newState !== oldState) {
            hortis.checklist.stateToCheck(checklist, newState, id);
        }
    });
    checklist.idToStateUIOld = idToStateUI;
};

hortis.checklist.allChildrenState = function (idToState, entry, state) {
    return entry.children.find(child => idToState[child.row.id].selected !== state) === undefined;
};

// In-DOM variants of this algorithm at https://css-tricks.com/indeterminate-checkboxes/
// From reacting to an individual checkbox click, compute the full idToState signal
hortis.checklist.check = function (checklist, id, checked) {
    const idToStateUp = fluid.copy(checklist.idToStateUI.value);
    const upState = checked ? "selected" : "unselected";
    const entry = checklist.idToEntry[id];

    // Traverse downward, cascading selected/unselected flag
    const setChildState = function (entry, state) {
        idToStateUp[entry.row.id].selected = state;
        entry.children.forEach(child => setChildState(child, state));
    };
    setChildState(entry, upState);

    // Traverse upward, cascading indeterminate as well as flag
    let parent = entry.parent;
    while (parent.row) {
        const allChildrenState = hortis.checklist.allChildrenState(idToStateUp, parent, upState);
        idToStateUp[parent.row.id].selected = allChildrenState ? upState : "indeterminate";
        parent = parent.parent;
    }
    batch( () => {
        checklist.idToStateUI.value = idToStateUp;
        if (upState === "selected" && idToStateUp[id].folded === "folded") {
            hortis.checklist.toggleFold(checklist, id);
        }
    });
};

hortis.checklist.reset = function (checklist) {
    // TODO: Somehow the root entry itself is not populated
    const rootId = checklist.rootEntry.value.children[0].row.id;
    hortis.checklist.check(checklist, rootId, false);
};

hortis.checklist.toggleFold = function (checklist, id) {
    const idToStateUp = fluid.copy(checklist.idToStateUI.value);
    const state = idToStateUp[id];
    const newFolded = state.folded === "folded" ? "unfolded" : "folded";
    state.folded = newFolded;
    const entry = checklist.idToEntry[id];
    // nb. duplicates some logic in initial defaultFold
    const defaultNewFold = entry => entry.children.length === 0 ? "fixed" : "folded";
    entry.children.forEach(child => idToStateUp[child.row.id].folded = newFolded === "folded" ? "hidden" : defaultNewFold(child));
    // Triggers update through idToState
    checklist.idToStateUI.value = idToStateUp;
    // Schedule full render
    checklist.scheduleRender.value = true;
};

// This used to read:
//         updateSelected: {
//             path: ["{layoutHolder}.model.selectedId"],
//             args: ["{that}", "{change}.value", "{change}.oldValue", "{layoutHolder}.model.rowById"],
//             func: "hortis.updateChecklistSelection"
//         },
hortis.checklist.subscribeSelected = function (that, selectedIdSignal, rowByIdSignal) {
    let oldSelectedId = undefined;
    return fluid.effect(function (newSelectedId, rowById) {
        hortis.updateChecklistSelection(that.container, newSelectedId, oldSelectedId, rowById);
        oldSelectedId = newSelectedId;
    }, selectedIdSignal, rowByIdSignal);
};

hortis.checklist.computeRootEntry = function (that, rowById, rootId, filterTaxonomy) {
    // TODO: Use of ROOT_ID to display polyphyletic set needed?
    const rootRow = rowById[rootId];
    fluid.log("Generating checklist for id " + rootId);
    const filteredEntries = filterTaxonomy([rootRow], 0);
    const idToEntry = that.idToEntry;
    fluid.clear(idToEntry);
    let entryIndex = 0;
    const indexEntry = function (entry, parent) {
        idToEntry[entry.row.id] = entry;
        entry.index = entryIndex++;
        entry.parent = parent;
        entry.children.forEach(child => indexEntry(child, entry));
    };
    filteredEntries.forEach(indexEntry);
    // "Wouldn't it be good" if we could return 2 signals
    // TODO: Problem - why don't we supply row: rootRow here as would be consistent?
    return {children: filteredEntries};
};

// TODO: rowFocus is probably already fully accounted for in computeRootEntry - we should axe it from here
hortis.checklist.idToState = function (that, idToStateUI, rootEntry, rowFocus) {
    const idToStateOld = that.idToStateOld;
    let togo;
    if (idToStateOld === idToStateUI) { // There must have been a change in rowFocus or rootEntry, regenerate new value
        togo = hortis.checklist.computeInitialModel(rootEntry, rowFocus, idToStateOld, that.options.unfoldable, that.foldByDefault);
        // Trigger rendering async - we can't update another computed in this computation
        fluid.invokeLater(() => that.scheduleRender.value = true);
    } else { // There must have been a UI-driven update or a fresh render, simply pass it through
        togo = idToStateUI;
        // Don't put this in the branch above, so that when we get a fresh render, we pass through this branch next time on the update of idToStateUI
        that.idToStateOld = togo;
    }
    // The main cycle broken here is computation of rowSelection
    return togo;
};

// An async non-effect since only idToState computation can determine if a full render is required
hortis.checklist.generate = function (that, element, idToState, rootEntry, selectedId) {
    const selectable = that.options.selectable,
        unfoldable = that.options.unfoldable,
        simple = !!that.options.filterRanks;

    const rootEntries = rootEntry.children;

    const options = {
        simple,
        selectable,
        unfoldable,
        accessRow: that.accessRow
    };
    const state = {
        selectedId,
        idToState
    };

    const markup = hortis.checklistList(rootEntries, options, state);
    element[0].innerHTML = markup;
    if (selectable) {
        const checks = element[0].querySelectorAll(".checklist-check");
        const idToNode = {};
        checks.forEach(check => idToNode[check.dataset.rowId] = check);
        that.idToNode = idToNode;
    }
    that.scheduleRender.value = undefined;
    // Do this first to cull action of subscribeChecks
    that.idToStateUIOld = idToState;
    // This then may trigger update of idToState via a further pass through checklist.idToState (may not if was an unfold)
    that.idToStateUI.value = idToState;
};

// A fake ID to hold the checklist's root so we can display a polyphyletic set
// TODO not currently used - we always seem to have a real root, recheck this
hortis.checklist.ROOT_ID = Number.NEGATIVE_INFINITY;

hortis.checklist.defaultFold = function (entry, unfoldable, foldByDefault) {
    return entry.children.length === 0 || !unfoldable ? "fixed" : entry.children.every(child => foldByDefault(child.row)) ? "folded" : "unfolded";
};

hortis.checklist.computeInitialModel = function (rootEntry, rowFocus, oldIdToState, unfoldable, foldByDefault) {
    const idToState = {};
    const indexEntry = function (entry, parentFolded) {
        const id = entry.row.id;
        if (!id) {
            fluid.log("Warning, discarding row ", entry.row, " without id set");
        } else if (rowFocus[id]) {
            const defaultFolded = (parentFolded === "folded" || parentFolded === "hidden") ? "hidden" :
                parentFolded === "root" ? "fixed" : hortis.checklist.defaultFold(entry, unfoldable, foldByDefault);
            idToState[id] = oldIdToState?.[id] || {selected: "unselected", folded: defaultFolded};
        }
        const folded = idToState[id].folded;
        entry.children.forEach(childEntry => indexEntry(childEntry, folded));
    };
    rootEntry.children.forEach(childEntry => indexEntry(childEntry, "root"));
    return idToState;
};

fluid.defaults("hortis.checklist.withHolder", {
    gradeNames: ["hortis.layoutHolder", "hortis.checklist"]
});

// From the individual signals of each checkbox, compute the effective rowSelection - taking into account the "no selection is all selection" idiom
hortis.checklist.checksToSelection = function (idToState) {
    const selection = {};
    const selectAll = {};
    let selected = 0;
    fluid.each(idToState, (state, key) => {
        if (state.folded !== "hidden") {
            if (state.selected === "selected") {
                ++selected;
                selection[key] = true;
            }
            selectAll[key] = true;
        }
    });
    return selected === 0 ? selectAll : selection;
};

hortis.checklist.computeLeaves = function (idToEntry, selection, copyChecklistRanks) {
    const leaves = {};
    const parentRow = row => idToEntry[row.parentId]?.row;
    const strikeParents = function (row) {
        row = parentRow(row);
        while (row) {
            delete leaves[row.id];
            row = parentRow(row);
        }
    };
    const appendLeaves = function (id) {
        const entry = idToEntry[id];
        if (entry.children.length === 0) {
            leaves[entry.row.id] = entry.row;
        } else {
            entry.children.forEach(child => appendLeaves(child.row.id));
        }
    };

    Object.keys(selection).forEach(id => appendLeaves(id));
    Object.values(leaves).map(leaf => strikeParents(leaf));
    const rankFiltered = Object.values(leaves).filter(leaf => copyChecklistRanks.includes(leaf.rank));
    return rankFiltered.map(leaf => leaf.iNaturalistTaxonName).sort();
};
