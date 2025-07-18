library(dplyr)
library(geojsonsf)
library(sf)

# Adapted from prepare-bioblitz.R

source("../Rscripts/utils.R")

rawRecords <- timedFread("Salish_Sea_marine_diatom_records_consolidated_aligned_2025-03-assigned.csv")

rawWithCoords <- rawRecords %>% dplyr::filter(!is.na(decimalLatitude) & !is.na(decimalLongitude) &!is.na(iNaturalistTaxonId))

raw_sf <- rawWithCoords %>% st_as_sf(coords=c("decimalLongitude", "decimalLatitude")) %>%
   mutate(decimalLatitude = rawWithCoords$decimalLatitude,
          decimalLongitude = rawWithCoords$decimalLongitude)
st_crs(raw_sf) <- "WGS84"

# Filter to project polygon
#galiano <- geojsonsf::geojson_sf("../Galiano/Galiano_Island_Project_Boundary_Chu_final_2021-02-23.json")
#st_crs(galiano) <- "WGS84"

#filtered <- raw_sf %>% st_filter(y = galiano, .predicate=st_intersects) %>% st_drop_geometry

# Keep all for now
filtered <- raw_sf %>% st_drop_geometry

filtered <- filtered %>% mutate_at(vars(decimalLatitude, decimalLongitude), ~ round(as.numeric(.), 6))
datasetName <- filtered$datasetName

filteredDown <- filtered[, !names(filtered) %in% c("datasetName", "kingdom", "phylum", "class", "order", "suborder", "family", "genus", "specificEpithet", "infraspecificEpithet", 
                                               "taxonRank", "bibliographicCitation", "scientificNameAuthorship", "nationalStatus", "provincialStatus",
                                               "year", "month", "day","basisOfRecord", "occurrenceStatus", "inSummary",
                                               "island", "stateProvince", "country", "countryCode", "associatedReferences",
                                               # More fields to remove for diatoms
                                               "georeferenceProtocol", "georeferencedBy", "georeferenceVerificationStatus", "georeferenceRemarks",
                                               "occurenceRemarks", "identificationQualifier", "identificationRemarks", "nameStatus",
                                               "associatedSequences", "identifiedWith"
)]

# Remove remaining empty columns for now - https://stackoverflow.com/a/17672764
emptyCols <- colSums(is.na(filteredDown)) == nrow(filteredDown)
filteredDown2 <- filteredDown[!emptyCols]

uniqueDatasets = unique(na.omit(datasetName))
datasetIndex = match(datasetName, uniqueDatasets)
filteredDown2$dataset = datasetIndex

timedWrite(filteredDown2, "Salish_Sea_marine_diatom_records_consolidated_aligned_2025-03-prepared.csv")

indirectionRows <- data.frame(regionField = "dataset", id = 1:length(uniqueDatasets), label = uniqueDatasets)

timedWrite(indirectionRows, "regionIndirection.csv")