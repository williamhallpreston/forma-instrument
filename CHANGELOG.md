# Changelog

All notable changes to FORMA will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0] — 2026-04-07

### Added
- Initial release of FORMA Spectral Morphing Instrument
- Spectral canvas with drag-to-place, drag-to-move, right-click-to-remove node interaction
- Additive synthesis engine: up to 24 harmonics per voice, 8-voice polyphony
- 2D XY morph field with Timbre (X) and Density (Y) axes
- ADSR amplitude envelope with live canvas preview
- 6 spectral knobs: Harmonics, Detune, Spread, Drive, Brightness, Shimmer
- Effects chain: convolution reverb, delay, chorus toggle, tube saturation
- Chromatic canvas keyboard with computer keyboard mapping (Z–M / A–L / Q–U)
- 6 factory presets: Void Choir, Iron Bell, Silk Pad, Pulse Wire, Glass Arch, Mariana
- Real-time stereo output meter
- 8-voice polyphony indicator dots
- HiDPI / Retina display support on all canvases
- Touch support for mobile browsers
- Responsive layout breakpoint at 720px

---

## [Unreleased]

### Planned
- MIDI input via Web MIDI API
- Preset import/export (JSON)
- LFO modulation routing to morph X/Y axes
- A→B spectral state interpolation across preset slots
- Service worker for offline PWA support
- VST3/AU wrapper investigation via JUCE WebView
