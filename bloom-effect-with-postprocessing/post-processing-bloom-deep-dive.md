# Post-Processing Effects & Bloom — Deep Dive

---

## The Big Question: What Is Post-Processing?

Everything you've built so far — terrain, water, lighting — happens **during rendering**. The vertex shader moves vertices, the fragment shader paints pixels, and the result goes to the screen. Post-processing is fundamentally different. It happens **after rendering is complete**. The 3D scene is already a flat 2D image sitting in a framebuffer. Post-processing treats that image like a photograph and manipulates it — adjusting colors, blurring regions, making bright areas glow.

This is a critical mental shift:

```
DURING RENDERING (what you've been doing):
  You work with 3D data — vertices, normals, light directions, world positions.
  The GPU knows about depth, geometry, materials.

AFTER RENDERING (post-processing):
  The 3D world is gone. You have a 2D image — a grid of RGBA pixels.
  The GPU has no idea what was a cube or a sphere. It just sees colors.
  You manipulate those colors with image-processing math.
```

**The analogy:** Think of it like a film photographer. Phase 1 is taking the photograph — setting up the scene, choosing the angle, getting the exposure right. That's your 3D rendering pass. Phase 2 is the darkroom — you take the developed print and manipulate it. Dodge, burn, add filters, create double exposures. The camera is gone. You're just working with the image. Post-processing is the digital darkroom.

---

## Why Post-Processing Exists at All

You might wonder — why not just make the fragment shader do everything? Why render to a texture and then process it separately?

Three reasons:

**1. Some effects need the whole image at once.** A blur effect at pixel (500, 300) needs to read the colors of neighboring pixels — (499, 300), (501, 300), (500, 299), etc. During normal rendering, the fragment shader processes each pixel in isolation. It has no idea what color its neighbors are. It only has access to the interpolated `varying` values for its own triangle. Post-processing solves this by turning the rendered scene into a texture. Now the fragment shader can `texture2D()` at any UV coordinate — reading any pixel in the image.

**2. Some effects depend on the combined result.** Bloom needs to know which pixels in the *final composited image* are bright. That includes contributions from every object, every light, every material. You can't compute that per-object during the geometry pass — you need the finished frame.

**3. Performance and modularity.** Post-processing effects are cheap because they only process a 2D image (width × height pixels), not full 3D geometry with depth testing, matrix transforms, and lighting math. And they're modular — you can stack blur, then color grading, then bloom, each as a separate pass, without touching the scene rendering code at all.

---

## The Connection to What You Already Know

Here's the key insight: **you've already built post-processing.** In the WebGL fundamentals PoC, you did this:

```
PASS 1: Render 3D scene → WebGLRenderTarget (FBO)
PASS 2: Full-screen quad reads FBO texture → applies effect → screen
```

That IS post-processing. The EffectComposer, ShaderPass, and RenderPass that Three.js provides are just an organized way to manage multiple passes chained together. Under the hood, they're doing exactly what you did manually — creating render targets, rendering full-screen quads, swapping textures between passes.

The new learning here isn't the pipeline — it's the **effects themselves** and the **math inside the shaders**.

---

## How Bloom Works — The Physics First

Before any code, understand what bloom is simulating.

When a very bright light source hits a real camera lens, the light doesn't stay perfectly contained within its pixel boundaries. It **scatters**. This happens because of diffraction in the lens elements, imperfections in the glass, and sensor/film overflow where one element bleeds into its neighbors. The result is a soft glow around bright areas — the street lamp that seems to radiate light beyond its physical edge, the sun creating a haze around itself.

Your eyes do the same thing. Squint at a bright light and you see streaks and halos. That's optical bloom.

A computer monitor can't produce light bright enough to trigger this optical effect naturally. So bloom fakes it by **adding a soft, blurred copy of the bright areas back on top of the original image**. It's a perceptual trick — the glow makes the brain interpret certain pixels as "brighter than the screen can actually display."

```
WHAT BLOOM SIMULATES:

Real Camera:
  ┌──────────────────┐
  │  Bright light     │
  │  enters lens  ──→ │ Scattering in glass ──→ Glow on film/sensor
  │                   │
  └──────────────────┘

Digital Bloom:
  ┌──────────────────┐
  │  Rendered image   │
  │  with bright  ──→ │ Extract brights ──→ Blur them ──→ Add back on top
  │  pixels           │
  └──────────────────┘
```

---

## The Bloom Algorithm — Step by Step

Bloom is always a three-stage process:

### Stage 1: Brightness Extraction (Threshold Pass)

Look at every pixel in the rendered image. Ask: "Is this pixel bright enough to bloom?" If yes, keep it. If no, set it to black.

```glsl
// The threshold test
vec4 color = texture2D(tDiffuse, vUv);
float brightness = dot(color.rgb, vec3(0.2126, 0.7152, 0.0722));
//                                     ↑ luminance weights (how the human eye perceives brightness)
//                                       Green contributes most, blue least

if (brightness > uThreshold) {
  gl_FragColor = color;   // keep this pixel — it's bright enough
} else {
  gl_FragColor = vec4(0.0);  // black — this pixel won't bloom
}
```

The `dot(color.rgb, vec3(0.2126, 0.7152, 0.0722))` isn't arbitrary. These are the **ITU-R BT.709 luminance coefficients** — they model how the human eye perceives brightness. Green receptors are most sensitive, then red, then blue. So a pure green pixel appears brighter to you than a pure blue pixel of the same RGB intensity.

The **threshold** value controls which pixels bloom. A threshold of `0.8` means only very bright pixels (80%+ luminance) will glow. Lower threshold = more glow everywhere. Higher = only the hottest spots.

After this pass, you have a texture that's mostly black with the bright regions preserved:

```
Original image:          After threshold extraction:
┌──────────────────┐     ┌──────────────────┐
│  ░░░░░░░░░░░░░░  │     │  ░░░░░░░░░░░░░░  │
│  ░░░░████░░░░░░  │     │  ░░░░████░░░░░░  │
│  ░░░░████░░░░░░  │ ──→ │  ░░░░████░░░░░░  │
│  ░░░░░░░░░░░░░░  │     │  ░░░░░░░░░░░░░░  │
│  ░░░░░░░░░░░░░░  │     │  ░░░░░░░░░░░░░░  │
└──────────────────┘     └──────────────────┘
 (full scene with         (only bright spots,
  everything in it)        everything else black)
```

### Stage 2: Gaussian Blur (The Glow Generator)

Now you blur the bright pixels. This is what creates the "glow" — bright pixels spread their color outward into the surrounding black area.

But here's where it gets interesting. A naive blur samples a square grid around each pixel:

```
Naive 2D blur (9x9 kernel):
For EACH pixel, sample 81 neighbors (9 × 9 grid)
At 1920×1080, that's: 1,920 × 1,080 × 81 = ~167 MILLION texture reads per frame
```

That's too expensive. The solution is the **separable filter optimization** — one of the most important techniques in real-time graphics.

#### The Separable Filter — Why Two 1D Blurs Equal One 2D Blur

A Gaussian blur has a mathematical property: it's **separable**. This means a 2D Gaussian kernel can be decomposed into two 1D passes — one horizontal, one vertical — and the result is identical.

```
2D blur (expensive):               Two 1D blurs (cheap, same result):
                                    
┌─────────────┐                     PASS A: Horizontal blur
│ ● ● ● ● ● │                      ┌─────────────┐
│ ● ● ● ● ● │  9 × 9 = 81         │ ● ● ● ● ● │  → Each pixel samples
│ ● ● ◉ ● ● │  samples per         │             │    9 horizontal neighbors
│ ● ● ● ● ● │  pixel               │      ◉      │    = 9 samples
│ ● ● ● ● ● │                      │             │
└─────────────┘                     │             │
                                    └─────────────┘
                                    
                                    PASS B: Vertical blur
                                    ┌─────────────┐
                                    │      ●      │  → Each pixel samples
                                    │      ●      │    9 vertical neighbors
                                    │      ◉      │    = 9 samples
                                    │      ●      │
                                    │      ●      │
                                    └─────────────┘
                                    
                                    Total: 9 + 9 = 18 samples per pixel
                                    (vs 81 for the 2D version)
```

**Why this works mathematically:** The 2D Gaussian function `G(x, y) = e^(-(x²+y²)/2σ²)` factors into `G(x) × G(y) = e^(-x²/2σ²) × e^(-y²/2σ²)`. Convolution with a product kernel is equivalent to two sequential convolutions with each factor. This isn't an approximation — it's mathematically exact.

**What this means for framebuffers:** You need TWO intermediate render targets for the blur:

```
Bright texture ──→ [Horizontal blur FBO] ──→ [Vertical blur FBO] ──→ Blurred result

FBO-A gets the horizontally blurred image
FBO-B gets the fully blurred image (horizontal + vertical)
```

This is exactly the multi-pass FBO chain from your WebGL PoC, but now with a specific purpose.

#### The Gaussian Blur Shader

```glsl
// Horizontal blur pass (vertical is identical but swaps the offset direction)
uniform sampler2D tDiffuse;
uniform vec2 uDirection;   // vec2(1.0, 0.0) for horizontal, vec2(0.0, 1.0) for vertical
uniform vec2 uResolution;
varying vec2 vUv;

void main() {
  vec2 texelSize = 1.0 / uResolution;  // size of one pixel in UV space
  vec4 result = vec4(0.0);
  
  // Gaussian weights for a 9-tap kernel
  // These are pre-computed from the Gaussian function
  float weights[5];
  weights[0] = 0.227027;  // center pixel (strongest)
  weights[1] = 0.1945946; // ±1 pixel
  weights[2] = 0.1216216; // ±2 pixels
  weights[3] = 0.054054;  // ±3 pixels
  weights[4] = 0.016216;  // ±4 pixels (weakest)
  
  // Center pixel
  result += texture2D(tDiffuse, vUv) * weights[0];
  
  // Symmetric samples on both sides
  for (int i = 1; i < 5; i++) {
    vec2 offset = uDirection * texelSize * float(i);
    result += texture2D(tDiffuse, vUv + offset) * weights[i];
    result += texture2D(tDiffuse, vUv - offset) * weights[i];
  }
  
  gl_FragColor = result;
}
```

**Why the weights matter:** The Gaussian weights ensure pixels close to the center contribute more than distant pixels. This creates a smooth, natural-looking blur rather than a flat "box blur" that looks artificial. The weights sum to 1.0 (0.227027 + 2×0.1945946 + 2×0.1216216 + 2×0.054054 + 2×0.016216 ≈ 1.0), which preserves the overall brightness.

#### Making the Blur Wider — Iterative Blurring

A 9-tap kernel only blurs about 4 pixels in each direction. For a wide, cinematic bloom you need a much larger radius. Two approaches:

**Approach A — Multiple blur iterations:** Run the horizontal+vertical blur multiple times, each time reading the previous blur's output. Each iteration effectively doubles the radius.

```
Bright → H-blur → V-blur → H-blur → V-blur → H-blur → V-blur → Wide bloom
          ↑ iteration 1 ↑   ↑ iteration 2 ↑   ↑ iteration 3 ↑
```

**Approach B — Downsampled blurring (the production technique):** Render the bright extraction at half resolution. Blur it at half-res (cheaper — 4× fewer pixels). Then upscale back. You can even cascade: full → half → quarter → eighth, blur at each level, and blend them back together. This is how Unreal Engine and Unity implement bloom.

```
Full res  → Half res  → Quarter res → Blur → Upscale → Upscale → Combine
(1920×1080)  (960×540)   (480×270)                       with original
```

For this PoC, you'll use Approach A (iterative blurring at full resolution). It's simpler and teaches the multi-pass concept clearly without adding resolution management complexity.

### Stage 3: Additive Compositing (The Final Combine)

Now you have two textures:

1. **The original rendered scene** (full detail, full color)
2. **The blurred bright areas** (soft glow, mostly black with bloom halos)

The final pass adds them together:

```glsl
uniform sampler2D tOriginal;   // the full scene render
uniform sampler2D tBloom;      // the blurred bright areas
uniform float uBloomStrength;  // how intense the glow is (0.0 = off, 1.0 = full)
varying vec2 vUv;

void main() {
  vec4 original = texture2D(tOriginal, vUv);
  vec4 bloom = texture2D(tBloom, vUv);
  
  gl_FragColor = original + bloom * uBloomStrength;
  //             ↑ base image    ↑ glow layered on top
}
```

**Why additive blending works:** Adding the bloom on top makes bright areas even brighter (the glow adds to the already-bright pixels) while dark areas (where the bloom texture is black/near-black) stay unchanged. This is physically similar to what happens in a real lens — scattered light adds to the existing image, it doesn't replace it.

**The `uBloomStrength` uniform** is what you'll wire to a slider in the UI. At `0.0`, there's no bloom. At `1.0`, the full blur is added. Values above `1.0` create an exaggerated, dreamy look. This is the kind of real-time parameter tweaking that makes the learning stick.

---

## The Complete Bloom Pipeline — All Passes Together

```
PASS 1: RENDER SCENE
  Input:  3D scene (meshes, lights, camera)
  Output: WebGLRenderTarget A (full scene image)
  Shader: Your normal scene shaders (whatever materials you're using)
  FBO:    renderTargetScene

         ┌─────────────┐
         │  3D Scene    │ ──→ [FBO: renderTargetScene]
         └─────────────┘

PASS 2: BRIGHTNESS EXTRACTION
  Input:  renderTargetScene.texture
  Output: WebGLRenderTarget B (only bright pixels)
  Shader: Threshold fragment shader
  FBO:    renderTargetBright

         [renderTargetScene.texture] ──→ threshold shader ──→ [FBO: renderTargetBright]

PASS 3: HORIZONTAL BLUR
  Input:  renderTargetBright.texture
  Output: WebGLRenderTarget C
  Shader: Gaussian blur with uDirection = (1.0, 0.0)
  FBO:    renderTargetBlurH

         [renderTargetBright.texture] ──→ H-blur shader ──→ [FBO: renderTargetBlurH]

PASS 4: VERTICAL BLUR
  Input:  renderTargetBlurH.texture
  Output: WebGLRenderTarget D
  Shader: Gaussian blur with uDirection = (0.0, 1.0)
  FBO:    renderTargetBlurV

         [renderTargetBlurH.texture] ──→ V-blur shader ──→ [FBO: renderTargetBlurV]

(Optional: repeat PASS 3-4 for wider bloom, ping-ponging between FBOs)

PASS 5: COMPOSITE
  Input:  renderTargetScene.texture + renderTargetBlurV.texture
  Output: Screen (null render target)
  Shader: Additive combine shader
  FBO:    null (screen)

         [renderTargetScene.texture] ──┐
                                       ├──→ composite shader ──→ SCREEN
         [renderTargetBlurV.texture] ──┘
```

**Count the FBOs:** At minimum, you need 4 render targets. The scene, the bright extraction, and two for the blur ping-pong. The composite pass renders directly to the screen (null target). This is why understanding FBOs from the WebGL PoC was prerequisite — bloom is a 4-5 pass pipeline where every pass writes to and reads from framebuffers.

---

## Three.js Abstractions — EffectComposer, RenderPass, ShaderPass

Now that you understand the raw pipeline, here's what Three.js provides to manage it.

### EffectComposer — The Pass Manager

`EffectComposer` is essentially a **linked list of render passes** with two ping-pong render targets. That's the entire abstraction. Under the hood:

```javascript
// What EffectComposer actually does internally:
class EffectComposer {
  constructor(renderer) {
    this.renderer = renderer;
    this.passes = [];
    
    // Two render targets that swap roles each pass (ping-pong)
    this.renderTarget1 = new WebGLRenderTarget(w, h);  // "read"
    this.renderTarget2 = new WebGLRenderTarget(w, h);  // "write"
  }
  
  render() {
    for (let i = 0; i < this.passes.length; i++) {
      const pass = this.passes[i];
      const isLastPass = (i === this.passes.length - 1);
      
      // Last pass renders to screen, others render to FBO
      const target = isLastPass ? null : this.renderTarget2;
      
      pass.render(this.renderer, target, this.renderTarget1);
      
      // Swap: what was "write" becomes "read" for the next pass
      [this.renderTarget1, this.renderTarget2] = [this.renderTarget2, this.renderTarget1];
    }
  }
}
```

**The ping-pong pattern:** You can't read from and write to the same texture simultaneously (the GPU would be reading pixels it's currently overwriting). So EffectComposer uses two render targets and swaps them after each pass. Pass 1 writes to RT-A while reading from RT-B. Pass 2 writes to RT-B while reading from RT-A. And so on.

```
Pass 1: read RT-B → write RT-A     (swap)
Pass 2: read RT-A → write RT-B     (swap)
Pass 3: read RT-B → write RT-A     (swap)
Pass 4: read RT-A → screen (null)
```

This is exactly what you'd have to manage manually. EffectComposer automates the swapping.

### RenderPass — "Render the 3D Scene"

```javascript
const renderPass = new RenderPass(scene, camera);
```

This is always the first pass in the chain. It does exactly one thing: calls `renderer.render(scene, camera)` into the EffectComposer's current write target. After this pass, the render target contains the full 3D scene as a 2D image.

**Under the hood, this maps to:**
```javascript
renderer.setRenderTarget(writeTarget);
renderer.render(scene, camera);
```

That's it. Same code you wrote manually in the WebGL PoC.

### ShaderPass — "Apply a Shader to the Image"

```javascript
const shaderPass = new ShaderPass(MyShaderConfig);
```

A ShaderPass reads the previous pass's output texture and renders a full-screen quad with a custom shader. The shader receives the texture as `tDiffuse` (the conventional name).

**Under the hood:**
```javascript
// ShaderPass internally creates:
// 1. A PlaneGeometry(2, 2) — the full-screen quad
// 2. An OrthographicCamera — flat projection, no perspective
// 3. A ShaderMaterial using your custom shader
// 4. A Scene containing just the quad

render(renderer, writeTarget, readTarget) {
  this.material.uniforms.tDiffuse.value = readTarget.texture;
  renderer.setRenderTarget(writeTarget);
  renderer.render(this.quadScene, this.quadCamera);
}
```

This is the EXACT full-screen quad + FBO texture pattern from the WebGL PoC. ShaderPass just wraps it in a reusable class.

### UnrealBloomPass — Three.js's Built-in Bloom

Three.js provides `UnrealBloomPass` which implements the full bloom pipeline (threshold → downsample → blur → upsample → composite) based on Unreal Engine 4's technique. For this PoC, **you'll build your own bloom from scratch using ShaderPass**, because the learning is in writing the shaders and managing the passes yourself. You can compare your result against `UnrealBloomPass` afterward.

---

## The Shader Math Reference

### Luminance Calculation

```glsl
float luminance(vec3 color) {
  return dot(color, vec3(0.2126, 0.7152, 0.0722));
}
```

These coefficients come from the CIE 1931 color space, which models human color perception. The human eye has three cone types (red, green, blue), but they're not equally sensitive. You have far more green-sensitive cones. So `(0.5, 0.5, 0.5)` gray and `(0.0, 0.7, 0.0)` green look equally bright to you, even though their RGB values are very different.

### Soft Threshold (Better than Hard Cutoff)

A hard `if/else` threshold creates visible edges where the bloom cuts off. A smooth transition looks more natural:

```glsl
float softThreshold(float brightness, float threshold, float knee) {
  float soft = brightness - threshold + knee;
  soft = clamp(soft, 0.0, 2.0 * knee);
  soft = soft * soft / (4.0 * knee + 0.00001);
  return max(soft, brightness - threshold) / max(brightness, 0.00001);
}
```

This creates a gradual ramp instead of a hard edge. The `knee` parameter controls how gradual. Think of it like the difference between a light switch (hard threshold) and a dimmer (soft threshold).

### Gaussian Weights

The weights for the blur kernel are pre-computed from the Gaussian function:

```
G(x) = (1 / √(2πσ²)) × e^(-x² / 2σ²)

For σ = 1.0:
  x=0: G(0) = 0.3989  (center, strongest)
  x=1: G(1) = 0.2420
  x=2: G(2) = 0.0540
  x=3: G(3) = 0.0044  (edges, weakest)
```

You normalize these so they sum to 1.0 (so the blur doesn't change overall brightness). The exact values depend on your kernel size and desired sigma. Wider sigma = softer blur.

---

## How This Connects to Everything Before

| Previous Concept | How It Appears in Bloom |
|---|---|
| **Framebuffer Objects** (WebGL PoC) | You need 4+ FBOs for the bloom pipeline. Each pass writes to one and reads from another. |
| **Render-to-texture** (WebGL PoC) | Every pass except the last renders to a texture, not the screen. |
| **Full-screen quad** (WebGL PoC) | Every post-processing pass renders a quad that covers the viewport. |
| **Texture sampling** (WebGL PoC) | The blur shader samples neighboring pixels. The composite shader samples two textures. |
| **Uniforms** (all PoCs) | Threshold, strength, direction, resolution — all controlled via uniforms from JS. |
| **`varying` interpolation** | The `vUv` varying in the full-screen quad gives you the 0→1 UV coordinates for sampling. |
| **Multi-pass rendering** (WebGL PoC Step 9) | Bloom is a 5-pass chain. You already built a 3-pass chain. Same concept, more passes. |
| **Dot products** (GLSL/water PoC) | Luminance calculation is `dot(color, weights)` — same operation used in lighting. |
| **`smoothstep`/`mix`** (terrain/water PoC) | Soft threshold and blend operations use the same smooth interpolation patterns. |

---

## What You'll Build

A React + Three.js application that renders an emissive scene (objects that are intentionally bright enough to trigger bloom), processes it through a custom multi-pass bloom pipeline you write from scratch, and provides a control panel to adjust threshold, blur intensity, bloom strength, and blur iterations in real time. Every pass will be inspectable through a debug panel showing the intermediate FBO textures.

The scene will include bright emissive objects against a darker background so the bloom effect is clearly visible — think glowing spheres, neon-style materials, or emissive ring geometries floating in a dimly lit environment.
