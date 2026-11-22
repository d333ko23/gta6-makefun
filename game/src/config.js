// MIDNIGHT MERIDIAN — every tuning number and colour in one place.
// A top-down open-world night city: the world is 3200 x 3200 world units, the
// camera follows the player, and the renderer paints a fixed 1280 x 720 view.

export const WORLD = { width: 3200, height: 3200 };

/** City grid: roads run every BLOCK + ROAD units, leaving square blocks. */
export const CITY = {
  roadWidth: 96,
  blockSize: 304,
  /** Roads are centred on multiples of this pitch. */
  pitch: 400,
  /** Sidewalk strip around each block, walkable but not drivable. */
  sidewalk: 18,
};

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** The view the renderer paints: a fixed logical area scaled to the window. */
export const VIEW = { width: 1280, height: 720 };

export const PLAYER = {
  radius: 13,
  walkSpeed: 210,
  sprintSpeed: 330,
  health: 100,
  /** Seconds a police car must stay in contact to bust a player on foot. */
  bustTime: 1.4,
};

export const CAR = {
  length: 54,
  width: 28,
  accel: 420,
  brake: 700,
  reverseAccel: 240,
  maxSpeed: 560,
  maxReverse: 180,
  turnRate: 2.6,
  drag: 0.55,
  /** How close the player must be to enter a car. */
  enterRadius: 46,
};

export const TRAFFIC = {
  count: 14,
  speed: 150,
  minGap: 90,
};

export const PEDS = {
  count: 18,
  walkSpeed: 55,
  fleeSpeed: 130,
};

export const POLICE = {
  /** Wanted stars above which the matching number of patrol cars hunt the player. */
  maxCars: 5,
  chaseSpeed: 430,
  patrolSpeed: 160,
  ramDamage: 8,
  ramCooldown: 1.4,
  /** Seconds of no crime before one star fades, while no police car can see the player. */
  decaySeconds: 18,
  /** Distance under which a police car "sees" the player and blocks decay. */
  sightRange: 520,
};

export const WANTED_MAX = 5;

export const MISSIONS = [
  {
    id: 'first-run',
    title: 'JOB 1 — FIRST RUN',
    brief: 'Marla Voss needs a package moved. Pick it up at the docks, then drop it at Neon Plaza.',
    payout: 250,
  },
  {
    id: 'street-collection',
    title: 'JOB 2 — STREET COLLECTION',
    brief: 'Five cash drops are waiting around Meridian Bay. Pick them all up — and stay out of trouble.',
    payout: 400,
  },
  {
    id: 'the-getaway',
    title: 'JOB 3 — THE GETAWAY',
    brief: 'The crew is hot. Lose the heat and reach the safehouse garage. Do not get busted.',
    payout: 650,
  },
];

export const BEST_KEY = 'midnight-meridian.best';
export const SAVE_KEY = 'midnight-meridian.save';

export const PALETTE = {
  backdrop: '#070a14',
  nightSky: '#0b1024',
  road: '#232838',
  roadLine: '#8a8f5a',
  sidewalk: '#31364a',
  grass: '#12291d',
  park: '#0f2a1c',
  water: '#0a2036',
  buildingRoof: '#2c3145',
  buildingEdge: '#454b66',
  windowLit: '#ffd76a',
  windowDark: '#1a1e30',
  player: '#ffb02e',
  playerOutline: '#7a4d00',
  ped: '#7fd4c1',
  pedFlee: '#ff7a6b',
  trafficCar: '#9aa3b8',
  police: '#3f6df6',
  policeLight: '#ff3b30',
  objective: '#ffe14d',
  cash: '#37e08b',
  safehouse: '#37e0c8',
  hudPanel: 'rgba(8, 11, 22, 0.78)',
  hudText: '#f2f4fa',
  hudMuted: '#9aa3b8',
  star: '#ffd23e',
  starEmpty: '#3a415c',
  healthGood: '#37e08b',
  healthBad: '#ff5347',
  title: '#ffe14d',
  danger: '#ff5347',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
