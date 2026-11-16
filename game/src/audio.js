// Synthesised sound effects through WebAudio: no audio files, nothing fetched. Every effect is
// one or two short oscillators through a gain envelope. The context is created on the first user
// gesture and stays silent until then, so a headless screenshot run makes no sound at all.

export function createAudio() {
  let ctx = null;
  let master = null;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.14;
      master.connect(ctx.destination);
      return true;
    } catch {
      return false;
    }
  }

  function tone(freq, freqEnd, dur, type, vol, delay = 0) {
    if (!ctx || !master) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (freqEnd !== freq) osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t0 + dur);
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(vol, t0 + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  return {
    ensure,
    shoot() { tone(880, 320, 0.09, 'square', 0.22); },
    enemyDie() { tone(220, 55, 0.18, 'sawtooth', 0.32); },
    shard() { tone(1320, 1760, 0.12, 'sine', 0.28); },
    dash() { tone(300, 900, 0.14, 'sine', 0.28); },
    hit() { tone(160, 60, 0.3, 'sawtooth', 0.45); tone(90, 40, 0.35, 'square', 0.35, 0.02); },
    powerup() { tone(660, 660, 0.1, 'sine', 0.32); tone(990, 990, 0.12, 'sine', 0.32, 0.09); tone(1320, 1320, 0.16, 'sine', 0.32, 0.18); },
    boss() { tone(110, 110, 0.4, 'sawtooth', 0.45); tone(165, 165, 0.4, 'sawtooth', 0.36, 0.12); },
    wave() { tone(523, 784, 0.16, 'triangle', 0.32); },
    over() { tone(392, 392, 0.22, 'triangle', 0.36); tone(311, 311, 0.22, 'triangle', 0.36, 0.2); tone(233, 180, 0.5, 'triangle', 0.36, 0.4); },
  };
}
