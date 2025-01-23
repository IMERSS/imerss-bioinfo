source("./utils.R")

# Subset to those records for which both plants and pollinators could be resolved in iNat

assigned <- timedFread("plant-pollinators-OBA-2025-assigned.csv")

subset <- assigned[!is.na(assigned$plantAssignedINatName) & !is.na(assigned$pollinatorAssignedINatName), ]

# Get rid of bulky name columns produced by "assign"
# Keep scientificName since it is used in b-team pollinator stats per region
subset <- subset[, !names(subset) %in% c("pollinatorINatName", # "scientificName", 
                                         "plantINatName", "plantScientificName",
                                         "plantNameStatus", "pollinatorNameStatus",
                                         "plantAssignedINatName", "pollinatorAssignedINatName")]

timedWrite(subset, "plant-pollinators-OBA-2025-assigned-subset.csv")
