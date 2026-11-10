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
<style src="../../css/maplibre-gl.css"></style>
<style src="../../css/mapbox-gl-draw.css"></style>
<script>
"use strict";

// The map of the standard visualisation, over street map tiles, gridding the observations surviving the filters, whose
// cells and drawn polygons select observations. It renders into the markup its parent's template places at its @id
fluid.def("hortis.vizLibreMap", {
    $layers: ["hortis.libreMap.withTiles", "hortis.libreMap.streetmapTiles", "hortis.libreMap.withPolygonDraw", "hortis.libreMap.withObsGridLegend",
        "hortis.libreObsMap"],
    legendPosition: "bottom-left",
    gridSelector: {
        $component: {
            renderTooltip: "$method:hortis.renderVizGridTooltip({libreMap}.obsQuantiser.grid, {vizLoader}.taxa.rowById, {0}:cellId)"
        }
    }
});

</script>
