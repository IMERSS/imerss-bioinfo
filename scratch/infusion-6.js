/* eslint-env node */
"use strict";

const glob = require("glob"),
    path = require("path"),
    fs = require("fs-extra"),
    terser = require("terser"),
    fluid = require("infusion-6"),
    JSON5 = require("json5");

fluid.registerNamespace("fluid.build");

fluid.build.copyGlob = function (sourcePattern, targetDir) {
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

fluid.build.copyDep = function (source, target, replaceSource, replaceTarget) {
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
        fluid.build.copyGlob(sourcePath, targetPath);
    } else {
        fs.ensureDirSync(path.dirname(targetPath));
        fs.copySync(sourcePath, targetPath);
        console.log(`Copied file: ${targetPath}`);
    }
};

fluid.build.filesToContentHash = function (allFiles, extension) {
    const extFiles = allFiles.filter(function (file) {
        return file.endsWith(extension);
    });
    // console.log("Computed content hash ", extFiles, " for extension ", extension);
    const hash = Object.fromEntries(
        extFiles.map(filename => [filename, fs.readFileSync(filename, "utf8")])
    );
    return hash;
};

fluid.build.minify = async function (hash, filename) {
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

fluid.registerNamespace("fluid.module");

// Monkey-patch this utility from Fluid module.js to ensure we don't overwrite an override definition or indeed any other
fluid.module.register = function (name, baseDir, moduleRequire) {
    const existing = fluid.module.modules[name];
    if (!existing || !existing.override) {
        fluid.log(fluid.logLevel.WARN, "Registering module " + name + " from path " + baseDir);
        fluid.module.modules[name] = {
            baseDir: fluid.module.canonPath(baseDir),
            require: moduleRequire
        };
    }
};

fluid.loadJSON5File = function (path) {
    const resolved = fluid.module.resolvePath(path);
    try {
        const text = fs.readFileSync(resolved, "utf8");
        return JSON5.parse(text);
    } catch (e) {
        e.message = "Error reading JSON5 file " + resolved + "\n" + e.message;
        throw e;
    }
};

fluid.module.applyModuleOverrides = function () {
    const resolved = fluid.module.resolvePath("%self/moduleOverrides.json5");
    if (fs.existsSync(resolved)) {
        fluid.log("Applying module overrides from path ", resolved);
        const moduleOverrides = fluid.loadJSON5File(resolved);
        moduleOverrides.forEach(override => {
            fluid.module.modules[override.moduleName] = {...override, override: true};
            fluid.log(`Overriding base path for module ${override.moduleName} with ${override.baseDir}`);
        });
    }
};

fluid.module.applyModuleOverrides();

module.exports = fluid;
