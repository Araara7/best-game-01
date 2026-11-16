// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s steps
// (several in a slow frame, none in a fast one), and the renderer paints what is there. The game
// moves between four screens: title, play, paused and game over. The orb fires on its own; the
// player steers and dashes.
//
// ?seed=N fixes the spawn pattern. ?shot=start|play|boss|end (with &seed=N) stages that scene
// instead of running the loop, paints it twice and sets window.__shotReady for a screenshot.
import { BEST_KEY, PLAYER, STEP } from './config.js';
import { createWorld, EVENT_BOSS, EVENT_DASH, EVENT_HIT, EVENT_KILL, EVENT_OVER, EVENT_POWERUP, EVENT_SHARD, EVENT_SHOOT, EVENT_WAVE } from './world.js';
import { ACTION_CONFIRM, ACTION_PAUSE, createInput } from './input.js';
import { createAudio } from './audio.js';
import { createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(seed);
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

function runShot(name) {
  const scene = stageShot(name, world);
  window.__lumen = { state: world.state, screen: scene.screen };
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best, { still: true, newBest: scene.screen === SCREEN_OVER && scene.best > 0 });
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
  let newBest = false;
  let accumulator = 0;
  let last = performance.now();

  window.__lumen = {
    get state() { return world.state; },
    get screen() { return screen; },
  };

  // Screen readers (and anyone watching the page's text) hear the screen changes and each hit.
  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    world.reset();
    accumulator = 0;
    newBest = false;
    screen = SCREEN_PLAY;
    announce(`Playing. ${PLAYER.maxLives} lives. Survive the waves.`);
  }

  function endGame() {
    screen = SCREEN_OVER;
    newBest = world.state.score > best && world.state.score > 0;
    if (newBest) {
      best = world.state.score;
      saveBest(best);
    }
    audio.over();
    announce(`Game over. Score ${world.state.score}. Best ${best}. Wave ${world.state.wave}.`);
  }

  /** Read the queued presses; returns whether a dash was pressed this frame. */
  function handleActions() {
    const actions = input.takeActions();
    const dash = input.takeDash();
    if ((actions & ACTION_CONFIRM) || (dash && (screen === SCREEN_TITLE || screen === SCREEN_OVER))) {
      if (screen === SCREEN_TITLE || screen === SCREEN_OVER) {
        audio.ensure();
        startGame();
      }
    } else if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    } else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Playing.');
    }
    return dash;
  }

  function playSound(events) {
    if (events & EVENT_SHOOT) audio.shoot();
    if (events & EVENT_KILL) audio.enemyDie();
    if (events & EVENT_SHARD) audio.shard();
    if (events & EVENT_DASH) audio.dash();
    if (events & EVENT_POWERUP) audio.powerup();
    if (events & EVENT_WAVE) audio.wave();
    if (events & EVENT_BOSS) audio.boss();
    if (events & EVENT_HIT) audio.hit();
  }

  function step(dash) {
    if (screen === SCREEN_TITLE) {
      world.step(STEP, 0, 0, false, true);
      return;
    }
    const move = input.move();
    const events = world.step(STEP, move.x, move.y, dash, false);
    playSound(events);
    if (events & EVENT_OVER) endGame();
    else if (events & EVENT_HIT) announce(world.state.lives === 1 ? 'Hit. 1 life left.' : `Hit. ${world.state.lives} lives left.`);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    const dash = handleActions();
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step(dash);
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world.state, screen, best, { newBest });
  }

  // Leaving the tab pauses a running game rather than letting drifters close in unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Lumen Drift. Press Space or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
