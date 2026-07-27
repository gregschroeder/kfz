/** First-discovery celebration: border flash, fireworks overlay, Web Audio. */

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
};

type Burst = {
  x: number;
  y: number;
  age: number;
};

const COLORS = [
  "#ffd400",
  "#ff8a00",
  "#ff5c5c",
  "#4f8cff",
  "#3ecf8e",
  "#ffffff",
  "#ff66c4",
];

const CELEBRATE_MS = 10_000;
const BORDER_FLASH_MS = 8000;
const AUDIO_MS = 9_200;

let overlay: HTMLDivElement | null = null;
let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
let raf = 0;
let audioCtx: AudioContext | null = null;
let activeResult: HTMLElement | null = null;
let borderTimer = 0;
let stopTimer = 0;
let activeSources: AudioScheduledSourceNode[] = [];
let noiseCache: AudioBuffer | null = null;

function ensureOverlay(): { overlay: HTMLDivElement; canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  if (overlay && canvas && ctx) {
    return { overlay, canvas, ctx };
  }

  overlay = document.createElement("div");
  overlay.id = "celebrate-overlay";
  overlay.className = "celebrate-overlay";
  overlay.setAttribute("aria-hidden", "true");

  canvas = document.createElement("canvas");
  canvas.className = "celebrate-canvas";
  overlay.appendChild(canvas);
  document.body.appendChild(overlay);

  ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("2d canvas unavailable");
  }

  return { overlay, canvas, ctx };
}

function resizeCanvas(c: HTMLCanvasElement): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  c.width = Math.floor(window.innerWidth * dpr);
  c.height = Math.floor(window.innerHeight * dpr);
  c.style.width = `${window.innerWidth}px`;
  c.style.height = `${window.innerHeight}px`;
  const context = c.getContext("2d");
  context?.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function getAudio(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
  return audioCtx;
}

function track<T extends AudioScheduledSourceNode>(node: T): T {
  activeSources.push(node);
  node.addEventListener("ended", () => {
    activeSources = activeSources.filter((n) => n !== node);
  });
  return node;
}

function stopAudio(): void {
  for (const node of activeSources) {
    try {
      node.stop();
    } catch {
      // already stopped
    }
  }
  activeSources = [];
}

function noiseBuffer(ac: AudioContext, seconds = 2): AudioBuffer {
  if (noiseCache && noiseCache.sampleRate === ac.sampleRate) {
    return noiseCache;
  }
  const len = Math.floor(ac.sampleRate * seconds);
  const buffer = ac.createBuffer(1, len, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < len; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  noiseCache = buffer;
  return buffer;
}

function rampOut(gain: AudioParam, when: number, peak: number, attack: number, decay: number): void {
  gain.cancelScheduledValues(when);
  gain.setValueAtTime(0.0001, when);
  gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), when + attack);
  gain.exponentialRampToValueAtTime(0.0001, when + attack + decay);
}

/** Single firework: boom + crack + long crackling decay. */
function playExplosion(when: number, size = 1): void {
  const ac = getAudio();
  const buf = noiseBuffer(ac);
  const pitch = 0.75 + Math.random() * 0.55;
  const boomDecay = 0.85 + size * 0.55;
  const crackDecay = 0.55 + size * 0.45;
  const trailDecay = 1.4 + size * 0.9;

  // Low boom body
  {
    const src = track(ac.createBufferSource());
    src.buffer = buf;
    src.playbackRate.value = 0.55 + Math.random() * 0.25;
    const filter = ac.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(280 * pitch, when);
    filter.frequency.exponentialRampToValueAtTime(90, when + boomDecay);
    filter.Q.value = 0.7;
    const gain = ac.createGain();
    rampOut(gain.gain, when, 0.55 * size, 0.012, boomDecay);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(ac.destination);
    src.start(when);
    src.stop(when + boomDecay + 0.05);
  }

  // Mid crack / report
  {
    const src = track(ac.createBufferSource());
    src.buffer = buf;
    src.playbackRate.value = 1.1 + Math.random() * 0.5;
    const filter = ac.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(1400 * pitch, when);
    filter.frequency.exponentialRampToValueAtTime(420 * pitch, when + crackDecay);
    filter.Q.value = 1.1;
    const gain = ac.createGain();
    rampOut(gain.gain, when, 0.38 * size, 0.004, crackDecay);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(ac.destination);
    src.start(when);
    src.stop(when + crackDecay + 0.05);
  }

  // Airy shimmer trail (decay after the boom)
  {
    const src = track(ac.createBufferSource());
    src.buffer = buf;
    src.playbackRate.value = 1.6 + Math.random() * 0.8;
    const filter = ac.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.setValueAtTime(2800 + Math.random() * 1800, when);
    filter.frequency.exponentialRampToValueAtTime(900, when + trailDecay);
    filter.Q.value = 0.5;
    const gain = ac.createGain();
    // Soft delayed swell then long decay
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(0.12 * size, when + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.06 * size, when + 0.25);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + trailDecay);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(ac.destination);
    src.start(when);
    src.stop(when + trailDecay + 0.05);
  }

  // Sparse late crackles in the decay
  const crackleCount = 3 + Math.floor(Math.random() * 4);
  for (let i = 0; i < crackleCount; i++) {
    const t = when + 0.12 + Math.random() * (trailDecay * 0.75);
    const src = track(ac.createBufferSource());
    src.buffer = buf;
    src.playbackRate.value = 2 + Math.random() * 2.5;
    const filter = ac.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 2500 + Math.random() * 4500;
    filter.Q.value = 3 + Math.random() * 4;
    const gain = ac.createGain();
    rampOut(gain.gain, t, 0.04 + Math.random() * 0.05, 0.002, 0.08 + Math.random() * 0.12);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(ac.destination);
    src.start(t);
    src.stop(t + 0.25);
  }
}

/** Continuous polyphonic sparkler / sizzle bed under the explosions. */
function startSizzleBed(t0: number, duration: number): void {
  const ac = getAudio();
  const buf = noiseBuffer(ac);
  const layers = [
    { hp: 4500, bp: 7000, rate: 1.8, depth: 0.035, lfo: 7.5 },
    { hp: 3200, bp: 5200, rate: 2.2, depth: 0.028, lfo: 11.2 },
    { hp: 5500, bp: 9000, rate: 2.6, depth: 0.022, lfo: 15.8 },
  ];

  for (const layer of layers) {
    const src = track(ac.createBufferSource());
    src.buffer = buf;
    src.loop = true;
    src.playbackRate.value = layer.rate;

    const hp = ac.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = layer.hp;
    hp.Q.value = 0.4;

    const bp = ac.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = layer.bp;
    bp.Q.value = 0.9;

    const trem = ac.createGain();
    const lfo = track(ac.createOscillator());
    lfo.type = "sine";
    lfo.frequency.value = layer.lfo + Math.random() * 2;
    const lfoGain = ac.createGain();
    lfoGain.gain.value = layer.depth * 0.55;
    trem.gain.value = layer.depth;
    lfo.connect(lfoGain);
    lfoGain.connect(trem.gain);

    const env = ac.createGain();
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(1, t0 + 0.35);
    env.gain.setValueAtTime(1, t0 + duration - 0.9);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

    src.connect(hp);
    hp.connect(bp);
    bp.connect(trem);
    trem.connect(env);
    env.connect(ac.destination);

    lfo.start(t0);
    lfo.stop(t0 + duration + 0.05);
    src.start(t0);
    src.stop(t0 + duration + 0.05);
  }
}

/** Clustered firework times: random gaps, often tight salvos. */
function scheduleExplosionTimes(t0: number, duration: number): number[] {
  const times: number[] = [];
  let t = t0 + 0.35 + Math.random() * 0.2;
  const end = t0 + duration - 0.7;

  while (t < end) {
    const clusterSize = Math.random() < 0.35
      ? 1
      : 2 + Math.floor(Math.random() * 4); // often 2–5 close together
    for (let i = 0; i < clusterSize && t < end; i++) {
      times.push(t);
      // Within a salvo: often very close
      t += Math.random() < 0.55
        ? 0.04 + Math.random() * 0.09
        : 0.12 + Math.random() * 0.2;
    }
    // Gap between salvos
    t += 0.35 + Math.random() * 1.1;
  }
  return times;
}

function playFanfare(): void {
  const ac = getAudio();
  void ac.resume();
  const t0 = ac.currentTime + 0.02;

  const notes = [523.25, 659.25, 783.99, 1046.5];
  notes.forEach((freq, i) => {
    const start = t0 + i * 0.12;
    const osc = track(ac.createOscillator());
    osc.type = "sine";
    osc.frequency.value = freq;
    const gain = ac.createGain();
    rampOut(gain.gain, start, 0.12, 0.03, 0.32);
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.start(start);
    osc.stop(start + 0.4);
  });

  startSizzleBed(t0 + 0.15, AUDIO_MS / 1000);

  for (const when of scheduleExplosionTimes(t0, AUDIO_MS / 1000)) {
    const size = 0.7 + Math.random() * 0.7;
    playExplosion(when, size);
  }
}

function spawnBurst(particles: Particle[], bursts: Burst[], w: number, h: number): void {
  const x = w * (0.15 + Math.random() * 0.7);
  const y = h * (0.12 + Math.random() * 0.45);
  bursts.push({ x, y, age: 0 });
  const count = 36 + Math.floor(Math.random() * 28);
  const base = COLORS[Math.floor(Math.random() * COLORS.length)]!;
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.2;
    const speed = 2.2 + Math.random() * 4.8;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - Math.random() * 1.5,
      life: 0,
      maxLife: 45 + Math.random() * 35,
      color: Math.random() > 0.25 ? base : COLORS[Math.floor(Math.random() * COLORS.length)]!,
      size: 1.5 + Math.random() * 2.5,
    });
  }
}

function stopCelebration(): void {
  cancelAnimationFrame(raf);
  raf = 0;
  window.clearTimeout(borderTimer);
  window.clearTimeout(stopTimer);
  stopAudio();
  if (overlay) {
    overlay.hidden = true;
  }
  if (activeResult) {
    activeResult.classList.remove("celebrate-flash");
    activeResult.classList.add("celebrate-done");
  }
}

/** Celebrate a first-time prefix discovery. */
export function celebrateDiscovery(resultEl: HTMLElement): void {
  stopCelebration();
  activeResult = resultEl;

  resultEl.classList.remove("celebrate-done");
  resultEl.classList.add("celebrate-flash");

  borderTimer = window.setTimeout(() => {
    resultEl.classList.remove("celebrate-flash");
    resultEl.classList.add("celebrate-done");
  }, BORDER_FLASH_MS);

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  try {
    playFanfare();
  } catch {
    // Autoplay / AudioContext may fail; visuals still run.
  }

  if (reduced) {
    stopTimer = window.setTimeout(stopCelebration, BORDER_FLASH_MS);
    return;
  }

  const { overlay: ov, canvas: c, ctx: context } = ensureOverlay();
  resizeCanvas(c);
  ov.hidden = false;

  const particles: Particle[] = [];
  const bursts: Burst[] = [];
  let lastSpawn = 0;
  let frame = 0;
  const started = performance.now();

  const tick = (now: number) => {
    const elapsed = now - started;
    if (elapsed > CELEBRATE_MS) {
      stopCelebration();
      return;
    }

    const w = window.innerWidth;
    const h = window.innerHeight;
    context.clearRect(0, 0, w, h);

    if (now - lastSpawn > 280 || frame === 0) {
      spawnBurst(particles, bursts, w, h);
      if (Math.random() > 0.4) spawnBurst(particles, bursts, w, h);
      lastSpawn = now;
    }

    for (let i = bursts.length - 1; i >= 0; i--) {
      const b = bursts[i]!;
      b.age += 1;
      const alpha = Math.max(0, 1 - b.age / 12);
      if (alpha <= 0) {
        bursts.splice(i, 1);
        continue;
      }
      context.beginPath();
      context.arc(b.x, b.y, 4 + b.age * 2.2, 0, Math.PI * 2);
      context.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.7})`;
      context.lineWidth = 2;
      context.stroke();
    }

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i]!;
      p.life += 1;
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.06;
      p.vx *= 0.99;
      if (p.life >= p.maxLife) {
        particles.splice(i, 1);
        continue;
      }
      const alpha = 1 - p.life / p.maxLife;
      context.beginPath();
      context.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
      context.fillStyle = p.color;
      context.globalAlpha = alpha;
      context.fill();
      context.globalAlpha = 1;
    }

    const fade = elapsed > CELEBRATE_MS - 600
      ? Math.max(0, (CELEBRATE_MS - elapsed) / 600)
      : 1;
    ov.style.opacity = String(fade);

    frame += 1;
    raf = requestAnimationFrame(tick);
  };

  ov.style.opacity = "1";
  raf = requestAnimationFrame(tick);
  stopTimer = window.setTimeout(stopCelebration, CELEBRATE_MS + 100);
}
