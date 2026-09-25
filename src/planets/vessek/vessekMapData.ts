import type { PlanetMapConfig } from '../PlanetMapData';

/** The Lantern Bay's deck plan for the surface chart. Mirrors VessekScene's layout; update both together. */
export const VESSEK_MAP: PlanetMapConfig = {
  planetId: 'vessek',
  name: 'Vessek Anchorage',
  tagline: 'Twenty-one stranded ships and one very old ring',
  accentColor: '#e8dcc4',
  bounds: { minX: -11, maxX: 11, minZ: -14, maxZ: 14 },
  pois: [
    { id: 'airlock', label: 'Airlock to the Wren', kind: 'landing', x: 2, z: 11 },
    { id: 'dace', label: 'Dace', kind: 'npc', x: -5.9, z: 5.2 },
    { id: 'varro', label: 'Harbormaster Varro', kind: 'npc', x: -2.6, z: -2.3 },
    { id: 'ledger', label: 'The Anchorage ledger', kind: 'lore', x: -5.2, z: 0.6, discoveredFlag: 'vessek_ledger_read' },
    { id: 'breakers', label: 'Breaker gallery', kind: 'objective', x: 4.6, z: -10.8 },
    { id: 'plate', label: 'Ring plate', kind: 'lore', x: 2.2, z: -8.6, discoveredFlag: 'vessek_plate_read' },
    { id: 'hydroponics', label: 'Hydroponics bay', kind: 'resource', x: -4.7, z: -8.4 },
    { id: 'duct', label: 'Dace’s duct', kind: 'hazard', x: -7.2, z: 3.4, discoveredFlag: 'vessek_valve_opened' },
  ],
  terrain: [
    { x: 0, z: 9.5, w: 15.1, d: 4.1, elevation: 0, kind: 'terrace', labelKey: 'map.vessek.region.collar' },
    { x: 0, z: 0, w: 15.1, d: 14.9, elevation: 0.3, kind: 'terrace', labelKey: 'map.vessek.region.concourse' },
    { x: -4.7, z: -9.4, w: 5.7, d: 4.3, elevation: 0.6, kind: 'terrace', labelKey: 'map.vessek.region.hydroponics' },
    { x: 4.4, z: -9.4, w: 6.3, d: 4.3, elevation: 0.6, kind: 'terrace', labelKey: 'map.vessek.region.gallery' },
  ],
};
