import type { PlanetMapConfig } from '../PlanetMapData';

/** The Lantern Bay's deck plan for the surface chart. Mirrors VessekScene's layout; update both together. */
export const VESSEK_MAP: PlanetMapConfig = {
  planetId: 'vessek',
  name: 'Vessek Anchorage',
  tagline: 'Twenty-one stranded ships and one very old ring',
  accentColor: '#e8dcc4',
  bounds: { minX: -26, maxX: 26, minZ: -38, maxZ: 14 },
  pois: [
    { id: 'airlock', label: 'Airlock to the Wren', kind: 'landing', x: 2, z: 11 },
    { id: 'varro', label: 'Harbormaster Varro', kind: 'npc', x: -2.6, z: -2.3 },
    { id: 'ledger', label: 'The Anchorage ledger', kind: 'lore', x: -5.2, z: 0.6, discoveredFlag: 'vessek_ledger_read' },
    { id: 'plate', label: 'Ring plate', kind: 'lore', x: 2.2, z: -8.6, discoveredFlag: 'vessek_plate_read' },
    { id: 'gauge', label: 'The bus gauge', kind: 'objective', x: 5.8, z: -11 },
    { id: 'dace', label: 'Dace', kind: 'npc', x: -17, z: 6.5 },
    { id: 'dace_duct', label: 'Dace’s duct', kind: 'hazard', x: -18, z: -12, discoveredFlag: 'vessek_lockout_dock' },
    { id: 'hall_duct', label: 'The hall duct', kind: 'hazard', x: 6, z: -14, discoveredFlag: 'vessek_lockout_lamps' },
    { id: 'hydroponics', label: 'Hydroponics tanker', kind: 'resource', x: 0, z: -26 },
    { id: 'junction', label: 'Aft junction', kind: 'objective', x: 18, z: -28, discoveredFlag: 'vessek_junction_reset' },
  ],
  // Mirrors layout.ts's rooms and tubes; update them together.
  terrain: [
    { x: 0, z: 0, w: 16, d: 24, elevation: 0.3, kind: 'terrace', labelKey: 'map.vessek.region.hall' },
    { x: -18, z: 6, w: 12, d: 12, elevation: 0.3, kind: 'terrace', labelKey: 'map.vessek.region.school' },
    { x: 0, z: -26, w: 16, d: 20, elevation: 0.3, kind: 'terrace', labelKey: 'map.vessek.region.tanker' },
    { x: 18, z: -28, w: 12, d: 16, elevation: 0.3, kind: 'terrace', labelKey: 'map.vessek.region.junction' },
    { x: -10, z: 6, w: 4.9, d: 2.4, elevation: 0, kind: 'ramp' },
    { x: -2, z: -14, w: 2.4, d: 4.9, elevation: 0, kind: 'ramp' },
    { x: 10, z: -30, w: 4.9, d: 2.4, elevation: 0, kind: 'ramp' },
  ],
};
