/**
 * tests/synthesis.test.js
 *
 * Unit tests for FORMA's core synthesis math.
 * These are the pure functions that can be extracted and tested
 * without a DOM or AudioContext (both unavailable in Node.js test env).
 *
 * Run with: npm test
 */

'use strict';

// ── Pure functions extracted from index.html for testability ──

/**
 * Convert semitone offset (relative to C4 = 261.63 Hz) to frequency in Hz.
 * @param {number} semitones
 * @returns {number} frequency in Hz
 */
function noteToFreq(semitones) {
  return 261.63 * Math.pow(2, semitones / 12);
}

/**
 * Compute per-harmonic amplitude array from spectral nodes using Gaussian weighting.
 * @param {Array<{x: number, y: number}>} spectralNodes
 * @param {number} numHarmonics
 * @returns {Float32Array}
 */
function getSpectralAmps(spectralNodes, numHarmonics) {
  const amps = new Float32Array(numHarmonics).fill(0);

  if (spectralNodes.length === 0) {
    // Default: sine-ish 1/n falloff
    for (let i = 0; i < numHarmonics; i++) {
      amps[i] = (1 / (i + 1)) * 0.8;
    }
    return amps;
  }

  for (let i = 0; i < numHarmonics; i++) {
    const normI = i / (numHarmonics - 1);
    let amp = 0;
    spectralNodes.forEach(n => {
      const dist = Math.abs(normI - n.x);
      const weight = Math.exp(-dist * dist * 18);
      amp += weight * (1 - n.y);
    });
    amps[i] = Math.min(amp, 1.0);
  }

  return amps;
}

/**
 * Apply morph field transformation to an amplitude array.
 * @param {Float32Array} amps - input amplitudes (mutated in place)
 * @param {number} morphX - 0..1, timbre axis
 * @param {number} morphY - 0..1, density axis (0=bright, 1=dark)
 * @returns {Float32Array}
 */
function applyMorph(amps, morphX, morphY) {
  const morphBrightness = 1 - morphY;
  for (let i = 0; i < amps.length; i++) {
    let a = amps[i];
    a *= Math.pow(morphBrightness, i * 0.5);
    if (i % 2 === 0 && morphX > 0.5) a *= 1 + (morphX - 0.5) * 1.5;
    if (i % 2 === 1 && morphX < 0.5) a *= 1 + (0.5 - morphX) * 1.5;
    amps[i] = a;
  }
  return amps;
}

// ── Tests ──────────────────────────────────────────────────────

describe('noteToFreq', () => {
  test('C4 (semitone 0) = 261.63 Hz', () => {
    expect(noteToFreq(0)).toBeCloseTo(261.63, 2);
  });

  test('A4 (semitone 9) ≈ 440 Hz', () => {
    expect(noteToFreq(9)).toBeCloseTo(440.0, 0);
  });

  test('C5 (semitone 12) = 2× C4', () => {
    expect(noteToFreq(12)).toBeCloseTo(noteToFreq(0) * 2, 2);
  });

  test('C3 (semitone -12) = ½ C4', () => {
    expect(noteToFreq(-12)).toBeCloseTo(noteToFreq(0) / 2, 2);
  });

  test('always returns a positive value', () => {
    [-24, -12, 0, 12, 24, 36].forEach(s => {
      expect(noteToFreq(s)).toBeGreaterThan(0);
    });
  });
});

describe('getSpectralAmps — no nodes (default falloff)', () => {
  test('returns array of correct length', () => {
    const amps = getSpectralAmps([], 8);
    expect(amps.length).toBe(8);
  });

  test('fundamental (i=0) has highest amplitude', () => {
    const amps = getSpectralAmps([], 8);
    for (let i = 1; i < 8; i++) {
      expect(amps[0]).toBeGreaterThan(amps[i]);
    }
  });

  test('amplitude decreases monotonically with harmonic index', () => {
    const amps = getSpectralAmps([], 8);
    for (let i = 1; i < 8; i++) {
      expect(amps[i - 1]).toBeGreaterThanOrEqual(amps[i]);
    }
  });

  test('all values are in 0..1 range', () => {
    const amps = getSpectralAmps([], 12);
    amps.forEach(a => {
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThanOrEqual(1);
    });
  });
});

describe('getSpectralAmps — with nodes', () => {
  test('node at x=0, y=0 (full amplitude) boosts first harmonic', () => {
    const amps = getSpectralAmps([{ x: 0, y: 0 }], 8);
    expect(amps[0]).toBeGreaterThan(0.5);
  });

  test('node at x=1, y=0 (full amplitude) boosts last harmonic', () => {
    const amps = getSpectralAmps([{ x: 1, y: 0 }], 8);
    expect(amps[7]).toBeGreaterThan(amps[0]);
  });

  test('node at y=1 (zero amplitude) produces near-zero output near its x position', () => {
    const amps = getSpectralAmps([{ x: 0, y: 1 }], 8);
    expect(amps[0]).toBeLessThan(0.05);
  });

  test('no value exceeds 1.0 (clamp)', () => {
    // Multiple overlapping nodes that could exceed 1.0 without clamping
    const nodes = [
      { x: 0.5, y: 0 },
      { x: 0.5, y: 0 },
      { x: 0.5, y: 0 },
    ];
    const amps = getSpectralAmps(nodes, 12);
    amps.forEach(a => expect(a).toBeLessThanOrEqual(1.0));
  });
});

describe('applyMorph', () => {
  test('morphY=0 (bright) does not attenuate any harmonics', () => {
    const amps = new Float32Array([1, 1, 1, 1]);
    const result = applyMorph(amps, 0.5, 0);
    // At morphY=0, brightness=1, pow(1, anything) = 1 — no rolloff
    result.forEach(a => expect(a).toBeCloseTo(1.0, 5));
  });

  test('morphY=1 (dark) heavily attenuates higher harmonics', () => {
    const amps = new Float32Array([1, 1, 1, 1, 1, 1, 1, 1]);
    const result = applyMorph(amps, 0.5, 1);
    // brightness = 0, so pow(0, i*0.5) = 0 for i>0, 1 for i=0
    expect(result[0]).toBeCloseTo(1.0, 5); // i=0: pow(0, 0) = 1
    expect(result[7]).toBeCloseTo(0, 5);   // i=7: attenuated to near 0
  });

  test('morphX=1 boosts even-indexed harmonics', () => {
    const amps = new Float32Array([1, 1, 1, 1]);
    const result = applyMorph(amps, 1.0, 0);
    // Even: i=0 → boosted ×1.75 (1 + 0.5×1.5), odd: i=1 → unchanged
    expect(result[0]).toBeGreaterThan(result[1]);
    expect(result[2]).toBeGreaterThan(result[3]);
  });

  test('morphX=0 boosts odd-indexed harmonics', () => {
    const amps = new Float32Array([1, 1, 1, 1]);
    const result = applyMorph(amps, 0.0, 0);
    // Odd: i=1 → boosted, even: i=0 → unchanged
    expect(result[1]).toBeGreaterThan(result[0]);
    expect(result[3]).toBeGreaterThan(result[2]);
  });

  test('morphX=0.5 (neutral) does not favour either parity', () => {
    const amps = new Float32Array([1, 1, 1, 1]);
    const result = applyMorph(amps, 0.5, 0);
    // No even/odd bias at centre
    expect(result[0]).toBeCloseTo(result[1], 5);
    expect(result[2]).toBeCloseTo(result[3], 5);
  });
});
