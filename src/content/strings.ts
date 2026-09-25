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
  'intro.skip': 'Skip',
  'intro.skip.key': 'Space',

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

export function t(key: StringKey): string {
  return STRINGS[key];
}

/** Words in a string, for timing on-screen text by reading pace. */
export function wordCount(text: string): number {
  return text.trim().split(/\s+/).length;
}

/** A string with `{name}` placeholders filled in, e.g. format('map.data.flightValue', { days: 6, margin: 2 }). */
export function format(key: StringKey, values: Record<string, string | number>): string {
  return t(key).replace(/\{(\w+)\}/g, (_, name: string) => String(values[name] ?? `{${name}}`));
}
