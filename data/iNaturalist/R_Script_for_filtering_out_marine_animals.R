library(dplyr)

setwd("/Users/Simon/Sync/Simon/Biodiversity_Galiano_Project/Projects/Data_Paper_2020/Marine/Animalia/Catalogues_Final")
dir()

Animals <- read.csv("observations-103374.csv")

head(Animals)

unique(Animals$taxon_class_name)
unique(Marine.animals$taxon_class_name)

# Filter out all* terrestrial animals

Marine.animals <- filter(Animals, taxon_class_name != "Aves" & taxon_class_name != "Arachnida" 
                  & taxon_class_name != "Insecta" & taxon_class_name != "Amphibia"
                  & taxon_class_name != "Reptilia" & taxon_class_name != "Diplopoda"
                  & taxon_subclass_name != "Collembola" & taxon_superorder_name != "Eupulmonata" 
                  & taxon_superorder_name != "Hygrophila" & taxon_order_name != "Chiroptera"
                  & taxon_order_name != "Eulipotyphla" & taxon_order_name != "Rodentia"
                  & taxon_family_name != "Armadillidiidae" & taxon_family_name != "Bovidae"
                  & taxon_family_name != "Cervidae" & taxon_family_name != "Oniscidae"
                  & taxon_family_name != "Porcellionidae" & taxon_species_name != "Ligidium gracile")

# *There will still be some freshwater crustaceans hiding in here. And maybe something else...

nrow(Animals)
nrow(Marine.animals)

write.csv(Marine.animals, "Marine.animals.csv")