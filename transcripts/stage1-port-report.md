# Infusion 6 port - stage 1 report

The inventory and gap report is written, and the port looks feasible, so it has started here on the branch
`infusion-6-port`. The ported core runs in headless Chromium against the real BCBA data: 2,538 records load, both
checklists render, the map shows its tiles and observation grid, and checking a bee family filters to 235 records.
68 node tests pass and lint is clean. Nothing is committed.

**Report:** `fluid-infusion-6/a-scratch/reports/requirements-imerss.md`, next to the existing reports there, since the
Infusion 6 repo has no top-level `reports/`. It maps every Infusion 4 feature used onto its Infusion 6 equivalent and
covers the tricky corners. These Infusion 6 framework gaps matter most:

- **G2, the one real blocker.** After one write tagged with a source is excluded by `excludeSource`, later untagged
  writes to the same cell never reach that effect either. Reproduced on raw cells. This blocks the howe-sound story
  page's interplay between hash changes and the user's pane changes.
- **G1.** The docs say `$compute` accepts async functions, but it delivers the Promise itself. Returning a cell from
  the `$compute` works instead.
- **G4.** A selector like `{vizLoader hortis.obsFilter}` re-delivers a fresh array whenever the tree changes underneath
  it. The filter pipeline ran 13 times at start-up and 3 times for one click. The port works around it by reusing the
  previous output when the surviving rows are identical.
- **G11.** A checkbox in a `$for` row writes back only to the row, not to the shared state it came from. Writes
  through the component itself do reach it, so the port routes changes that way.
- **G5 and G6** affect only howe-sound: there's no ordered event replacement for its widget-binding grades, and no way
  to configure `$for` members from data.

**The tricky corners, as ported:**

- **Map `onLoad`:** a chain of bindables (`map` → `loadedMap` → `fillPatternsLoaded` → `styledMap`), so effects simply
  wait on `styledMap`. A test against a fake maplibre checks the ordering. In the real browser, the map stalled until
  `{diff: false}` was passed to `setStyle`: maplibre treats an identical style as no change and fires no `styledata`
  event.
- **Checklist diamond:** default fold state plus a user-selection overlay, as the editor's `fluid.substrateTree` does
  it. This removes every `invokeLater`/`peek` workaround. A test confirms the interactions table is computed once per
  filter change, and that selections survive rows being filtered out and back.
- **Checklist trees:** a computed VNode tree with one delegated click handler.
- **HashManager:** a reactive record plus a `pushState` effect that does nothing when the URL already matches. That
  covers the old `excludeSource: "init"` and doesn't need G2 fixed. It's tested against a fake window; howe-sound
  doesn't use it yet.

**In this repository (all new, untracked):** `src/client/js/i6/` holds six modules alongside the Infusion 4 code, so
existing drivers keep working. There are tests under `test/i6/` and a driver page, `indexBeasBCBA-6.html`. The page
loads Infusion 6 from the sibling `../fluid-infusion-6` checkout, so serve it from the parent directory. The npm
release predates fixes the port needs. Run the tests from here with:

```
node ../fluid-infusion-6/tests/test-core/qunit/js/fqunit-cli.js test/i6/html/BbeaCoreTests.html test/i6/html/BbeaMapTests.html test/i6/html/HashManagerTests.html
```

**Still to port:**

- **Filters and controls:** region, collector and elevation filters, checklist search, tooltips, and the polygon
  drawing tool.
- **Page shell:** the filter sections don't open yet because their open/close behaviour isn't ported. Grips and view
  tabs are also still to do.
- **Views pane:** network, matrix, taxon lists, abundance and seed mix are empty.
- **Howe-sound** is the last stage of the report's suggested order.
