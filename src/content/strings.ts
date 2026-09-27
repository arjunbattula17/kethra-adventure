/**
 * The string table: player-facing text lives here, keyed `area.item`, so a writer or translator can
 * change words without touching scene code. Story facts come from LORE.md; lines here are written
 * from it, never the other way round.
 *
 * Coverage: every string added from the lore pass on is here. Older text (tutorial cards, dialogue
 * trees, journal logs) still sits next to the code that shows it; moving it in is a backlog item.
 */
export const STRINGS = {
  // Opening cinematic. One line on screen at a time; IntroScene times each one at
  // 2.5 s + 0.35 s per word, so edits here retime the sequence automatically.
  'intro.line.background': 'Day 23 past the Kessic Drift, hunting lost ships.',
  'intro.line.event': 'Then the sky went white. The Wren went dark.',
  'intro.line.status': 'Emergency power only. No engines, no charts, no familiar stars.',
  'intro.line.goal': 'Get the Wren flying. Find the way home.',
  'skip.hold': 'Hold to skip',
  'skip.key': 'Space',

  // The reveal (src/galaxy/GalaxyRevealScene.ts), in the letterbox before the ping and after it.
  'reveal.caption.stranded': 'You are stranded, alone, in a galaxy no chart has ever mapped.',
  'reveal.caption.truth': 'Somewhere out there is the truth — and a way home.',

  // MG2 Canopy (src/planets/kethra/canopy). ORION speaks through the skiff.
  'mg2.objective': 'Bring the skiff down through the canopy to the landing terrace.',
  'mg2.eyebrow': 'Descent · layer {n} of 5',
  'mg2.hull': 'Hull',
  'mg2.key.steer': 'Steer',
  'mg2.key.lamp': 'Mouse aims the lamp',
  'mg2.key.brake': 'Brake',
  'mg2.orion.start': 'ORION: Lamp’s yours. The canopy’s asleep: wake what you need.',
  'mg2.orion.pods': 'ORION: No lantern below. Only what you light is there.',
  'mg2.orion.sway': 'ORION: Those limbs are moving. Wait for the gap.',
  'mg2.orion.moth': 'ORION: Something big under us, and it’s lighting the way.',
  'mg2.orion.drop': 'ORION: Landing lights. Narrow drop. Slow and straight.',
  'mg2.orion.climb': 'ORION: Hull’s complaining. Climbing back to where it was clear.',
  'mg2.orion.down': 'ORION: Down. Welcome to Kethra.',
  'mg2.stat.traversal': 'Traversal 2: the skiff answers faster.',
  'mg2.stat.perception': 'Perception 2: pods stay lit longer.',
  'mg2.stat.engineering': 'Engineering 2: a wider lamp.',

  // First light (src/ship/FirstLight.ts).
  'firstlight.orion.plot': 'ORION: Plot holds. {cells} cells.',
  'firstlight.hold': 'Hold to fire the drive',

  // The cruise (src/galaxy/CruiseScene.ts).
  'cruise.orion.burn': 'ORION: Burn started. {days} days.',
  'cruise.orion.day3': 'ORION: Day three. Nothing to report. That’s the good kind.',
  'cruise.day': 'Day {day}',
  'cruise.title.vessek': 'Vessek Anchorage',

  // MG1 Intercept (src/galaxy/intercept). ORION is the Wren's navigation computer.
  'mg1.eyebrow': 'Plot a course · leg {n} of 3',
  'mg1.leg1.title': 'Clear the drift',
  'mg1.leg1.how': 'Aim the burn at ORION’s buoy, then run the plot. Each tick is one day, 8 Mkm apart.',
  'mg1.leg1.objective': 'Plot a course out of the debris to ORION’s buoy.',
  'mg1.leg1.orion': 'ORION: We’re sitting in our own debris. Plot us out to the buoy.',
  'mg1.leg1.done': 'ORION: Clear of the drift. Now the real one.',
  'mg1.leg2.title': 'Lead Kethra',
  'mg1.leg2.how': 'Kethra moves while you fly. Meet it on the same day: put one of your ticks on its tick with the same number.',
  'mg1.leg2.objective': 'Plot an intercept with Kethra.',
  'mg1.leg2.orion': 'ORION: Kethra’s in range. Aim, then run it.',
  'mg1.leg2.done': 'ORION: Intercept holds. Belt scan finishing… ah.',
  'mg1.leg3.title': 'Over the belt',
  'mg1.leg3.how': 'The belt is a wall across the plane. Burn 1 climbs over it; burn 2 leads Kethra from the top.',
  'mg1.leg3.objective': 'Take the course over the belt to Kethra.',
  'mg1.leg3.orion': 'ORION: Nothing gets through the plane. Go over it: two burns.',
  'mg1.hint.lead': 'ORION: Aim for where it will be, on the day you get there.',
  'mg1.fail.contact': 'Belt contact · day {day}',
  'mg1.fail.kethra': 'Kethra was here on day {day} · {miss} Mkm off',
  'mg1.fail.buoy': 'Missed the buoy by {miss} Mkm',
  'mg1.win.eyebrow': 'Course plotted',
  'mg1.win.days': 'Days',
  'mg1.win.cells': 'Cells',
  'mg1.win.orion': 'ORION: Course plotted. Margin included. You’re welcome.',
  'mg1.label.buoy': 'Buoy',
  'mg1.label.kethra': 'Kethra',
  'mg1.label.day': 'Day {day}',
  'mg1.burn': 'Burn {n}',
  'mg1.readout.heading': 'Heading',
  'mg1.readout.cells': 'Cells',
  'mg1.readout.budget': 'Budget',
  'mg1.readout.days': 'Days',
  'mg1.key.run': 'Run the plot',
  'mg1.key.rewind': 'Rewind',
  'mg1.key.less': 'One cell fewer',
  'mg1.key.more': 'One cell more',
  'mg1.key.aim': 'Aim',
  'mg1.key.orbit': 'Drag or WASD to look · scroll to zoom',
  'mg1.stat.insight': 'Insight 2: Kethra’s ghost runs three more days.',
  'mg1.stat.perception': 'Perception 2: the belt’s density shows as shading.',
  'mg1.stat.engineering': 'Engineering 2: one spare cell.',

  // Shown under the spinner while a scene loads. One per load, in order.
  'loading.lore.1': 'Anchorage rule: when the sky goes white, shut everything down.',
  'loading.lore.2': 'The Aiveth say a held colour means more than a spoken word.',
  'loading.lore.3': 'Three ARK Ltd freighters went quiet in the Kessic Drift.',
  'loading.lore.4': 'No Kindling carving mentions a war. Only light, water, and home.',
  'loading.lore.5': 'The Anchorage has tried to leave four times.',
  'loading.lore.6': 'Something under Isilthe’s sea repeats the same signal on a fixed cycle.',

  // Galaxy map: clicking a world whose charts aren't compiled yet shows the scanner's note.
  'map.uncharted.vessek': 'Scanner: about twenty hulls moored in a ring. Some still have power.',
  'map.uncharted.orrun': 'Scanner: metal under the dunes, in shapes that don’t erode.',
  'map.uncharted.isilthe': 'Scanner: the repeating signal originates here, somewhere under the sea.',
  'map.uncharted.default': 'Detailed charts for this world have not been compiled yet.',
  'map.uncharted.kethra': 'Scanner: chlorophyll-analog absorption on the first orbit past the belt.',
  'map.solar.title': 'Solar Chart',
  'map.solar.subtitle': 'Uncharted system · plotted by the Wren',
  'map.hint.solar': 'Click a world to select it · Esc to close',
  'map.hint.surface': 'Scroll to zoom · Esc for the solar chart',
  'map.status.here': 'You are here',
  'map.status.inRange': 'In scanner range',
  'map.status.outOfRange': 'Out of scanner range',
  'map.contact.unresolved': 'Unresolved contact',
  'map.data.orbit': 'Orbit',
  'map.data.distance': 'From the Wren',
  'map.data.flight': 'Flight time',
  'map.data.flightValue': '{days} days + {margin} margin',
  'map.data.rings': 'Rings',
  'map.data.yes': 'Yes',
  'map.data.no': 'No',
  'map.data.unknown': '—',
  'map.action.setCourse': 'Set course',
  'map.action.surface': 'Surface chart',
  'map.action.back': 'Back to solar chart',
  'map.action.noRange': 'Out of range',
  'map.action.here': 'Already here',
  'map.action.notReady': 'No landing charts yet',
  'map.legend.surveyed': 'Surveyed world',
  'map.legend.unsurveyed': 'Unresolved contact',
  'map.legend.wren': 'The Wren',
  'map.legend.range': 'Scanner range',
  'map.legend.belt': 'Asteroid belt',
  'map.label.wren': 'WREN',
  'map.label.star': 'STAR',
  'map.survey.title': 'Survey',
  'map.survey.objective': 'Objective',
  'map.poi.unexplored': 'Unexplored site',
  'map.scale': '10 m',
  'map.kethra.region.landing': 'Landing terrace',
  'map.kethra.region.plaza': 'Grove plaza',
  'map.kethra.region.west': 'West terrace',
  'map.kethra.region.east': 'East terrace',
  'map.kethra.region.chamber': 'Chamber approach',
  'map.vessek.region.collar': 'Docking collar',
  'map.vessek.region.concourse': 'Lantern Bay concourse',
  'map.vessek.region.hydroponics': 'Hydroponics',
  'map.vessek.region.gallery': 'Breaker gallery',

  // Title screen. title.name is the game's working title (DECISIONS D-17): change it here.
  'title.kicker': 'A deep-space survey',
  'title.name': 'Kethra',
  'title.tagline': 'Your ship went dark past the edge of the charts. Wake it up.',
  'title.continue': 'Continue',
  'title.newGame': 'New game',
  'title.controls': 'Controls',
  'title.settings': 'Settings',
  'title.closeHint': 'Esc to close',
  'toast.continue': 'Continuing your saved journey.',
  'toast.saveUnreadable': 'Your saved journey could not be read. Starting a new one.',

  // Controls screen. Keep in step with the code (README.md has the same list).
  'controls.note': 'The game teaches each of these the first time you need it.',

  // Credits. Required attribution for the CC BY assets (docs/ASSET_LICENSE_LOG.md).
  'credits.planets': 'Planet maps adapted from Solar System Scope textures (solarsystemscope.com), based on NASA imagery. CC BY 4.0.',
  'credits.kits': 'Ship interior and grove models: Modular Sci-Fi MegaKit and Stylized Nature MegaKit by Quaternius (quaternius.com). CC0.',
  'credits.textures': 'Surface textures by Poly Haven (polyhaven.com). CC0.',
  'credits.font': 'Rajdhani by Indian Type Foundry, and Atkinson Hyperlegible by the Braille Institute of America. Both SIL Open Font License 1.1.',
  'credits.three': 'Rendering by three.js (threejs.org). MIT License.',
  'credits.original': 'Made by TSA team #____: code, story, characters, sound and procedural art.',

  // The ending (EndingScene): four lines, then the credits.
  'ending.line.1': 'Every name in the Anchorage ledger, and every log the Wren kept.',
  'ending.line.2': 'Light carries them now, out past the Kessic Drift.',
  'ending.line.3': 'Under Isilthe’s sea, the Choir is still singing.',
  'ending.line.4': 'This time, someone knows how to answer it.',
  'ending.lede': 'The Wren woke up, learned to read the light of a dead civilisation, and used it to call for help. Isilthe is next.',

  // Progression.
  'toast.scanner.resolved': 'Deep Scanner online. A ring of ships resolves at 95 Mkm.',
  'objective.afterScanner': 'The scanner found a ring of ships near Vessek. Someone out there still has power.',

  // Painted signage aboard the Wren.
  'sign.helm.code': 'WREN-01',
  'sign.helm.label': 'HELM',

  // Journal: the pre-departure brief, the first entry in the travel logs.
  'log.brief.title': 'Contract Brief — ARK Ltd Survey 7',
  'log.brief.body':
    '"Three freighters on the Kessic Drift run have gone silent in four years: no distress calls, no wreckage. A broker in port sold us a nav fragment from the Drift’s edge showing a star where none is charted. Survey the region, record everything, and turn back at the first sign of trouble. Two crew in cold sleep for the crossing; the survey lead stands watch."',
  'log.brief.timestamp': 'Day 0',
} as const;

export type StringKey = keyof typeof STRINGS;

/** The string for `key`, with any `{name}` placeholders filled from `vars`. */
export function t(key: StringKey, vars?: Record<string, string>): string {
  const s: string = STRINGS[key];
  return vars ? s.replace(/\{(\w+)\}/g, (m, name: string) => vars[name] ?? m) : s;
}

/** Words in a string, for timing on-screen text by reading pace. */
export function wordCount(text: string): number {
  return text.trim().split(/\s+/).length;
}

/** A string with `{name}` placeholders filled in, e.g. format('map.data.flightValue', { days: 6, margin: 2 }). */
export function format(key: StringKey, values: Record<string, string | number>): string {
  return t(key).replace(/\{(\w+)\}/g, (_, name: string) => String(values[name] ?? `{${name}}`));
}
