// Meridian Bay's map, built once from the seed: a grid of roads and blocks,
// the buildings inside each block, two parks, the harbour along the south edge,
// and the named places missions point at. The map never changes during play;
// it only answers questions: is this point on a road, does this circle hit a
// building, where is the nearest road, and where do the named places sit.

import { CITY, WORLD } from './config.js';

export const DISTRICTS = [
  { name: 'NEON PLAZA', x: 800, y: 600 },
  { name: 'THE DOCKS', x: 600, y: 2800 },
  { name: 'OLD TOWN', x: 2600, y: 600 },
  { name: 'SAFEHOUSE', x: 2400, y: 2600 },
  { name: 'CENTRAL PARK', x: 1600, y: 1600 },
];

const ROAD_COLORS = ['#c96a3b', '#3b8ac9', '#c9a13b', '#7a5fc9', '#3bc98a', '#c94f6b', '#5fc9c9', '#c97a3b'];

/** True when the point sits on a road (roads are centred on pitch multiples). */
export function isOnRoad(x, y) {
  const half = CITY.roadWidth / 2;
  const rx = ((x % CITY.pitch) + CITY.pitch) % CITY.pitch;
  const ry = ((y % CITY.pitch) + CITY.pitch) % CITY.pitch;
  // The band includes its edge: a point exactly on the road's edge line is
  // on the road, or a driver hugging the kerb is treated as off-road and
  // steered back into the traffic it is already in.
  const nearX = rx < half || rx >= CITY.pitch - half;
  const nearY = ry < half || ry >= CITY.pitch - half;
  return nearX || nearY;
}

/** The nearest point on a road centreline to (x, y): where cars belong. */
export function nearestRoadPoint(x, y) {
  const nx = Math.round(x / CITY.pitch) * CITY.pitch;
  const ny = Math.round(y / CITY.pitch) * CITY.pitch;
  const dx = Math.abs(x - nx);
  const dy = Math.abs(y - ny);
  if (dx < dy) return { x: nx, y, vertical: true };
  return { x, y: ny, vertical: false };
}

function closestOnSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return { x: ax + dx * t, y: ay + dy * t };
}

/**
 * Pure-pursuit target toward (tx, ty): the route runs from the driver to
 * the nearest intersection, along the road to the target's road line, then
 * down that road to the target. The returned point sits `lookahead` units
 * ahead along that route from the driver's closest point on it, so it never
 * flips back and forth the way a distance threshold does when a car stops
 * right on the threshold. A driver far off the route first heads for the
 * nearest road point instead of cutting through a block.
 */
export function routeTarget(x, y, tx, ty, lookahead = 120) {
  const ix = Math.round(x / CITY.pitch) * CITY.pitch;
  const iy = Math.round(y / CITY.pitch) * CITY.pitch;
  const targetRoadX = Math.round(tx / CITY.pitch) * CITY.pitch;
  const targetRoadY = Math.round(ty / CITY.pitch) * CITY.pitch;
  // A target off the road grid (a pedestrian on a sidewalk) ends the route
  // at the nearest road point: the last leg must never cut through a block
  // to reach someone standing inside one.
  const end = isOnRoad(tx, ty) ? { x: tx, y: ty } : nearestRoadPoint(tx, ty);
  // The route itself starts at the nearest intersection: the driver's own
  // position must not be a point on it, or the lookahead is spent walking
  // the route backwards from where the driver already stands.
  const points = [
    { x: ix, y: iy },
    { x: targetRoadX, y: iy },
    { x: targetRoadX, y: targetRoadY },
    end,
  ];
  let bestDist = Infinity;
  let bestSeg = 0;
  let bestPoint = points[0];
  for (let i = 0; i < points.length - 1; i += 1) {
    const p = closestOnSegment(x, y, points[i].x, points[i].y, points[i + 1].x, points[i + 1].y);
    const d = Math.hypot(x - p.x, y - p.y);
    if (d < bestDist) { bestDist = d; bestSeg = i; bestPoint = p; }
  }
  // Still approaching the intersection from a side road: head for it first.
  if (bestDist > 60) return { x: ix, y: iy };
  let remaining = lookahead;
  let seg = bestSeg;
  let px = bestPoint.x;
  let py = bestPoint.y;
  while (seg < points.length - 1) {
    const nx = points[seg + 1].x;
    const ny = points[seg + 1].y;
    const d = Math.hypot(nx - px, ny - py);
    if (d >= remaining) {
      const t = remaining / d;
      return { x: px + (nx - px) * t, y: py + (ny - py) * t };
    }
    remaining -= d;
    px = nx;
    py = ny;
    seg += 1;
  }
  return end;
}

/**
 * Build the city from the seeded random: one or two buildings per block (a
 * park replaces the buildings of two blocks), the harbour strip along the
 * south edge, and the fixed mission places.
 */
export function buildCity(random) {
  const buildings = [];
  const parks = [];
  const blocks = Math.floor(WORLD.width / CITY.pitch);
  for (let bx = 0; bx < blocks; bx += 1) {
    for (let by = 0; by < blocks; by += 1) {
      const x0 = bx * CITY.pitch + CITY.roadWidth / 2 + CITY.sidewalk;
      const y0 = by * CITY.pitch + CITY.roadWidth / 2 + CITY.sidewalk;
      const size = CITY.blockSize - CITY.sidewalk * 2;
      // The two park blocks sit in the middle of the map.
      if ((bx === 3 && by === 3) || (bx === 4 && by === 4)) {
        parks.push({ x: x0, y: y0, width: size, height: size });
        continue;
      }
      // A block holds one big building or two smaller ones.
      if (random() < 0.55) {
        const w = size * (0.55 + random() * 0.35);
        const h = size * (0.55 + random() * 0.35);
        buildings.push(makeBuilding(x0 + (size - w) / 2, y0 + (size - h) / 2, w, h, random));
      } else {
        const half = size / 2 - 10;
        buildings.push(makeBuilding(x0, y0, half, half, random));
        buildings.push(makeBuilding(x0 + half + 20, y0 + half + 20, half, half, random));
        if (random() < 0.5) {
          buildings.push(makeBuilding(x0 + half + 20, y0, half * 0.7, half * 0.7, random));
        }
      }
    }
  }
  return {
    buildings,
    parks,
    districts: DISTRICTS,
    harbour: { x: 0, y: WORLD.height - 120, width: WORLD.width, height: 120 },
  };
}

function makeBuilding(x, y, width, height, random) {
  const floors = 2 + Math.floor(random() * 5);
  const windows = [];
  const cols = Math.max(2, Math.floor(width / 46));
  const rows = Math.max(2, Math.floor(height / 46));
  for (let c = 0; c < cols; c += 1) {
    for (let r = 0; r < rows; r += 1) {
      windows.push(random() < 0.45);
    }
  }
  return {
    x, y, width, height, floors,
    color: ROAD_COLORS[Math.floor(random() * ROAD_COLORS.length)],
    cols, rows, windows,
    // A seeded per-building tint so the roofs do not all look alike.
    shade: 0.85 + random() * 0.3,
  };
}

/** Push a circle out of every building it overlaps; returns true on a hit. */
export function collideCircleBuildings(city, circle) {
  let hit = false;
  for (const b of city.buildings) {
    const cx = Math.max(b.x, Math.min(circle.x, b.x + b.width));
    const cy = Math.max(b.y, Math.min(circle.y, b.y + b.height));
    const dx = circle.x - cx;
    const dy = circle.y - cy;
    const distSq = dx * dx + dy * dy;
    if (distSq >= circle.radius * circle.radius) continue;
    hit = true;
    if (distSq === 0) {
      circle.y = b.y - circle.radius;
      continue;
    }
    const dist = Math.sqrt(distSq);
    const push = (circle.radius - dist) / dist;
    circle.x += dx * push;
    circle.y += dy * push;
  }
  return hit;
}

/** True when the circle overlaps any building. */
export function circleHitsBuilding(city, x, y, radius) {
  for (const b of city.buildings) {
    const cx = Math.max(b.x, Math.min(x, b.x + b.width));
    const cy = Math.max(b.y, Math.min(y, b.y + b.height));
    const dx = x - cx;
    const dy = y - cy;
    if (dx * dx + dy * dy < radius * radius) return true;
  }
  return false;
}

/** A random point on a road, for spawning traffic and pedestrians. */
export function randomRoadPoint(random) {
  const vertical = random() < 0.5;
  const line = (1 + Math.floor(random() * 7)) * CITY.pitch;
  const along = 120 + random() * (WORLD.width - 240);
  return vertical ? { x: line, y: along } : { x: along, y: line };
}

/** A random walkable point (road or sidewalk), for spawning pedestrians. */
export function randomWalkPoint(random, city) {
  for (let tries = 0; tries < 20; tries += 1) {
    const x = 100 + random() * (WORLD.width - 200);
    const y = 100 + random() * (WORLD.height - 260);
    if (!circleHitsBuilding(city, x, y, 16)) return { x, y };
  }
  return { x: 800, y: 800 };
}
