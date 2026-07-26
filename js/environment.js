// environment.js — biome definitions for mid-run environment cycling.
// highway palette matches the original hardcoded scene/road colors exactly.

export const ENVIRONMENTS = {
  highway: {
    id: 'highway',
    name: 'HIGHWAY',
    sky: 0x87ceeb,
    fog: 0x87ceeb,
    fogNear: 60,
    fogFar: 240,
    ground: 0x2e7d32,
    asphalt: 0x2b2b33,
    sunColor: 0xfff5e0,
    sunIntensity: 1.6,
    sunPos: [-30, 50, 20],
    hemiSky: 0xbfe3ff,
    hemiGround: 0x3a5f2a,
    hemiIntensity: 0.9,
    isNight: false,
    scenery: { trees: true, palms: false, cacti: false, rocks: false, buildings: false, poles: true },
  },
  beach: {
    id: 'beach',
    name: 'BEACH',
    sky: 0xafe3ff,
    fog: 0xcdeaff,
    fogNear: 60,
    fogFar: 250,
    ground: 0xe3cf9a,
    asphalt: 0x33332b,
    sunColor: 0xffffff,
    sunIntensity: 1.9,
    sunPos: [-30, 55, 20],
    hemiSky: 0xd6f0ff,
    hemiGround: 0xd9c98a,
    hemiIntensity: 0.9,
    isNight: false,
    scenery: { trees: false, palms: true, cacti: false, rocks: true, buildings: false, poles: true },
  },
  desert: {
    id: 'desert',
    name: 'DESERT',
    sky: 0xffb74d,
    fog: 0xffcc80,
    fogNear: 50,
    fogFar: 220,
    ground: 0xc4a35a,
    asphalt: 0x3a3428,
    sunColor: 0xffe0b2,
    sunIntensity: 1.8,
    sunPos: [-40, 35, 15],
    hemiSky: 0xffcc80,
    hemiGround: 0x8d6e63,
    hemiIntensity: 0.85,
    isNight: false,
    scenery: { trees: false, palms: false, cacti: true, rocks: true, buildings: false, poles: false },
  },
  // City = night-like dark biome; player headlights auto-enable via isNight
  city: {
    id: 'city',
    name: 'CITY',
    sky: 0x1a237e,
    fog: 0x283593,
    fogNear: 40,
    fogFar: 200,
    ground: 0x263238,
    asphalt: 0x1c1c22,
    sunColor: 0xb39ddb,
    sunIntensity: 1.1,
    sunPos: [-20, 40, 30],
    hemiSky: 0x5c6bc0,
    hemiGround: 0x37474f,
    hemiIntensity: 0.7,
    isNight: true,
    scenery: { trees: false, palms: false, cacti: false, rocks: false, buildings: true, poles: true },
  },
};

export const ENV_LIST = Object.keys(ENVIRONMENTS);

/** Pick a random biome, optionally excluding one by id or env object. */
export function randomEnv(except) {
  const exceptId = except && (except.id || except);
  const pool = ENV_LIST.filter((id) => id !== exceptId);
  const pick = pool.length ? pool : ENV_LIST;
  return ENVIRONMENTS[pick[(Math.random() * pick.length) | 0]];
}

/** Resolve an id string or env object to a full env definition. */
export function resolveEnv(envOrId) {
  if (!envOrId) return ENVIRONMENTS.highway;
  if (typeof envOrId === 'string') return ENVIRONMENTS[envOrId] || ENVIRONMENTS.highway;
  if (envOrId.id && ENVIRONMENTS[envOrId.id]) return ENVIRONMENTS[envOrId.id];
  return envOrId;
}
