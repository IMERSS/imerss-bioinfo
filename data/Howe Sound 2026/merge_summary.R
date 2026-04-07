library(dplyr)

assigned <- read.csv("Howe_Sound_Biosphere_biodiversity_2026-04-assigned.csv")
taxa <- read.csv("Howe_Sound_Biosphere_biodiversity_2026-04-assigned-taxa.csv")

merged <- assigned %>%
  left_join(taxa %>% select(id, commonName), by = c("iNaturalistTaxonId" = "id"))

write.csv(merged, "Howe_Sound_Biosphere_biodiversity_2026-04-merged.csv", row.names = FALSE)

