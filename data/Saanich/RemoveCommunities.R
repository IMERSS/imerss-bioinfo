library(dplyr)

raw <- read.csv("data/Saanich/bc-cdc_2026-03-09.csv", fileEncoding = "UTF-8-BOM")

filtered <- raw %>% filter(taxonRank == "Species" | taxonRank == "Variety" | taxonRank == "Subspecies")

write.csv(filtered, "data/Saanich/bc-cdc_2026-03-09-filtered.csv", row.names = FALSE)

bad_phyla <- c("Bacillariophyta", "Anthophyta", "Filicinophyta", "Lycophyta",
  "Sphenophyta", "Craniata", "Coniferophyta", "Hepatophyta", "Zygomycota")

bad_phyla <- c("Amoebozoa")

bad_phyla_rows <- filtered %>% filter(phylum %in% bad_phyla)

write.csv(bad_phyla_rows, "data/Saanich/bc-cdc_2026-03-09-bad-phyla-orig.csv", row.names = FALSE)

# Just write out the unique phyla
phyla = sort(unique(filtered$phylum))

phylatest = data.frame(phylum = phyla, scientificName = phyla)
write.csv(phylatest, "data/Saanich/bc-cdc_phyla.csv", row.names = FALSE)

# Write out a couple of one-row test files

tib <- raw %>% filter(scientificName == "Thinopyrum intermedium ssp. barbulatum")

write.csv(tib, "data/Saanich/bc-cdc_2026-03-09-tib-single.csv", row.names = FALSE)

tf <- raw %>% filter(scientificName == "Trichia favoginea")

write.csv(tib, "data/Saanich/bc-cdc_2026-03-09-tf-single.csv", row.names = FALSE)

aa <- raw %>% filter(scientificName == "Abies amabilis")

write.csv(aa, "data/Saanich/bc-cdc_2026-03-09-aa-single.csv", row.names = FALSE)

assigned <-  data.table::fread("data/Saanich/bc-cdc_2026-03-09-assigned.csv", encoding = "UTF-8")
unknown <- assigned %>% filter(nameStatus == "unknown")

write.csv(unknown, "data/Saanich/bc-cdc_2026-03-09-unknown-orig.csv", row.names = FALSE)
