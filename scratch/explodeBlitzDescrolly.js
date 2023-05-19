const fs = require('fs');

const diversityBase = 'data/Galiano 2023/configs/descrolly-Diversity-Molluscs.json5';
const statusBase = 'data/Galiano 2023/configs/descrolly-Status-Molluscs.json5';

const taxa = ["animals", "annelids", "brachiopods", "bryozoans", "chaetognaths", "cnidarians", "crustaceans", "ctenophores", "echinoderms", "fishes", "horseshoe_worms", "mammals", "nemerteans", "nodding_heads", "peanut_worms", "platyhelminthes", "sponges", "tunicates"];

taxa.forEach((taxon) => {
  const upperTaxon = taxon.charAt(0).toUpperCase() + taxon.slice(1);
  function rewriteFile(fileName) {
      const content = fs.readFileSync(fileName, 'utf8');
      const updatedContent = content.replace(/Molluscs/g, upperTaxon).replace(/molluscs/g, taxon);

      const target = fileName.replace(/Molluscs/, upperTaxon);
      fs.writeFileSync(target, updatedContent, 'utf8');

      console.log(`Created ${target}`);      
  }
  rewriteFile(diversityBase);
  rewriteFile(statusBase);
});

console.log('All files created successfully.');
