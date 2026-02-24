# 🌊 Water Shader Simulation — Three.js Deep Dive

A production-grade water surface simulation built with **Three.js** and custom **GLSL shaders**.  
The simulation combines Gerstner wave geometry displacement, a Fresnel reflectance model, environment-map reflections, and screen-space refraction into a single, physically motivated water surface.

---

## 📋 Table of Contents

1. [Demo Overview](#demo-overview)
2. [Architecture](#architecture)
3. [Core Concepts](#core-concepts)
   - [Gerstner Waves](#1-gerstner-waves)
   - [Fresnel Effect](#2-fresnel-effect)
   - [Environment Map Reflections](#3-environment-map-reflections)
   - [Screen-Space Refraction](#4-screen-space-refraction)
   - [Two-Pass Rendering](#5-two-pass-rendering)
   - [Blinn-Phong Specular](#6-blinn-phong-specular)
4. [File Structure](#file-structure)
5. [Shader Reference](#shader-reference)
   - [Vertex Shader Uniforms & Varyings](#vertex-shader)
   - [Fragment Shader Uniforms](#fragment-shader)
6. [Render Pipeline (Step by Step)](#render-pipeline)
7. [Getting Started](#getting-started)
8. [Tweaking the Water](#tweaking-the-water)
9. [How Each File Fits Together](#how-each-file-fits-together)

---

## Demo Overview

The scene contains:
- A **50×50 unit water plane** with 256×256 vertex subdivisions animated by three layered Gerstner waves.
- A **sphere** floating above the water that reflects in the surface.
- A **cube** positioned below the water level, visible through refraction.
- A **skybox** (cubemap) that wraps the environment and is reflected on the water.
- A **PointLight** overhead + **AmbientLight** for fill lighting.

---

## Architecture

```
App.tsx
 └── ViewerManager          (scene orchestrator)
      ├── GeometryManager   (mesh & material factory)
      │    ├── vertex-shader.ts   (GLSL – wave displacement)
      │    └── fragment-shader.ts (GLSL – Fresnel/reflection/refraction)
      └── LightManager      (light factory)
```

---

## Core Concepts

### 1. Gerstner Waves

> **What are Gerstner waves?**  
> Unlike a simple sine wave (which only moves vertices up and down), a **Gerstner / trochoidal wave** moves each water particle in a **circle**. This produces the sharp crests and flat troughs characteristic of real ocean waves.

#### Math

For each wave layer the displacement of a vertex at position **p** and time **t** is:

```
phase      = frequency * dot(direction, p.xz) - phaseSpeed * t
phaseSpeed = sqrt(gravity * frequency)   // deep-water dispersion relation

offset.x = steepness * amplitude * direction.x * cos(phase)
offset.z = steepness * amplitude * direction.y * cos(phase)
offset.y = amplitude * sin(phase)
```

Three wave layers (`uWaveA`, `uWaveB`, `uWaveC`) with different directions, amplitudes, and frequencies are superimposed. The mismatch between their periods prevents visible tiling.

#### Surface Normal Reconstruction

The normal is derived **analytically** from the partial derivatives of the displacement,
accumulated as `tangent` and `binormal` vectors inside `gerstnerWave()`:

```glsl
vec3 computedNormal = normalize(cross(binormal, tangent));
```

This is cheaper and more accurate than finite-difference normals.

---

### 2. Fresnel Effect

> **What is the Fresnel effect?**  
> When light hits a water surface, the proportion that is **reflected vs. refracted** depends on the viewing angle.  
> At a grazing angle (looking along the surface) almost all light is reflected.  
> Looking straight down, most light passes through.

#### Schlick Approximation (used in this shader)

```glsl
float NdotV   = max(dot(N, V), 0.0);
float fresnel = uFresnelBias + (1.0 - uFresnelBias) * pow(1.0 - NdotV, uFresnelPower);
```

| Uniform | Default | Effect |
|---|---|---|
| `uFresnelBias` | `0.02` | Minimum reflectivity when looking straight down |
| `uFresnelPower` | `5.0` | Sharpness of the transition to full reflection at the horizon |

`fresnel` (0–1) blends between refraction and reflection:

```glsl
vec3 color = mix(refractionTinted, reflectionColor, fresnel);
```

---

### 3. Environment Map Reflections

A **CubeTexture** (skybox) is loaded from six face images (`px/nx/py/ny/pz/nz`) and serves a dual role:

1. **Scene background** – wraps the world in a sky environment.
2. **Reflection map** – sampled in the fragment shader along the mirror direction.

```glsl
vec3 R = reflect(-V, N);                    // mirror the view vector around the normal
vec3 reflectionColor = textureCube(uEnvMap, R).rgb;
```

---

### 4. Screen-Space Refraction

Refraction in real-time is achieved with a **render-to-texture** trick:

1. The scene is rendered **without** the water plane into a `WebGLRenderTarget` (`refractionTarget`).
2. The resulting texture is passed to the water shader as `uRefractionMap`.
3. In the fragment shader the clip-space position is converted to normalised screen UV and then **offset by the wave normal** to simulate light bending:

```glsl
vec2 screenUV    = (vClipPos.xy / vClipPos.w) * 0.5 + 0.5;
vec2 refractedUV = screenUV + N.xz * uRefractionStrength;
vec3 refractionColor = texture2D(uRefractionMap, refractedUV).rgb;
```

A larger `uRefractionStrength` makes the underwater image wobble more.

---

### 5. Two-Pass Rendering

Each animation frame executes **two render calls**:

```
Frame N
 ├── Pass 1 (Refraction)
 │    ├── Hide water plane      (plane.visible = false)
 │    ├── setRenderTarget(refractionTarget)
 │    ├── renderer.render(scene, camera)    ← captures underwater scene
 │    └── setRenderTarget(null)
 │
 └── Pass 2 (Final)
      ├── Show water plane      (plane.visible = true)
      └── renderer.render(scene, camera)    ← water shader samples refractionTarget
```

This is a classic real-time technique used in games and interactive 3D apps. The overhead is one extra draw call per frame, which is negligible for this scene.

---

### 6. Blinn-Phong Specular

A specular "sun sparkle" is added using **Blinn-Phong**, which is cheaper than Phong and avoids artefacts at wide highlight angles:

```glsl
vec3  L    = normalize(uLightPosition - vWorldPosition); // surface → light
vec3  H    = normalize(L + V);                            // half-vector
float spec = pow(max(dot(N, H), 0.0), 128.0);             // tight highlight (exponent 128)
color += uLightColor * spec * 0.5;
```

---

## File Structure

```
viewer.web/src/
├── App.tsx                          # React root – mounts the Three.js canvas
├── modules/viewer-api/
│   ├── viewer-manager.ts            # Scene orchestrator (camera, renderer, loop)
│   ├── managers/
│   │   ├── geometry-manager.ts      # Mesh/material factory (plane, cube, sphere, skybox)
│   │   └── light-manager.ts         # PointLight + AmbientLight factory
│   └── shaders/
│       ├── vertex-shader.ts         # GLSL – Gerstner wave displacement & normal
│       └── fragment-shader.ts       # GLSL – Fresnel, reflection, refraction, specular
└── hooks/
    └── useLoadContextValue.ts       # React context helper
```

---

## Shader Reference

### Vertex Shader

| Symbol | Type | Direction | Description |
|---|---|---|---|
| `uTime` | `float` | uniform | Elapsed seconds – drives wave animation |
| `uWaveA/B/C` | `vec4` | uniform | `(dirX, dirZ, amplitude, frequency)` per wave layer |
| `vUv` | `vec2` | varying out | UV coords passed through unchanged |
| `vWorldPosition` | `vec3` | varying out | World-space displaced vertex position |
| `vNormal` | `vec3` | varying out | Analytically computed surface normal |
| `vClipPos` | `vec4` | varying out | Clip-space position used for screen-space UV derivation |

### Fragment Shader

| Uniform | Type | Description |
|---|---|---|
| `uWaterColor` | `vec3` | Base RGB tint of the water |
| `uLightPosition` | `vec3` | World-space position of the key light |
| `uLightColor` | `vec3` | Colour/intensity of specular highlights |
| `uEnvMap` | `samplerCube` | Skybox cubemap for reflections |
| `cameraPosition` | `vec3` | Camera world position (Three.js built-in uniform) |
| `uFresnelPower` | `float` | Sharpness of Fresnel transition |
| `uFresnelBias` | `float` | Minimum reflectivity at normal incidence |
| `uRefractionMap` | `sampler2D` | Render-target texture of the underwater scene |
| `uRefractionStrength` | `float` | Intensity of refraction UV distortion |

---

## Render Pipeline

```
┌─────────────────────────────────────────────────────────┐
│  JavaScript / TypeScript (per frame in animate())       │
│                                                         │
│  1. uTime        ← clock.getElapsedTime()               │
│  2. cameraPosition uniform ← camera.position            │
│                                                         │
│  ┌────────────── Refraction Pass ──────────────────┐    │
│  │  water plane .visible = false                   │    │
│  │  setRenderTarget(refractionTarget)              │    │
│  │  renderer.render(scene, camera)                 │    │
│  │    → records everything below the water surface │    │
│  │  setRenderTarget(null)                          │    │
│  └─────────────────────────────────────────────────┘    │
│                                                         │
│  ┌────────────── Final Pass ───────────────────────┐    │
│  │  water plane .visible = true                    │    │
│  │  renderer.render(scene, camera)                 │    │
│  │                                                 │    │
│  │  For each water-surface fragment:               │    │
│  │  ┌──── Vertex Shader ──────────────────────┐   │    │
│  │  │  Gerstner displacement (3 wave layers)  │   │    │
│  │  │  Analytical normal (cross product)      │   │    │
│  │  │  Output vClipPos, vWorldPosition        │   │    │
│  │  └─────────────────────────────────────────┘   │    │
│  │  ┌──── Fragment Shader ────────────────────┐   │    │
│  │  │  Fresnel term (Schlick approximation)   │   │    │
│  │  │  Reflection ← textureCube(uEnvMap, R)   │   │    │
│  │  │  Screen-space UV from vClipPos          │   │    │
│  │  │  Refraction ← texture2D(uRefractionMap) │   │    │
│  │  │  Distort UV by N.xz * strength          │   │    │
│  │  │  mix(refraction, reflection, fresnel)   │   │    │
│  │  │  Blinn-Phong specular highlight         │   │    │
│  │  └─────────────────────────────────────────┘   │    │
│  └─────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

---

## Getting Started

### Prerequisites

- Node.js ≥ 16
- npm ≥ 8

### Install & Run

```bash
cd viewer.web
npm install
npm start
```

The app opens at `http://localhost:3000`.

### Skybox Images

Place six square JPEG images (1024×1024 recommended) in `viewer.web/public/`:

```
px.jpg  (right  / +X face)
nx.jpg  (left   / -X face)
py.jpg  (top    / +Y face)
ny.jpg  (bottom / -Y face)
pz.jpg  (front  / +Z face)
nz.jpg  (back   / -Z face)
```

Free HDR/cubemap sets are available at [Poly Haven](https://polyhaven.com/hdris).

---

## Tweaking the Water

All water parameters are uniforms set inside `GeometryManager.createPlane()`:

| What to change | Uniform / property | Suggested range |
|---|---|---|
| Water colour | `uWaterColor` | `(0.0–0.2, 0.1–0.5, 0.3–0.8)` |
| Wave height | `uWaveA.z` amplitude | `0.05 – 0.8` |
| Wave tightness | `steepness` in GLSL | `0.0 (sine wave) → 1.0 (sharp crest)` |
| Reflectivity | `uFresnelBias` | `0.0 – 0.2` |
| Reflection sharpness | `uFresnelPower` | `2.0 (wide) – 10.0 (narrow horizon band)` |
| Refraction wobble | `uRefractionStrength` | `0.01 – 0.10` |
| Specular tightness | `128.0` exponent in GLSL | `16 (soft) – 512 (pin-point)` |

---

## How Each File Fits Together

```
App.tsx
  │  Mounts <div ref={viewerDivRef}> as the Three.js canvas container
  │  On mount → new ViewerManager(div, toast)
  │
  ▼
ViewerManager
  │  Creates WebGLRenderer, PerspectiveCamera, OrbitControls
  │  Creates WebGLRenderTarget (refractionTarget)
  │  Delegates geometry & lighting to sub-managers
  │  Runs requestAnimationFrame loop:
  │     → updates uTime & cameraPosition uniforms
  │     → executes two-pass render each frame
  │
  ├── GeometryManager
  │     createCubeBox()   → CubeTexture (skybox + envMap for reflections)
  │     createSphere()    → MeshStandardMaterial sphere above water
  │     createCube()      → MeshBasicMaterial cube below water (visible via refraction)
  │     createPlane()     → ShaderMaterial water plane
  │          ├── vertexShader   = VertexShader   (Gerstner wave displacement)
  │          └── fragmentShader = FragmentShader (Fresnel + reflection + refraction)
  │
  └── LightManager
        createPointLight()   → PointLight + PointLightHelper (overhead key light)
        createAmbientLight() → AmbientLight (soft fill, prevents pure-black shadows)
```
