// MIDNIGHT MERIDIAN's rules and state, with no drawing and no browser in it:
// the player on foot and in cars, traffic and pedestrians, the police and the
// wanted level, the three story missions, combat, money and health. step()
// advances one fixed step and returns what happened as bit flags, so the
// caller can react (sound, announcements) without the world knowing about
// screens or sound. Nothing here allocates after createWorld returns.

import {
  CAR, CITY, MISSIONS, PEDS, PLAYER, POLICE, TRAFFIC, WANTED_MAX, WORLD,
} from './config.js';
import {
  buildCity, circleHitsBuilding, collideCircleBuildings, isOnRoad,
  nearestRoadPoint, randomRoadPoint, randomWalkPoint, routeTarget,
} from './city.js';

export const EVENT_PICKUP = 1;
export const EVENT_MISSION = 2;
export const EVENT_CRIME = 4;
export const EVENT_CRASH = 8;
export const EVENT_PUNCH = 16;
export const EVENT_HIT = 32;
export const EVENT_BUSTED = 64;
export const EVENT_WASTED = 128;
export const EVENT_WIN = 256;
export const EVENT_ENTER = 512;
export const EVENT_HONK = 1024;
export const EVENT_SIREN = 2048;

const TAU = Math.PI * 2;

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

function angleDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

function turnToward(angle, target, maxStep) {
  const d = angleDiff(angle, target);
  if (Math.abs(d) <= maxStep) return target;
  return angle + Math.sign(d) * maxStep;
}

function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

const CAR_COLORS = ['#d94f4f', '#4f7dd9', '#d9c94f', '#4fd9a7', '#b06fd9', '#d97a2e', '#c9c9c9', '#2ed9c9'];
const PED_COLORS = ['#7fd4c1', '#e8a2c8', '#a2c8e8', '#e8d27a', '#c8a2e8', '#8ad98a'];

export function createWorld(random) {
  const city = buildCity(random);
  const player = {
    x: 0, y: 0, angle: -Math.PI / 2, health: PLAYER.health,
    inCar: null, speed: 0, bustProgress: 0, attackCooldown: 0, hurtTimer: 0,
  };
  const cars = [];
  const peds = [];
  const drops = [];
  const state = {
    city, player, cars, peds, drops,
    money: 0, score: 0, wanted: 0, elapsed: 0,
    missionIndex: 0, missionStage: 0,
    objective: { x: 0, y: 0, label: '' },
    banner: { text: '', timer: 0 },
    over: false, overReason: '', won: false,
    decayTimer: 0, quietTimer: 0, sirenTimer: 0,
    dropsLeft: 0, policeCount: 0,
  };

  function showBanner(text, seconds) {
    state.banner.text = text;
    state.banner.timer = seconds;
  }

  function makeCar(x, y, angle, kind, color) {
    return {
      x, y, angle, speed: 0, kind, color,
      active: true, axis: 'x', dir: 1, turnCooldown: 0,
      ramCooldown: 0, stuckTimer: 0, reverseTimer: 0, sirenPhase: random() * TAU,
    };
  }

  function spawnParkedCars() {
    for (let i = 0; i < 9; i += 1) {
      const point = randomRoadPoint(random);
      const vertical = random() < 0.5;
      const offset = (CITY.roadWidth / 2 - 14) * (random() < 0.5 ? -1 : 1);
      const x = vertical ? point.x + offset : point.x;
      const y = vertical ? point.y : point.y + offset;
      const angle = vertical ? (random() < 0.5 ? Math.PI / 2 : -Math.PI / 2) : (random() < 0.5 ? 0 : Math.PI);
      if (dist(x, y, player.x, player.y) < 200) continue;
      cars.push(makeCar(x, y, angle, 'parked', CAR_COLORS[Math.floor(random() * CAR_COLORS.length)]));
    }
  }

  function spawnTraffic() {
    for (let i = 0; i < TRAFFIC.count; i += 1) {
      const point = randomRoadPoint(random);
      const vertical = random() < 0.5;
      const car = makeCar(point.x, point.y, vertical ? Math.PI / 2 : 0, 'traffic',
        CAR_COLORS[Math.floor(random() * CAR_COLORS.length)]);
      car.axis = vertical ? 'y' : 'x';
      car.dir = random() < 0.5 ? 1 : -1;
      if (car.axis === 'y') car.angle = car.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      else car.angle = car.dir > 0 ? 0 : Math.PI;
      car.speed = TRAFFIC.speed * (0.8 + random() * 0.4);
      cars.push(car);
    }
  }

  function spawnPeds() {
    for (let i = 0; i < PEDS.count; i += 1) {
      const point = randomWalkPoint(random, city);
      peds.push({
        x: point.x, y: point.y, angle: random() * TAU,
        color: PED_COLORS[Math.floor(random() * PED_COLORS.length)],
        mode: 'walk', timer: 1 + random() * 3, downTimer: 0, speed: PEDS.walkSpeed,
      });
    }
  }

  function missionObjective() {
    const mission = MISSIONS[state.missionIndex];
    if (!mission) return { x: 0, y: 0, label: '' };
    if (state.missionIndex === 0) {
      return state.missionStage === 0
        ? { x: 600, y: 2800, label: 'PICK UP THE PACKAGE — THE DOCKS' }
        : { x: 800, y: 600, label: 'DELIVER TO NEON PLAZA' };
    }
    if (state.missionIndex === 1) {
      let best = null;
      let bestDist = Infinity;
      for (const drop of drops) {
        if (!drop.active) continue;
        const d = dist(player.x, player.y, drop.x, drop.y);
        if (d < bestDist) { bestDist = d; best = drop; }
      }
      return best
        ? { x: best.x, y: best.y, label: `COLLECT THE CASH — ${state.dropsLeft} LEFT` }
        : { x: 1600, y: 1600, label: 'COLLECTION DONE' };
    }
    return { x: 2400, y: 2600, label: 'REACH THE SAFEHOUSE — LOSE THE HEAT' };
  }

  function startMission(index) {
    state.missionIndex = index;
    state.missionStage = 0;
    if (index === 1) {
      for (let i = 0; i < 5; i += 1) {
        const point = randomRoadPoint(random);
        drops.push({ x: point.x, y: point.y, active: true, amount: 40 });
      }
      state.dropsLeft = 5;
    }
    if (index === 2) {
      addWanted(3);
      showBanner('THE CREW IS HOT — 3 STARS! REACH THE SAFEHOUSE!', 5);
    } else {
      showBanner(`${MISSIONS[index].title} — ${MISSIONS[index].brief}`, 6);
    }
    state.objective = missionObjective();
  }

  function addWanted(amount) {
    const before = state.wanted;
    state.wanted = Math.min(WANTED_MAX, state.wanted + amount);
    state.quietTimer = 0;
    state.decayTimer = 0;
    if (state.wanted > before && state.wanted >= 1) showBanner(`WANTED LEVEL ${state.wanted} — THE MERIDIAN PD IS COMING`, 3);
  }

  function completeMission() {
    const mission = MISSIONS[state.missionIndex];
    state.money += mission.payout;
    state.score += mission.payout;
    const next = state.missionIndex + 1;
    if (next >= MISSIONS.length) {
      state.won = true;
      state.over = true;
      state.overReason = 'win';
      showBanner('ALL JOBS DONE — YOU ARE A MERIDIAN LEGEND', 6);
      return EVENT_WIN | EVENT_MISSION;
    }
    showBanner(`${mission.title} COMPLETE — +$${mission.payout}`, 4);
    startMission(next);
    return EVENT_MISSION;
  }

  function checkMission(events) {
    if (state.over) return events;
    const objective = state.objective;
    if (state.missionIndex === 0) {
      if (dist(player.x, player.y, objective.x, objective.y) < 56) {
        if (state.missionStage === 0) {
          state.missionStage = 1;
          state.objective = missionObjective();
          showBanner('PACKAGE SECURED — NOW DELIVER IT TO NEON PLAZA', 4);
          return events | EVENT_PICKUP;
        }
        return events | completeMission();
      }
    } else if (state.missionIndex === 1) {
      for (const drop of drops) {
        if (drop.active && dist(player.x, player.y, drop.x, drop.y) < 40) {
          drop.active = false;
          state.dropsLeft -= 1;
          state.money += drop.amount;
          state.score += drop.amount;
          events |= EVENT_PICKUP;
          if (state.dropsLeft === 0) return events | completeMission();
          state.objective = missionObjective();
        }
      }
    } else if (state.missionIndex === 2) {
      if (dist(player.x, player.y, objective.x, objective.y) < 64) {
        return events | completeMission();
      }
    }
    return events;
  }

  function nearestCar(maxDist) {
    let best = null;
    let bestDist = maxDist;
    for (const car of cars) {
      if (!car.active || car.kind === 'police') continue;
      const d = dist(player.x, player.y, car.x, car.y);
      if (d < bestDist) { bestDist = d; best = car; }
    }
    return best;
  }

  function enterCar(car) {
    player.inCar = car;
    car.kind = 'player';
    car.speed = 0;
    if (car.driverFled !== true) addWanted(1);
    return EVENT_ENTER | EVENT_CRIME;
  }

  function exitCar() {
    const car = player.inCar;
    if (!car) return 0;
    const sideX = player.x + Math.cos(car.angle + Math.PI / 2) * 40;
    const sideY = player.y + Math.sin(car.angle + Math.PI / 2) * 40;
    player.x = sideX;
    player.y = sideY;
    player.inCar = null;
    car.kind = 'parked';
    car.speed = 0;
    const circle = { x: player.x, y: player.y, radius: PLAYER.radius };
    collideCircleBuildings(city, circle);
    player.x = clamp(circle.x, 20, WORLD.width - 20);
    player.y = clamp(circle.y, 20, WORLD.height - 140);
    return EVENT_ENTER;
  }

  function punch(events) {
    const range = 52;
    let hitAny = false;
    for (const ped of peds) {
      if (ped.mode === 'down') continue;
      const d = dist(player.x, player.y, ped.x, ped.y);
      if (d > range) continue;
      const facing = Math.atan2(ped.y - player.y, ped.x - player.x);
      if (Math.abs(angleDiff(player.angle, facing)) > 1.2) continue;
      ped.mode = 'down';
      ped.downTimer = 4;
      hitAny = true;
      if (random() < 0.5) {
        drops.push({ x: ped.x, y: ped.y, active: true, amount: 20 });
        state.objective = missionObjective();
      }
    }
    if (hitAny) {
      addWanted(1);
      return events | EVENT_PUNCH | EVENT_CRIME;
    }
    return events | EVENT_PUNCH;
  }

  function drivePlayerCar(dt, input) {
    const car = player.inCar;
    const hasInput = input.x !== 0 || input.y !== 0;
    // The input vector's length is the throttle: the autopilot shortens it
    // near a waypoint, so the car slows for a turn instead of overshooting
    // the intersection. A keyboard vector is length 1, full throttle.
    const throttle = Math.min(1, Math.hypot(input.x, input.y));
    // The input is a direction to drive toward, not a throttle pedal: the car
    // turns toward it and only accelerates once it is roughly facing it, so a
    // 150-degree turn never happens at full speed through a city block.
    const desired = hasInput ? Math.atan2(input.y, input.x) : car.angle;
    const diff = angleDiff(car.angle, desired);
    const speedRatio = Math.min(1, Math.abs(car.speed) / CAR.maxSpeed);
    const turnEffect = 0.7 + 0.3 * speedRatio;
    car.angle += clamp(diff, -1, 1) * CAR.turnRate * turnEffect * dt;
    if (hasInput) {
      if (Math.abs(diff) < 1.0) {
        car.speed += CAR.accel * throttle * dt;
      } else if (Math.abs(diff) > 2.4) {
        // Facing the wrong way: stop, spin around in place, then drive off.
        car.speed = Math.max(0, car.speed - CAR.brake * dt);
      } else {
        // Turning hard: scrub speed so the turn stays inside the road.
        car.speed = Math.max(0, car.speed - CAR.brake * 0.5 * dt);
      }
    } else {
      car.speed = Math.max(0, car.speed - CAR.brake * dt);
    }
    car.speed = clamp(car.speed, -CAR.maxReverse, CAR.maxSpeed);
    car.speed -= car.speed * CAR.drag * dt;
    if (Math.abs(car.speed) < 4 && !hasInput) car.speed = 0;
    car.x += Math.cos(car.angle) * car.speed * dt;
    car.y += Math.sin(car.angle) * car.speed * dt;
    car.x = clamp(car.x, 24, WORLD.width - 24);
    car.y = clamp(car.y, 24, WORLD.height - 144);
    // A car's collision circle is smaller than its drawn length, so a car on
    // a road centreline clears the buildings: the road is 96 wide and the
    // circle is 36 across, leaving room to steer without scraping a wall.
    const circle = { x: car.x, y: car.y, radius: 18 };
    if (collideCircleBuildings(city, circle)) {
      // A hard hit bounces the car back; a scrape only scrubs speed, so a
      // car brushing a wall keeps driving instead of grinding to a halt.
      car.speed *= Math.abs(car.speed) > 260 ? -0.3 : 0.85;
      if (Math.abs(car.speed) > 260) {
        state.lastCrash = 1;
      }
      car.x = circle.x;
      car.y = circle.y;
    }
    player.x = car.x;
    player.y = car.y;
    player.angle = car.angle;
    player.speed = Math.abs(car.speed);
  }

  function walkPlayer(dt, input, sprint) {
    const speed = sprint ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
    const nx = player.x + input.x * speed * dt;
    const ny = player.y + input.y * speed * dt;
    player.x = clamp(nx, 20, WORLD.width - 20);
    player.y = clamp(ny, 20, WORLD.height - 140);
    const circle = { x: player.x, y: player.y, radius: PLAYER.radius };
    collideCircleBuildings(city, circle);
    player.x = circle.x;
    player.y = circle.y;
    if (input.x !== 0 || input.y !== 0) player.angle = Math.atan2(input.y, input.x);
    player.speed = input.x !== 0 || input.y !== 0 ? speed : 0;
  }

  function stepTraffic(dt) {
    for (const car of cars) {
      if (!car.active || car.kind !== 'traffic') continue;
      // Slow for the car ahead on the same road.
      let ahead = Infinity;
      for (const other of cars) {
        if (other === car || !other.active) continue;
        if (other.kind === 'police') continue;
        const along = car.axis === 'x' ? (other.x - car.x) * car.dir : (other.y - car.y) * car.dir;
        const across = car.axis === 'x' ? Math.abs(other.y - car.y) : Math.abs(other.x - car.x);
        if (along > 0 && along < ahead && across < 40) ahead = along;
      }
      const target = ahead < TRAFFIC.minGap ? 0 : TRAFFIC.speed;
      car.speed += clamp(target - car.speed, -300 * dt, 200 * dt);
      if (car.axis === 'x') car.x += car.dir * car.speed * dt;
      else car.y += car.dir * car.speed * dt;
      // Wrap around the far edge so the streets never empty out.
      if (car.x < 40) car.x = WORLD.width - 40;
      if (car.x > WORLD.width - 40) car.x = 40;
      if (car.y < 40) car.y = WORLD.height - 160;
      if (car.y > WORLD.height - 160) car.y = 40;
      // At an intersection, sometimes turn onto the crossing road.
      car.turnCooldown -= dt;
      const nearX = Math.abs(car.x - Math.round(car.x / CITY.pitch) * CITY.pitch) < 12;
      const nearY = Math.abs(car.y - Math.round(car.y / CITY.pitch) * CITY.pitch) < 12;
      if (car.turnCooldown <= 0 && nearX && nearY && random() < 0.02) {
        car.turnCooldown = 4;
        if (car.axis === 'x') {
          car.axis = 'y';
          car.dir = random() < 0.5 ? 1 : -1;
          car.x = Math.round(car.x / CITY.pitch) * CITY.pitch;
          car.angle = car.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
        } else {
          car.axis = 'x';
          car.dir = random() < 0.5 ? 1 : -1;
          car.y = Math.round(car.y / CITY.pitch) * CITY.pitch;
          car.angle = car.dir > 0 ? 0 : Math.PI;
        }
      }
    }
  }

  function stepPeds(dt, events) {
    for (const ped of peds) {
      if (ped.mode === 'down') {
        ped.downTimer -= dt;
        if (ped.downTimer <= 0) {
          ped.mode = 'flee';
          ped.timer = 3;
        }
        continue;
      }
      ped.timer -= dt;
      const playerNear = dist(ped.x, ped.y, player.x, player.y);
      const threat = player.inCar ? player.speed > 200 && playerNear < 160 : playerNear < 90;
      if (threat && ped.mode !== 'flee') {
        // Fleeing picks its direction once, on the way in: re-aiming every
        // step pins a pedestrian against the wall it is running from.
        ped.mode = 'flee';
        ped.timer = 2 + random() * 2;
        ped.angle = Math.atan2(ped.y - player.y, ped.x - player.x);
      }
      if (ped.timer <= 0) {
        if (ped.mode === 'flee' && playerNear < 200) {
          ped.mode = 'flee';
          ped.timer = 1.5 + random() * 2;
          ped.angle = Math.atan2(ped.y - player.y, ped.x - player.x);
        } else {
          ped.mode = 'walk';
          ped.timer = 1.5 + random() * 3;
          ped.angle = random() * TAU;
        }
      }
      ped.speed = ped.mode === 'flee' ? PEDS.fleeSpeed : PEDS.walkSpeed;
      const nx = ped.x + Math.cos(ped.angle) * ped.speed * dt;
      const ny = ped.y + Math.sin(ped.angle) * ped.speed * dt;
      if (circleHitsBuilding(city, nx, ny, 12)) {
        ped.angle += Math.PI / 2;
        ped.timer = 0.5;
        continue;
      }
      ped.x = clamp(nx, 20, WORLD.width - 20);
      ped.y = clamp(ny, 20, WORLD.height - 140);
      // A speeding car that runs a pedestrian down is a crime. The bar is a
      // real turn of speed, not a crawl, so brushing past at walking pace
      // does not count.
      if (player.inCar && player.speed > 120 && dist(ped.x, ped.y, player.x, player.y) < 30) {
        ped.mode = 'down';
        ped.downTimer = 5;
        addWanted(1);
        events |= EVENT_HIT | EVENT_CRIME;
        if (random() < 0.4) drops.push({ x: ped.x, y: ped.y, active: true, amount: 20 });
      }
    }
    return events;
  }

  function stepPolice(dt, events) {
    const wantedCount = state.wanted;
    let police = cars.filter((c) => c.active && c.kind === 'police');
    // Spawn patrol cars until the count matches the wanted level.
    while (police.length < wantedCount && police.length < POLICE.maxCars) {
      let spot = null;
      for (let tries = 0; tries < 12; tries += 1) {
        const candidate = randomRoadPoint(random);
        const d = dist(candidate.x, candidate.y, player.x, player.y);
        if (d > 700 && d < 1200) { spot = candidate; break; }
      }
      if (!spot) spot = randomRoadPoint(random);
      const car = makeCar(spot.x, spot.y, 0, 'police', '#3f6df6');
      car.speed = POLICE.chaseSpeed * 0.6;
      cars.push(car);
      police.push(car);
    }
    // When the heat is off, patrol cars leave once they are far away.
    if (wantedCount === 0) {
      for (const car of police) {
        if (dist(car.x, car.y, player.x, player.y) > 1200) car.active = false;
      }
      police = cars.filter((c) => c.active && c.kind === 'police');
    }
    state.policeCount = police.length;

    // A siren blip every few seconds while a chase is close by.
    state.sirenTimer -= dt;
    if (state.sirenTimer <= 0 && wantedCount > 0) {
      let near = false;
      for (const car of police) if (dist(car.x, car.y, player.x, player.y) < 700) near = true;
      if (near) {
        state.sirenTimer = 3.5;
        events |= EVENT_SIREN;
      } else {
        state.sirenTimer = 1;
      }
    }

    for (const car of police) {
      car.ramCooldown -= dt;
      car.sirenPhase += dt * 6;
      const distance = dist(car.x, car.y, player.x, player.y);
      const speedTarget = wantedCount > 0 ? POLICE.chaseSpeed : POLICE.patrolSpeed;
      // Far away, follow the road grid toward the player; close in, steer
      // straight at them. Driving straight through blocks gets patrol cars
      // stuck on buildings, so the grid does the long-range work.
      let targetAngle;
      if (distance > 220) {
        const waypoint = isOnRoad(car.x, car.y)
          ? routeTarget(car.x, car.y, player.x, player.y)
          : nearestRoadPoint(car.x, car.y);
        targetAngle = Math.atan2(waypoint.y - car.y, waypoint.x - car.x);
      } else {
        targetAngle = Math.atan2(player.y - car.y, player.x - car.x);
      }
      // Stuck against a building: back up for a beat, then try again.
      const blocked = Math.abs(car.speed) < 25 && wantedCount > 0;
      if (blocked) car.stuckTimer += dt;
      else car.stuckTimer = 0;
      if (car.stuckTimer > 1.2) {
        car.reverseTimer = 0.8;
        car.stuckTimer = 0;
      }
      if (car.reverseTimer > 0) {
        car.reverseTimer -= dt;
        car.speed = Math.max(car.speed - 500 * dt, -180);
        car.angle = turnToward(car.angle, targetAngle + Math.PI, CAR.turnRate * dt);
      } else {
        // Slow for a sharp turn, so the car follows the road instead of
        // cutting the corner into a building.
        const sharpness = Math.abs(angleDiff(car.angle, targetAngle));
        const adjusted = speedTarget * (1 - Math.min(0.55, sharpness * 0.35));
        car.speed += clamp(adjusted - car.speed, -600 * dt, 380 * dt);
        car.angle = turnToward(car.angle, targetAngle, CAR.turnRate * 1.15 * dt);
      }
      car.x += Math.cos(car.angle) * car.speed * dt;
      car.y += Math.sin(car.angle) * car.speed * dt;
      car.x = clamp(car.x, 24, WORLD.width - 24);
      car.y = clamp(car.y, 24, WORLD.height - 144);
      const circle = { x: car.x, y: car.y, radius: 18 };
      if (collideCircleBuildings(city, circle)) {
        car.speed *= Math.abs(car.speed) > 260 ? -0.25 : 0.85;
        car.x = circle.x;
        car.y = circle.y;
      }
      // Contact with the player: ram a car, or corner a runner on foot.
      if (distance < 46) {
        if (player.inCar) {
          if (car.ramCooldown <= 0 && Math.abs(car.speed) > 150) {
            car.ramCooldown = POLICE.ramCooldown;
            player.health -= POLICE.ramDamage;
            player.hurtTimer = 1;
            car.speed *= 0.4;
            events |= EVENT_HIT | EVENT_CRASH;
            if (player.health <= 0) {
              player.health = 0;
              state.over = true;
              state.overReason = 'wasted';
              events |= EVENT_WASTED;
            }
          }
        } else if (wantedCount > 0) {
          player.bustProgress += dt;
          if (player.bustProgress >= PLAYER.bustTime) {
            state.over = true;
            state.overReason = 'busted';
            events |= EVENT_BUSTED;
          }
        }
      } else if (!player.inCar) {
        player.bustProgress = Math.max(0, player.bustProgress - dt * 2);
      }
    }
    return events;
  }

  function stepCarCollisions(dt, events) {
    for (let i = 0; i < cars.length; i += 1) {
      const a = cars[i];
      if (!a.active) continue;
      for (let j = i + 1; j < cars.length; j += 1) {
        const b = cars[j];
        if (!b.active) continue;
        const d = dist(a.x, a.y, b.x, b.y);
        if (d >= 44 || d === 0) continue;
        const push = (44 - d) / 2;
        const nx = (b.x - a.x) / d;
        const ny = (b.y - a.y) / d;
        // A parked car does not budge: the other car deflects around it
        // instead of shoving it down the road at a crawl.
        const aWeight = a.kind === 'parked' ? 0 : 1;
        const bWeight = b.kind === 'parked' ? 0 : 1;
        const total = aWeight + bWeight;
        if (total === 0) continue;
        a.x -= nx * push * 2 * (aWeight / total);
        a.y -= ny * push * 2 * (aWeight / total);
        b.x += nx * push * 2 * (bWeight / total);
        b.y += ny * push * 2 * (bWeight / total);
        // A slow shove only separates the cars: damping the speed on every
        // step of a low-speed touch pins a car that police are leaning on,
        // and it can never drive away. A fast impact still scrubs speed.
        const closing = Math.abs(a.speed) + Math.abs(b.speed);
        if (closing > 200) {
          a.speed *= 0.6;
          b.speed *= 0.6;
          if (a.kind === 'player' || b.kind === 'player') events |= EVENT_CRASH;
        }
      }
    }
    return events;
  }

  function stepWanted(dt) {
    if (state.wanted === 0) return;
    state.quietTimer += dt;
    let nearestPolice = Infinity;
    for (const car of cars) {
      if (car.active && car.kind === 'police') {
        nearestPolice = Math.min(nearestPolice, dist(car.x, car.y, player.x, player.y));
      }
    }
    if (nearestPolice < POLICE.sightRange) {
      state.decayTimer = 0;
      return;
    }
    state.decayTimer += dt;
    if (state.decayTimer >= POLICE.decaySeconds) {
      state.wanted -= 1;
      state.decayTimer = 0;
      showBanner(`HEAT DYING DOWN — WANTED LEVEL ${state.wanted}`, 3);
    }
  }

  function reset(missionIndex = 0, keepMoney = 0) {
    cars.length = 0;
    peds.length = 0;
    drops.length = 0;
    player.x = 600;
    player.y = 800;
    player.angle = -Math.PI / 2;
    player.health = PLAYER.health;
    player.inCar = null;
    player.speed = 0;
    player.bustProgress = 0;
    player.attackCooldown = 0;
    player.hurtTimer = 0;
    state.money = keepMoney;
    state.score = keepMoney;
    state.wanted = 0;
    state.elapsed = 0;
    state.over = false;
    state.overReason = '';
    state.won = false;
    state.decayTimer = 0;
    state.quietTimer = 0;
    state.sirenTimer = 0;
    state.dropsLeft = 0;
    state.banner.text = '';
    state.banner.timer = 0;
    spawnParkedCars();
    spawnTraffic();
    spawnPeds();
    startMission(missionIndex);
  }

  /**
   * One fixed step. `input` is the steering vector, `sprint` is Shift, and
   * `actions` carries the one-shot presses (enter / attack). With `harmless`
   * set (the title screen's backdrop) the city lives but nothing scores and
   * no crime is committed.
   */
  function step(dt, input, sprint, actions, harmless) {
    let events = 0;
    state.elapsed += dt;
    if (state.banner.timer > 0) state.banner.timer -= dt;
    if (player.attackCooldown > 0) player.attackCooldown -= dt;
    if (player.hurtTimer > 0) player.hurtTimer -= dt;
    if (state.lastCrash) {
      events |= EVENT_CRASH;
      state.lastCrash = 0;
    }

    if (!harmless && !state.over) {
      if (actions & 4) { // ACTION_ENTER
        if (player.inCar) events |= exitCar();
        else {
          const car = nearestCar(CAR.enterRadius);
          if (car) {
            if (car.kind === 'traffic') {
              const ped = {
                x: car.x + 30, y: car.y + 30, angle: random() * TAU,
                color: PED_COLORS[Math.floor(random() * PED_COLORS.length)],
                mode: 'flee', timer: 3, downTimer: 0, speed: PEDS.fleeSpeed,
              };
              peds.push(ped);
            }
            events |= enterCar(car);
          }
        }
      }
      if (actions & 8) { // ACTION_ATTACK
        if (player.attackCooldown <= 0) {
          player.attackCooldown = 0.35;
          if (player.inCar) events |= EVENT_HONK;
          else events |= punch(events);
        }
      }
    }

    if (player.inCar) drivePlayerCar(dt, input);
    else walkPlayer(dt, input, sprint);

    // Traffic that hits the player on foot knocks them down a little.
    if (!player.inCar && !harmless) {
      for (const car of cars) {
        if (!car.active || car.kind !== 'traffic') continue;
        if (dist(car.x, car.y, player.x, player.y) < 34 && Math.abs(car.speed) > 120) {
          if (player.hurtTimer <= 0) {
            player.health -= 10;
            player.hurtTimer = 1;
            events |= EVENT_HIT;
            if (player.health <= 0) {
              player.health = 0;
              state.over = true;
              state.overReason = 'wasted';
              events |= EVENT_WASTED;
            }
          }
        }
      }
    }

    stepTraffic(dt);
    events = stepPeds(dt, events);
    if (!harmless) events = stepPolice(dt, events);
    events = stepCarCollisions(dt, events);
    if (!harmless) stepWanted(dt);

    // Slow health recovery once the player has not been hurt for a beat.
    if (!harmless && player.health > 0 && player.health < PLAYER.health && player.hurtTimer <= 0) {
      player.health = Math.min(PLAYER.health, player.health + 1.5 * dt);
    }

    if (!harmless && !state.over) events = checkMission(events);
    state.objective = state.over ? state.objective : missionObjective();
    return events;
  }

  reset();
  return { state, city, reset, step, addWanted, startMission };
}
