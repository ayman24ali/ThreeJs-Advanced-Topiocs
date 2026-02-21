# Procedural 3-D Terrain Generator

A browser-based, real-time 3-D terrain visualiser built with **React**, **Three.js**, and custom **GLSL shaders**.  
The terrain is generated entirely on the CPU using **Perlin noise** stacked through **Fractional Brownian Motion (fBm)**, then rendered with a shader that colours each pixel by biome based on elevation.

---

## 📸 What You See

A 1 000 × 1 000 world-unit plane subdivided into 200 × 200 quads (≈ 40 000 vertices). Each vertex is displaced upward by a noise-derived height value, producing rolling hills, mountain ranges, valleys, beaches, and ocean floors. The shader paints every pixel with a smooth colour gradient that transitions through:

| Height (normalised) | Biome              | Colour          |
|---------------------|--------------------|-----------------|
| 0.00 – 0.18         | Deep ocean         | Dark navy blue  |
| 0.18 – 0.25         | Shallow ocean      | Medium blue     |
| 0.25 – 0.38         | Beach / sand       | Sandy tan       |
| 0.38 – 0.58         | Grassland          | Bright green    |
| 0.58 – 0.72         | Forest             | Dark green      |
| 0.72 – 0.88         | Rocky mountain     | Grey            |
| 0.88 – 1.00         | Snow cap           | Near-white      |

You can orbit, zoom, and pan with the mouse using Three.js **OrbitControls**.

---

## 🗂️ Project Structure

```
procedural-3d-terrain-generator/
└── viewer.web/                        # React app (Create React App + craco)
    └── src/
        ├── App.tsx                    # Root component — mounts the 3-D viewer
        ├── hooks/
        │   └── useLoadContextValue.ts # Custom hook — builds the React context value
        ├── stores/
        │   └── viewer-context.ts      # React Context definition
        └── modules/
            └── viewer-api/
                ├── viewer-manager.ts              # Orchestrates the entire Three.js scene
                └── managers/
                    ├── perlin-noise.ts            # 2-D Perlin noise implementation
                    ├── terrain-generator.ts       # fBm height map generator
                    ├── geometry-manager.ts        # Three.js mesh / material factory
                    ├── light-manager.ts           # Three.js light factory
                    └── shaders/
                        ├── vertex-shader.ts       # GLSL vertex shader
                        └── fragment-shader.ts     # GLSL fragment shader (biome + lighting)
```

---

## 🚀 Getting Started

```bash
cd viewer.web
npm install
npm start
```

Open [http://localhost:3000](http://localhost:3000).  
Use **left-drag** to orbit, **scroll** to zoom, **right-drag** to pan.

---

## 🧠 Core Concepts & Algorithms

### 1. Perlin Noise (`perlin-noise.ts`)

**What is Perlin noise?**  
Perlin noise is a type of gradient noise invented by Ken Perlin in 1983. Unlike pure random (white) noise, Perlin noise is *smooth and continuous* — adjacent points have similar values, making it ideal for generating natural-looking surfaces.

**How it works (step by step):**

1. **Grid cells** — The input point `(x, y)` falls somewhere inside a unit-square grid cell. The cell's four corner positions are computed by flooring `x` and `y`.

2. **Permutation table** — A pre-shuffled array of the numbers 0–255 (Ken Perlin's original shuffle) is duplicated into a 512-entry `Uint8Array` called `perm`. Hashing any integer `n` is as simple as `perm[n & 255]`. Doubling avoids array out-of-bounds when accessing `perm[X+1]`.

3. **Gradient vectors** — Each corner is assigned a pseudo-random *gradient direction* using the `grad()` function. It takes the lowest 2 bits of the corner's hash and selects one of four possible directions: `(+x,+y)`, `(-x,+y)`, `(+x,-y)`, `(-x,-y)`.

4. **Dot products** — The *influence* of each corner is the dot product of its gradient with the vector pointing from that corner to `(x, y)`. This gives a different sign/magnitude depending on which "side" of the corner we are on.

5. **Fade curve** — Before blending, the fractional offsets `(x − ⌊x⌋, y − ⌊y⌋)` are passed through Ken Perlin's quintic **fade** function:  
   `f(t) = 6t⁵ − 15t⁴ + 10t³`  
   This polynomial has zero first *and* second derivatives at `t = 0` and `t = 1`, eliminating the visible grid lines that appear with simpler interpolation.

6. **Bilinear interpolation** — The four corner influences are blended together with `lerp()` using the faded weights, producing a final value in roughly `[−1, 1]`.

```
Key methods:
  fade(t)              → smoothstep polynomial (removes grid artefacts)
  lerp(a, b, t)        → linear interpolation
  grad(hash, x, y)     → pseudo-random gradient dot-product
  noise(x, y)          → public API — returns a smooth value in [-1, 1]
```

---

### 2. Fractional Brownian Motion (`terrain-generator.ts`)

**What is fBm?**  
A single Perlin noise sample produces smooth, rolling hills — there is no fine surface detail. Real terrain has detail at *every scale*: large mountain ranges, medium valleys, small rocky outcrops, and tiny pebbles. **fBm** replicates this by stacking multiple *octaves* of noise.

**How it works:**

```
value     = 0
amplitude = 1
frequency = scale       // starting zoom level
maxAmp    = 0

for i in 0..octaves:
    value     += noise(x * frequency, y * frequency) * amplitude
    maxAmp    += amplitude
    amplitude *= persistence   // quieter each octave
    frequency *= lacunarity    // finer each octave

return value / maxAmp          // normalise to [-1, 1]
```

| Parameter     | Role                                                      | Typical value |
|---------------|-----------------------------------------------------------|---------------|
| `octaves`     | Number of noise layers. More = more detail, more CPU.     | 6             |
| `persistence` | Amplitude multiplier per octave (0–1). Lower = smoother.  | 0.5           |
| `lacunarity`  | Frequency multiplier per octave (> 1). Higher = finer.    | 2.0           |
| `scale`       | Base frequency / zoom. Small = large, coarse features.    | 0.003         |

With `persistence = 0.5` and `lacunarity = 2.0`, each octave is twice as fine but half as tall — matching the statistical self-similarity of natural terrain (a property called **fractal dimension**).

---

### 3. Terrain Mesh & Vertex Displacement (`geometry-manager.ts` + `viewer-manager.ts`)

**Why a PlaneGeometry?**  
Three.js `PlaneGeometry(width, height, widthSeg, heightSeg)` creates a flat rectangular mesh of triangles. With 200×200 segments, we get ≈40 000 vertices — enough resolution to show smooth rolling hills and sharp ridges.

**The displacement loop:**

```typescript
for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);   // object-space X
    const z = positions.getZ(i);   // object-space Z (always 0 on a flat plane)
    const h = terrainGenerator.fbm(x, z, { ... }) * 200;
    positions.setZ(i, h);          // push the vertex up/down
}
positions.needsUpdate = true;          // mark buffer dirty → re-upload to GPU
plane.geometry.computeVertexNormals(); // recalculate normals for lighting
```

**Why `setZ`, not `setY`?**  
The plane is later rotated `−90°` around the X axis (`rotation.x = -Math.PI / 2`) to lie flat. *Before* that rotation, the geometry lives in the XY plane. We write heights to Z before the rotation; after the rotation Z becomes world-Y (the up axis). The vertex shader reads `position.z` for the same reason.

**Min/max uniform update:**  
After displacement, the code scans all vertices to find the actual `min` and `max` heights, then writes those into the shader material uniforms `uMinHeight` / `uMaxHeight`. This ensures the biome colour ramp always spans the full height range of the *current* terrain — not a hard-coded ± 200.

---

### 4. GLSL Shaders

Three.js lets you replace the default material with a `ShaderMaterial` that runs two custom GPU programs:

#### Vertex Shader (`vertex-shader.ts`)

Runs **once per vertex** on the GPU. Its job:

1. Pass `vHeight` (the raw Z position) to the fragment shader so it can pick a biome colour.
2. Transform the vertex normal into **view space** using the `normalMatrix` (inverse-transpose of the model-view matrix) — necessary for correct lighting when the mesh is scaled non-uniformly.
3. Transform the vertex position into **view space** (`modelViewMatrix * position`) — needed for the rim-light calculation.
4. Output `gl_Position` by applying the full Model-View-Projection (MVP) transform.

```glsl
vHeight   = position.z;
vNormal   = normalize(normalMatrix * normal);
vPosition = (modelViewMatrix * vec4(position, 1.0)).xyz;
gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
```

#### Fragment Shader (`fragment-shader.ts`)

Runs **once per rasterised pixel**. Its job:

**Step 1 — Biome colour:**  
Normalise the fragment's height `vHeight` to `[0, 1]` using the min/max uniforms, then call `biomeColor(t)`, a piecewise-linear colour ramp that interpolates between the seven biome colours with GLSL's `mix()`.

**Step 2 — Lambertian (diffuse) shading:**  
```glsl
float diff = max(dot(vNormal, normalize(uSunDir)), 0.0);
```
The dot product of the surface normal and the sun direction gives `cos(θ)` — maximum (1.0) when the surface directly faces the sun, zero when perpendicular, negative (clamped to 0) when facing away.

**Step 3 — Ambient light:**  
A constant `0.35 × biomeColor` ensures no face is completely black, simulating indirect skylight.

**Step 4 — Rim light:**  
```glsl
float rim = pow(1.0 - max(dot(vNormal, normalize(-vPosition)), 0.0), 3.0) * 0.12;
```
The rim term is strongest when the surface normal is nearly perpendicular to the view direction (grazing angle). The cubic power sharpens the falloff, creating a subtle silhouette glow that gives the terrain visual depth.

**Final output:**
```glsl
gl_FragColor = vec4(ambient + diffuse + rim, 1.0);
```

---

### 5. Lighting (`light-manager.ts`)

The scene uses two Three.js lights:

| Light          | Purpose                                                                |
|----------------|------------------------------------------------------------------------|
| `AmbientLight` | Uniform fill (colour `0x404040`). Prevents pitch-black shadowed faces. |
| `PointLight`   | Red, intensity 2, range 100. Acts as a visible debug marker near origin. A `PointLightHelper` wireframe sphere is added to make it visible in the viewport. |

> **Note:** The sun used for terrain shading is **not** a Three.js light — it is a `vec3` uniform (`uSunDir`) passed directly to the fragment shader. This avoids the overhead of Three.js's built-in shadow pipeline for a mesh this large.

---

### 6. React Architecture

#### `App.tsx`
The root component. It:
- Holds a ref to the container `<div>`.
- Creates the `ViewerManager` inside a `useEffect` (once, guarded by `isViewerCreated`).
- Wraps the tree in `ViewerContext.Provider` so child components can access the manager.

**Why the `isViewerCreated` guard?**  
React 18 Strict Mode deliberately invokes effects twice in development to catch side-effects. Without the guard, two WebGL canvases would be appended to the same div. The `useRef(false)` flag makes the effect idempotent.

#### `useLoadContextValue.ts`
A custom hook that assembles the context value `{ toast, manager }` from the viewer and toast refs, updating whenever either changes.

#### `viewer-context.ts`
A typed `React.createContext` holding `{ toast, manager: ViewerManager }`. Any component can consume it with `useContext(ViewerContext)` to trigger scene actions (regenerate terrain, change camera, show notifications).

---

## 📐 Data Flow Diagram

```
App (React)
  │
  ├─ creates ──► ViewerManager
  │                │
  │                ├─ owns ──► THREE.Scene
  │                ├─ owns ──► THREE.PerspectiveCamera
  │                ├─ owns ──► THREE.WebGLRenderer
  │                ├─ owns ──► OrbitControls
  │                │
  │                ├─ uses ──► GeometryManager
  │                │             └─ createPlane() ──► THREE.Mesh
  │                │                                    └─ ShaderMaterial
  │                │                                         ├─ VertexShader (GLSL)
  │                │                                         └─ FragmentShader (GLSL)
  │                │                                              └─ biomeColor()
  │                │
  │                ├─ uses ──► TerrainGenerator
  │                │             └─ fbm()
  │                │                  └─ calls ──► PerlinNoise.noise()
  │                │
  │                └─ uses ──► LightManager
  │                              ├─ createAmbientLight()
  │                              └─ createPointLight()
  │
  └─ provides ──► ViewerContext
                    └─ consumed by child components
```

---

## ⚙️ Key Parameters to Experiment With

| Location                   | Parameter          | Effect                                           |
|----------------------------|--------------------|--------------------------------------------------|
| `viewer-manager.ts`        | `scale`            | Zoom in/out on noise (smaller = larger features) |
| `viewer-manager.ts`        | `octaves`          | More layers = more detail (costs CPU)            |
| `viewer-manager.ts`        | `persistence`      | Smoother vs. rougher terrain                     |
| `viewer-manager.ts`        | `lacunarity`       | How quickly detail increases per octave          |
| `viewer-manager.ts`        | `* 200`            | Overall terrain height scale                     |
| `viewer-manager.ts`        | `200, 200` (segs)  | Mesh resolution — more segments = smoother       |
| `geometry-manager.ts`      | `uSunDir`          | Sun position / angle                             |
| `fragment-shader.ts`       | biome thresholds   | Where each biome starts / ends                   |
| `fragment-shader.ts`       | `0.35`, `0.85`     | Ambient vs. diffuse light balance                |
| `fragment-shader.ts`       | `0.12`             | Rim-light intensity                              |

---

## 🛠️ Tech Stack

| Technology               | Role                                          |
|--------------------------|-----------------------------------------------|
| React 18                 | UI framework and component lifecycle          |
| Three.js                 | 3-D scene graph, WebGL abstraction            |
| GLSL                     | Custom GPU vertex and fragment shaders        |
| TypeScript               | Type safety across all modules                |
| PrimeReact               | Toast notification UI component               |
| OrbitControls            | Mouse-based camera navigation                 |
| Create React App + craco | Build toolchain                               |
