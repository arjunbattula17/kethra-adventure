# The overhaul's final screenshots (2026-10-25)

The whole journey, title to ending, on the game code at `3763abc`, captured with
`node tools/capture-journey.mjs <dir> --sizes=... --tiers=...` on this PC's GPU (RTX 4060, installed
Chrome). Timed beats are shot with the game clock frozen, so each is the same frame on any run.
JPEG q90, as for the milestone sets.

- `low-1920x1080/`, `high-1920x1080/`: all 62 shots on each preset.
- `ui-low-1280x720/`, `ui-low-1440x900/`, `ui-low-2560x1080/`: the shots that test layout (the
  title, the HUD aboard, the three panels, MG1's plate, the ending's summary) at the brief's other
  three sizes. All 62 shots at every size and on both presets (496) were looked at; the rest are not
  committed for size.

No console errors or warnings in any of the runs. docs/PROGRESS.md (QA log, 2026-10-25) lists what
the matrix found and what was fixed.
