# The query description language

**Status, November 2026:** the local executor is implemented as `hortis.qdl` in `src/client/js/i6/qdl.js`. Every part of
this repository's Infusion 6 visualisations - the standard visualisation, the BioBlitz and the plant-pollinator atlases
- and of the bioReportR story pages of saanich-peninsula-flora and howe-sound-mapping-2026 reads the observations
through it. `test/i6/qdlEquivalence.js` tests that its results agree with the computations over rows which it replaced.
The results of the queries of startup are captured at hydration, as described below, and tested by
`test/i6/queryCacheRoundTrip.js`. Neither the worker executor nor the SQL executor is written - see
[In a Web Worker](#in-a-web-worker) for why the worker was deferred.

The query description language, or QDL, is the form in which every part of a visualisation asks for data - filters,
the map's grid, checklists, tables, tooltips and panes - in place of each walking the rows of the observations itself.
A query is a plain JSON object, so that it can be compared, hashed, cached, sent to a Web Worker or a server, and
written into a hydrated page. It is written against the loaded form of the
[columnar data package](columnar-data-package.md): its fields are the fields of the package's tables, its values those
which their columns' `get` returns, and its results are typed-array columns indexed as the package's are.

It is answered by an **executor**. The executor in the browser, `hortis.qdl`, runs a query over the package's columns
in one pass. Others are planned, as described in `notes/hybrid-persistence-plan.md` in saanich-peninsula-flora: a
compiler of queries to SQL for a server, and a cache of results computed when the page was built.

## Why

Before the QDL, each filter was a function from an array of row objects to a smaller array, and each view walked
whichever array it was given. On Saanich's 292,392 observations that meant building a row object per record, then
about a dozen passes over them at startup, each of 45-100 ms on a desktop, parsing strings afresh in several. A query
instead names what it needs, so that:

* all the active filters, and the measures of a view, run as one loop over the few columns they read;
* nothing is materialised per row - a selection is a bitset, a grouping a typed array indexed by group;
* the same query can be answered elsewhere: in a Web Worker, so that a phone stays responsive, by a server, for data
  sets beyond what a client can hold, or from a cache, for the views shown at startup.

## A query

```js
{
    from: "obs",
    let: {
        cell: {snapToGrid: ["decimalLongitude", "decimalLatitude"], metres: 1000, baseLatitude: 49}
    },
    where: [
        {field: "eventDate", op: "between", value: [7305, 20454]},
        {field: "iNaturalistTaxonId", op: "within", taxa: ["47126"]},
        {field: "BEC", op: "in", value: [2, 3]}
    ],
    groupBy: ["cell"],
    measures: {
        records: {count: true},
        taxa: {countDistinct: "iNaturalistTaxonId"},
        bounds: {extent: ["decimalLongitude", "decimalLatitude"]}
    }
}
```

| Member | Required | Meaning |
| --- | --- | --- |
| `from` | yes | The table queried, by its name in the package, e.g. `"obs"` |
| `let` | no | Named computed expressions, usable wherever a field is - see [Expressions](#expressions) |
| `where` | no | A list of predicates, all of which a row must satisfy - see [Predicates](#predicates) |
| `groupBy` | no | A list of one or two fields or named expressions, by which the surviving rows are grouped |
| `measures` | no | Named aggregates, computed over the surviving rows, or over each group's - see [Measures](#measures) |
| `select` | no | Instead of measures, the ids of the rows themselves, as `{rows: true}`, optionally ordered and windowed - see [Rows](#rows) |

A query with neither `measures` nor `select` returns the selection itself - see [Results](#results).

### Values

A predicate's values are those of the column's `get`, so they depend on its encoding, which a query's author need not
know beyond its type:

* Numbers for `int` and `decimal` columns, e.g. a latitude of `48.5`.
* Days since the Unix epoch for `date32` columns - `hortis.qdl.day("2020-01-01")` gives 18262.
* Strings for every other column - the executor compares a `dict` or `prefixed` column by its codes, having found the
  codes of the strings once, so that a predicate on a string costs no more than one on a number.
* `null` for an empty value, which matches only `{op: "isNull"}` and its negation.

## Expressions

A field is named by a string. `let` names computed expressions, each of which yields a value per row, and is usable in
`where`, `groupBy` and `measures` as if it were a field:

| Expression | Value per row |
| --- | --- |
| `{field: "x"}` | The field itself - the same as `"x"` |
| `{year: "eventDate"}` | The year of a date, e.g. 2025 |
| `{month: "eventDate"}` | Its month, 1-12 |
| `{dayOfYear: "eventDate"}` | Its place in a leap year, from 0 for 1 January to 365 for 31 December, so that a month and day have the same number in every year - 1 March is always 60 - as the phenology filter numbers them |
| `{number: field}` | The field's values read as Numbers, whatever its encoding - one which is not a number is empty |
| `{snapToGrid: [lngField, latField], metres, baseLatitude}` | The cell of a point within a grid of cells `metres` on a side at `baseLatitude`, as one Int32, the cell's row and column packed as `row * 65536 + column` - after PostGIS's `ST_SnapToGrid`. A row without a position has `null` |
| `{ancestorAtRank: field, rank: "family"}` | The id of the taxon's ancestor at a rank, by the taxonomy of the `taxa` table |
| `{lookup: field, table: "taxa", key: "id", value: "reportingStatus"}` | A field of the row of another table to which the field refers, as a foreign key |

Each expression is computed once for each package, and kept as a column of its own, so that a second query using the
same expression, or a predicate and a grouping both using it, pays nothing more. A `snapToGrid` cell number replaces
`hortis.obsQuantiser.cellIds`, a `Map` from each row object to a string.

## Predicates

| Predicate | A row passes if its value |
| --- | --- |
| `{field, op: "=", value}`, `"!="`, `"<"`, `"<="`, `">"`, `">="` | compares so with `value` |
| `{field, op: "between", value: [lower, upper]}` | is at least `lower` and at most `upper` |
| `{field, op: "in", value: [...]}` | is one of the values - the selected values of a filter of values, or of regions |
| `{field, op: "isNull"}`, `{field, op: "notNull"}` | is empty, or not |
| `{field, op: "contains", value}` | contains the text, ignoring case - the recorder filter, whose field holds several names separated by semicolons |
| `{field, op: "within", taxa: [id, ...]}` | is the id of one of the taxa, or of a taxon beneath one of them - the taxon search and the checklists' selections |
| `{field: [lngField, latField], op: "inBox", value: [[west, south], [east, north]]}` | is a point within the box - the map's viewport, after PostGIS's `&&` |
| `{field: [lngField, latField], op: "inPolygons", value: GeoJSON}` | is a point within any of the polygons - the drawn polygons of `polygonDraw.js` |
| `{any: [predicate, ...]}` | passes any of the predicates |
| `{all: [predicate, ...]}` | passes all of them, as the list of `where` does |
| `{not: predicate}` | fails the predicate |
| `{field, op: "monthIn", value: [1, 2, ...]}` and `{field, op: "dayOfYearBetween", value: [from, to]}` | falls in one of the months, or within a range of days of the year, which may wrap past the new year - the phenology filter |

`within` closes the taxa downwards once, by the taxonomy, into a bitset over the taxa's rows, so that each row's test is
one lookup, where the taxon search filter used to climb the taxonomy from every record.

**Two taxa to each row.** The plant-pollinator atlases' observations name a plant, `plantINatId`, and a pollinator,
`pollinatorINatId`, from one table of taxa. Nothing in the QDL is specific to this: their checklists' selections are
`within` predicates on the two fields, `{field: "plantINatId", op: "within", taxa: [...]}` and the same of
`pollinatorINatId`, and their network's cross table is a grouping by both - see below.

### Filters as producers of predicates

A filter no longer filters rows: it holds its state, as now, and computes from it `predicates`, a list of predicates,
empty when it is inactive. `hortis.obsFilters` gathers every active filter's predicates, in the order of the tree, into
the `where` of the visualisation's **base query**, `{vizLoader}.baseQuery`, from which each view's query is derived by
adding its own `groupBy` and `measures`. Its value is reactive in the usual way - a change in any filter's state changes
its predicates, then the base query, then each view's query and result. Since a query is data, a result is recomputed
only if its query is not equal to the last.

| Filter | State | Predicates |
| --- | --- | --- |
| `hortis.collectorFilter` | a recorder's name | `[{field: "recordedBy", op: "contains", value: name}]` |
| `hortis.regionFilter` | the selected rows of the region indirection | `[{any: [{field: regionField, op: "in", value: ids}, ...]}]`, one per region field |
| `hortis.groupedRegionFilter` | the same, grouped by field | one `{field: regionField, op: "in", value: ids}` per field with a selection |
| `hortis.valueFilter` | the selected values | `[{field, op: "in", value: values}]` |
| `hortis.phenologyFilter` | the selected months, or a range of days | `[{field: "eventDate", op: "monthIn", value: months}]` or `dayOfYearBetween` |
| `hortis.elevationFilter` | a range | `[{field: "verbatimElevation", op: "between", value: [lower, upper]}]` |
| `hortis.sexFilter` | female, male | `[{field: "sex", op: "in", value: ["F"]}]`, etc. |
| `hortis.taxonSearchFilter` | a taxon | `[{field: taxonField, op: "within", taxa: [id]}]` |
| `hortis.libreMap.gridSelector` | a cell | `[{field: "cell", op: "=", value: cell}]`, the cell expression in the base query's `let` |
| the polygon filter of `polygonDraw.js` | polygons | `[{field: [lng, lat], op: "inPolygons", value: geojson}]` |
| `bioreportr.statusFilter` | statuses | `[{field: {lookup: "iNaturalistTaxonId", table: "taxa", key: "id", value: "reportingStatus"}, op: "in", value: statuses}]` |
| `saanich.timePeriodFilter` | a range of years | `[{field: {year: "eventDate"}, op: "between", value: [from, to]}]` |

## Measures

| Measure | Value, over the rows of a group, or of the whole selection |
| --- | --- |
| `{count: true}` | The number of rows |
| `{countDistinct: field}` | The number of distinct values of the field, e.g. of taxa in a cell |
| `{min: field}`, `{max: field}` | The least and greatest value, e.g. the first and last year of a taxon |
| `{extent: [lngField, latField]}` | The bounding box of the points, `[[west, south], [east, north]]` - after PostGIS's `ST_Extent` |
| `{distinct: field}` | The distinct values, as a typed array of their codes or values - e.g. the taxa of the selection, `hortis.taxaFromObs`, or the recorders offered by the collector filter |
| `{rows: true}` | The ids of the rows, as an Int32Array - e.g. each cell's records, for its tooltip |
| `{count: true, filter: [predicate, ...]}` | Any measure may carry a `filter`, applied to it alone, after SQL's `FILTER (WHERE ...)` - e.g. the records of a cell which are sightings |

## Rows

`select: {rows: true}` returns the ids of the surviving rows, in the package's order, for a view which shows records
one by one, such as a data table. It may carry `orderBy: [{field, direction: "asc" | "desc"}]`, `offset` and `limit`.
A table scrolling through a large selection fetches its ordered ids once for each change of filter or sort, then reads
each block's values from the package's columns by id - the costs of which are measured in
`notes/performance-investigation.md` in saanich-peninsula-flora.

## Results

A result is an object of typed arrays, so that it is cheap to transfer from a Web Worker, to cache, and to write into a
hydrated page:

* A query with neither `groupBy` nor `select` returns one value for each measure, with `count`, the number of rows
  selected, e.g. `{count: 21552, taxa: 811, bounds: [[-123.6, 48.4], [-123.3, 48.75]]}` - a `distinct` measure as a
  typed array of its values or codes; with no measures, it returns its selection: `{rowCount, count, selection}`, the
  selection a `Uint8Array` over the table's rows holding 1 for each row selected.
* A query with `groupBy` returns `{groups: N, keys: {<field>: TypedArray}, measures: {<name>: TypedArray}}`, the
  groups in ascending order of their keys - one key column for each field grouped by - with a `distinct` or `rows`
  measure held as offsets into one flat array, as a `text` column's values are.
* A query with `select` returns `{rows: Int32Array}`.

The values of a key or measure are those of `get` - codes resolve through the column's dictionary by
`hortis.qdl.decode(pkg, query, result, field)`.

### Narrowing a selection

`hortis.qdl.execute(pkg, query, within)` accepts, beside the query, a selection already computed, which the query's
`where` narrows - so that a view adding a predicate to the visualisation's filters, e.g. the cell of a tooltip, does not
filter afresh. It is not part of the query, so that the query stays plain data, which can be compared and hashed; a
cache of results keys a narrowed query by the query which computed the selection too. In the visualisations, a
`Selection` - `{selection, count, rowCount}` - is what passes between components in place of an array of rows: the
`filteredObs` and `finalFilteredObs` of `hortis.vizLoader`, and the `selection` of `hortis.obsQuantiser`.

### Reading rows

A view which shows records one at a time - a marker, a tooltip, a selected record, a download - reads them by id with
`hortis.qdl.rowObject(table, i)` or `rowObjects(table, ids)`, each an object of the text of every field, as Papa Parse
produced from the source, bearing its index under `hortis.qdl.rowIndexSymbol`. `hortis.qdl.findRow(table, field,
value)` finds the first row with a value of a field, e.g. the record named by the URL, by scanning its column.

## Canonical form, and hashing

`hortis.qdl.canonical(query)` sorts the members of every object, so that two queries meaning the same are equal as text. `hortis.qdl.hash(query, pkg)` is a hash of that text
together with the hash of the queried table, so that a cached result is found only for the same query over the same
data - a result never goes stale, since a new build of the data changes the table's hash.

## Executors

An executor implements one method, `execute(query)`, returning a promise for the result. The executor in use is
chosen by configuration, `{vizLoader}.executor`, so that nothing else changes with it:

* **The local executor**, `hortis.qdl.execute`, answers over the package in the same thread. Its plan for a query is: resolve each
  predicate's values into codes or numbers, compute or find each `let` expression's column, then make one loop over
  the rows, testing the predicates in turn - those on `dict` codes as lookups in a small table - and accumulating the
  measures into typed arrays indexed by group. Groups by a cell number or a code are dense, so that a count is
  `counts[group]++`; `countDistinct` keeps a bitset per group where the values are few, or sorts packed pairs of group
  and value otherwise.
* **`hortis.qdl.workerExecutor`** sends the query to a Web Worker which holds the package, and runs the local executor
  there - see below.
* **`hortis.qdl.cachedExecutor`** answers from the results captured when the page was hydrated, before deferring to
  another executor - see below.
* A **SQL executor**, compiling the query for DuckDB or Postgres behind a server, is planned but not written. Every
  construct above has a direct form in SQL: `snapToGrid` as `floor(lat / :latRes)` and `floor(lng / :lngRes)`, `within`
  as a join on a closure table of the taxonomy, a measure's `filter` as `FILTER (WHERE ...)`.

### In a Web Worker

Not yet written. The design: the package is held in a dedicated Web Worker, which answers queries, the page receiving
results as typed arrays transferred without copying, and reading directly only the few columns it shows, e.g. each
displayed record's fields. The worker would load only `vizPackage.js` and the executor, which have no dependency on
Infusion.

It was deferred because measurement showed little left for it to move. On the Saanich story, with Chrome's CPU slowed
fourfold, the package's fetch and decompression already run off the main thread - `DecompressionStream` decompresses
natively, in the background - and once the views were rewritten against the QDL, every query of startup together took
about 1 s of the main thread's time, against 3.4 s of Infusion's own parsing of Single File Components and rendering
of templates. The page was revealed in 13.3 s, against 23.3 s before the port. Since a worker answers asynchronously,
every function reading a query's result would become asynchronous too, and each view would pass through a pending
state on every change of filter - a large change to save at most that second, which the cache of startup's queries,
below, attacks more directly.

### Captured at hydration

Implemented as `hortis.queryCache` in `src/client/js/i6/imerss-core.js`, through which `hortis.query` executes every
query. Pages are hydrated by Infusion 6's `hydrate.js` against their **real** data - placeholders are only for test
fixtures, see [the columnar data package](columnar-data-package.md) - so that the static page shows the real data, and
every query executed under node is recorded with its result. The results are written into the page as a `<script type="application/json" id="hortis-query-cache">` in its
head, typed arrays as base64 and selections as runs of their selected rows, each of at most 64 KB as encoded - a larger
result, such as the ids of every row grouped by taxon, being cheaper executed than read. The element is not of the
page's source, so it is marked as hydrated, and `dehydrate.js` removes it with the rest.

When the hydrated page boots in the browser, each query whose key is in the cache is answered from it, once, rather
than executed. A query's key is its canonical form hashed with the hash of the table it queries, and the key of the
selection it narrows - a `Selection` bears the key of the query which computed it - so that a page whose data has
changed since it was hydrated finds none of its queries, and executes them as usual. A result which cannot be read is
executed instead. A filter whose state is held in the URL has none under node, and takes no part in the static
rendering.

Measured on the Washington Bee Atlas, the hydrated page caches 9 queries in 72 KB, and is ready in the browser in 732 ms
against 883 ms from its dehydrated form. On the Saanich story it caches 10 queries in 128 KB, but the hydrated page is
no faster: rendered from its real data, it holds about 1 MB more markup, chiefly its full checklist, whose adoption in
the browser costs about what the cache saves - and the story page stays hidden until it has booted, so that the real
markup is not yet shown before then.
