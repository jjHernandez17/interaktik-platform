// Sonidos de overlay generados con Web Audio API — sin archivos de audio
// externos ni licencias que verificar. Cada sonido es una función que arma
// uno o dos tonos cortos con osciladores y los reproduce de inmediato.
// Compartido por los overlays reales (gift-alert, follow-alert) y por el
// botón de "Probar sonido" del panel.

const OVERLAY_SOUNDS = {
  none: { label: 'Ninguno' },
  bell: { label: 'Campanita' },
  ding: { label: 'Ding' },
  pop: { label: 'Pop' },
  coin: { label: 'Moneda' },
  notify: { label: 'Notificación' },
};

let sharedAudioCtx = null;

function getAudioContext() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;

  if (!sharedAudioCtx) {
    sharedAudioCtx = new AudioContextClass();
  }
  if (sharedAudioCtx.state === 'suspended') {
    sharedAudioCtx.resume().catch(() => {});
  }
  return sharedAudioCtx;
}

function playTone(ctx, { frequency, startTime, duration, type = 'sine', peakGain = 0.25 }) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, startTime);
  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(peakGain, startTime + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start(startTime);
  osc.stop(startTime + duration + 0.02);
}

const SOUND_BUILDERS = {
  bell(ctx, now) {
    playTone(ctx, { frequency: 1318.5, startTime: now, duration: 0.9, type: 'sine', peakGain: 0.22 });
    playTone(ctx, { frequency: 2637.0, startTime: now, duration: 0.6, type: 'sine', peakGain: 0.08 });
  },
  ding(ctx, now) {
    playTone(ctx, { frequency: 1760, startTime: now, duration: 0.35, type: 'sine', peakGain: 0.28 });
  },
  pop(ctx, now) {
    playTone(ctx, { frequency: 220, startTime: now, duration: 0.08, type: 'square', peakGain: 0.2 });
    playTone(ctx, { frequency: 880, startTime: now + 0.02, duration: 0.06, type: 'sine', peakGain: 0.15 });
  },
  coin(ctx, now) {
    playTone(ctx, { frequency: 988, startTime: now, duration: 0.12, type: 'square', peakGain: 0.18 });
    playTone(ctx, { frequency: 1480, startTime: now + 0.09, duration: 0.35, type: 'square', peakGain: 0.18 });
  },
  notify(ctx, now) {
    playTone(ctx, { frequency: 880, startTime: now, duration: 0.18, type: 'sine', peakGain: 0.22 });
    playTone(ctx, { frequency: 1174.7, startTime: now + 0.16, duration: 0.28, type: 'sine', peakGain: 0.22 });
  },
};

function playOverlaySound(soundId) {
  if (!soundId || soundId === 'none') return;
  const builder = SOUND_BUILDERS[soundId];
  if (!builder) return;

  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    builder(ctx, ctx.currentTime);
  } catch (error) {
    console.warn('[Overlay] No se pudo reproducir el sonido:', error.message);
  }
}

window.OVERLAY_SOUNDS = OVERLAY_SOUNDS;
window.playOverlaySound = playOverlaySound;
