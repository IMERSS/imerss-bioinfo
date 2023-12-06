source("./utils.R")

raw <- timedFread("plant-pollinators-OBA.csv");

breaks = c("/", "'", "(")

axe = c("var ", "nr ", " sp.", " ssp.", " spp.", "Genus ")

affPattern <- "^(.*) aff (.+)$"

normaliseOneName <- function (scientific) {
  result <- list(name=scientific, aff=FALSE, annotation="")
  # Truncate if any remaining / or sp.
  for (oneBreak in breaks) {
    parts <- strsplit(result$name, oneBreak, fixed = TRUE)[[1]]
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
beeName <- ifelse(raw$Species == "", raw$Genus, paste(raw$Genus, raw$Species))
beeParsed <- flipLists(normaliseName(beeName))

filtered <- mutate(raw,
                   pollinatorINatName = as.character(unlist(beeParsed$name)),
                   scientificName = beeName,
                   plantINatName = as.character(unlist(plantParsed$name)),
                   plantScientificName =  plantName,
                   decimalLongitude = raw$"Dec. Long.",
                   decimalLatitude = raw$"Dec. Lat.",
                   eventDate = raw$`Collection Date`
)

filteredDown <- filtered[, !names(filtered) %in% c("Associated plant - genus, species", "Dec. Long.", "Dec. Lat.", "MonthAb", "MonthJul",
   "Year 1", "Month 1", "Time 1", "Collection Day 1", "Year 2", "Month 2", "Time 2", "Collection Day 2", "Collection Day 2 Merge", "Collection Date")]

timedWrite(filteredDown, "plant-pollinators-OBA-normalised.csv")
