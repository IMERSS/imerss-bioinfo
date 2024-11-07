library(geojsonsf)
library(sf)

source("./utils.R")

raw <- timedFread("Galiano_Island_vascular_plant_records_consolidated.csv")

# Load the BioBlitz catalogue and assign a column inBioBlitz
bioblitzObs <- timedFread("iNaturalist_GalianoBioBlitz2023_Catalogue_2024_11_06.csv")
bioblitzIds <- data.frame(id = bioblitzObs$id, inBioBlitz = 1)

cat("Read ", nrow(bioblitzIds), " BioBlitz observations")

raw <- raw %>% left_join(bioblitzIds, by = join_by(occurrenceID == id))

# Assign a unique occurrenceID either from catalogNumber or else with incrementing ID
raw$occurrenceID <- ifelse(is.na(raw$occurrenceID), raw$catalogNumber, raw$occurrenceID)
dupes <- duplicated(raw$occurrenceID)
raw <- raw %>% mutate(occurrenceID = ifelse(dupes, paste0("BioBlitz-", row_number()), occurrenceID))
finalDupeIds <- sum(duplicated(raw$occurrenceID), na.rm = TRUE)
if (finalDupeIds != 0) {
  stop("Failed to allocate unique IDs to occurrence rows")
}

raw$datasetName <- sub("Hunterston Farm Stewardship Report: A Review of the 2010 BioBlitz", "Hunterston Farm", raw$datasetName)

timedWrite(raw, "Galiano_Island_vascular_plant_records_consolidated-normalised.csv")

raw_sf <- st_as_sf(raw %>% dplyr::filter(!is.na(decimalLatitude)), coords=c("decimalLongitude", "decimalLatitude"))
st_crs(raw_sf) <- "WGS84"

# Filter to Hunterston Farm polygon
hunterston <- geojsonsf::geojson_sf("hunterston-farm.geojson")
st_crs(hunterston) <- "WGS84"

filtered_ids <- raw_sf %>% st_filter(y = hunterston, .predicate=st_intersects) %>% st_drop_geometry %>% select(occurrenceID)

filtered <- raw %>% right_join(filtered_ids)

timedWrite(filtered, "Galiano_Island_vascular_plant_records_consolidated-filtered.csv")

