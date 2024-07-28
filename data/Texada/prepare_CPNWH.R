library(tidyverse)

cpn <- read.csv("CPNWH_20240726-121916.csv")
cpnd <- dplyr::distinct(cpn)

write.csv(cpnd, "CPNWH_20240726-121916-distinct.csv")
