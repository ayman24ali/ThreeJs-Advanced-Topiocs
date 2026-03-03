# Post-Processing Bloom Effect — Implementation Flow

## Project Overview

A React app that uses Three.js to render a scene with emissive light sources, then applies a **custom multi-pass bloom pipeline** built entirely from scratch using `ShaderPass` and `RenderPass`. No `UnrealBloomPass` — you write every shader and wire every framebuffer yourself. A debug panel shows each intermediate pass as a live texture, and a controls panel lets you tweak every bloom parameter in real time.

This exercise teaches: multi-pass post-processing architecture, Gaussian blur implementation, brightness extraction, framebuffer ping-ponging, the EffectComposer abstraction, and how production post-processing pipelines are structured.

---

## Tech Stack

- **React 18+ with Vite** — application shell and hot reloading
- **Three.js (raw)** — no React Three Fiber. You manage the renderer, scene, camera, and animation loop manually inside `useEffect`.
- **Three.js post-processing addons** — `EffectComposer`, `RenderPass`, `ShaderPass` from `three/addons/postprocessing/`. These provide the pass management infrastructure, but you write ALL custom shaders yourself.
- **GLSL (inline shader strings)** — every post-processing shader is hand-written. No pre-built effect shaders.
- **Leva** — real-time parameter control for bloom threshold, strength, blur iterations, and kernel size.

**Why use EffectComposer instead of fully manual FBOs?** You already proved you can manage FBOs manually in the WebGL PoC. EffectComposer automates the ping-pong swapping and pass ordering — the logistics — so you can focus on the new learning: the bloom algorithm and shader math. But you'll understand exactly what EffectComposer does underneath because you've built the manual version.

**Why NOT use `UnrealBloomPass`?** It's a black box. It implements bloom for you, but you learn nothing about how bloom actually works. You'll build your own, then optionally compare against `UnrealBloomPass` at the end.

---

## File Structure

```
src/
├── App.jsx                        # Layout: canvas + debug panel + controls
├── main.jsx                       # Entry point
│
├── scene/
│   ├── SceneManager.js            # Core: renderer, scene, camera, animation loop
│   ├── EmissiveScene.js           # Creates the 3D scene with glowing objects
│   └── BloomPipeline.js           # Manages the EffectComposer and all bloom passes
│
├── shaders/
│   ├── fullscreen.vert.js         # Shared vertex shader for all post-processing passes
│   ├── threshold.frag.js          # Pass 2: brightness extraction
│   ├── gaussianBlur.frag.js       # Pass 3-4: separable Gaussian blur
│   ├── composite.frag.js          # Pass 5: additive combine
│   └── debug.frag.js              # Debug: visualize individual pass outputs
│
├── components/
│   ├── Canvas.jsx                 # The <canvas> element + mounts SceneManager
│   ├── ControlsPanel.jsx          # Leva controls for bloom parameters
│   └── DebugPanel.jsx             # Shows intermediate FBO textures as thumbnails
│
└── hooks/
    └── useBloomControls.js        # Leva hook for bloom parameters
```

---

## Build Flow — Step by Step

Each step builds on the previous one. Each produces a visible, testable result.

---

### STEP 1: React Shell + Three.js Lifecycle

**What you're building:**
A React app with a fullscreen `<canvas>` element, a Three.js renderer, a PerspectiveCamera, an OrbitControls instance, and a running animation loop. Just a black canvas with camera orbit.

**What you'll learn:**
The manual Three.js lifecycle in React — initialization in `useEffect`, cleanup on unmount, resize handling.

**Tasks:**

1. Scaffold with Vite: `npm create vite@latest bloom-postfx -- --template react`
2. Install deps: `npm install three leva`
3. Create `SceneManager.js`:
   ```javascript
   export class SceneManager {
     constructor(canvas) {
       this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
       this.renderer.setPixelRatio(window.devicePixelRatio);
       this.renderer.setSize(window.innerWidth, window.innerHeight);
       this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
       this.renderer.toneMappingExposure = 1.0;
       
       this.scene = new THREE.Scene();
       this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
       this.camera.position.set(0, 3, 8);
       
       this.clock = new THREE.Clock();
     }
     
     start() { this._animate(); }
     _animate() {
       this._rafId = requestAnimationFrame(() => this._animate());
       this.renderer.render(this.scene, this.camera);
     }
     dispose() {
       cancelAnimationFrame(this._rafId);
       this.renderer.dispose();
     }
   }
   ```

4. Mount in `Canvas.jsx` via `useEffect` with cleanup.

**Checkpoint:** Black canvas renders. Camera orbit works. Console shows no errors. Resizing works.

**What connects to the next step:**
You need objects in the scene that are bright enough to trigger bloom. That means emissive materials with HDR-range colors (values above 1.0).

---

### STEP 2: Emissive Scene — Objects That Glow

**What you're building:**
A scene with intentionally bright objects against a dark background. These are the "light sources" that will trigger the bloom.

**What you'll learn:**
How emissive materials work in Three.js, why HDR color values (above 1.0) matter for bloom, and how `ACESFilmicToneMapping` compresses HDR into displayable range.

**Tasks:**

1. Create `EmissiveScene.js` that builds the scene:
   ```javascript
   export function createEmissiveScene(scene) {
     // Dark environment
     scene.background = new THREE.Color(0x050510);
     
     // Ground plane — dark, non-emissive
     const ground = new THREE.Mesh(
       new THREE.PlaneGeometry(20, 20),
       new THREE.MeshStandardMaterial({ color: 0x111122 })
     );
     ground.rotation.x = -Math.PI / 2;
     scene.add(ground);
     
     // Glowing sphere — emissive intensity ABOVE 1.0 (HDR)
     const glowSphere = new THREE.Mesh(
       new THREE.SphereGeometry(0.5, 32, 32),
       new THREE.MeshStandardMaterial({
         color: 0x000000,
         emissive: new THREE.Color(2.0, 0.5, 0.0),  // orange, intensity > 1.0
         emissiveIntensity: 3.0,                      // this pushes it into HDR range
       })
     );
     glowSphere.position.set(0, 1.5, 0);
     scene.add(glowSphere);
     
     // Add more emissive objects: torus, ring, smaller spheres
     // Use different colors: cyan, magenta, white
     // Vary emissiveIntensity from 1.5 to 5.0
     
     // Dim ambient light so non-emissive objects are visible but dark
     scene.add(new THREE.AmbientLight(0x222244, 0.5));
     
     return { glowSphere /* ...other objects for animation */ };
   }
   ```

2. Why `emissiveIntensity > 1.0` matters:
   - The bloom threshold checks luminance. Standard materials max out at 1.0.
   - Emissive materials with intensity above 1.0 create values in the framebuffer that are **brighter than white** — this is the HDR data that the threshold pass will extract.
   - `ACESFilmicToneMapping` on the renderer compresses these HDR values so they display on your monitor, but the raw framebuffer still has the high values.

3. Add gentle animation — rotate the torus, bob the spheres up and down with `Math.sin(time)`.

**Checkpoint:** You see glowing colored objects against a dark background. They look bright due to tone mapping, but there's no bloom glow yet — just flat bright surfaces.

**What connects to the next step:**
The scene renders to the screen. You need to intercept that render and send it to a framebuffer instead, so the post-processing pipeline can read it. That's what EffectComposer + RenderPass does.

---

### STEP 3: EffectComposer + RenderPass — Intercepting the Render

**What you're building:**
Replace the direct `renderer.render(scene, camera)` with an EffectComposer that renders the scene to an FBO.

**What you'll learn:**
How EffectComposer manages render targets, the ping-pong pattern, and what `RenderPass` actually does under the hood.

**Tasks:**

1. Import and set up:
   ```javascript
   import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
   import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
   
   // In SceneManager or BloomPipeline:
   this.composer = new EffectComposer(this.renderer);
   
   const renderPass = new RenderPass(this.scene, this.camera);
   this.composer.addPass(renderPass);
   ```

2. Replace `renderer.render(scene, camera)` with `composer.render()` in the animation loop.

3. **Verify it works:** The scene should look identical. EffectComposer is now rendering to an FBO and then copying to the screen. You've added a render target in the middle, but with no effects, the output is the same.

4. **Inspect what happened:**
   ```javascript
   const gl = this.renderer.getContext();
   console.log('EffectComposer render targets:', this.composer.renderTarget1, this.composer.renderTarget2);
   // Both are WebGLRenderTarget instances — the ping-pong pair
   ```

**Checkpoint:** Scene looks identical to Step 2, but it's now flowing through EffectComposer. You've confirmed the FBO pipeline is working.

**What connects to the next step:**
Now you have the scene in a framebuffer texture. The next pass reads that texture and extracts only the bright pixels.

---

### STEP 4: Brightness Threshold Pass — Extracting the Glow

**What you're building:**
A custom ShaderPass that reads the scene texture and outputs only the pixels bright enough to bloom. Everything else becomes black.

**What you'll learn:**
Writing a custom ShaderPass, the luminance calculation, threshold extraction, and how `tDiffuse` is the conventional uniform name for the previous pass's texture.

**Tasks:**

1. Write the full-screen vertex shader (`fullscreen.vert.js`):
   ```javascript
   export const fullscreenVertexShader = `
     varying vec2 vUv;
     void main() {
       vUv = uv;
       gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
     }
   `;
   ```
   Note: `ShaderPass` (not `RawShaderMaterial`) auto-injects `projectionMatrix` and `modelViewMatrix`. This is fine here because EffectComposer manages the quad internally.

2. Write the threshold fragment shader (`threshold.frag.js`):
   ```javascript
   export const thresholdFragmentShader = `
     uniform sampler2D tDiffuse;
     uniform float uThreshold;
     uniform float uKnee;
     varying vec2 vUv;
     
     float luminance(vec3 color) {
       return dot(color, vec3(0.2126, 0.7152, 0.0722));
     }
     
     void main() {
       vec4 color = texture2D(tDiffuse, vUv);
       float lum = luminance(color.rgb);
       
       // Soft threshold — smooth transition instead of hard cutoff
       float contribution = smoothstep(uThreshold - uKnee, uThreshold + uKnee, lum);
       
       gl_FragColor = color * contribution;
     }
   `;
   ```

3. Create the ShaderPass:
   ```javascript
   import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
   
   const ThresholdShader = {
     uniforms: {
       tDiffuse: { value: null },       // EffectComposer auto-fills this
       uThreshold: { value: 0.8 },
       uKnee: { value: 0.1 },
     },
     vertexShader: fullscreenVertexShader,
     fragmentShader: thresholdFragmentShader,
   };
   
   this.thresholdPass = new ShaderPass(ThresholdShader);
   this.composer.addPass(this.thresholdPass);
   ```

4. **Temporarily make this the last pass** so you can see its output directly on screen. You should see a mostly black screen with the bright emissive objects visible.

**Checkpoint:** The screen shows only the bright parts of the scene. Dark areas are black. The emissive objects appear isolated. Adjusting `uThreshold` via a Leva slider changes which pixels survive.

**What connects to the next step:**
The bright pixels need to be blurred to create the glow. That's the Gaussian blur pass — and it requires the separable filter trick.

---

### STEP 5: Gaussian Blur — Creating the Glow

**What you're building:**
A two-pass blur (horizontal then vertical) that transforms the sharp bright pixels into a soft glow.

**What you'll learn:**
The separable Gaussian blur technique, how the `uDirection` uniform switches between horizontal and vertical, and why you need two separate ShaderPasses for one blur operation.

**This is the hardest step** because you need to manage the blur direction between passes and optionally iterate the blur multiple times. Take it in pieces.

**Tasks:**

1. Write the Gaussian blur shader (`gaussianBlur.frag.js`):
   ```javascript
   export const gaussianBlurFragmentShader = `
     uniform sampler2D tDiffuse;
     uniform vec2 uDirection;    // (1,0) for horizontal, (0,1) for vertical
     uniform vec2 uResolution;
     varying vec2 vUv;
     
     void main() {
       vec2 texelSize = 1.0 / uResolution;
       vec4 result = vec4(0.0);
       
       // 9-tap Gaussian kernel weights
       float weights[5];
       weights[0] = 0.227027;
       weights[1] = 0.1945946;
       weights[2] = 0.1216216;
       weights[3] = 0.054054;
       weights[4] = 0.016216;
       
       // Center sample
       result += texture2D(tDiffuse, vUv) * weights[0];
       
       // Symmetric samples
       for (int i = 1; i < 5; i++) {
         vec2 offset = uDirection * texelSize * float(i);
         result += texture2D(tDiffuse, vUv + offset) * weights[i];
         result += texture2D(tDiffuse, vUv - offset) * weights[i];
       }
       
       gl_FragColor = result;
     }
   `;
   ```

2. Create TWO ShaderPasses — one for each direction:
   ```javascript
   const BlurShaderH = {
     uniforms: {
       tDiffuse: { value: null },
       uDirection: { value: new THREE.Vector2(1.0, 0.0) },  // horizontal
       uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
     },
     vertexShader: fullscreenVertexShader,
     fragmentShader: gaussianBlurFragmentShader,
   };
   
   const BlurShaderV = {
     uniforms: {
       tDiffuse: { value: null },
       uDirection: { value: new THREE.Vector2(0.0, 1.0) },  // vertical
       uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
     },
     vertexShader: fullscreenVertexShader,
     fragmentShader: gaussianBlurFragmentShader,
   };
   
   this.blurPassH = new ShaderPass(BlurShaderH);
   this.blurPassV = new ShaderPass(BlurShaderV);
   ```

3. Add both passes to the composer after the threshold pass:
   ```javascript
   this.composer.addPass(this.thresholdPass);
   this.composer.addPass(this.blurPassH);
   this.composer.addPass(this.blurPassV);
   ```

4. **Key problem — iterative blur:** A single H+V pass gives a small blur radius. For a wider glow, you need to repeat. But EffectComposer processes passes linearly — you can't loop inside it. Two approaches:

   **Approach A (simpler):** Add multiple H+V pass pairs to the composer:
   ```javascript
   for (let i = 0; i < blurIterations; i++) {
     this.composer.addPass(createBlurPassH());
     this.composer.addPass(createBlurPassV());
   }
   ```

   **Approach B (manual, more control):** Manage separate render targets outside the composer, manually rendering blur passes in a loop. This is closer to how production engines do it, but adds complexity. Start with Approach A.

5. Update `uResolution` on window resize.

**Checkpoint:** The bright areas from Step 4 are now a soft, glowing blur. Increasing blur iterations makes the glow wider. The rest of the screen is still black.

**What connects to the next step:**
You have two images — the original scene (from the RenderPass) and the blurred bloom (from the blur passes). The next step combines them.

---

### STEP 6: Composite Pass — Combining Scene + Bloom

**What you're building:**
A final ShaderPass that takes the original scene render and the blurred bloom, and adds them together.

**What you'll learn:**
Additive blending for glow effects, how to pass multiple textures to a ShaderPass, and the `renderToScreen` flag.

**The challenge here:** EffectComposer's standard pipeline passes each output to the next pass's `tDiffuse`. But the composite pass needs TWO inputs — the original scene and the bloom blur. You need to manually hold a reference to the scene texture.

**Tasks:**

1. Write the composite shader (`composite.frag.js`):
   ```javascript
   export const compositeFragmentShader = `
     uniform sampler2D tDiffuse;      // blurred bloom from the previous pass
     uniform sampler2D tOriginal;     // the original scene render
     uniform float uBloomStrength;
     varying vec2 vUv;
     
     void main() {
       vec4 original = texture2D(tOriginal, vUv);
       vec4 bloom = texture2D(tDiffuse, vUv);
       
       gl_FragColor = original + bloom * uBloomStrength;
     }
   `;
   ```

2. You need the original scene in a separate render target that survives through the blur passes. Create a dedicated render target:
   ```javascript
   this.sceneRenderTarget = new THREE.WebGLRenderTarget(w, h, {
     minFilter: THREE.LinearFilter,
     magFilter: THREE.LinearFilter,
     format: THREE.RGBAFormat,
   });
   ```

3. **Restructure the pipeline.** Instead of running everything through one linear EffectComposer, split the pipeline:

   ```javascript
   // Option: Manual pipeline (gives full control)
   render() {
     const delta = this.clock.getDelta();
     
     // PASS 1: Render scene to dedicated FBO
     this.renderer.setRenderTarget(this.sceneRenderTarget);
     this.renderer.clear();
     this.renderer.render(this.scene, this.camera);
     
     // PASS 2-N: Run threshold + blur through EffectComposer
     // Set the first pass to read from sceneRenderTarget
     this.thresholdPass.uniforms.tDiffuse.value = this.sceneRenderTarget.texture;
     this.bloomComposer.render(delta);
     // bloomComposer output is the blurred bloom
     
     // FINAL PASS: Composite to screen
     this.compositePass.uniforms.tOriginal.value = this.sceneRenderTarget.texture;
     this.compositePass.uniforms.tDiffuse.value = this.bloomComposer.renderTarget1.texture;
     this.renderer.setRenderTarget(null);
     // render the composite full-screen quad
   }
   ```

   Alternatively, use a custom pass class that holds multiple inputs. The manual approach is more educational.

4. Wire `uBloomStrength` to a Leva slider (range 0.0 to 3.0).

**Checkpoint:** The full scene is visible with a soft glow around bright objects. Adjusting bloom strength controls the glow intensity. Setting it to 0.0 shows the clean scene. Setting it to 2.0+ creates a dreamy, overblown look.

**What connects to the next step:**
The bloom works, but you can't see what's happening inside the pipeline. The debug panel will show each intermediate FBO.

---

### STEP 7: Debug Panel — Inspecting Each Pass

**What you're building:**
A panel that renders small thumbnails of each intermediate render target — the scene, the threshold extraction, the H-blur, the V-blur, and the final composite.

**What you'll learn:**
How to read intermediate FBO textures, the relationship between render targets and the passes that produce them, and how to build debugging tools for multi-pass pipelines.

**Tasks:**

1. Store references to every render target in `BloomPipeline.js`:
   ```javascript
   this.debugTargets = {
     scene: this.sceneRenderTarget,
     threshold: null,        // capture after threshold pass
     blurH: null,           // capture after horizontal blur
     blurV: null,           // capture after vertical blur
   };
   ```

2. For passes inside EffectComposer, you can capture the intermediate state by reading `composer.renderTarget1` or `composer.renderTarget2` after specific passes execute. Alternatively, create dedicated render targets for each pass and render manually.

3. In the React debug component, render each texture to a small `<canvas>` using a secondary Three.js renderer, or read pixel data with `renderer.readRenderTargetPixels()`.

4. Label each thumbnail:
   ```
   ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐
   │ Scene  │  │Thresh. │  │H-Blur  │  │V-Blur  │  │ Final  │
   │        │  │        │  │        │  │        │  │        │
   └────────┘  └────────┘  └────────┘  └────────┘  └────────┘
   ```

**Checkpoint:** You can see the pipeline stages visually. The threshold shows isolated brights. The H-blur shows horizontal streaks. The V-blur shows the full Gaussian glow. The final shows the composite.

**What connects to the next step:**
With the debug panel, you can now experiment confidently. The next step adds full parameter control.

---

### STEP 8: Full Controls Panel — Real-Time Parameter Tuning

**What you're building:**
Leva controls for every bloom parameter, with live feedback.

**What you'll learn:**
How each parameter affects the bloom quality, and the tradeoffs between performance and visual quality.

**Tasks:**

1. Wire these parameters to Leva:
   ```javascript
   const bloomControls = useControls('Bloom', {
     threshold: { value: 0.8, min: 0.0, max: 2.0, step: 0.01 },
     knee: { value: 0.1, min: 0.0, max: 0.5, step: 0.01 },
     strength: { value: 1.0, min: 0.0, max: 3.0, step: 0.01 },
     blurIterations: { value: 3, min: 1, max: 8, step: 1 },
     enabled: { value: true },
   });
   ```

2. Update uniforms every frame:
   ```javascript
   this.thresholdPass.uniforms.uThreshold.value = controls.threshold;
   this.thresholdPass.uniforms.uKnee.value = controls.knee;
   this.compositePass.uniforms.uBloomStrength.value = controls.strength;
   ```

3. For `blurIterations`, rebuild the pass chain when the value changes:
   ```javascript
   useEffect(() => {
     pipeline.setBlurIterations(bloomControls.blurIterations);
   }, [bloomControls.blurIterations]);
   ```

4. Add a toggle to enable/disable bloom entirely:
   ```javascript
   if (!controls.enabled) {
     this.renderer.render(this.scene, this.camera);
     return;
   }
   // ... otherwise run the bloom pipeline
   ```

**Checkpoint:** Every slider produces an immediate visible change. You can dial bloom from subtle to extreme and understand what each parameter controls.

**What connects to the next step:**
With a working bloom, you can now add additional post-processing effects to see how they chain together.

---

### STEP 9: Additional Post-FX — Stacking Effects

**What you're building:**
One or two additional post-processing effects chained after bloom — tone mapping, vignette, or chromatic aberration.

**What you'll learn:**
How effects stack in a pipeline, how each pass transforms the image for the next, and the order-dependency of post-processing chains.

**Tasks:**

1. **Vignette** (darkens edges, focuses attention on center):
   ```glsl
   uniform sampler2D tDiffuse;
   uniform float uVignetteIntensity;
   varying vec2 vUv;
   
   void main() {
     vec4 color = texture2D(tDiffuse, vUv);
     vec2 center = vUv - 0.5;
     float dist = length(center);
     float vignette = smoothstep(0.5, 0.2, dist);
     color.rgb *= mix(1.0, vignette, uVignetteIntensity);
     gl_FragColor = color;
   }
   ```

2. **Chromatic Aberration** (splits RGB channels slightly for a lens effect):
   ```glsl
   uniform sampler2D tDiffuse;
   uniform float uChromaticStrength;
   varying vec2 vUv;
   
   void main() {
     vec2 offset = (vUv - 0.5) * uChromaticStrength;
     float r = texture2D(tDiffuse, vUv + offset).r;
     float g = texture2D(tDiffuse, vUv).g;
     float b = texture2D(tDiffuse, vUv - offset).b;
     gl_FragColor = vec4(r, g, b, 1.0);
   }
   ```

3. Add these as ShaderPasses after the composite pass. Add Leva toggles for each.

4. Experiment with pass ordering:
   - Vignette BEFORE bloom = bloom respects the vignette darkness
   - Vignette AFTER bloom = bloom glow appears over the vignette
   - Order matters! This is a key learning.

**Checkpoint:** The final image has bloom + vignette + chromatic aberration. Toggling each effect on/off shows how they layer. Reordering produces different results.

---

### STEP 10: Polish + Window Resize + Cleanup

**Tasks:**

1. Handle window resize for ALL render targets:
   ```javascript
   const onResize = () => {
     const w = window.innerWidth;
     const h = window.innerHeight;
     this.camera.aspect = w / h;
     this.camera.updateProjectionMatrix();
     this.renderer.setSize(w, h);
     this.sceneRenderTarget.setSize(w, h);
     this.composer.setSize(w, h);
     
     // Update resolution uniforms
     this.blurPassH.uniforms.uResolution.value.set(w, h);
     this.blurPassV.uniforms.uResolution.value.set(w, h);
   };
   ```

2. Proper React cleanup:
   ```javascript
   useEffect(() => {
     const manager = new SceneManager(canvasRef.current);
     manager.start();
     return () => manager.dispose();
   }, []);
   ```

3. Dispose all render targets, materials, geometries, and textures in the `dispose()` method.

4. Add FPS counter to monitor performance impact of blur iterations.

**Checkpoint:** Everything works cleanly — resize, unmount, performance is acceptable (60fps with 3-4 blur iterations at 1080p).

---

## WebGL Concepts Map

| Concept | Where It Appears | What It Teaches |
|---|---|---|
| Framebuffer objects | `sceneRenderTarget`, EffectComposer internals | Off-screen rendering, the FBO as a "canvas" |
| Render-to-texture | Every pass except the last | The texture role-switch: output → input |
| Ping-pong targets | EffectComposer's `renderTarget1`/`renderTarget2` | Can't read and write the same texture |
| Full-screen quad | ShaderPass internals | How post-FX covers the viewport |
| Texture sampling | Blur shader `texture2D()` at offset UVs | Reading neighboring pixels for convolution |
| Uniforms | `uThreshold`, `uDirection`, `uBloomStrength` | JS → GPU per-frame communication |
| Luminance | `dot(color, luma_weights)` in threshold shader | Human color perception, weighted dot product |
| Gaussian kernel | Blur weight arrays | Convolution, image filtering theory |
| Separable filters | H-blur + V-blur passes | O(n) vs O(n²) optimization |
| HDR / tone mapping | `emissiveIntensity > 1.0`, ACES | Color values above 1.0, display compression |
| Additive blending | Composite shader `original + bloom` | How glow is layered on the base image |
| Pass ordering | Step 9 experiments | Post-processing is order-dependent |
| Resource disposal | Step 10 cleanup | Freeing GPU VRAM for render targets |
