# Generations of visualisation in this repository

The drivers in this repository fall into three generations. Each has its own framework, map library and set of
client sources. When a dependency is upgraded, this tells you which pages to recheck.

## 1. Modern: Infusion 6, MapLibre, Single File Components

These are built from `src/client/js/i6/` and the SFCs under `src/client/sfc/`. They load Infusion 6 through
`FluidBoot.js` and `<fluid-import>`, and their data comes from a columnar `.viz` package (see
[columnar-data-package.md](columnar-data-package.md)). The development pages are at the top level, and `build.js`
builds them into `docs/`. Infusion 6 is vendored into `docs/vendor/infusion-6`.

| Page                   | Layer / loader                                  | Data                                                   |
|------------------------|-------------------------------------------------|--------------------------------------------------------|
| `indexBeasAtlas.html`  | `hortis.beaVizLoader` + `hortis.oregonNursery`  | `data/b-team/plant-pollinators-Atlas.viz` - OR, WA, ID and BC combined, with grouped region filters |
| `indexBeasBCBA.html`   | `hortis.beaVizLoader`                           | `data/b-team/plant-pollinators-BCBA.viz`               |
| `indexBeasOBA.html`    | `hortis.beaVizLoader`                           | `data/b-team/plant-pollinators-OBA-2025.viz`           |
| `indexBeasWaBA.html`   | `hortis.beaVizLoader`                           | `data/b-team/plant-pollinators-WaBA-2026.viz`          |
| `indexBlitz.html`      | `hortis.blitzVizLoader`                         | Galiano 2023 BioBlitz vascular plants                  |
| `indexDiatoms.html`    | `hortis.standardVizLoader`                      | Salish Sea marine diatoms (Data Paper II)              |

The bioReportR story page of `../howe-sound-mapping-2026` also belongs here. It consumes this package (as
`imerss-bioinfo`) with its own `infusion-6` dependency. Its tests are run with `node test/i6/all.js --stories`.

Tests:
 - `npm test` (`test/i6/all.js`) runs the node tests of the `.viz` package and the query language, the QUnit
   component tests under `test/i6/html`, and the hydration round trips.
 - `npm run test:browser` (`test/i6/browserDemos.js`) runs the declarative demo scripts in `test/i6/browser/*.json`.
   These deliver real mouse and keyboard input to the pages. They currently cover `indexBeasAtlas.html` only.

## 2. Intermediate: Infusion 4, MapLibre, preact-signals

These are built from `src/client/js/new/` (`fluidNew.js`, `imerss-new.js`, `newChecklist.js`, `taxonDisplay.js`).
They run on Infusion 4 and add preact-signals for reactivity. The map is MapLibre, and the checklists are rendered in a
newer style. No page in this repository drives this generation. It is consumed by the story maps in sibling
checkouts, e.g. `../xetthecum-storymap-story`, which depends on `infusion` 4.6.0 and `imerss-bioinfo` 1.12.0 and
copies these files in through its `config.json5`. The Infusion 6 port in `src/client/js/i6/` began as a port of this
generation. Its filters (`src/client/js/new/filters.js`) have since been removed here.

## 3. Legacy: Infusion 4, Leaflet, jQuery UI

These are built from the top-level modules of `src/client/js/`: `imerss-viz.js`, `checklist.js`, `leafletMap*.js`,
`xetthecum.js`, `tabs.js`, `autocomplete.js`, `renderSVG.js` and `datasetControls.js`. They load Infusion 4 script by
script from `node_modules/infusion/src`, along with jQuery UI and Leaflet, and draw the taxonomy as a D3 sunburst.

 - Development pages: `indexWithMap.html`, `indexWithJustMap.html`, `indexWithMapHoweSoundGridded.html`,
   `indexWithMapHoweSoundScrolly.html`, `indexWithMapPepiowelh.html`, `indexWithMapValdes.html`,
   `indexWithMapXetthecumII.html` and `indexWoL.html`
 - Built pages in `docs/`: `Comprehensive Lists.html`, `Data Paper Part I Visualisation.html`,
   `Galiano Life List.html`, `Pe'pi'ow'elh.html`, `Squamish Life List.html`, `Valdes Island Biodiversity.html`,
   `Xetthecum.html`, `Xetthecum WoL.html`, `dataPaperSunburstAndMap.html` and `index.html`

None of these has automated tests.
