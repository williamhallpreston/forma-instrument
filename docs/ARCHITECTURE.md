# FORMA — Architecture & Design Decisions

## Audio Signal Graph

```
┌─────────────────────────────────────────────────────────┐
│                     VOICE (×8 max)                      │
│                                                         │
│  OscillatorNode (harmonic 1) ─┐                         │
│  OscillatorNode (harmonic 2) ─┤                         │
│  OscillatorNode (harmonic N) ─┤→ GainNode (hGain) ─┐   │
│  OscillatorNode (shimmer)    ─┘                     │   │
│                                                     ↓   │
│                                           WaveShaper?   │
│                                      (drive > 0 only)   │
│                                                     ↓   │
│                                         GainNode (ADSR) │
└─────────────────────────────────────────┬───────────────┘
                                          │ (per voice)
                                          ↓
                              GainNode (masterGain, 0.55)
                                          │
                          ┌───────────────┼────────────────┐
                          ↓               ↓                ↓
                  DynamicsCompressor  GainNode        GainNode
                     (−18dB thresh)  (reverbGain)   (delayGain)
                          │               │                │
                          ↓               ↓                ↓
                    AnalyserNode    ConvolverNode      DelayNode
                   (L + R meter)   (IR reverb)     (0.35s delay)
                          │               │           ↑    │
                          ↓               ↓           │    ↓
                   AudioDestination AudioDestination  GainNode
                                                  (delayFeedback)
                                                  AudioDestination
```

## Synthesis Model

### Spectral Node → Amplitude Array

Spectral nodes are stored as `{x: 0..1, y: 0..1}` where:
- `x` = normalized position in the harmonic series (0 = fundamental, 1 = Nth harmonic)
- `y` = *inverse* amplitude (0 = maximum energy, 1 = silence, matching canvas top=quiet UX)

For each harmonic `i`, the amplitude is computed as a **Gaussian-weighted sum** of nearby nodes:

```
amp[i] = Σ exp(−(normI − node.x)² × 18) × (1 − node.y)
```

The sharpness factor `18` was chosen to give nodes an influence radius of roughly ±2 harmonics, providing smooth curves without unnatural flatness.

### Morph Field Mapping

The XY pad modifies the amplitude array after spectral node calculation:

- **Y axis (morphY, 0=top/bright → 1=bottom/dark):**
  ```
  amp[i] *= pow(1 − morphY, i × 0.5)
  ```
  Higher harmonics attenuate faster as Y increases — mimics a low-pass filter but in harmonic space.

- **X axis (morphX, 0=left/odd → 1=right/even):**
  - If `morphX > 0.5`: even harmonics (0, 2, 4…) boosted up to ×2.5
  - If `morphX < 0.5`: odd harmonics (1, 3, 5…) boosted similarly
  - Creates a continuous timbral shift from hollow/clarinet character to full/organ character

### Voice Normalization

To prevent clipping when many harmonics are active, a per-voice normalization factor is computed:

```
totalAmp = Σ amps[i]
normFactor = 0.35 / totalAmp  (if totalAmp > 0)
```

The `0.35` headroom constant accounts for the dynamics compressor downstream.

## Key Design Decisions

### Why a Single HTML File?
- Zero setup for end users — download and open
- Trivially deployable to GitHub Pages, Netlify, any static host
- No build step means no toolchain maintenance burden
- The `src/` directory documents module boundaries for contributors

### Why Additive Synthesis?
- Direct relationship between spectral canvas and sound character
- No aliasing artifacts (each partial is a pure sine at a discrete frequency)
- The morph field has musically meaningful axes because harmonic relationships are explicit
- Computationally tractable in the browser at 8-voice polyphony with 24 harmonics each (192 oscillator nodes maximum)

### Why Gaussian Weighting for Spectral Nodes?
- Smooth curves prevent harsh notches between nodes
- Intuitive: moving a node feels like pulling on a rubber sheet
- The influence radius (factor `18` in the exponent) was tuned by ear to feel responsive

### Convolution Reverb vs Algorithmic
- Convolution produces a more natural, complex decay
- The IR is synthesized at runtime (pink-ish noise with exponential decay) — no file loading required
- Trade-off: no reverb pre-delay or diffusion control in v1

### Voice Stealing Strategy
- When MAX_VOICES (8) is exceeded, the oldest voice by `startTime` is killed with a fast 50ms fade
- This is simpler than musical voice stealing (last-note priority) but appropriate for the instrument's pad/texture use case
- Most users won't exceed 4–5 simultaneous voices in practice

## Browser Quirks

### AudioContext Autoplay Policy
Web browsers require a user gesture before audio can play. FORMA handles this by calling `ctx.resume()` inside `playNote()`, which is always triggered by user interaction. The `initAudio()` function is also bound to the first click event as a belt-and-suspenders measure.

### `c.roundRect()` Compatibility
`CanvasRenderingContext2D.roundRect()` is available in Chrome 99+, Firefox 112+, Safari 15.4+. For older browsers, the keyboard renderer falls back gracefully (corners will be square) — this is a cosmetic-only degradation.

### devicePixelRatio Scaling
All canvases are scaled by `window.devicePixelRatio` to prevent blurriness on HiDPI/Retina displays. The scale factor is applied via `ctx.scale()` at the start of each draw call and reset with `ctx.setTransform(1,0,0,1,0,0)` at the end.

## Performance Notes

- The spectral and morph canvases run continuous `requestAnimationFrame` loops even when idle. CPU overhead is minimal (~0.5% on a modern machine) because the draw operations are lightweight.
- Oscillator nodes are created fresh per note and garbage-collected on release. This is intentional — the Web Audio API's node reuse patterns are complex and the GC overhead is acceptable at 8-voice polyphony.
- The output meter reads from the `AnalyserL` node, which means the R channel reading is derived from a secondary analyser connected in parallel. In a future revision, a true stereo splitter should be used.
