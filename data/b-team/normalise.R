library(tidyverse)
library(terra)

firstup <- function(x) {
  substr(x, 1, 1) <- toupper(substr(x, 1, 1))
  x
}

spPattern <- "^(.*) sp\\.(\\s)*(.+)$"
nspPattern <- "^(.*) n\\.sp\\.(\\s)*(.+)$"
affPattern <- "^(.*) aff\\. (.+)$"
subGPattern <- "^(.*) \\((.*)\\)$"

breaks = c("/", " n. sp.", " sp.", " n.sp")

# Can contain example Hylaeus aff. episcopalis n.sp.
# Or Andrena aff. costillensis n.sp. 2
# Or Anthophora (Anthophoroides) n.sp.2

# Currently not handled - Perdita aff. giliae n. sp. 4 - normalise n. sp. to n.sp. first

normaliseOneName <- function (scientific) {
    scientific <- sub("n. sp.", "n.sp", scientific, fixed=TRUE)
    result <- list(name=scientific, aff=FALSE, annotation="")

    # Split off and store any "n.sp." annotation
    matches <- regexec(nspPattern, scientific)
    if (matches[[1]][[1]] != -1) {
      texts <- regmatches(scientific, matches)[[1]]
      result$name = texts[[2]]
      result$annotation = texts[[3]]
    }
        
    # Split off and store any "sp. " annotation
    matches <- regexec(spPattern, scientific)
    if (matches[[1]][[1]] != -1) {
        texts <- regmatches(scientific, matches)[[1]]
        result$name = texts[[2]]
        result$annotation = texts[[3]]
    }
    
    # Split off and store any "aff." annotation
    matches <- regexec(affPattern, result$name)
    if (matches[[1]][[1]] != -1) {
      texts <- regmatches(result$name, matches)[[1]]
      result$name = paste(texts[[2]], texts[[3]])
      result$aff = TRUE
    }
    
    # Truncate if any remaining / or sp.
    for (oneBreak in breaks) {
        parts <- strsplit(result$name, oneBreak, fixed = TRUE)[[1]]
        result$name = parts[[1]]
    }
    
    # If it is a raw subgenus such as Nomada (Micronomada) assign the subgenus as name for benefit of iNat
    matches <- regexec(subGPattern, result$name)
    if (matches[[1]][[1]] != -1) {
        texts <- regmatches(result$name, matches)[[1]]
        result$name = texts[[3]]
    }
    
    result
}

normaliseName <- Vectorize(normaliseOneName)

# Flip a list of lists back into a dataframe
flipLists <- function (doubleList) {
    as.data.frame(t(as.data.frame(doubleList)))
}

raw <- read_csv("plant-pollinators-Carril.csv");

beeName <- paste(raw$`Bee Genus`, raw$`Bee Species`)
# This answer patently doesn't work - https://stackoverflow.com/a/68162050
beeParsed <- flipLists(normaliseName(beeName))

plantName <- paste(raw$`Plant Genus`, raw$`Plant Species`)
plantParsed <- flipLists(normaliseName(plantName))

coords <- cbind(x=raw$UTM_E, y=raw$UTM_N)
pcoords <- vect(coords, crs=paste0("+proj=utm +zone=", raw$Zone[[1]]))
proj <- terra::project(pcoords, "+proj=longlat +datum=WGS84")
latlong <- terra::geom(proj)

firstup <- function(x) {
  substr(x, 1, 1) <- toupper(substr(x, 1, 1))
  x
}

monthi <- recode(firstup(raw$Month), Jan = 1, Feb = 2, Mar = 3, Apr = 4,
  May = 5, Jun = 6, Jul = 7, Aug = 8, Sep = 9, Oct = 10, Nov = 11, Dec = 12)

dates <- sprintf("%04d-%02d-%02d", raw$Year, monthi, raw$Day)

filtered <- mutate(raw,
# God knows why, it ends up as a list of 1-element lists - https://community.rstudio.com/t/how-can-i-save-a-tibble-that-contains-a-named-list-column-to-a-csv-file/126547
                   pollinatorINatName = as.character(unlist(beeParsed$name)),
                   scientificName = beeName,
                   plantINatName = as.character(unlist(plantParsed$name)),
                   plantScientificName = plantName,
                   decimalLongitude = round(latlong[, "x"], 4),
                   decimalLatitude = round(latlong[, "y"], 4),
                   eventDate = dates
                   )

filteredDown <- filtered[,!names(filtered) %in% c("Zone", "UTM_E", "UTM_N", "Year", "Month", "Day", "Bee Genus", "Bee Species", "Plant Genus", "Plant Species")]

write_csv(filteredDown, "plant-pollinators-Carril-normalised.csv")