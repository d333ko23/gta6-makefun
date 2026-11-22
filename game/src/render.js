// Drawing only: the world's state and the current screen in, pixels out. The
// camera follows the player across the 3200 x 3200 city and paints a fixed
// 1280 x 720 view scaled to the window. Everything is drawn from code: roads
// and lit windows, cars and people as simple top-down shapes, the HUD with
// its wanted stars and minimap, and the title / pause / end panels.

import { CITY, FONT, MISSIONS, PALETTE, PLAYER, VIEW, WORLD } from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_WIN = 'win';

const MINIMAP = { size: 176, margin: 16 };
const PANEL = { width: 640, top: 150, line: 32, bottom: 78 };

function starPath(ctx, x, y, r) {
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    const radius = i % 2 === 0 ? r : r * 0.45;
    const px = x + Math.cos(angle) * radius;
    const py = y + Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const camera = { x: 0, y: 0 };
  const fonts = new Map();

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / VIEW.width, height / VIEW.height);
    view.x = (width - VIEW.width * view.scale) / 2;
    view.y = (height - VIEW.height * view.scale) / 2;
  }

  function text(value, x, y, size, color, align = 'left', baseline = 'top') {
    const key = size;
    if (!fonts.has(key)) fonts.set(key, `${size}px ${FONT}`);
    ctx.font = fonts.get(key);
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = baseline;
    ctx.fillText(value, x, y);
  }

  function wrapLines(value, maxWidth, size) {
    if (!fonts.has(size)) fonts.set(size, `${size}px ${FONT}`);
    ctx.font = fonts.get(size);
    const words = value.split(' ');
    const lines = [];
    let current = '';
    for (const word of words) {
      const next = current === '' ? word : `${current} ${word}`;
      if (ctx.measureText(next).width > maxWidth && current !== '') {
        lines.push(current);
        current = word;
      } else {
        current = next;
      }
    }
    if (current !== '') lines.push(current);
    return lines;
  }

  function updateCamera(state) {
    camera.x = Math.max(0, Math.min(WORLD.width - VIEW.width, state.player.x - VIEW.width / 2));
    camera.y = Math.max(0, Math.min(WORLD.height - VIEW.height, state.player.y - VIEW.height / 2));
  }

  function drawCity(state) {
    const city = state.city;
    const x0 = camera.x - 60;
    const y0 = camera.y - 60;
    const x1 = camera.x + VIEW.width + 60;
    const y1 = camera.y + VIEW.height + 60;

    ctx.fillStyle = PALETTE.nightSky;
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);

    // Parks: dark green blocks with a few trees.
    for (const park of city.parks) {
      if (park.x > x1 || park.y > y1 || park.x + park.width < x0 || park.y + park.height < y0) continue;
      ctx.fillStyle = PALETTE.park;
      ctx.fillRect(park.x, park.y, park.width, park.height);
      ctx.fillStyle = '#1d5c36';
      for (let i = 0; i < 8; i += 1) {
        const tx = park.x + 30 + ((i * 53) % (park.width - 60));
        const ty = park.y + 30 + ((i * 97) % (park.height - 60));
        ctx.beginPath();
        ctx.arc(tx, ty, 12, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Sidewalk slabs: every block gets a pale square first, roads paint over it.
    ctx.fillStyle = PALETTE.sidewalk;
    const pitch = CITY.pitch;
    for (let bx = Math.max(0, Math.floor(x0 / pitch)); bx * pitch < x1; bx += 1) {
      for (let by = Math.max(0, Math.floor(y0 / pitch)); by * pitch < y1; by += 1) {
        ctx.fillRect(bx * pitch + CITY.roadWidth / 2, by * pitch + CITY.roadWidth / 2, CITY.blockSize, CITY.blockSize);
      }
    }

    // Roads: dark strips along every pitch line, with a dashed centre line.
    ctx.fillStyle = PALETTE.road;
    ctx.strokeStyle = PALETTE.roadLine;
    ctx.lineWidth = 3;
    ctx.setLineDash([26, 30]);
    for (let line = 0; line * pitch < WORLD.width + pitch; line += 1) {
      const pos = line * pitch;
      if (pos > y0 - CITY.roadWidth && pos < y1 + CITY.roadWidth) {
        ctx.fillRect(x0, pos - CITY.roadWidth / 2, x1 - x0, CITY.roadWidth);
        ctx.beginPath();
        ctx.moveTo(x0, pos);
        ctx.lineTo(x1, pos);
        ctx.stroke();
      }
      if (pos > x0 - CITY.roadWidth && pos < x1 + CITY.roadWidth) {
        ctx.fillRect(pos - CITY.roadWidth / 2, y0, CITY.roadWidth, y1 - y0);
        ctx.beginPath();
        ctx.moveTo(pos, y0);
        ctx.lineTo(pos, y1);
        ctx.stroke();
      }
    }
    ctx.setLineDash([]);

    // Harbour water along the south edge.
    ctx.fillStyle = PALETTE.water;
    ctx.fillRect(x0, Math.max(y0, city.harbour.y), x1 - x0, Math.min(y1, WORLD.height) - Math.max(y0, city.harbour.y));
    ctx.strokeStyle = '#2e6ea8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x0, city.harbour.y);
    ctx.lineTo(x1, city.harbour.y);
    ctx.stroke();

    // Buildings: roof, edge, lit windows, rooftop box.
    for (const b of city.buildings) {
      if (b.x > x1 || b.y > y1 || b.x + b.width < x0 || b.y + b.height < y0) continue;
      ctx.fillStyle = PALETTE.buildingEdge;
      ctx.fillRect(b.x - 3, b.y - 3, b.width + 6, b.height + 6);
      ctx.fillStyle = b.color;
      ctx.globalAlpha = b.shade;
      ctx.fillRect(b.x, b.y, b.width, b.height);
      ctx.globalAlpha = 1;
      const cellW = b.width / b.cols;
      const cellH = b.height / b.rows;
      for (let c = 0; c < b.cols; c += 1) {
        for (let r = 0; r < b.rows; r += 1) {
          const lit = b.windows[r * b.cols + c];
          ctx.fillStyle = lit ? PALETTE.windowLit : PALETTE.windowDark;
          ctx.fillRect(b.x + c * cellW + cellW * 0.28, b.y + r * cellH + cellH * 0.28, cellW * 0.44, cellH * 0.44);
        }
      }
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(b.x + b.width * 0.3, b.y + b.height * 0.3, b.width * 0.22, b.height * 0.22);
    }
  }

  function drawObjectiveBeacon(state) {
    const o = state.objective;
    if (!o || state.over) return;
    const pulse = 1 + Math.sin(state.elapsed * 4) * 0.15;
    ctx.strokeStyle = PALETTE.objective;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(o.x, o.y, 26 * pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(o.x, o.y, 44 * pulse, 0, Math.PI * 2);
    ctx.globalAlpha = 0.35;
    ctx.stroke();
    ctx.globalAlpha = 1;
    starPath(ctx, o.x, o.y, 12);
    ctx.fillStyle = PALETTE.objective;
    ctx.fill();
    // A thin guide line from the player to the objective.
    ctx.strokeStyle = 'rgba(255, 225, 77, 0.25)';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 10]);
    ctx.beginPath();
    ctx.moveTo(state.player.x, state.player.y);
    ctx.lineTo(o.x, o.y);
    ctx.stroke();
    ctx.setLineDash([]);
    // Edge arrow when the objective is off-screen.
    const sx = o.x - camera.x;
    const sy = o.y - camera.y;
    if (sx < 40 || sx > VIEW.width - 40 || sy < 40 || sy > VIEW.height - 40) {
      const cx = Math.max(60, Math.min(VIEW.width - 60, sx));
      const cy = Math.max(60, Math.min(VIEW.height - 60, sy));
      const angle = Math.atan2(sy - (state.player.y - camera.y), sx - (state.player.x - camera.x));
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(angle);
      ctx.fillStyle = PALETTE.objective;
      ctx.beginPath();
      ctx.moveTo(18, 0);
      ctx.lineTo(-10, -12);
      ctx.lineTo(-10, 12);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  function drawDrop(drop) {
    ctx.fillStyle = PALETTE.cash;
    ctx.beginPath();
    ctx.arc(drop.x, drop.y, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0b3d22';
    text('$', drop.x - 5, drop.y - 9, 15, '#0b3d22', 'left', 'top');
  }

  function drawPed(ped) {
    if (ped.mode === 'down') {
      ctx.fillStyle = ped.color;
      ctx.beginPath();
      ctx.ellipse(ped.x, ped.y, 12, 7, ped.angle, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    ctx.fillStyle = ped.mode === 'flee' ? PALETTE.pedFlee : ped.color;
    ctx.beginPath();
    ctx.arc(ped.x, ped.y, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath();
    ctx.arc(ped.x + Math.cos(ped.angle) * 4, ped.y + Math.sin(ped.angle) * 4, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawCar(car, isPlayer) {
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    const len = 54;
    const wid = 28;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(-len / 2 + 3, -wid / 2 + 3, len, wid);
    ctx.fillStyle = car.color;
    ctx.beginPath();
    ctx.roundRect(-len / 2, -wid / 2, len, wid, 8);
    ctx.fill();
    // Cabin, windshield and headlights.
    ctx.fillStyle = 'rgba(10, 16, 32, 0.85)';
    ctx.beginPath();
    ctx.roundRect(-8, -wid / 2 + 4, 18, wid - 8, 4);
    ctx.fill();
    ctx.fillStyle = '#cfe6ff';
    ctx.fillRect(len / 2 - 4, -wid / 2 + 3, 3, 5);
    ctx.fillRect(len / 2 - 4, wid / 2 - 8, 3, 5);
    ctx.fillStyle = '#ff5a4d';
    ctx.fillRect(-len / 2, -wid / 2 + 3, 3, 5);
    ctx.fillRect(-len / 2, wid / 2 - 8, 3, 5);
    if (car.kind === 'police') {
      const blink = Math.sin(car.sirenPhase) > 0;
      ctx.fillStyle = blink ? '#ff3b30' : '#3f6df6';
      ctx.fillRect(-4, -wid / 2 - 2, 8, 5);
      ctx.fillStyle = blink ? '#3f6df6' : '#ff3b30';
      ctx.fillRect(-4, wid / 2 - 3, 8, 5);
      ctx.fillStyle = '#ffffff';
      text('PD', -8, -6, 11, '#ffffff', 'left', 'top');
    }
    if (isPlayer) {
      ctx.strokeStyle = PALETTE.objective;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(-len / 2 - 3, -wid / 2 - 3, len + 6, wid + 6, 10);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawPlayer(state) {
    const p = state.player;
    if (p.inCar) return;
    const blink = p.hurtTimer > 0 && Math.floor(p.hurtTimer * 12) % 2 === 0;
    if (blink) return;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + 4, 12, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PALETTE.playerOutline;
    ctx.beginPath();
    ctx.arc(p.x, p.y, PLAYER.radius + 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PALETTE.player;
    ctx.beginPath();
    ctx.arc(p.x, p.y, PLAYER.radius, 0, Math.PI * 2);
    ctx.fill();
    // Facing tick and a little cap brim.
    ctx.fillStyle = '#1c2438';
    ctx.beginPath();
    ctx.arc(p.x + Math.cos(p.angle) * 7, p.y + Math.sin(p.angle) * 7, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PALETTE.player;
    ctx.fillRect(p.x + Math.cos(p.angle) * 10 - 3, p.y + Math.sin(p.angle) * 10 - 3, 6, 6);
  }

  function drawHud(state, best, muted) {
    // Top-left: money, score and health.
    ctx.fillStyle = PALETTE.hudPanel;
    ctx.beginPath();
    ctx.roundRect(14, 12, 250, 92, 10);
    ctx.fill();
    text(`$${state.money}`, 28, 22, 30, PALETTE.hudText);
    text(`SCORE ${state.score}`, 28, 58, 16, PALETTE.hudMuted);
    const hpW = 150;
    const hpFrac = Math.max(0, state.player.health / PLAYER.health);
    ctx.fillStyle = '#222839';
    ctx.fillRect(28, 82, hpW, 10);
    ctx.fillStyle = hpFrac > 0.35 ? PALETTE.healthGood : PALETTE.healthBad;
    ctx.fillRect(28, 82, hpW * hpFrac, 10);
    text('HP', 186, 78, 15, PALETTE.hudMuted);

    // Top-centre: wanted stars.
    const starR = 13;
    const starGap = 34;
    const totalW = 5 * starGap - 6;
    const sx = VIEW.width / 2 - totalW / 2;
    ctx.fillStyle = PALETTE.hudPanel;
    ctx.beginPath();
    ctx.roundRect(sx - 18, 12, totalW + 36, 40, 10);
    ctx.fill();
    for (let i = 0; i < 5; i += 1) {
      starPath(ctx, sx + i * starGap + 12, 32, starR);
      ctx.fillStyle = i < state.wanted ? PALETTE.star : PALETTE.starEmpty;
      ctx.fill();
    }

    // Mission line under the stars.
    if (state.objective && !state.over) {
      text(state.objective.label, VIEW.width / 2, 62, 17, PALETTE.objective, 'center');
      const mission = MISSIONS[state.missionIndex];
      if (mission) text(mission.title, VIEW.width / 2, 84, 14, PALETTE.hudMuted, 'center');
    }

    // Bust progress ring while a cop corners the player on foot.
    if (!state.player.inCar && state.player.bustProgress > 0) {
      const cx = VIEW.width / 2;
      const cy = 150;
      ctx.strokeStyle = PALETTE.danger;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(cx, cy, 26, -Math.PI / 2, -Math.PI / 2 + TAU * (state.player.bustProgress / PLAYER.bustTime));
      ctx.stroke();
      text('BUSTED?', cx, cy + 40, 16, PALETTE.danger, 'center');
    }

    // Bottom-left: controls.
    ctx.fillStyle = PALETTE.hudPanel;
    ctx.beginPath();
    ctx.roundRect(14, VIEW.height - 64, 430, 50, 10);
    ctx.fill();
    text('WASD move / drive   E steal car   SPACE punch / honk   SHIFT sprint', 28, VIEW.height - 52, 15, PALETTE.hudMuted);
    text('P pause   M mute   R restart', 28, VIEW.height - 30, 15, PALETTE.hudMuted);

    // Bottom-right: speed while driving.
    if (state.player.inCar) {
      const kmh = Math.round(Math.abs(state.player.inCar.speed) * 0.32);
      ctx.fillStyle = PALETTE.hudPanel;
      ctx.beginPath();
      ctx.roundRect(VIEW.width - 150, VIEW.height - 64, 136, 50, 10);
      ctx.fill();
      text(`${kmh}`, VIEW.width - 96, VIEW.height - 56, 28, PALETTE.hudText, 'center');
      text('KM/H', VIEW.width - 96, VIEW.height - 26, 13, PALETTE.hudMuted, 'center');
    }

    // Banner: mission and wanted messages.
    if (state.banner.timer > 0) {
      const lines = wrapLines(state.banner.text, VIEW.width - 260, 20);
      const bh = lines.length * 26 + 18;
      ctx.fillStyle = PALETTE.hudPanel;
      ctx.beginPath();
      ctx.roundRect(VIEW.width / 2 - 320, 116, 640, bh, 10);
      ctx.fill();
      lines.forEach((line, i) => text(line, VIEW.width / 2, 126 + i * 26, 20, PALETTE.title, 'center'));
    }

    if (muted) text('MUTED', VIEW.width - 24, 210, 15, PALETTE.hudMuted, 'right');
    if (best > 0) text(`BEST $${best}`, VIEW.width - 24, 232, 15, PALETTE.hudMuted, 'right');
  }

  function drawMinimap(state) {
    const size = MINIMAP.size;
    const x = VIEW.width - MINIMAP.margin - size;
    const y = MINIMAP.margin;
    const scale = size / WORLD.width;
    ctx.fillStyle = 'rgba(8, 11, 22, 0.85)';
    ctx.beginPath();
    ctx.roundRect(x - 6, y - 6, size + 12, size + 12, 10);
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, size, size);
    ctx.clip();
    ctx.fillStyle = '#10152a';
    ctx.fillRect(x, y, size, size);
    // Roads on the minimap.
    ctx.strokeStyle = '#3a415c';
    ctx.lineWidth = 2;
    for (let line = 0; line * CITY.pitch < WORLD.width + CITY.pitch; line += 1) {
      const pos = line * CITY.pitch * scale;
      ctx.beginPath();
      ctx.moveTo(x, y + pos);
      ctx.lineTo(x + size, y + pos);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + pos, y);
      ctx.lineTo(x + pos, y + size);
      ctx.stroke();
    }
    // Harbour strip.
    ctx.fillStyle = '#0a2036';
    ctx.fillRect(x, y + (WORLD.height - 120) * scale, size, 120 * scale);
    // Objective star.
    if (state.objective && !state.over) {
      starPath(ctx, x + state.objective.x * scale, y + state.objective.y * scale, 7);
      ctx.fillStyle = PALETTE.objective;
      ctx.fill();
    }
    // Cash drops.
    ctx.fillStyle = PALETTE.cash;
    for (const drop of state.drops) {
      if (!drop.active) continue;
      ctx.fillRect(x + drop.x * scale - 2, y + drop.y * scale - 2, 4, 4);
    }
    // Police cars.
    ctx.fillStyle = '#5a86ff';
    for (const car of state.cars) {
      if (!car.active || car.kind !== 'police') continue;
      ctx.beginPath();
      ctx.arc(x + car.x * scale, y + car.y * scale, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    // The player: a white dot with a gold ring.
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x + state.player.x * scale, y + state.player.y * scale, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = PALETTE.objective;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x + state.player.x * scale, y + state.player.y * scale, 7, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    text('MERIDIAN BAY', x + size / 2, y + size + 10, 12, PALETTE.hudMuted, 'center');
  }

  function drawPanel(title, lines, prompt, accent) {
    const height = PANEL.top + lines.length * PANEL.line + PANEL.bottom;
    const x = (VIEW.width - PANEL.width) / 2;
    const y = (VIEW.height - height) / 2;
    ctx.fillStyle = 'rgba(6, 8, 16, 0.88)';
    ctx.beginPath();
    ctx.roundRect(x, y, PANEL.width, height, 14);
    ctx.fill();
    ctx.strokeStyle = accent || PALETTE.title;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.textBaseline = 'alphabetic';
    text(title, VIEW.width / 2, y + 78, 46, accent || PALETTE.title, 'center');
    lines.forEach((line, i) => {
      text(line, VIEW.width / 2, y + PANEL.top + i * PANEL.line, 20, PALETTE.hudMuted, 'center');
    });
    text(prompt, VIEW.width / 2, y + height - 38, 22, PALETTE.objective, 'center');
  }

  const TAU = Math.PI * 2;

  /** Paint one frame: the city, the actors, the HUD and the screen's panel. */
  function draw(state, screen, best, muted) {
    updateCamera(state);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = PALETTE.backdrop;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    ctx.save();
    ctx.translate(-camera.x, -camera.y);
    drawCity(state);
    drawObjectiveBeacon(state);
    for (const drop of state.drops) if (drop.active) drawDrop(drop);
    for (const ped of state.peds) drawPed(ped);
    for (const car of state.cars) {
      if (!car.active) continue;
      drawCar(car, car === state.player.inCar);
    }
    drawPlayer(state);
    ctx.restore();

    // District names drift over the city, faint, like a map legend.
    ctx.fillStyle = 'rgba(242, 244, 250, 0.16)';
    for (const d of state.city.districts) {
      const sx = d.x - camera.x;
      const sy = d.y - camera.y;
      if (sx < -40 || sx > VIEW.width + 40 || sy < -40 || sy > VIEW.height + 40) continue;
      text(d.name, sx, sy, 15, 'rgba(242, 244, 250, 0.28)', 'center');
    }

    if (screen === SCREEN_TITLE) {
      const lines = [
        'Rook is a courier for Marla Voss, moving packages through',
        'Meridian Bay after dark. Steal a car, run three jobs,',
        'and do not let the Meridian PD take you in.',
        '',
        `Best score: $${best}`,
        '',
        'WASD / arrows — walk and drive    E — steal / exit car',
        'SPACE — punch (on foot) / honk (in a car)    SHIFT — sprint',
        'P — pause    M — mute    R — restart',
      ];
      drawPanel('MIDNIGHT MERIDIAN', lines, 'Press ENTER or click to start', PALETTE.title);
      return;
    }
    drawHud(state, best, muted);
    drawMinimap(state);
    if (screen === SCREEN_PAUSED) {
      drawPanel('PAUSED', ['The city waits for no one — except right now.'], 'Press P to keep driving', PALETTE.hudText);
    } else if (screen === SCREEN_OVER) {
      const busted = state.overReason === 'busted';
      const lines = [
        busted ? 'The Meridian PD finally caught up with Rook.' : 'Rook went down hard on the streets of Meridian Bay.',
        `You banked $${state.money} across ${state.missionIndex} finished job${state.missionIndex === 1 ? '' : 's'}.`,
        `Best score: $${best}`,
      ];
      drawPanel(busted ? 'BUSTED' : 'WASTED', lines, 'Press ENTER to run it back', PALETTE.danger);
    } else if (screen === SCREEN_WIN) {
      const lines = [
        'All three jobs are done. Marla pays in full, the heat fades,',
        'and Rook drives off into the Meridian night a legend.',
        `Final take: $${state.money}   •   Best score: $${best}`,
      ];
      drawPanel('MERIDIAN LEGEND', lines, 'Press ENTER to play again', PALETTE.objective);
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw };
}
