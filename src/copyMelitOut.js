/* eslint-env node */

"use strict";

const fs = require("fs-extra"),
    path = require("path"),
    fluid = require("infusion");

require("../index.js");

const config = {
    target: "%melittoflora/docs/",
    copyJobs: [
        {
            source: "%imerss-bioinfo/docs/indexBeasOBA.html",
            target: "%melittoflora/docs/viz.html"
        },
        "%imerss-bioinfo/docs/js/vizjs.js",
        "%imerss-bioinfo/docs/js/bipartitePP.js",

        "%imerss-bioinfo/docs/css/imerss-viz-lib.css",
        "%imerss-bioinfo/docs/css/imerss-viz-new-core.css",
        "%imerss-bioinfo/docs/css/imerss-viz-new.css",
        "%imerss-bioinfo/docs/css/imerss-bbea.css",

        "%imerss-bioinfo/docs/img/OSU/OSU-logo.png",
        "%imerss-bioinfo/docs/img/external-link.svg",

        "%imerss-bioinfo/docs/css/OSU.css",
        "%imerss-bioinfo/docs/css/OSU-superfish.css",
        "%imerss-bioinfo/docs/css/OSU-overrides.css",

        "%imerss-bioinfo/docs/js/jquery.js",
        "%imerss-bioinfo/docs/js/imerss-viz-lib.js",
        "%imerss-bioinfo/docs/js/imerss-viz-new-core.js",
        "%imerss-bioinfo/docs/js/imerss-viz-new.js",
        "%imerss-bioinfo/docs/js/imerss-bbea.js",

        "%imerss-bioinfo/docs/data/b-team/plant-pollinators-OBA-2025-assigned-subset-labels.viz",
        "%imerss-bioinfo/docs/data/b-team/plant-pollinators-OBA-2025-assigned-taxa.viz",
        "%imerss-bioinfo/docs/data/b-team/us-eco-l3-regions.csv"
    ]
};

console.log(fluid.module.resolvePath("%imerss-bioinfo/"));

const melit = path.join(fluid.module.resolvePath("%imerss-bioinfo/"), "../melittoflora/");


fluid.module.register("melittoflora", melit, require);

const copyOut = function () {
    const defTarget = fluid.module.resolvePath(config.target);
    const computeTarget = function (source) {
        const dp = source.indexOf("/docs/");
        const stem = source.substring(dp + "/docs/".length);
        return path.join(defTarget, stem);
    };

    config.copyJobs.forEach(oneJob => {
        const job = typeof(oneJob) === "string" ? {source: oneJob} : oneJob;
        const source = fluid.module.resolvePath(job.source);
        const target = job.target ? fluid.module.resolvePath(job.target) : computeTarget(job.source);

        fs.ensureDirSync(path.dirname(target));
        fs.copySync(source, target);

        console.log("Copied ", source, " to ", target);
    });

};

copyOut();
