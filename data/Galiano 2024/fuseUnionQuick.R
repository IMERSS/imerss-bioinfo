library(dplyr)
source("data/Galiano 2024/utils.R")

taxa <- timedRead("data/iNaturalist/taxa/taxa.csv")
union <- timedRead("data/Galiano 2024/Galiano_Union_Catalogue_2025_12_30.csv")

union_joined <- union %>%
  select(-phylum) %>%
  left_join(
    taxa %>%
      select(
        id,
        Kingdom = kingdom,
        Phylum  = phylum,
        Class   = class,
        Order   = order,
        Family  = family,
        Genus   = genus
      ),
    by = c("taxon_id" = "id")
  )

write.csv(union_joined, "data/Galiano 2024/Galiano_Union_Catalogue_Taxa_2023_09_30.csv")
