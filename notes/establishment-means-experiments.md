# Establishment means experiments

The batch form works: `/v1/taxa?id=…&preferred_place_id=…` returns each taxon's own `establishment_means` for the named state. That makes a full run small, about 95 requests per state at 30 ids each, under 15 minutes for all four states at the 2 s spacing.

These are the five URLs I queried, spaced 2 s apart; all returned 200:
```
https://api.inaturalist.org/v1/taxa/53387?preferred_place_id=46
https://api.inaturalist.org/v1/taxa?id=53387,57983,47602,52821&preferred_place_id=46
https://api.inaturalist.org/v1/taxa?id=53387,57983,47602,52821&preferred_place_id=10
https://api.inaturalist.org/v1/taxa?id=53387,57983,47602,52821&preferred_place_id=22
https://api.inaturalist.org/v1/taxa?id=53387,57983,47602,52821&preferred_place_id=7085
```

What came back:

| Taxon | WA | OR | ID | BC |
|---|---|---|---|---|
| *Achillea millefolium* | native | native | none | native |
| *Taraxacum officinale* | introduced | introduced | introduced | introduced |
| *Cornus sericea* | none | native | native | native |
| *Helianthus annuus* | none | native | native | introduced |

- **Each status is the state's own listing.** Every value returned names the state itself. In these samples iNaturalist didn't fall back to the US or Canada.
- **"None" means the state's checklist has no entry for that taxon.** The single-taxon request agrees: Washington gives null for *Cornus sericea* too. These look like gaps in iNaturalist's state checklists rather than anything about our requests, perhaps because the taxon is listed under a subspecies, a synonym or only at county level.
- **The cache's figures are out of date as well as truncated.** *Cornus sericea* now has 1,089 listings, against 802 when it was cached.

So a full run will leave some taxa with no status for some states. Some choices for those:
- Leave them as "unknown" in the seed mix evaluator.
- Fill them from a second pass using `preferred_place_id=1` (US) or `6712` (Canada). That's coarser, and the US-wide status may not hold for a given state.
- Fill them from the taxon's subspecies or parent, which needs more care.

(These responses were saved only to a temporary scratch directory, and are not kept.)

The questions this raised were settled as follows - a new table of the SQLite cache holds the responses, a CSV written
from it is merged into the Atlas taxa table by a step of its own, and a plant whose status is unknown is treated as
native - see "Decisions and implementation" below.

## Full run - November 20th, 2026

`node src/assignEstablishment.js ../obp-private/tabular_data/plant-pollinators-Atlas-assigned-taxa.csv` looked up the
2,837 plant taxa of the Atlas taxa table in each of the four states - 380 requests of the form
`https://api.inaturalist.org/v1/taxa?id=<30 ids>&preferred_place_id=<10|46|22|7085>&per_page=30`, 2 s apart, all
successful, in 761 s. Responses are cached in the table `iNatEstablishment` of `data/iNaturalist/taxa.db/taxa.sqlite3`,
and the means written to `plant-pollinators-Atlas-establishment.csv`, merged into the Atlas taxa table by
obp-private's `R/merge-establishment.R`.

Of the species-rank plants recorded in each state's atlas, those to which the state's checklist assigns a status:

| State | Species recorded | native | introduced | endemic | none | with a status |
|---|---|---|---|---|---|---|
| OR | 1,690 | 990 | 522 | 16 | 162 | 90% |
| WA | 732 | 114 | 229 | 8 | 381 | 48% |
| ID | 112 | 36 | 34 | 1 | 41 | 63% |
| BC | 153 | 62 | 83 | 0 | 8 | 95% |

Washington's checklist on iNaturalist appears to lack many of its native plants - e.g. *Cornus sericea* - so that its
statuses are both incomplete and biased towards introduced plants. Genera and higher taxa are rarely listed in any
state. Taxa without a status are so far left empty.

## Decisions and implementation - November 20th, 2026

### Why the existing cache could not be used

The responses of `/v1/taxa/{id}` cached by `assignBNames.js`, in the table `iNatTaxaId` of
`data/iNaturalist/taxa.db/taxa.sqlite3` (zlib-compressed JSON), keep each taxon's `listed_taxa` - its listing, with
`establishment_means`, in each place's checklist. But iNaturalist returns at most 100 listings, and a common plant has
far more (*Achillea millefolium* 2,594), so that a state's listing is often cut off - and those which survive are biased,
e.g. towards introduced plants in Washington. Ancestors written as part of another taxon's response have no listings at
all. The cached responses' top-level `establishment_means` is always null, since they were requested with no place.

### Workflow

1. `src/assignEstablishment.js`, run from the root of this checkout as is `assignBNames.js`, so that it uses the same
   SQLite cache:

       node src/assignEstablishment.js ../obp-private/tabular_data/plant-pollinators-Atlas-assigned-taxa.csv

   For each of the plant taxa (descendants of Plantae, 47126) of a taxa table it looks up the establishment means in
   each place - by default `OR=10,WA=46,ID=22,BC=7085` - 30 taxa a request, at most one request each 2 seconds. Each
   response is cached, one row for each taxon and place, in the table `iNatEstablishment` (`taxon_id`, `place_id`,
   `fetched_at`, `establishment_means`, `doc`). A taxon which the place's checklist does not list is cached with an empty
   means, so that it is not looked up again; `--refresh` looks up every taxon again. It writes
   `plant-pollinators-Atlas-establishment.csv` beside the taxa table, with columns `id`, `iNaturalistTaxonName` and
   `establishmentOR`, `establishmentWA`, `establishmentID`, `establishmentBC`.
2. obp-private's `R/merge-establishment.R` merges these columns into `plant-pollinators-Atlas-assigned-taxa.csv`,
   after `R/build-atlas.R` and before `scripts/Atlas_copyOut.sh` packs `data/b-team/plant-pollinators-Atlas.viz` - see
   obp-private's `tabular_data/provenance-2025.txt`.

### In the seed mix evaluator

`hortis.seedMix.computeIntroduced`, in `src/client/sfc/bbea/hortis-seedMix.vue`, treats as introduced any plant whose
means is "introduced" in any of the states in scope - those of the site's records if a site is defined, otherwise those
of all records under the current filters. Every other plant is treated as native, including those whose state checklist
does not list them. Introduced plants are listed in a section of their own, "Introduced plants", below the others,
whose tooltip explains this; a data set which is not of several states, without the field `state`, has none.

### Remaining weaknesses

* Washington's checklist on iNaturalist lists few of its native plants, so that fewer than half of its recorded species
  have any status, and those which do lean towards introduced.
* The statuses are a snapshot of iNaturalist's checklists as of this run - `--refresh` takes a fresh one.
