library(dplyr)

source("utils.R")

trad <- timedRead("../iNaturalist/Galiano_Trad_Catalogue_2024_04_24.csv")
coll <- timedRead("../iNaturalist/Galiano_Coll_Catalogue_2024_04_24.csv")

tradNotColl <- dplyr::anti_join(trad, coll, by=c("id"))
collNotTrad <- dplyr::anti_join(coll, trad, by=c("id"))

collTradUnion <- merge(trad, coll, all=TRUE)

# If some fields, e.g. commonName contain discrepant values we may end up with two rows
collTradUnion <- collTradUnion[!duplicated(collTradUnion$id), ]

timedWrite(tradNotColl, "Galiano_Trad_Not_Coll_2024_04_24.csv")
timedWrite(collNotTrad, "Galiano_Coll_Not_Trad_2024_04_24.csv")
timedWrite(collTradUnion, "Galiano_Union_Catalogue_2024_04_24.csv")
