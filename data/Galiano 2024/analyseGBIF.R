library(stringi)
source("./utils.R")
source("./synthesizeTradColl.R")

# Solution from https://stackoverflow.com/a/29529342 for https://stackoverflow.com/questions/29529021/replace-a-data-frame-column-based-on-regex
extractINatId <- function (inatRows) {
  ids <- stri_match_first_regex(iNatRows$occurrenceID, "^.*/(.+)$")[,2]
  imerssids <- stri_match_first_regex(iNatRows$occurrenceID, "^imerss.org:iNat:(.+)$")[,2]
  iNatRows$iNatID <- as.numeric(ifelse(is.na(ids), imerssids, ids))
  iNatRows
}

# Path Salish Sea Biodiversity/Galiano Data Paper Series/Galiano 2024/Sources
# From https://drive.google.com/file/d/1AlusHyBJPZC8NkuDeqV8xzkYpctAeLQV/view?usp=sharing
downloadGdrive("1AlusHyBJPZC8NkuDeqV8xzkYpctAeLQV", "bigdata/gbif-galiano-2023-09-25-0006822-230918134249559.csv")

gbif <- timedFread("bigdata/gbif-galiano-2023-09-25-0006822-230918134249559.csv")

iNatRows <- gbif[institutionCode=="iNaturalist"]

iNatRows <- extractINatId(inatRows)
iNatRows <- iNatRows[!duplicated(iNatRows$iNatID), ]

#Rows in GBIF not in collections project
gbifNotColl <- dplyr::anti_join(iNatRows, coll, by=c("iNatID"="id"))
gbifNotTrad <- dplyr::anti_join(iNatRows, trad, by=c("iNatID"="id"))
gbifNotUnion <- dplyr::anti_join(iNatRows, collTradUnion, by=c("iNatID"="id"))

timedWrite(gbifNotColl, "Galiano_GBIF_Not_Coll_2023_10_17.csv")
timedWrite(gbifNotTrad, "Galiano_GBIF_Not_Trad_2023_10_17.csv")
timedWrite(gbifNotUnion, "Galiano_GBIF_Not_Union_2023_10_17.csv")
