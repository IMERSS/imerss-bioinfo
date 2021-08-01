This file documents the full data pipeline necessary to reproduce the data
pipeline responsible for exporting catalogue and summary data for Volume I
of the Galiano Data Paper, given the raw upstream catalogue data and curated
summaries as input.

Firstly, clone and install this repository using instructions listed in
[README.md], reproduced here:

## Install dependencies and clone repository

After [installing git](https://git-scm.com/book/en/v2/Getting-Started-Installing-Git) to check out this repository via

    git clone IMERSS/imerss-biodata

, and then installing node.js from its [download](https://nodejs.org/en/download/), you can install the pipeline's
dependencies by running

    npm install

in the checkout directory.

## Run forward synthesis from catalogues

This step accepts all the raw upstream catalogues and synthesizes them into
normalised catalogues and summaries in a common format, after filtering and
patching the data. This repository contains all historical versions of the
catalogues used during development of the paper, but the particular versions
used in this analysis are the ones referenced in the "fusion" file 
[data/dataPaper-I/fusion.json5].

    node src/taxonomise.js --fusion data/dataPaper-I/fusion.json5
    
The outputs of this step are the catalogue file 
[data/dataPaper-I/reintegrated-obs.csv] with its corresponding map file 
[data/dataPaper-I/combinedOutMap-obs.csv], and the summary file
[data/dataPaper-I/reintegrated.csv] with its corresponding map file
[data/dataPaper-I/combinedOutMap.csv]

## Acquire and compile curated summary files

Steps in this section may be skipped since the versions of the curated summaries
used in the published paper have been cached in this repository. However, for
completeness, the steps necessary to acquire the current versions of them
from Google Sheets are reproduced here: 

Firstly, clear out the existing cache of the curated summaries with

    rm data/dataPaper-I-in/Animalia/*
    
Secondly, download the curated summaries from their folder in Google Sheets with
    
    node src/materialise.js [data-paper-mapping]
    
where [data-paper-mapping] is the path on your file system where the data
paper sheets have been mapped using the Google Drive desktop client. This
client, now named "Google Backup and Sync" is currently available from
https://www.google.com/intl/en-GB/drive/download/ . The curated summary
files are available in the folder https://drive.google.com/drive/folders/14gItR0p_4wYo4K1__tyPYeIuc2yLr6l_ . 
Browse to this folder and add it to your Google Drive mapping.

This step will download these summaries as CSV files into the directory
[data/dataPaper-I-/in/Animalia].

Thirdly, compile the downloaded summaries into a single CSV file using

    node src/compilecsv.js 
    
This step will produce an output file [data/dataPaper-I-in/Animalia.csv].

## Run the backward synthesis of curated summaries

Normalise and align the curated summary data by running

    node src/taxonomise.js --fusion data/dataPaper-I-in/fusion.json5
    
This will produce output files [data/dataPaper-I-in/reintegrated.csv] and the
corresponding map file [data/dataPaper-I-in/combinedOutMap.json].

## Reconcile taxon coverage between catalogues and summaries

As a consistency check, compare the taxon coverage between the forward and
backward analyses by running

    node src/compare.js data/dataPaper-I/reintegrated.csv data/dataPaper-I-in/reintegrated.csv
    
This will produce scratch files excess1.csv and excess2.csv in the current directory
listing the taxa which are in excess in each direction. The expectation is that
excess1.csv is empty, and excess2.csv contains two entries:

Heterochone calyx, from the data of Jackson Chu for which there is no corresponding
catalogue entry.

Aglantha digitale, sourced from the primary literature from an 1861 observation
by Alexander Agassiz.

## Export summaries and catalogues for publication

    node src/arphify.js
    
This synthesizes the data into Excel templates suitable for publication using 
the ARPHA platform, and a Darwin Core formatted CSV observations file Materials.csv 
suitable for publication in GBIF. These are output into the directory
[data/dataPaper-I-in/arphified]. In addition there will be a scratch summary
of potential taxon name mismatches in arphaMismatches.csv.


