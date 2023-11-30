/* eslint-env node */

"use strict";

const fs = require("fs");

const baseFilePath = "data/Galiano 2023/configs/fusion-Mollusca.json5";
const outputDirectory = "data/Galiano 2023/configs/";

const strings = ["annelida", "brachiopoda", "bryozoa", "chaetognatha", "cnidaria", "crustacea", "ctenophora", "echinodermata",
  "entoprocta", "mammalia", "nemertea", "phoronida", "platyhelminthes", "porifera", "sipuncula", "tunicata", "fishes"];

strings.forEach((string) => {
  const capitalizedString = string.charAt(0).toUpperCase() + string.slice(1);
  const fileName = `fusion-${string}.json5`;
  const filePath = `${outputDirectory}${fileName}`;

  const content = fs.readFileSync(baseFilePath, "utf8");
  const updatedContent = content.replace(/Mollusca/g, capitalizedString).replace(/mollusca/g, string);

  fs.writeFileSync(filePath, updatedContent, "utf8");

  console.log(`Created ${fileName}`);
});

console.log("All files created successfully.");
