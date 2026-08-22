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

export interface PlanetMapConfig {
  planetId: string;
  name: string;
  tagline: string;
  accentColor: string;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  pois: PlanetMapPoi[];
}
