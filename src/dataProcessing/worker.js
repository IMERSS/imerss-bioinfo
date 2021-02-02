/* eslint-env node */

"use strict";

var fluid = require("infusion");

var hortis = fluid.registerNamespace("hortis");

// Work in progress factoring common engine from wormify.js and inattify.js

fluid.defaults("hortis.worker", {
    gradeNames: "fluid.component",
    members: {
        queue: "{that}.options.queue",
        fetched: [],
        cache: {}
    },
    invokers: {
        oneWork: "hortis.worker.oneWork({that})",
        // Returns {name, filename}
        namesFromItem: "fluid.notImplemented()"
    }
});

hortis.worker.oneWork = function (that) {
    if (that.queue.length) {
        var head = that.queue.shift();
        var names = that.namesFromItem(head);
        that.oneWork(head, names);
    }
};
