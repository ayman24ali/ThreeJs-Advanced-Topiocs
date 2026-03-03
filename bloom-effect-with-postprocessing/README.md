# Bloom Effect with Post-Processing — Three.js POC

A **Proof of Concept** demonstrating a custom, hand-rolled **bloom / glow post-processing effect** built with [Three.js](https://threejs.org/) and [React](https://react.dev/), without relying on Three.js's built-in `UnrealBloomPass`. All GLSL shaders are written from scratch.

---

## 📋 Table of Contents

- [Overview](#overview)
- [How the Bloom Pipeline Works](#how-the-bloom-pipeline-works)
- [Project Structure](#project-structure)
- [Shaders](#shaders)
- [Getting Started](#getting-started)
- [Tech Stack](#tech-stack)

---

## Overview

The scene contains:
- A **rotating emissive cube** (orange HDR emissive material, intensity > 1.0) — this is the glowing object.
- A **ground plane** (dark, non-emissive) — this receives no bloom and remains dark.
- A **point light** and an **ambient light** for general scene illumination.

The bloom effect makes the emissive cube appear to radiate light into the surrounding area, while the dark plane remains unaffected and visible in the final composite.

---

## How the Bloom Pipeline Works

The post-processing is implemented as a manual multi-pass pipeline using Three.js's `EffectComposer` and `ShaderPass`:

```
┌─────────────────────────────────────────────────────────────────┐
│  1. Manual Scene Render  →  sceneRenderTarget  (original scene) │
└──────────────────────────────┬──────────────────────────────────┘
                               │ (also saved as tOriginal)
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│  2. TexturePass  — feeds sceneRenderTarget into composer chain  │
└──────────────────────────────┬──────────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│  3. ThresholdPass  — extracts pixels above luminance threshold  │
│     (only bright/emissive areas survive)                        │
└──────────────────────────────┬──────────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│  4. Gaussian Blur  ×100 H/V passes — spreads the bright areas   │
│     outward to simulate light bleed                             │
└──────────────────────────────┬──────────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│  5. CompositePass  — adds blurred bloom on top of tOriginal     │
│     final output = original scene + bloom * bloomStrength       │
└─────────────────────────────────────────────────────────────────┘
```

---

## Project Structure

```
viewer.web/src/
├── App.tsx                          # Root React component, mounts the viewer
├── stores/
│   └── viewer-context.ts            # React context exposing ViewerManager app-wide
├── hooks/
│   └── useLoadContextValue.ts       # Hook that builds the viewer context value
└── modules/
    └── viewer-api/
        ├── viewer-manager.ts        # Core orchestrator: scene, renderer, composer, loop
        ├── managers/
        │   ├── geometry-manager.ts  # Creates scene geometry (cube, plane)
        │   └── light-manager.ts     # Creates lights (point light, ambient light)
        └── shaders/
            ├── fullscreen-vertex-shader.ts       # Shared vertex shader for all passes
            ├── threshhold-fragment.ts            # Luminance threshold / bright-pass filter
            ├── gaussianBlurFragmentShader.ts     # Separable Gaussian blur (H and V)
            └── composite-fragment-shader.ts      # Blends original scene + bloom result
```

---

## Shaders

| Shader | Purpose |
|--------|---------|
| `fullscreen-vertex-shader` | Shared vertex shader used by all post-processing passes. Passes UV coordinates to the fragment shader. |
| `threshhold-fragment` | Bright-pass filter. Uses a luma calculation to isolate pixels brighter than `uThreshold`. A `uKnee` value creates a smooth transition to avoid hard edges. |
| `gaussianBlurFragmentShader` | Separable Gaussian blur. Run horizontally (`uDirection = (1,0)`) then vertically (`uDirection = (0,1)`) 100 times each for a wide, soft blur. |
| `composite-fragment-shader` | Final merge pass. Adds the blurred bloom result (`tDiffuse`) on top of the original pre-threshold scene (`tOriginal`) scaled by `uBloomStrength`. |

---

## Getting Started

```bash
# Navigate to the web app
cd viewer.web

# Install dependencies
npm install

# Start the development server
npm start
```

Open [http://localhost:3000](http://localhost:3000) to view it in the browser.

---

## Tech Stack

- **Three.js** — 3D rendering, `EffectComposer`, `ShaderPass`, `WebGLRenderTarget`
- **React** — UI shell, context, hooks
- **TypeScript** — Full type safety across the codebase
- **GLSL** — Custom vertex and fragment shaders for every post-processing step
- **PrimeReact** — Toast notification component
