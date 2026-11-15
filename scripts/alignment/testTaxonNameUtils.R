## Test driver for taxonNameUtils.R: checks split_scientific_name and split_scientific_names
## against the cases in taxonNameFixtures.csv.
##
##   Rscript scripts/alignment/testTaxonNameUtils.R
##
## Exits with status 1 if any case fails.

args <- commandArgs(trailingOnly = FALSE)
script_path <- gsub("~+~", " ", sub("^--file=", "", args[grep("^--file=", args)]), fixed = TRUE)
here <- if (length(script_path)) dirname(normalizePath(script_path)) else "scripts/alignment"

source(file.path(here, "taxonNameUtils.R"))

fixtures <- read.csv(file.path(here, "taxonNameFixtures.csv"), encoding = "UTF-8", strip.white = FALSE,
                     na.strings = "", stringsAsFactors = FALSE, colClasses = "character")

same <- function(a, b) (is.na(a) & is.na(b)) | (!is.na(a) & !is.na(b) & a == b)

# Scalar form, case by case
failures <- 0
for (i in seq_len(nrow(fixtures))) {
  f <- fixtures[i, ]
  got <- split_scientific_name(f$input)
  ok <- same(got[1], f$expected_name) && same(got[2], f$expected_authority)
  if (!ok) {
    failures <- failures + 1
    cat(sprintf("FAIL  %-45s %s\n      expected: [%s] [%s]\n      got:      [%s] [%s]\n", f$case,
                encodeString(f$input, quote = "\""), f$expected_name, f$expected_authority, got[1], got[2]))
  } else cat(sprintf("ok    %s\n", f$case))
}

# Vectorised form must agree with the scalar one, including on repeated and missing inputs
inputs <- c(fixtures$input, rev(fixtures$input), NA)
vec <- split_scientific_names(inputs)
expected <- rbind(cbind(fixtures$expected_name, fixtures$expected_authority),
                  cbind(rev(fixtures$expected_name), rev(fixtures$expected_authority)),
                  c(NA, NA))
vec_ok <- all(same(vec, expected))
if (!vec_ok) failures <- failures + 1
cat(sprintf("%s  split_scientific_names agrees on %d inputs (repeated + NA)\n", if (vec_ok) "ok  " else "FAIL", length(inputs)))

cat(sprintf("\n%d of %d checks passed\n", nrow(fixtures) + 1 - failures, nrow(fixtures) + 1))
if (failures > 0) quit(status = 1)
