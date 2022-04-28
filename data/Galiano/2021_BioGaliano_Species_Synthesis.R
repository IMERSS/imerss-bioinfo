#### R Script for synthesizing taxon summaries for the Biodiversity Galiano project

## Load R packages

library(dplyr)
library(gridExtra)
library(readr)
library(tidyverse)
library(viridis)

# Custom R function:

substrRight <- function(x, n){
  substr(x, nchar(x)-n+1, nchar(x))
}

## Set directory

setwd("/Users/Simon/Sync/Simon/Biodiversity_Galiano_Project/Species_Lists/2021_Lists/BioGaliano_2021_Species_Synthesis")

## Read in data

dir()

BACTERIA <- read.csv("Bacteria_2021-11-25.csv")

PROTOZOA <- read.csv("Protozoa_2021-11-25.csv")

FUNGI <- read.csv("Fungi_2021-11-25.csv")
LICHENS <- read.csv("Lichens_2021-08-18.csv")

ALGAE <- read.csv("Algae_2021-11-25.csv")
BRYOPHYTES <- read.csv("Bryophyta_2021-08-19.csv")
VASCULARS <- read.csv("Vascular_Plants_021-09-19_no_comments.csv")

PORIFERA <- read.csv("Porifera_2021-01-27.csv")
JELLIES <- read.csv("Cnidaria_et_Ctenophora_2021-01-27.csv")
CRUSTACEANS <- read.csv("Crustacea_2021-02-05.csv")
MARINE_MOLLUSCS <- read.csv("Marine_Molluscs_2021-01-31.csv")
WORMS <- read.csv("Annelida_Chaetognatha_Nemertea_Platyhelminthes_et_Sipuncula_2021-02-05.csv")
LOPHOPHORATES <- read.csv("Brachiopoda_Bryozoa_Entoprocta_et_Phoronida_2021-02-04.csv")
ECHINODERMS <- read.csv("Echinodermata_2021-02-04.csv")
TUNICATES <- read.csv("Tunicata_2021-02-05.csv")
FISH <- read.csv("Actinopterygii_et_Chondrichthyes_2021-01-28.csv")
MARINE_MAMMALS <- read.csv("Marine_Mammals_2021-02-04.csv")

TERRESTRIAL_MOLLUSCS <- read.csv("Terrestrial_molluscs_2021-11-25.csv")
SPRINGTAILS <- read.csv("Collembola_2021-11-25.csv")
ISOPODS <- read.csv("Oniscidea_2021-11-25.csv")
MYRIAPODS <- read.csv("Myriapoda_2021-11-25.csv")
INSECTS <- read.csv("Insects_2021-09-04.csv")
SPIDERS <- read.csv("Arachnida_2021-11-25.csv")
GOLDFISH <- read.csv("Cypriniformes_2021-11-25.csv")
HERPTILES <- read.csv("Herptiles_2021-11-25.csv")
BIRDS <- read.csv("Birds_2021-11-25.csv")
TERRESTRIAL_MAMMALS <- read.csv("Terrestrial_Mammals_2021-11-25.csv")

ANIMALS <- rbind(PORIFERA, JELLIES, CRUSTACEANS, MARINE_MOLLUSCS, WORMS, LOPHOPHORATES, ECHINODERMS,
                 TUNICATES, FISH, MARINE_MAMMALS, TERRESTRIAL_MOLLUSCS, SPRINGTAILS, ISOPODS,
                 MYRIAPODS, INSECTS, SPIDERS, GOLDFISH, HERPTILES, BIRDS, TERRESTRIAL_MAMMALS)

unique(PORIFERA$Stats.Code)

PROTOZOA_FUNGI_LICHENS <- rbind(PROTOZOA, FUNGI, LICHENS)

BACTERIA <- BACTERIA

ALGAE_PLANTS <- rbind(ALGAE, BRYOPHYTES, VASCULARS)

nrow(BACTERIA)
nrow(PROTOZOA_FUNGI_LICHENS)
nrow(ALGAE_PLANTS)
nrow(ANIMALS)

# write.csv(PROTOZOA_FUNGI_LICHENS, "Protozoa_Fungi_and_Lichens_2021.csv")
# write.csv(BACTERIA, "Bacteria_2021.csv")
# write.csv(ANIMALS, "Animals_2021.csv")
# write.csv(ALGAE_PLANTS, "Algae_and_Plants_2021.csv")

## CALCULATE PROJECT STATS

# First set up basic vectors for dataframes

Reported <- c(NA)
Confirmed <- c(NA)
New <- c(NA)
Total <- c(NA)
Prop.confirmed <- c(NA)
Prop.new <- c(NA)

# Produce summary stats for each group

# Bacteria

Taxa.BAC <- c('BAC')

BAC.count <- data.frame(Taxa.BAC,Reported,Confirmed,New,Total,Prop.confirmed,Prop.new)
names(BAC.count)[names(BAC.count) == 'Taxa.BAC'] <- 'Taxon'

BAC <-  BACTERIA %>% dplyr::filter(Stats.Code == 'BAC')
        BAC.reported <- BAC %>% dplyr::filter(Reporting.Status == 'reported')
        BAC.confirmed <- BAC %>% dplyr::filter(Reporting.Status == 'confirmed')
        BAC.new <- BAC %>% dplyr::filter(grepl("new",Reporting.Status))
        
        BAC.count$Reported <- nrow(BAC.reported)
        BAC.count$Confirmed <- nrow(BAC.confirmed)
        BAC.count$New <- nrow(BAC.new)
        BAC.count$Total <- nrow(BAC)
        BAC.total.reported = nrow(BAC.reported) + nrow(BAC.confirmed)
        BAC.count$Prop.confirmed = BAC.count$Confirmed/BAC.total.reported
        BAC.count$Prop.new <- BAC.count$New/BAC.count$Total
        
        BAC.count$new.2015 <- sum(str_count(BAC.new$Reporting.Status, pattern = "2015"))
        BAC.count$new.2016 <- sum(str_count(BAC.new$Reporting.Status, pattern = "2016"))
        BAC.count$new.2017 <- sum(str_count(BAC.new$Reporting.Status, pattern = "2017"))
        BAC.count$new.2018 <- sum(str_count(BAC.new$Reporting.Status, pattern = "2018"))
        BAC.count$new.2019 <- sum(str_count(BAC.new$Reporting.Status, pattern = "2019"))
        BAC.count$new.2020 <- sum(str_count(BAC.new$Reporting.Status, pattern = "2020"))
        BAC.count$new.2021 <- sum(str_count(BAC.new$Reporting.Status, pattern = "2021"))
        BAC.count$new.prior.2015 <- BAC.count$New - (BAC.count$new.2015+BAC.count$new.2016+BAC.count$new.2017+BAC.count$new.2018+BAC.count$new.2019+BAC.count$new.2020+BAC.count$new.2021)
        
        BAC.count
        
        BAC.count.chronology <- BAC.count %>% pivot_longer(cols = new.2015:new.2021)
        BAC.count.chronology <- BAC.count.chronology %>% dplyr::select(Taxon,name,value)
        
        colnames(BAC.count.chronology)<- c("Taxon","Year","New.spp")
        
        BAC.count.chronology$Year <- as.numeric(substrRight(BAC.count.chronology$Year, 4))
        
        BAC.count.chronology
        
        # Protozoa
        
        Taxa.PRO <- c('PRO')
        
        PRO.count <- data.frame(Taxa.PRO,Reported,Confirmed,New,Total,Prop.confirmed,Prop.new)
        names(PRO.count)[names(PRO.count) == 'Taxa.PRO'] <- 'Taxon'
        
        PRO <- PROTOZOA_FUNGI_LICHENS %>% dplyr::filter(Stats.Code == 'PRO')
        PRO.reported <- PRO %>% dplyr::filter(Reporting.Status == 'reported')
        PRO.confirmed <- PRO %>% dplyr::filter(Reporting.Status == 'confirmed')
        PRO.new <- PRO %>% dplyr::filter(grepl("new",Reporting.Status))
        
        PRO.count$Reported <- nrow(PRO.reported)
        PRO.count$Confirmed <- nrow(PRO.confirmed)
        PRO.count$New <- nrow(PRO.new)
        PRO.count$Total <- nrow(PRO)
        PRO.total.reported = nrow(PRO.reported) + nrow(PRO.confirmed)
        PRO.count$Prop.confirmed = PRO.count$Confirmed/PRO.total.reported
        PRO.count$Prop.new <- PRO.count$New/PRO.count$Total
        
        PRO.count$new.2015 <- sum(str_count(PRO.new$Reporting.Status, pattern = "2015"))
        PRO.count$new.2016 <- sum(str_count(PRO.new$Reporting.Status, pattern = "2016"))
        PRO.count$new.2017 <- sum(str_count(PRO.new$Reporting.Status, pattern = "2017"))
        PRO.count$new.2018 <- sum(str_count(PRO.new$Reporting.Status, pattern = "2018"))
        PRO.count$new.2019 <- sum(str_count(PRO.new$Reporting.Status, pattern = "2019"))
        PRO.count$new.2020 <- sum(str_count(PRO.new$Reporting.Status, pattern = "2020"))
        PRO.count$new.2021 <- sum(str_count(PRO.new$Reporting.Status, pattern = "2021"))
        PRO.count$new.prior.2015 <- PRO.count$New - (PRO.count$new.2015+PRO.count$new.2016+PRO.count$new.2017+PRO.count$new.2018+PRO.count$new.2019+PRO.count$new.2020+PRO.count$new.2021)
        
        PRO.count
        
        PRO.count.chronology <- PRO.count %>% pivot_longer(cols = new.2015:new.2021)
        PRO.count.chronology <- PRO.count.chronology %>% dplyr::select(Taxon,name,value)
        
        colnames(PRO.count.chronology)<- c("Taxon","Year","New.spp")
        
        PRO.count.chronology$Year <- as.numeric(substrRight(PRO.count.chronology$Year, 4))
        
        PRO.count.chronology
        
        # Fungi
        
        Taxa.FUN <- c('FUN')
        
        FUN.count <- data.frame(Taxa.FUN,Reported,Confirmed,New,Total,Prop.confirmed,Prop.new)
        names(FUN.count)[names(FUN.count) == 'Taxa.FUN'] <- 'Taxon'
        
        FUN <- PROTOZOA_FUNGI_LICHENS %>% dplyr::filter(Stats.Code == 'FUN')
        FUN.reported <- FUN %>% dplyr::filter(Reporting.Status == 'reported')
        FUN.confirmed <- FUN %>% dplyr::filter(Reporting.Status == 'confirmed')
        FUN.new <- FUN %>% dplyr::filter(grepl("new",Reporting.Status))
        
        FUN.count$Reported <- nrow(FUN.reported)
        FUN.count$Confirmed <- nrow(FUN.confirmed)
        FUN.count$New <- nrow(FUN.new)
        FUN.count$Total <- nrow(FUN)
        FUN.total.reported = nrow(FUN.reported) + nrow(FUN.confirmed)
        FUN.count$Prop.confirmed = FUN.count$Confirmed/FUN.total.reported
        FUN.count$Prop.new <- FUN.count$New/FUN.count$Total
        
        FUN.count$new.2015 <- sum(str_count(FUN.new$Reporting.Status, pattern = "2015"))
        FUN.count$new.2016 <- sum(str_count(FUN.new$Reporting.Status, pattern = "2016"))
        FUN.count$new.2017 <- sum(str_count(FUN.new$Reporting.Status, pattern = "2017"))
        FUN.count$new.2018 <- sum(str_count(FUN.new$Reporting.Status, pattern = "2018"))
        FUN.count$new.2019 <- sum(str_count(FUN.new$Reporting.Status, pattern = "2019"))
        FUN.count$new.2020 <- sum(str_count(FUN.new$Reporting.Status, pattern = "2020"))
        FUN.count$new.2021 <- sum(str_count(FUN.new$Reporting.Status, pattern = "2021"))
        FUN.count$new.prior.2015 <- FUN.count$New - (FUN.count$new.2015+FUN.count$new.2016+FUN.count$new.2017+FUN.count$new.2018+FUN.count$new.2019+FUN.count$new.2020+FUN.count$new.2021)
        
        FUN.count
        
        FUN.count.chronology <- FUN.count %>% pivot_longer(cols = new.2015:new.2021)
        FUN.count.chronology <- FUN.count.chronology %>% dplyr::select(Taxon,name,value)
        
        colnames(FUN.count.chronology)<- c("Taxon","Year","New.spp")
        
        FUN.count.chronology$Year <- as.numeric(substrRight(FUN.count.chronology$Year, 4))
        
        FUN.count.chronology
        
        # Lichens
        
        Taxa.LIC <- c('LIC')
        
        LIC.count <- data.frame(Taxa.LIC,Reported,Confirmed,New,Total,Prop.confirmed,Prop.new)
        names(LIC.count)[names(LIC.count) == 'Taxa.LIC'] <- 'Taxon'
        
        LIC <- PROTOZOA_FUNGI_LICHENS %>% dplyr::filter(Stats.Code == 'LIC')
        LIC.reported <- LIC %>% dplyr::filter(Reporting.Status == 'reported')
        LIC.confirmed <- LIC %>% dplyr::filter(Reporting.Status == 'confirmed')
        LIC.new <- LIC %>% dplyr::filter(grepl("new",Reporting.Status))
        
        LIC.count$Reported <- nrow(LIC.reported)
        LIC.count$Confirmed <- nrow(LIC.confirmed)
        LIC.count$New <- nrow(LIC.new)
        LIC.count$Total <- nrow(LIC)
        LIC.total.reported = nrow(LIC.reported) + nrow(LIC.confirmed)
        LIC.count$Prop.confirmed = LIC.count$Confirmed/LIC.total.reported
        LIC.count$Prop.new <- LIC.count$New/LIC.count$Total
        
        LIC.count$new.2015 <- sum(str_count(LIC.new$Reporting.Status, pattern = "2015"))
        LIC.count$new.2016 <- sum(str_count(LIC.new$Reporting.Status, pattern = "2016"))
        LIC.count$new.2017 <- sum(str_count(LIC.new$Reporting.Status, pattern = "2017"))
        LIC.count$new.2018 <- sum(str_count(LIC.new$Reporting.Status, pattern = "2018"))
        LIC.count$new.2019 <- sum(str_count(LIC.new$Reporting.Status, pattern = "2019"))
        LIC.count$new.2020 <- sum(str_count(LIC.new$Reporting.Status, pattern = "2020"))
        LIC.count$new.2021 <- sum(str_count(LIC.new$Reporting.Status, pattern = "2021"))
        LIC.count$new.prior.2015 <- LIC.count$New - (LIC.count$new.2015+LIC.count$new.2016+LIC.count$new.2017+LIC.count$new.2018+LIC.count$new.2019+LIC.count$new.2020+LIC.count$new.2021)
        
        LIC.count
        
        LIC.count.chronology <- LIC.count %>% pivot_longer(cols = new.2015:new.2021)
        LIC.count.chronology <- LIC.count.chronology %>% dplyr::select(Taxon,name,value)
        
        colnames(LIC.count.chronology)<- c("Taxon","Year","New.spp")
        
        LIC.count.chronology$Year <- as.numeric(substrRight(LIC.count.chronology$Year, 4))
        
        LIC.count.chronology
        
        # Algae
        
        Taxa.ALG <- c('ALG')
        
        ALG.count <- data.frame(Taxa.ALG,Reported,Confirmed,New,Total,Prop.confirmed,Prop.new)
        names(ALG.count)[names(ALG.count) == 'Taxa.ALG'] <- 'Taxon'
        
        ALG <- ALGAE_PLANTS %>% dplyr::filter(Stats.Code == 'ALG')
        ALG.reported <- ALG %>% dplyr::filter(Reporting.Status == 'reported')
        ALG.confirmed <- ALG %>% dplyr::filter(Reporting.Status == 'confirmed')
        ALG.new <- ALG %>% dplyr::filter(grepl("new",Reporting.Status))
        
        ALG.count$Reported <- nrow(ALG.reported)
        ALG.count$Confirmed <- nrow(ALG.confirmed)
        ALG.count$New <- nrow(ALG.new)
        ALG.count$Total <- nrow(ALG)
        ALG.total.reported = nrow(ALG.reported) + nrow(ALG.confirmed)
        ALG.count$Prop.confirmed = ALG.count$Confirmed/ALG.total.reported
        ALG.count$Prop.new <- ALG.count$New/ALG.count$Total
        
        ALG.count$new.2015 <- sum(str_count(ALG.new$Reporting.Status, pattern = "2015"))
        ALG.count$new.2016 <- sum(str_count(ALG.new$Reporting.Status, pattern = "2016"))
        ALG.count$new.2017 <- sum(str_count(ALG.new$Reporting.Status, pattern = "2017"))
        ALG.count$new.2018 <- sum(str_count(ALG.new$Reporting.Status, pattern = "2018"))
        ALG.count$new.2019 <- sum(str_count(ALG.new$Reporting.Status, pattern = "2019"))
        ALG.count$new.2020 <- sum(str_count(ALG.new$Reporting.Status, pattern = "2020"))
        ALG.count$new.2021 <- sum(str_count(ALG.new$Reporting.Status, pattern = "2021"))
        ALG.count$new.prior.2015 <- ALG.count$New - (ALG.count$new.2015+ALG.count$new.2016+ALG.count$new.2017+ALG.count$new.2018+ALG.count$new.2019+ALG.count$new.2020+ALG.count$new.2021)
        
        ALG.count
        
        ALG.count.chronology <- ALG.count %>% pivot_longer(cols = new.2015:new.2021)
        ALG.count.chronology <- ALG.count.chronology %>% dplyr::select(Taxon,name,value)
        
        colnames(ALG.count.chronology)<- c("Taxon","Year","New.spp")
        
        ALG.count.chronology$Year <- as.numeric(substrRight(ALG.count.chronology$Year, 4))
        
        ALG.count.chronology
        
        # Bryophytes
        
        Taxa.BRY <- c('BRY')
        
        BRY.count <- data.frame(Taxa.BRY,Reported,Confirmed,New,Total,Prop.confirmed,Prop.new)
        names(BRY.count)[names(BRY.count) == 'Taxa.BRY'] <- 'Taxon'
        
        BRY <- ALGAE_PLANTS %>% dplyr::filter(Stats.Code == 'BRY')
        BRY.reported <- BRY %>% dplyr::filter(Reporting.Status == 'reported')
        BRY.confirmed <- BRY %>% dplyr::filter(Reporting.Status == 'confirmed')
        BRY.new <- BRY %>% dplyr::filter(grepl("new",Reporting.Status))
        
        BRY.count$Reported <- nrow(BRY.reported)
        BRY.count$Confirmed <- nrow(BRY.confirmed)
        BRY.count$New <- nrow(BRY.new)
        BRY.count$Total <- nrow(BRY)
        BRY.total.reported = nrow(BRY.reported) + nrow(BRY.confirmed)
        BRY.count$Prop.confirmed = BRY.count$Confirmed/BRY.total.reported
        BRY.count$Prop.new <- BRY.count$New/BRY.count$Total
        
        BRY.count$new.2015 <- sum(str_count(BRY.new$Reporting.Status, pattern = "2015"))
        BRY.count$new.2016 <- sum(str_count(BRY.new$Reporting.Status, pattern = "2016"))
        BRY.count$new.2017 <- sum(str_count(BRY.new$Reporting.Status, pattern = "2017"))
        BRY.count$new.2018 <- sum(str_count(BRY.new$Reporting.Status, pattern = "2018"))
        BRY.count$new.2019 <- sum(str_count(BRY.new$Reporting.Status, pattern = "2019"))
        BRY.count$new.2020 <- sum(str_count(BRY.new$Reporting.Status, pattern = "2020"))
        BRY.count$new.2021 <- sum(str_count(BRY.new$Reporting.Status, pattern = "2021"))
        BRY.count$new.prior.2015 <- BRY.count$New - (BRY.count$new.2015+BRY.count$new.2016+BRY.count$new.2017+BRY.count$new.2018+BRY.count$new.2019+BRY.count$new.2020+BRY.count$new.2021)
        
        BRY.count
        
        BRY.count.chronology <- BRY.count %>% pivot_longer(cols = new.2015:new.2021)
        BRY.count.chronology <- BRY.count.chronology %>% dplyr::select(Taxon,name,value)
        
        colnames(BRY.count.chronology)<- c("Taxon","Year","New.spp")
        
        BRY.count.chronology$Year <- as.numeric(substrRight(BRY.count.chronology$Year, 4))
        
        BRY.count.chronology
        
        # Vascular plants
        
        Taxa.VAS <- c('VAS')
        
        VAS.count <- data.frame(Taxa.VAS,Reported,Confirmed,New,Total,Prop.confirmed,Prop.new)
        names(VAS.count)[names(VAS.count) == 'Taxa.VAS'] <- 'Taxon'
        
        VAS <- ALGAE_PLANTS %>% dplyr::filter(Stats.Code == 'VAS')
        VAS.reported <- VAS %>% dplyr::filter(Reporting.Status == 'reported')
        VAS.confirmed <- VAS %>% dplyr::filter(Reporting.Status == 'confirmed')
        VAS.new <- VAS %>% dplyr::filter(grepl("new",Reporting.Status))
        
        VAS.count$Reported <- nrow(VAS.reported)
        VAS.count$Confirmed <- nrow(VAS.confirmed)
        VAS.count$New <- nrow(VAS.new)
        VAS.count$Total <- nrow(VAS)
        VAS.total.reported = nrow(VAS.reported) + nrow(VAS.confirmed)
        VAS.count$Prop.confirmed = VAS.count$Confirmed/VAS.total.reported
        VAS.count$Prop.new <- VAS.count$New/VAS.count$Total
        
        VAS.count$new.2015 <- sum(str_count(VAS.new$Reporting.Status, pattern = "2015"))
        VAS.count$new.2016 <- sum(str_count(VAS.new$Reporting.Status, pattern = "2016"))
        VAS.count$new.2017 <- sum(str_count(VAS.new$Reporting.Status, pattern = "2017"))
        VAS.count$new.2018 <- sum(str_count(VAS.new$Reporting.Status, pattern = "2018"))
        VAS.count$new.2019 <- sum(str_count(VAS.new$Reporting.Status, pattern = "2019"))
        VAS.count$new.2020 <- sum(str_count(VAS.new$Reporting.Status, pattern = "2020"))
        VAS.count$new.2021 <- sum(str_count(VAS.new$Reporting.Status, pattern = "2021"))
        VAS.count$new.prior.2015 <- VAS.count$New - (VAS.count$new.2015+VAS.count$new.2016+VAS.count$new.2017+VAS.count$new.2018+VAS.count$new.2019+VAS.count$new.2020+VAS.count$new.2021)
        
        VAS.count
        
        VAS.count.chronology <- VAS.count %>% pivot_longer(cols = new.2015:new.2021)
        VAS.count.chronology <- VAS.count.chronology %>% dplyr::select(Taxon,name,value)
        
        colnames(VAS.count.chronology)<- c("Taxon","Year","New.spp")
        
        VAS.count.chronology$Year <- as.numeric(substrRight(VAS.count.chronology$Year, 4))
        
        VAS.count.chronology
        
    
        # Porifera
        
        Taxa.POR <- c('POR')
        
        POR.count <- data.frame(Taxa.POR,Reported,Confirmed,New,Total,Prop.confirmed,Prop.new)
        names(POR.count)[names(POR.count) == 'Taxa.POR'] <- 'Taxon'
        
        POR <- ANIMALS %>% dplyr::filter(Stats.Code == 'POR')
        POR.reported <- POR %>% dplyr::filter(Reporting.Status == 'reported')
        POR.confirmed <- POR %>% dplyr::filter(Reporting.Status == 'confirmed')
        POR.new <- POR %>% dplyr::filter(grepl("new",Reporting.Status))
        
        POR.count$Reported <- nrow(POR.reported)
        POR.count$Confirmed <- nrow(POR.confirmed)
        POR.count$New <- nrow(POR.new)
        POR.count$Total <- nrow(POR)
        POR.total.reported = nrow(POR.reported) + nrow(POR.confirmed)
        POR.count$Prop.confirmed = POR.count$Confirmed/POR.total.reported
        POR.count$Prop.new <- POR.count$New/POR.count$Total
        
        POR.count$new.2015 <- sum(str_count(POR.new$Reporting.Status, pattern = "2015"))
        POR.count$new.2016 <- sum(str_count(POR.new$Reporting.Status, pattern = "2016"))
        POR.count$new.2017 <- sum(str_count(POR.new$Reporting.Status, pattern = "2017"))
        POR.count$new.2018 <- sum(str_count(POR.new$Reporting.Status, pattern = "2018"))
        POR.count$new.2019 <- sum(str_count(POR.new$Reporting.Status, pattern = "2019"))
        POR.count$new.2020 <- sum(str_count(POR.new$Reporting.Status, pattern = "2020"))
        POR.count$new.2021 <- sum(str_count(POR.new$Reporting.Status, pattern = "2021"))
        POR.count$new.prior.2015 <- POR.count$New - (POR.count$new.2015+POR.count$new.2016+POR.count$new.2017+POR.count$new.2018+POR.count$new.2019+POR.count$new.2020+POR.count$new.2021)
        
        POR.count
        
        POR.count.chronology <- POR.count %>% pivot_longer(cols = new.2015:new.2021)
        POR.count.chronology <- POR.count.chronology %>% dplyr::select(Taxon,name,value)
        
        colnames(POR.count.chronology)<- c("Taxon","Year","New.spp")
        
        POR.count.chronology$Year <- as.numeric(substrRight(POR.count.chronology$Year, 4))
        
        POR.count.chronology
        
        # Cnidaria
        
        Taxa.CNI <- c('CNI')
        
        CNI.count <- data.frame(Taxa.CNI,Reported,Confirmed,New,Total,Prop.confirmed,Prop.new)
        names(CNI.count)[names(CNI.count) == 'Taxa.CNI'] <- 'Taxon'
        
        CNI <- ANIMALS %>% dplyr::filter(Stats.Code == 'CNI')
        CNI.reported <- CNI %>% dplyr::filter(Reporting.Status == 'reported')
        CNI.confirmed <- CNI %>% dplyr::filter(Reporting.Status == 'confirmed')
        CNI.new <- CNI %>% dplyr::filter(grepl("new",Reporting.Status))
        
        CNI.count$Reported <- nrow(CNI.reported)
        CNI.count$Confirmed <- nrow(CNI.confirmed)
        CNI.count$New <- nrow(CNI.new)
        CNI.count$Total <- nrow(CNI)
        CNI.total.reported = nrow(CNI.reported) + nrow(CNI.confirmed)
        CNI.count$Prop.confirmed = CNI.count$Confirmed/CNI.total.reported
        CNI.count$Prop.new <- CNI.count$New/CNI.count$Total
        
        CNI.count$new.2015 <- sum(str_count(CNI.new$Reporting.Status, pattern = "2015"))
        CNI.count$new.2016 <- sum(str_count(CNI.new$Reporting.Status, pattern = "2016"))
        CNI.count$new.2017 <- sum(str_count(CNI.new$Reporting.Status, pattern = "2017"))
        CNI.count$new.2018 <- sum(str_count(CNI.new$Reporting.Status, pattern = "2018"))
        CNI.count$new.2019 <- sum(str_count(CNI.new$Reporting.Status, pattern = "2019"))
        CNI.count$new.2020 <- sum(str_count(CNI.new$Reporting.Status, pattern = "2020"))
        CNI.count$new.2021 <- sum(str_count(CNI.new$Reporting.Status, pattern = "2021"))
        CNI.count$new.prior.2015 <- CNI.count$New - (CNI.count$new.2015+CNI.count$new.2016+CNI.count$new.2017+CNI.count$new.2018+CNI.count$new.2019+CNI.count$new.2020+CNI.count$new.2021)
        
        CNI.count
        
        CNI.count.chronology <- CNI.count %>% pivot_longer(cols = new.2015:new.2021)
        CNI.count.chronology <- CNI.count.chronology %>% dplyr::select(Taxon,name,value)
        
        colnames(CNI.count.chronology)<- c("Taxon","Year","New.spp")
        
        CNI.count.chronology$Year <- as.numeric(substrRight(CNI.count.chronology$Year, 4))
        
        CNI.count.chronology
        
        # Worms (Nemerteans, Platyhelminthes, Chaetognaths, Annelids, Sipunculids)
        
        Taxa.WOR <- c('WOR')
        
        WOR.count <- data.frame(Taxa.WOR,Reported,Confirmed,New,Total,Prop.confirmed,Prop.new)
        names(WOR.count)[names(WOR.count) == 'Taxa.WOR'] <- 'Taxon'
        
        WOR <- ANIMALS %>% dplyr::filter(Stats.Code == 'WOR')
        WOR.reported <- WOR %>% dplyr::filter(Reporting.Status == 'reported')
        WOR.confirmed <- WOR %>% dplyr::filter(Reporting.Status == 'confirmed')
        WOR.new <- WOR %>% dplyr::filter(grepl("new",Reporting.Status))
        
        WOR.count$Reported <- nrow(WOR.reported)
        WOR.count$Confirmed <- nrow(WOR.confirmed)
        WOR.count$New <- nrow(WOR.new)
        WOR.count$Total <- nrow(WOR)
        WOR.total.reported = nrow(WOR.reported) + nrow(WOR.confirmed)
        WOR.count$Prop.confirmed = WOR.count$Confirmed/WOR.total.reported
        WOR.count$Prop.new <- WOR.count$New/WOR.count$Total
        
        WOR.count$new.2015 <- sum(str_count(WOR.new$Reporting.Status, pattern = "2015"))
        WOR.count$new.2016 <- sum(str_count(WOR.new$Reporting.Status, pattern = "2016"))
        WOR.count$new.2017 <- sum(str_count(WOR.new$Reporting.Status, pattern = "2017"))
        WOR.count$new.2018 <- sum(str_count(WOR.new$Reporting.Status, pattern = "2018"))
        WOR.count$new.2019 <- sum(str_count(WOR.new$Reporting.Status, pattern = "2019"))
        WOR.count$new.2020 <- sum(str_count(WOR.new$Reporting.Status, pattern = "2020"))
        WOR.count$new.2021 <- sum(str_count(WOR.new$Reporting.Status, pattern = "2021"))
        WOR.count$new.prior.2015 <- WOR.count$New - (WOR.count$new.2015+WOR.count$new.2016+WOR.count$new.2017+WOR.count$new.2018+WOR.count$new.2019+WOR.count$new.2020+WOR.count$new.2021)
        
        WOR.count
        
        WOR.count.chronology <- WOR.count %>% pivot_longer(cols = new.2015:new.2021)
        WOR.count.chronology <- WOR.count.chronology %>% dplyr::select(Taxon,name,value)
        
        colnames(WOR.count.chronology)<- c("Taxon","Year","New.spp")
        
        WOR.count.chronology$Year <- as.numeric(substrRight(WOR.count.chronology$Year, 4))
        
        WOR.count.chronology
        
        
        # Molluscs
        
        Taxa.MOL <- c('MOL')
        
        MOL.count <- data.frame(Taxa.MOL,Reported,Confirmed,New,Total,Prop.confirmed,Prop.new)
        names(MOL.count)[names(MOL.count) == 'Taxa.MOL'] <- 'Taxon'
        
        MOL <- ANIMALS %>% dplyr::filter(Stats.Code == 'MOL')
        MOL.reported <- MOL %>% dplyr::filter(Reporting.Status == 'reported')
        MOL.confirmed <- MOL %>% dplyr::filter(Reporting.Status == 'confirmed')
        MOL.new <- MOL %>% dplyr::filter(grepl("new",Reporting.Status))
        
        MOL.count$Reported <- nrow(MOL.reported)
        MOL.count$Confirmed <- nrow(MOL.confirmed)
        MOL.count$New <- nrow(MOL.new)
        MOL.count$Total <- nrow(MOL)
        MOL.total.reported = nrow(MOL.reported) + nrow(MOL.confirmed)
        MOL.count$Prop.confirmed = MOL.count$Confirmed/MOL.total.reported
        MOL.count$Prop.new <- MOL.count$New/MOL.count$Total
        
        MOL.count$new.2015 <- sum(str_count(MOL.new$Reporting.Status, pattern = "2015"))
        MOL.count$new.2016 <- sum(str_count(MOL.new$Reporting.Status, pattern = "2016"))
        MOL.count$new.2017 <- sum(str_count(MOL.new$Reporting.Status, pattern = "2017"))
        MOL.count$new.2018 <- sum(str_count(MOL.new$Reporting.Status, pattern = "2018"))
        MOL.count$new.2019 <- sum(str_count(MOL.new$Reporting.Status, pattern = "2019"))
        MOL.count$new.2020 <- sum(str_count(MOL.new$Reporting.Status, pattern = "2020"))
        MOL.count$new.2021 <- sum(str_count(MOL.new$Reporting.Status, pattern = "2021"))
        MOL.count$new.prior.2015 <- MOL.count$New - (MOL.count$new.2015+MOL.count$new.2016+MOL.count$new.2017+MOL.count$new.2018+MOL.count$new.2019+MOL.count$new.2020+MOL.count$new.2021)
        
        MOL.count
        
        MOL.count.chronology <- MOL.count %>% pivot_longer(cols = new.2015:new.2021)
        MOL.count.chronology <- MOL.count.chronology %>% dplyr::select(Taxon,name,value)
        
        colnames(MOL.count.chronology)<- c("Taxon","Year","New.spp")
        
        MOL.count.chronology$Year <- as.numeric(substrRight(MOL.count.chronology$Year, 4))
        
        MOL.count.chronology
        
  
        # Arthropods
        
        Taxa.ART <- c('ART')
        
        ART.count <- data.frame(Taxa.ART,Reported,Confirmed,New,Total,Prop.confirmed,Prop.new)
        names(ART.count)[names(ART.count) == 'Taxa.ART'] <- 'Taxon'
        
        ART <- ANIMALS %>% dplyr::filter(Stats.Code == 'ART')
        ART.reported <- ART %>% dplyr::filter(Reporting.Status == 'reported')
        ART.confirmed <- ART %>% dplyr::filter(Reporting.Status == 'confirmed')
        ART.new <- ART %>% dplyr::filter(grepl("new",Reporting.Status))
        
        ART.count$Reported <- nrow(ART.reported)
        ART.count$Confirmed <- nrow(ART.confirmed)
        ART.count$New <- nrow(ART.new)
        ART.count$Total <- nrow(ART)
        ART.total.reported = nrow(ART.reported) + nrow(ART.confirmed)
        ART.count$Prop.confirmed = ART.count$Confirmed/ART.total.reported
        ART.count$Prop.new <- ART.count$New/ART.count$Total
        
        ART.count$new.2015 <- sum(str_count(ART.new$Reporting.Status, pattern = "2015"))
        ART.count$new.2016 <- sum(str_count(ART.new$Reporting.Status, pattern = "2016"))
        ART.count$new.2017 <- sum(str_count(ART.new$Reporting.Status, pattern = "2017"))
        ART.count$new.2018 <- sum(str_count(ART.new$Reporting.Status, pattern = "2018"))
        ART.count$new.2019 <- sum(str_count(ART.new$Reporting.Status, pattern = "2019"))
        ART.count$new.2020 <- sum(str_count(ART.new$Reporting.Status, pattern = "2020"))
        ART.count$new.2021 <- sum(str_count(ART.new$Reporting.Status, pattern = "2021"))
        ART.count$new.prior.2015 <- ART.count$New - (ART.count$new.2015+ART.count$new.2016+ART.count$new.2017+ART.count$new.2018+ART.count$new.2019+ART.count$new.2020+ART.count$new.2021)
        
        ART.count
        
        ART.count.chronology <- ART.count %>% pivot_longer(cols = new.2015:new.2021)
        ART.count.chronology <- ART.count.chronology %>% dplyr::select(Taxon,name,value)
        
        colnames(ART.count.chronology)<- c("Taxon","Year","New.spp")
        
        ART.count.chronology$Year <- as.numeric(substrRight(ART.count.chronology$Year, 4))
        
        ART.count.chronology
        
        # Lophophores
        
        Taxa.LOP <- c('LOP')
        
        LOP.count <- data.frame(Taxa.LOP,Reported,Confirmed,New,Total,Prop.confirmed,Prop.new)
        names(LOP.count)[names(LOP.count) == 'Taxa.LOP'] <- 'Taxon'
        
        LOP <- ANIMALS %>% dplyr::filter(Stats.Code == 'LOP')
        LOP.reported <- LOP %>% dplyr::filter(Reporting.Status == 'reported')
        LOP.confirmed <- LOP %>% dplyr::filter(Reporting.Status == 'confirmed')
        LOP.new <- LOP %>% dplyr::filter(grepl("new",Reporting.Status))
        
        LOP.count$Reported <- nrow(LOP.reported)
        LOP.count$Confirmed <- nrow(LOP.confirmed)
        LOP.count$New <- nrow(LOP.new)
        LOP.count$Total <- nrow(LOP)
        LOP.total.reported = nrow(LOP.reported) + nrow(LOP.confirmed)
        LOP.count$Prop.confirmed = LOP.count$Confirmed/LOP.total.reported
        LOP.count$Prop.new <- LOP.count$New/LOP.count$Total
        
        LOP.count$new.2015 <- sum(str_count(LOP.new$Reporting.Status, pattern = "2015"))
        LOP.count$new.2016 <- sum(str_count(LOP.new$Reporting.Status, pattern = "2016"))
        LOP.count$new.2017 <- sum(str_count(LOP.new$Reporting.Status, pattern = "2017"))
        LOP.count$new.2018 <- sum(str_count(LOP.new$Reporting.Status, pattern = "2018"))
        LOP.count$new.2019 <- sum(str_count(LOP.new$Reporting.Status, pattern = "2019"))
        LOP.count$new.2020 <- sum(str_count(LOP.new$Reporting.Status, pattern = "2020"))
        LOP.count$new.2021 <- sum(str_count(LOP.new$Reporting.Status, pattern = "2021"))
        LOP.count$new.prior.2015 <- LOP.count$New - (LOP.count$new.2015+LOP.count$new.2016+LOP.count$new.2017+LOP.count$new.2018+LOP.count$new.2019+LOP.count$new.2020+LOP.count$new.2021)
        
        LOP.count
        
        LOP.count.chronology <- LOP.count %>% pivot_longer(cols = new.2015:new.2021)
        LOP.count.chronology <- LOP.count.chronology %>% dplyr::select(Taxon,name,value)
        
        colnames(LOP.count.chronology)<- c("Taxon","Year","New.spp")
        
        LOP.count.chronology$Year <- as.numeric(substrRight(LOP.count.chronology$Year, 4))
        
        LOP.count.chronology
        
  
        # Echinoderms
        
        Taxa.ECH <- c('ECH')
        
        ECH.count <- data.frame(Taxa.ECH,Reported,Confirmed,New,Total,Prop.confirmed,Prop.new)
        names(ECH.count)[names(ECH.count) == 'Taxa.ECH'] <- 'Taxon'
        
        ECH <- ANIMALS %>% dplyr::filter(Stats.Code == 'ECH')
        ECH.reported <- ECH %>% dplyr::filter(Reporting.Status == 'reported')
        ECH.confirmed <- ECH %>% dplyr::filter(Reporting.Status == 'confirmed')
        ECH.new <- ECH %>% dplyr::filter(grepl("new",Reporting.Status))
        
        ECH.count$Reported <- nrow(ECH.reported)
        ECH.count$Confirmed <- nrow(ECH.confirmed)
        ECH.count$New <- nrow(ECH.new)
        ECH.count$Total <- nrow(ECH)
        ECH.total.reported = nrow(ECH.reported) + nrow(ECH.confirmed)
        ECH.count$Prop.confirmed = ECH.count$Confirmed/ECH.total.reported
        ECH.count$Prop.new <- ECH.count$New/ECH.count$Total
        
        ECH.count$new.2015 <- sum(str_count(ECH.new$Reporting.Status, pattern = "2015"))
        ECH.count$new.2016 <- sum(str_count(ECH.new$Reporting.Status, pattern = "2016"))
        ECH.count$new.2017 <- sum(str_count(ECH.new$Reporting.Status, pattern = "2017"))
        ECH.count$new.2018 <- sum(str_count(ECH.new$Reporting.Status, pattern = "2018"))
        ECH.count$new.2019 <- sum(str_count(ECH.new$Reporting.Status, pattern = "2019"))
        ECH.count$new.2020 <- sum(str_count(ECH.new$Reporting.Status, pattern = "2020"))
        ECH.count$new.2021 <- sum(str_count(ECH.new$Reporting.Status, pattern = "2021"))
        ECH.count$new.prior.2015 <- ECH.count$New - (ECH.count$new.2015+ECH.count$new.2016+ECH.count$new.2017+ECH.count$new.2018+ECH.count$new.2019+ECH.count$new.2020+ECH.count$new.2021)
        
        ECH.count
        
        ECH.count.chronology <- ECH.count %>% pivot_longer(cols = new.2015:new.2021)
        ECH.count.chronology <- ECH.count.chronology %>% dplyr::select(Taxon,name,value)
        
        colnames(ECH.count.chronology)<- c("Taxon","Year","New.spp")
        
        ECH.count.chronology$Year <- as.numeric(substrRight(ECH.count.chronology$Year, 4))
        
        ECH.count.chronology
        
        
        # Tunicata
        
        Taxa.TUN <- c('TUN')
        
        TUN.count <- data.frame(Taxa.TUN,Reported,Confirmed,New,Total,Prop.confirmed,Prop.new)
        names(TUN.count)[names(TUN.count) == 'Taxa.TUN'] <- 'Taxon'
        
        TUN <- ANIMALS %>% dplyr::filter(Stats.Code == 'TUN')
        TUN.reported <- TUN %>% dplyr::filter(Reporting.Status == 'reported')
        TUN.confirmed <- TUN %>% dplyr::filter(Reporting.Status == 'confirmed')
        TUN.new <- TUN %>% dplyr::filter(grepl("new",Reporting.Status))
        
        TUN.count$Reported <- nrow(TUN.reported)
        TUN.count$Confirmed <- nrow(TUN.confirmed)
        TUN.count$New <- nrow(TUN.new)
        TUN.count$Total <- nrow(TUN)
        TUN.total.reported = nrow(TUN.reported) + nrow(TUN.confirmed)
        TUN.count$Prop.confirmed = TUN.count$Confirmed/TUN.total.reported
        TUN.count$Prop.new <- TUN.count$New/TUN.count$Total
        
        TUN.count$new.2015 <- sum(str_count(TUN.new$Reporting.Status, pattern = "2015"))
        TUN.count$new.2016 <- sum(str_count(TUN.new$Reporting.Status, pattern = "2016"))
        TUN.count$new.2017 <- sum(str_count(TUN.new$Reporting.Status, pattern = "2017"))
        TUN.count$new.2018 <- sum(str_count(TUN.new$Reporting.Status, pattern = "2018"))
        TUN.count$new.2019 <- sum(str_count(TUN.new$Reporting.Status, pattern = "2019"))
        TUN.count$new.2020 <- sum(str_count(TUN.new$Reporting.Status, pattern = "2020"))
        TUN.count$new.2021 <- sum(str_count(TUN.new$Reporting.Status, pattern = "2021"))
        TUN.count$new.prior.2015 <- TUN.count$New - (TUN.count$new.2015+TUN.count$new.2016+TUN.count$new.2017+TUN.count$new.2018+TUN.count$new.2019+TUN.count$new.2020+TUN.count$new.2021)
        
        TUN.count
        
        TUN.count.chronology <- TUN.count %>% pivot_longer(cols = new.2015:new.2021)
        TUN.count.chronology <- TUN.count.chronology %>% dplyr::select(Taxon,name,value)
        
        colnames(TUN.count.chronology)<- c("Taxon","Year","New.spp")
        
        TUN.count.chronology$Year <- as.numeric(substrRight(TUN.count.chronology$Year, 4))
        
        TUN.count.chronology
        
        # Fish
        
        Taxa.FIS <- c('FIS')
        
        FIS.count <- data.frame(Taxa.FIS,Reported,Confirmed,New,Total,Prop.confirmed,Prop.new)
        names(FIS.count)[names(FIS.count) == 'Taxa.FIS'] <- 'Taxon'
        
        FIS <- ANIMALS %>% dplyr::filter(Stats.Code == 'FIS')
        FIS.reported <- FIS %>% dplyr::filter(Reporting.Status == 'reported')
        FIS.confirmed <- FIS %>% dplyr::filter(Reporting.Status == 'confirmed')
        FIS.new <- FIS %>% dplyr::filter(grepl("new",Reporting.Status))
        
        FIS.count$Reported <- nrow(FIS.reported)
        FIS.count$Confirmed <- nrow(FIS.confirmed)
        FIS.count$New <- nrow(FIS.new)
        FIS.count$Total <- nrow(FIS)
        FIS.total.reported = nrow(FIS.reported) + nrow(FIS.confirmed)
        FIS.count$Prop.confirmed = FIS.count$Confirmed/FIS.total.reported
        FIS.count$Prop.new <- FIS.count$New/FIS.count$Total
        
        FIS.count$new.2015 <- sum(str_count(FIS.new$Reporting.Status, pattern = "2015"))
        FIS.count$new.2016 <- sum(str_count(FIS.new$Reporting.Status, pattern = "2016"))
        FIS.count$new.2017 <- sum(str_count(FIS.new$Reporting.Status, pattern = "2017"))
        FIS.count$new.2018 <- sum(str_count(FIS.new$Reporting.Status, pattern = "2018"))
        FIS.count$new.2019 <- sum(str_count(FIS.new$Reporting.Status, pattern = "2019"))
        FIS.count$new.2020 <- sum(str_count(FIS.new$Reporting.Status, pattern = "2020"))
        FIS.count$new.2021 <- sum(str_count(FIS.new$Reporting.Status, pattern = "2021"))
        FIS.count$new.prior.2015 <- FIS.count$New - (FIS.count$new.2015+FIS.count$new.2016+FIS.count$new.2017+FIS.count$new.2018+FIS.count$new.2019+FIS.count$new.2020+FIS.count$new.2021)
        
        FIS.count
        
        FIS.count.chronology <- FIS.count %>% pivot_longer(cols = new.2015:new.2021)
        FIS.count.chronology <- FIS.count.chronology %>% dplyr::select(Taxon,name,value)
        
        colnames(FIS.count.chronology)<- c("Taxon","Year","New.spp")
        
        FIS.count.chronology$Year <- as.numeric(substrRight(FIS.count.chronology$Year, 4))
        
        FIS.count.chronology
        
        # Herptiles
        
        Taxa.HER <- c('HER')
        
        HER.count <- data.frame(Taxa.HER,Reported,Confirmed,New,Total,Prop.confirmed,Prop.new)
        names(HER.count)[names(HER.count) == 'Taxa.HER'] <- 'Taxon'
        
        HER <- ANIMALS %>% dplyr::filter(Stats.Code == 'HER')
        HER.reported <- HER %>% dplyr::filter(Reporting.Status == 'reported')
        HER.confirmed <- HER %>% dplyr::filter(Reporting.Status == 'confirmed')
        HER.new <- HER %>% dplyr::filter(grepl("new",Reporting.Status))
        
        HER.count$Reported <- nrow(HER.reported)
        HER.count$Confirmed <- nrow(HER.confirmed)
        HER.count$New <- nrow(HER.new)
        HER.count$Total <- nrow(HER)
        HER.total.reported = nrow(HER.reported) + nrow(HER.confirmed)
        HER.count$Prop.confirmed = HER.count$Confirmed/HER.total.reported
        HER.count$Prop.new <- HER.count$New/HER.count$Total
        
        HER.count$new.2015 <- sum(str_count(HER.new$Reporting.Status, pattern = "2015"))
        HER.count$new.2016 <- sum(str_count(HER.new$Reporting.Status, pattern = "2016"))
        HER.count$new.2017 <- sum(str_count(HER.new$Reporting.Status, pattern = "2017"))
        HER.count$new.2018 <- sum(str_count(HER.new$Reporting.Status, pattern = "2018"))
        HER.count$new.2019 <- sum(str_count(HER.new$Reporting.Status, pattern = "2019"))
        HER.count$new.2020 <- sum(str_count(HER.new$Reporting.Status, pattern = "2020"))
        HER.count$new.2021 <- sum(str_count(HER.new$Reporting.Status, pattern = "2021"))
        HER.count$new.prior.2015 <- HER.count$New - (HER.count$new.2015+HER.count$new.2016+HER.count$new.2017+HER.count$new.2018+HER.count$new.2019+HER.count$new.2020+HER.count$new.2021)
        
        HER.count
        
        HER.count.chronology <- HER.count %>% pivot_longer(cols = new.2015:new.2021)
        HER.count.chronology <- HER.count.chronology %>% dplyr::select(Taxon,name,value)
        
        colnames(HER.count.chronology)<- c("Taxon","Year","New.spp")
        
        HER.count.chronology$Year <- as.numeric(substrRight(HER.count.chronology$Year, 4))
        
        HER.count.chronology
        
        # Birds
        
        Taxa.BIR <- c('BIR')
        
        BIR.count <- data.frame(Taxa.BIR,Reported,Confirmed,New,Total,Prop.confirmed,Prop.new)
        names(BIR.count)[names(BIR.count) == 'Taxa.BIR'] <- 'Taxon'
        
        BIR <- ANIMALS %>% dplyr::filter(Stats.Code == 'BIR')
        BIR.reported <- BIR %>% dplyr::filter(Reporting.Status == 'reported')
        BIR.confirmed <- BIR %>% dplyr::filter(Reporting.Status == 'confirmed')
        BIR.new <- BIR %>% dplyr::filter(grepl("new",Reporting.Status))
        
        BIR.count$Reported <- nrow(BIR.reported)
        BIR.count$Confirmed <- nrow(BIR.confirmed)
        BIR.count$New <- nrow(BIR.new)
        BIR.count$Total <- nrow(BIR)
        BIR.total.reported = nrow(BIR.reported) + nrow(BIR.confirmed)
        BIR.count$Prop.confirmed = BIR.count$Confirmed/BIR.total.reported
        BIR.count$Prop.new <- BIR.count$New/BIR.count$Total
        
        BIR.count$new.2015 <- sum(str_count(BIR.new$Reporting.Status, pattern = "2015"))
        BIR.count$new.2016 <- sum(str_count(BIR.new$Reporting.Status, pattern = "2016"))
        BIR.count$new.2017 <- sum(str_count(BIR.new$Reporting.Status, pattern = "2017"))
        BIR.count$new.2018 <- sum(str_count(BIR.new$Reporting.Status, pattern = "2018"))
        BIR.count$new.2019 <- sum(str_count(BIR.new$Reporting.Status, pattern = "2019"))
        BIR.count$new.2020 <- sum(str_count(BIR.new$Reporting.Status, pattern = "2020"))
        BIR.count$new.2021 <- sum(str_count(BIR.new$Reporting.Status, pattern = "2021"))
        BIR.count$new.prior.2015 <- BIR.count$New - (BIR.count$new.2015+BIR.count$new.2016+BIR.count$new.2017+BIR.count$new.2018+BIR.count$new.2019+BIR.count$new.2020+BIR.count$new.2021)
        
        BIR.count
        
        BIR.count.chronology <- BIR.count %>% pivot_longer(cols = new.2015:new.2021)
        BIR.count.chronology <- BIR.count.chronology %>% dplyr::select(Taxon,name,value)
        
        colnames(BIR.count.chronology)<- c("Taxon","Year","New.spp")
        
        BIR.count.chronology$Year <- as.numeric(substrRight(BIR.count.chronology$Year, 4))
        
        BIR.count.chronology
        
        # Mammals
        
        Taxa.MAM <- c('MAM')
        
        MAM.count <- data.frame(Taxa.MAM,Reported,Confirmed,New,Total,Prop.confirmed,Prop.new)
        names(MAM.count)[names(MAM.count) == 'Taxa.MAM'] <- 'Taxon'
        
        MAM <- ANIMALS %>% dplyr::filter(Stats.Code == 'MAM')
        MAM.reported <- MAM %>% dplyr::filter(Reporting.Status == 'reported')
        MAM.confirmed <- MAM %>% dplyr::filter(Reporting.Status == 'confirmed')
        MAM.new <- MAM %>% dplyr::filter(grepl("new",Reporting.Status))
        
        MAM.count$Reported <- nrow(MAM.reported)
        MAM.count$Confirmed <- nrow(MAM.confirmed)
        MAM.count$New <- nrow(MAM.new)
        MAM.count$Total <- nrow(MAM)
        MAM.total.reported = nrow(MAM.reported) + nrow(MAM.confirmed)
        MAM.count$Prop.confirmed = MAM.count$Confirmed/MAM.total.reported
        MAM.count$Prop.new <- MAM.count$New/MAM.count$Total
        
        MAM.count$new.2015 <- sum(str_count(MAM.new$Reporting.Status, pattern = "2015"))
        MAM.count$new.2016 <- sum(str_count(MAM.new$Reporting.Status, pattern = "2016"))
        MAM.count$new.2017 <- sum(str_count(MAM.new$Reporting.Status, pattern = "2017"))
        MAM.count$new.2018 <- sum(str_count(MAM.new$Reporting.Status, pattern = "2018"))
        MAM.count$new.2019 <- sum(str_count(MAM.new$Reporting.Status, pattern = "2019"))
        MAM.count$new.2020 <- sum(str_count(MAM.new$Reporting.Status, pattern = "2020"))
        MAM.count$new.2021 <- sum(str_count(MAM.new$Reporting.Status, pattern = "2021"))
        MAM.count$new.prior.2015 <- MAM.count$New - (MAM.count$new.2015+MAM.count$new.2016+MAM.count$new.2017+MAM.count$new.2018+MAM.count$new.2019+MAM.count$new.2020+MAM.count$new.2021)
        
        MAM.count
        
        MAM.count.chronology <- MAM.count %>% pivot_longer(cols = new.2015:new.2021)
        MAM.count.chronology <- MAM.count.chronology %>% dplyr::select(Taxon,name,value)
        
        colnames(MAM.count.chronology)<- c("Taxon","Year","New.spp")
        
        MAM.count.chronology$Year <- as.numeric(substrRight(MAM.count.chronology$Year, 4))
        
        MAM.count.chronology

## Synthesize summary stats for all phyla

BioGaliano.Summary.Stats <- rbind(BAC.count,PRO.count,FUN.count,LIC.count,ALG.count,BRY.count,VAS.count,POR.count,CNI.count,WOR.count,MOL.count,ART.count,LOP.count,ECH.count,TUN.count,FIS.count,HER.count,BIR.count,MAM.count)

BioGaliano.Summary.Stats <- as.data.frame(BioGaliano.Summary.Stats)

BioGaliano.Summary.Stats

## Add total summary row

new.prior.2015 <- NA
new.2015 <- NA
new.2016 <- NA
new.2017 <- NA
new.2018 <- NA
new.2019 <- NA
new.2020 <- NA
new.2021 <- NA

TAXON.TOTAL <- c('TOTAL')
TOTAL.count <- data.frame(TAXON.TOTAL,Reported,Confirmed,New,Total,Prop.confirmed,Prop.new,new.2015,new.2016,new.2017,new.2018,new.2019,new.2020,new.2021,new.prior.2015)
names(TOTAL.count)[names(TOTAL.count) == 'TAXON.TOTAL'] <- 'Taxon'

TOTAL.count$Reported <- sum(BioGaliano.Summary.Stats$Reported)
TOTAL.count$Confirmed <- sum(BioGaliano.Summary.Stats$Confirmed)
TOTAL.count$New <- sum(BioGaliano.Summary.Stats$New)
TOTAL.count$Total <- sum(BioGaliano.Summary.Stats$Total)
TOTAL.total.reported = TOTAL.count$Reported + TOTAL.count$Confirmed
TOTAL.count$Prop.confirmed = TOTAL.count$Confirmed/TOTAL.total.reported
TOTAL.count$Prop.new = TOTAL.count$New/TOTAL.count$Total
TOTAL.count$new.prior.2015 <- sum(BioGaliano.Summary.Stats$new.prior.2015)
TOTAL.count$new.2015 <- sum(BioGaliano.Summary.Stats$new.2015)
TOTAL.count$new.2016 <- sum(BioGaliano.Summary.Stats$new.2016)
TOTAL.count$new.2017 <- sum(BioGaliano.Summary.Stats$new.2017)
TOTAL.count$new.2018 <- sum(BioGaliano.Summary.Stats$new.2018)
TOTAL.count$new.2019 <- sum(BioGaliano.Summary.Stats$new.2019)
TOTAL.count$new.2020 <- sum(BioGaliano.Summary.Stats$new.2020)
TOTAL.count$new.2021 <- sum(BioGaliano.Summary.Stats$new.2021)

# Add Total to Summary 

BioGaliano.Summary.Stats <- rbind(BioGaliano.Summary.Stats,TOTAL.count)

dev.off()
grid.table(BioGaliano.Summary.Stats)


# write.csv(BioGaliano.Summary.Stats, "Biodiversity_Galiano_Island_2021_summary_statistics.csv")

## Plot total species counts as stacked bar plot

## First rename taxa

BioGaliano.Summary.Stats$Taxon <- as.character(BioGaliano.Summary.Stats$Taxon)

BioGaliano.Summary.Stats$Taxon[BioGaliano.Summary.Stats$Taxon == 'BAC'] <- 'Bacteria'
BioGaliano.Summary.Stats$Taxon[BioGaliano.Summary.Stats$Taxon == 'PRO'] <- 'Protozoa'
BioGaliano.Summary.Stats$Taxon[BioGaliano.Summary.Stats$Taxon == 'FUN'] <- 'Fungi'
BioGaliano.Summary.Stats$Taxon[BioGaliano.Summary.Stats$Taxon == 'LIC'] <- 'Lichens'
BioGaliano.Summary.Stats$Taxon[BioGaliano.Summary.Stats$Taxon == 'ALG'] <- 'Algae'
BioGaliano.Summary.Stats$Taxon[BioGaliano.Summary.Stats$Taxon == 'BRY'] <- 'Bryophytes'
BioGaliano.Summary.Stats$Taxon[BioGaliano.Summary.Stats$Taxon == 'VAS'] <- 'Vascular plants'
BioGaliano.Summary.Stats$Taxon[BioGaliano.Summary.Stats$Taxon == 'POR'] <- 'Sponges'
BioGaliano.Summary.Stats$Taxon[BioGaliano.Summary.Stats$Taxon == 'CNI'] <- 'Cnidarians and Ctenophores'
BioGaliano.Summary.Stats$Taxon[BioGaliano.Summary.Stats$Taxon == 'WOR'] <- 'Worms'
BioGaliano.Summary.Stats$Taxon[BioGaliano.Summary.Stats$Taxon == 'MOL'] <- 'Molluscs'
BioGaliano.Summary.Stats$Taxon[BioGaliano.Summary.Stats$Taxon == 'ART'] <- 'Arthropods'
BioGaliano.Summary.Stats$Taxon[BioGaliano.Summary.Stats$Taxon == 'LOP'] <- 'Lophophores'
BioGaliano.Summary.Stats$Taxon[BioGaliano.Summary.Stats$Taxon == 'ECH'] <- 'Echinoderms'
BioGaliano.Summary.Stats$Taxon[BioGaliano.Summary.Stats$Taxon == 'TUN'] <- 'Tunicates'
BioGaliano.Summary.Stats$Taxon[BioGaliano.Summary.Stats$Taxon == 'FIS'] <- 'Fish'
BioGaliano.Summary.Stats$Taxon[BioGaliano.Summary.Stats$Taxon == 'HER'] <- 'Herptiles'
BioGaliano.Summary.Stats$Taxon[BioGaliano.Summary.Stats$Taxon == 'BIR'] <- 'Birds'
BioGaliano.Summary.Stats$Taxon[BioGaliano.Summary.Stats$Taxon == 'MAM'] <- 'Mammals'

BioGaliano.Summary.Stats$Taxon <- as.factor(BioGaliano.Summary.Stats$Taxon)

# Now subset to only the relevant columns and rows

BioGaliano.Summary.Stats.Basic <- BioGaliano.Summary.Stats %>% dplyr::select(Taxon,Reported,Confirmed,New)

BioGaliano.Summary.Stats.Basic <- BioGaliano.Summary.Stats.Basic %>% pivot_longer(cols = Reported:New)

colnames(BioGaliano.Summary.Stats.Basic)<- c('Taxon','Reporting_Status','Count')

BioGaliano.Summary.Stats.Basic <- BioGaliano.Summary.Stats.Basic %>% filter(!(Taxon == 'TOTAL'))

## Plot results

BioGaliano.Summary.Stats.Basic$Reporting_Status <- factor(BioGaliano.Summary.Stats.Basic$Reporting_Status, levels = c("New","Confirmed","Reported"))
BioGaliano.Summary.Stats.Basic$Taxon <- factor(BioGaliano.Summary.Stats.Basic$Taxon, levels = c("Bacteria","Protozoa","Fungi","Lichens","Algae","Bryophytes","Vascular plants","Sponges","Cnidarians and Ctenophores","Worms","Molluscs","Arthropods","Lophophores","Echinoderms","Tunicates","Fish","Herptiles","Birds","Mammals"))

p <- ggplot(BioGaliano.Summary.Stats.Basic, aes(fill=Reporting_Status, y=Count, x=Taxon)) 
p <- p + geom_bar(position="stack", stat="identity")
p <- p + coord_flip()
p <- p + scale_fill_viridis(discrete = TRUE, direction = -1, option = 'A')
p <- p + ggtitle('Biodiversity Galiano Island Species Count')
p <- p + xlab('Taxonomic Group')
p <- p + ylab('Species')
p <- p + theme(text=element_text(size=14,family="Calibri"))
p

## Synthesize and plot summary stats of annual progress

BioGaliano.Timeline.Summary <-  rbind(BAC.count.chronology,PRO.count.chronology,FUN.count.chronology,LIC.count.chronology,ALG.count.chronology,BRY.count.chronology,VAS.count.chronology,POR.count.chronology,CNI.count.chronology,WOR.count.chronology,MOL.count.chronology,ART.count.chronology,LOP.count.chronology,ECH.count.chronology,TUN.count.chronology,FIS.count.chronology,HER.count.chronology,BIR.count.chronology,MAM.count.chronology)

BioGaliano.Timeline.Summary$Taxon <- as.character(BioGaliano.Timeline.Summary$Taxon)

BioGaliano.Timeline.Summary$Taxon[BioGaliano.Timeline.Summary$Taxon == 'BAC'] <- 'Bacteria'
BioGaliano.Timeline.Summary$Taxon[BioGaliano.Timeline.Summary$Taxon == 'PRO'] <- 'Protozoa'
BioGaliano.Timeline.Summary$Taxon[BioGaliano.Timeline.Summary$Taxon == 'FUN'] <- 'Fungi'
BioGaliano.Timeline.Summary$Taxon[BioGaliano.Timeline.Summary$Taxon == 'LIC'] <- 'Lichens'
BioGaliano.Timeline.Summary$Taxon[BioGaliano.Timeline.Summary$Taxon == 'ALG'] <- 'Algae'
BioGaliano.Timeline.Summary$Taxon[BioGaliano.Timeline.Summary$Taxon == 'BRY'] <- 'Bryophytes'
BioGaliano.Timeline.Summary$Taxon[BioGaliano.Timeline.Summary$Taxon == 'VAS'] <- 'Vascular plants'
BioGaliano.Timeline.Summary$Taxon[BioGaliano.Timeline.Summary$Taxon == 'POR'] <- 'Sponges'
BioGaliano.Timeline.Summary$Taxon[BioGaliano.Timeline.Summary$Taxon == 'CNI'] <- 'Cnidarians and Ctenophores'
BioGaliano.Timeline.Summary$Taxon[BioGaliano.Timeline.Summary$Taxon == 'WOR'] <- 'Worms'
BioGaliano.Timeline.Summary$Taxon[BioGaliano.Timeline.Summary$Taxon == 'MOL'] <- 'Molluscs'
BioGaliano.Timeline.Summary$Taxon[BioGaliano.Timeline.Summary$Taxon == 'ART'] <- 'Arthropods'
BioGaliano.Timeline.Summary$Taxon[BioGaliano.Timeline.Summary$Taxon == 'LOP'] <- 'Lophophores'
BioGaliano.Timeline.Summary$Taxon[BioGaliano.Timeline.Summary$Taxon == 'ECH'] <- 'Echinoderms'
BioGaliano.Timeline.Summary$Taxon[BioGaliano.Timeline.Summary$Taxon == 'TUN'] <- 'Tunicates'
BioGaliano.Timeline.Summary$Taxon[BioGaliano.Timeline.Summary$Taxon == 'FIS'] <- 'Fish'
BioGaliano.Timeline.Summary$Taxon[BioGaliano.Timeline.Summary$Taxon == 'HER'] <- 'Herptiles'
BioGaliano.Timeline.Summary$Taxon[BioGaliano.Timeline.Summary$Taxon == 'BIR'] <- 'Birds'
BioGaliano.Timeline.Summary$Taxon[BioGaliano.Timeline.Summary$Taxon == 'MAM'] <- 'Mammals'

BioGaliano.Timeline.Summary$Taxon <- as.factor(BioGaliano.Timeline.Summary$Taxon)

BioGaliano.Timeline.Summary$Taxon <- factor(BioGaliano.Timeline.Summary$Taxon, levels = c("Bacteria","Protozoa","Fungi","Lichens","Algae","Bryophytes","Vascular plants","Sponges","Cnidarians and Ctenophores","Worms","Molluscs","Arthropods","Lophophores","Echinoderms","Tunicates","Fish","Herptiles","Birds","Mammals"))

BioGaliano.Timeline.Summary <- BioGaliano.Summary.Stats.Basic %>% pivot_longer(cols = Reported:New)

## Plot results

p <- ggplot(BioGaliano.Timeline.Summary, aes(fill=Year, y=New.spp, x=Taxon)) 
p <- p + geom_bar(position="stack", stat="identity")
p <- p + coord_flip()
p <- p + scale_fill_viridis(option = 'A')
p <- p + ggtitle('Biodiversity Galiano Island - novel species reports (2015-2021)')
p <- p + xlab('Taxonomic Group')
p <- p + ylab('New Species')
p <- p + theme(text=element_text(size=14,family="Calibri"))
p
