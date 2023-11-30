library(stringi)
source("./utils.R")

# Path B-Team/Datasets
# From https://drive.google.com/file/d/1agZbErqUyyl2e-HiTcDj7FZRLU3eNlqX/view?usp=sharing
downloadGdrive("1agZbErqUyyl2e-HiTcDj7FZRLU3eNlqX", "bigdata/Example Oregon Bee Atlas species occurrence.csv")

occ <- timedFread("bigdata/Example Oregon Bee Atlas species occurrence.csv")

plant.is.blank <- function (v) {
    return (v != "" & v != '""' & v != "none" & v != "None")
}

both <- occ[plant.is.blank(occ$`Associated plant - genus, species`) & occ$Genus != "",]

# Two columns are duplicate which prevent working in dplyr - "Associated plant - Inaturalist URL" and "Collectors"
# https://stackoverflow.com/a/41460390
bothGood <- subset(both, select=which(!duplicated(names(both)))) 

timedWrite(bothGood, "plant-pollinators-OBA.csv")
