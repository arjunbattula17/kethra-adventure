import type { PlanetMapConfig } from '../PlanetMapData';

export const KETHRA_MAP: PlanetMapConfig = {
  planetId: 'kethra',
  name: 'Kethra',
  tagline: 'Terraced ruins beneath a bioluminescent canopy',
  accentColor: '#4fd98a',
  bounds: { minX: -25, maxX: 25, minZ: -23, maxZ: 23 },
  pois: [
    { id: 'landing_pad', label: 'Landing Site', kind: 'landing', x: 0, z: 18 },
    { id: 'warden', label: 'Warden Corvenna', kind: 'npc', x: -3, z: 3 },
    { id: 'archivist', label: 'Fen Larkspur', kind: 'npc', x: 3, z: 4 },
    { id: 'shrine', label: 'Grove Shrine', kind: 'lore', x: -1.5, z: 5 },
    { id: 'valve', label: 'Lower Valve', kind: 'resource', x: 2.5, z: 8 },
    { id: 'fragment_1', label: 'Inscription — Outer Terrace', kind: 'lore', x: -16, z: -3, discoveredFlag: 'kethra_fragment_1_read' },
    { id: 'fragment_2', label: 'Inscription — Lower Terrace', kind: 'lore', x: 16, z: -3, discoveredFlag: 'kethra_fragment_2_read' },
    { id: 'fragment_3', label: 'Inscription — Inner Approach', kind: 'lore', x: -20, z: -8, discoveredFlag: 'kethra_fragment_3_read' },
    { id: 'wickmoth_den', label: "The Wickmoth's Den", kind: 'hazard', x: 0, z: -11 },
    { id: 'cistern_heart', label: 'The Cistern Heart', kind: 'objective', x: 0, z: -17 },
    { id: 'kindling_carving', label: 'Last Kindling Carving', kind: 'lore', x: -2.6, z: -17.5, discoveredFlag: 'kethra_kindling_record' },
  ],
};
