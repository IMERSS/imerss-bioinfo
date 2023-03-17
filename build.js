/* eslint-env node */
"use strict";

const readline = require("readline"),
    fs = require("fs-extra");

const fluid = require("infusion");
const terser = require("terser");

const buildIndex = {
    excludes: [
        "jquery.js"
    ],
    localSource: [
        "src/client/css/imerss-viz.css",
        "src/auxBuild/restoreJQuery.js",
        "src/lib/lz4.js",
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
        src: "src/client/css/imerss-viz-wp-overrides.css",
        dest: "docs/css/imerss-viz-wp-overrides.css"
    }, {
        src: "src/client/css/xetthecum.css",
        dest: "docs/css/xetthecum.css"
    }, {
        src: "src/client/css/xetthecum-shared.css",
        dest: "docs/css/xetthecum-shared.css"
    }, {
        src: "src/client/css/xetthecum-external.css",
        dest: "docs/css/xetthecum-external.css"
    }, {
        src: "src/client/css/pepiowelh.css",
        dest: "docs/css/pepiowelh.css"
    }, {
        src: "src/buildSource/Galiano Life List.html",
        dest: "docs/Galiano Life List.html"
    }, {
        src: "src/buildSource/Comprehensive Lists.html",
        dest: "docs/Comprehensive Lists.html"
    }, {
        src: "src/buildSource/Squamish Life List.html",
        dest: "docs/Squamish Life List.html"
    }, {
        src: "src/buildSource/dataPaperSunburstAndMap.html",
        dest: "docs/dataPaperSunburstAndMap.html"
    }, {
        src: "src/buildSource/Data Paper Part I Visualisation.html",
        dest: "docs/Data Paper Part I Visualisation.html"
    }, {
        src: "src/buildSource/Valdes Island Biodiversity.html",
        dest: "docs/Valdes Island Biodiversity.html"
    }, {
        src: "src/buildSource/Xetthecum.html",
        dest: "docs/Xetthecum.html"
    }, {
        src: "src/buildSource/Pe'pi'ow'elh.html",
        dest: "docs/Pe'pi'ow'elh.html"
    }, {
        src: "src/buildSource/index.html",
        dest: "docs/index.html"
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

const filesToContentHash = function (allFiles, extension) {
    const extFiles = allFiles.filter(function (file) {
        return file.endsWith(extension);
    });
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

const buildFromFiles = function (buildIndex, nodeFiles) {
    const allFiles = computeAllFiles(buildIndex, nodeFiles);
    console.log("allFiles " + allFiles);
    nodeFiles.concat(buildIndex.localSource);

    const jsHash = filesToContentHash(allFiles, ".js");
    const fullJsHash = fluid.extend({header: buildIndex.codeHeader}, jsHash, {footer: buildIndex.codeFooter});
    fluid.log("Minifying " + Object.keys(fullJsHash).length + " JS files ... ");
    const promise = terser.minify(fullJsHash, {
        mangle: false,
        sourceMap: {
            filename: "imerss-viz.js",
            url: "imerss-viz.js.map"
        }
    });
    promise.then(function (minified) {
        fs.removeSync("docs");
        fs.ensureDirSync("docs/js");
        fs.writeFileSync("docs/js/imerss-viz-all.js", minified.code, "utf8");
        fs.writeFileSync("docs/js/imerss-viz-all.js.map", minified.map);

        const cssHash = filesToContentHash(allFiles, ".css");
        const cssConcat = String.prototype.concat.apply("", Object.values(cssHash));

        fs.ensureDirSync("docs/css");
        fs.writeFileSync("docs/css/imerss-viz-all.css", cssConcat);
        buildIndex.copy.forEach(function (oneCopy) {
            fs.copySync(oneCopy.src, oneCopy.dest);
        });
        fluid.log("Copied " + (buildIndex.copy.length + 3) + " files to " + fs.realpathSync("docs"));
    });
};

fluid.setLogging(true);

const linesPromise = readLines("gh-pages-nm.txt");

linesPromise.then(function (lines) {
    buildFromFiles(buildIndex, lines);
}, function (error) {
    console.log(error);
});
