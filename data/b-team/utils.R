library(googledrive)
library(data.table)

timedRead <- function (toread) {
  start <- Sys.time()
  frame <- read.csv(toread)
  end <- Sys.time()
  cat("Read ", nrow(frame), " rows from ", toread, " in ", (end - start), "s")
  frame
}

timedFread <- function (toread) {
  start <- Sys.time()
  frame <- data.table::fread(toread)
  end <- Sys.time()
  cat("Read ", nrow(frame), " rows from ", toread, " in ", (end - start), "s")
  # Otherwise traditional R indexing notation fails
  as.data.frame(frame)
}

timedWrite <- function (x, towrite) {
  start <- Sys.time()
  write.csv(x, towrite, na = "", row.names = FALSE)
  end <- Sys.time()
  cat("Written ", nrow(x), " rows to ", towrite, " in ", (end - start), "s")
}

downloadGdrive <- function (id, file_path) {
    if (!file.exists(file_path)) {
        drive_download(as_id(id), path = file_path, overwrite = FALSE)
    }
}
