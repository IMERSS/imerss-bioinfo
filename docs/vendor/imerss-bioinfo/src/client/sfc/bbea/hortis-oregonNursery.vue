<script src="../../js/i6/imerss-core.js"></script>
<style src="../../css/hortis-oregonNursery.css"></style>
<script>
"use strict";

// Marks the plants of the seed mix evaluator which are available from the nurseries of Oregon Nursery Native Plants,
// whilst the Region filter selects Oregon, or any region of Oregon. A page of an atlas whose taxa bear the column
// oregonNurseries - see obp-private's R/merge-nursery.R - lays this layer over its visualisation, e.g.
//     $layers: ["hortis.beaVizLoader", "hortis.oregonNursery"]
// It is held apart from the visualisation, which knows nothing of it: whilst Oregon is selected, its linkage lays
// hortis.oregonNursery.seedMix over the evaluator, supplying the evaluator's plantAnnotations
fluid.def("hortis.oregonNursery", {
    // The label of the state whose selection shows the nurseries, as it names the state's regions in the Region filter -
    // see hortis.groupedRegionFilter.regionKeys
    nurseryState: "Oregon",
    nurseryStateSelected: "$compute:hortis.oregonNursery.stateSelected({self}.regionFacet.body.regionFilter.filterState, {self}.nurseryState)",
    nurseryLinkage: {
        $linkage: {
            $if: "{self}.nurseryStateSelected",
            scope: "{self}",
            inputLayers: "hortis.seedMix",
            outputLayers: "hortis.oregonNursery.seedMix"
        }
    }
});

/**
 * Determine whether the Region filter selects a state, or any of its regions.
 * @param {Object<String, Boolean>} filterState - The Region filter's state, a hash of the names of selected regions
 * @param {String} state - The label of the state
 * @return {Boolean} `true` if the state, or any region of it, is selected
 */
hortis.oregonNursery.stateSelected = function (filterState, state) {
    return Object.keys(filterState || {}).some(key => filterState[key] && (key === state || key.startsWith(state + ":")));
};

// Laid over the seed mix evaluator whilst the state is selected
fluid.def("hortis.oregonNursery.seedMix", {
    // The field of the taxa naming the nurseries from which each is available
    nurseryField: "oregonNurseries",
    // The search of OregonFlora for a plant, to which its mark links, completed by its name
    nurserySearch: "https://oregonflora.org/taxa/search.php?search=",
    nurseryTitle: "Seeds available from Oregon Nursery Native Plants",
    plantAnnotations: "$compute:hortis.oregonNursery.annotations({self}.network, {self}.nurseryField, {self}.nurserySearch, {self}.nurseryTitle)"
});

/**
 * Compute the mark of each plant of the evaluator's network which is available from a nursery - OregonFlora's icon,
 * linking to OregonFlora's search for the plant, by its name.
 * @param {Object} network - The plant-pollinator network, as computed by `hortis.seedMix.computeNetwork`
 * @param {String} nurseryField - The field of the taxa naming the nurseries from which each is available
 * @param {String} nurserySearch - The URL of OregonFlora's search, to which the plant's name is appended
 * @param {String} nurseryTitle - The tooltip of the mark
 * @return {Object<String, String>} The markup of the mark of each plant available, by plant species id
 */
hortis.oregonNursery.annotations = function (network, nurseryField, nurserySearch, nurseryTitle) {
    const togo = {};
    const title = hortis.encodeHTML(nurseryTitle);
    network.plants.forEach(plant => {
        if (plant.row[nurseryField]) {
            const link = hortis.encodeHTML(nurserySearch + encodeURIComponent(plant.row.iNaturalistTaxonName));
            togo[plant.id] = `<a class="mf-oregon-nursery" href="${link}" target="_blank" rel="noopener" title="${title}" ` +
                `aria-label="${title}"></a>`;
        }
    });
    return togo;
};
</script>
