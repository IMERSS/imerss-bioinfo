/* eslint-env node */

"use strict";

const fs = require("fs-extra"),
    path = require("path"),
    fluid = require("infusion");

require("../index.js");

const config = {
    target: "%b-team/docs/",
    copyJobs: [
        {
            source: "%imerss-bioinfo/docs/indexBeasOBA.html",
            target: "%b-team/docs/viz.html"
        },
        "%imerss-bioinfo/docs/js/vizjs.js",
        "%imerss-bioinfo/docs/js/bipartitePP.js",

        "%imerss-bioinfo/docs/css/imerss-viz-lib.css",
        "%imerss-bioinfo/docs/css/imerss-viz-new-core.css",
        "%imerss-bioinfo/docs/css/imerss-viz-new.css",
        "%imerss-bioinfo/docs/css/imerss-bbea.css",

        "%imerss-bioinfo/docs/js/jquery.js",
        "%imerss-bioinfo/docs/js/imerss-viz-lib.js",
        "%imerss-bioinfo/docs/js/imerss-viz-new-core.js",
        "%imerss-bioinfo/docs/js/imerss-viz-new.js",
        "%imerss-bioinfo/docs/js/imerss-bbea.js",

        "%imerss-bioinfo/docs/img/x-circle-close.svg",

        "%imerss-bioinfo/docs/data/b-team/plant-pollinators-OBA-2-assigned-subset-labels.csv",
        "%imerss-bioinfo/docs/data/b-team/plant-pollinators-OBA-2-assigned-taxa.csv",
        "%imerss-bioinfo/docs/data/b-team/us-eco-l3-regions.csv"
    ]
};

console.log(fluid.module.resolvePath("%imerss-bioinfo/"));

const b_team = path.join(fluid.module.resolvePath("%imerss-bioinfo/"), "../b-team/");


fluid.module.register("b-team", b_team, require);

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