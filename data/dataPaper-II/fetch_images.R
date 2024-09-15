# Load necessary libraries
if (!requireNamespace("utils", quietly = TRUE)) {
  install.packages("utils")
}

# Input CSV file
input_file <- "Galiano_Catalogue_Diatoms_2024_09_15-assigned-taxa.csv"

# Directory to save images
output_dir <- "images"

# Read the CSV file
data <- read.csv(input_file, stringsAsFactors = FALSE)

# Filter rows where rank is "species"
species_data <- subset(data, rank == "species")

species_names <- sort(species_data$iNaturalistTaxonName)

write.csv(data.frame(Species = species_names), file = "taxa_names.csv", row.names = FALSE, quote = FALSE)

# Iterate over each row and download the image
for (i in 1:nrow(species_data)) {
  taxon_name <- species_data$iNaturalistTaxonName[i]
  # Replace spaces with underscores in the taxon name to create a valid filename
  taxon_name <- gsub(" ", "_", taxon_name)
  
  image_url <- species_data$iNaturalistTaxonImage[i]
  
  # Construct the output file path
  output_file <- file.path(output_dir, paste0(taxon_name, ".jpg"))
  
  # Download the image
  download.file(image_url, destfile = output_file, mode = "wb")
  
  # Print a message to track progress
  cat("Downloaded:", output_file, "\n")
}