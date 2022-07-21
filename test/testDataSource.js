/* eslint-env node */

"use strict";

var fluid = require("infusion"),
    jqUnit = fluid.require("node-jqunit", null, "jqUnit");

require("../src/utils/dataSource.js");

var hortis = fluid.registerNamespace("hortis");
fluid.registerNamespace("hortis.tests");

hortis.tests.retryResponses = {
    resolve: {
        sequence: [{
            type: "resolve",
            payload: 42
        }],
        expected: {
            minTime: 0,
            type: "resolve",
            payload: 42
        }
    },
    oneReject: {
        sequence: [{
            type: "reject",
            payload: "error"
        }, {
            type: "resolve",
            payload: 42
        }],
        expected: {
            minTime: 900,
            type: "resolve",
            payload: 42
        }
    },
    twoReject: {
        sequence: [{
            type: "reject",
            payload: "error1"
        }, {
            type: "reject",
            payload: "error2"
        }, {
            type: "resolve",
            payload: 42
        }],
        expected: {
            minTime: 1900,
            type: "resolve",
            payload: 42
        }
    },
    threeReject: {
        sequence: [{
            type: "reject",
            payload: "error1"
        }, {
            type: "reject",
            payload: "error2"
        }, {
            type: "reject",
            payload: "error3"
        }, {
            type: "resolve",
            payload: 42
        }],
        expected: {
            minTime: 2900,
            type: "reject",
            payload: "error3"
        }
    }
};

fluid.defaults("hortis.tests.retryingMockDataSource", {
    gradeNames: ["fluid.dataSource.retrying", "fluid.dataSource.noencoding"],
    members: {
        index: 0
    },
    sequence: [],
    listeners: {
        "onRead.impl": {
            funcName: "hortis.tests.retryingMockDataSource.impl",
            args: ["{that}"]
        }
    }
});

hortis.tests.retryingMockDataSource.impl = function (that) {
    fluid.log("Test request " + that.index + " against sequence ", that.options.sequence);
    var record = that.options.sequence[that.index++];
    var togo = fluid.promise();
    togo[record.type](record.payload);
    return togo;
};

fluid.each(hortis.tests.retryResponses, function (value, key) {
    jqUnit.asyncTest("Test of retrying data source: " + key, function () {
        jqUnit.expect(3);
        var dataSource = hortis.tests.retryingMockDataSource({
            sequence: value.sequence
        });
        var now = Date.now();
        var checkResponse = function (type, payload) {
            jqUnit.assertEquals("Expected response type", value.expected.type, type);
            jqUnit.assertDeepEq("Expected response payload", value.expected.payload, payload);
            var delay = (Date.now() - now);
            jqUnit.assertTrue("Response at expected time", delay > value.expected.minTime);
            jqUnit.start();
        };
        var promise = dataSource.get();
        promise.then(function (payload) {
            checkResponse("resolve", payload);
        }, function (payload) {
            checkResponse("reject", payload);
        });
    });
});

fluid.defaults("hortis.tests.rateLimitingDataSource", {
    gradeNames: ["fluid.dataSource", "fluid.dataSource.withRateLimiter"],
    members: {
        index: 0,
        launchTimes: []
    },
    sequence: [],
    listeners: {
        "onRead.impl": {
            funcName: "hortis.tests.rateLimitingDataSource.impl",
            args: ["{that}"]
        }
    },
    components: {
        encoding: {
            type: "fluid.dataSource.encoding.none"
        }
    }
});

hortis.tests.rateLimitingDataSource.impl = function (that) {
    fluid.log("Rate limiting test request " + that.index);
    var now = Date.now();
    that.launchTimes[that.index] = now;
    return fluid.promise().resolve(that.index++);
};

jqUnit.asyncTest("Test of rate limiting data source: ", function () {
    jqUnit.expect(6);
    var dataSource = hortis.tests.rateLimitingDataSource();
    var now = Date.now();
    var requests = fluid.generate(5, 0).map(function () {
        return dataSource.get();
    });
    var resultsPromise = fluid.promise.sequence(requests);
    resultsPromise.then(function (results) {
        var expected = fluid.iota(5);
        jqUnit.assertDeepEq("Got expected results", expected, results);
        jqUnit.assertTrue("First response received pretty soon", (dataSource.launchTimes[0] - now) < 100);
        for (var i = 1; i < 5; ++i) {
            jqUnit.assertTrue("Request " + (i + 1) + " is not early", (dataSource.launchTimes[i] - dataSource.launchTimes[i - 1]) > 1000);
        }
        jqUnit.start();
    });
});
