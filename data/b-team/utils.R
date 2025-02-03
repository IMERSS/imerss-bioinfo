library(googledrive)
library(data.table)
library(readxl)

timedRead <- function (toread) {
  start <- Sys.time()
  frame <- read.csv(toread)
  end <- Sys.time()
  cat("Read ", nrow(frame), " rows from ", toread, " in ", (end - start), "s")
  frame
}

timedFread <- function (toread) {
  start <- Sys.time()
  frame <- data.table::fread(toread, fill = TRUE, na.strings="")
  end <- Sys.time()
  cat("Read ", nrow(frame), " rows from ", toread, " in ", (end - start), "s")
  # Otherwise traditional R indexing notation fails
  as.data.frame(frame)
}

timedReadXslx <- function (toread) {
  start <- Sys.time()
  frame <- read_xlsx(toread, col_types = "text")
  end <- Sys.time()
  cat("Read ", nrow(frame), " rows from ", toread, " in ", (end - start), "s")
  frame
}

timedWrite <- function (x, towrite) {
  start <- Sys.time()
  # Approach for selective quoting taken from https://stackoverflow.com/a/25810538/1381443
  commas <- which(sapply(x, function(y) any(grepl(",",y))))
  write.csv(x, towrite, na = "", row.names = FALSE, quote = commas)
  end <- Sys.time()
  cat("Written ", nrow(x), " rows to ", towrite, " in ", (end - start), "s")
}

downloadGdrive <- function (id, file_path) {
    if (!file.exists(file_path)) {
        drive_download(as_id(id), path = file_path, overwrite = FALSE)
    }
}
