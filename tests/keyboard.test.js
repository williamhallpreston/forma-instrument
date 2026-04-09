/**
 * tests/keyboard.test.js
 *
 * Unit tests for getNoteAtXY — the function that maps a mouse position
 * on the keyboard canvas to a MIDI note number.
 *
 * All constants and the function itself are copied verbatim from index.html
 * so they can run in Node without a DOM. The test fixtures use a 700×100 px
 * canvas with its bounding rect at the origin (left=0, top=0), giving:
 *
 *   White key width  (wkW) = 700 / 14 = 50 px
 *   Black key width  (bkW) = 50 × 0.6 = 30 px
 *   Black key height (bkH) = 100 × 0.58 = 58 px
 *
 * White key MIDI notes (C4=48 … B5=71):
 *   idx  0  1  2  3  4  5  6  7  8  9  10  11  12  13
 *   note 48 50 52 53 55 57 59 60 62 64  65  67  69  71
 *
 * Black key x-ranges (y must be < 58 to register):
 *   C#4 (49): [17.5, 47.5]   D#4 (51): [67.5, 97.5]
 *   F#4 (54): [167.5, 197.5] G#4 (56): [217.5, 247.5]  A#4 (58): [267.5, 297.5]
 *   C#5 (61): [367.5, 397.5] D#5 (63): [417.5, 447.5]
 *   F#5 (66): [517.5, 547.5] G#5 (68): [567.5, 597.5]  A#5 (70): [617.5, 647.5]
 */

'use strict';

// ── Constants copied from index.html ──────────────────────────────

const WHITE_NOTES   = [0, 2, 4, 5, 7, 9, 11];
const BLACK_OFFSETS = [1, 3, null, 6, 8, 10, null];
const BASE_OCTAVE   = 4;
const NUM_OCTAVES   = 2;
const KEYS_WHITE    = NUM_OCTAVES * 7; // 14

/**
 * Determine which MIDI note number was clicked on the keyboard canvas.
 * Black keys are checked first (they sit on top of white keys visually).
 */
function getNoteAtXY(e, canvas, wrap) {
  const r  = canvas.getBoundingClientRect();
  const x  = e.clientX - r.left;
  const y  = e.clientY - r.top;
  const W  = wrap.offsetWidth;
  const H  = wrap.offsetHeight;
  const wkW = W / KEYS_WHITE;
  const bkW = wkW * 0.6;
  const bkH = H * 0.58;

  // Black keys first
  for (let oct = 0; oct < NUM_OCTAVES; oct++) {
    for (let wi = 0; wi < 7; wi++) {
      const bo = BLACK_OFFSETS[wi];
      if (bo === null) continue;
      const bx = (oct * 7 + wi + 0.65) * wkW - bkW / 2;
      if (x >= bx && x <= bx + bkW && y <= bkH) {
        return BASE_OCTAVE * 12 + oct * 12 + bo;
      }
    }
  }

  // White keys
  const wi = Math.floor(x / wkW);
  if (wi < 0 || wi >= KEYS_WHITE) return null;
  const oct = Math.floor(wi / 7);
  const pos = wi % 7;
  return BASE_OCTAVE * 12 + oct * 12 + WHITE_NOTES[pos];
}

// ── Test helpers ──────────────────────────────────────────────────

/** Fake canvas whose bounding rect starts at (left, top). */
function makeCanvas(left = 0, top = 0) {
  return { getBoundingClientRect: () => ({ left, top }) };
}

/** Fake container element with explicit pixel dimensions. */
function makeWrap(W = 700, H = 100) {
  return { offsetWidth: W, offsetHeight: H };
}

/** Fake mouse event. */
function ev(clientX, clientY) {
  return { clientX, clientY };
}

// ── White-key tests ───────────────────────────────────────────────

describe('getNoteAtXY — white keys', () => {
  const canvas = makeCanvas();
  const wrap   = makeWrap();

  test('first white key (C4) returns MIDI 48', () => {
    // Centre of key 0: x=25, below black-key region: y=80
    expect(getNoteAtXY(ev(25, 80), canvas, wrap)).toBe(48);
  });

  test('second white key (D4) returns MIDI 50', () => {
    // Centre of key 1: x=75, below black-key region: y=80
    expect(getNoteAtXY(ev(75, 80), canvas, wrap)).toBe(50);
  });

  test('first key of second octave (C5) returns MIDI 60', () => {
    // Key index 7, centre x = 7*50+25 = 375, y=80
    expect(getNoteAtXY(ev(375, 80), canvas, wrap)).toBe(60);
  });

  test('last white key (B5) returns MIDI 71', () => {
    // Key index 13, centre x = 13*50+25 = 675, y=80
    expect(getNoteAtXY(ev(675, 80), canvas, wrap)).toBe(71);
  });

  test('click exactly at x=0 hits the first white key', () => {
    expect(getNoteAtXY(ev(0, 80), canvas, wrap)).toBe(48);
  });

  test('click at the very right edge of the last white key (x=699) returns MIDI 71', () => {
    expect(getNoteAtXY(ev(699, 80), canvas, wrap)).toBe(71);
  });
});

// ── Black-key tests ───────────────────────────────────────────────

describe('getNoteAtXY — black keys', () => {
  const canvas = makeCanvas();
  const wrap   = makeWrap();

  test('C#4 black key (MIDI 49) is hit within its x-range above bkH', () => {
    // C#4 x-range: [17.5, 47.5], y must be < 58
    expect(getNoteAtXY(ev(30, 30), canvas, wrap)).toBe(49);
  });

  test('D#4 black key (MIDI 51) is hit within its x-range above bkH', () => {
    // D#4 x-range: [67.5, 97.5]
    expect(getNoteAtXY(ev(80, 30), canvas, wrap)).toBe(51);
  });

  test('F#4 black key (MIDI 54) is hit within its x-range above bkH', () => {
    // F#4 x-range: [167.5, 197.5]
    expect(getNoteAtXY(ev(180, 30), canvas, wrap)).toBe(54);
  });

  test('black key takes priority over the white key below it', () => {
    // x=30 sits over C4 (white) and C#4 (black); at y=30 (above bkH) the black key wins
    expect(getNoteAtXY(ev(30, 30), canvas, wrap)).toBe(49); // C#4, not C4
  });

  test('same x but y below bkH falls through to white key', () => {
    // x=30, y=80 (> bkH=58) — black key check fails, white key 0 = C4 (48)
    expect(getNoteAtXY(ev(30, 80), canvas, wrap)).toBe(48);
  });

  test('C#5 black key (MIDI 61) is hit in the second octave', () => {
    // C#5 x-range: [367.5, 397.5]
    expect(getNoteAtXY(ev(380, 30), canvas, wrap)).toBe(61);
  });
});

// ── Out-of-bounds tests ───────────────────────────────────────────

describe('getNoteAtXY — out-of-bounds clicks', () => {
  const canvas = makeCanvas();
  const wrap   = makeWrap();

  test('x < 0 returns null', () => {
    expect(getNoteAtXY(ev(-1, 50), canvas, wrap)).toBeNull();
  });

  test('x === canvas width (700) returns null', () => {
    expect(getNoteAtXY(ev(700, 50), canvas, wrap)).toBeNull();
  });

  test('x far beyond the canvas returns null', () => {
    expect(getNoteAtXY(ev(9999, 50), canvas, wrap)).toBeNull();
  });
});

// ── Canvas offset tests ───────────────────────────────────────────

describe('getNoteAtXY — canvas with non-zero bounding rect offset', () => {
  test('accounts for canvas left/top in clientX/Y', () => {
    // Canvas starts at pixel (100, 50) on the page
    const canvas = makeCanvas(100, 50);
    const wrap   = makeWrap();

    // clientX=125 → local x=25 → first white key C4 (48)
    expect(getNoteAtXY(ev(125, 130), canvas, wrap)).toBe(48);

    // clientX=175 → local x=75 → centre of second white key D4 (50), y=80 > bkH
    expect(getNoteAtXY(ev(175, 130), canvas, wrap)).toBe(50);
  });

  test('a click that maps to x < 0 after offset subtraction returns null', () => {
    // Canvas starts at x=100; clientX=50 → local x=-50
    const canvas = makeCanvas(100, 0);
    const wrap   = makeWrap();
    expect(getNoteAtXY(ev(50, 50), canvas, wrap)).toBeNull();
  });
});
