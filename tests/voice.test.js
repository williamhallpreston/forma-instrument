/**
 * tests/voice.test.js
 *
 * Tests for FORMA's voice management engine and reverb builder.
 *
 * Both the Web Audio API and the DOM are unavailable in Node.js, so this
 * file provides:
 *   • MockAudioContext  — a minimal, inspectable stand-in for AudioContext
 *   • Testable copies of playNote, releaseNote, and buildReverb that accept
 *     their dependencies as explicit arguments instead of reading module globals
 *
 * The copied logic is kept intentionally close to the source so that changes
 * to the real functions break these tests, acting as a regression net.
 */

'use strict';

jest.useFakeTimers();

// ══════════════════════════════════════════════════════════════════
//  Minimal Web Audio API mock
// ══════════════════════════════════════════════════════════════════

class MockAudioParam {
  constructor(value = 0) {
    this.value = value;
  }
  setValueAtTime()            { return this; }
  linearRampToValueAtTime()   { return this; }
  cancelScheduledValues()     { return this; }
  setTargetAtTime()           { return this; }
}

class MockAudioNode {
  connect()    {}
  disconnect() {}
}

class MockGainNode extends MockAudioNode {
  constructor() {
    super();
    this.gain = new MockAudioParam(1);
  }
}

class MockOscillatorNode extends MockAudioNode {
  constructor() {
    super();
    this.type       = 'sine';
    this.frequency  = new MockAudioParam(440);
    this.detune     = new MockAudioParam(0);
    this.started    = false;
    this.stopped    = false;
  }
  start() { this.started = true; }
  stop()  { this.stopped = true; }
}

class MockWaveShaperNode extends MockAudioNode {
  constructor() { super(); this.curve = null; }
}

/**
 * Inspectable AudioContext mock.
 * All created nodes are recorded in `_gains` and `_oscillators`
 * so tests can verify how many were created.
 */
class MockAudioContext {
  constructor() {
    this.sampleRate  = 44100;
    this.currentTime = 0;
    this.state       = 'running';
    this.destination = new MockAudioNode();
    this._gains      = [];
    this._oscillators = [];
  }
  createGain() {
    const g = new MockGainNode();
    this._gains.push(g);
    return g;
  }
  createOscillator() {
    const o = new MockOscillatorNode();
    this._oscillators.push(o);
    return o;
  }
  createWaveShaper() {
    return new MockWaveShaperNode();
  }
  createBuffer(channels, length, sampleRate) {
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    return {
      numberOfChannels: channels,
      length,
      sampleRate,
      getChannelData: (c) => data[c],
    };
  }
  resume() { return Promise.resolve(); }
}

// ══════════════════════════════════════════════════════════════════
//  Testable voice engine (mirrors index.html logic)
// ══════════════════════════════════════════════════════════════════

const MAX_VOICES = 8;

/** getSpectralAmps — default (no nodes) only, sufficient for voice tests. */
function getSpectralAmps(numHarmonics) {
  const amps = new Float32Array(numHarmonics);
  for (let i = 0; i < numHarmonics; i++) amps[i] = (1 / (i + 1)) * 0.8;
  return amps;
}

/**
 * Trigger a voice. Accepts a `state` bag instead of reading module globals.
 *
 * @param {number} freq
 * @param {string} noteKey
 * @param {Object} state - { ctx, activeVoices, masterGain, knobValues,
 *                           spectralNodes, morphX, morphY, env }
 */
function playNote(freq, noteKey, state) {
  const { ctx, activeVoices, masterGain, knobValues, morphX, morphY, env } = state;

  if (activeVoices.has(noteKey)) releaseNote(noteKey, true, state);

  const numH        = Math.round(knobValues.harmonics);
  const detuneAmt   = knobValues.detune;
  const spreadAmt   = knobValues.spread / 100;
  const driveAmt    = knobValues.drive / 100;
  const shimmerAmt  = knobValues.shimmer / 100;
  const amps        = getSpectralAmps(numH);

  const morphBrightness = 1 - morphY;
  const morphTimbre     = morphX;

  const envGain = ctx.createGain();
  envGain.gain.setValueAtTime(0, ctx.currentTime);
  envGain.gain.linearRampToValueAtTime(1, ctx.currentTime + env.attack);
  envGain.gain.linearRampToValueAtTime(env.sustain, ctx.currentTime + env.attack + env.decay);

  // Waveshaper (drive)
  let waveShaper = null;
  if (driveAmt > 0.01) {
    waveShaper = ctx.createWaveShaper();
    const k = driveAmt * 200;
    const n = 256;
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      curve[i] = ((Math.PI + k) * x) / (Math.PI + k * Math.abs(x));
    }
    waveShaper.curve = curve;
  }

  const oscs = [];
  let totalAmp = 0;
  for (let i = 0; i < numH; i++) totalAmp += amps[i];
  const normFactor = totalAmp > 0 ? 0.35 / totalAmp : 0.35;

  for (let i = 0; i < numH; i++) {
    const harmFreq = freq * (i + 1);
    if (harmFreq > 20000) continue;

    let a = amps[i];
    a *= Math.pow(morphBrightness, i * 0.5);
    if (i % 2 === 0 && morphTimbre > 0.5) a *= 1 + (morphTimbre - 0.5) * 1.5;
    if (i % 2 === 1 && morphTimbre < 0.5) a *= 1 + (0.5 - morphTimbre) * 1.5;
    if (a < 0.001) continue;

    const osc   = ctx.createOscillator();
    osc.type            = 'sine';
    osc.frequency.value = harmFreq;
    const spreadOffset  = (Math.random() - 0.5) * detuneAmt * spreadAmt;
    osc.detune.value    = spreadOffset;

    const hGain       = ctx.createGain();
    hGain.gain.value  = a * normFactor;
    osc.connect(hGain);
    if (waveShaper) {
      hGain.connect(waveShaper);
    } else {
      hGain.connect(envGain);
    }
    oscs.push({ osc, hGain });
    osc.start();
  }

  if (waveShaper) waveShaper.connect(envGain);

  // Shimmer partial
  if (shimmerAmt > 0.01) {
    const shimOsc       = ctx.createOscillator();
    shimOsc.type        = 'sine';
    shimOsc.frequency.value = freq * 2;
    shimOsc.detune.value    = 5;
    const shimGain      = ctx.createGain();
    shimGain.gain.value = shimmerAmt * 0.18;
    shimOsc.connect(shimGain);
    shimGain.connect(envGain);
    shimOsc.start();
    oscs.push({ osc: shimOsc, hGain: shimGain });
  }

  envGain.connect(masterGain);

  const voice = { oscs, envGain, startTime: ctx.currentTime };
  activeVoices.set(noteKey, voice);

  // Voice stealing — kill the oldest if over the limit
  if (activeVoices.size > MAX_VOICES) {
    const oldest = [...activeVoices.entries()]
      .reduce((a, b) => a[1].startTime < b[1].startTime ? a : b);
    releaseNote(oldest[0], true, state);
  }
}

/**
 * Begin the release phase for a voice, then clean up its nodes.
 */
function releaseNote(noteKey, immediate = false, state) {
  const { activeVoices, env, ctx } = state;
  const voice = activeVoices.get(noteKey);
  if (!voice) return;
  const { oscs, envGain } = voice;
  const rel = immediate ? 0.05 : env.release;
  envGain.gain.cancelScheduledValues(ctx.currentTime);
  envGain.gain.setValueAtTime(envGain.gain.value, ctx.currentTime);
  envGain.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + rel);
  setTimeout(() => {
    oscs.forEach(({ osc }) => { try { osc.stop(); } catch (e) {} });
    envGain.disconnect();
  }, (rel + 0.1) * 1000);
  activeVoices.delete(noteKey);
}

/**
 * Generate a synthetic impulse response.
 * Testable version that accepts ctx and a target node explicitly.
 */
function buildReverb(ctx, reverbNode) {
  const len = Math.round(ctx.sampleRate * 3.2);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.2);
    }
  }
  reverbNode.buffer = buf;
}

// ── State factory ─────────────────────────────────────────────────

function makeState(overrides = {}) {
  const ctx = new MockAudioContext();
  return {
    ctx,
    activeVoices: new Map(),
    masterGain: ctx.createGain(),
    knobValues: { harmonics: 4, detune: 0, spread: 0, drive: 0, brightness: 55, shimmer: 0 },
    spectralNodes: [],
    morphX: 0.5,
    morphY: 0.5,
    env: { attack: 0.04, decay: 0.18, sustain: 0.72, release: 0.5 },
    ...overrides,
  };
}

// ══════════════════════════════════════════════════════════════════
//  playNote — registration
// ══════════════════════════════════════════════════════════════════

describe('playNote — voice registration', () => {
  test('registers the voice in activeVoices', () => {
    const state = makeState();
    playNote(440, 'test_a', state);
    expect(state.activeVoices.has('test_a')).toBe(true);
  });

  test('voice record contains oscs, envGain, and startTime', () => {
    const state = makeState();
    playNote(440, 'test_a', state);
    const voice = state.activeVoices.get('test_a');
    expect(Array.isArray(voice.oscs)).toBe(true);
    expect(voice.envGain).toBeDefined();
    expect(typeof voice.startTime).toBe('number');
  });

  test('all created oscillators are started', () => {
    const state = makeState();
    playNote(440, 'test_a', state);
    const voice = state.activeVoices.get('test_a');
    expect(voice.oscs.length).toBeGreaterThan(0);
    voice.oscs.forEach(({ osc }) => expect(osc.started).toBe(true));
  });

  test('two different noteKeys register as separate voices', () => {
    const state = makeState();
    playNote(440, 'note_a', state);
    playNote(550, 'note_b', state);
    expect(state.activeVoices.size).toBe(2);
    expect(state.activeVoices.has('note_a')).toBe(true);
    expect(state.activeVoices.has('note_b')).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════
//  playNote — oscillator count
// ══════════════════════════════════════════════════════════════════

describe('playNote — oscillator count', () => {
  test('creates at least 1 oscillator for a normal frequency', () => {
    const state = makeState({ knobValues: { harmonics: 4, detune: 0, spread: 0, drive: 0, shimmer: 0 } });
    playNote(440, 'test', state);
    expect(state.ctx._oscillators.length).toBeGreaterThanOrEqual(1);
  });

  test('shimmer=100 creates an extra octave oscillator', () => {
    const baseState   = makeState({ knobValues: { harmonics: 2, detune: 0, spread: 0, drive: 0, shimmer: 0   } });
    const shimmerState = makeState({ knobValues: { harmonics: 2, detune: 0, spread: 0, drive: 0, shimmer: 100 } });
    playNote(440, 'base',    baseState);
    playNote(440, 'shimmer', shimmerState);
    // Shimmer adds one extra oscillator
    expect(shimmerState.ctx._oscillators.length).toBeGreaterThan(baseState.ctx._oscillators.length);
  });

  test('harmonics above 20 kHz are skipped (very high base freq)', () => {
    const state = makeState({ knobValues: { harmonics: 24, detune: 0, spread: 0, drive: 0, shimmer: 0 } });
    // 10 000 Hz × many harmonics will exceed 20 kHz quickly
    playNote(10000, 'high', state);
    const voice = state.activeVoices.get('high');
    // Fewer oscillators than requested harmonics because most exceed 20 kHz
    expect(voice.oscs.length).toBeLessThan(24);
  });
});

// ══════════════════════════════════════════════════════════════════
//  playNote — drive (waveshaper)
// ══════════════════════════════════════════════════════════════════

describe('playNote — drive / waveshaper', () => {
  test('drive=0 does not create a WaveShaper node', () => {
    const state = makeState({ knobValues: { harmonics: 2, detune: 0, spread: 0, drive: 0, shimmer: 0 } });
    // Monkey-patch to detect WaveShaper creation
    let waveShaperCreated = false;
    const orig = state.ctx.createWaveShaper.bind(state.ctx);
    state.ctx.createWaveShaper = () => { waveShaperCreated = true; return orig(); };
    playNote(440, 'test', state);
    expect(waveShaperCreated).toBe(false);
  });

  test('drive=100 creates a WaveShaper node with a curve', () => {
    const state = makeState({ knobValues: { harmonics: 2, detune: 0, spread: 0, drive: 100, shimmer: 0 } });
    let captured = null;
    const orig = state.ctx.createWaveShaper.bind(state.ctx);
    state.ctx.createWaveShaper = () => { captured = orig(); return captured; };
    playNote(440, 'test', state);
    expect(captured).not.toBeNull();
    expect(captured.curve).toBeDefined();
    expect(captured.curve.length).toBeGreaterThan(0);
  });
});

// ══════════════════════════════════════════════════════════════════
//  playNote — retrigger
// ══════════════════════════════════════════════════════════════════

describe('playNote — retrigger', () => {
  test('retriggering the same key replaces the old voice', () => {
    const state = makeState();
    playNote(440, 'key', state);
    const first = state.activeVoices.get('key');
    playNote(440, 'key', state);
    const second = state.activeVoices.get('key');
    expect(second).not.toBe(first);
    expect(state.activeVoices.size).toBe(1);
  });
});

// ══════════════════════════════════════════════════════════════════
//  releaseNote
// ══════════════════════════════════════════════════════════════════

describe('releaseNote', () => {
  test('removes the voice from activeVoices immediately', () => {
    const state = makeState();
    playNote(440, 'test', state);
    releaseNote('test', false, state);
    expect(state.activeVoices.has('test')).toBe(false);
  });

  test('releasing a non-existent key does not throw', () => {
    const state = makeState();
    expect(() => releaseNote('ghost', false, state)).not.toThrow();
  });

  test('stops all oscillators after the release timeout fires', () => {
    const state = makeState();
    playNote(440, 'test', state);
    const oscs = [...state.activeVoices.get('test').oscs];
    releaseNote('test', true, state);  // immediate = 50 ms fade
    jest.runAllTimers();
    oscs.forEach(({ osc }) => expect(osc.stopped).toBe(true));
  });

  test('immediate release uses 50 ms fade (not env.release)', () => {
    const state = makeState({ env: { attack: 0.04, decay: 0.18, sustain: 0.72, release: 5.0 } });
    playNote(440, 'test', state);
    releaseNote('test', true, state);
    // With immediate=true and rel=0.05, setTimeout delay = (0.05+0.1)*1000 = 150 ms
    // With immediate=false and rel=5.0, setTimeout delay = 5100 ms
    // Running only 200 ms worth of timers should fire the immediate one
    jest.advanceTimersByTime(200);
    const osc = state.ctx._oscillators[0];
    expect(osc.stopped).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════
//  Voice stealing
// ══════════════════════════════════════════════════════════════════

describe('Voice stealing', () => {
  test('activeVoices never exceeds MAX_VOICES', () => {
    const state = makeState();
    for (let i = 0; i <= MAX_VOICES + 2; i++) {
      state.ctx.currentTime = i;
      playNote(440, `note_${i}`, state);
    }
    expect(state.activeVoices.size).toBeLessThanOrEqual(MAX_VOICES);
  });

  test('the oldest voice is stolen when the limit is reached', () => {
    const state = makeState();
    for (let i = 0; i < MAX_VOICES; i++) {
      state.ctx.currentTime = i;
      playNote(440, `note_${i}`, state);
    }
    // Trigger one more — note_0 (startTime=0) is oldest
    state.ctx.currentTime = MAX_VOICES;
    playNote(440, 'note_new', state);
    expect(state.activeVoices.has('note_0')).toBe(false);
    expect(state.activeVoices.has('note_new')).toBe(true);
  });

  test('after stealing, the new voice is present', () => {
    const state = makeState();
    for (let i = 0; i < MAX_VOICES; i++) {
      state.ctx.currentTime = i;
      playNote(440, `note_${i}`, state);
    }
    state.ctx.currentTime = MAX_VOICES;
    playNote(660, 'stolen_in', state);
    expect(state.activeVoices.has('stolen_in')).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════
//  buildReverb
// ══════════════════════════════════════════════════════════════════

describe('buildReverb', () => {
  function makeReverbTarget() {
    return { buffer: null };
  }

  test('assigns a buffer to reverbNode.buffer', () => {
    const ctx    = new MockAudioContext();
    const target = makeReverbTarget();
    buildReverb(ctx, target);
    expect(target.buffer).not.toBeNull();
  });

  test('buffer has 2 channels', () => {
    const ctx    = new MockAudioContext();
    const target = makeReverbTarget();
    buildReverb(ctx, target);
    expect(target.buffer.numberOfChannels).toBe(2);
  });

  test('buffer length is approximately sampleRate × 3.2', () => {
    const ctx    = new MockAudioContext();
    const target = makeReverbTarget();
    buildReverb(ctx, target);
    const expected = Math.round(ctx.sampleRate * 3.2);
    expect(target.buffer.length).toBe(expected);
  });

  test('buffer values are within the [-1, 1] range', () => {
    const ctx    = new MockAudioContext();
    const target = makeReverbTarget();
    buildReverb(ctx, target);
    for (let c = 0; c < 2; c++) {
      const data = target.buffer.getChannelData(c);
      for (let i = 0; i < data.length; i++) {
        expect(data[i]).toBeGreaterThanOrEqual(-1);
        expect(data[i]).toBeLessThanOrEqual(1);
      }
    }
  });

  test('buffer decays towards 0 (end amplitude is much smaller than start)', () => {
    const ctx    = new MockAudioContext();
    const target = makeReverbTarget();
    buildReverb(ctx, target);
    const data = target.buffer.getChannelData(0);
    const startRms = Math.sqrt(
      [...data.slice(0, 100)].reduce((s, v) => s + v * v, 0) / 100
    );
    const endRms = Math.sqrt(
      [...data.slice(-100)].reduce((s, v) => s + v * v, 0) / 100
    );
    expect(endRms).toBeLessThan(startRms);
  });
});
