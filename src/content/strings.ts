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

  // MG2 Canopy (src/planets/kethra/canopy).
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
  'mg3.objective': 'Cross the Heart’s chamber to the call-stone without the Wickmoth seeing your light.',
  'mg3.eyebrow': 'The Heart’s chamber',
  'mg3.status.perched': 'It is watching.',
  'mg3.status.notice': 'It has seen your light.',
  'mg3.status.glide': 'It is coming.',
  'mg3.status.search': 'It is searching.',
  'mg3.status.fan': 'It fans its wings.',
  'mg3.status.relocate': 'It is moving.',
  'mg3.key.hood': 'Hood the lantern',
  'mg3.key.crouch': 'Crouch',
  'mg3.rite.eyebrow': 'The Rite · breath {n} of 3',
  'mg3.rite.rule': 'Breathe only while it looks away.',
  'mg3.rite.wait': 'Let it settle first.',
  'mg3.rite.locked': 'The order of the colours is in the inscriptions on the terraces.',
  'mg3.rite.hint': 'Archaeology 3: the inscriptions begin with {colour}.',
  'mg3.colour.azure': 'Azure',
  'mg3.colour.amber': 'Amber',
  'mg3.colour.verdant': 'Verdant',
  'mg3.orion.enter': 'ORION: It reads light. Hold F or the right mouse button to hood the lantern.',
  'mg3.orion.flare': 'ORION: The glowcap flared and it turned to look. Light draws it.',
  'mg3.orion.gust': 'ORION: It fanned you back to the last lamp. No harm done.',
  'mg3.orion.ledge': 'ORION: It’s gone up on the gate. From that high, low cover won’t hide you.',
  'mg3.orion.stone': 'ORION: The call-stone. Three breaths in the true order, while it looks away.',
  'mg3.orion.held': 'ORION: It felt that. It’s coming closer.',
  'mg3.orion.wrong': 'ORION: Wrong colour. The water’s turned.',
  'mg3.orion.ritual': 'ORION: That’s the Rite as the Aiveth sing it. It has never once worked.',
  'mg3.orion.seen': 'ORION: It saw you breathe.',
  'mg3.orion.wake': 'ORION: The Heart’s awake. Look at the terraces.',
  'mg3.stat.perception': 'Perception 2: its gaze shows earlier and brighter.',
  'mg3.stat.traversal': 'Traversal 2: quicker with the lantern hooded.',
  'mg3.stat.insight': 'Insight 3: its next perch is marked.',

  // First light (src/ship/FirstLight.ts).
  'firstlight.orion.plot': 'ORION: Plot holds. {cells} cells.',
  'firstlight.hold': 'Hold to fire the drive',

  // The cruise (src/galaxy/CruiseScene.ts).
  'cruise.orion.burn': 'ORION: Burn started. {days} days.',
  'cruise.orion.day3': 'ORION: Day three. Nothing to report. That’s the good kind.',
  'cruise.day': 'Day {day}',
  'cruise.title.vessek': 'Vessek Anchorage',

  // MG1 Intercept (src/galaxy/intercept).
  'mg1.eyebrow': 'Plot a course',
  'mg1.title': 'Connect to Kethra',
  'mg1.objective': 'Connect the Wren’s course to Kethra.',
  'mg1.hop.how': 'ORION is taking us out of our own debris to the buoy. Each dot is one day of flight: 8 Mkm at cruise.',
  'mg1.hop.orion': 'ORION: Clearing our own debris first. Then Kethra.',
  'mg1.how': 'Drag the gold handle onto Kethra’s path. Kethra keeps moving, so plug in where it will be on the day we get there.',
  'mg1.orion': 'ORION: Drag our course onto Kethra’s path. Where will it be when we arrive?',
  'mg1.now.orion': 'ORION: That’s where Kethra is now. It won’t still be there when we arrive.',
  'mg1.hint.path': 'ORION: Grab the gold handle and drop it on one of Kethra’s blue markers.',
  'mg1.hint.day': 'ORION: Our arrival day hardly changes. Find Kethra’s marker with the same number.',
  'mg1.ready.orion': 'ORION: Same day, same place. Launch when you’re ready.',
  'mg1.legend.label': 'What the colours mean',
  'mg1.legend.you': 'Our course: drag it',
  'mg1.legend.kethra': 'Kethra, day by day',
  'mg1.legend.ok': 'Correct',
  'mg1.check.path': 'On Kethra’s path',
  'mg1.check.path.todo': 'Drop the handle on a blue marker.',
  'mg1.check.path.ok': 'Plugged into a marker.',
  'mg1.check.day': 'Same day as Kethra',
  'mg1.check.day.todo': 'We have to get there on the day Kethra does.',
  'mg1.check.day.now': 'Kethra is here now, but we need {we} days. It will have moved on.',
  'mg1.check.day.late': 'We arrive day {we}, Kethra passes on day {day}. Too late.',
  'mg1.check.day.early': 'We arrive day {we}, Kethra comes on day {day}. Too early.',
  'mg1.check.day.ok': 'Both of us on day {day}. Intercept.',
  'mg1.nudge.later': 'Try a later day',
  'mg1.nudge.sooner': 'Try an earlier day',
  'mg1.chip.drag': 'Drag me',
  'mg1.chip.wren': 'We arrive: day {day}',
  'mg1.chip.kethra': 'Kethra: day {day}',
  'mg1.chip.kethraNow': 'Kethra: now',
  'mg1.chip.now': 'Kethra now',
  'mg1.status.run': 'Day {day} of {days}',
  'mg1.win.eyebrow': 'Course plotted',
  'mg1.win.days': 'Days',
  'mg1.win.cells': 'Cells',
  'mg1.win.orion': 'ORION: Course plotted. Margin included. You’re welcome.',
  'mg1.label.kethra': 'Kethra',
  'mg1.label.wren': 'Wren',
  'mg1.label.day': 'Day {day}',
  'mg1.key.mouse': 'Mouse',
  'mg1.key.drag': 'drag the handle',
  'mg1.key.or': 'or',
  'mg1.key.step': 'step a day',
  'mg1.key.launch': 'Launch',
  'mg1.key.launchWait': 'Launch: needs two ✓',
  'mg1.autoplot': 'Let ORION connect it',
  'mg1.stat.insight': 'Insight 2: you read Kethra’s motion at a glance. The meeting day is marked.',

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
  'map.vessek.region.hall': 'Lantern Bay',
  'map.vessek.region.school': 'School hold',
  'map.vessek.region.tanker': 'Hydroponics tanker',
  'map.vessek.region.junction': 'Aft junction',

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
  // Back aboard after MG1: the one thing to do next, and what's there if the player wants it.
  'objective.exploreKethra': 'Explore Kethra: set course at the navigation console.',
  'objective.exploreKethra.note': 'Optional: read the travel logs, or check the damage at the repair station.',
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
