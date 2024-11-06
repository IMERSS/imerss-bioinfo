/* eslint-env node */

"use strict";

const fluid = require("infusion");
const minimist = require("minimist");
const fs = require("fs");

require("./dataProcessing/readJSON.js");
require("./dataProcessing/writeJSON.js");
require("./dataProcessing/writeCSV.js");

require("./iNaturalist/obsAPI.js");
require("./iNaturalist/taxonAPI.js");

const hortis = fluid.registerNamespace("hortis");

hortis.iNatProjects = {
    GalianoData: {
        paramMap: {
            project_id: 5799,
            taxon_id: 1
        },
        outputFile: "data/iNaturalist/Galiano_Catalogue_Animalia_%Date.csv"
    },
    GalianoTrad: {
        paramMap: {
            project_id: 5799,
            taxon_id: 48460,
            quality_grade: ""
        },
        outputFile: "data/iNaturalist/Galiano_Trad_Catalogue_%Date.csv"
    },
    GalianoColl: {
        paramMap: {
            project_id: 147834,
            taxon_id: 48460,
            quality_grade: ""
        },
        outputFile: "data/iNaturalist/Galiano_Coll_Catalogue_%Date.csv"
    },
    GalianoChrom: {
        paramMap: {
            project_id: 5799,
            taxon_id: "48222,50863,57774"
        },
        outputFile: "data/iNaturalist/Galiano_Trad_Catalogue_Chromists_etal_%Date.csv"
    },
    GalianoTradHolly: { // Special proj to test we can read obscured coordinates since we get no errors from iNat on bad JWT
        paramMap: {
            project_id: 5799,
            taxon_id: 53856,
            quality_grade: ""
        },
        outputFile: "data/iNaturalist/Galiano_Trad_HollyCatalogue_%Date.csv"
    },
    GalianoTradAci: { // Special proj to test we can read obscured coordinates since we get no errors from iNat on bad JWT
        paramMap: {
            project_id: 5799,
            taxon_id: 49824,
            quality_grade: ""
        },
        outputFile: "data/iNaturalist/Galiano_Trad_AciCatalogue_%Date.csv"
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
    },
    HoweSoundLichens: {
        paramMap: {
            project_id: 38728,
            taxon_id: 48250, // Ascomycota
            quality_grade: ""
        },
        outputFile: "data/Howe Sound/iNaturalist_Ascomycota_Catalogue_%Date.csv"
    },
    HoweSoundTerrestrial: {
        paramMap: {
            place_id: 137739, // Howe Sound Proposed Biosphere Reserve
            taxon_id: "40151,20978,26036", // Mammalia, Amphibia, Reptilia
            quality_grade: ""
        },
        outputFile: "data/Howe Sound/iNaturalist_Mammalia_Amphibia_Reptilia_Catalogue_%Date.csv"
    },
    // Guide at https://forum.inaturalist.org/t/inat-api-how-to-get-info-from-polygon/32589
    // used bbox of Howe_Sound_context_area_much_simplified.geojson
    HoweSoundContextTerrestrial: {
        paramMap: {
            swlat: 48.38311,
            swlng: -125.15705,
            nelat: 51.23147,
            nelng: -121.49381,
            taxon_id: "40151,20978,26036", // Mammalia, Amphibia, Reptilia
            quality_grade: ""
        },
        outputFile: "data/Howe Sound/iNaturalist_Mammalia_Amphibia_Reptilia_Context_Catalogue_%Date.csv"
    },
    TexadaVascular: {
        paramMap: {
            place_id: 205178,
            taxon_id: 211194, // Tracheophyta
            quality_grade: ""
        },
        outputFile: "data/Texada/iNaturalist_Tracheophyta_Catalogue_%Date.csv"
    },
    GalianoDataII: {
        paramMap: {
            project_id: 147834,
            taxon_id: 123880,
            quality_grade: ""
        },
        outputFile: "data/dataPaper-II/Galiano_Catalogue_Diatoms_%Date.csv"
    },
    HoweSoundVascular: {
        paramMap: {
            place_id: 137739, // Howe Sound Proposed Biosphere Reserve
            taxon_id: 211194, // Tracheophyta
            quality_grade: ""
        },
        outputFile: "data/Howe Sound/iNaturalist_Tracheophyta_Catalogue_%Date.csv"
    },
    GalianoBioBlitz2023: {
        paramMap: {
            project_id: "galiano-bioblitz-2023",
            quality_grade: ""
        },
        outputFile: "data/Galiano 2023 Bioblitz/iNaturalist_GalianoBioBlitz2023_Catalogue_%Date.csv"
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

const iNatTaxonSource = hortis.iNatTaxonSource({
    jwt: jwt
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

hortis.applyResponse = async function (data) {
    hortis.logObsResponse(data);
    hortis.writeJSONSync("obsoutput.json", data);
    if (data.results.length > 0) {
        await hortis.pushResultRows(rows, data, iNatTaxonSource);
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

    promise.then(async function (data) {
        await hortis.applyResponse(data);
    }, function (error) {
        console.log("Got ERROUR: ", error);
    });
};

iNatTaxonSource.events.onCreate.then(function () {
    hortis.makeObsRequest(directModel);
});
