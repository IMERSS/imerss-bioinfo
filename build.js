/* eslint-env node */
"use strict";

const readline = require("readline"),
    glob = require("glob"),
    fs = require("fs-extra");

const fluid = require("infusion");
const terser = require("terser");
const path = require("path");

const buildIndex = {
    excludes: [
        "jquery.js"
    ],
    localSource: [
        "src/client/css/imerss-core.css",
        "src/client/css/imerss-viz.css",
        "src/auxBuild/restoreJQuery.js",
        "src/lib/jquery-ui-widgets-tabs.js",
        "src/lib/lz4.js",
        "src/lib/signals-core.min.js",
        "src/client/js/imerss-viz.js",
        "src/client/js/autocomplete.js",
        "src/client/js/colour.js",
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
    newSource: [
        "src/lib/signals-core.min.js",
        "src/lib/jquery-ui-widgets-tabs.js",
        "src/client/js/colour.js",
        "src/client/js/renderSVG.js",
        "src/client/js/new/fluidNew.js",
        "src/client/js/new/imerss-new.js",
        "src/client/js/autocomplete.js",
        "src/client/js/tabs.js",
        "src/client/js/new/newChecklist.js",
        "src/client/js/new/taxonDisplay.js"
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
        src: "src/client/js/new/bipartitePP.js",
        dest: "docs/js/bipartitePP.js"
    }, {
        src: "src/client/js/new/imerss-bbea.js",
        dest: "docs/js/imerss-bbea.js"
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
        src: "data/b-team/us-eco-l3-regions.csv",
        dest: "docs/data/b-team/us-eco-l3-regions.csv"
    }, {
        src: "data/b-team/plant-pollinators-OBA-assigned-subset-labels.csv",
        dest: "docs/data/b-team/plant-pollinators-OBA-assigned-subset-labels.csv"
    }, {
        src: "data/b-team/plant-pollinators-OBA-assigned-taxa.csv",
        dest: "docs/data/b-team/plant-pollinators-OBA-assigned-taxa.csv"
    }, {
        src: "data/b-team/us-eco-l3-regions.csv",
        dest: "docs/data/b-team/us-eco-l3-regions.csv"
    }]
};


const readLines = function (filename) {
    const lines = [];
    const togo = fluid.promise();
    const rl = readline.createInterface({
        input: fs.createReadStream(filename),
        terminal: false
    });
    rl.on("line", function (line) {
        lines.push(line);
    });
    rl.on("close", function () {
        togo.resolve(lines);
    });
    rl.on("error", function (error) {
        togo.reject(error);
    });
    return togo;
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
    const hash = fluid.transform(fluid.arrayToHash(extFiles), function (troo, filename) {
        return fs.readFileSync(filename, "utf8");
    });
    return hash;
};

const computeAllFiles = function (buildIndex, nodeFiles) {
    const withExcludes = nodeFiles.filter(function (oneFile) {
        return !buildIndex.excludes.some(function (oneExclude) {
            return oneFile.indexOf(oneExclude) !== -1;
        });
    });
    return withExcludes.concat(buildIndex.localSource);
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

const buildFromFiles = async function (buildIndex, nodeFiles) {
    const allFiles = computeAllFiles(buildIndex, nodeFiles);
    console.log("allFiles ", allFiles);
    nodeFiles.concat(buildIndex.localSource);

    const jsHash = filesToContentHash(allFiles, ".js");
    const fullJsHash = fluid.extend({header: buildIndex.codeHeader}, jsHash, {footer: buildIndex.codeFooter});
    const minifiedAll = await minify(fullJsHash, "imerss-viz-all.js");

    // imerss-viz-lib.js contains just upstream libraries we depend on, to support reasonably easy deploy of "new" framework
    const libJsHash = filesToContentHash(nodeFiles, ".js");
    console.log("nodeFiles ", nodeFiles);
    const minifiedLib = await minify(libJsHash, "imerss-viz-lib.js");

    const newJsHash = filesToContentHash(buildIndex.newSource, ".js");
    console.log("newFiles ", buildIndex.newSource);
    const newLib = await minify(newJsHash, "imerss-viz-new.js");

    fs.removeSync("docs");
    fs.ensureDirSync("docs/js");
    fs.writeFileSync("docs/js/imerss-viz-all.js", minifiedAll.code, "utf8");
    fs.writeFileSync("docs/js/imerss-viz-all.js.map", minifiedAll.map);
    fs.writeFileSync("docs/js/imerss-viz-lib.js", minifiedLib.code, "utf8");
    fs.writeFileSync("docs/js/imerss-viz-lib.js.map", minifiedLib.map);
    fs.writeFileSync("docs/js/imerss-viz-new.js", newLib.code, "utf8");
    fs.writeFileSync("docs/js/imerss-viz-new.js.map", newLib.map);

    const cssHash = filesToContentHash(allFiles, ".css");
    const cssConcat = String.prototype.concat.apply("", Object.values(cssHash));

    const cssLibHash = filesToContentHash(nodeFiles, ".css");
    const cssLibConcat = String.prototype.concat.apply("", Object.values(cssLibHash));

    fs.ensureDirSync("docs/css");
    fs.writeFileSync("docs/css/imerss-viz-all.css", cssConcat);
    fs.writeFileSync("docs/css/imerss-viz-lib.css", cssLibConcat);
    buildIndex.copy.forEach(function (oneCopy) {
        copyDep(oneCopy.src, oneCopy.dest);
    });
    fluid.log("Copied " + (buildIndex.copy.length + 2) + " files to " + fs.realpathSync("docs"));
};

fluid.setLogging(true);

const linesPromise = readLines("gh-pages-nm.txt");

linesPromise.then(async function (lines) {
    await buildFromFiles(buildIndex, lines);
}, function (error) {
    console.log(error);
});
