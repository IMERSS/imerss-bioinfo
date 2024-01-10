source("./utils.R")

assigned <- timedFread("plant-pollinators-OBA-assigned.csv")

subset <- assigned[assigned$plantAssignedINatName != "" & assigned$pollinatorAssignedINatName != "", ]

timedWrite(subset, "plant-pollinators-OBA-assigned-subset.csv")