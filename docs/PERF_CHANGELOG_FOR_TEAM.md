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

### 10. The game measures the computer before you play
- **What:** while the loading screen is still up, the game draws twelve hidden frames of the ship,
  times them, and picks the quality tier from what it measured, not only from the graphics chip's
  name. If it has to lower quality later, the full change waits for the next level transition.
- **Why it mattered:** before, a slow computer found out mid-play and kept its heaviest effects.
- **Number it moved:** on the simulated Chromebook, Kethra 26 → 35 fps and Vessek 22 → 46 fps.
- **Say it:** "Before you see the first frame, the game quietly draws a few frames and times them,
  so a slow laptop starts on the right settings. It tells you once, and you can change it back in
  Settings."

### 11. A second visit is fast
- **What:** nothing new in the code; this is a measurement. Browsers keep the graphics programs
  the game compiles on the first visit.
- **Number:** first visit 32.1 s to playable, second visit 3.9 s (`tools/warm-load.mjs`).
- **Say it:** "The first load compiles the graphics programs once, and the browser keeps them.
  Reloading gets you back in under four seconds."

### Tried and dropped
- Giving small props plain colours on the Performance tier cut draw calls from 661 only to 637, so we
  took it back out. Measuring first is why we didn't keep code that didn't help.

---

## 2026-09-27: tested on a real school-class laptop

Everything above was measured on a desktop with a gaming graphics card and a slowed-down processor,
which can't show what a weak graphics chip does. This pass was measured on an ordinary laptop with
Intel UHD graphics (an i5-1035G1), the kind of machine the game has to run on. The numbers are in
`PERF_LOG.md` and `docs/perf/igpu-before` / `igpu-after`.

### 12. Lights only do work where they reach
- **Why:** three.js works out every light for every pixel, even a light 10 metres away whose glow
  can't reach it. The Wren has 16 short-range lights, so most of that work added zero.
- **What:** one line added to three.js's lighting code at start-up: skip a light that can't reach
  this pixel.
- **Number:** the Wren's Performance frame went from 30.5 ms to 23.8 ms. Screenshots before and after
  differ by less than two runs of the old build differ from each other.
- **Say it:** "The graphics card was doing the lighting maths for lights that were too far away to
  matter. We told it to skip those, and the ship got 22% faster with a pixel-identical picture."

### 13. Cheaper smoothing on Balanced
- **Why:** 4× multisampling (the smoothing of jagged edges) was over a third of every Balanced frame
  on Intel graphics.
- **What:** Balanced now uses FXAA, a one-pass edge smoother. Quality keeps multisampling.
- **Number:** the Wren on Balanced went from 77 ms a frame (13 fps) to 36 ms (28 fps).
- **Say it:** "We measured each effect separately, found that edge smoothing cost more than everything
  else together on a laptop, and swapped it for a cheaper method that looks almost the same."

### 14. No more freezes the first time you look around
- **Why:** the browser prepares each object for the graphics card the first time it's drawn. The
  loading screen only prepared what the camera could see, so turning around froze the game: half a
  second in the Wren, 1.6 seconds in the Anchorage, up to 5.5 seconds in the galaxy reveal (where the
  4096-pixel sky arrived partway through the cinematic).
- **What:** behind the loading screen, the game now draws everything in the level once, and waits
  for every image before the level starts.
- **Number:** the worst frame on the first look around: Wren 480 → 71 ms, Anchorage 1,614 → 94 ms,
  galaxy reveal 2,641 → 16 ms.
- **Say it:** "We found the stutters by timing every frame, not just the average. They came from work
  the browser did the first time you saw something, so we moved all of it behind the loading screen."

### 15. Fewer draw calls in the Wren
- **Why:** each draw call has a fixed cost on both the processor and the graphics card.
- **What:** the merging pass now also merges repeated bolts and rivets (instanced pieces) and the
  consoles you can interact with, and the renderer groups objects that use the same shader.
- **Number:** facing the navigation console, 520 → 377 draw calls and 215 → 84 shader switches; the
  processor's time sending the frame fell by about a third.
- **Say it:** "The console was drawn as hundreds of separate pieces because the game needs to know
  when you aim at it. We draw it as a few merged pieces now and keep the originals invisible, just
  for aiming."

### 16. Kethra's shadows drawn once
- **What:** Kethra redrew its whole shadow map every frame, though nothing that casts a shadow
  moves. It now paints it once, like the other two levels.
- **Say it:** "The grove's shadows never change, so we calculate them once instead of 60 times a
  second."

### 17. A steady frame rate instead of a jumpy one
- **What:** on Auto, the game now recognises an Intel UHD laptop and starts on Performance straight
  away (before, it prepared Balanced first and then redid everything). If a level still can't hold
  about 45 fps, it holds a steady 30 in that level instead of jumping between 30 and 60.
- **Number:** on the test laptop, Kethra, the Anchorage and the galaxy reveal hold 60 fps; the Wren
  holds 30 with its worst frame at 35 ms and none over 50 ms. A first visit from New game to walking
  around the Wren went from ~85 s to ~36 s, because the graphics are prepared once, not twice.
- **Say it:** "A steady 30 feels smoother than a frame rate that keeps jumping, so on a laptop that
  can't hold 60 in the ship, the game locks to 30 there, and goes back to 60 in levels that can."

### 18. Small things that add up
- The title screen's planet no longer repaints itself 60 times a second (it slides instead).
- Nothing in the game loop creates garbage for the memory cleaner anymore: aiming, footsteps, the
  cinematic camera and the engine trail reuse their objects.
- Kethra no longer searches its whole scene for the floating motes every frame.

### Tried and dropped (this pass)
- Drawing near objects first to skip hidden pixels: 6% *slower*, because it switched shaders more.
- Turning off normal maps (surface detail) on Performance: under 3% faster, not worth the flatter look.
- Half the lights on Performance: 8% faster, not worth a visibly different room.

### Still open
- Facing the Wren's console costs about 31 ms a frame on Intel UHD graphics. What's left is the
  lighting maths itself, with many lights overlapping there. That's why the Wren runs at a steady 30
  on such a laptop. Getting it to 60 would mean simpler lighting in that room on Performance, which
  is a look decision for the team.

### Still open
- The Wren still sends about 650 draw calls a frame, from about 350 separately textured props, and
  runs around 23 fps on the simulated Chromebook. The planned fix is a texture atlas: pack the small
  textures into a few big ones so the props can be drawn together.

---

## 2026-09-29 and 30: the overhaul build on the Intel UHD laptop

Measured on the same laptop as above, in installed Chrome, with nothing cached (not even the
graphics driver's own shader cache): the way a judge first meets the game.

### 19. The Wren is ready when the intro ends
- **Why:** the Wren's shaders took 27 seconds to prepare on a first visit, and the intro is 24, so a
  loading bar followed the intro. Three.js writes the lighting code out once per light, and the
  laptop's shader compiler is very slow on that.
- **What:** the first Wren of a session starts on "quick" shaders that loop over the lights instead
  (7 seconds to prepare). They draw a little slower, so while you play the tutorial the full-speed
  shaders are prepared in the background and swapped in, a few materials a frame. Nothing on screen
  changes when they swap.
- **Number:** end of the intro to walking in the Wren: 6.0 s → 1.1–1.3 s; New game to walking in the
  Wren: 38 s → 31 s.
- **Say it:** "The ship's shaders used to take longer to prepare than our intro, so players waited
  after it. Now the ship starts on simpler shaders that are ready in time, and quietly upgrades to
  the full ones while you play."

### 20. Vessek is ready when you dock
- **Why:** level 3 was only built once the docking cruise had finished, so its title card held for
  about 24 seconds. It couldn't be built during the cruise because it was one big job that froze the
  flight.
- **What:** Vessek is now built in small pieces with frames drawn in between, starting when the cruise
  starts, like Kethra.
- **Number:** leaving the Wren to walking in Vessek: 74 s → 50–54 s; the cruise's worst frame 333 → 166 ms.
- **Say it:** "We cut level 3's build into small pieces so it can happen during the flight, and the
  docking title no longer waits."

### 21. No more hiccups in the cruise and the canopy dive
- **Why:** a shader is prepared for an exact set of lights and fog. Hiding the moth (with its light)
  at the start of MG2, and switching fog on as the skiff drops into Kethra's sky, each needed shaders
  that hadn't been prepared, so the game stopped to make them.
- **Number:** the cut into MG2 went from a 468 ms freeze to 59 ms at worst; the skiff's descent from a
  466 ms freeze to 150 ms at worst.
- **Say it:** "We built a tool that names any shader made while you're watching, and fixed the two
  places it found."

### 22. Levels don't keep their textures after you leave
- **Why:** every level's image files stayed in graphics memory for the rest of the session. On a
  laptop that shares its memory with the graphics chip, that pushed the Wren from 231 MB to 409 MB
  after visiting both planets, and is the likely cause of a one-time 7-second freeze we saw when
  returning aboard.
- **Number:** 231 MB aboard at any point in the game; Kethra 144 → 103 MB, Vessek 339 → 224 MB.
- **Say it:** "When you leave a level, we give its graphics memory back, so the game uses the same
  memory aboard the ship at the end as at the start."

### 23. The Wren runs faster than a steady 30 on a slow laptop
- **Why:** on the test laptop the Wren's frame is almost all lighting maths per pixel. The
  post-processing is only half a millisecond of it.
- **What:** when a level can't hold about 45 fps on Performance, the game first tries drawing at 85%
  resolution. If that holds, it keeps it; if not, it goes back to full resolution at a steady 30, as
  before.
- **Number:** the Wren now settles at about 45–56 fps on that laptop, Vessek at 55–60. Kethra's
  heaviest views still end at a steady 30.
- **Say it:** "On a weak laptop the game trades a little sharpness for smoothness when that's enough
  to run well, and only falls back to a steady 30 when it isn't."

### Tried and dropped (this pass)
- Quick shaders for every level: they draw 6–16% slower, so only the first Wren uses them, and only
  until the full ones are ready.
- Simplified reflections: faster to prepare, but the room looked flatter.
- Six lights instead of eight on Performance: 12% faster to prepare, but the console loses its glow.

### Still open
- Kethra's heaviest views still run at a steady 30 on the test laptop.
- A crash (the browser closed) happened once on the way to Vessek on 2026-09-29 and hasn't happened
  since: not in three retries that day, nor in any of today's runs through the whole game. The most
  likely cause, graphics memory growing through the session, is fixed (22).

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
