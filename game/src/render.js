// Drawing only: the world's state and the current screen in, pixels out. The 1280x720 playfield
// is scaled to fit the window and centred, the margin filled with the backdrop colour. Neon glow
// comes from pre-rendered radial sprites (fast: no shadowBlur per frame), enemies each have their
// own shape and colour, and the HUD shows score, wave, lives, combo, dash and boss health. Text
// that holds a number is rebuilt only when the number changes, so a frame allocates nothing.

import { FIELD, FONT, PALETTE, PLAYER } from './config.js';
import { KIND_BOSS, KIND_CHASER, KIND_ELITE, KIND_SPITTER, KIND_WEAVER } from './world.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';

/** The panel's width; its height grows with its lines: room for the title, the lines and the prompt. */
const PANEL = { width: 660, top: 150, line: 32, bottom: 76 };
const HEART_SIZE = 11;
const HEART_GAP = 10;

function cachedLabel(prefix) {
  let value = -1;
  let text = '';
  return function label(next) {
    if (next !== value) {
      value = next;
      text = prefix + next;
    }
    return text;
  };
}

/** A fixed starfield: generated once from a fixed seed, so every run paints the same sky. */
function makeStars() {
  let seed = 1337;
  const next = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const stars = [];
  for (let index = 0; index < 90; index += 1) {
    stars.push({ x: next() * FIELD.width, y: next() * FIELD.height, r: 0.6 + next() * 1.3, phase: next() * Math.PI * 2 });
  }
  return stars;
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const stars = makeStars();
  const glowCache = new Map();
  const scoreLabel = cachedLabel('SCORE ');
  const waveLabel = cachedLabel('WAVE ');
  const bestLabel = cachedLabel('BEST ');
  const comboLabel = cachedLabel('COMBO ×');
  const finalLabel = cachedLabel('SCORE ');
  const waveReachedLabel = cachedLabel('WAVE ');
  const killsLabel = cachedLabel('DRIFTERS DOWN ');

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / FIELD.width, height / FIELD.height);
    view.x = (width - FIELD.width * view.scale) / 2;
    view.y = (height - FIELD.height * view.scale) / 2;
  }

  const fonts = new Map();
  function text(value, x, y, size, color, align) {
    if (!fonts.has(size)) fonts.set(size, `${size}px ${FONT}`);
    context.font = fonts.get(size);
    context.fillStyle = color;
    context.textAlign = align;
    context.fillText(value, x, y);
  }

  /** A radial glow sprite for a colour, cached: white core fading to the colour, then clear. */
  function glow(color) {
    let sprite = glowCache.get(color);
    if (sprite) return sprite;
    sprite = document.createElement('canvas');
    sprite.width = 96;
    sprite.height = 96;
    const g = sprite.getContext('2d');
    const gradient = g.createRadialGradient(48, 48, 2, 48, 48, 48);
    gradient.addColorStop(0, '#ffffff');
    gradient.addColorStop(0.25, color);
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gradient;
    g.fillRect(0, 0, 96, 96);
    glowCache.set(color, sprite);
    return sprite;
  }

  function drawGlow(x, y, radius, color, alpha) {
    context.globalAlpha = alpha;
    context.drawImage(glow(color), x - radius, y - radius, radius * 2, radius * 2);
    context.globalAlpha = 1;
  }

  function drawSpiky(x, y, radius, color, points, rotation) {
    context.beginPath();
    for (let index = 0; index < points * 2; index += 1) {
      const angle = rotation + (index / (points * 2)) * Math.PI * 2;
      const r = index % 2 === 0 ? radius : radius * 0.62;
      const px = x + Math.cos(angle) * r;
      const py = y + Math.sin(angle) * r;
      if (index === 0) context.moveTo(px, py);
      else context.lineTo(px, py);
    }
    context.closePath();
    context.fillStyle = color;
    context.fill();
  }

  function drawDiamond(x, y, radius, color, rotation) {
    context.beginPath();
    for (let index = 0; index < 4; index += 1) {
      const angle = rotation + (index / 4) * Math.PI * 2;
      const px = x + Math.cos(angle) * radius;
      const py = y + Math.sin(angle) * radius;
      if (index === 0) context.moveTo(px, py);
      else context.lineTo(px, py);
    }
    context.closePath();
    context.fillStyle = color;
    context.fill();
  }

  function drawHexagon(x, y, radius, color, rotation) {
    context.beginPath();
    for (let index = 0; index < 6; index += 1) {
      const angle = rotation + (index / 6) * Math.PI * 2;
      const px = x + Math.cos(angle) * radius;
      const py = y + Math.sin(angle) * radius;
      if (index === 0) context.moveTo(px, py);
      else context.lineTo(px, py);
    }
    context.closePath();
    context.fillStyle = color;
    context.fill();
  }

  function drawHeart(x, y, size, filled) {
    context.beginPath();
    context.moveTo(x, y + size * 0.9);
    context.bezierCurveTo(x - size * 1.1, y, x - size * 0.5, y - size * 0.9, x, y - size * 0.25);
    context.bezierCurveTo(x + size * 0.5, y - size * 0.9, x + size * 1.1, y, x, y + size * 0.9);
    context.closePath();
    if (filled) {
      context.fillStyle = PALETTE.danger;
      context.fill();
    } else {
      context.strokeStyle = PALETTE.muted;
      context.lineWidth = 2;
      context.stroke();
    }
  }

  function drawField(state) {
    context.fillStyle = PALETTE.field;
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    context.strokeStyle = PALETTE.grid;
    context.lineWidth = 1;
    context.beginPath();
    for (let x = 80; x < FIELD.width; x += 80) {
      context.moveTo(x, 0);
      context.lineTo(x, FIELD.height);
    }
    for (let y = 80; y < FIELD.height; y += 80) {
      context.moveTo(0, y);
      context.lineTo(FIELD.width, y);
    }
    context.stroke();
    for (const star of stars) {
      const alpha = 0.3 + 0.25 * Math.sin(state.elapsed * 2 + star.phase);
      context.globalAlpha = Math.max(0.05, alpha);
      context.fillStyle = '#cfe4ff';
      context.beginPath();
      context.arc(star.x, star.y, star.r, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
    context.strokeStyle = PALETTE.border;
    context.lineWidth = 2;
    context.strokeRect(1, 1, FIELD.width - 2, FIELD.height - 2);

    for (const shard of state.shards) {
      if (!shard.active) continue;
      const pulse = 1 + 0.25 * Math.sin(shard.t * 6);
      const alpha = shard.life < 3 ? 0.4 + 0.6 * Math.abs(Math.sin(shard.t * 8)) : 0.95;
      drawGlow(shard.x, shard.y, 16 * pulse, PALETTE.shard, alpha);
      context.fillStyle = PALETTE.shard;
      context.beginPath();
      context.arc(shard.x, shard.y, 5 * pulse, 0, Math.PI * 2);
      context.fill();
    }

    for (const powerup of state.powerups) {
      if (!powerup.active) continue;
      const color = powerup.kind === 'spread' ? PALETTE.player : powerup.kind === 'shield' ? '#7dff9e' : PALETTE.gold;
      drawGlow(powerup.x, powerup.y, 26, color, 0.9);
      context.strokeStyle = color;
      context.lineWidth = 3;
      context.beginPath();
      context.arc(powerup.x, powerup.y, 13, 0, Math.PI * 2);
      context.stroke();
      context.fillStyle = color;
      context.beginPath();
      context.arc(powerup.x, powerup.y, 5, 0, Math.PI * 2);
      context.fill();
    }

    for (const enemy of state.enemies) {
      if (!enemy.active) continue;
      if (enemy.kind === KIND_CHASER) {
        drawGlow(enemy.x, enemy.y, enemy.r * 2.2, PALETTE.chaser, 0.75);
        drawSpiky(enemy.x, enemy.y, enemy.r, PALETTE.chaser, 8, enemy.t * 1.5);
        context.fillStyle = '#2b0a12';
        context.beginPath();
        context.arc(enemy.x, enemy.y, enemy.r * 0.4, 0, Math.PI * 2);
        context.fill();
      } else if (enemy.kind === KIND_WEAVER) {
        drawGlow(enemy.x, enemy.y, enemy.r * 2.2, PALETTE.weaver, 0.75);
        drawDiamond(enemy.x, enemy.y, enemy.r, PALETTE.weaver, enemy.t * 2);
        context.fillStyle = '#1c1030';
        context.beginPath();
        context.arc(enemy.x, enemy.y, enemy.r * 0.35, 0, Math.PI * 2);
        context.fill();
      } else if (enemy.kind === KIND_SPITTER) {
        drawGlow(enemy.x, enemy.y, enemy.r * 2.2, PALETTE.spitter, 0.75);
        drawHexagon(enemy.x, enemy.y, enemy.r, PALETTE.spitter, enemy.t);
        context.fillStyle = '#2b1a08';
        context.beginPath();
        context.arc(enemy.x, enemy.y, enemy.r * 0.4, 0, Math.PI * 2);
        context.fill();
      } else if (enemy.kind === KIND_ELITE) {
        drawGlow(enemy.x, enemy.y, enemy.r * 2.4, PALETTE.elite, 0.85);
        drawSpiky(enemy.x, enemy.y, enemy.r, PALETTE.elite, 10, enemy.t);
        context.strokeStyle = '#ffd7de';
        context.lineWidth = 2;
        context.beginPath();
        context.arc(enemy.x, enemy.y, enemy.r * 0.62, 0, Math.PI * 2);
        context.stroke();
      } else if (enemy.kind === KIND_BOSS) {
        drawGlow(enemy.x, enemy.y, enemy.r * 2.6, PALETTE.boss, 0.9);
        drawHexagon(enemy.x, enemy.y, enemy.r * 1.15, PALETTE.boss, enemy.t * 0.6);
        context.fillStyle = '#2b0513';
        context.beginPath();
        context.arc(enemy.x, enemy.y, enemy.r * 0.72, 0, Math.PI * 2);
        context.fill();
        context.strokeStyle = '#ff8fa3';
        context.lineWidth = 3;
        context.beginPath();
        context.arc(enemy.x, enemy.y, enemy.r * 0.45, 0, Math.PI * 2);
        context.stroke();
        context.fillStyle = '#ff5d73';
        context.beginPath();
        context.arc(enemy.x, enemy.y, enemy.r * 0.22, 0, Math.PI * 2);
        context.fill();
      }
    }

    for (const bullet of state.pbullets) {
      if (!bullet.active) continue;
      drawGlow(bullet.x, bullet.y, 10, PALETTE.pbullet, 0.9);
      context.fillStyle = '#ffffff';
      context.beginPath();
      context.arc(bullet.x, bullet.y, 3, 0, Math.PI * 2);
      context.fill();
    }
    for (const bullet of state.ebullets) {
      if (!bullet.active) continue;
      drawGlow(bullet.x, bullet.y, 12, PALETTE.ebullet, 0.9);
      context.fillStyle = '#ffd7de';
      context.beginPath();
      context.arc(bullet.x, bullet.y, 4, 0, Math.PI * 2);
      context.fill();
    }

    const p = state.player;
    // Blink while invulnerable after a hit: hidden on every other tenth of a second.
    if (p.invuln <= 0 || Math.floor(p.invuln * 10) % 2 === 1) {
      drawGlow(p.x, p.y, 46, PALETTE.player, 0.95);
      context.fillStyle = PALETTE.playerCore;
      context.beginPath();
      context.arc(p.x, p.y, PLAYER.radius, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = PALETTE.player;
      context.beginPath();
      context.arc(p.x + Math.cos(p.angle) * (PLAYER.radius + 8), p.y + Math.sin(p.angle) * (PLAYER.radius + 8), 4, 0, Math.PI * 2);
      context.fill();
      if (p.shield > 0) {
        context.strokeStyle = '#7dff9e';
        context.lineWidth = 3;
        context.globalAlpha = 0.7 + 0.3 * Math.sin(state.elapsed * 6);
        context.beginPath();
        context.arc(p.x, p.y, PLAYER.radius + 10, 0, Math.PI * 2);
        context.stroke();
        context.globalAlpha = 1;
      }
    }

    context.globalCompositeOperation = 'lighter';
    for (const particle of state.particles) {
      if (!particle.active) continue;
      context.globalAlpha = Math.max(0, particle.life / particle.maxLife);
      context.fillStyle = particle.color;
      context.beginPath();
      context.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
    context.globalCompositeOperation = 'source-over';
  }

  function drawHud(state) {
    context.textBaseline = 'top';
    text(scoreLabel(state.score), 24, 18, 28, PALETTE.text, 'left');
    text(waveLabel(state.wave), FIELD.width / 2, 18, 28, PALETTE.text, 'center');
    const firstHeart = FIELD.width - 24 - PLAYER.maxLives * (HEART_SIZE * 2 + HEART_GAP) + HEART_GAP;
    for (let life = 0; life < PLAYER.maxLives; life += 1) {
      drawHeart(firstHeart + life * (HEART_SIZE * 2 + HEART_GAP) + HEART_SIZE, 30, HEART_SIZE, life < state.lives);
    }
    if (state.combo >= 2) {
      text(comboLabel(state.combo), 24, 52, 22, PALETTE.gold, 'left');
      const width = 120;
      const fraction = Math.max(0, state.comboTimer / 3);
      context.fillStyle = '#2a3040';
      context.fillRect(24, 82, width, 6);
      context.fillStyle = PALETTE.gold;
      context.fillRect(24, 82, width * fraction, 6);
    }
    if (state.bossActive && state.boss) {
      const width = 360;
      const x = (FIELD.width - width) / 2;
      text('THE WARDEN', FIELD.width / 2, 52, 18, PALETTE.boss, 'center');
      context.fillStyle = '#2a0a12';
      context.fillRect(x, 76, width, 12);
      context.fillStyle = PALETTE.boss;
      context.fillRect(x, 76, width * Math.max(0, state.boss.hp / state.boss.maxHp), 12);
    }
    // Dash cooldown, bottom left.
    const dashFraction = Math.max(0, 1 - state.player.dashCooldown / 1.1);
    text('DASH', 24, FIELD.height - 40, 18, dashFraction >= 1 ? PALETTE.player : PALETTE.muted, 'left');
    context.fillStyle = '#2a3040';
    context.fillRect(84, FIELD.height - 36, 140, 8);
    context.fillStyle = dashFraction >= 1 ? PALETTE.player : '#3d5a78';
    context.fillRect(84, FIELD.height - 36, 140 * dashFraction, 8);
    // Active power-ups, bottom right.
    let px = FIELD.width - 24;
    const p = state.player;
    const showPower = (label, seconds, color) => {
      const labelText = `${label} ${Math.ceil(seconds)}s`;
      context.font = `18px ${FONT}`;
      const width = context.measureText(labelText).width;
      px -= width;
      text(labelText, px, FIELD.height - 40, 18, color, 'left');
      px -= 16;
    };
    if (p.spread > 0) showPower('SPREAD', p.spread, PALETTE.player);
    if (p.shield > 0) showPower('SHIELD', p.shieldTimer, '#7dff9e');
    if (p.magnet > 0) showPower('MAGNET', p.magnet, PALETTE.gold);
    // Banner: the wave callout, fading out.
    if (state.bannerTimer > 0 && state.banner) {
      context.globalAlpha = Math.min(1, state.bannerTimer);
      text(state.banner, FIELD.width / 2, 150, 46, PALETTE.text, 'center');
      context.globalAlpha = 1;
    }
  }

  function drawPanel(title, lines, prompt) {
    const height = PANEL.top + lines.length * PANEL.line + PANEL.bottom;
    const x = (FIELD.width - PANEL.width) / 2;
    const y = (FIELD.height - height) / 2;
    context.fillStyle = PALETTE.panel;
    context.fillRect(x, y, PANEL.width, height);
    context.strokeStyle = PALETTE.panelEdge;
    context.lineWidth = 2;
    context.strokeRect(x, y, PANEL.width, height);
    context.textBaseline = 'alphabetic';
    text(title, FIELD.width / 2, y + 78, 48, PALETTE.text, 'center');
    for (let index = 0; index < lines.length; index += 1) {
      text(lines[index], FIELD.width / 2, y + PANEL.top + index * PANEL.line, 21, PALETTE.muted, 'center');
    }
    text(prompt, FIELD.width / 2, y + height - 38, 23, PALETTE.gold, 'center');
  }

  const TITLE_LINES = [
    'Pilot an orb of light. Survive the waves.',
    'Move with WASD or arrows. Dash with Space or Shift.',
    'Your shots fire on their own — collect shards to raise the combo.',
    'Every 20 shards mends a heart. The Warden rises every 5th wave.',
    '',
  ];
  const PAUSED_LINES = ['The drifters will wait for you.'];
  const OVER_LINES = ['', '', ''];

  /**
   * Paint one frame: the field, then the HUD or a panel for the screen the game is on.
   * With `still` set (a screenshot), the shake and the hit flash are skipped so the frame is
   * exactly what the staged world looks like.
   */
  function draw(state, screen, best, opts = {}) {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, canvas.width, canvas.height);
    const shakeX = !opts.still && state.shake > 0 ? (Math.random() - 0.5) * state.shake * 14 : 0;
    const shakeY = !opts.still && state.shake > 0 ? (Math.random() - 0.5) * state.shake * 14 : 0;
    context.setTransform(view.scale, 0, 0, view.scale, view.x + shakeX * view.scale, view.y + shakeY * view.scale);
    drawField(state);
    if (screen === SCREEN_TITLE) {
      TITLE_LINES[4] = bestLabel(best);
      drawPanel('LUMEN DRIFT', TITLE_LINES, 'Press Space or click to start');
      return;
    }
    drawHud(state);
    if (screen === SCREEN_PAUSED) drawPanel('Paused', PAUSED_LINES, 'Press P to resume');
    else if (screen === SCREEN_OVER) {
      OVER_LINES[0] = finalLabel(state.score);
      OVER_LINES[1] = opts.newBest ? `${waveReachedLabel(state.wave)}  ·  NEW BEST` : waveReachedLabel(state.wave);
      OVER_LINES[2] = killsLabel(state.kills);
      drawPanel('Game over', OVER_LINES, 'Press Space or click to play again');
    }
    if (!opts.still && state.flash > 0) {
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.fillStyle = `rgba(255, 240, 240, ${state.flash * 0.3})`;
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw };
}
