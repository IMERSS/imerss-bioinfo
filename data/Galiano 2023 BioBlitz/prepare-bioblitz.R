library(dplyr)

source("../Rscripts/utils.R")

rawRecords <- timedFread("Galiano_Island_vascular_plant_records_consolidated-assigned.csv")
# To check against all summary
# raw <- timedFread("Galiano_Island_vascular_plant_records_consolidated-filtered.csv")

summary <- timedFread("Galiano_Tracheophyta_review_summary_reviewed_2024-10-07-assigned_revised.csv")
inSummary <- data.frame(id = summary$ID, inSummary = 1)

joined <- rawRecords %>% left_join(inSummary, by = join_by(taxonID == id))

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

datasetName <- joined$datasetName

filteredDown <- joined[, !names(joined) %in% c("datasetName", "kingdom", "phylum", "class", "order", "suborder", "family", "genus", "specificEpithet", "infraspecificEpithet", 
                                               "taxonRank", "bibliographicCitation", "scientificNameAuthorship", "nationalStatus", "provincialStatus",
                                               "year", "month", "day","basisOfRecord", "occurrenceStatus", "inSummary",
                                               "island", "stateProvince", "country", "countryCode", "associatedReferences"
                                               )]

# Remove remaining empty columns for now - https://stackoverflow.com/a/17672764
emptyCols <- colSums(is.na(filteredDown)) == nrow(filteredDown)
filteredDown2 <- filteredDown[!emptyCols]

uniqueDatasets = unique(datasetName)
datasetIndex = match(datasetName, uniqueDatasets)
filteredDown2$dataset = datasetIndex

timedWrite(filteredDown2, "Galiano_Island_vascular_plant_records_consolidated-prepared.csv")


indirectionRows <- data.frame(regionField = "dataset", id = 1:length(uniqueDatasets), label = uniqueDatasets)
indirectionRows$datasetClass <- ifelse(indirectionRows$label == "iNaturalist", "citizen", "naturalist")

timedWrite(indirectionRows, "regionIndirection.csv")


rawSummary <- timedFread("Galiano_Island_vascular_plant_records_consolidated-assigned-taxa.csv")

summaryFields <- data.frame(id = summary$ID, reportingStatus = summary$Reporting.Status, observation = summary$Observation, inSummary = 1)
joinedSummary <- rawSummary %>% left_join(summaryFields, by = join_by(id))

timedWrite(joinedSummary, "Galiano_Island_vascular_plant_records_consolidated-prepared-taxa.csv")
