<fluid-import src="../core/hortis-icons.vue"></fluid-import>
<script src="%@popperjs/core/dist/umd/popper-lite.min.js" fluid-client data-fl-scope="global"></script>
<script src="../../js/colour.js" data-fl-scope="global"></script>
<script src="../../js/i6/imerss-core.js"></script>
<script src="../../js/i6/tooltip.js"></script>
<script src="../../js/i6/bbea/mfShell.js"></script>
<script src="../../js/i6/libreMap.js"></script>
<script src="../../js/i6/bbea/imerss-bbea.js"></script>
<script>
"use strict";

// Evaluates the habitat for bees provided by a seed mix of plants, starting from those established on a site
fluid.def("hortis.seedMix", {
    $layers: ["hortis.icons", "hortis.bbeaView"],
    tabId: "seed",
    // Number of candidate plants listed before the user asks to see them all
    shortListLength: 60,
    allObs: "{vizLoader}.obsRows",
    // Observations passing the filters but not the bee and plant selections - these define the site
    siteObs: "{vizLoader}.filteredObs",
    rowById: "{vizLoader}.taxa.rowById",
    network: "$compute:hortis.seedMix.computeNetwork({self}.allObs, {self}.rowById)",
    established: "$compute:hortis.seedMix.computeEstablished({self}.siteObs, {self}.allObs, {self}.rowById)",
    note: "$compute:hortis.seedMix.note({self}.established)",
    // Hashes to true of the ids of established plants which the user has unticked, and of further plants they have ticked
    removed: {
        $reactiveRoot: {}
    },
    added: {
        $reactiveRoot: {}
    },
    // Bound two-way to the search box
    query: "",
    showAll: false,
    // Bumped to rerender the plant list when the selection is reset
    listVersion: 0,
    output: "$compute:hortis.seedMix.output({self}.active, {self}.network, {self}.established, {self}.removed, {self}.added)",
    listSlot: {
        $component: {
            $layers: "hortis.verbatimSlot",
            markup: `$compute:hortis.seedMix.listMarkup({seedMix}, {seedMix}.active, {seedMix}.network, {seedMix}.established, {seedMix}.query,
                {seedMix}.showAll, {seedMix}.listVersion)`
        }
    },
    readSlot: {
        $component: {
            $layers: "hortis.verbatimSlot",
            markup: "{seedMix}.output.readMarkup"
        }
    },
    chartSlot: {
        $component: {
            $layers: "hortis.verbatimSlot",
            markup: "{seedMix}.output.chartMarkup"
        }
    },
    download: "$method:hortis.seedMix.download({self}.network, {self}.established, {self}.removed, {self}.added)"
});

/**
 * Index the whole dataset's plant-pollinator network at the level of species.
 * @param {Object[]} obsRows - All observations in the dataset
 * @param {Object<String, Object>} rowById - Map of taxon id to taxon row
 * @return {Object} Members `plants`, a Map of plant id to `{id, label, bees}` where `bees` is the Set of ids of bee
 * species recorded visiting it, and `beeFamily`, a Map of the id of each bee species recorded on any plant to its family
 */
hortis.seedMix.computeNetwork = function (obsRows, rowById) {
    const plants = new Map();
    const beeFamily = new Map();
    obsRows.forEach(obsRow => {
        const plantRow = rowById[obsRow.plantINatId];
        const beeRow = rowById[obsRow.pollinatorINatId];
        if (plantRow && beeRow) {
            const plant = hortis.speciesRowOf(plantRow);
            const bee = hortis.speciesRowOf(beeRow);
            let entry = plants.get(plant.id);
            if (!entry) {
                entry = {id: plant.id, row: plant, label: hortis.taxonLabel(plant), bees: new Set()};
                plants.set(plant.id, entry);
            }
            entry.bees.add(bee.id);
            if (!beeFamily.has(bee.id)) {
                beeFamily.set(bee.id, hortis.familyNameOf(bee));
            }
        }
    });
    return {plants, beeFamily};
};

/**
 * Determine which plants are already established on the site - those recorded in observations passing the current
 * filters. If no filter is active there is no site, and no plant is established.
 * @param {Object[]} siteObs - Observations passing the current filters
 * @param {Object[]} allObs - All observations in the dataset
 * @param {Object<String, Object>} rowById - Map of taxon id to taxon row
 * @return {Set<String>} The ids of established plant species
 */
hortis.seedMix.computeEstablished = function (siteObs, allObs, rowById) {
    const togo = new Set();
    if (siteObs.length < allObs.length) {
        siteObs.forEach(obsRow => {
            const plantRow = rowById[obsRow.plantINatId];
            if (plantRow && rowById[obsRow.pollinatorINatId]) {
                togo.add(hortis.speciesRowOf(plantRow).id);
            }
        });
    }
    return togo;
};

/**
 * Compute the plants currently making up the seed mix.
 * @param {Set<String>} established - Ids of plants established on the site
 * @param {Set<String>} removed - Ids of established plants the user has unticked
 * @param {Set<String>} added - Ids of further plants the user has ticked
 * @return {Set<String>} Ids of the plants in the mix
 */
hortis.seedMix.mix = function (established, removed, added) {
    const mix = new Set([...established].filter(id => !removed.has(id)));
    added.forEach(id => mix.add(id));
    return mix;
};

hortis.seedMix.plantMarkup = function (plant, checked) {
    const beeCount = plant.bees.size;
    return `<label class="imerss-taxon"><input type="checkbox" data-seed="${plant.id}"${checked ? " checked" : ""}>` +
        `<span>${hortis.taxonNameMarkup(plant.row)}</span>` +
        `<i title="Visited by ${hortis.plural(beeCount, "bee species", "bee species")} across the whole dataset">${beeCount}</i></label>`;
};

/**
 * Render the chart of the share of each bee family's species supported by the seed mix, as SVG markup.
 * @param {String[]} families - The bee families, in display order
 * @param {Map<String, Number>} totals - Number of species of each family recorded on plants in the dataset
 * @param {Map<String, Number>} reached - Number of species of each family supported by the mix
 * @return {String} The chart's SVG markup
 */
hortis.seedMix.familyChart = function (families, totals, reached) {
    const width = 340, height = 230, left = 44, right = width - 8, top = 22, base = 150;
    const band = (right - left) / Math.max(families.length, 1);
    const barWidth = band * 0.6;
    const parts = [];
    [0, 50, 100].forEach(percent => {
        const y = base - percent / 100 * (base - top);
        parts.push(`<line x1="${left}" y1="${y}" x2="${right}" y2="${y}" class="imerss-chart-grid"/>`);
        parts.push(`<text x="${left - 6}" y="${y + 4}" text-anchor="end" class="imerss-chart-tick">${percent}%<title>${percent}% of the family's species supported</title></text>`);
    });
    families.forEach((family, i) => {
        const total = totals.get(family);
        const count = reached.get(family) || 0;
        const x = left + band * i + (band - barWidth) / 2;
        const full = base - top;
        const h = count / total * full;
        const tip = `${family}: ${count} of ${hortis.plural(total, "species", "species")} supported by the mix`;
        parts.push(`<rect x="${x}" y="${top}" width="${barWidth}" height="${full}" class="mf-chart-track"><title>${tip}</title></rect>`);
        parts.push(`<rect x="${x}" y="${base - h}" width="${barWidth}" height="${h}" fill="${hortis.pollColours.family[family] || "#999"}"><title>${tip}</title></rect>`);
        parts.push(`<text x="${x + barWidth / 2}" y="${top - 5}" text-anchor="middle" class="imerss-chart-tick">${count}/${total}<title>${tip}</title></text>`);
        parts.push(`<text x="0" y="0" text-anchor="end" class="imerss-chart-label" transform="translate(${x + barWidth / 2 + 3} ${base + 9}) rotate(-40)">${hortis.encodeHTML(family)}<title>${tip}</title></text>`);
    });
    parts.push(`<line x1="${left}" y1="${base}" x2="${right}" y2="${base}" class="imerss-chart-axis-line"/>`);
    parts.push(`<text x="0" y="0" text-anchor="middle" class="imerss-chart-axis" transform="translate(12 ${(top + base) / 2}) rotate(-90)">Species supported<title>Share of each family's species recorded visiting a plant in the mix</title></text>`);
    parts.push(`<text x="${(left + right) / 2}" y="${height - 4}" text-anchor="middle" class="imerss-chart-axis">Bee family<title>Bee families recorded on plants in this dataset</title></text>`);
    return `<svg class="mf-seedchart" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Share of each bee family supported">${parts.join("")}</svg>`;
};

hortis.seedMix.keySet = hash => new Set(Object.keys(hash));

/**
 * Add or remove a key of a hash held in a reactive root, writing a fresh hash.
 * @param {Object<String, Boolean>} hash - The current hash
 * @param {String} id - The key to be added or removed
 * @param {Boolean} present - `true` to add the key, `false` to remove it
 * @return {Object<String, Boolean>} The updated hash
 */
hortis.seedMix.updateHash = function (hash, id, present) {
    const togo = {...hash};
    if (present) {
        togo[id] = true;
    } else {
        delete togo[id];
    }
    return togo;
};

hortis.seedMix.download = function (network, established, removedHash, addedHash) {
    const mix = hortis.seedMix.mix(established, hortis.seedMix.keySet(removedHash), hortis.seedMix.keySet(addedHash));
    const ids = new Set([...established, ...mix]);
    const rows = [...ids].map(id => network.plants.get(id)).filter(plant => plant).map(plant => [
        plant.label,
        established.has(plant.id) ? "established" : "added",
        mix.has(plant.id) ? "yes" : "no",
        plant.bees.size
    ]);
    hortis.downloadCSV(["plant", "status", "inMix", "beeSpeciesVisiting"], rows, "seed-mix.csv");
};

/** Markup of the seed mix evaluator **/

/**
 * Describe how the seed mix evaluator treats the site.
 * @param {Set<String>} established - The ids of the plants established on the site
 * @return {String} The description
 */
hortis.seedMix.note = function (established) {
    return established.size > 0 ?
        "Plants recorded under the current filters are treated as already established on the site, and start ticked - " +
        "untick any which will be removed. Tick further plants to model a seed mix." :
        "No site is defined. Use the Region filter, draw a polygon on the map or click a map cell to define one, " +
        "and plants recorded there will be listed as already established. Meanwhile, tick plants to model a seed mix.";
};

/**
 * Render the list of plants which may be ticked into the seed mix.
 * @param {hortis.seedMix} that - The evaluator
 * @param {Boolean} active - `true` if the view's tab is selected - otherwise nothing is rendered
 * @param {Object} network - The plant-pollinator network, as computed by `hortis.seedMix.computeNetwork`
 * @param {Set<String>} established - The ids of the plants established on the site
 * @param {String} query - The contents of the search box
 * @param {Boolean} showAll - `true` if every candidate plant is to be listed
 * @return {String} The markup of the list
 */
hortis.seedMix.listMarkup = function (that, active, network, established, query, showAll) {
    let markup = "";
    if (active) {
        // Read the user's ticks without depending on them, so that ticking a plant doesn't rerender the list beneath the
        // pointer - the list is rerendered with them when it is reset, since listVersion is one of our arguments
        const {removed, added} = fluid.cell.untracked(() => ({removed: hortis.seedMix.keySet(that.removed), added: hortis.seedMix.keySet(that.added)}));
        const words = hortis.queryWords(query);
        const matches = plant => words.every(word => plant.label.toLowerCase().includes(word));
        const byBees = (a, b) => b.bees.size - a.bees.size || a.label.localeCompare(b.label);
        const establishedPlants = [...established].map(id => network.plants.get(id)).filter(plant => plant && matches(plant)).sort(byBees);
        const candidates = [...network.plants.values()].filter(plant => !established.has(plant.id) && matches(plant)).sort(byBees);
        const limit = showAll || words.length > 0 ? candidates.length : that.shortListLength;
        const groupHead = (title, tip) => `<p class="mf-seedgroup" title="${tip}">${title}</p>`;
        if (establishedPlants.length > 0) {
            markup += groupHead(`Already established on site (${establishedPlants.length})`,
                `${hortis.plural(establishedPlants.length, "plant species", "plant species")} recorded under the current filters`) +
                `<div class="imerss-taxon-list mf-taxa-cols">${establishedPlants.map(plant => hortis.seedMix.plantMarkup(plant, !removed.has(plant.id))).join("")}</div>`;
        }
        markup += groupHead(`Available for seed mixes (${candidates.length})`,
            `${hortis.plural(candidates.length, "further plant species", "further plant species")} recorded in the dataset, ordered by the number of bee species visiting them`) +
            `<div class="imerss-taxon-list mf-taxa-cols">${candidates.slice(0, limit).map(plant => hortis.seedMix.plantMarkup(plant, added.has(plant.id))).join("")}</div>`;
        if (limit < candidates.length) {
            markup += `<button type="button" class="imerss-linkbtn imerss-seed-more">Show all ${hortis.formatInt(candidates.length)} plants</button>`;
        }
    }
    return markup;
};

/**
 * Evaluate the habitat provided by the seed mix.
 * @param {Boolean} active - `true` if the view's tab is selected - otherwise nothing is rendered
 * @param {Object} network - The plant-pollinator network, as computed by `hortis.seedMix.computeNetwork`
 * @param {Set<String>} established - The ids of the plants established on the site
 * @param {Object<String, Boolean>} removedHash - The established plants which the user has unticked
 * @param {Object<String, Boolean>} addedHash - The further plants which the user has ticked
 * @return {Object} Members `share`, the percentage of the dataset's bee species supported, `meterTitle`, describing it,
 * and `readMarkup` and `chartMarkup`, the markup of the readout and the chart of support by bee family
 */
hortis.seedMix.output = function (active, network, established, removedHash, addedHash) {
    let togo = {share: 0, meterTitle: null, readMarkup: "", chartMarkup: ""};
    if (active) {
        const mix = hortis.seedMix.mix(established, hortis.seedMix.keySet(removedHash), hortis.seedMix.keySet(addedHash));
        const supported = new Set();
        mix.forEach(id => network.plants.get(id)?.bees.forEach(bee => supported.add(bee)));
        const all = network.beeFamily.size;
        const share = all > 0 ? Math.round(supported.size / all * 100) : 0;
        const totals = new Map();
        network.beeFamily.forEach(family => totals.set(family, (totals.get(family) || 0) + 1));
        const reached = new Map();
        supported.forEach(bee => {
            const family = network.beeFamily.get(bee);
            reached.set(family, (reached.get(family) || 0) + 1);
        });
        const families = [...totals.keys()].sort((a, b) => totals.get(b) - totals.get(a));
        togo = {
            share,
            meterTitle: `${share}% of the bee species recorded on plants in this dataset visit a plant in the mix`,
            readMarkup: `<b title="Bee species recorded visiting at least one plant in the mix">${hortis.formatInt(supported.size)}</b> of ` +
                `<span title="All bee species recorded visiting plants anywhere in this dataset">${hortis.formatInt(all)}</span> bee species supported` +
                ` &mdash; <span title="Share of the dataset's bee species supported by the mix">${share}%</span>` +
                `<br/><span title="Number of plant species currently ticked">${hortis.plural(mix.size, "plant species", "plant species")} in the mix</span>`,
            chartMarkup: hortis.seedMix.familyChart(families, totals, reached)
        };
    }
    return togo;
};

/**
 * Respond to a change within the seed mix evaluator - a plant being ticked or unticked.
 * @param {Event} event - The change event
 * @param {hortis.seedMix} that - The evaluator
 */
hortis.seedMix.change = function (event, that) {
    const input = event.target.closest("input[data-seed]");
    if (input) {
        const id = input.dataset.seed;
        if (that.established.has(id)) {
            that.removed = hortis.seedMix.updateHash(that.removed, id, !input.checked);
        } else {
            that.added = hortis.seedMix.updateHash(that.added, id, input.checked);
        }
    }
};

/**
 * Respond to a click within the seed mix evaluator - on the buttons showing every plant or resetting the mix.
 * @param {Event} event - The click event
 * @param {hortis.seedMix} that - The evaluator
 */
hortis.seedMix.click = function (event, that) {
    if (event.target.closest(".imerss-seed-more")) {
        that.showAll = true;
    } else if (event.target.closest(".imerss-seed-reset")) {
        that.removed = {};
        that.added = {};
        that.listVersion = that.listVersion + 1;
        // The list's markup may be unchanged by the reset, and so not rerendered - restore the ticks the user has changed
        event.currentTarget.querySelectorAll("input[data-seed]").forEach(input => {
            input.checked = that.established.has(input.dataset.seed);
        });
    }
};
</script>

<template>
    <div class="imerss-mount imerss-mount-pad" role="tabpanel" hidden="@{inactive}"
        @onchange="hortis.seedMix.change({0}, {self})" @onclick="hortis.seedMix.click({0}, {self})">
        <div class="mf-seedwrap">
            <div class="mf-seedcol">
                <div class="mf-seedtop">
                    <p class="mf-seedhead">Plants in your seed mix</p>
                    <button class="imerss-linkbtn imerss-seed-reset" type="button" title="Restore the established plants and clear any added ones">
                        <svg width="13" height="13" aria-hidden="true"><use href="#imerss-i-reset"/></svg> Reset mix
                    </button>
                </div>
                <p class="mf-seednote">@{note}</p>
                <div class="imerss-combo">
                    <svg class="imerss-combo-icon" width="14" height="14" aria-hidden="true"><use href="#imerss-i-search"/></svg>
                    <input type="search" class="imerss-combo-input mf-seed-search" placeholder="Search plants" aria-label="Search plants"
                        autocomplete="off" spellcheck="false" value="@{query}"/>
                </div>
                <div class="imerss-listbody mf-seed-list" @id="listSlot"></div>
            </div>
            <div class="mf-seedcol mf-seedcol-out">
                <p class="mf-seedhead">Habitat provided</p>
                <div class="mf-meter" title="@{output.meterTitle}"><div class="mf-meter-fill" style="width: @{output.share}%"></div></div>
                <p class="mf-seedread" @id="readSlot"></p>
                <div class="mf-seedchart-holder" @id="chartSlot"></div>
            </div>
        </div>
    </div>
</template>
