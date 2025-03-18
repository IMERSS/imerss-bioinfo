library(dplyr)
library(stringr)

source("./utils.R")

acceptedRanks <- c("genus", "subgenus", "species", "subspecies", "hybrid", "complex", "variety")

gbif <- timedRead("Galiano_GBIF_Not_iNat_2025_03_17.csv")
iNat <- timedRead("Galiano_Union_Catalogue_2025_03_14.csv")

# Function to split scientificName into taxonName and scientificNameAuthorship
split_scientific_name <- function(name) {
  words <- str_split(name, " ", simplify = TRUE)  # Split into words

  if (length(words) < 2) return(c(name, NA))  # If there's only one word, return it as taxonName

  # Find the first authority-forming word (ignoring the first word)
  auth_idx <- which(str_detect(words[-1], "^[^a-z]") | words[-1] == "de")

  if (length(auth_idx) > 0) {
    auth_idx <- auth_idx[1] + 1  # Adjust index because we ignored the first word
    taxon_name <- paste(words[1:(auth_idx - 1)], collapse = " ")  # Get the taxon name
    authorship <- paste(words[auth_idx:length(words)], collapse = " ")  # Get the authority
  } else {
    taxon_name <- name  # If no authority, taxonName is the full name
    authorship <- NA  # No authorship found
  }

  return(c(taxon_name, authorship))  # Return a character vector
}

# Apply function and store results in new columns
split_results <- t(sapply(gbif$scientificName, split_scientific_name))  # Apply function row-wise

# Convert to data frame and bind to original df
gbifname <- as.data.frame(split_results, stringsAsFactors = FALSE)

gbifNext <- gbif %>%
            mutate(scientificName = gbifname$scientificName, scientificNameAuthority = gbifname$scientificNameAuthority) %>%
            mutate(taxonRank = tolower(taxonRank))

iNatNext <- iNat %>% mutate(decimalLatitude = round(coalesce(private_latitude, latitude), 6)) %>%
                 mutate(decimalLongitude = round(coalesce(private_longitude, longitude), 6)) %>%
                 mutate(recordedBy = coalesce(user_name, user_login)) %>%
                 mutate(occurrenceID = paste0("https://www.inaturalist.org/observations/", id)) %>%
                 rename(eventDate = time_observed_at,
                        scientificName = scientific_name,
                        commonName = common_name,
                        iNaturalistTaxonId = taxon_id,
                        taxonRank = taxon_rank,
                        coordinateUncertaintyInMetres = positional_accuracy) %>%
                 select(-private_latitude, -private_longitude, -latitude, -longitude, -observed_on,
                        -user_name, -user_login, -id, -positioning_method, -positioning_device)

combined <- bind_rows(iNatNext, gbifNext)

accepted <- combined %>% filter(taxonRank %in% acceptedRanks)

timedWrite(accepted, "Galiano_GBIF_And_iNat_2025_03_17.csv")

