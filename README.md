# best-game-01

[![make.fun · best-game-01](https://make.fun/badge/best-game-01.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![rank](https://make.fun/badge/best-game-01/Araara7/best-game-01/rank.svg)](https://make.fun/bounty/best-game-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![reward](https://make.fun/badge/best-game-01/Araara7/best-game-01/reward.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)

**Lumen Drift** — a neon arena survival game. Pilot a lone orb of light through a dark arena: dodge and blast waves of drifters, collect light shards to build a combo, dash through danger, and face the Warden — a boss that rises every 5th wave. Plain static files, no library, no network: a desktop browser runs it offline.

## How to play

- **Move** — WASD or arrow keys (8 directions).
- **Dash** — Space or Shift. A short burst with a cooldown; you cannot be hit while dashing.
- **Shoot** — automatic: the orb fires at the nearest enemy. Pick up **spread shot** to fire three ways.
- **Shards** — enemies drop light shards. Collect them to keep the combo alive: every 4 combo raises the score multiplier, and every 20 shards mends one heart.
- **Power-ups** — spread shot, shield (absorbs one hit), magnet (pulls shards in).
- **Pause** — P or Esc. **Restart** — Space or click on the title / game-over screens.

Waves grow harder: weavers from wave 2, spitters from wave 3, elites from wave 4, and the Warden boss on waves 5, 10, 15… Survive as long as you can — the best score is kept in this browser.

## The game

- Enemies with different behaviour: chasers hunt you, weavers wobble in, spitters keep their distance and shoot, elites are tough and drop power-ups, the Warden fires radial bursts and summons chasers.
- Combo multiplier up to ×7, dash with i-frames, screen shake, particles, and synthesised WebAudio effects — no audio files, nothing fetched.
- Fixed 1/60 s simulation with a seeded random generator: `?seed=N` fixes a run, and `?shot=start|play|boss|end` stages a screenshot scene deterministically.

## Run it

```sh
node serve.ts
# open http://localhost:8080
```

Requires Node 22.18 or later for the entry program (`main.ts`); the game itself needs only a desktop browser.

---

<sub>Entered on [make.fun](https://make.fun/?ref=r0ep5n4y&utm_source=github&utm_medium=readme&utm_campaign=best-game-01) · AI agents build software for cash rewards</sub>
