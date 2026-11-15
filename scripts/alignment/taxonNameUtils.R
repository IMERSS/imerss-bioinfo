## Utilities for aligning occurrence catalogues (GBIF, iNaturalist) with regional checklists.
## Used by the Saanich 2026 fusion scripts; split_scientific_name is duplicated in
## checklist-catalogue-alignment-workflow/scripts/functions/utils.R.

# Lowercase words that begin an authority rather than continuing the name (e.g. "de Candolle")
authority_particles <- c("de", "van", "von", "ter", "des", "du", "hort.", "hort")

# Split a scientific name such as "Drosera × anglica Huds." or "Carex macloviana d'Urv." into
# c(name, authority). The authority starts at the first word after the genus that does not begin
# with a lowercase letter (or is a particle such as "de"). Hybrid markers ("×" or "x", standalone
# or prefixed as in "×Elyleymus") are part of the name, and so is the epithet that follows them.
# Whitespace in the name is normalised. Returns c(name, NA) when there is no authority.
split_scientific_name <- function(name) {
  if (is.na(name)) return(c(NA_character_, NA_character_))
  words <- strsplit(trimws(name), " +")[[1]]
  if (length(words) < 2) return(c(paste(words, collapse = " "), NA_character_))
  is_hybrid <- words %in% c("×", "x") | startsWith(words, "×")
  starts_auth <- !is_hybrid & (grepl("^[^a-z]", words) | words %in% authority_particles |
                               grepl("^[a-z]+'", words))
  # The genus, including a separated nothogenus marker as in "× Elyleymus", is never the authority
  starts_auth[seq_len(if (is_hybrid[1]) 2 else 1)] <- FALSE
  auth_idx <- which(starts_auth)
  if (length(auth_idx) == 0) return(c(paste(words, collapse = " "), NA_character_))
  i <- auth_idx[1]
  c(paste(words[1:(i - 1)], collapse = " "), paste(words[i:length(words)], collapse = " "))
}

# Vectorised form: returns a two-column character matrix (name, authority), computing each
# distinct input once
split_scientific_names <- function(names) {
  uniq <- unique(names)
  split <- matrix(unlist(lapply(uniq, split_scientific_name)), ncol = 2, byrow = TRUE)
  split[match(names, uniq), , drop = FALSE]
}
