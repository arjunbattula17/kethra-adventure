export type PoiKind = 'npc' | 'lore' | 'objective' | 'hazard' | 'landing' | 'resource';

export interface PlanetMapPoi {
  id: string;
  label: string;
  kind: PoiKind;
  x: number;
  z: number;
  /** Optional gameState flag — POI stays greyed out / unlabeled until this flag is set. */
  discoveredFlag?: string;
}

/** A walkable slab drawn on the surface chart, in world units (centre x/z, width along x, depth
 * along z). `elevation` shades higher ground lighter; ramps draw as connectors. */
export interface PlanetMapTerrain {
  x: number;
  z: number;
  w: number;
  d: number;
  elevation: number;
  kind: 'terrace' | 'ramp' | 'ledge';
  /** String-table key for a region label, drawn at the slab's centre. */
  labelKey?: string;
}

export interface PlanetMapConfig {
  planetId: string;
  name: string;
  tagline: string;
  accentColor: string;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  pois: PlanetMapPoi[];
  terrain?: PlanetMapTerrain[];
}
