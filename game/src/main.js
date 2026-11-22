// MIDNIGHT MERIDIAN — boot and the one loop: input is read every frame, the
// world advances in fixed 1/60 s steps (several in a slow frame, none in a
// fast one), and the renderer paints what is there. The game moves between
// five screens: title, play, paused, game over and the win screen. Progress
// (best score and the job reached) is kept in localStorage between visits.
//
// ?seed=N fixes the city and traffic. ?shot=start|play|chase|end (with
// &seed=N) stages that scene instead of running the loop, paints it twice and
// sets window.__shotReady for a screenshot.
import { BEST_KEY, SAVE_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import {
  createWorld,
  EVENT_BUSTED, EVENT_CRASH, EVENT_CRIME, EVENT_ENTER, EVENT_HONK,
  EVENT_MISSION, EVENT_PICKUP, EVENT_PUNCH, EVENT_SIREN, EVENT_WASTED,
  EVENT_WIN,
} from './world.js';
import {
  ACTION_ATTACK, ACTION_CONFIRM, ACTION_ENTER, ACTION_MUTE, ACTION_PAUSE,
  ACTION_RESTART, createInput,
} from './input.js';
import { createAudio } from './audio.js';
import {
  createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE,
  SCREEN_WIN,
} from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const audio = createAudio();

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const save = JSON.parse(raw);
    if (typeof save.mission !== 'number' || typeof save.money !== 'number') return null;
    return save;
  } catch {
    return null;
  }
}

function writeSave(mission, money) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({ mission, money }));
  } catch {
    // Storage can be off: the run still plays, it just does not resume.
  }
}

function clearSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    // Nothing to clear.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best, false);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let saved = readSave();
  let accumulator = 0;
  let last = performance.now();

  // Screen readers (and anyone watching the page's text) hear the screen changes and each event.
  function announce(message) {
    status.textContent = message;
  }

  function startGame(mission, money) {
    world.reset(mission, money);
    accumulator = 0;
    screen = SCREEN_PLAY;
    audio.unlock();
    announce(`Playing. Job ${mission + 1} of 3.`);
  }

  function endGame(reason) {
    screen = reason === 'win' ? SCREEN_WIN : SCREEN_OVER;
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
    if (reason === 'win') {
      clearSave();
      audio.win();
      announce(`You win. Final take $${world.state.money}. Best $${best}.`);
    } else {
      audio.busted();
      announce(`Game over — ${reason}. Take $${world.state.money}. Best $${best}.`);
    }
  }

  function playEvents(events) {
    if (events & EVENT_CRASH) audio.crash();
    if (events & EVENT_SIREN) audio.siren();
    if (events & EVENT_PICKUP) audio.pickup();
    if (events & EVENT_PUNCH) audio.punch();
    if (events & EVENT_HONK) audio.honk();
    if (events & EVENT_ENTER) audio.enterCar();
    if (events & EVENT_MISSION) {
      audio.missionDone();
      writeSave(world.state.missionIndex, world.state.money);
    }
    if (events & EVENT_CRIME) announce(`Wanted level ${world.state.wanted}.`);
    if (events & EVENT_WIN) endGame('win');
    else if (events & EVENT_BUSTED) endGame('busted');
    else if (events & EVENT_WASTED) endGame('wasted');
  }

  function handleActions(actions) {
    if (actions & ACTION_MUTE) {
      audio.setMuted(!audio.isMuted());
      announce(audio.isMuted() ? 'Muted.' : 'Sound on.');
      return;
    }
    if (actions & ACTION_RESTART && (screen === SCREEN_PLAY || screen === SCREEN_PAUSED)) {
      startGame(0, 0);
      return;
    }
    if (actions & ACTION_CONFIRM && (screen === SCREEN_TITLE || screen === SCREEN_OVER || screen === SCREEN_WIN)) {
      audio.unlock();
      if (screen === SCREEN_TITLE && saved) startGame(saved.mission, saved.money);
      else startGame(0, 0);
    } else if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    } else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Playing.');
    }
  }

  function step(actions) {
    if (screen === SCREEN_TITLE) {
      world.step(STEP, { x: 0, y: 0 }, false, 0, true);
      return;
    }
    if (screen !== SCREEN_PLAY) return;
    const playInput = input.vector();
    const events = world.step(
      STEP, playInput, input.sprinting(),
      (actions & ACTION_ENTER ? 4 : 0) | (actions & ACTION_ATTACK ? 8 : 0),
      false,
    );
    audio.engine(world.state.player.inCar ? Math.abs(world.state.player.inCar.speed) / 560 : 0);
    playEvents(events);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    // One-shot presses are taken once a frame and shared by the screen
    // handling and the world step, so a press is never lost or counted twice.
    const actions = input.takeActions();
    handleActions(actions);
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      // One-shot presses reach the world only on the frame's first step, so
      // a slow frame never enters and exits a car on the same key press.
      let firstStep = true;
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step(firstStep ? actions : 0);
        firstStep = false;
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world.state, screen, best, audio.isMuted());
  }

  // Leaving the tab pauses a running game rather than letting the police close in unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce(saved
    ? 'Midnight Meridian. Press Enter to continue your saved run, or R for a fresh one.'
    : 'Midnight Meridian. Press Enter or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
