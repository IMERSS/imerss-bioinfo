/* eslint-env node */
"use strict";

const glob = require("glob"),
    fs = require("fs-extra"),
    childProcess = require("child_process");

const fluid = require("infusion"),
    infusion6 = require("./src/infusion6.js");
const terser = require("terser");
const path = require("path");

// Builds into docs, for GitHub Pages, the older visualisations driven by .lz4 files, as imerss-viz-all.js, the bundles
// of the "new" framework from which Xetthecum's story map is built, as imerss-viz-lib.js and imerss-viz-new-core.js,
// and the pages of the newer visualisations ported to Infusion 6 together with the modules they depend upon - see
// buildI6 below

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
        src: "data/b-team/plant-pollinators-OBA-2025-labels.viz",
        dest: "docs/data/b-team/plant-pollinators-OBA-2025-labels.viz"
    }, {
        src: "data/b-team/plant-pollinators-OBA-2025-assigned-taxa.viz",
        dest: "docs/data/b-team/plant-pollinators-OBA-2025-assigned-taxa.viz"
    }, {
        src: "data/b-team/plant-pollinators-OBA-2025-regionIndirection.csv",
        dest: "docs/data/b-team/plant-pollinators-OBA-2025-regionIndirection.csv"
    }, {
        src: "data/b-team/plant-pollinators-WaBA-2026-labels.viz",
        dest: "docs/data/b-team/plant-pollinators-WaBA-2026-labels.viz"
    }, {
        src: "data/b-team/plant-pollinators-WaBA-2026-assigned-taxa.viz",
        dest: "docs/data/b-team/plant-pollinators-WaBA-2026-assigned-taxa.viz"
    }, {
        src: "data/b-team/plant-pollinators-WaBA-2026-regionIndirection.csv",
        dest: "docs/data/b-team/plant-pollinators-WaBA-2026-regionIndirection.csv"
    }, {
        src: "data/b-team/plant-pollinators-BCBA-labels.viz",
        dest: "docs/data/b-team/plant-pollinators-BCBA-labels.viz"
    }, {
        src: "data/b-team/plant-pollinators-BCBA-assigned-taxa.viz",
        dest: "docs/data/b-team/plant-pollinators-BCBA-assigned-taxa.viz"
    }, {
        src: "data/b-team/plant-pollinators-BCBA-regionIndirection.csv",
        dest: "docs/data/b-team/plant-pollinators-BCBA-regionIndirection.csv"
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
    }, {
        src: "data/b-team/placeholder/*",
        dest: "docs/data/b-team/placeholder"
    }, {
        src: "data/Galiano 2023 BioBlitz/placeholder/*",
        dest: "docs/data/Galiano 2023 BioBlitz/placeholder"
    }, {
        src: "data/dataPaper-II/placeholder/*",
        dest: "docs/data/dataPaper-II/placeholder"
    }
    ],
    // The pages of the visualisations ported to Infusion 6, copied into docs from src/buildSource with the rest of its
    // pages - see buildI6. One of them, which loads quickly, is verified as built, by the test of its round trip
    // between its minimal and hydrated forms - the others are written by the same steps, from the same modules
    i6Pages: ["indexBeasBCBA.html", "indexBeasOBA.html", "indexBeasWaBA.html", "indexBlitz.html", "indexDiatoms.html"],
    i6Verify: ["test/i6/bbeaHydrationRoundTrip.js", "docs", "indexBeasWaBA.html"]
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

/**
 * Build the bundles of the "new" framework from which Xetthecum's story map is built - see the config.json5 of
 * https://github.com/IMERSS/xetthecum-storymap-story, which copies them from docs
 * @param {Object} buildIndex - The build index
 * @return {Promise} A promise which resolves once the bundles are written
 */
const buildStory = async function (buildIndex) {

    // imerss-viz-lib.js contains just upstream libraries we depend on, to support reasonably easy deploy of "new" framework
    const libJsHash = filesToContentHash(buildIndex.libSource, ".js");
    console.log("libFiles ", buildIndex.libSource);
    const minifiedLib = await minify(libJsHash, "imerss-viz-lib.js");

    const newCoreJsHash = filesToContentHash(buildIndex.newCoreSource, ".js");
    console.log("newCoreFiles ", buildIndex.newCoreSource);
    const newCoreJs = await minify(newCoreJsHash, "imerss-viz-new-core.js");


    fs.writeFileSync("docs/js/imerss-viz-lib.js", minifiedLib.code, "utf8");
    fs.writeFileSync("docs/js/imerss-viz-lib.js.map", minifiedLib.map);
    fs.writeFileSync("docs/js/imerss-viz-new-core.js", newCoreJs.code, "utf8");
    fs.writeFileSync("docs/js/imerss-viz-new-core.js.map", newCoreJs.map);

    const cssLibHash = filesToContentHash(buildIndex.libSource, ".css");
    const cssLibConcat = String.prototype.concat.apply("", Object.values(cssLibHash));

    const cssNewCoreHash = filesToContentHash(buildIndex.newCoreSource, ".css");
    const cssNewCoreConcat = String.prototype.concat.apply("", Object.values(cssNewCoreHash));


    fs.writeFileSync("docs/css/imerss-viz-lib.css", cssLibConcat);
    fs.writeFileSync("docs/css/imerss-viz-new-core.css", cssNewCoreConcat);

};

const buildFromFiles = async function (buildIndex) {
    const allOldFiles = buildIndex.libSource.concat(buildIndex.oldSource);
    console.log("allOldFiles ", allOldFiles);

    const oldJsHash = filesToContentHash(allOldFiles, ".js");
    const allOldJsHash = fluid.extend({header: buildIndex.codeHeader}, oldJsHash, {footer: buildIndex.codeFooter});
    const minifiedAllOld = await minify(allOldJsHash, "imerss-viz-all.js");

    fs.removeSync("docs");
    fs.ensureDirSync("docs/js");
    fs.writeFileSync("docs/js/imerss-viz-all.js", minifiedAllOld.code, "utf8");
    fs.writeFileSync("docs/js/imerss-viz-all.js.map", minifiedAllOld.map);


    const allOldCssHash = filesToContentHash(allOldFiles, ".css");
    const allOldCssConcat = String.prototype.concat.apply("", Object.values(allOldCssHash));

    fs.ensureDirSync("docs/css");
    fs.writeFileSync("docs/css/imerss-viz-all.css", allOldCssConcat);

    await buildStory(buildIndex);

    buildIndex.copy.forEach(function (oneCopy) {
        copyDep(oneCopy.src, oneCopy.dest);
    });
    fluid.log("Copied " + (buildIndex.copy.length + 2) + " files to " + fs.realpathSync("docs"));
};

/**
 * Run a node script from this checkout in a child process, failing the build if it fails
 * @param {String[]} args - The script and its arguments
 */
const runNode = function (args) {
    console.log("Running node " + args.join(" "));
    const result = childProcess.spawnSync(process.execPath, args, {stdio: ["ignore", "pipe", "inherit"], encoding: "utf8",
        maxBuffer: 256 * 1024 * 1024});
    const reported = (result.stdout || "").split("\n").filter(line => !line.startsWith("fluid.loadInContext"));
    console.log(reported.slice(-12).join("\n"));
    if (result.status !== 0) {
        throw new Error("node " + args.join(" ") + " failed with status " + result.status);
    }
};

/**
 * Build into docs the pages of the visualisations ported to Infusion 6, already copied there from src/buildSource,
 * where each is written as it is served from docs. Infusion 6's copyOut.js copies into docs/vendor the files of the
 * modules each page depends upon, from this checkout and from Infusion 6 - installed by npm, or as named by moduleOverrides.json5 - and writes docs/fluid-modules.json
 * locating them. Each page is then verified by its test, which checks that it renders identically in the browser
 * whether booted from its minimal form or from its hydrated form, and that its hydration is reversed exactly by
 * dehydrate.js. Finally each page is hydrated in place, with Infusion in its built form, so that it shows its
 * rendering from placeholder data before it boots - the page as written in src/buildSource is recovered from it by
 * dehydrate.js.
 * @param {Object} buildIndex - The build index
 * @param {Boolean} verify - `false` if the pages are not to be verified
 */
const buildI6 = function (buildIndex, verify) {
    // Infusion 6 as installed by npm, or the checkout named for it by moduleOverrides.json5
    const infusion6Dir = infusion6.dir();
    const pages = buildIndex.i6Pages.map(page => path.join("docs", page));
    // The stylesheets of the Oregon State University site hosting the atlases refer to its theme's fonts and images,
    // which are served only there, and to forms of its fonts which are not held here
    const sources = ["--source", "infusion-6=" + infusion6Dir, "--source", "imerss-bioinfo=.",
        "--ignore-missing", "sites/all/", "--ignore-missing", "fonts/OSU/"];
    // Copied once in the form booted by FluidBoot.js, which the minimal pages verified are written in, and once in
    // the built form in which they are hydrated
    runNode([path.join(infusion6Dir, "src/framework/server/copyOut.js"), ...pages, ...sources, "--framework", "boot"]);
    runNode([path.join(infusion6Dir, "src/framework/server/copyOut.js"), ...pages, ...sources, "--framework", "built"]);
    if (verify) {
        runNode(buildIndex.i6Verify);
    }
    pages.forEach(page => runNode([path.join(infusion6Dir, "src/framework/server/hydrate.js"), page, "-o", page, "--framework", "built"]));
};

fluid.setLogging(true);

// Usage: node build.js [story|i6] [--no-verify]
//   story        Build only the bundles from which Xetthecum's story map is built
//   i6           Build only the pages ported to Infusion 6, into an existing docs
//   --no-verify  Do not verify the pages ported to Infusion 6
const mode = process.argv[2];
const verify = !process.argv.includes("--no-verify");

const build = async function (buildIndex) {
    if (mode === "story") {
        await buildStory(buildIndex);
    } else if (mode === "i6") {
        copyDep("src/buildSource/*.html", "docs/");
        buildI6(buildIndex, verify);
    } else {
        await buildFromFiles(buildIndex);
        buildI6(buildIndex, verify);
    }
};

build(buildIndex).then(null, function (error) {
    console.log(error);
    process.exitCode = 1;
});
