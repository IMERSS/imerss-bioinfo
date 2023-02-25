/* eslint-env node */

"use strict";

const fluid = require("infusion");
const minimist = require("minimist");
const fs = require("fs");

require("./dataProcessing/readJSON.js");
require("./dataProcessing/writeJSON.js");
require("./dataProcessing/writeCSV.js");

require("./iNaturalist/obsAPI.js");

const hortis = fluid.registerNamespace("hortis");

hortis.iNatProjects = {
    GalianoData: {
        paramMap: {
            project_id: 5799,
            taxon_id: 1
        },
        outputFile: "data/iNaturalist/Galiano_Catalogue_Animalia_%Date.csv"
    },
    Valdes: {
        paramMap: {
            project_id: 43522,
            taxon_id: 48460 // Life
        },
        outputFile: "data/Valdes/iNaturalist_Catalogue_%Date.csv"
    },
    Xetthecum: {
        paramMap: {
            project_id: "xetthecum",
            taxon_id: 48460 // Life
        },
        outputFile: "data/Xetthecum/iNaturalist_Catalogue_%Date.csv"
    },
    Pepiowelh: {
        paramMap: {
            project_id: "pe-pi-ow-elh",
            taxon_id: 48460 // Life
        },
        outputFile: "data/Pepiowelh/iNaturalist_Catalogue_%Date.csv"
    }
};

const parsedArgs = minimist(process.argv.slice(2));

console.log("parsedArgs", parsedArgs);

const projectArgs = hortis.iNatProjects[parsedArgs._[0] || "GalianoData"];

const jwt = hortis.readJSONSync("jwt.json", "reading JWT token file");

const source = hortis.iNat.obsSource({
    headers: {
        Authorization: "Bearer " + jwt.api_token
    },
    paramMap: projectArgs.paramMap
});

const fileVars = {
    Date: new Date().toISOString().substring(0, 10).replaceAll("-", "_")
};

fluid.setLogging(true);

const rows = [];

const directModel = {
    per_page: 200
};

hortis.logObsResponse = function (data) {
    const tolog = Object.assign({}, data);
    tolog.results = "[ " + data.results.length + " ]";
    fluid.log("Got response " + JSON.stringify(tolog, null, 4));
};

hortis.writeObs = function (filename, rows) {
    const togo = fluid.promise();
    const headers = Object.keys(rows[0]);
    hortis.writeCSV(filename, headers, rows, togo);
    return togo;
};

hortis.applyResponse = function (data) {
    hortis.logObsResponse(data);
    hortis.writeJSONSync("obsoutput.json", data);
    if (data.results.length > 0) {
        hortis.pushResultRows(rows, data);
        const lastId = fluid.peek(rows).id;
        console.log("got last id " + lastId);
        directModel.id_above = lastId;
        setTimeout(function () {
            hortis.makeObsRequest(directModel);
        }, 1000);
    } else {
        hortis.writeObs("obsoutput.csv", rows).then(function () {
            const fileTarget = fluid.stringTemplate(projectArgs.outputFile, fileVars);
            fs.copyFileSync("obsoutput.csv", fileTarget);
            const stats = fs.statSync(fileTarget);
            console.log("Written " + stats.size + " bytes to " + fileTarget);
        });
    }
};

hortis.makeObsRequest = function (directModel) {
    console.log("Making request ", directModel);
    const promise = source.get(directModel);

    promise.then(function (data) {
        hortis.applyResponse(data);
    }, function (error) {
        console.log("Got ERROUR: ", error);
    });
};

hortis.makeObsRequest(directModel);
