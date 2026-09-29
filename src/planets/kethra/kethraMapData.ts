import type { PlanetMapConfig } from '../PlanetMapData';

export const KETHRA_MAP: PlanetMapConfig = {
  planetId: 'kethra',
  name: 'Kethra',
  tagline: 'Terraced ruins beneath a bioluminescent canopy',
  accentColor: '#4fd98a',
  bounds: { minX: -25, maxX: 25, minZ: -36, maxZ: 23 },
  pois: [
    { id: 'landing_pad', label: 'Landing Site', kind: 'landing', x: 0, z: 18 },
    { id: 'warden', label: 'Warden Corvenna', kind: 'npc', x: -3, z: 3 },
    { id: 'archivist', label: 'Fen Larkspur', kind: 'npc', x: 3, z: 4 },
    { id: 'shrine', label: 'Grove Shrine', kind: 'lore', x: -1.5, z: 5 },
    { id: 'valve', label: 'Lower Valve', kind: 'resource', x: 2.5, z: 8 },
    { id: 'fragment_1', label: 'Inscription — Outer Terrace', kind: 'lore', x: -16, z: -3, discoveredFlag: 'kethra_fragment_1_read' },
    { id: 'fragment_2', label: 'Inscription — Lower Terrace', kind: 'lore', x: 16, z: -3, discoveredFlag: 'kethra_fragment_2_read' },
    { id: 'fragment_3', label: 'Inscription — Inner Approach', kind: 'lore', x: -20, z: -8, discoveredFlag: 'kethra_fragment_3_read' },
    { id: 'wickmoth_den', label: "The Wickmoth's Den", kind: 'hazard', x: -5.2, z: -31.9 },
    { id: 'cistern_heart', label: 'The Cistern Heart', kind: 'objective', x: 0, z: -21.8 },
    { id: 'kindling_carving', label: 'Last Kindling Carving', kind: 'lore', x: -4.1, z: -10.1, discoveredFlag: 'kethra_kindling_record' },
  ],
  // Mirrors the slabs KethraScene.buildTerraces() places (makeTerrace(width, depth, x, y, z) and
  // the makeRamp spans) and the Heart's chamber (hush/sim.ts: a ring of radius 12.5 about (0,
  // -21.8), charted as its bounding square). Update them together.
  terrain: [
    { x: 0, z: 16, w: 10, d: 10, elevation: 0, kind: 'terrace', labelKey: 'map.kethra.region.landing' },
    { x: 0, z: 2, w: 16, d: 16, elevation: 0, kind: 'terrace', labelKey: 'map.kethra.region.plaza' },
    { x: -7, z: 10, w: 4, d: 8, elevation: 0, kind: 'ramp' },
    { x: 7, z: 10, w: 4, d: 8, elevation: 0, kind: 'ramp' },
    { x: -16, z: -2, w: 10, d: 9, elevation: 0.6, kind: 'terrace', labelKey: 'map.kethra.region.west' },
    { x: 16, z: -2, w: 10, d: 9, elevation: 0.6, kind: 'terrace', labelKey: 'map.kethra.region.east' },
    { x: 0, z: -21.8, w: 25, d: 25, elevation: 1.1, kind: 'terrace', labelKey: 'map.kethra.region.chamber' },
    { x: -9.5, z: -0.5, w: 3.6, d: 5, elevation: 0.3, kind: 'ramp' },
    { x: 9.5, z: -0.5, w: 3.6, d: 5, elevation: 0.3, kind: 'ramp' },
    { x: 0, z: -6.65, w: 6, d: 5.3, elevation: 0.55, kind: 'ramp' },
    { x: -20, z: -8, w: 3, d: 3, elevation: 2.4, kind: 'ledge' },
    { x: -20.6, z: -4.65, w: 2.6, d: 4.3, elevation: 1.7, kind: 'ramp' },
  ],
};
