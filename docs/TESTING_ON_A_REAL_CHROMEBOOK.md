# Testing on a Real Chromebook (and a Mac)

Our performance numbers come from a simulated slow laptop that can't slow down the graphics chip.
This checklist is how the team confirms the real thing. It takes about 30 minutes per device.
Record results in PROGRESS.md under the date, one line per device.

## Before you start
- Borrow a school Chromebook, the more ordinary the better. Note its model (Settings → About
  ChromeOS) and battery level.
- If you can, also borrow a **Mac with Safari**. Our WebKit test on Windows showed a black 3D view
  after starting from the title screen (see PERF_AUDIT.md, Browsers), and only a real Safari can tell
  us whether players will see it.
- Use the live link (DEPLOY.md). Open it in a **new Incognito/Private window**, so nothing is cached,
  like a judge's first visit.
- Have a phone stopwatch ready.

## 1. Loading
- [ ] Time from pressing Enter on the URL to the title screen appearing. (Our simulation: 1–2 s.)
- [ ] Press **New game** and time until the intro starts moving. (Our simulation: 23 s at the
  Performance tier.) Watch the loading bar: does it move, or sit still for a long time?
- [ ] Did any error or blank screen appear? Screenshot it.

## 2. Which quality tier it picked
- [ ] Once on the ship, press **O** (Settings). Under Graphics, the hint says "Running now: …".
  Write down the tier it chose (Performance, Balanced or Quality).

## 3. How each level feels
Play at least one minute in each place and rate it: smooth / some stutter / hard to play.
- [ ] **The Wren** (the ship): walk the whole room, turn quickly with the mouse. This is the heaviest
  scene; our simulation gives about 23 fps.
- [ ] **Kethra**: run up the ramps to the Cistern Heart. (Simulation: about 48 fps.)
- [ ] **Vessek Anchorage**: look out of the east windows; trigger the power cut. (Simulation: about
  50 fps.)
- [ ] If a place stutters, set Settings → Quality to **Performance** and rate it again.

Shortcut to reach the levels quickly on a test device: add `?skipIntro=1&unlockVessek=1&newGame=1`
to the URL, then open the map at the ship's console.

## 4. Sound
- [ ] After the first click, is there music on the ship? Do buttons make soft clicks?
- [ ] Switch to another tab for 10 seconds and back: sound should stop while away, and the game
  should be paused when you return.

## 5. The bad cases
- [ ] **No graphics:** if the school has WebGL switched off, the game should show "This browser
  can't draw the game" with three suggestions, not a black page. (Chrome: Settings → System → "Use
  graphics acceleration when available" off, then restart the browser.)
- [ ] **Storage blocked:** in an Incognito window with third-party cookies/site data blocked, start a
  new game and change a setting. The game should play normally; settings just won't be remembered
  next time.
- [ ] **Battery:** unplug below 20% and play the Wren for a minute. It should still run (capped at
  30 fps), not heat up the laptop badly.

## 6. On the Mac (Safari)
- [ ] Open the link in Safari, click **New game** from the title screen, let the intro play, and
  skip it with Space.
- [ ] **Is the ship visible, or is the 3D area black with only the text showing?** This is the issue
  we saw in WebKit on Windows. If it's black, write it down straight away. It's the most important
  result on this list.
- [ ] Travel to Kethra and Vessek and check they draw.

## What to write in PROGRESS.md
```
Device: <model>, ChromeOS <version>, battery <n>%
Title: <s>  Intro: <s>  Tier chosen: <name>
Wren: <smooth/stutter/hard>  Kethra: <…>  Vessek: <…>
Sound OK: <yes/no>  No-graphics screen OK: <yes/no/not tested>
Safari (Mac): ship visible after title → New game: <yes/NO>
Notes: <anything odd, with screenshot names>
```
