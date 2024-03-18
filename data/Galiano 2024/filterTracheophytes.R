library(dplyr)

source("utils.R")

obs <- timedFread("reintegrated-obs.csv");

tracheophytes <- obs %>% filter(Phylum == "Tracheophyta")

timedWrite(tracheophytes, "../../../adfsimon-bioinfo-private/20-20-vision-on-plant-extirpation/Search_Effort/iNaturalist_Observations/iNat_obs_Tracheophyta_2023-11-14.csv")
