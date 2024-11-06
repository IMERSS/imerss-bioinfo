library(dplyr)

source("./utils.R")

raw <- timedFread("Galiano_Island_vascular_plant_records_consolidated-assigned.csv")

bioblitzObs <- timedFread("iNaturalist_GalianoBioBlitz2023_Catalogue_2024_11_06.csv")
bioblitzIds <- data.frame(id = bioblitzObs$id, inBioBlitz = 1)

cat("Read ", nrow(bioblitzIds), " BioBlitz observations")

summary <- timedFread("Galiano_Tracheophyta_review_summary_reviewed_2024-10-07-assigned_revised.csv")
summaryIds <- data.frame(id = summary$ID, inSummary = 1)

joined <- raw %>% left_join(bioblitzIds, by = join_by(occurrenceID == id)) %>% left_join(summaryIds, by = join_by(taxonID == id))

notInSummary <- joined %>% filter(inSummary != 1)

if (nrow(notInSummary) != 0) {
  cat("Warning: ", nrow(notInSummary), " observations found not matching entries in summary")
  print(notInSummary)
}

lookupMismatch <- joined$taxonID != joined$iNaturalist.taxon.ID
lookupMismatchRows <- joined[lookupMismatch,]
lookupMismatchSummary <- lookupMismatchRows[!duplicated(lookupMismatchRows$scientificName),]

timedWrite(lookupMismatchSummary, "lookupMismatchSummary.csv")

cat("Selected ", sum(joined$inBioBlitz, na.rm = TRUE), " observations from set in BioBlitz")

filteredDown <- joined[, !names(joined) %in% c("kingdom", "phylum", "class", "order", "suborder", "family", "genus", "specificEpithet", "infraspecificEpithet", 
                                               "taxonRank", "bibliographicCitation", "scientificNameAuthorship", "nationalStatus", "provincialStatus",
                                               "year", "month", "day","basisOfRecord", "occurrenceStatus", "inSummary",
                                               "island", "stateProvince", "country", "countryCode"
                                               )]

# Remove remaining empty columns for now - https://stackoverflow.com/a/17672764
emptyCols <- colSums(is.na(filteredDown)) == nrow(filteredDown)
filteredDown2 <- filteredDown[!emptyCols]

timedWrite(filteredDown2, "Galiano_Island_vascular_plant_records_consolidated-normalised.csv")
