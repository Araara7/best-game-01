// The screenshot scenes behind ?shot=start|play|boss|end. Each one plays the real rules forward
// from a fresh world for a fixed time, steered by a simple autopilot (flee what is close, chase
// the nearest shard, keep off the walls, dash out of trouble), so the frame is what a short game
// really looks like and the same seed always gives the same frame. The good pilot plays the
// play and boss scenes; the end scene's pilot is careless — no dash, no bullet dodging — so it
// is caught out once the waves thicken, as a hurried player is.

import { FIELD, STEP } from './config.js';
import { EVENT_OVER } from './world.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const START_SECONDS = 5;
const PLAY_WINDOW_SECONDS = 60;
const PLAY_FALLBACK_SECONDS = 26;
const BOSS_FIGHT_SECONDS = 4;
const LIMIT_SECONDS = 900;
const SETTLE_STEPS = 45;

/** How busy a frame looks: enemies count double, bullets and shards single. */
function actionScore(state) {
  let score = 0;
  for (const enemy of state.enemies) if (enemy.active) score += 2;
  for (const bullet of state.ebullets) if (bullet.active) score += 1;
  for (const shard of state.shards) if (shard.active) score += 1;
  for (const bullet of state.pbullets) if (bullet.active) score += 0.5;
  return score;
}

/** Steer the orb: flee enemies and bullets, chase shards, stay off the walls. */
function autopilot(state, skill) {
  const p = state.player;
  let fx = 0;
  let fy = 0;
  const fleeRadius = skill ? 240 : 100;
  for (const enemy of state.enemies) {
    if (!enemy.active) continue;
    const dx = p.x - enemy.x;
    const dy = p.y - enemy.y;
    const d = Math.hypot(dx, dy) || 1;
    if (d < fleeRadius) {
      const weight = (fleeRadius - d) / fleeRadius;
      fx += (dx / d) * weight;
      fy += (dy / d) * weight;
    }
  }
  if (skill) {
    for (const bullet of state.ebullets) {
      if (!bullet.active) continue;
      const dx = p.x - bullet.x;
      const dy = p.y - bullet.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d < 180) {
        const weight = ((180 - d) / 180) * 1.4;
        fx += (dx / d) * weight;
        fy += (dy / d) * weight;
      }
    }
  }
  let shard = null;
  let shardDist = 420;
  for (const item of state.shards) {
    if (!item.active) continue;
    const d = Math.hypot(item.x - p.x, item.y - p.y);
    if (d < shardDist) {
      shardDist = d;
      shard = item;
    }
  }
  if (shard) {
    fx += ((shard.x - p.x) / (shardDist || 1)) * 0.7;
    fy += ((shard.y - p.y) / (shardDist || 1)) * 0.7;
  }
  const margin = 90;
  if (p.x < margin) fx += 1;
  if (p.x > FIELD.width - margin) fx -= 1;
  if (p.y < margin) fy += 1;
  if (p.y > FIELD.height - margin) fy -= 1;
  const len = Math.hypot(fx, fy);
  let mx = 0;
  let my = 0;
  if (len > 0.05) {
    mx = Math.abs(fx / len) > 0.35 ? Math.sign(fx) : 0;
    my = Math.abs(fy / len) > 0.35 ? Math.sign(fy) : 0;
  }
  let dash = false;
  if (skill && p.dashCooldown <= 0) {
    for (const bullet of state.ebullets) {
      if (bullet.active && Math.hypot(bullet.x - p.x, bullet.y - p.y) < 95) {
        dash = true;
        break;
      }
    }
    if (!dash) {
      for (const enemy of state.enemies) {
        if (enemy.active && Math.hypot(enemy.x - p.x, enemy.y - p.y) < enemy.r + 55) {
          dash = true;
          break;
        }
      }
    }
  }
  return { mx, my, dash };
}

/**
 * Set `world` to the named scene (start, play, boss or end; any other name is start) and return
 * the screen to draw over it and the best score to show.
 */
export function stageShot(name, world) {
  world.reset();
  if (name !== 'play' && name !== 'boss' && name !== 'end') {
    for (let index = 0; index < START_SECONDS / STEP; index += 1) world.step(STEP, 0, 0, false, true);
    return { screen: SCREEN_TITLE, best: 0 };
  }
  if (name === 'boss') {
    // Play until the wave-5 Warden has been fighting for a few seconds.
    for (let index = 0; index < LIMIT_SECONDS / STEP; index += 1) {
      const pilot = autopilot(world.state, true);
      world.step(STEP, pilot.mx, pilot.my, pilot.dash, false);
      if (world.state.bossActive && world.state.bossTime > BOSS_FIGHT_SECONDS) break;
      if (world.state.lives <= 0) break;
    }
    const over = world.state.lives <= 0;
    return { screen: over ? SCREEN_OVER : SCREEN_PLAY, best: world.state.score };
  }
  const skill = name !== 'end';
  if (name === 'play') {
    // Find the busiest frame of the first minute (wave 2 or later), then replay exactly to it:
    // the world is deterministic, so the same seed and the same pilot give the same frame.
    let bestStep = 0;
    let bestScore = -1;
    for (let index = 0; index < PLAY_WINDOW_SECONDS / STEP; index += 1) {
      const pilot = autopilot(world.state, true);
      world.step(STEP, pilot.mx, pilot.my, pilot.dash, false);
      const score = actionScore(world.state);
      if (world.state.wave >= 2 && world.state.lives > 0 && score > bestScore) {
        bestScore = score;
        bestStep = index + 1;
      }
      if (world.state.lives <= 0) break;
    }
    if (bestStep === 0) {
      world.reseed();
      world.reset();
      for (let index = 0; index < PLAY_FALLBACK_SECONDS / STEP; index += 1) {
        const pilot = autopilot(world.state, true);
        world.step(STEP, pilot.mx, pilot.my, pilot.dash, false);
      }
    } else {
      world.reseed();
      world.reset();
      for (let index = 0; index < bestStep; index += 1) {
        const pilot = autopilot(world.state, true);
        world.step(STEP, pilot.mx, pilot.my, pilot.dash, false);
      }
    }
    return { screen: SCREEN_PLAY, best: world.state.score };
  }
  const limit = LIMIT_SECONDS;
  for (let index = 0; index < limit / STEP; index += 1) {
    const pilot = autopilot(world.state, skill);
    if (world.step(STEP, pilot.mx, pilot.my, pilot.dash, false) & EVENT_OVER) break;
  }
  if (name === 'end') {
    // Let the death flash and shake settle so the frame is still.
    for (let index = 0; index < SETTLE_STEPS; index += 1) world.step(STEP, 0, 0, false, true);
    return { screen: SCREEN_OVER, best: world.state.score };
  }
  return { screen: SCREEN_PLAY, best: world.state.score };
}
