<script src="%maplibre-gl/dist/maplibre-gl-dev.js" fluid-client data-fl-scope="global"></script>
<script src="%@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw-unminified.js" fluid-client data-fl-scope="global"></script>
<script src="%@popperjs/core/dist/umd/popper-lite.min.js" fluid-client data-fl-scope="global"></script>
<script src="../../../lib/point-in-polygon.js" data-fl-scope="global"></script>
<script src="../../../geom/geoJSON.js" data-fl-scope="global"></script>
<script src="../../js/colour.js" data-fl-scope="global"></script>
<script src="../../js/i6/imerss-core.js"></script>
<script src="../../js/i6/filters.js"></script>
<script src="../../js/i6/tooltip.js"></script>
<script src="../../js/i6/libreMap.js"></script>
<script src="../../js/i6/polygonDraw.js"></script>
<script src="../../js/i6/bbea/imerss-bbea.js"></script>
<style src="../../css/maplibre-gl.css"></style>
<style src="../../css/mapbox-gl-draw.css"></style>
<script>
"use strict";

// The map of the BBEA visualisation, gridding the observations surviving the filters and selections. It renders into
// the markup its parent's template places at its @id
fluid.def("hortis.bbeaLibreMap", {
    $layers: ["hortis.libreMap.withTiles", "hortis.libreMap.streetmapTiles", "hortis.libreMap.usEcoL3Tiles", "hortis.libreMap.withPolygonDraw",
        "hortis.libreObsMap"],
    gridResolution: 6000,
    gridSelector: {
        $component: {
            renderTooltip: "$method:hortis.renderBbeaGridTooltip({libreMap}.obsQuantiser.grid, {vizLoader}.taxa.rowById, {0}:cellId)"
        }
    },
    obsQuantiser: {
        $component: {
            baseLatitude: 44,
            newBucket: "hortis.bbeaGridBucket",
            indexObs: "hortis.indexBbeaObs"
        }
    }
});
</script>
