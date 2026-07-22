/** First-discovery celebration: border flash, fireworks overlay, Web Audio pops. */

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

const CELEBRATE_MS = 4200;
const BORDER_FLASH_MS = 3200;

let overlay: HTMLDivElement | null = null;
let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
let raf = 0;
let audioCtx: AudioContext | null = null;
let activeResult: HTMLElement | null = null;
let borderTimer = 0;
let stopTimer = 0;

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

function playPop(when: number, pitch = 1): void {
  const ac = getAudio();
  const duration = 0.18;

  const noiseLen = Math.floor(ac.sampleRate * duration);
  const buffer = ac.createBuffer(1, noiseLen, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < noiseLen; i++) {
    const t = i / noiseLen;
    data[i] = (Math.random() * 2 - 1) * (1 - t) * (1 - t);
  }

  const noise = ac.createBufferSource();
  noise.buffer = buffer;
  const noiseFilter = ac.createBiquadFilter();
  noiseFilter.type = "bandpass";
  noiseFilter.frequency.value = 900 * pitch;
  noiseFilter.Q.value = 0.8;
  const noiseGain = ac.createGain();
  noiseGain.gain.setValueAtTime(0.0001, when);
  noiseGain.gain.exponentialRampToValueAtTime(0.45, when + 0.01);
  noiseGain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
  noise.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(ac.destination);
  noise.start(when);
  noise.stop(when + duration);

  const osc = ac.createOscillator();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(420 * pitch, when);
  osc.frequency.exponentialRampToValueAtTime(140 * pitch, when + 0.22);
  const oscGain = ac.createGain();
  oscGain.gain.setValueAtTime(0.0001, when);
  oscGain.gain.exponentialRampToValueAtTime(0.18, when + 0.015);
  oscGain.gain.exponentialRampToValueAtTime(0.0001, when + 0.28);
  osc.connect(oscGain);
  oscGain.connect(ac.destination);
  osc.start(when);
  osc.stop(when + 0.3);
}

function playFanfare(): void {
  const ac = getAudio();
  void ac.resume();
  const t0 = ac.currentTime + 0.02;
  const notes = [523.25, 659.25, 783.99, 1046.5];
  notes.forEach((freq, i) => {
    const start = t0 + i * 0.12;
    const osc = ac.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;
    const gain = ac.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.14, start + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.35);
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.start(start);
    osc.stop(start + 0.4);
  });

  // Firework pops staggered through the show
  for (let i = 0; i < 10; i++) {
    playPop(t0 + 0.35 + i * 0.32 + Math.random() * 0.08, 0.75 + Math.random() * 0.7);
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

    // Fade overlay near the end
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
