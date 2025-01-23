library(readxl)
library(dplyr)
library(stringr)
source("./utils.R")

raw <- read_xlsx("bigdata/OBA_2018-2023_all_records.xlsx", col_types = "text")

cat("Read ", nrow(raw), " raw records")

emptyCols <- colSums(is.na(raw)) == nrow(raw)

emptyColNames = names(emptyCols[emptyCols])
cat("Removing ", length(emptyColNames), " empty columns ", paste(emptyColNames, collapse = ", "))

raw <- raw[!emptyCols]

# Get rid of some columns we will not viz
filtered <- raw[, !names(raw) %in% c("userId", "userLogin", "firstName", "lastName", "firstNameInitial", 
                                     "day2", "month2", "year2", "verbatimEventData",
                                     "resourceID", "relatedResourceID", # Former is same as occurrenceID
                                     "phylumPlant", "orderPlant", "familyPlant", "taxonRankPlant", "identifiedBy")]

# Pick only those rows which have all fields we need - plant and bee resolved at least to genus, georeferenced and dated
filtered <- filtered %>% filter(!is.na(genus) & !is.na(genusPlant) & !is.na(decimalLatitude) & !is.na(decimalLongitude) & !is.na(day))

# As per https://stackoverflow.com/a/55977400/1381443
filtered <- filtered %>% mutate_at(vars(decimalLatitude, decimalLongitude), ~ round(as.numeric(.), 3))

timedWrite(filtered, "plant-pollinators-OBA-2025.csv")

griddable <- filtered

eventDate <- paste(griddable$year, str_pad(griddable$month, width=2, pad="0"), str_pad(griddable$day, width=2, pad="0"), sep="-")
beeName <- ifelse(is.na(griddable$specificEpithet), griddable$genus, paste(griddable$genus, griddable$specificEpithet))
plantName <- ifelse(is.na(griddable$speciesPlant), griddable$genusPlant, griddable$speciesPlant)

normaliseSex <- c("female" = "F", "Female" = "F", "male" = "M", "Male" = "M")

griddable <- mutate(griddable,
                    pollinatorINatName = beeName,
                    scientificName = beeName,
                    plantINatName = plantName,
                    plantScientificName = plantName,
                    iNatObsId = sub("https://www.inaturalist.org/observations/", "", griddable$url),
                    occurrenceID = sub("https://osac.oregonstate.edu/OBS/OBA_", "", griddable$occurrenceID),
                    sex = normaliseSex[sex],
                    eventDate = eventDate
)

# Get rid of source columns
griddable <- griddable[, !names(griddable) %in% c("year", "month", "day", "lastName", "firstNameInitial", 
                                                  "url",
                                                  "genus", "specificEpithet",
                                                  "genusPlant", "speciesPlant")]

timedWrite(griddable, "plant-pollinators-OBA-2025-normalised.csv")
