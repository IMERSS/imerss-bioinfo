/* eslint-env node */
"use strict";

const glob = require("glob"),
    fs = require("fs-extra");

const fluid = require("infusion");
const terser = require("terser");
const path = require("path");

const buildIndex = {
    libSource: [
        "node_modules/infusion/src/framework/core/css/fluid.css",
        "node_modules/infusion/src/lib/jquery/ui/css/default-theme/core.css",
        "node_modules/infusion/src/lib/jquery/ui/css/default-theme/tooltip.css",
        "node_modules/infusion/src/lib/jquery/ui/css/default-theme/theme.css",
        "node_modules/jquery-ui/themes/base/tabs.css",
        "node_modules/accessible-autocomplete/dist/accessible-autocomplete.min.js",
        "node_modules/accessible-autocomplete/dist/accessible-autocomplete.min.css",
        //        "node_modules/infusion/src/lib/jquery/core/js/jquery.js",
        "src/client/css/imerss-core.css",
        "src/lib/signals-core.min.js",
        "node_modules/infusion/src/lib/jquery/ui/js/version.js",
        "node_modules/infusion/src/lib/jquery/ui/js/keycode.js",
        "node_modules/jquery-ui/ui/safe-active-element.js",
        "node_modules/jquery-ui/ui/widget.js",
        "node_modules/jquery-ui/ui/unique-id.js",
        "node_modules/jquery-ui/ui/position.js",
        "node_modules/jquery-ui/ui/widgets/tooltip.js",
        "node_modules/infusion/src/framework/core/js/jquery.keyboard-a11y.js",
        "node_modules/infusion/src/framework/core/js/Fluid.js",
        "node_modules/infusion/src/framework/core/js/FluidPromises.js",
        "node_modules/infusion/src/framework/core/js/FluidDebugging.js",
        "node_modules/infusion/src/framework/core/js/FluidDocument.js",
        "node_modules/infusion/src/framework/core/js/FluidIoC.js",
        "node_modules/infusion/src/framework/core/js/DataBinding.js",
        "node_modules/infusion/src/framework/core/js/ModelTransformation.js",
        "node_modules/infusion/src/framework/core/js/ModelTransformationTransforms.js",
        "node_modules/infusion/src/framework/enhancement/js/ContextAwareness.js",
        "node_modules/infusion/src/framework/enhancement/js/ProgressiveEnhancement.js",
        "node_modules/infusion/src/framework/core/js/FluidView.js",
        "node_modules/infusion/src/framework/core/js/FluidView-browser.js",
        "node_modules/infusion/src/framework/core/js/NewViewSupport.js",
        "node_modules/infusion/src/framework/core/js/DataSource.js",
        "node_modules/infusion/src/framework/core/js/ResourceLoader.js",
        "node_modules/infusion/src/framework/core/js/ResourceLoader-browser.js",
        "src/client/js/new/fluidNew.js",
        "src/client/js/colour.js"
    ],
    oldSource: [
        "src/client/css/imerss-viz.css",
        "src/auxBuild/restoreJQuery.js",
        "src/lib/jquery-ui-widgets-tabs.js",
        "src/lib/lz4.js",
        "src/client/js/imerss-viz.js",
        "src/client/js/autocomplete.js",
        "src/client/js/leafletMap.js",
        "src/client/js/datasetControls.js",
        "src/client/js/leafletMapWithGrid.js",
        "src/client/js/leafletMapWithBareRegions.js",
        "src/client/js/leafletMapWithRegions.js",
        "src/client/js/renderSVG.js",
        "src/client/js/tabs.js",
        "src/client/js/checklist.js",
        "src/client/js/xetthecum.js"
    ],
    // Source for simplified environments such as Xetthecum without features like tabs, polygon drawing, etc.
    newCoreSource: [
        "src/utils/utils.js",
        "node_modules/papaparse/papaparse.min.js",
        "src/client/css/maplibre-gl.css",
        "node_modules/maplibre-gl/dist/maplibre-gl-dev.js",
        "src/client/js/new/taxonDisplay.js",
        "src/client/js/new/imerss-new.js",
        "src/client/js/new/newChecklist.js"
    ],
    // Full source for environments with strong focus on biodiversity info
    newSource: [
        "node_modules/@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.js",
        "src/client/css/mapbox-gl-draw.css", // has our own overrides
        "node_modules/papaparse/papaparse.min.js",
        "node_modules/pako/dist/pako_inflate.min.js",
        "node_modules/pretty-checkbox/dist/pretty-checkbox.min.css",
        "node_modules/@stanko/dual-range-input/dist/index.css",
        "src/lib/jquery-ui-widgets-tabs.js",
        "src/lib/point-in-polygon.js",
        "src/geom/geoJSON.js",
        "src/client/js/new/filters.js",
        "src/client/js/new/polygon-draw.js",
        "src/client/js/new/dual-range-input.js",
        "src/client/js/autocomplete.js",
        "src/client/js/tabs.js"
    ],
    codeHeader: "",
    codeFooter: "", // "\njQuery.noConflict()",
    copy: [{
        src: "node_modules/infusion/src/lib/jquery/core/js/jquery.js",
        dest: "docs/js/jquery.js"
    }, {
        src: "src/client/img",
        dest: "docs/img"
    }, {
        src: "src/client/json",
        dest: "docs/json"
    }, {
        src: "src/client/html",
        dest: "docs/html"
    }, {
        src: "src/client/css/*.css",
        dest: "docs/css"
    }, {
        src: "src/client/fonts",
        dest: "docs/fonts"
    }, {
        src: "src/client/js/new/bipartitePP.js",
        dest: "docs/js/bipartitePP.js"
    }, {
        src: "src/client/js/new/imerss-bbea.js",
        dest: "docs/js/imerss-bbea.js"
    }, {
        src: "src/client/js/new/imerss-viz.js",
        dest: "docs/js/imerss-viz.js"
    }, {
        src: "src/client/js/new/imerss-blitz.js",
        dest: "docs/js/imerss-blitz.js"
    }, {
        src: "src/lib/vizjs.js",
        dest: "docs/js/vizjs.js"
    }, {
        src: "src/buildSource/*.html",
        dest: "docs/"
    }, {
        src: "data/dataPaper-I/Life.json.lz4",
        dest: "docs/data/dataPaper-I/Life.json.lz4"
    }, {
        src: "data/Valdes/Life.json.lz4",
        dest: "docs/data/Valdes/Life.json.lz4"
    }, {
        src: "data/Galiano/Galiano-Life.json.lz4",
        dest: "docs/data/Galiano/Galiano-Life.json.lz4"
    }, {
        src: "data/Comprehensive Lists/Comp-Life.json.lz4",
        dest: "docs/data/Comprehensive Lists/Comp-Life.json.lz4"
    }, {
        src: "data/Galiano/Galiano_map_0.js",
        dest: "docs/data/Galiano/Galiano_map_0.js"
    }, {
        src: "data/Galiano WoL/Life.json.lz4",
        dest: "docs/data/Galiano WoL/Life.json.lz4"
    }, {
        src: "data/Xetthecum/Life.json.lz4",
        dest: "docs/data/Xetthecum/Life.json.lz4"
    }, {
        src: "data/Squamish/Squamish-Life.json.lz4",
        dest: "docs/data/Squamish/Squamish-Life.json.lz4"
    }, {
        src: "data/Pepiowelh/Life.json.lz4",
        dest: "docs/data/Pepiowelh/Life.json.lz4"
    }, {
        src: "src/lib/brightsign-keyboard.js",
        dest: "docs/js/brightsign-keyboard.js"
    }, {
        src: "data/b-team/plant-pollinators-OBA-2025-assigned-subset-labels.viz",
        dest: "docs/data/b-team/plant-pollinators-OBA-2025-assigned-subset-labels.viz"
    }, {
        src: "data/b-team/plant-pollinators-OBA-2025-assigned-taxa.viz",
        dest: "docs/data/b-team/plant-pollinators-OBA-2025-assigned-taxa.viz"
    }, {
        src: "data/b-team/regionIndirection.csv",
        dest: "docs/data/b-team/regionIndirection.csv"
    }, {
        src: "data/b-team/plant-pollinators-WaBA-2025-labels.csv",
        dest: "docs/data/b-team/plant-pollinators-WaBA-2025-labels.csv"
    }, {
        src: "data/b-team/plant-pollinators-WaBA-2025-assigned-taxa.csv",
        dest: "docs/data/b-team/plant-pollinators-WaBA-2025-assigned-taxa.csv"
    }, {
        src: "data/b-team/plant-pollinators-WaBA-2025-regionIndirection.csv",
        dest: "docs/data/b-team/plant-pollinators-WaBA-2025-regionIndirection.csv"
    }, {
        src: "data/Galiano 2023 BioBlitz/Galiano_Island_vascular_plant_records_consolidated-prepared.csv",
        dest: "docs/data/Galiano 2023 BioBlitz/Galiano_Island_vascular_plant_records_consolidated-prepared.csv"
    }, {
        src: "data/Galiano 2023 BioBlitz/Galiano_Island_vascular_plant_records_consolidated-prepared-taxa.csv",
        dest: "docs/data/Galiano 2023 BioBlitz/Galiano_Island_vascular_plant_records_consolidated-prepared-taxa.csv"
    },  {
        src: "data/Galiano 2023 BioBlitz/regionIndirection.csv",
        dest: "docs/data/Galiano 2023 BioBlitz/regionIndirection.csv"
    }, {
        src: "data/dataPaper-II/Salish_Sea_marine_diatom_records_consolidated_aligned_2025-03-prepared.csv",
        dest: "docs/data/dataPaper-II/Salish_Sea_marine_diatom_records_consolidated_aligned_2025-03-prepared.csv"
    }, {
        src: "data/dataPaper-II/Salish_Sea_marine_diatom_records_consolidated_aligned_2025-03-assigned-taxa.csv",
        dest: "docs/data/dataPaper-II/Salish_Sea_marine_diatom_records_consolidated_aligned_2025-03-assigned-taxa.csv"
    },  {
        src: "data/dataPaper-II/regionIndirection.csv",
        dest: "docs/data/dataPaper-II/regionIndirection.csv"
    }
    ]
};

// These two taken from reknit.js

const copyGlob = function (sourcePattern, targetDir) {
    console.log("copyGlob ", sourcePattern);
    const fileNames = glob.sync(sourcePattern);
    console.log("Got files ", fileNames);
    fileNames.forEach(filePath => {
        const fileName = path.basename(filePath);
        const destinationPath = path.join(targetDir, fileName);

        fs.ensureDirSync(path.dirname(destinationPath));
        fs.copyFileSync(filePath, destinationPath);
        console.log(`Copied file: ${fileName}`);
    });
};

/** Copy dependencies into docs directory for GitHub pages **/

const copyDep = function (source, target, replaceSource, replaceTarget) {
    const targetPath = fluid.module.resolvePath(target);
    const sourceModule = fluid.module.refToModuleName(source);
    if (sourceModule && sourceModule !== "maxwell") {
        require(sourceModule);
    }
    const sourcePath = fluid.module.resolvePath(source);
    if (replaceSource) {
        const text = fs.readFileSync(sourcePath, "utf8");
        const replaced = text.replace(replaceSource, replaceTarget);
        fs.writeFileSync(targetPath, replaced, "utf8");
        console.log(`Copied file: ${targetPath}`);
    } else if (sourcePath.includes("*")) {
        copyGlob(sourcePath, targetPath);
    } else {
        fs.ensureDirSync(path.dirname(targetPath));
        fs.copySync(sourcePath, targetPath);
        console.log(`Copied file: ${targetPath}`);
    }
};


const filesToContentHash = function (allFiles, extension) {
    const extFiles = allFiles.filter(function (file) {
        return file.endsWith(extension);
    });
    // console.log("Computed content hash ", extFiles, " for extension ", extension);
    const hash = Object.fromEntries(
        extFiles.map(filename => [filename, fs.readFileSync(filename, "utf8")])
    );
    return hash;
};

const minify = async function (hash, filename) {
    fluid.log("Minifying " + Object.keys(hash).length + " JS files to " + filename);
    return await terser.minify(hash, {
        mangle: false,
        compress: false, // https://github.com/terser/terser?tab=readme-ov-file#terser-fast-minify-mode
        sourceMap: {
            filename,
            url: filename + ".map",
            root: "../.."
        }
    });
};

const buildFromFiles = async function (buildIndex) {
    const allOldFiles = buildIndex.libSource.concat(buildIndex.oldSource);
    console.log("allOldFiles ", allOldFiles);

    const oldJsHash = filesToContentHash(allOldFiles, ".js");
    const allOldJsHash = fluid.extend({header: buildIndex.codeHeader}, oldJsHash, {footer: buildIndex.codeFooter});
    const minifiedAllOld = await minify(allOldJsHash, "imerss-viz-all.js");

    // imerss-viz-lib.js contains just upstream libraries we depend on, to support reasonably easy deploy of "new" framework
    const libJsHash = filesToContentHash(buildIndex.libSource, ".js");
    console.log("libFiles ", buildIndex.libSource);
    const minifiedLib = await minify(libJsHash, "imerss-viz-lib.js");

    const newCoreJsHash = filesToContentHash(buildIndex.newCoreSource, ".js");
    console.log("newCoreFiles ", buildIndex.newCoreSource);
    const newCoreJs = await minify(newCoreJsHash, "imerss-viz-new-core.js");

    const newJsHash = filesToContentHash(buildIndex.newSource, ".js");
    console.log("newFiles ", buildIndex.newSource);
    const newJs = await minify(newJsHash, "imerss-viz-new.js");

    fs.removeSync("docs");
    fs.ensureDirSync("docs/js");
    fs.writeFileSync("docs/js/imerss-viz-all.js", minifiedAllOld.code, "utf8");
    fs.writeFileSync("docs/js/imerss-viz-all.js.map", minifiedAllOld.map);
    fs.writeFileSync("docs/js/imerss-viz-lib.js", minifiedLib.code, "utf8");
    fs.writeFileSync("docs/js/imerss-viz-lib.js.map", minifiedLib.map);
    fs.writeFileSync("docs/js/imerss-viz-new-core.js", newCoreJs.code, "utf8");
    fs.writeFileSync("docs/js/imerss-viz-new-core.js.map", newCoreJs.map);
    fs.writeFileSync("docs/js/imerss-viz-new.js", newJs.code, "utf8");
    fs.writeFileSync("docs/js/imerss-viz-new.js.map", newJs.map);

    const allOldCssHash = filesToContentHash(allOldFiles, ".css");
    const allOldCssConcat = String.prototype.concat.apply("", Object.values(allOldCssHash));

    const cssLibHash = filesToContentHash(buildIndex.libSource, ".css");
    const cssLibConcat = String.prototype.concat.apply("", Object.values(cssLibHash));

    const cssNewCoreHash = filesToContentHash(buildIndex.newCoreSource, ".css");
    const cssNewCoreConcat = String.prototype.concat.apply("", Object.values(cssNewCoreHash));

    const cssNewHash = filesToContentHash(buildIndex.newSource, ".css");
    const cssNewConcat = String.prototype.concat.apply("", Object.values(cssNewHash));

    fs.ensureDirSync("docs/css");
    fs.writeFileSync("docs/css/imerss-viz-all.css", allOldCssConcat);
    fs.writeFileSync("docs/css/imerss-viz-lib.css", cssLibConcat);
    fs.writeFileSync("docs/css/imerss-viz-new-core.css", cssNewCoreConcat);
    fs.writeFileSync("docs/css/imerss-viz-new.css", cssNewConcat);

    buildIndex.copy.forEach(function (oneCopy) {
        copyDep(oneCopy.src, oneCopy.dest);
    });
    fluid.log("Copied " + (buildIndex.copy.length + 2) + " files to " + fs.realpathSync("docs"));
};

fluid.setLogging(true);

buildFromFiles(buildIndex).then(null, function (error) {
    console.log(error);
});
