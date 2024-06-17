library(stringi)
source("./utils.R")

# Path B-Team/Datasets
# From https://drive.google.com/file/d/1jui21yV8aXXC25nuspnR6K62OQZMYhYx/view?usp=sharing
downloadGdrive("1jui21yV8aXXC25nuspnR6K62OQZMYhYx", "bigdata/OBA_2018-2023_combined_dataset_working.csv")

occ <- timedFread("bigdata/OBA_2018-2023_combined_dataset_working.csv")

plant.is.blank <- function (v) {
    return (v != "" & v != '""' & v != "none" & v != "None")
}

both <- occ[plant.is.blank(occ$`Associated plant - genus, species`) & occ$Genus != "",]

# Two columns are duplicate which prevent working in dplyr - "Associated plant - Inaturalist URL" and "Collectors"
# https://stackoverflow.com/a/41460390
bothGood <- subset(both, select=which(!duplicated(names(both)))) 

timedWrite(bothGood, "plant-pollinators-OBA-2.csv")
