/* eslint-env node */

"use strict";

const fluid = require("infusion");

fluid.defaults("fluid.dataSource.noencoding", {
    components: {
        encoding: {
            type: "fluid.dataSource.encoding.none"
        }
    }
});

// Patch this from Kettle DataSource to interpret iNat errors which have
fluid.extractHtmlError = function (received) {
    const preMatches = /<pre>(.*)<\/pre>/gm.exec(received);
    if (preMatches) {
        return preMatches[1];
    }
    const titleMatches = /<title>(.*)<\/title>/gm.exec(received);
    return titleMatches ? titleMatches[1] : received;
};

fluid.defaults("fluid.dataSource.retrying", {
    gradeNames: "fluid.dataSource",
    retryInterval: 1000,
    retries: 3,
    invokers: {
        get: {
            funcName: "fluid.dataSource.retrying.get",
            args: ["{that}", "{arguments}.0", "{arguments}.1"] // directModel, directOptions
        }
    }
});

fluid.promise.delay = function (delay) {
    const togo = fluid.promise();
    setTimeout(togo.resolve, delay);
    return togo;
};

fluid.dataSource.retrying.get = async function (that, directModel, directOptions) {
    const underlyingGet = function () {
        return fluid.dataSource.get(that, directModel, directOptions);
    };
    let err = null;
    for (let i = 0; i < that.options.retries; ++i) {
        try {
            const payload = await underlyingGet();
            return payload;
        } catch (e) {
            fluid.log("Got exception ", e.message , " from dataSource, retry " + (i + 1) + "/" + that.options.retries);
            err = e;
            await fluid.promise.delay(that.options.retryInterval);
        }
    }
    throw err;
};

fluid.setLogging(true);

// A rate limited dataSource that will guarantee not to make more than 1 call every <rateLimit> ms to the underlying
// dataSource

// Neither throttle nor debounce seem appropriate for this - https://underscorejs.org/#throttle - since they do
// not guarantee one for one invocation of target source

fluid.defaults("fluid.dataSource.rateLimiter", {
    gradeNames: "fluid.component",
    // minimum time in ms between calls
    rateLimit: 1000,
    members: {
        pending: null,
        lastFired: 0,
        queue: []
    },
    invokers: {
        requestStart: "fluid.dataSource.rateLimiter.requestStart({that}, {arguments}.0)",
        requestEnd: "fluid.dataSource.rateLimiter.requestEnd({that}, {arguments}.0)",
        next: "fluid.dataSource.rateLimiter.next({that})"
    }
});

fluid.dataSource.rateLimiter.next = function (that) {
    const now = Date.now();
    const resolve = function (toResolve) {
        that.lastFired = now;
        toResolve.resolve(toResolve.payload);
    };

    const uncess = that.lastFired + that.options.rateLimit - now;
    if (!that.pending && that.queue.length > 0) {
        if (uncess > 0) {
            that.pending = setTimeout(function () {
                that.pending = null;
                that.next();
            }, uncess);
        } else {
            const top = that.queue.shift();
            resolve(top);
        }
    }
};

fluid.dataSource.rateLimiter.requestStart = function (that, payload) {
    const togo = fluid.promise();
    togo.payload = payload;
    that.queue.push(togo);
    that.next();
    return togo;
};

fluid.dataSource.rateLimiter.requestEnd = function (that, payload) {
    fluid.log("requestEnd");
    that.next();
    return payload;
};

fluid.defaults("fluid.dataSource.withRateLimiter", {
    gradeNames: "fluid.dataSource.rateLimiter",
    listeners: {
        "onRead.rateLimitBefore": {
            priority: "before:impl",
            func: "{that}.requestStart"
        },
        "onRead.rateLimitAfter": {
            priority: "after:impl",
            func: "{that}.requestEnd"
        }
    }
});

fluid.defaults("fluid.inMemoryCachedSource", {
    gradeNames: ["fluid.dataSource", "fluid.dataSource.noencoding", "fluid.dataSource.writable"],
    members: {
        cache: {}
    },
    listeners: {
        "onRead.impl": {
            func: "fluid.inMemoryCachedSource.read",
            args: ["{that}", "{arguments}.0", "{arguments}.1"]
        },
        "onWrite.impl": {
            func: "fluid.inMemoryCachedSource.write",
            args: ["{that}", "{arguments}.0", "{arguments}.1"]
        }
    }
});

fluid.inMemoryCachedSource.toCacheKey = function (directModel) {
    if (fluid.isPrimitive(directModel)) {
        return directModel.toString();
    } else {
        let togo = "";
        for (const key in directModel) {
            togo += key + "|" + directModel[key] + "|";
        }
        return togo;
    }
};

fluid.inMemoryCachedSource.read = function (that, payload, options) {
    const key = fluid.inMemoryCachedSource.toCacheKey(options.directModel);
    return that.cache[key];
};

fluid.inMemoryCachedSource.write = function (that, payload, options) {
    const key = fluid.inMemoryCachedSource.toCacheKey(options.directModel);
    that.cache[key] = payload;
    return payload;
};
