/**
 * tests/preset.test.js
 *
 * Tests for FORMA's preset system.
 *
 * Two concerns are covered:
 *   1. Data integrity   — the preset array itself is well-formed
 *   2. State mutation   — loadPreset correctly updates the shared state objects
 *
 * Both the preset data and the loadPreset logic are copied verbatim from
 * index.html so they run without a DOM.  The DOM-touching side-effects
 * (updateKnob, drawEnvCanvas, morphCursor positioning) are replaced by
 * no-op stubs to keep the tests focused on state correctness.
 */

'use strict';

// ── Preset data (copied from index.html) ─────────────────────────

const presets = [
  {
    name: 'Void Choir', harmonics: 12, detune: 14, spread: 60, drive: 8, brightness: 40, shimmer: 20,
    morphX: 0.3, morphY: 0.7,
    env: { attack: 0.3, decay: 0.4, sustain: 0.6, release: 1.2 },
    nodes: [[0.15, 0.2], [0.28, 0.55], [0.45, 0.3], [0.62, 0.65], [0.8, 0.4]],
  },
  {
    name: 'Iron Bell', harmonics: 18, detune: 3, spread: 15, drive: 35, brightness: 75, shimmer: 5,
    morphX: 0.7, morphY: 0.2,
    env: { attack: 0.01, decay: 0.8, sustain: 0.1, release: 2.5 },
    nodes: [[0.1, 0.7], [0.22, 0.3], [0.38, 0.8], [0.55, 0.15], [0.72, 0.6], [0.88, 0.35]],
  },
  {
    name: 'Silk Pad', harmonics: 6, detune: 22, spread: 80, drive: 0, brightness: 30, shimmer: 45,
    morphX: 0.2, morphY: 0.8,
    env: { attack: 0.8, decay: 0.3, sustain: 0.9, release: 2.0 },
    nodes: [[0.2, 0.4], [0.4, 0.6], [0.6, 0.5], [0.8, 0.55]],
  },
  {
    name: 'Pulse Wire', harmonics: 22, detune: 2, spread: 5, drive: 70, brightness: 90, shimmer: 0,
    morphX: 0.85, morphY: 0.15,
    env: { attack: 0.01, decay: 0.05, sustain: 0.85, release: 0.12 },
    nodes: [[0.1, 0.85], [0.25, 0.4], [0.42, 0.9], [0.58, 0.35], [0.75, 0.8], [0.9, 0.2]],
  },
  {
    name: 'Glass Arch', harmonics: 9, detune: 7, spread: 40, drive: 18, brightness: 60, shimmer: 60,
    morphX: 0.5, morphY: 0.5,
    env: { attack: 0.12, decay: 0.25, sustain: 0.75, release: 0.9 },
    nodes: [[0.15, 0.5], [0.3, 0.2], [0.5, 0.8], [0.7, 0.3], [0.85, 0.6]],
  },
  {
    name: 'Mariana', harmonics: 5, detune: 30, spread: 90, drive: 5, brightness: 15, shimmer: 80,
    morphX: 0.1, morphY: 0.9,
    env: { attack: 1.2, decay: 0.6, sustain: 0.5, release: 3.5 },
    nodes: [[0.25, 0.6], [0.5, 0.3], [0.75, 0.7]],
  },
];

// ── Knob definitions (copied from index.html) ─────────────────────

const knobs = [
  { id: 'harmonics', min: 2,  max: 24,  value: 8  },
  { id: 'detune',    min: 0,  max: 50,  value: 8  },
  { id: 'spread',    min: 0,  max: 100, value: 30 },
  { id: 'drive',     min: 0,  max: 100, value: 12 },
  { id: 'brightness',min: 0,  max: 100, value: 55 },
  { id: 'shimmer',   min: 0,  max: 100, value: 0  },
];

// ── Testable loadPreset (DOM calls replaced by stubs) ─────────────

/**
 * Applies preset[i] to the supplied state object.
 * Mirrors the logic of loadPreset() in index.html, but operates on
 * explicit state arguments instead of module-level globals.
 *
 * @param {number} i - preset index
 * @param {Object} state - { activePreset, knobValues, env, spectralNodes, morphX, morphY }
 */
function loadPreset(i, state) {
  state.activePreset = i;
  const p = presets[i];

  // Apply knob values
  knobs.forEach(k => {
    if (p[k.id] !== undefined) {
      state.knobValues[k.id] = p[k.id];
      // updateKnob() — DOM stub (omitted)
    }
  });

  // Apply envelope
  if (p.env) {
    Object.assign(state.env, p.env);
    // drawEnvCanvas() — DOM stub (omitted)
  }

  // Apply spectral nodes
  if (p.nodes) {
    state.spectralNodes = p.nodes.map(([x, y]) => ({ x, y }));
  }

  // Apply morph position
  if (p.morphX !== undefined) {
    state.morphX = p.morphX;
    state.morphY = p.morphY;
    // cursor DOM update — stub (omitted)
  }
}

/** Factory for a fresh default state. */
function makeState() {
  const knobValues = {};
  knobs.forEach(k => { knobValues[k.id] = k.value; });
  return {
    activePreset: 0,
    knobValues,
    env: { attack: 0.04, decay: 0.18, sustain: 0.72, release: 0.5 },
    spectralNodes: [],
    morphX: 0.5,
    morphY: 0.5,
  };
}

// ── Data integrity tests ──────────────────────────────────────────

describe('Preset data — required fields', () => {
  const REQUIRED = ['name', 'harmonics', 'detune', 'spread', 'drive',
                    'brightness', 'shimmer', 'morphX', 'morphY', 'env', 'nodes'];

  test.each(presets.map((p, i) => [p.name, i]))(
    '"%s" (index %i) has all required fields',
    (_name, i) => {
      REQUIRED.forEach(field => {
        expect(presets[i]).toHaveProperty(field);
      });
    }
  );

  test('every preset name is a non-empty string', () => {
    presets.forEach(p => {
      expect(typeof p.name).toBe('string');
      expect(p.name.length).toBeGreaterThan(0);
    });
  });

  test('all preset names are unique', () => {
    const names = presets.map(p => p.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('Preset data — knob value bounds', () => {
  test.each(knobs)('all presets keep "$id" within [$min, $max]', ({ id, min, max }) => {
    presets.forEach(p => {
      if (p[id] !== undefined) {
        expect(p[id]).toBeGreaterThanOrEqual(min);
        expect(p[id]).toBeLessThanOrEqual(max);
      }
    });
  });
});

describe('Preset data — morph coordinates', () => {
  test('all morphX and morphY values are in [0, 1]', () => {
    presets.forEach(p => {
      expect(p.morphX).toBeGreaterThanOrEqual(0);
      expect(p.morphX).toBeLessThanOrEqual(1);
      expect(p.morphY).toBeGreaterThanOrEqual(0);
      expect(p.morphY).toBeLessThanOrEqual(1);
    });
  });
});

describe('Preset data — envelope', () => {
  test('attack, decay, and release are all positive', () => {
    presets.forEach(p => {
      expect(p.env.attack).toBeGreaterThan(0);
      expect(p.env.decay).toBeGreaterThan(0);
      expect(p.env.release).toBeGreaterThan(0);
    });
  });

  test('sustain is in [0, 1]', () => {
    presets.forEach(p => {
      expect(p.env.sustain).toBeGreaterThanOrEqual(0);
      expect(p.env.sustain).toBeLessThanOrEqual(1);
    });
  });
});

describe('Preset data — spectral nodes', () => {
  test('every preset has at least one node', () => {
    presets.forEach(p => {
      expect(p.nodes.length).toBeGreaterThanOrEqual(1);
    });
  });

  test('all node coordinates are in [0, 1]', () => {
    presets.forEach(p => {
      p.nodes.forEach(([x, y]) => {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(1);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(1);
      });
    });
  });
});

// ── loadPreset state-mutation tests ──────────────────────────────

describe('loadPreset — state mutations', () => {
  test('sets activePreset to the correct index', () => {
    const state = makeState();
    loadPreset(2, state);
    expect(state.activePreset).toBe(2);
  });

  test('updates knobValues to match the preset', () => {
    const state = makeState();
    loadPreset(1, state); // Iron Bell
    expect(state.knobValues.harmonics).toBe(presets[1].harmonics);
    expect(state.knobValues.detune).toBe(presets[1].detune);
    expect(state.knobValues.drive).toBe(presets[1].drive);
  });

  test('updates env to match the preset', () => {
    const state = makeState();
    loadPreset(0, state); // Void Choir
    expect(state.env.attack).toBeCloseTo(presets[0].env.attack);
    expect(state.env.sustain).toBeCloseTo(presets[0].env.sustain);
    expect(state.env.release).toBeCloseTo(presets[0].env.release);
  });

  test('converts nodes from [x, y] tuples to {x, y} objects', () => {
    const state = makeState();
    loadPreset(0, state);
    state.spectralNodes.forEach((n, i) => {
      expect(typeof n.x).toBe('number');
      expect(typeof n.y).toBe('number');
      expect(n.x).toBeCloseTo(presets[0].nodes[i][0]);
      expect(n.y).toBeCloseTo(presets[0].nodes[i][1]);
    });
  });

  test('node count after load matches the preset nodes array length', () => {
    const state = makeState();
    presets.forEach((p, i) => {
      loadPreset(i, state);
      expect(state.spectralNodes.length).toBe(p.nodes.length);
    });
  });

  test('sets morphX and morphY to preset values', () => {
    const state = makeState();
    loadPreset(3, state); // Pulse Wire
    expect(state.morphX).toBeCloseTo(presets[3].morphX);
    expect(state.morphY).toBeCloseTo(presets[3].morphY);
  });

  test('loading different presets successively gives independent state', () => {
    const state = makeState();
    loadPreset(0, state);
    const nodesAfterFirst = state.spectralNodes.length;
    loadPreset(1, state);
    // Node arrays should not share references
    expect(state.spectralNodes.length).toBe(presets[1].nodes.length);
    expect(state.spectralNodes.length).not.toBe(nodesAfterFirst);
  });

  test('all 6 presets load without throwing', () => {
    presets.forEach((_p, i) => {
      expect(() => loadPreset(i, makeState())).not.toThrow();
    });
  });
});
