source("./utils.R")

# Subset to those records for which both plants and pollinators could be resolved in iNat

assigned <- timedFread("plant-pollinators-OBA-assigned.csv")

subset <- assigned[assigned$plantAssignedINatName != "" & assigned$pollinatorAssignedINatName != "", ]

timedWrite(subset, "plant-pollinators-OBA-assigned-subset.csv")