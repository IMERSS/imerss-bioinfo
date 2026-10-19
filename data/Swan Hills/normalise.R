# Normalise the Swan Hills lichens summary
# - Add scientificName, normalised from `taxon`
# - Add phylum = "Ascomycota"

infile  <- "Swan-Hills-Lichens-summary.csv"
outfile <- "Swan-Hills-Lichens-summary-normalised.csv"

df <- read.csv(infile, stringsAsFactors = FALSE, check.names = FALSE)

# Normalise a single taxon string.
# Split into whitespace-separated segments and drop any segment that is
# single- or double-quoted, contains a digit, or contains "Chemotype".
normalise_taxon <- function(taxon) {
  segments <- strsplit(taxon, "\\s+")[[1]]
  
  drop <- grepl("'", segments, fixed = TRUE) |   # single-quoted
    grepl('"', segments, fixed = TRUE) |   # double-quoted
    grepl("[0-9]", segments)           |   # contains a number
    grepl("Chemotype", segments)           # contains "Chemotype"
  
  kept <- segments[!drop]
  
  # Rejoin and trim any excess whitespace
  cleaned <- paste(kept, collapse = " ")
  cleaned <- trimws(gsub("\\s+", " ", cleaned))
  cleaned
}

df$scientificName <- vapply(df$taxon, normalise_taxon, character(1), USE.NAMES = FALSE)
df$phylum <- "Ascomycota"

write.csv(df, outfile, row.names = FALSE, na = "NA")