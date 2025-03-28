/* eslint-env node */

"use strict";

const fs = require("fs");

const diversityBase = "data/Galiano 2023/configs/vizConfig-Diversity-Mollusca.json5";
const statusBase = "data/Galiano 2023/configs/vizConfig-Status-Mollusca.json5";
const culturalBase = "data/Galiano 2023/configs/vizConfig-Cultural-Mollusca.json5";

const taxa = ["annelida", "brachiopoda", "bryozoa", "chaetognatha", "cnidaria", "crustacea", "ctenophora", "echinodermata",
    "entoprocta", "mammalia", "nemertea", "phoronida", "platyhelminthes", "porifera", "sipuncula", "tunicata", "fishes"];

const culturalTaxa = ["crustacea", "echinodermata", "fishes", "mammalia"];

taxa.forEach((taxon) => {
    const upperTaxon = taxon.charAt(0).toUpperCase() + taxon.slice(1);
    function rewriteFile(fileName) {
        const content = fs.readFileSync(fileName, "utf8");
        const updatedContent = content.replace(/Mollusca/g, upperTaxon).replace(/mollusca/g, taxon);

        const target = fileName.replace(/Mollusca/, upperTaxon);
        fs.writeFileSync(target, updatedContent, "utf8");

        console.log(`Created ${target}`);
    }
    rewriteFile(diversityBase);
    rewriteFile(statusBase);
    if (culturalTaxa.includes(taxon)) {
        rewriteFile(culturalBase);
    }
});

console.log("All files created successfully.");
