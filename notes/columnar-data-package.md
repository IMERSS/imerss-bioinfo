# The columnar data package

A visualisation's data - its observations, its taxa, its region indirection and any other table it reads - is
published as one file, a **columnar data package** with the suffix `.viz`, in place of separate CSV files or the
deflated CSV files which earlier bore the same suffix. Each table is held by columns, each column as one typed array,
so that a page reads the package by taking views of its buffers, with no parsing and no library beyond the browser's
own decompression. Columns which the visualisation needs only once it is shown, such as the times of its dates, are
held in a second package beside it, its **details**.

* The reader is `src/client/js/i6/vizPackage.js`, `hortis.viz`, which has no dependency on Infusion, so that a page, a
  Web Worker and node load it alike.
* The writer is `src/vizPack.js`, run under node.
* The visualisation loads its package through `hortis.dataLoader`, held by `hortis.vizLoader` as its member
  `dataLoader` - see [Drivers](#drivers).
* `src/migrateVizDriver.js` migrates a driver from separate files to a package - see [Migrating a driver](#migrating-a-driver).
* `test/i6/vizPackageRoundTrip.js` tests that each table is read back exactly as Papa Parse read its file.

The background to the design - why columns rather than CSV, JSON, SQLite or Parquet - is in the performance
investigation of the Saanich story, `notes/performance-investigation.md` in
[saanich-peninsula-flora](https://github.com/IMERSS/saanich-peninsula-flora), and the plans for querying the data in
`notes/hybrid-persistence-plan.md` there and [the query description language](query-description-language.md) here.

## Sizes

Packed from the files the visualisations read until now, every value kept:

| Data set | Rows of observations | Before, as published | Package, gzipped | Its details, gzipped |
| --- | --- | --- | --- | --- |
| Saanich Peninsula, vascular plants | 292,392 | 8.87 MB of gzipped CSV | 4.57 MB | 2.37 MB - `eventDate`, `dateIdentified` |
| Oregon Bee Atlas, 2025 | 181,522 | 3.34 MB of deflated CSV | 2.12 MB | none |
| Washington Bee Atlas, 2026 | 28,125 | 1.39 MB of deflated CSV | 1.11 MB | none |
| British Columbia Bee Atlas | 2,538 | 45 KB of deflated CSV | 41 KB | none |
| Salish Sea diatoms | 4,803 | | 96 KB | 6 KB - `eventDate` |
| Galiano BioBlitz 2023 | 555 | | 29 KB | none |

Saanich's package decodes in about 120 ms under node, nearly all of it in decompression. Materialising its 292,392
observations as row objects, the compatibility form described below, takes about 500 ms more - which the query
description language exists to avoid.

## The file

A package is gzipped. Hosts such as GitHub Pages may compress it again in transit, which the browser undoes
transparently; the reader decompresses the file's own gzip by the browser's `DecompressionStream`, or by `pako` where
there is none. Decompressed, it is:

| Offset | Bytes | Content |
| --- | --- | --- |
| 0 | 4 | The magic `IMVZ`, in ASCII |
| 4 | 4 | The version of the format, a little-endian `Uint32`, now 1 |
| 8 | 4 | The length of the header in bytes, a little-endian `Uint32` |
| 12 | as given | The header, a JSON object in UTF-8 |
| the next multiple of 8 | the rest | The body - every column's buffers, each beginning at a multiple of 8 bytes from the body's start |

Every buffer is little-endian, as the typed arrays of every platform the visualisations run on are, so that each is
read as a view of the decompressed bytes, copying nothing. Its alignment to 8 bytes allows a view of any type.

### The header

```json
{
    "format": "imerss-viz",
    "version": 1,
    "relations": [],
    "details": {"file": "Saanich_Tracheophyta_2026-11-15-details.viz", "hash": "3f0c…"},
    "tables": {
        "obs": {
            "rows": 292392,
            "source": "Saanich_Tracheophyta_ultimate-catalogue_2026-11-15-selected-labels.csv",
            "hash": "a91e44c07b2d5f18",
            "fields": ["taxon_name", "eventDate", "occurrenceID", "..."],
            "columns": {
                "taxon_name": {"encoding": "dict", "dictionary": ["Abies grandis", "..."],
                    "buffers": {"codes": {"type": "Uint16", "offset": 0, "length": 292392}}},
                "eventDate": {"encoding": "date32", "nullValue": -2147483648, "detailed": true,
                    "buffers": {"days": {"type": "Int32", "offset": 584784, "length": 292392}}}
            }
        }
    }
}
```

* `tables` maps each table's name to its description. The tables a visualisation reads are named `obs`, `taxa` and
  `regionIndirection`; a package may hold others under any name.
* A table's `fields` lists its fields in the order of its source's columns, and `columns` describes each.
* Each column's `buffers` maps the name of each of its buffers to its `type` - one of `Int8`, `Uint8`, `Int16`,
  `Uint16`, `Int32`, `Uint32`, `Float32` and `Float64` - its `offset` in bytes from the start of the body, and its
  `length` in elements.
* A table's `hash` is the first 16 hexadecimal digits of the SHA-256 of its columns' descriptions and buffers, so that
  it changes exactly when the table's content does - for caching a table, or results computed from it, across builds.
* `relations` lists the table's foreign keys, each as `{"table": "obs", "field": "iNaturalistTaxonId", "references":
  {"table": "taxa", "field": "id"}}`, as given to the writer. They are not yet used by the reader.
* `details`, present only if the package has details, names their file, relative to the package's, and its hash.

### Encodings

The writer chooses each column's encoding as the first of these which holds all its values exactly, so that the text
read back is identical to the text of the source, as tested by `test/i6/vizPackageRoundTrip.js`. An empty value, the
CSV's empty field, is read as `null` by `get` and as `""` by `getString`.

| Encoding | Buffers | Holds | Of each row |
| --- | --- | --- | --- |
| `empty` | none | A column with no values | - |
| `int` | `values`: `Int8`, `Int16` or `Int32`, the narrowest holding them | Integers in their canonical text, e.g. `"481"` but not `"0481"` | The integer, or `nullValue`, the type's least value, if empty |
| `decimal` | `values`: `Int32` | Decimal numbers of at most 7 places in their canonical text, e.g. coordinates | The number times 10^`scale`, or `nullValue` |
| `float` | `values`: `Float64` | Numbers in their canonical text of any precision, e.g. coordinates of 13 places, as Howe Sound's are | The number, or NaN |
| `date32` | `days`: `Int32` | Dates in ISO 8601's form, with or without a time and zone, e.g. `"2025-04-26T11:25:00-07:00"`, or of only a year or a year and month, e.g. `"1988"` | The day, as days since the Unix epoch - Apache Arrow's `Date32` - a partial date standing for its first day, or `nullValue` |
| `dict` | `codes`: `Uint8` or `Uint16` | Text of few distinct values - at most 256, or at most half the rows and 65,535 | A code into `dictionary`, which is sorted |
| `prefixed` | `codes`: `Uint8` or `Uint16`; `numbers`: `Int32` | Identifiers ending in a number, e.g. `"https://www.inaturalist.org/observations/276233132"` | A code into `dictionary`, of prefixes, and the number, or -1 if empty |
| `text` | `offsets`: `Int32`, one more than the rows; `bytes`: `Uint8` | Any text | The UTF-8 bytes from `offsets[i]` to `offsets[i + 1]` |
| `deferred` | none | A column held only among the details | - |

* **`date32`** holds only the day, since no view of a visualisation needs more - the phenology filter, the traces of
  a taxon's records and any sort by date work with the day alone. If any of a column's values holds more - a time, a
  zone, or text not of ISO 8601's form, which must be no more than 5% of them - the column has `"detailed": true` and is
  held in full among the details, so that its text reads as the day alone until they are loaded.
* **`prefixed`** and **`date32`** hold values of no other form as `exceptions`, a map in the header of row index to
  text, for at most 5% of the rows. A `prefixed` column must have at most one prefix for each 16 rows.
* **A `dict` column's dictionary is sorted**, so that codes compare as their values do, and a range of values is a
  range of codes.
* **No column is reordered or filtered.** Row *i* of every column of a table is the same row of its source, and the
  row index is the key by which every structure built from the package refers to a row. It holds only within one
  package: whatever refers to a row beyond it - a URL, a curation note, a cache of another build - uses an identifier
  held in the data, such as `occurrenceID`.

### The details

The details are a second package, of the same format, beside the main one, with `-details` before its suffix, e.g.
`Saanich_Tracheophyta_2026-11-15-details.viz`. Its tables bear the names of those of the main package, each holding only
the columns of it which have details, with the same number of rows. Its header names the main package as `detailsOf`.
A column is among the details if it is `detailed`, as a `date32` column with times is, or if the writer was asked to
defer it - e.g. an identifier which is shown only for a record which is selected - in which case the main package holds
it as a `deferred` column, empty until the details are loaded.

The main package names its details, with their hash, so that the details of one build are never attached to the
package of another. A visualisation renders, filters and counts from the main package alone, and loads the details once
it has.

## The reader

`hortis.viz`, in `src/client/js/i6/vizPackage.js`:

* `hortis.viz.load(url)` fetches and decodes a package, returning a promise for a `VizPackage`, with members `header`
  and `tables`. `hortis.viz.read(arrayBuffer)` decodes bytes already fetched.
* Each `VizTable` has members `name`, `rowCount`, `fields`, `hash` and `columns`, a map of field name to `VizColumn`.
* Each `VizColumn` has members `field`, `encoding`, `rows`, `header`, a view of each of its buffers under its name -
  e.g. `codes` and `dictionary` of a `dict` column, `days` of a `date32` column - and two accessors: `get(i)`, the typed
  value of row *i* - a Number for `int`, `decimal` and `date32`, else a String - or `null` if it is empty, and
  `getString(i)`, its text exactly as in the source, or `""`.
* `hortis.viz.toFloat64(column)` materialises a numeric column as a `Float64Array`, `NaN` standing for empty.
* `hortis.viz.toRows(table)` materialises a table as the array of row objects of text which Papa Parse produced from
  its source - the compatibility form, for code not yet written against the columns. Its `date32` columns read as their
  day until the details are attached.
* `hortis.viz.fromRows(tables)` makes a package in memory from tables of row objects, e.g. a test's data.
* `hortis.viz.attachDetails(pkg, details)` attaches a package's details, after which each column with details reads its
  text from them; `hortis.viz.detailsUrl(url, pkg)` finds their URL.

## Drivers

A visualisation's driver - the `fluid.def` in its page configuring the shared visualisation for one data set - names
its package, from which the page is also rendered statically by Infusion 6's `hydrate.js`:

```js
fluid.def("hortis.bbea.oba", {
    $layers: "hortis.beaVizLoader",
    vizFile: "data/b-team/plant-pollinators-OBA-2025.viz",
    stateCode: "OR"
});
```

This replaces the six members `obsFile`, `taxaFile` and `regionIndirectionFile`, each with its `…PlaceholderFile`. A
driver names only its real data, from which its page is hydrated - so that the static page shows the real data and holds
the results of its queries of startup - as well as rendered in the browser.

Placeholders are only for basic rendering test fixtures and authoring tools - see
[FLUID-7032](https://github.com/fluid-project/infusion-6/issues/32). Each variant of the visualisation supplies one as
the default of its `vizFile`, `placeholder://{layerName}/viz` - a minimal package representative of the data it needs
to instantiate and render the majority of its content, held inline in its Single File Component as a `<placeholder>`
block encoded in base64, so that it travels with the SFC wherever it is copied. They are those of
`hortis.beaVizLoader`, `hortis.standardVizLoader` and `hortis.blitzVizLoader`, whose taxa bear their reporting status.
A fixture, such as `test/i6/html/bbeaPlaceholderFixture.html`, uses the variant as it is, and so renders from its
placeholder; a page which is a runnable application overrides `vizFile`, and `build.js` hydrates it with
`--no-placeholders`, refusing it if any component is rendered from a placeholder. A placeholder package must be
self-contained, holding no details beside it, and is written into its SFC by

```
node src/inlineVizPlaceholders.js <layerName> <package.viz>
```

`hortis.vizLoader` holds the package's loader as its member `dataLoader`, of the layers `hortis.dataLoader` and
`fluid.withPlaceholder`, so that every part of the visualisation refers to its tables symbolically:

| Reference | Value |
| --- | --- |
| `{dataLoader}.package` | The `VizPackage`, pending until it is loaded |
| `{dataLoader}.obs`, `{dataLoader}.taxa`, `{dataLoader}.regionIndirection` | The tables, as `VizTable`s - an empty table standing for a region indirection the package lacks |
| `{dataLoader}.tables.<name>` | Any other table of the package |
| `{dataLoader}.detailed` | The package once its details are attached, pending until then, or the package itself if it has none |
| `{dataLoader}.isPlaceholder` | `true` if the visualisation is rendered from its placeholder, as in a test fixture |

Every part of the visualisations reads the observations through the
[query description language](query-description-language.md), and `hortis.vizLoader` holds them as `Selection`s -
`allObs`, `filteredObs` and `finalFilteredObs` - rather than as rows. Only the small tables of taxa and of the region
indirection are materialised as row objects, as `taxaRows` and `regionIndirectionRows`, from which the taxonomy and the
region filters are built; `{vizLoader}.pkg` is the package itself.

## Writing a package

```
node src/vizPack.js --out <file.viz> --table obs=<file> --table taxa=<file> [--table <name>=<file> ...]
    [--relation obs.iNaturalistTaxonId=taxa.id ...] [--details obs.occurrenceID ...]
```

or `node src/vizPack.js <spec.json>`, with a spec of the form

```json
{
    "output": "x.viz",
    "tables": {"obs": "obs.csv", "taxa": "taxa.csv", "regionIndirection": "regionIndirection.csv"},
    "relations": [{"table": "obs", "field": "iNaturalistTaxonId", "references": {"table": "taxa", "field": "id"}}],
    "detailFields": {"obs": ["occurrenceID"]}
}
```

whose paths are resolved against its own directory. Each table's file may be a CSV file or a deflated CSV file of the
earlier `.viz` form, read with the options with which `hortis.csvReader` read it, `{header: true, skipEmptyLines:
true}`. The details, if there are any, are written beside the package; a stale file of details is removed if the
package no longer has any.

### In a bioReportR project

Since node is required by every project's publication workflow, the packer has no R version. A bioReportR project,
such as saanich-peninsula-flora, names its package once in its `bioreportr.yaml`, as `viz` beside the files it is
packed from, and its `R/build.R` packs it as the final stage of data preparation, after copying those files into
`static/local/data/tabular`, by running `node_modules/imerss-bioinfo/src/vizPack.js` through `R/npm.R`. Its
`src/js/storyBuild.js` names it to the story page as `vizFile` in `bioreportr.storyData`. The step is passed over, with
a warning, while the installed imerss-bioinfo has no `src/vizPack.js`.

## Migrating a driver

```
node src/migrateVizDriver.js [-n] <driver.html> [<driver.html> ...]
```

For each driver - a page, Single File Component or script holding a `fluid.def` which names `obsFile`, `taxaFile` and
optionally `regionIndirectionFile` and their placeholders - the tool packs the files into one package beside the
observations, and the placeholders into another beside theirs, each named by what the names of its observation and taxon
files have in common, e.g. `plant-pollinators-BCBA.viz` for `plant-pollinators-BCBA-labels.viz` and
`plant-pollinators-BCBA-assigned-taxa.viz`. It then rewrites the six members of the driver as `vizFile` and
`vizPlaceholderFile`. The latter is no longer read - remove it, and inline any placeholder worth keeping into its
variant's SFC with `src/inlineVizPlaceholders.js`. With `-n` it reports what it would do, and writes nothing. It leaves the superseded files in
place, and lists them, to be removed once the migrated driver has been checked - together with their entries in any
list of files to be published, such as `buildIndex.copy` in `build.js`.

All of this repository's Infusion 6 drivers have been migrated: `indexBeasBCBA.html`, `indexBeasOBA.html`,
`indexBeasWaBA.html`, `indexBlitz.html`, `indexDiatoms.html` and the fixture `test/i6/html/bbeaPlaceholderFixture.html`.

## The fields of the first views

What each visualisation reads to render its first view, before any interaction - the fields which a query-based
architecture needs at startup, and which a later revision of the format may hold in a first group of columns, the rest
following with the details.

### The standard visualisation and the BioBlitz - `hortis.standardVizLoader`, `hortis.blitzVizLoader`

| Table | Field | Read by |
| --- | --- | --- |
| obs | `decimalLatitude`, `decimalLongitude` | the map's grid and its bounds, `hortis.obsQuantiser`, and the viewport's records, `hortis.libreMap.viewportObs` |
| obs | `iNaturalistTaxonId` (or `linkTaxonId`) | the taxa of the records, `hortis.taxaFromObs`, and each cell's taxa |
| obs | `recordedBy` | the recorder filter's list of recorders, `hortis.computeAllCollectors` |
| obs | `dataset`, and any other field named by the region indirection | the dataset filter, `hortis.regionFilter` |
| obs | `occurrenceID` | the index of records by id, `hortis.libreMap.recordIndex`, for the URL's selected record |
| taxa | `id`, `parentId`, `rank`, `iNaturalistTaxonName` | the taxonomy, `hortis.taxa.index`, and the checklist |
| taxa | `commonName`, `taxonName`, `hulqName` | the checklist's labels and the taxon search |
| taxa | `reportingStatus` | the BioBlitz's counts by status, `hortis.reportingStatusById` |
| regionIndirection | `regionField`, `id`, `label` | the region filters |

### The plant-pollinator atlases - `hortis.beaVizLoader`

These have two taxa to each row of observations, a plant and its pollinator, both in one table of taxa.

| Table | Field | Read by |
| --- | --- | --- |
| obs | `decimalLatitude`, `decimalLongitude` | the map's grid and bounds |
| obs | `plantINatId`, `pollinatorINatId` | the taxa of the records, `hortis.twoTaxaFromObs`, the cross table of interactions, `hortis.interactions.count`, and each cell's taxa, `hortis.indexBbeaObs` |
| obs | `eventDate` - the day alone | the phenology filter's months and days, `hortis.phenologyFilter.dateCache` |
| obs | `verbatimElevation` | the elevation filter's range, `hortis.elevationFilter.rangeCache` |
| obs | `sex` | the sex filter of the bee checklist |
| obs | `recordedBy` | the collector filter |
| obs | every field named as a `regionField` by the region indirection, e.g. `US Ecoregions Level III` - 19 for Oregon | the grouped region filter |
| obs | `occurrenceID` | the index of records by id |
| taxa | `id`, `parentId`, `rank`, `iNaturalistTaxonName`, `commonName` | the two checklists, the network and the abundance and seed mix views |
| regionIndirection | `regionField`, `id`, `label` | the grouped region filter |

### The bioReportR story page - `bioreportr.storyPage`

| Table | Field | Read by |
| --- | --- | --- |
| obs | `decimalLatitude`, `decimalLongitude` | the atlas's grid and bounds, and `bioreportr.hasCoordinates` |
| obs | `iNaturalistTaxonId` | the taxa of the records, the per-taxon summaries of the atlas, the Traces and Lost Plants panes |
| obs | `eventDate` - the day alone, chiefly its year | the record period, the time period filter, the Traces pane and the extirpation analysis |
| obs | `basisOfRecord`, `institutionCode` | whether a record is a sighting or a specimen, per the project's `isSighting` |
| obs | `BEC`, `KBA`, `ProtectedArea` | the region filters and the Protected Areas pane, through the region indirection |
| obs | `occurrenceID` | the index of records by id, and the record annotations, e.g. `excludeFromEP` |
| taxa | the summary's fields, e.g. `id`, `parentId`, `rank`, `iNaturalistTaxonName`, `commonName`, `reportingStatus`, `inSummary`, `introduction_status`, `provincial_concern` | the checklist, the status filters and the panes |
| regionIndirection | `regionField`, `id`, `label` | the region filters |

`recordedBy`, `locality`, `coordinateUncertaintyInMeters` and the full `eventDate` are shown only for a record or cell
which is selected, and `eventDate`'s time never.

## Open questions

* **Which fields to defer.** No field is yet deferred by default. `occurrenceID` is the largest - about 1.1 MB of
  Saanich's package - and is needed at startup only to find the record named by the URL, which could be done by
  scanning its buffer for the one identifier rather than indexing every record. See
  [the query description language](query-description-language.md).
* **The order of rows.** Ordering the observations by a Hilbert or Morton key of their position at build time would make
  each cell's, and roughly each viewport's, records contiguous - see the plan in saanich-peninsula-flora. The format
  allows it, since nothing outside a package refers to a row by its index, but the writer does not yet do it.
