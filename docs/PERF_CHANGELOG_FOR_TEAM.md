# Performance Changelog (for the team)

Every optimization, why it mattered, the number it moved, and two sentences you can say to a judge.
The raw numbers are in `PERF_LOG.md` and `docs/perf/`; the full picture is in `PERF_AUDIT.md`.

**How we measured:** `tools/perf-run.mjs` opens the game in Chrome with the CPU slowed down 6×,
the network limited to 10 Mbps with nothing cached, and a 1366×768 window, like a school
Chromebook. It records load times, frame times, stutters, draw calls and memory. It can't slow down
the graphics card, so the real Chromebook test (TESTING_ON_A_REAL_CHROMEBOOK.md) still matters.

---

### 1. The light budget in the Wren
- **Why:** three.js copies the lighting code once per point light into every shader (the small
  programs the graphics card runs to draw surfaces). The Wren had 41 point lights and about 93
  shaders, so a fresh browser spent over a minute preparing them before the game could start.
- **Number:** cold start to the intro on the dev PC went from 64.8 s to 30.1 s (16 lights), and to
  22.4 s on the Performance tier (8 lights). Simulated Chromebook at Low: 66.6 s → 23.3 s.
- **Look:** across five views of the room the average pixel changed by 2 out of 255.
- **Say it:** "Every light in a scene gets written into every shader, so our 41 lights made the first
  load take over a minute. We kept the 16 that actually light the room and cut that load in half,
  and we measured that the picture barely changed."

### 2. Fewer lights and hulls in Vessek Anchorage
- **Why:** the same lighting cost as above, and each freighter parked outside the windows costs
  about eleven draw calls (a draw call is one "draw this" instruction from the CPU to the graphics
  card; slow CPUs run out of time sending them).
- **Number:** point lights 20 → 12; hulls 12 → 8, which took Vessek from 26.3 fps to 50.3 fps on the
  simulated Chromebook.
- **Say it:** "Lamps in a row now share one light, and we parked eight ships outside instead of
  twelve. On our slow-laptop test that doubled the frame rate in level 3."

### 3. No garbage in the game loop
- **Why:** creating new objects every frame makes the browser pause to clean up memory ("garbage
  collection"), which shows up as random stutters.
- **What:** the player controller and input code now reuse the same few objects every frame, and
  the quality governor sorts its data every 30 frames instead of every frame.
- **Say it:** "Our game loop reuses the same objects every frame instead of making new ones. That
  stops the browser from pausing to clean up memory in the middle of play."

### 4. Memory that no longer climbs
- **Number:** looping through every level twice, the old build's memory roughly doubled each loop
  (+96.5%); the new build's went down (−10.3%).
- **Say it:** "We played through every level twice in a row and measured memory each time. It used
  to double every loop; now it settles."

### 5. Recovering from a graphics reset
- **Why:** a browser can take the graphics context away (driver hiccup, too many tabs). The default
  result is a permanently black screen.
- **Number:** after a simulated reset the room came back at brightness 36.5 (the reflection map was
  lost); after rebuilding it, 67.9, matching 65.0 before the reset.
- **Say it:** "If the browser resets the graphics card, the game says so and puts everything back,
  including the reflections. Without that, the player would be staring at a black screen."

### 6. "Graphics unavailable" screen
- **Why:** some school Chromebooks switch WebGL off. The game used to show a black page.
- **Say it:** "The very first thing the game checks is whether the browser can draw 3D. If it can't,
  it explains why and what to try, in plain words."

### 7. Hidden tabs, focus and battery
- **What:** a hidden tab stops drawing and goes silent; switching away pauses the game; below 20%
  battery and unplugged, the game draws at most 30 frames a second.
- **Say it:** "When you switch tabs, the game stops using your computer. On a low battery it halves
  its work so the laptop lasts through the judging."

### 8. Real loading progress
- **What:** a loading bar that fills as the game actually builds the scene, with what it's doing.
- **Say it:** "The loading bar is driven by real steps, not a spinner. A judge can see the game is
  working, not frozen."

### 9. Clean console
- **What:** replaced two deprecated three.js features (`Clock`, soft shadow maps) that printed
  warnings on every load.
- **Say it:** "We keep the browser console free of errors and warnings. It's the first place a
  technical judge looks."

### Tried and dropped
- Giving small props plain colours on the Performance tier cut draw calls from 661 only to 637, so we
  took it back out. Measuring first is why we didn't keep code that didn't help.

### Still open
- The Wren still sends about 650 draw calls a frame, from about 350 separately textured props, and
  runs around 23 fps on the simulated Chromebook. The planned fix is a texture atlas: pack the small
  textures into a few big ones so the props can be drawn together.

---

## How to talk about performance

1. "We tested on a simulated school Chromebook, with the processor slowed six times and a slow
   network, not just on our own computers."
2. "Our biggest win came from measuring: 41 lights were being copied into every shader, and keeping
   the 16 that matter cut the first load from over a minute to about 30 seconds."
3. "The game picks a quality level for your computer automatically, and a laptop on the Performance
   setting gets the same game with simpler lighting."
4. "We tried some optimizations that didn't help enough, and we took them back out, because every
   change had to earn its place with a number."
5. "The game handles the bad cases on purpose: no 3D graphics, a graphics reset, blocked storage, a
   hidden tab, and a low battery."
