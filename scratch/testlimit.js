/* eslint-env node */

"use strict";

const fluid = require("infusion");
fluid.require("%bagatelle");
fluid.require("kettle");

const hortis = fluid.registerNamespace("hortis");

fluid.require("%bagatelle/src/utils/dataSource.js");
fluid.require("%bagatelle/src/iNaturalist/taxonAPI.js");

const taxaAPIbyId = hortis.iNatTaxonById();
const taxaAPIbyName = hortis.iNatTaxonByName();


const timeGetById = async function () {
    const doc = await taxaAPIbyId.get({
        id: "877359"
    });
    const now = Date.now();
    console.log("Begun id fetch at " + new Date(now).toISOString());
    try {
    } catch (e) {
        console.log(e);
    }
    console.log("Fetched " + doc.id + " in " + (Date.now() - now) + "ms");
};

const timeGetByName = async function () {
    const doc = await taxaAPIbyName.get({
        name: "Flabellina japonica"
    });
    const now = Date.now();
    console.log("Begun name fetch at " + new Date(now).toISOString());
    try {
    } catch (e) {
        console.log(e);
    }
    console.log("Fetched ", doc.results[0].id, " in " + (Date.now() - now) + "ms");
};

timeGetById();
timeGetById();
timeGetById();
timeGetByName();
timeGetByName();
