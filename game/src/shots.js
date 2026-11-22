// The screenshot scenes behind ?shot=start|play|chase|end. Each one plays the
// real rules forward from a fresh world for a fixed number of steps, steered
// by a simple autopilot (walk to a parked car, steal it, then drive the road
// grid toward the mission objective), so the frame is what a short game
// really looks like and the same seed always gives the same frame.

import { STEP } from './config.js';
import { isOnRoad, nearestRoadPoint, routeTarget } from './city.js';
import { EVENT_BUSTED, EVENT_WIN } from './world.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN } from './render.js';

const START_SECONDS = 5;
const PLAY_SECONDS = 42;
const CHASE_SECONDS = 48;
const END_LIMIT_SECONDS = 180;
const WIN_LIMIT_SECONDS = 600;

const ACTION_ENTER = 4;
const ACTION_ATTACK = 8;

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

function angleDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

/**
 * The next waypoint toward a target while driving: off the road grid, head
 * for the nearest road point first; on it, follow the route's pure-pursuit
 * target so the car never aims through a city block.
 */
function driveWaypoint(x, y, tx, ty) {
  if (!isOnRoad(x, y)) return nearestRoadPoint(x, y);
  return routeTarget(x, y, tx, ty);
}

/** Steering input that drives the player's car toward a point. The vector
 * shortens near the point, so the car slows for a turn instead of
 * overshooting the intersection. The direction is raw: the car's own rules
 * decide how fast to turn toward it. With `fullThrottle` the vector stays
 * length 1, for running a pedestrian down at speed. */
function driveInput(car, tx, ty, fullThrottle = false) {
  const targetAngle = Math.atan2(ty - car.y, tx - car.x);
  const magnitude = fullThrottle ? 1 : clamp(dist(car.x, car.y, tx, ty) / 160, 0.3, 1);
  return { x: Math.cos(targetAngle) * magnitude, y: Math.sin(targetAngle) * magnitude };
}

/** Steering input that walks the player toward a point. */
function walkInput(x, y, tx, ty) {
  const d = Math.max(1, dist(x, y, tx, ty));
  return { x: (tx - x) / d, y: (ty - y) / d };
}

function nearestStealable(state) {
  let best = null;
  let bestDist = Infinity;
  for (const car of state.cars) {
    if (!car.active || car.kind === 'police') continue;
    const d = dist(state.player.x, state.player.y, car.x, car.y);
    if (d < bestDist) { bestDist = d; best = car; }
  }
  return best;
}

function nearestPed(state) {
  let best = null;
  let bestDist = Infinity;
  for (const ped of state.peds) {
    if (ped.mode === 'down') continue;
    const d = dist(state.player.x, state.player.y, ped.x, ped.y);
    if (d < bestDist) { bestDist = d; best = ped; }
  }
  return best;
}

function nearestPolice(state) {
  let best = null;
  let bestDist = Infinity;
  for (const car of state.cars) {
    if (!car.active || car.kind !== 'police') continue;
    const d = dist(state.player.x, state.player.y, car.x, car.y);
    if (d < bestDist) { bestDist = d; best = car; }
  }
  return best;
}

/**
 * One autopilot step: returns { input, sprint, actions } for the world.
 * `mode` is 'drive' (steal a car, drive to the objective), 'chase' (the same,
 * but run pedestrians down until the wanted level hits 3) or 'busted'
 * (steal a car, get out, and let the police take the player in).
 * Exported so a test harness can step it one frame at a time.
 */
export function autopilot(state, world, mode, memory) {
  const player = state.player;
  let input = { x: 0, y: 0 };
  let actions = 0;

  if (mode === 'busted') {
    if (player.inCar) {
      actions |= ACTION_ENTER;
      return { input, sprint: false, actions };
    }
    if (state.wanted === 0) {
      const car = nearestStealable(state);
      if (car && dist(player.x, player.y, car.x, car.y) < 46) actions |= ACTION_ENTER;
      else if (car) input = walkInput(player.x, player.y, car.x, car.y);
      return { input, sprint: false, actions };
    }
    // Walk the road grid toward the nearest patrol car and let it corner the player.
    const cop = nearestPolice(state);
    if (cop) {
      const waypoint = driveWaypoint(player.x, player.y, cop.x, cop.y);
      input = walkInput(player.x, player.y, waypoint.x, waypoint.y);
    }
    return { input, sprint: false, actions };
  }

  // Get into a car first. In chase mode the heat comes first: punch two
  // pedestrians on foot (two stars), then steal a car (the third), so three
  // patrol cars are hunting the player by the time they drive off.
  if (!player.inCar) {
    if (mode === 'chase' && state.wanted < 2) {
      const ped = nearestPed(state);
      if (ped) {
        if (dist(player.x, player.y, ped.x, ped.y) < 52) actions |= ACTION_ATTACK;
        else input = walkInput(player.x, player.y, ped.x, ped.y);
        return { input, sprint: true, actions };
      }
    }
    const car = nearestStealable(state);
    if (!car) return { input, sprint: false, actions };
    if (dist(player.x, player.y, car.x, car.y) < 46) actions |= ACTION_ENTER;
    else input = walkInput(player.x, player.y, car.x, car.y);
    return { input, sprint: mode === 'chase', actions };
  }

  // Driving: pick a target point — the mission objective, reached through
  // the grid waypoints.
  const target = state.objective;
  const waypoint = driveWaypoint(player.x, player.y, target.x, target.y);

  // Stuck against a building: with the car's turn-in-place rules a stall
  // usually means it is rotating toward the waypoint, so give it time
  // instead of reversing into the turn.
  const waypointDist = dist(player.x, player.y, waypoint.x, waypoint.y);
  memory.progressTimer += STEP;
  if (waypointDist < memory.lastWaypointDist - 2) {
    memory.lastWaypointDist = waypointDist;
    memory.progressTimer = 0;
  } else if (memory.progressTimer > 5) {
    memory.progressTimer = 0;
    memory.lastWaypointDist = waypointDist;
  }
  input = driveInput(player.inCar, waypoint.x, waypoint.y);
  return { input, sprint: false, actions };
}

/**
 * Set `world` to the named scene (start, play, chase or end; any other name
 * is start) and return the screen to draw over it and the best score to show.
 */
export function stageShot(name, world) {
  world.reset();
  const state = world.state;
  const memory = { progressTimer: 0, lastWaypointDist: Infinity };
  if (name !== 'play' && name !== 'chase' && name !== 'end' && name !== 'win') {
    for (let index = 0; index < START_SECONDS / STEP; index += 1) {
      world.step(STEP, { x: 0, y: 0 }, false, 0, true);
    }
    return { screen: SCREEN_TITLE, best: 0 };
  }
  const mode = name === 'end' ? 'busted' : name === 'win' ? 'drive' : name;
  const limit = name === 'end' ? END_LIMIT_SECONDS : name === 'chase' ? CHASE_SECONDS : name === 'win' ? WIN_LIMIT_SECONDS : PLAY_SECONDS;
  for (let index = 0; index < limit / STEP; index += 1) {
    const controls = autopilot(state, world, mode, memory);
    const events = world.step(STEP, controls.input, controls.sprint, controls.actions, false);
    if (events & (EVENT_BUSTED | EVENT_WIN)) break;
  }
  const over = state.over;
  return {
    screen: over ? (state.won ? SCREEN_WIN : SCREEN_OVER) : SCREEN_PLAY,
    best: state.score,
  };
}
