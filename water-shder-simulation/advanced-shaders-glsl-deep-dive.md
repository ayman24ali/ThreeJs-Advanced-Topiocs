# Advanced Shaders (GLSL) — The Full Picture

## The Big Question: Why Write Your Own Shaders?

In the WebGL fundamentals exercise, you learned that shaders are small programs that run on the GPU — the vertex shader positions vertices, the fragment shader colors pixels. You wrote basic ones using `RawShaderMaterial`. But those shaders were simple: flat colors, basic diffuse lighting, texture sampling.

Here's the thing: **every visual effect you've ever seen in a game or 3D application — reflections, refractions, realistic water, skin, fire, glass, metal, shadows, fog — is just a fragment shader doing clever math.** The GPU doesn't know what "water" is. It doesn't know what "reflection" is. It only knows: "for this pixel, what color should I output?" Your job as a shader author is to write the math that makes the GPU produce the *right* color for every pixel, 60 times per second.

This exercise takes you from "I can write a basic shader" to "I understand how to simulate physical light behavior in GLSL." That's the jump from toy shaders to production shaders.

Here's the entire thesis in one sentence:

> **Advanced shaders simulate how light interacts with surfaces in the real world — bouncing, bending, scattering, absorbing — by encoding physics equations into GLSL math that runs per-pixel on the GPU.**

Every concept below — lighting models, normal mapping, reflection, refraction, Fresnel — is a piece of that simulation.

---

## Part 1: The Rendering Equation — What We're Actually Solving

Every shader, at its core, is trying to answer one question: **how much light reaches the camera from this surface point?**

In the real world, light from a source hits a surface. Some of it gets absorbed (that's why things have color). Some bounces off (reflection). Some passes through and bends (refraction). Some scatters inside the material and comes back out (subsurface scattering). The amount and direction of each behavior depends on the material.

The **rendering equation** (introduced by James Kajiya in 1986) formalizes this:

```
L_out(point, direction) = L_emitted + ∫ BRDF × L_in × cos(θ) dω
```

Don't panic. In plain language:

- **L_out** = the light leaving this point toward the camera (what we output as the pixel color)
- **L_emitted** = light the surface produces on its own (like a light bulb or lava)
- **BRDF** = a function that describes how much incoming light bounces toward the camera for this material (this is the "material identity" — metal vs. plastic vs. skin)
- **L_in** = light arriving from all directions
- **cos(θ)** = surfaces facing the light get more light than surfaces at an angle (Lambert's cosine law)
- **∫ dω** = we sum this over all incoming light directions (a hemisphere above the surface)

**Nobody actually solves this integral in real-time.** Instead, we approximate it. Each lighting model you'll learn is a different approximation — trading accuracy for speed.

Think of it as a spectrum:

```
Simple & Fast                                    Accurate & Expensive
──────────────────────────────────────────────────────────────────────
Flat shading → Lambert → Blinn-Phong → Cook-Torrance PBR → Path Tracing
(no lighting)   (diffuse)  (diffuse +    (physically based    (the real deal,
                            specular)     reflection model)    but way too slow
                                                               for real-time)
```

Your water shader PoC will land around the **Blinn-Phong to PBR** range, plus environment-based techniques (reflection/refraction) that go beyond local lighting models.

---

## Part 2: Vectors — The Language Shaders Think In

Before diving into lighting models, you need to be fluent in the vectors that every shader uses. Lighting calculations are fundamentally about **the angular relationships between vectors.**

### The Five Essential Vectors

At every surface point in your scene, there are five vectors that matter:

```
          L (light direction)          V (view/camera direction)
           \                          /
            \        N (normal)      /
             \        |             /
              \       |            /
               \      |           /
                \     |          /
    ─────────────●────|─────────────── surface
                      |
                      R (reflection of L across N)
                      H (halfway between L and V)
```

| Vector | What it is | How you get it in GLSL |
|--------|-----------|----------------------|
| **N** (Normal) | Direction the surface faces at this point | From the `normal` attribute, transformed by `normalMatrix` |
| **L** (Light) | Direction from the surface point toward the light | `normalize(lightPosition - fragmentPosition)` |
| **V** (View) | Direction from the surface point toward the camera | `normalize(cameraPosition - fragmentPosition)` |
| **R** (Reflection) | The mirror reflection of L across N | `reflect(-L, N)` — GLSL has this built in |
| **H** (Half) | Halfway between L and V | `normalize(L + V)` |

**Every lighting model is just dot products between these vectors.** The dot product of two normalized vectors gives you the cosine of the angle between them: 1.0 when they point the same way, 0.0 when perpendicular, -1.0 when opposite.

```glsl
// This single operation is the foundation of ALL lighting
float NdotL = max(dot(N, L), 0.0);
```

This says: "how much is this surface facing the light?" If `N` and `L` point the same direction (surface directly faces the light), `NdotL = 1.0` — full brightness. If they're perpendicular (surface edge-on to the light), `NdotL = 0.0` — no light. This is Lambert's cosine law, and it's the single most important calculation in all of shader lighting.

---

## Part 3: Lighting Models — From Simple to Physically Based

### Level 1: Lambert (Diffuse Only)

Lambert models surfaces that scatter light equally in all directions — like chalk, unfinished wood, or dry clay. When light hits these surfaces, it bounces off in every direction equally, so the brightness depends only on the angle between the surface and the light, not on where the camera is.

```glsl
// Lambert diffuse lighting
float NdotL = max(dot(N, L), 0.0);
vec3 diffuse = lightColor * surfaceColor * NdotL;
```

That's the entire model. Simple, cheap, and looks right for matte surfaces. But it can't do shiny highlights — a white ceramic mug looks the same as a chalk wall.

### Level 2: Blinn-Phong (Diffuse + Specular)

Real surfaces don't just scatter light — they also reflect it. When you see a bright spot on an apple or a shiny floor, that's **specular reflection**. Blinn-Phong adds this by using the **half vector (H)** — the direction halfway between the light and the camera.

The idea: a surface produces a specular highlight when its normal aligns with this half vector. The tighter the alignment, the sharper the highlight.

```glsl
// Blinn-Phong: diffuse + specular
vec3 H = normalize(L + V);  // halfway vector

// Diffuse (same as Lambert)
float NdotL = max(dot(N, L), 0.0);
vec3 diffuse = lightColor * surfaceColor * NdotL;

// Specular — how aligned is the normal with the half vector?
float NdotH = max(dot(N, H), 0.0);
float specular = pow(NdotH, shininess);  // shininess = 32, 64, 128...
// Higher shininess = tighter, sharper highlight (more mirror-like)

vec3 result = diffuse + lightColor * specularStrength * specular;
```

**The `shininess` exponent is key.** It controls how "tight" the specular highlight is:
- `shininess = 8` → wide, soft glow (plastic)
- `shininess = 64` → medium highlight (glazed ceramic)
- `shininess = 256` → tiny, sharp pinpoint (polished metal)

The `pow()` function is what makes this work — raising `NdotH` (which is between 0 and 1) to a high power crushes all values except those very close to 1.0, creating a tight highlight.

### Level 3: Physically Based Rendering (PBR / Cook-Torrance)

Blinn-Phong is a hack — it looks plausible, but it doesn't accurately model how real materials behave. PBR (Physically Based Rendering) replaces it with models derived from actual physics. The Cook-Torrance model is the industry standard.

PBR describes materials with two key parameters:

- **Metalness** (0 to 1): Is it a metal? Metals reflect light with their surface color (gold reflects golden). Non-metals reflect white.
- **Roughness** (0 to 1): How microscopically rough is the surface? Rough surfaces scatter reflections (matte), smooth surfaces focus them (mirror-like).

The Cook-Torrance BRDF has three components:

```
                    D(H) × F(V, H) × G(L, V, N)
f_specular = ────────────────────────────────────
                  4 × (N·L) × (N·V)
```

| Term | Name | What it does |
|------|------|-------------|
| **D** | Normal Distribution Function (NDF) | How many microfacets align with the half vector? Controls highlight shape. |
| **F** | Fresnel | How much light reflects vs. refracts at this angle? (More reflection at grazing angles.) |
| **G** | Geometry function | How much light is blocked by other microfacets? (Self-shadowing at grazing angles.) |

Each has a standard implementation. Here's the GGX variant (most common in games):

```glsl
// D: GGX/Trowbridge-Reitz Normal Distribution Function
float DistributionGGX(vec3 N, vec3 H, float roughness) {
    float a = roughness * roughness;
    float a2 = a * a;
    float NdotH = max(dot(N, H), 0.0);
    float NdotH2 = NdotH * NdotH;

    float denom = NdotH2 * (a2 - 1.0) + 1.0;
    denom = 3.14159265 * denom * denom;

    return a2 / denom;
}

// F: Fresnel-Schlick approximation
vec3 FresnelSchlick(float cosTheta, vec3 F0) {
    return F0 + (1.0 - F0) * pow(1.0 - cosTheta, 5.0);
}

// G: Schlick-GGX geometry function
float GeometrySchlickGGX(float NdotV, float roughness) {
    float r = roughness + 1.0;
    float k = (r * r) / 8.0;
    return NdotV / (NdotV * (1.0 - k) + k);
}

float GeometrySmith(vec3 N, vec3 V, vec3 L, float roughness) {
    float NdotV = max(dot(N, V), 0.0);
    float NdotL = max(dot(N, L), 0.0);
    float ggx1 = GeometrySchlickGGX(NdotV, roughness);
    float ggx2 = GeometrySchlickGGX(NdotL, roughness);
    return ggx1 * ggx2;
}
```

**Why does this matter for your water shader?** Water is a non-metallic, very smooth surface — `metalness ≈ 0`, `roughness ≈ 0.05`. But water's most distinctive visual property comes from the **Fresnel** term: when you look straight down at water, you see through it (refraction dominates). When you look at a shallow angle across the surface, you see reflections (reflection dominates). The Fresnel-Schlick function models exactly this behavior.

---

## Part 4: The Fresnel Effect — Why Water Looks Like Water

This is arguably the most important concept for your water shader, so let's dig deep.

### The Physical Phenomenon

Stand at the edge of a swimming pool:
- Look **straight down** into the water → you can see the bottom clearly (light passes through)
- Look **across** the pool at a shallow angle → the surface becomes a mirror (light bounces off)

This is the **Fresnel effect** (pronounced "freh-NEL"). It occurs at every boundary between two materials with different refractive indices (air-to-water, air-to-glass, etc.).

### The Math

The Fresnel equations describe how much light reflects vs. transmits at an interface. The full equations are complex, but the **Schlick approximation** is what everyone uses in real-time:

```glsl
// F0 = reflectance at normal incidence (looking straight at the surface)
// For water: F0 ≈ 0.02 (only 2% reflects when looking straight down)
// For glass: F0 ≈ 0.04
// For metals: F0 ≈ 0.5–1.0 (metals are highly reflective even head-on)

vec3 F0 = vec3(0.02); // water

// cosTheta = dot(N, V) — how directly you're looking at the surface
float cosTheta = max(dot(N, V), 0.0);

// Fresnel: more reflection at grazing angles
float fresnel = F0 + (1.0 - F0) * pow(1.0 - cosTheta, 5.0);

// fresnel ≈ 0.02 when looking straight down (see through)
// fresnel ≈ 1.0 when looking at a shallow angle (mirror)
```

In your water shader, you'll use this `fresnel` value to **mix** between the reflection color and the refraction color:

```glsl
vec3 finalColor = mix(refractionColor, reflectionColor, fresnel);
```

That single line is what makes water look like water.

---

## Part 5: Reflection — Sampling the Environment

Reflection asks: "if I were a mirror at this point, what would I see?" The answer depends on the surface normal and the camera direction.

### How Reflection Works in a Shader

```glsl
// The reflect() function mirrors the view direction across the surface normal
vec3 V = normalize(cameraPosition - fragmentPosition);
vec3 R = reflect(-V, N);
// R now points in the direction a mirror would "see" from this surface point
```

But `R` is just a direction — you need something to *sample* along that direction to get a color. That something is an **environment map**.

### Environment Maps (Cubemaps)

Think of a cubemap as a **photograph of the entire surrounding environment**, mapped onto the six faces of a cube:

```
         +---+
         | +Y|  (top)
    +---++---++---++---+
    | -X|| +Z|| +X|| -Z|
    +---++---++---++---+
         | -Y|  (bottom)
         +---+
```

When you sample a cubemap with a direction vector, the GPU figures out which face and which pixel that direction hits:

```glsl
uniform samplerCube uEnvMap;

vec3 R = reflect(-V, N);
vec3 reflectionColor = textureCube(uEnvMap, R).rgb;
```

That's it — one line to get the reflection color. The GPU does the heavy lifting of mapping a 3D direction to a 2D texture coordinate on the appropriate cube face.

### In Three.js

```javascript
// Load a cubemap
const cubeTextureLoader = new THREE.CubeTextureLoader();
const envMap = cubeTextureLoader.load([
  'px.jpg', 'nx.jpg',  // +X, -X
  'py.jpg', 'ny.jpg',  // +Y, -Y
  'pz.jpg', 'nz.jpg'   // +Z, -Z
]);

// Pass to shader as a uniform
material.uniforms.uEnvMap = { value: envMap };
```

### Planar Reflections (For Flat Surfaces Like Water)

Cubemaps work for curved objects, but for a flat water surface, you can get better results with **planar reflection**: render the scene from a "mirrored camera" (reflected across the water plane) into a render target, then use that texture.

```javascript
// Mirror the camera across the water plane
const mirrorCamera = camera.clone();
mirrorCamera.position.y = -camera.position.y + 2 * waterHeight;
mirrorCamera.lookAt(/* mirrored target */);

// Render to a render target
renderer.setRenderTarget(reflectionRenderTarget);
renderer.render(scene, mirrorCamera);
renderer.setRenderTarget(null);

// Pass the texture to the water shader
waterMaterial.uniforms.uReflectionMap = { value: reflectionRenderTarget.texture };
```

This connects directly to your framebuffer knowledge from the WebGL fundamentals exercise — you're using render-to-texture to generate the reflection image, then sampling it in the water shader.

---

## Part 6: Refraction — Light Bending Through Materials

When light passes from one medium to another (air → water), it **bends**. The amount of bending depends on the **refractive indices** of the two materials.

### Snell's Law

```
n₁ × sin(θ₁) = n₂ × sin(θ₂)

Where:
  n₁ = refractive index of the first medium (air ≈ 1.0)
  n₂ = refractive index of the second medium (water ≈ 1.33, glass ≈ 1.5)
  θ₁ = angle of the incoming ray
  θ₂ = angle of the refracted ray
```

The ratio `n₁/n₂` is what you pass to GLSL's built-in `refract()` function:

```glsl
float ratio = 1.0 / 1.33; // air to water
vec3 V = normalize(cameraPosition - fragmentPosition);
vec3 refractedDir = refract(-V, N, ratio);
```

### Sampling the Refracted View

For refraction, you typically render the scene *below* the water into a render target, then sample it with distorted UV coordinates:

```glsl
uniform sampler2D uRefractionMap;
uniform float uRefractionStrength;

// Distort the UV based on the surface normal (the ripple effect)
vec2 refractedUV = screenUV + N.xz * uRefractionStrength;
vec3 refractionColor = texture2D(uRefractionMap, refractedUV).rgb;
```

The `N.xz * uRefractionStrength` is what creates the visual distortion — as the water's surface normal tilts due to waves, the refraction UV shifts, making objects below the water appear to wobble and bend.

---

## Part 7: Normal Mapping and Wave Simulation

Your water surface needs to *move*. Still water with a flat normal everywhere would just be a flat mirror. Waves change the surface normal across the surface and over time, which changes how light reflects and refracts at each point.

### Why Not Just Move the Vertices?

You could deform the mesh vertices to create waves — and for large ocean waves, you should. But fine ripple detail would require millions of vertices. Instead, we **fake** the detail by changing the normals without changing the geometry. This is **normal mapping**.

### Generating Animated Normals in GLSL

Instead of loading a normal map texture, you can generate wave normals procedurally using layered sine waves or noise:

```glsl
// Approach 1: Layered sine waves (Gerstner waves simplified)
vec3 computeWaveNormal(vec2 pos, float time) {
    vec3 normal = vec3(0.0, 1.0, 0.0); // start with flat up

    // Wave 1: large, slow
    float wave1 = sin(pos.x * 0.5 + time * 0.8) * cos(pos.y * 0.3 + time * 0.6);
    normal.x += wave1 * 0.3;
    normal.z += cos(pos.x * 0.5 + time * 0.8) * 0.2;

    // Wave 2: medium, faster
    float wave2 = sin(pos.x * 2.0 + pos.y * 1.5 + time * 2.0);
    normal.x += wave2 * 0.15;
    normal.z += cos(pos.x * 1.5 - pos.y * 2.0 + time * 1.8) * 0.1;

    // Wave 3: small, fastest (fine ripples)
    float wave3 = sin(pos.x * 8.0 - time * 3.0) * sin(pos.y * 6.0 + time * 2.5);
    normal.x += wave3 * 0.05;
    normal.z += wave3 * 0.05;

    return normalize(normal);
}
```

```glsl
// Approach 2: Scrolling normal map textures (more realistic)
uniform sampler2D uNormalMap;
uniform float uTime;

vec3 computeWaveNormal(vec2 uv, float time) {
    // Sample the same normal map at two different scales and speeds
    vec2 uv1 = uv * 4.0 + vec2(time * 0.05, time * 0.03);
    vec2 uv2 = uv * 8.0 + vec2(-time * 0.03, time * 0.07);

    vec3 normal1 = texture2D(uNormalMap, uv1).rgb * 2.0 - 1.0;
    vec3 normal2 = texture2D(uNormalMap, uv2).rgb * 2.0 - 1.0;

    // Blend the two samples
    vec3 combined = normalize(normal1 + normal2);
    return combined;
}
```

The `* 2.0 - 1.0` trick converts from texture color space (0 to 1) to normal vector space (-1 to 1). Each RGB channel maps to the X, Y, Z components of the normal direction.

### Gerstner Waves (The Real Deal)

For realistic ocean surfaces, Gerstner waves model how actual water particles move — they trace circular orbits, causing peaks to sharpen and troughs to flatten:

```glsl
// Gerstner wave: moves vertices AND computes proper normals
// Q = steepness (0-1), A = amplitude, D = direction, w = frequency, phi = speed
vec3 gerstnerWave(vec2 pos, float time, float Q, float A, vec2 D, float w, float phi) {
    float dotDP = dot(D, pos);
    float cosVal = cos(w * dotDP + phi * time);
    float sinVal = sin(w * dotDP + phi * time);

    vec3 offset;
    offset.x = Q * A * D.x * cosVal;   // horizontal displacement
    offset.z = Q * A * D.y * cosVal;   // horizontal displacement
    offset.y = A * sinVal;              // vertical displacement

    return offset;
}

// In the vertex shader — displace the vertex position
vec3 pos = position;
pos += gerstnerWave(position.xz, uTime, 0.5, 0.3, vec2(1.0, 0.0), 2.0, 1.5);
pos += gerstnerWave(position.xz, uTime, 0.3, 0.15, vec2(0.7, 0.7), 3.0, 0.8);
pos += gerstnerWave(position.xz, uTime, 0.2, 0.08, vec2(-0.4, 0.9), 5.0, 2.0);
gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
```

Layering multiple Gerstner waves with different directions, frequencies, and amplitudes creates complex, realistic ocean motion.

---

## Part 8: Putting It All Together — The Water Shader Pipeline

Now you can see how every piece connects into the final water shader:

```
┌─────────────────────────────────────────────────────────────────────┐
│                        WATER SHADER PIPELINE                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────────────────────────┐                            │
│  │       VERTEX SHADER                 │                            │
│  │                                     │                            │
│  │  1. Receive flat plane vertices     │                            │
│  │  2. Apply Gerstner wave displacement│                            │
│  │  3. Compute displaced position      │                            │
│  │  4. Pass UVs, world position,       │                            │
│  │     clip-space position as varyings │                            │
│  └──────────────┬──────────────────────┘                            │
│                 │ (interpolated per pixel)                           │
│  ┌──────────────▼──────────────────────┐                            │
│  │       FRAGMENT SHADER               │                            │
│  │                                     │                            │
│  │  1. Compute wave normal (procedural │                            │
│  │     or from normal map)             │                            │
│  │                                     │                            │
│  │  2. Compute view vector V           │                            │
│  │                                     │                            │
│  │  3. Compute reflection:             │                            │
│  │     R = reflect(-V, N)              │                            │
│  │     reflColor = cubemap(R)          │                            │
│  │     — OR sample planar reflect FBO  │                            │
│  │                                     │                            │
│  │  4. Compute refraction:             │                            │
│  │     distorted UV from N             │                            │
│  │     refractColor = sample FBO       │                            │
│  │                                     │                            │
│  │  5. Compute Fresnel:                │                            │
│  │     fresnel = F0 + (1-F0) *         │                            │
│  │               pow(1-NdotV, 5)       │                            │
│  │                                     │                            │
│  │  6. Mix: color = mix(refract,       │                            │
│  │                      reflect,       │                            │
│  │                      fresnel)       │                            │
│  │                                     │                            │
│  │  7. Add specular highlight          │                            │
│  │     (Blinn-Phong or PBR)            │                            │
│  │                                     │                            │
│  │  8. Add depth-based tinting         │                            │
│  │     (deeper = darker/more blue)     │                            │
│  │                                     │                            │
│  │  9. Output final color              │                            │
│  └─────────────────────────────────────┘                            │
│                                                                     │
│  UNIFORMS FEEDING THE SHADER:                                       │
│  ├── uTime (animation)                                              │
│  ├── uEnvMap / uReflectionMap (cubemap or planar FBO texture)       │
│  ├── uRefractionMap (below-water scene FBO texture)                 │
│  ├── uDepthMap (scene depth for depth-based effects)                │
│  ├── uNormalMap (optional, for detail waves)                        │
│  ├── uWaterColor (deep water tint)                                  │
│  ├── uLightPosition, uLightColor                                   │
│  ├── uWaveParams (amplitude, frequency, speed)                      │
│  └── cameraPosition, matrices                                       │
└─────────────────────────────────────────────────────────────────────┘
```

### The Multi-Pass Render Loop

The water shader requires **multiple render passes** — this connects directly to your framebuffer and multi-pass knowledge:

```
Frame N:
┌──────────────────────────────────────────────────────┐
│ Pass 1: Render scene from MIRRORED camera → FBO-Reflection    │
│         (everything above water, reflected across the plane)   │
│                                                                │
│ Pass 2: Render scene below water → FBO-Refraction              │
│         (the underwater view, possibly with clip plane)        │
│                                                                │
│ Pass 3: Render scene + water to SCREEN                         │
│         Water shader samples FBO-Reflection + FBO-Refraction   │
│         Other objects render with their own materials           │
└──────────────────────────────────────────────────────┘
```

This is why the WebGL fundamentals exercise had you build multi-pass rendering first — it's a prerequisite for effects like water.

---

## Part 9: Depth-Based Effects — Water Edges and Fog

Real water isn't a uniform color. Shallow areas near the shore are clearer; deep areas are darker and more opaque. This requires **reading the depth buffer**.

### How Depth Works in a Shader

Every pixel has a depth value (how far it is from the camera). By rendering the scene's depth into a texture and passing it to the water shader, you can compare the water surface depth with the scene depth behind it:

```glsl
uniform sampler2D uDepthMap;
uniform float uNear;
uniform float uFar;

// Convert from depth buffer value to linear distance
float linearizeDepth(float depth) {
    float z = depth * 2.0 - 1.0; // back to NDC
    return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear));
}

void main() {
    // Depth of the scene behind the water
    float sceneDepth = linearizeDepth(texture2D(uDepthMap, screenUV).r);

    // Depth of the water surface itself
    float waterDepth = linearizeDepth(gl_FragCoord.z);

    // How deep is the water at this pixel?
    float depth = sceneDepth - waterDepth;

    // Use depth for visual effects:
    // 1. Edge foam (where depth ≈ 0, water meets geometry)
    float foam = 1.0 - smoothstep(0.0, 0.5, depth);

    // 2. Depth tinting (deeper = more tinted)
    vec3 shallowColor = vec3(0.0, 0.8, 0.7);
    vec3 deepColor = vec3(0.0, 0.1, 0.3);
    vec3 waterTint = mix(shallowColor, deepColor, smoothstep(0.0, 10.0, depth));

    // 3. Refraction strength (less distortion in shallow water)
    float refractionStr = smoothstep(0.0, 3.0, depth) * 0.05;
}
```

The `smoothstep` function is your best friend here — it creates smooth transitions between values, avoiding hard edges.

---

## Part 10: GLSL Techniques You'll Use Constantly

### `smoothstep` — Smooth Transitions

```glsl
// smoothstep(edge0, edge1, x)
// Returns 0.0 when x <= edge0
// Returns 1.0 when x >= edge1
// Smooth interpolation between

float t = smoothstep(0.0, 1.0, distance);
// Commonly used for: fog, depth tinting, edge softening, material blending
```

### `mix` — Blending Between Values

```glsl
// mix(a, b, t) = a * (1-t) + b * t
vec3 color = mix(colorA, colorB, fresnel);
// This is how you blend reflection/refraction, or any two values
```

### `clamp` — Keeping Values in Range

```glsl
float value = clamp(input, 0.0, 1.0);
// Prevents values from going below 0 or above 1
// Often combined: clamp(dot(N, L), 0.0, 1.0)
```

### `fract` — Repeating Patterns

```glsl
float pattern = fract(uv.x * 10.0 + time);
// Returns the fractional part — creates repeating 0-1 waves
// Useful for scrolling textures, tiling effects
```

### Screen-Space UV Calculation

Many effects (reflection, refraction, depth) need the fragment's position in screen space as a UV coordinate:

```glsl
// In vertex shader:
varying vec4 vClipPos;
void main() {
    vClipPos = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = vClipPos;
}

// In fragment shader:
vec2 screenUV = (vClipPos.xy / vClipPos.w) * 0.5 + 0.5;
// Now screenUV is (0,0) at bottom-left of screen, (1,1) at top-right
// Use this to sample FBO textures at the right screen position
```

---

## Part 11: How Three.js Connects to All of This

| What you need | Three.js wrapper | What it does under the hood |
|---------------|-------------------|---------------------------|
| Custom vertex + fragment shaders | `ShaderMaterial` / `RawShaderMaterial` | Compiles and links GLSL, manages uniforms |
| Cubemap for reflections | `CubeTextureLoader` + `scene.environment` | Loads 6 images into `GL_TEXTURE_CUBE_MAP` |
| Render-to-texture for reflection/refraction | `WebGLRenderTarget` | Creates FBO with attached color texture |
| Depth texture | `WebGLRenderTarget({ depthTexture: new DepthTexture() })` | Attaches depth texture to FBO |
| Clipping planes (render only above/below water) | `renderer.clippingPlanes = [plane]` | Sets `gl_ClipDistance` or discards fragments |
| Animated wave geometry | Update `PlaneGeometry` vertex positions or use vertex shader displacement | Writes to vertex buffer or GPU-side vertex displacement |
| Per-frame uniform updates | `material.uniforms.uTime.value = ...` | Calls `gl.uniform*` before each draw |
| Normal map texture | `TextureLoader` + set wrapping to `RepeatWrapping` | `texImage2D` + `texParameteri` for repeat |

---

## Part 12: Glossary of Connections

The "what connects to what" reference for this exercise:

- **Vectors (N, L, V, R, H) → Lighting models:** Every lighting model is built from dot products of these five vectors.
- **Lambert → Blinn-Phong → PBR:** Progressive refinement of the same question: "how does light interact with this surface?"
- **Fresnel → Reflection/Refraction mix:** The Fresnel value determines how much reflection vs. refraction to show. This is what makes water, glass, and car paint look real.
- **Cubemap → reflect() → Reflection color:** The reflection vector samples the environment map to get the reflected color.
- **Normal map → Surface normal N:** Animated normal maps create dynamic wave normals without extra geometry. Every downstream calculation (Fresnel, reflection, refraction, specular) uses this modified N.
- **Framebuffers → Reflection/Refraction textures:** You render the scene from different viewpoints into FBOs, then sample those FBOs in the water shader. This is multi-pass rendering applied.
- **Depth buffer → Edge effects:** Comparing water depth with scene depth enables foam, depth tinting, and variable refraction strength.
- **Vertex shader displacement → Fragment shader normals:** Gerstner waves move vertices in the vertex shader; the fragment shader needs corresponding normals for lighting. These two must agree.
- **Screen-space UVs → FBO sampling:** To read the reflection/refraction FBO at the right pixel, you convert the fragment's clip-space position to screen-space UVs.
- **WebGL Fundamentals PoC → This PoC:** Everything you built there — buffers, attributes, varyings, uniforms, FBOs, multi-pass rendering, texture sampling — is the foundation. This PoC layers *advanced shader math* on top of that pipeline.
