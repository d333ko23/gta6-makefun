// All sound is synthesised with WebAudio — no audio files. A tiny bassline
// loops under the game, the engine hum follows the player's speed, and one
// function per effect (crash, siren blip, pickup, punch, mission jingle)
// builds its sound from oscillators and filtered noise.

export function createAudio() {
  let context = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let musicTimer = null;
  let muted = false;
  let musicStep = 0;

  /** The bassline: a slow minor groove in A, one note every 240 ms. */
  const BASSLINE = [55, 0, 55, 65.41, 55, 0, 49, 55, 55, 0, 55, 65.41, 82.41, 0, 73.42, 65.41];

  function ensure() {
    if (context) return true;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      context = new AudioContext();
      master = context.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(context.destination);
      engineOsc = context.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 50;
      engineGain = context.createGain();
      engineGain.gain.value = 0;
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 320;
      engineOsc.connect(filter);
      filter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      return true;
    } catch {
      return false;
    }
  }

  function tone(freq, duration, type, volume, when = 0, slideTo = 0) {
    if (!ensure() || muted) return;
    const start = context.currentTime + when;
    const osc = context.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    if (slideTo > 0) osc.frequency.exponentialRampToValueAtTime(slideTo, start + duration);
    const gain = context.createGain();
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
    osc.connect(gain);
    gain.connect(master);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  }

  function noise(duration, volume, filterFreq) {
    if (!ensure() || muted) return;
    const start = context.currentTime;
    const length = Math.max(1, Math.floor(context.sampleRate * duration));
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = context.createBufferSource();
    source.buffer = buffer;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = context.createGain();
    gain.gain.value = volume;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start(start);
  }

  function startMusic() {
    if (!ensure() || musicTimer !== null) return;
    musicTimer = window.setInterval(() => {
      if (muted) return;
      const note = BASSLINE[musicStep % BASSLINE.length];
      musicStep += 1;
      if (note > 0) tone(note, 0.22, 'triangle', 0.16);
      if (musicStep % 8 === 4) tone(220, 0.1, 'square', 0.03);
    }, 240);
  }

  return {
    /** Call from a user gesture (start / first key): browsers block audio before one. */
    unlock() {
      if (ensure() && context.state === 'suspended') context.resume().catch(() => {});
      startMusic();
    },
    setMuted(value) {
      muted = value;
      if (master) master.gain.value = value ? 0 : 0.5;
    },
    isMuted() {
      return muted;
    },
    /** Engine pitch and volume follow the car's speed, 0 to 1. */
    engine(speedRatio) {
      if (!ensure() || muted) return;
      const target = speedRatio * 0.09;
      engineGain.gain.setTargetAtTime(target, context.currentTime, 0.08);
      engineOsc.frequency.setTargetAtTime(46 + speedRatio * 130, context.currentTime, 0.08);
    },
    crash() {
      noise(0.28, 0.5, 900);
      tone(70, 0.2, 'sine', 0.4, 0, 40);
    },
    siren() {
      tone(720, 0.32, 'square', 0.05, 0, 980);
      tone(980, 0.32, 'square', 0.05, 0.34, 720);
    },
    pickup() {
      tone(880, 0.09, 'sine', 0.25);
      tone(1318, 0.14, 'sine', 0.25, 0.09);
    },
    punch() {
      noise(0.12, 0.4, 500);
      tone(120, 0.1, 'sine', 0.3, 0, 60);
    },
    honk() {
      tone(340, 0.18, 'square', 0.12);
      tone(428, 0.18, 'square', 0.1);
    },
    enterCar() {
      tone(180, 0.12, 'triangle', 0.2, 0, 320);
    },
    missionDone() {
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((freq, i) => tone(freq, 0.22, 'triangle', 0.22, i * 0.11));
    },
    busted() {
      const notes = [392, 311.13, 261.63, 196];
      notes.forEach((freq, i) => tone(freq, 0.3, 'sawtooth', 0.14, i * 0.16));
    },
    win() {
      const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
      notes.forEach((freq, i) => tone(freq, 0.35, 'triangle', 0.22, i * 0.13));
    },
  };
}
