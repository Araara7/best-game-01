// The game's rules and state, with no drawing and no browser in it: the player's orb, the
// enemy waves, bullets, shards, power-ups, the boss, combo and score. step() advances one fixed
// step and returns what happened as bit flags, so the caller can react (sound, announcements)
// without the world knowing about screens or sound. Pools are allocated once, at boot.

import { COMBO, ENEMY, FIELD, PLAYER, POOL, POWERUP, SHARD, WAVE } from './config.js';
import { createRandom } from './random.js';

export const KIND_CHASER = 0;
export const KIND_WEAVER = 1;
export const KIND_SPITTER = 2;
export const KIND_ELITE = 3;
export const KIND_BOSS = 4;

export const EVENT_SHOOT = 1;
export const EVENT_KILL = 2;
export const EVENT_SHARD = 4;
export const EVENT_HIT = 8;
export const EVENT_OVER = 16;
export const EVENT_WAVE = 32;
export const EVENT_BOSS = 64;
export const EVENT_POWERUP = 128;
export const EVENT_DASH = 256;

function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

export function createWorld(seed) {
  let random = createRandom(seed);
  const player = {
    x: FIELD.width / 2, y: FIELD.height / 2, vx: 0, vy: 0, angle: -Math.PI / 2,
    dashTime: 0, dashCooldown: 0, dashX: 0, dashY: 0,
    fireTimer: 0, invuln: 0, shield: 0, shieldTimer: 0, spread: 0, magnet: 0,
  };
  const enemies = [];
  for (let index = 0; index < POOL.enemies; index += 1) {
    enemies.push({ active: false, kind: KIND_CHASER, x: 0, y: 0, vx: 0, vy: 0, hp: 1, maxHp: 1, r: 10, speed: 0, t: 0, shootTimer: 0, summonTimer: 0, burstTimer: 0, phase: 0 });
  }
  const pbullets = [];
  for (let index = 0; index < POOL.pbullets; index += 1) pbullets.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0 });
  const ebullets = [];
  for (let index = 0; index < POOL.ebullets; index += 1) ebullets.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, r: 7 });
  const shards = [];
  for (let index = 0; index < POOL.shards; index += 1) shards.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, t: 0 });
  const powerups = [];
  for (let index = 0; index < POOL.powerups; index += 1) powerups.push({ active: false, kind: 'spread', x: 0, y: 0, life: 0 });
  const particles = [];
  for (let index = 0; index < POOL.particles; index += 1) particles.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, size: 2, color: '#ffffff' });

  const state = {
    player, enemies, pbullets, ebullets, shards, powerups, particles,
    score: 0, lives: PLAYER.maxLives, wave: 1, combo: 0, comboTimer: 0, shardStreak: 0,
    kills: 0, elapsed: 0, spawnQueue: [], spawnTimer: 0,
    waveState: 'breather', breatherTimer: 1.2,
    boss: null, bossActive: false, bossTime: 0, bossIndex: 0,
    shake: 0, flash: 0, banner: '', bannerTimer: 0, shotsFired: 0,
  };

  /** The score multiplier from the combo: +1 every 4 combo, up to the cap. */
  function multiplier() {
    return 1 + Math.min(COMBO.maxMultiplier - 1, Math.floor(state.combo / COMBO.perMultiplier));
  }

  function setBanner(text) {
    state.banner = text;
    state.bannerTimer = 2.2;
  }

  function reset() {
    player.x = FIELD.width / 2;
    player.y = FIELD.height / 2;
    player.vx = 0;
    player.vy = 0;
    player.angle = -Math.PI / 2;
    player.dashTime = 0;
    player.dashCooldown = 0;
    player.fireTimer = 0;
    player.invuln = 0;
    player.shield = 0;
    player.shieldTimer = 0;
    player.spread = 0;
    player.magnet = 0;
    for (const enemy of enemies) enemy.active = false;
    for (const bullet of pbullets) bullet.active = false;
    for (const bullet of ebullets) bullet.active = false;
    for (const shard of shards) shard.active = false;
    for (const powerup of powerups) powerup.active = false;
    for (const particle of particles) particle.active = false;
    state.score = 0;
    state.lives = PLAYER.maxLives;
    state.wave = 1;
    state.combo = 0;
    state.comboTimer = 0;
    state.shardStreak = 0;
    state.kills = 0;
    state.elapsed = 0;
    state.spawnQueue = [];
    state.spawnTimer = 0;
    state.waveState = 'breather';
    state.breatherTimer = 1.2;
    state.boss = null;
    state.bossActive = false;
    state.bossTime = 0;
    state.bossIndex = 0;
    state.shake = 0;
    state.flash = 0;
    state.banner = '';
    state.bannerTimer = 0;
    state.shotsFired = 0;
  }

  function free(list) {
    for (let index = 0; index < list.length; index += 1) if (!list[index].active) return list[index];
    return null;
  }

  function activeEnemies() {
    let count = 0;
    for (const enemy of enemies) if (enemy.active) count += 1;
    return count;
  }

  function burst(x, y, color, count, speed, size) {
    for (let n = 0; n < count; n += 1) {
      const particle = free(particles);
      if (particle === null) return;
      const angle = random() * Math.PI * 2;
      const v = speed * (0.3 + random() * 0.7);
      particle.active = true;
      particle.x = x;
      particle.y = y;
      particle.vx = Math.cos(angle) * v;
      particle.vy = Math.sin(angle) * v;
      particle.maxLife = 0.35 + random() * 0.45;
      particle.life = particle.maxLife;
      particle.size = size * (0.6 + random() * 0.8);
      particle.color = color;
    }
  }

  function spawnShard(x, y, count) {
    for (let n = 0; n < count; n += 1) {
      const shard = free(shards);
      if (shard === null) return;
      const angle = random() * Math.PI * 2;
      shard.active = true;
      shard.x = x;
      shard.y = y;
      shard.vx = Math.cos(angle) * (40 + random() * 90);
      shard.vy = Math.sin(angle) * (40 + random() * 90);
      shard.life = SHARD.life;
      shard.t = random() * Math.PI * 2;
    }
  }

  function spawnPowerup(x, y, kind) {
    const powerup = free(powerups);
    if (powerup === null) return;
    powerup.active = true;
    powerup.kind = kind;
    powerup.x = x;
    powerup.y = y;
    powerup.life = 12;
  }

  /** A spawn point on the arena's edge, far enough from the player to be fair. */
  function edgePoint() {
    for (let tries = 0; tries < 12; tries += 1) {
      const side = Math.floor(random() * 4);
      let x = 0;
      let y = 0;
      if (side === 0) { x = random() * FIELD.width; y = 24; } else if (side === 1) { x = random() * FIELD.width; y = FIELD.height - 24; } else if (side === 2) { x = 24; y = random() * FIELD.height; } else { x = FIELD.width - 24; y = random() * FIELD.height; }
      if (dist(x, y, player.x, player.y) > 320) return { x, y };
    }
    return { x: 40, y: 40 };
  }

  function spawnEnemy(kind, elite) {
    const enemy = free(enemies);
    if (enemy === null) return null;
    const point = edgePoint();
    const def = kind === KIND_BOSS ? ENEMY.boss : kind === KIND_WEAVER ? ENEMY.weaver : kind === KIND_SPITTER ? ENEMY.spitter : kind === KIND_ELITE ? ENEMY.elite : ENEMY.chaser;
    const wave = state.wave;
    enemy.active = true;
    enemy.kind = kind;
    enemy.x = point.x;
    enemy.y = point.y;
    enemy.vx = 0;
    enemy.vy = 0;
    enemy.r = def.radius;
    enemy.speed = def.speed + (def.speedPerWave ?? 0) * (wave - 1);
    enemy.hp = kind === KIND_BOSS ? def.hp + def.hpPerBoss * state.bossIndex : def.hp;
    enemy.maxHp = enemy.hp;
    enemy.t = 0;
    enemy.phase = random() * Math.PI * 2;
    enemy.shootTimer = 1 + random() * 1.5;
    enemy.summonTimer = 4;
    enemy.burstTimer = 2;
    if (kind === KIND_BOSS) {
      state.boss = enemy;
      state.bossActive = true;
      state.bossTime = 0;
      state.bossIndex += 1;
      state.shake = Math.max(state.shake, 0.6);
      setBanner('THE WARDEN');
    }
    return enemy;
  }

  /** The wave's roster: what spawns, in what order. Boss waves open with the Warden. */
  function buildWave(wave) {
    const queue = [];
    if (wave % WAVE.bossEvery === 0) {
      queue.push({ kind: KIND_BOSS, elite: false });
      for (let index = 0; index < 6; index += 1) queue.push({ kind: KIND_CHASER, elite: false });
      return queue;
    }
    const count = Math.min(WAVE.maxCount, WAVE.baseCount + WAVE.perWave * wave);
    let elites = 0;
    for (let index = 0; index < count; index += 1) {
      const roll = random();
      if (wave >= 4 && elites < 2 && roll > 0.92) {
        queue.push({ kind: KIND_ELITE, elite: true });
        elites += 1;
      } else if (wave >= 3 && roll > 0.78) queue.push({ kind: KIND_SPITTER, elite: false });
      else if (wave >= 2 && roll > 0.45) queue.push({ kind: KIND_WEAVER, elite: false });
      else queue.push({ kind: KIND_CHASER, elite: false });
    }
    return queue;
  }

  function startWave() {
    state.waveState = 'fight';
    state.spawnQueue = buildWave(state.wave);
    state.spawnTimer = 0.3;
    if (state.wave % WAVE.bossEvery !== 0) setBanner(`WAVE ${state.wave}`);
  }

  function firePlayerBullet(angle) {
    const bullet = free(pbullets);
    if (bullet === null) return;
    bullet.active = true;
    bullet.x = player.x + Math.cos(angle) * (PLAYER.radius + 6);
    bullet.y = player.y + Math.sin(angle) * (PLAYER.radius + 6);
    bullet.vx = Math.cos(angle) * PLAYER.bulletSpeed;
    bullet.vy = Math.sin(angle) * PLAYER.bulletSpeed;
    bullet.life = 1.2;
    state.shotsFired += 1;
  }

  function fireEnemyBullet(x, y, angle, speed) {
    const bullet = free(ebullets);
    if (bullet === null) return;
    bullet.active = true;
    bullet.x = x;
    bullet.y = y;
    bullet.vx = Math.cos(angle) * speed;
    bullet.vy = Math.sin(angle) * speed;
    bullet.life = 6;
    bullet.r = 7;
  }

  /** Damage one enemy; returns true when it dies, with its score, drops and events. */
  function damageEnemy(enemy, dmg) {
    enemy.hp -= dmg;
    if (enemy.hp > 0) return false;
    enemy.active = false;
    state.kills += 1;
    state.combo = Math.min(COMBO.max, state.combo + 1);
    state.comboTimer = COMBO.window;
    const mult = multiplier();
    state.score += (enemy.kind === KIND_BOSS ? ENEMY.boss.score : enemy.kind === KIND_WEAVER ? ENEMY.weaver.score : enemy.kind === KIND_SPITTER ? ENEMY.spitter.score : enemy.kind === KIND_ELITE ? ENEMY.elite.score : ENEMY.chaser.score) * mult;
    const color = enemy.kind === KIND_BOSS ? '#ff2e63' : enemy.kind === KIND_WEAVER ? '#c792ff' : enemy.kind === KIND_SPITTER ? '#ff9f43' : enemy.kind === KIND_ELITE ? '#ff4d6d' : '#ff5d73';
    burst(enemy.x, enemy.y, color, enemy.kind === KIND_BOSS ? 60 : 14, enemy.kind === KIND_BOSS ? 320 : 200, enemy.kind === KIND_BOSS ? 4 : 3);
    if (enemy.kind === KIND_BOSS) {
      state.boss = null;
      state.bossActive = false;
      state.shake = 1;
      state.flash = 0.6;
      spawnShard(enemy.x, enemy.y, 10);
      spawnPowerup(enemy.x - 60, enemy.y, 'spread');
      spawnPowerup(enemy.x + 60, enemy.y, 'shield');
      spawnPowerup(enemy.x, enemy.y + 50, 'magnet');
    } else if (enemy.kind === KIND_ELITE) {
      spawnShard(enemy.x, enemy.y, 3);
      const kinds = ['spread', 'shield', 'magnet'];
      spawnPowerup(enemy.x, enemy.y, kinds[Math.floor(random() * kinds.length)]);
    } else if (enemy.kind === KIND_SPITTER) spawnShard(enemy.x, enemy.y, 2);
    else if (random() < 0.65) spawnShard(enemy.x, enemy.y, 1);
    return true;
  }

  /** The player is hit. A shield absorbs it; otherwise a life is lost. Returns the events. */
  function hurtPlayer(enemy) {
    if (player.shield > 0) {
      player.shield = 0;
      player.invuln = Math.max(player.invuln, 0.8);
      if (enemy) damageEnemy(enemy, 3);
      burst(player.x, player.y, '#5ff2ff', 16, 240, 3);
      return EVENT_HIT;
    }
    state.lives -= 1;
    player.invuln = PLAYER.invulnerable;
    state.combo = 0;
    state.comboTimer = 0;
    state.shake = 1;
    state.flash = 0.5;
    burst(player.x, player.y, '#ff5d73', 24, 280, 3);
    if (state.lives <= 0) return EVENT_HIT | EVENT_OVER;
    return EVENT_HIT;
  }

  /**
   * One fixed step. `mx, my` is the held steering vector (-1, 0, 1 each way), `dash` a dash
   * press. With `harmless` set (the title screen's backdrop) things drift but nothing touches
   * the player and nothing scores: the orb circles the arena and drifters wander in.
   */
  function step(dt, mx, my, dash, harmless) {
    let events = 0;
    state.elapsed += dt;
    if (state.bannerTimer > 0) state.bannerTimer -= dt;
    if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 2.2);
    if (state.flash > 0) state.flash = Math.max(0, state.flash - dt * 3);
    if (state.comboTimer > 0) {
      state.comboTimer -= dt;
      if (state.comboTimer <= 0) state.combo = 0;
    }

    const p = player;
    if (p.dashCooldown > 0) p.dashCooldown -= dt;
    if (p.invuln > 0) p.invuln -= dt;
    if (p.spread > 0) p.spread -= dt;
    if (p.magnet > 0) p.magnet -= dt;
    if (p.shieldTimer > 0) {
      p.shieldTimer -= dt;
      if (p.shieldTimer <= 0) p.shield = 0;
    }

    if (harmless) {
      // The title backdrop: the orb circles the arena and drifters wander in.
      const angle = state.elapsed * 0.25;
      p.x = FIELD.width / 2 + Math.cos(angle) * 480;
      p.y = FIELD.height / 2 + Math.sin(angle) * 260;
      p.angle = angle + Math.PI / 2;
      if (state.spawnQueue.length === 0 && activeEnemies() < 6) {
        state.spawnQueue = buildWave(state.wave);
        if (state.wave % WAVE.bossEvery === 0) state.spawnQueue = state.spawnQueue.filter((entry) => entry.kind !== KIND_BOSS);
      }
      if (state.spawnQueue.length > 0) {
        state.spawnTimer -= dt;
        if (state.spawnTimer <= 0) {
          const next = state.spawnQueue.shift();
          spawnEnemy(next.kind, next.elite);
          state.spawnTimer = 0.8;
        }
      }
      for (const enemy of enemies) {
        if (!enemy.active) continue;
        enemy.t += dt;
        const dx = p.x - enemy.x;
        const dy = p.y - enemy.y;
        const d = Math.hypot(dx, dy) || 1;
        enemy.vx = (dx / d) * enemy.speed * 0.4;
        enemy.vy = (dy / d) * enemy.speed * 0.4;
        enemy.x += enemy.vx * dt;
        enemy.y += enemy.vy * dt;
      }
      updateParticles(dt);
      return events;
    }

    // --- dash
    if (dash && p.dashCooldown <= 0 && p.dashTime <= 0) {
      const len = Math.hypot(mx, my);
      p.dashX = len > 0 ? mx / len : Math.cos(p.angle);
      p.dashY = len > 0 ? my / len : Math.sin(p.angle);
      p.dashTime = PLAYER.dashTime;
      p.dashCooldown = PLAYER.dashCooldown;
      p.invuln = Math.max(p.invuln, PLAYER.dashTime + 0.05);
      burst(p.x, p.y, '#5ff2ff', 10, 160, 3);
      events |= EVENT_DASH;
    }

    // --- movement: velocity eases toward the held direction, or the dash burst
    let tx = 0;
    let ty = 0;
    if (p.dashTime > 0) {
      p.dashTime -= dt;
      tx = p.dashX * PLAYER.dashSpeed;
      ty = p.dashY * PLAYER.dashSpeed;
      burst(p.x, p.y, '#5ff2ff', 1, 20, 3);
    } else {
      const len = Math.hypot(mx, my);
      if (len > 0) {
        tx = (mx / len) * PLAYER.speed;
        ty = (my / len) * PLAYER.speed;
      }
    }
    const ease = Math.min(1, 12 * dt);
    p.vx += (tx - p.vx) * ease;
    p.vy += (ty - p.vy) * ease;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.x < PLAYER.radius) { p.x = PLAYER.radius; p.vx = 0; }
    if (p.x > FIELD.width - PLAYER.radius) { p.x = FIELD.width - PLAYER.radius; p.vx = 0; }
    if (p.y < PLAYER.radius) { p.y = PLAYER.radius; p.vy = 0; }
    if (p.y > FIELD.height - PLAYER.radius) { p.y = FIELD.height - PLAYER.radius; p.vy = 0; }
    if (Math.hypot(p.vx, p.vy) > 20) p.angle = Math.atan2(p.vy, p.vx);

    // --- auto-fire at the nearest enemy in range
    p.fireTimer -= dt;
    let target = null;
    let targetDist = PLAYER.fireRange;
    for (const enemy of enemies) {
      if (!enemy.active) continue;
      const d = dist(enemy.x, enemy.y, p.x, p.y);
      if (d < targetDist) {
        targetDist = d;
        target = enemy;
      }
    }
    if (target !== null) {
      p.angle = Math.atan2(target.y - p.y, target.x - p.x);
      if (p.fireTimer <= 0) {
        p.fireTimer = PLAYER.fireInterval;
        firePlayerBullet(p.angle);
        if (p.spread > 0) {
          firePlayerBullet(p.angle - 0.22);
          firePlayerBullet(p.angle + 0.22);
        }
        events |= EVENT_SHOOT;
      }
    }

    // --- waves
    if (state.waveState === 'breather') {
      state.breatherTimer -= dt;
      if (state.breatherTimer <= 0) startWave();
    } else {
      if (state.spawnQueue.length > 0) {
        state.spawnTimer -= dt;
        if (state.spawnTimer <= 0) {
          const next = state.spawnQueue.shift();
          spawnEnemy(next.kind, next.elite);
          state.spawnTimer = WAVE.spawnInterval;
        }
      } else if (activeEnemies() === 0 && !state.bossActive) {
        state.score += 100 * state.wave * multiplier();
        state.wave += 1;
        state.waveState = 'breather';
        state.breatherTimer = WAVE.breather;
        setBanner(`WAVE ${state.wave}`);
        events |= EVENT_WAVE;
      }
    }
    if (state.bossActive) state.bossTime += dt;

    // --- enemies
    for (const enemy of enemies) {
      if (!enemy.active) continue;
      enemy.t += dt;
      const dx = p.x - enemy.x;
      const dy = p.y - enemy.y;
      const d = Math.hypot(dx, dy) || 1;
      if (enemy.kind === KIND_CHASER || enemy.kind === KIND_ELITE) {
        enemy.vx = (dx / d) * enemy.speed;
        enemy.vy = (dy / d) * enemy.speed;
      } else if (enemy.kind === KIND_WEAVER) {
        const wobble = Math.sin(enemy.t * 5 + enemy.phase) * 0.7;
        const nx = dx / d;
        const ny = dy / d;
        enemy.vx = (nx - ny * wobble) * enemy.speed;
        enemy.vy = (ny + nx * wobble) * enemy.speed;
      } else if (enemy.kind === KIND_SPITTER) {
        const keep = ENEMY.spitter.keepRange;
        if (d > keep) {
          enemy.vx = (dx / d) * enemy.speed;
          enemy.vy = (dy / d) * enemy.speed;
        } else if (d < keep * 0.7) {
          enemy.vx = (-dx / d) * enemy.speed;
          enemy.vy = (-dy / d) * enemy.speed;
        } else {
          enemy.vx = (-dy / d) * enemy.speed * 0.5;
          enemy.vy = (dx / d) * enemy.speed * 0.5;
        }
        enemy.shootTimer -= dt;
        if (enemy.shootTimer <= 0) {
          enemy.shootTimer = ENEMY.spitter.shootInterval + random() * 0.6;
          fireEnemyBullet(enemy.x, enemy.y, Math.atan2(dy, dx), ENEMY.spitter.bulletSpeed);
        }
      } else if (enemy.kind === KIND_BOSS) {
        enemy.vx = (dx / d) * enemy.speed;
        enemy.vy = (dy / d) * enemy.speed;
        enemy.burstTimer -= dt;
        if (enemy.burstTimer <= 0) {
          enemy.burstTimer = ENEMY.boss.burstInterval;
          for (let n = 0; n < ENEMY.boss.burstCount; n += 1) {
            fireEnemyBullet(enemy.x, enemy.y, (n / ENEMY.boss.burstCount) * Math.PI * 2 + enemy.t, ENEMY.boss.bulletSpeed);
          }
        }
        enemy.summonTimer -= dt;
        if (enemy.summonTimer <= 0) {
          enemy.summonTimer = ENEMY.boss.summonInterval;
          for (let n = 0; n < 3; n += 1) spawnEnemy(KIND_CHASER, false);
        }
      }
      enemy.x += enemy.vx * dt;
      enemy.y += enemy.vy * dt;
      if (enemy.x < enemy.r) enemy.x = enemy.r;
      if (enemy.x > FIELD.width - enemy.r) enemy.x = FIELD.width - enemy.r;
      if (enemy.y < enemy.r) enemy.y = enemy.r;
      if (enemy.y > FIELD.height - enemy.r) enemy.y = FIELD.height - enemy.r;
    }

    // --- enemies keep apart: a cheap pairwise push
    for (let a = 0; a < enemies.length; a += 1) {
      const ea = enemies[a];
      if (!ea.active) continue;
      for (let b = a + 1; b < enemies.length; b += 1) {
        const eb = enemies[b];
        if (!eb.active) continue;
        const dx = eb.x - ea.x;
        const dy = eb.y - ea.y;
        const d = Math.hypot(dx, dy);
        const min = ea.r + eb.r;
        if (d > 0.01 && d < min) {
          const push = (min - d) / 2;
          const nx = dx / d;
          const ny = dy / d;
          ea.x -= nx * push;
          ea.y -= ny * push;
          eb.x += nx * push;
          eb.y += ny * push;
        }
      }
    }

    // --- player bullets
    for (const bullet of pbullets) {
      if (!bullet.active) continue;
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;
      bullet.life -= dt;
      if (bullet.life <= 0 || bullet.x < 0 || bullet.x > FIELD.width || bullet.y < 0 || bullet.y > FIELD.height) {
        bullet.active = false;
        continue;
      }
      for (const enemy of enemies) {
        if (!enemy.active) continue;
        if (dist(bullet.x, bullet.y, enemy.x, enemy.y) < enemy.r + PLAYER.bulletRadius) {
          bullet.active = false;
          burst(bullet.x, bullet.y, '#aef6ff', 4, 140, 2);
          if (damageEnemy(enemy, 1)) events |= EVENT_KILL;
          break;
        }
      }
    }

    // --- enemy bullets
    for (const bullet of ebullets) {
      if (!bullet.active) continue;
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;
      bullet.life -= dt;
      if (bullet.life <= 0 || bullet.x < -20 || bullet.x > FIELD.width + 20 || bullet.y < -20 || bullet.y > FIELD.height + 20) {
        bullet.active = false;
        continue;
      }
      if (p.invuln <= 0 && p.dashTime <= 0 && dist(bullet.x, bullet.y, p.x, p.y) < bullet.r + PLAYER.radius - 2) {
        bullet.active = false;
        events |= hurtPlayer(null);
        if (events & EVENT_OVER) return events;
      }
    }

    // --- shards: drift, magnetise toward the player, get collected
    for (const shard of shards) {
      if (!shard.active) continue;
      shard.t += dt;
      shard.life -= dt;
      if (shard.life <= 0) {
        shard.active = false;
        continue;
      }
      const d = dist(shard.x, shard.y, p.x, p.y);
      if (p.magnet > 0 || d < 110) {
        const pull = p.magnet > 0 ? 520 : 300;
        shard.vx += ((p.x - shard.x) / (d || 1)) * pull * dt;
        shard.vy += ((p.y - shard.y) / (d || 1)) * pull * dt;
      }
      shard.vx *= 1 - 2 * dt;
      shard.vy *= 1 - 2 * dt;
      shard.x += shard.vx * dt;
      shard.y += shard.vy * dt;
      if (d < PLAYER.radius + SHARD.radius + 6) {
        shard.active = false;
        state.score += SHARD.value * multiplier();
        state.comboTimer = COMBO.window;
        state.shardStreak += 1;
        if (state.shardStreak % SHARD.streakForLife === 0 && state.lives < PLAYER.maxLives) state.lives += 1;
        burst(shard.x, shard.y, '#ffd75e', 5, 120, 2);
        events |= EVENT_SHARD;
      }
    }

    // --- power-ups
    for (const powerup of powerups) {
      if (!powerup.active) continue;
      powerup.life -= dt;
      if (powerup.life <= 0) {
        powerup.active = false;
        continue;
      }
      if (dist(powerup.x, powerup.y, p.x, p.y) < PLAYER.radius + 20) {
        powerup.active = false;
        if (powerup.kind === 'spread') p.spread = POWERUP.spread.duration;
        else if (powerup.kind === 'shield') {
          p.shield = 1;
          p.shieldTimer = POWERUP.shield.duration;
        } else p.magnet = POWERUP.magnet.duration;
        burst(powerup.x, powerup.y, '#5ff2ff', 14, 200, 3);
        events |= EVENT_POWERUP;
      }
    }

    // --- the player touching an enemy
    if (p.invuln <= 0 && p.dashTime <= 0) {
      for (const enemy of enemies) {
        if (!enemy.active) continue;
        if (dist(enemy.x, enemy.y, p.x, p.y) < enemy.r + PLAYER.radius - 2) {
          const dx = enemy.x - p.x;
          const dy = enemy.y - p.y;
          const d = Math.hypot(dx, dy) || 1;
          enemy.x += (dx / d) * 40;
          enemy.y += (dy / d) * 40;
          events |= hurtPlayer(enemy);
          break;
        }
      }
      if (events & EVENT_OVER) return events;
    }

    updateParticles(dt);
    return events;
  }

  function updateParticles(dt) {
    for (const particle of particles) {
      if (!particle.active) continue;
      particle.life -= dt;
      if (particle.life <= 0) {
        particle.active = false;
        continue;
      }
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vx *= 1 - 1.5 * dt;
      particle.vy *= 1 - 1.5 * dt;
    }
  }

  /** Restart the random stream from the world's seed: a staged scene can be replayed exactly. */
  function reseed() {
    random = createRandom(seed);
  }

  reset();
  return { state, reset, step, multiplier, reseed };
}
