export interface PlanetDefinition {
  id: string;
  name: string;
  tagline: string;
  color: number;
  radius: number;
  orbitRadius: number;
  orbitAngle: number;
  hasRing: boolean;
  mapX: number;
  mapY: number;
}

export const PLANETS: PlanetDefinition[] = [
  {
    id: 'kethra',
    name: 'Kethra',
    tagline: 'Terraced ruins beneath a bioluminescent canopy.',
    color: 0x4f8f6a,
    radius: 5.2,
    orbitRadius: 60,
    orbitAngle: 0.6,
    hasRing: false,
    mapX: 30,
    mapY: 55,
  },
  {
    id: 'vessek',
    name: 'Vessek Anchorage',
    tagline: 'A shattered ring-station civilization clinging to the void.',
    color: 0x8a7bb0,
    radius: 4.2,
    orbitRadius: 95,
    orbitAngle: 2.1,
    hasRing: true,
    mapX: 55,
    mapY: 30,
  },
  {
    id: 'orrun',
    name: "Orrun's Reach",
    tagline: 'A storm-wracked desert world of buried machinery.',
    color: 0xb0703f,
    radius: 6.0,
    orbitRadius: 130,
    orbitAngle: 4.0,
    hasRing: false,
    mapX: 72,
    mapY: 60,
  },
  {
    id: 'isilthe',
    name: 'Isilthe',
    tagline: 'An ocean moon where an ancient signal still sings.',
    color: 0x3f7fb0,
    radius: 4.8,
    orbitRadius: 165,
    orbitAngle: 5.3,
    hasRing: true,
    mapX: 48,
    mapY: 78,
  },
];
