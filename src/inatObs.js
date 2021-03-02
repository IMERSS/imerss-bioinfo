/* eslint-env node */

"use strict";

var fluid = require("infusion");

require("./dataProcessing/readJSON.js");
require("./dataProcessing/writeJSON.js");
require("./dataProcessing/writeCSV.js");

require("./iNaturalist/obsAPI.js");

var hortis = fluid.registerNamespace("hortis");

var jwt = hortis.readJSONSync("jwt.json", "reading JWT token file");

var source = hortis.iNat.obsSource({
    headers: {
        Authorization: "Bearer " + jwt.api_token
    }
});

fluid.setLogging(true);

var rows = [];

var directModel = {
    per_page: 200
};

hortis.logObsResponse = function (data) {
    var tolog = Object.assign({}, data);
    tolog.results = "[ " + data.results.length + " ]";
    fluid.log("Got response " + JSON.stringify(tolog, null, 4));
};

hortis.writeObs = function (filename, rows) {
    var headers = Object.keys(rows[0]);
    hortis.writeCSV(filename, headers, rows, fluid.promise());
};

hortis.applyResponse = function (data) {
    hortis.logObsResponse(data);
    hortis.writeJSONSync("obsoutput.json", data);
    if (data.results.length > 0) {
        hortis.pushResultRows(rows, data);
        var lastId = fluid.peek(rows).id;
        console.log("got last id " + lastId);
        directModel.id_above = lastId;
        setTimeout(function () {
            hortis.makeObsRequest(directModel);
        }, 1000);
    } else {
        hortis.writeObs("obsoutput.csv", rows);
    }
};

hortis.makeObsRequest = function (directModel) {
    var promise = source.get(directModel);

    promise.then(function (data) {
        hortis.applyResponse(data);
    }, function (error) {
        console.log("Got ERROUR: ", error);
    });
};

hortis.makeObsRequest(directModel);
