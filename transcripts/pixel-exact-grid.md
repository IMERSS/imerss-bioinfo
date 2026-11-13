## User

Yup that is updated now. The new cell borders look little better than the old ones in a zoomed browser. In bagatelle/zoomed-grid.png is a scaled-up, unresampled rendering of the map pixels showing that various anti-aliasing tricks are combining to give a blotchy, irregular appearance to the grid cells. In particular where some are back to back, they can coincide to give a thicker-seeming border, and where they are isolated, the four sides of a single cell can appear quite different, depending on quite where the subpixel extents of the four sides lie. I imagine that the opacity situation is also fighting us here, but I'm happy to have the cell borders completely opaque but I fear this won't totally resolve the issue. Can you think of a way that lies within the capability of WebGL and MapLibre to have cell boundaries that are precisely one pixel thick, of a given colour and which never double up on one another regardless of where subpixel coordinates of adjacent cells fall?

---

## Claude

Yes. A MapLibre **custom layer** can draw the cell boundaries with WebGL's own `gl.LINES`. That gives lines exactly one device pixel wide, in a single opaque colour, with no doubling. Here's why the current approach can't get there, and what I'd do instead.

**Why the line layer can't be fixed by tuning**
1. **Each cell outlines itself.** Every cell is a separate polygon, so a shared edge is drawn twice. At the grid's 0.6 opacity the two passes compound into a darker, apparently thicker line, and their anti-aliased fringes add up too.
2. **The widths are in CSS pixels, at geographic positions.** A width of 1 at 125% zoom is 1.25 device pixels, and each edge lands at an arbitrary sub-pixel offset. MapLibre's line shader always anti-aliases over about one device pixel, so each edge spreads over two pixels in its own proportions. That's why the four sides of a lone cell look different. Setting the width to `1 / devicePixelRatio` doesn't fix it: the line is still blended across two pixels unless it happens to sit on a pixel centre, and nothing in the style language can snap it there.
3. **The fills anti-alias too.** With `fill-antialias` on, which is the default, each cell's edge is a partial-coverage fringe. Neighbouring cells' fringes overlap at a shared edge and leave a seam of their own.

**What will work, within WebGL and MapLibre**
- **Draw the outline with a custom layer.** `map.addLayer({type: "custom", render(gl, matrix) {…}})` hands us MapLibre's projection matrix and its WebGL context, inside its own render pass, so the layer pans and zooms with the map. I'd draw the outline as `gl.LINES` with `lineWidth` 1 and blending off, or with a constant alpha for the fade. WebGL rasterises such lines without anti-aliasing, using the diamond-exit rule: every segment lights exactly one device pixel across its width, at any zoom.
- **Build the edges so none is drawn twice.** Each cell already sits at integer grid coordinates, which the quantiser computes. I'd emit each cell's four edges keyed by their grid coordinates, keep each edge only once, and merge collinear runs into long segments. Then no pixel is touched twice, even where edges meet, and the outline can be any colour and any opacity without darkening at shared edges.
- **Turn off fill anti-aliasing:** `"fill-antialias": false` on `obsgrid-layer`. WebGL's triangle rules then cover each pixel along a shared edge exactly once, so neighbouring fills meet with no seam and no overlap, and the outline sits on top.

**Limits**
- **Spacing:** a single-pixel line can't be placed at a fractional position. Where the true edge falls between pixels, the rasteriser picks one, so the gap between outlines can vary by a pixel from cell to cell. Each outline stays one crisp pixel wide, though, and none doubles.
- **Line widths over 1:** most browsers cap `gl.lineWidth` at 1, so this technique is limited to exactly one device pixel. That suits what you're asking for, and `outlineWidth` would go back to meaning "one device pixel" or nothing.
- **Code to maintain:** the custom layer needs about a hundred lines of its own: a small shader, a vertex buffer rebuilt whenever the grid's data changes, and the fade driven from `gridOpacity` (MapLibre's paint transitions don't apply to custom layers). Hover, click and tap still work from the fill layer, so nothing else changes.

Shall I implement it in `libreMap.js`? I'd replace `obsgrid-outline-layer` with the custom layer, set `fill-antialias: false` on the fills, and make the outline opaque by default, as you suggested.

---

## User

And of course for this solution to work regardless of the browser's zoom level

---

## Claude

Yes, and with one caveat it already holds. Browser zoom changes `devicePixelRatio`, and MapLibre sizes its canvas's backing store in device pixels. `gl.LINES` with width 1 is one *framebuffer* pixel, so at any zoom level that is one physical pixel, provided MapLibre keeps the backing store in step with the zoom. I'll check that it does, and how it rounds the canvas size, since that decides whether the browser rescales the canvas:

Now the implementation in `libreMap.js`: the custom outline layer, the edges deduplicated across cells, `fill-antialias: false`, and pixel-exact canvas tracking:

I'll simplify to always use the local Web Mercator projection, since MapLibre's `MercatorCoordinate` isn't reachable from the map instance. Then I'll run the tests:

The map tests use a `FakeMap` without a canvas or `matchMedia`. I'll check which methods it provides:

Suites are back to baseline. Fixing the lint complaint by using the `performance` global:

Lint passes. The real test is pixel analysis of the rendered map at several emulated zooms. I'll check for a PNG decoder:

The cells have crisp, even single-pixel outlines. A final hydration round trip:

The grid cells now have outlines exactly one device pixel wide at any browser zoom, with no doubling where cells meet and no anti-aliasing blur. I measured this at six emulated zoom levels. Nothing is committed.

**What changed in `libreMap.js`**
1. **A custom WebGL outline layer:** `hortis.libreMap.gridOutlineLayer` draws the outlines with `gl.LINES` at width 1. Unlike MapLibre's own lines, these aren't anti-aliased: each lights exactly one pixel of the drawing buffer across its width. It replaces the earlier line layer, and keeps its id, `obsgrid-outline-layer`.
2. **Each edge drawn once:** `hortis.libreMap.gridEdges` collects each edge only once, however many cells share it. WebGL also lights no pixel twice where one line ends and the next begins, so shared edges are no darker or thicker than lone ones.
3. **Fills meet cleanly:** the fill layer now has `"fill-antialias": false`, so each pixel along a shared edge belongs to exactly one cell, with no overlapping fringes.
4. **Every canvas pixel lands on one screen pixel:** `hortis.libreMap.trackPixels` corrects MapLibre's canvas sizing.
   - **The problem:** MapLibre rounds the backing store down to whole device pixels but displays it across the container's CSS width. At fractional zooms the browser then rescales the whole canvas.
   - **The fix:** after every resize, the canvas's CSS size is set to its backing size divided by the pixel ratio.
   - **Zoom changes:** `devicePixelRatio` is watched with `matchMedia`, and the map is resized when it changes.
5. **Smaller details:**
   - The outline is opaque by default (`outlineOpacity: 1`) and fades with the grid over the same 400ms.
   - Vertices are stored relative to an origin, with the projection offset done in double precision, so 32-bit floats don't make the outlines jitter.
   - `outlineWidth` is gone: a WebGL line is always exactly one device pixel, which most browsers also cap it at.

**Measured** on `indexBeasOBA.html`, zoomed in, by copying the map's canvas inside MapLibre's `render` event and scanning every third row:

| Zoom | Backing store | Displayed across | Vertical outline crossings | 2px runs | Anti-aliased dark pixels |
| --- | --- | --- | --- | --- | --- |
| 100% | 1045px | 1045.000 | 2691, all 1px | 0 | 0 |
| 110% | 1149px | 1149.005 | 3123, all 1px | 0 | 0 |
| 125% | 1306px | 1306.000 | 3501, all 1px | 0 | 0 |
| 150% | 1567px | 1567.005 | 4480, all 1px | 0 | 0 |
| 175% | 1828px | 1827.997 | 5469, all 1px | 0 | 0 |
| 200% | 2090px | 2090.000 | 6021, all 1px | 0 | 0 |

The residues of a few thousandths of a pixel come from the browser storing CSS sizes in 1/64-pixel units. That's far too small to resample.

**Tests:** BbeaCoreTests 124/124, BbeaViewsTests 49/49 and both hydration round trips pass, and ESLint is clean. BbeaMapTests is still 20/21, with only the `performance.now` failure that was already there. Its fake map has no WebGL, so the new outline layer and pixel tracking are skipped there, and are verified only by the browser measurements above.

**Limits**
- **Rounding of edge positions:** where an edge truly falls between two pixels, WebGL puts the line on one of them. The spacing between outlines can differ by a pixel from cell to cell, but each line is always one crisp pixel.
- **Lines thicker than 1px:** not possible with this technique.
- **The headless check:** the measurements came from emulated zoom in headless Chrome. On a real screen, Chrome normally places the map's canvas on whole device pixels. If any blur remains at some zoom, the canvas's sub-pixel offset on the page would be the next thing to correct.
