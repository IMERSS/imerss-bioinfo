# IMERSS Bioinformatics Working Group Data Archive, Pipelines and Visualisations

This repository houses the working data of the [IMERSS](https://imerss.org/) [biodiversity informatics working group](https://imerss.org/2019/01/01/biodiversity-informatics-working-group/)
together with algorithms for transforming, reconciling and projecting observation and checklist data into formats
suitable for publication, submission to global authorities such as GBIF, as well as map-based and graphical
visualisations.

# Data Archive

All data is stored in CSV files in subdirectories under [data](data) although some unprocessed checklist data is a
variety of formats such as XLSX and PDF.

Authoritative data resulting from the full reconciliation of upstream catalogues and curated summaries for the Galiano
Data Paper part 1: Marine Zoology is held in [data/dataPaper-I](data/dataPaper-I) and [data/dataPaper-I-in](data/dataPaper-I-in).
In particular, the reconciled and normalised observation data is at [data/dataPaper-I/reintegrated-obs.csv](data/dataPaper-I/reintegrated-obs.csv),
reconciled checklists derived from this data is at [/data/dataPaper-I/reintegrated.csv](/data/dataPaper-I/reintegrated.csv).
The corresponding checklists derived from the curated summaries is at [/data/dataPaper-I-in/reintegrated.csv](/data/dataPaper-I-in/reintegrated.csv).

Full intructions for running the data paper part I pipeline are held in [Galiano Data Paper Vol I.md](Galiano Data Paper Vol I.md),
but here follows an overview of the scripts and overall installation instructions.

# Data Pipeline

The full data pipeline for deriving the observation data and its checklists from the upstream raw catalogues is held at
[/data/dataPaper-I/fusion.json5](/data/dataPaper-I/fusion.json5). This is stored in the [JSON5](https://json5.org/) format.
This file refers to the most up-to-date versions of the constituent catalogues in their various other subdirectories
under [/data](/data).

All of the code operating the data pipelines is written in JavaScript running either in [node.js](http://nodejs.org) or
the browser.
After [installing git](https://git-scm.com/book/en/v2/Getting-Started-Installing-Git) to check out this repository via

    git clone IMERSS/imerss-biodata

, and then installing node.js from its [download](https://nodejs.org/en/download/), you can install the pipeline's
dependencies by running

    npm install

in the checkout directory.

The scripts in [src](src) will then be ready to run via various `node` commands. These scripts are currently of a 
basic quality and not easily usable without being in close contact with members of the IMERSS BIWG team. Please join us
in our [Matrix](https://matrix.org/) channels [IMERSS general](https://matrix.to/#/#imerss-general:matrix.org) and
[IMERSS tech](https://matrix.to/#/#imerss-tech:matrix.org).

More detailed documentation for these scripts will be forthcoming, but the principal ones involved in the data paper
pipeline are:

    taxonomise.js [obs or summary CSV file] [--map map JSON file] [-o output file]

Main point of ingesting a collection of catalogues or summary in some CSV form. Accepts a "fusion" JSON5 file laying out
all of the constituent catalogues files as CSV together with accompanying "map" files mapping columns for ingestion and
rendering. Produces one or two `reintegrated` files combining the catalogues. This operates several stages of
normalisation, including normalising species names with respect to the internal ontology mapping file
[taxon-swaps.json5](data/taxon-swaps.json5), filtering out unwanted taxa, georeferencing correction patches,
and filtering with respect to a project boundary defined in GeoJSON. Details of all the capabilities of this
"Swiss Army knife" data processor can be followed in the data paper fusion file [data/dataPaper-I/fusion.json5](data/dataPaper-I/fusion.json5).

    inatObs.js

Downloads all observations in an iNaturalist project, whilst remaining within the iNaturalist team's recommended request
rate limit (one per second). Currently hardwired to download Animalia from the Galiano project. Produces a CSV file suitable
to form part of the input to `taxonomise.js`.

    materialise.js

From the curated summaries end, downloads a collection of summaries mapping in a Google Sheets directory. Currently hardwired
to download the "Animalia" at [Galiano Data Paper 2021/Marine Life/Animalia](https://drive.google.com/drive/folders/14gItR0p_4wYo4K1__tyPYeIuc2yLr6l_)
in the author's drive mapping.

    compile.js

Given the folder of files output by `materialise.js`, combines them together - currently hardwired to produce a file `Animalia.csv`.

    compare.js

Given the results of two `taxonomise.js` outputs as `reintegrated.csv` file checklists, compares them for any discrepancies,
after casting out any records for higher taxa which are trumped by a more specific species records. Outputs two CSV files
`excess1.csv` and `excess2.csv`.

    arphify.js

Given a pipeline specification such as the one in [data/dataPaper-I-in/arpha-out.json5], accepts both a normalised
observation file such as [data/dataPaper-I/reintegrated-obs.csv](data/dataPaper-I/reintegrated-obs.csv) and a normalised
curated summary file such as [/data/dataPaper-I-in/reintegrated.csv](/data/dataPaper-I-in/reintegrated.csv) and emits a
directory of XLSX spreadsheets in the form accepted by the [ARPHA writing tool](https://arpha.pensoft.net/) used for
submission of biodiversity data papers as well as a Darwin Core CSV file
[Materials.csv](data/dataPaper-I-In/arphified/Materials.csv) suitable for submission to GBIF.

    inattify.js

A necessary prelude to the `marmalise.js` script described below which produces a compressed visualisation file. This downloads
and caches the iNaturalist taxon information data feeds from any taxa referenced in a `reintegrated.csv` file, whilst
remaining within the iNaturalist API data rate limits.

e.g. for the data paper you may run 
    node src/inattify.js data/dataPaper-I/reintegrated.csv --map data/dataPaper-I/combinedOutMap.json 


    wormify.js
    
Accepts arguments as for `taxonomise.js`. Produces a scratch `reintegrated-WoRMS.csv` file after downloading and
caching WoRMS taxon files into [data/WoRMS](data/WoRMS) which compares the `authority` value listed against the
one found in the WoRMS API.

We dream of turning these pipelines into easily usable pluralistic graphical pipelines deployed on public live infrastructure
such as github and Google Sheets.

# Visualisations

## "Bagatelle" sunburst visualisation and map view

Observation and checklist data derived from condensed summaries such as, e.g. [data/dataPaper-I/reintegrated.csv](data/dataPaper-I/reintegrated.csv)
is in a sunburst partition layout inspired by <https://bl.ocks.org/mbostock/4348373>,
<https://www.jasondavies.com/coffee-wheel/>, as well as a map-based view rendered with [Leaflet](https://leafletjs.com/).

## Preparing data for visualisation

Data is compiled into a compressed JSON representation from CSV sources via a command-line script.

To convert a CSV file, run `marmalise.js` e.g. via a line such as

    node src/marmalise.js data/dataPaper-I/reintegrated.csv --map data/dataPaper-I/combinedOutMap.json

By default this will produce a `Life.json.lz4` file which can be copied into a suitable location, e.g. in the </data>
directories and then referred to in the JavaScript initialisation block seen, e.g. in the various [index.html](index.html)
files in this root. You can supply a `-o` option to output a file of a chosen name at a chosen path.

To preview the web UI, host this project via some suitable static web server and then access its `index.html`.

Condensed versions of the visualisation source files suitable for production hosting (JS and CSS) can be output to the
<build> directory via `node build.js`.

You can see such visualisations running online at locations like

https://biogaliano.org/map-prototype/
https://biogaliano.org/galiano-data-paper-map-view/

These visualisations are entirely static and so easy to host at any kind of site simply by uploading a folder of files
and injecting an initialisation block into the markup such as

````html
<script>
    hortis.sunburstLoader(".fl-bagatelle-container", {
        colourCount: "undocumentedCount",
        selectOnStartup: "Life",
        vizFile: "data/Galiano/Galiano-Life.json.lz4",
        phyloMap: "%resourceBase/json/emptyPhyloMap.json",
        commonNames: false
    });
</script>
````

together with `<script>` and `<style>` references to the built files.
