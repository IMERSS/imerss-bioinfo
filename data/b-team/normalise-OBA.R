library(dplyr)

source("./utils.R")

raw <- timedFread("plant-pollinators-OBA-2.csv");

breaks = c("/", "'", "(")

axe = c("var ", "nr ", " sp.", " ssp.", " spp.", "Genus ")

affPattern <- "^(.*) aff (.+)$"

splitSep <- function (tosplit, splitOn) {
  ifelse(is.na(tosplit), c(""), strsplit(tosplit, splitOn, fixed = TRUE)[[1]])
}

normaliseOneName <- function (scientific) {
  result <- list(name=scientific, aff=FALSE, annotation="")
  # Truncate if any remaining / or sp.
  for (oneBreak in breaks) {
    parts <- splitSep(result$name, oneBreak)
    result$name = parts[[1]]
  }
  
  for (oneAxe in axe) {
    result$name <- sub(oneAxe, "", result$name, fixed=TRUE)
  }

  # Split off and store any "aff." annotation
  matches <- regexec(affPattern, result$name)
  if (matches[[1]][[1]] != -1) {
    texts <- regmatches(result$name, matches)[[1]]
    result$name = paste(texts[[2]], texts[[3]])
    result$aff = TRUE
  }
  
  result
}

normaliseName <- Vectorize(normaliseOneName)

# Flip a list of lists back into a dataframe
flipLists <- function (doubleList) {
  as.data.frame(t(as.data.frame(doubleList)))
}

plantName <- raw$"Associated plant - genus, species"
plantParsed <- flipLists(normaliseName(plantName))

# Amazingly nothing better possible in R - https://stackoverflow.com/a/9316431
beeName <- ifelse(is.na(raw$Species), raw$Genus, paste(raw$Genus, raw$Species))
beeParsed <- flipLists(normaliseName(beeName))

collectors <- ifelse(is.na(raw$Collectors), paste(raw$`Collector - First Initial`, raw$`Collector - Last Name`), raw$Collectors)

normaliseSex <- c("female" = "F", "Female" = "F", "male" = "M", "Male" = "M")

filtered <- mutate(raw,
                   pollinatorINatName = as.character(unlist(beeParsed$name)),
                   scientificName = beeName,
                   plantINatName = as.character(unlist(plantParsed$name)),
                   plantScientificName = plantName,
                   iNatObsId = sub("https://www.inaturalist.org/observations/", "", raw$url),
                   Collectors = collectors,
                   decimalLongitude = raw$"Dec. Long.",
                   decimalLatitude = raw$"Dec. Lat.",
                   eventDate = raw$`Collection Date`,
                   sex = normaliseSex[sex]
)

# Remove columns which have been processed into fresh columns
filteredDown <- filtered[, !names(filtered) %in% c("Associated plant - genus, species", "Genus", "Species", "Collector - First Name", "Collector - First Initial",
   "Collector - Last Name", "url", "Dec. Long.", "Dec. Lat.", "MonthAb", "MonthJul",
   "Year 1", "Month 1", "Time 1", "Collection Day 1", "Year 2", "Month 2", "Time 2", "Collection Day 2", "Collection Day 2 Merge", "Collection Date")]

# Remove columns which viz will not use
filteredDown2 <- filteredDown[, !names(filteredDown) %in% c("user_id", "user_login", "taxon_kingdom_name", "Collection No.", "Sample No.", "Sample ID", "Specimen ID", "Country", 
   "Location", "Collection Site Description", "Associated plant - family", "Associated plant - Inaturalist URL", "Determined By", "Additional Notes")]


# Remove remaining empty columns for now - https://stackoverflow.com/a/17672764
emptyCols <- colSums(is.na(filteredDown2)) == nrow(filteredDown2)
filteredDown2 <- filteredDown2[!emptyCols]

timedWrite(filteredDown2, "plant-pollinators-OBA-2-normalised.csv")
