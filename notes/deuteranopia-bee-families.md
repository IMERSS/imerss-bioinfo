# Bee family colours for red-green colour blindness

Written 2026-11-17, on a request to adjust the 6 colours of the bee families so that they are as similar as possible
in hue and luminance to the current ones, but minimally likely to be confused by those with red-green colour
blindness. The recommended set below is now applied in `hortis.pollColours`, in `src/client/js/i6/bbea/imerss-bbea.js`.

## Where the colours are used

They are defined in one place, `hortis.pollColours` in `imerss-bbea.js`, so one edit covers the checklists, the
diagrams and the map tooltips. They were ColorBrewer "Set1".

## The current colours' weak pairs

I measured the separation of colours as protanopes and deuteranopes see them, simulated with the Machado (2009) model
at full severity. Distances are ΔEok, the distance between colours in OKLab, a perceptual colour space; bigger means
easier to tell apart. Set1's worst pairs:

- **Blue/purple** (Apidae/Halictidae) under deuteranopia: 0.035, nearly the same colour.
- **Green/orange** (Colletidae/Megachilidae) under protanopia: 0.053.
- **Red/green** (Andrenidae/Colletidae) under deuteranopia: 0.078.

## The search

I searched for the smallest changes in lightness and hue that lift every pair to a target separation for both kinds of
red-green colour blindness, with no colour losing saturation and normal vision kept at least as well separated as
before (0.165). Two sets:

| Family | Set1 | Moderate (all pairs ≥ 0.10) | **Recommended (all pairs ≥ 0.12)** |
|---|---|---|---|
| Andrenidae | `#E41A1C` | `#E4161B` | `#E60916` |
| Apidae | `#377EB8` | `#007AD7` (hue +5°) | `#0178DF` (hue +7°, deeper blue) |
| Colletidae | `#4DAF4A` | `#23B86A` (hue +11°) | `#18B97F` (hue +18°, towards teal) |
| Megachilidae | `#FF7F00` | `#FC7A00` | `#FC7900` |
| Halictidae | `#984EA3` | `#984E9E` | `#9B4D9B` |
| Melittidae | `#ECC846` | `#ECC846` | `#EDC947` |
| Worst pair, colour-blind | 0.035 | 0.100 | 0.120 |
| Worst pair, normal vision | 0.165 | 0.165 | 0.165 |

In the recommended set, Andrenidae, Megachilidae, Halictidae and Melittidae are visually unchanged. Only two colours
visibly move: Colletidae's green shifts towards teal, and Apidae's blue deepens. No colour's lightness moves by more
than 0.024 (on OKLab's 0–1 scale).

Going further costs more. At 0.14, Colletidae has to move 26° towards blue-green. Without the saturation constraint,
the search simply greyed the green out.

These are simulated figures, not tests with colour-blind viewers. They also leave tritanopia (blue-yellow) aside, as
the brief did.

## Method

Each family's colour was varied in OKLCH and kept within sRGB. The cost penalised moving each colour's lightness and
hue from the original - its hue as the arc swept at the original chroma - and penalised loss of chroma as strongly,
while allowing a small gain of chroma at a lower cost. The constraints were a target minimum pairwise ΔEok under the
protanopia and deuteranopia simulations, and normal vision's minimum not falling below Set1's 0.165. The search was a
simulated annealing with several restarts, run as a Python experiment outside the project, and repeated for targets
of 0.10, 0.12 and 0.14.

A first run penalised chroma only lightly, and at a target of 0.12 bought its separation by greying Colletidae out
(chroma 0.167 to 0.049), no longer a recognisable green - hence the stronger penalty on lost chroma.

## Not changed

`hortis.plantColours` still gives Tracheophyta Set1's green, `#4DAF4A`, for the plant side of the bipartite diagram.
It is not one of the six family colours, so was left alone.
