/* eslint-env node */

"use strict";

var fluid = require("infusion");
var hortis = fluid.registerNamespace("hortis");

hortis.settleStructure = function (structure) {
    if (fluid.isPromise(structure)) {
        return structure;
    }
    var settleRec = {
        // This flag is an awkward consequence of our choice to allow synchronous promise resolution
        inSync: true, // Are we still in synchronous scanning - necessary to avoid double resolution on hitting unresolved === 0 on initial scan
        unresolved: 0,
        depth: 0,
        togo: fluid.promise(),
        structure: structure,
        resolve: function () {
            settleRec.togo.resolve(structure);
        }
    };
    hortis.settleStructureRecurse(structure, settleRec);
    settleRec.inSync = false;
    if (settleRec.unresolved === 0) { // Case of 0 asynchronous promises found
        settleRec.resolve();
    }
    return settleRec.togo;
};

hortis.settleStructureRecurse = function (structure, settleRec) {
    ++settleRec.depth;
    if (settleRec.depth > fluid.strategyRecursionBailout) {
        fluid.fail("Recursion exceeded for value " + JSON.stringify(structure) + " overall structure " + JSON.stringify(settleRec.structure, null, 2));
    }
    if (fluid.isPlainObject(structure)) {
        fluid.each(structure, function (value, key) {
            if (fluid.isPromise(value)) {
                hortis.settleStructurePush(settleRec, structure, value, key);
            } else {
                hortis.settleStructureRecurse(value, settleRec);
            }
        });
    }
    --settleRec.depth;
};

hortis.settleStructurePush = function (settleRec, holder, promise, key) {
    ++settleRec.unresolved;
    promise.then(function (value) {
        holder[key] = value;
        --settleRec.unresolved;
        if (settleRec.unresolved === 0 && !settleRec.inSync) {
            settleRec.resolve();
        }
    }, function (err) {
        settleRec.togo.reject(fluid.upgradeError(err, " while resolving promise with key " + key));
    });
};

