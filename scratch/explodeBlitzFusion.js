const fs = require('fs');

const baseFilePath = 'data/Galiano 2023/configs/fusion-Molluscs.json5';
const outputDirectory = 'data/Galiano 2023/configs/';

const strings = ["animals", "annelids", "brachiopods", "bryozoans", "chaetognaths", "cnidarians", "crustaceans", "ctenophores", "echinoderms", "fishes", "horseshoe_worms", "mammals", "nemerteans", "nodding_heads", "peanut_worms", "platyhelminthes", "sponges", "tunicates"];

strings.forEach((string) => {
  const capitalizedString = string.charAt(0).toUpperCase() + string.slice(1);
  const fileName = `fusion-${string}.json5`;
  const filePath = `${outputDirectory}${fileName}`;

  const content = fs.readFileSync(baseFilePath, 'utf8');
  const updatedContent = content.replace(/Molluscs/g, capitalizedString).replace(/molluscs/g, string);

  fs.writeFileSync(filePath, updatedContent, 'utf8');

  console.log(`Created ${fileName}`);
});

console.log('All files created successfully.');
