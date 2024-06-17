source("./utils.R")

# Subset to those records for which both plants and pollinators could be resolved in iNat

assigned <- timedFread("plant-pollinators-OBA-2-assigned.csv")

subset <- assigned[!is.na(assigned$plantAssignedINatName) & !is.na(assigned$pollinatorAssignedINatName), ]

timedWrite(subset, "plant-pollinators-OBA-2-assigned-subset.csv")