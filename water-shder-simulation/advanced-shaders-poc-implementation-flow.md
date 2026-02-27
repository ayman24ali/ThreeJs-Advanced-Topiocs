# Advanced Shaders PoC — Water Shader with Reflection, Refraction & Dynamic Lighting

## PoC Overview

A React app with a Three.js scene featuring a realistic water surface rendered entirely with custom GLSL shaders. The water simulates reflection, refraction, the Fresnel effect, animated waves, and dynamic lighting — all built using the concepts from the deep dive document. Interactive controls let you tweak every parameter in real time.

This builds directly on your `threejs-webgl-deep-dive` work. Where that PoC taught you *how data flows through the GPU pipeline*, this one teaches you *how to write the math that makes pixels look real*.

---

## Tech Stack

- **React 18+** (Vite)
- **Three.js** (raw — no React Three Fiber)
- **GLSL** (custom vertex + fragment shaders)
- **Leva** (real-time parameter tweaking)

Same rationale as before: no R3F, so you manage the Three.js lifecycle yourself and stay close to the shader code.

---

## The Core Tension

A water shader sounds like one thing, but it's actually **five systems working together**:

1. **Wave animation** (vertex displacement + normal computation)
2. **Reflection** (cubemap sampling or planar reflection via FBO)
3. **Refraction** (screen-space distortion sampling from FBO)
4. **Fresnel mixing** (angle-dependent blending of reflection and refraction)
5. **Lighting** (Blinn-Phong or PBR specular on top)

Each system is individually straightforward. The learning is in **wiring them together** — making sure the normals from wave animation feed correctly into the Fresnel, reflection, and refraction calculations, and that the multi-pass rendering provides the right textures for the shader to sample.

---

## File Structure

```
src/
├── App.jsx                            # Layout: canvas + controls
├── main.jsx                           # Entry point
│
├── scene/
│   ├── SceneManager.js                # Core: renderer, scenes, cameras, render loop
│   ├── WaterSurface.js                # Water plane + ShaderMaterial setup
│   ├── EnvironmentSetup.js            # Skybox, objects for reflection/refraction
│   ├── ReflectionPass.js              # Manages mirror camera + reflection FBO
│   ├── RefractionPass.js              # Manages underwater camera + refraction FBO
│   └── LightManager.js               # Dynamic light positioning + uniforms
│
├── shaders/
│   ├── water.vert.js                  # Vertex shader: Gerstner wave displacement
│   ├── water.frag.js                  # Fragment shader: Fresnel + reflect + refract + lighting
│   ├── caustics.frag.js               # (Optional) Underwater caustic light patterns
│   └── debug/
│       ├── normals.frag.js            # Visualize computed normals
│       ├── fresnel.frag.js            # Visualize Fresnel values
│       └── depth.frag.js             # Visualize depth values
│
├── components/
│   ├── Canvas.jsx                     # Canvas element + mounts SceneManager
│   ├── WaterControls.jsx              # Leva panel: wave, fresnel, color params
│   └── DebugOverlay.jsx              # Toggle: show normals, fresnel, depth maps
│
└── textures/
    └── (water normal maps, skybox images)
```

---

## Build Flow — Step by Step

### STEP 1: Scene Scaffolding

**What you're building:**
Empty React app with a Three.js canvas, basic camera (OrbitControls), a skybox, and a few simple objects (spheres, boxes) positioned above and below a flat plane where the water will go.

**What you'll learn:**
Nothing new — this is setup. The objects exist so you have something to reflect and refract later.

**Tasks:**

1. Scaffold with Vite + React
2. Create `SceneManager.js` — renderer, perspective camera, OrbitControls, animation loop
3. Create `EnvironmentSetup.js`:
   ```javascript
   // Load a cubemap for the skybox
   const cubeTextureLoader = new THREE.CubeTextureLoader();
   const envMap = cubeTextureLoader.load([
     'px.jpg', 'nx.jpg', 'py.jpg', 'ny.jpg', 'pz.jpg', 'nz.jpg'
   ]);
   scene.background = envMap;

   // Add objects above water
   const sphere = new THREE.Mesh(
     new THREE.SphereGeometry(1, 32, 32),
     new THREE.MeshStandardMaterial({ color: 0xff4444, envMap })
   );
   sphere.position.set(3, 2, 0);

   // Add objects below water (will be visible through refraction)
   const underwaterBox = new THREE.Mesh(
     new THREE.BoxGeometry(2, 2, 2),
     new THREE.MeshStandardMaterial({ color: 0x44ff44 })
   );
   underwaterBox.position.set(-2, -3, 1);
   ```
4. Add a placeholder flat plane at `y = 0` with `MeshStandardMaterial` — this will become the water.

**Checkpoint:** You see a scene with objects, a skybox, and a blue flat plane. Camera orbits around.

---

### STEP 2: Basic Custom Water Shader (Flat Color + Lambert)

**What you're building:**
Replace the placeholder material with a `ShaderMaterial` that has the simplest possible custom shader — just flat color with basic Lambert lighting.

**What you'll learn:**
Shader material setup, uniform passing, basic vertex/fragment shader wiring. A warmup before the complexity hits.

**Tasks:**

1. Write `water.vert.js` (basic passthrough):
   ```glsl
   varying vec2 vUv;
   varying vec3 vWorldPosition;
   varying vec3 vNormal;

   void main() {
       vUv = uv;
       vec4 worldPos = modelMatrix * vec4(position, 1.0);
       vWorldPosition = worldPos.xyz;
       vNormal = normalize(normalMatrix * normal);
       gl_Position = projectionMatrix * viewMatrix * worldPos;
   }
   ```

2. Write `water.frag.js` (basic Lambert):
   ```glsl
   uniform vec3 uWaterColor;
   uniform vec3 uLightPosition;
   uniform vec3 uLightColor;

   varying vec3 vNormal;
   varying vec3 vWorldPosition;

   void main() {
       vec3 L = normalize(uLightPosition - vWorldPosition);
       float NdotL = max(dot(vNormal, L), 0.0);
       vec3 color = uWaterColor * (0.2 + NdotL * 0.8);
       gl_FragColor = vec4(color, 0.8);
   }
   ```

3. In `WaterSurface.js`:
   ```javascript
   const waterMaterial = new THREE.ShaderMaterial({
       vertexShader: waterVertexShader,
       fragmentShader: waterFragmentShader,
       uniforms: {
           uWaterColor: { value: new THREE.Color(0.0, 0.3, 0.5) },
           uLightPosition: { value: new THREE.Vector3(10, 10, 10) },
           uLightColor: { value: new THREE.Color(1, 1, 1) },
       },
       transparent: true,
   });
   const waterGeometry = new THREE.PlaneGeometry(50, 50, 256, 256);
   waterGeometry.rotateX(-Math.PI / 2); // lay flat
   const waterMesh = new THREE.Mesh(waterGeometry, waterMaterial);
   ```

**Checkpoint:** A flat blue-ish, semi-transparent plane with basic directional lighting. Still looks like a colored floor, not water.

---

### STEP 3: Wave Animation (Vertex Displacement)

**What you're building:**
Gerstner wave displacement in the vertex shader — the plane's vertices move to form realistic wave shapes.

**What you'll learn:**
Vertex shader displacement, Gerstner wave math, passing time as a uniform, how vertex movement affects the rendered surface.

**Tasks:**

1. Add wave uniforms:
   ```javascript
   uniforms: {
       ...existing,
       uTime: { value: 0 },
       uWaveA: { value: new THREE.Vector4(1.0, 0.0, 0.3, 2.0) }, // dir.x, dir.y, amplitude, frequency
       uWaveB: { value: new THREE.Vector4(0.7, 0.7, 0.15, 3.0) },
       uWaveC: { value: new THREE.Vector4(-0.4, 0.9, 0.08, 5.0) },
   }
   ```

2. Implement Gerstner wave function in the vertex shader:
   ```glsl
   uniform float uTime;
   uniform vec4 uWaveA; // direction.xy, amplitude, frequency
   uniform vec4 uWaveB;
   uniform vec4 uWaveC;

   vec3 gerstnerWave(vec4 wave, vec3 pos, float time, inout vec3 tangent, inout vec3 binormal) {
       float steepness = 0.5;
       float amp = wave.z;
       float freq = wave.w;
       vec2 dir = normalize(wave.xy);
       float phase = sqrt(9.8 * freq); // gravity-based phase speed

       float f = freq * dot(dir, pos.xz) - phase * time;
       float cosF = cos(f);
       float sinF = sin(f);

       // Displacement
       vec3 offset;
       offset.x = steepness * amp * dir.x * cosF;
       offset.z = steepness * amp * dir.y * cosF;
       offset.y = amp * sinF;

       // Accumulate tangent/binormal for normal calculation
       tangent += vec3(
           -steepness * amp * dir.x * dir.x * freq * sinF,
           steepness * amp * dir.x * freq * cosF,
           -steepness * amp * dir.x * dir.y * freq * sinF
       );
       binormal += vec3(
           -steepness * amp * dir.x * dir.y * freq * sinF,
           steepness * amp * dir.y * freq * cosF,
           -steepness * amp * dir.y * dir.y * freq * sinF
       );

       return offset;
   }

   void main() {
       vec3 pos = position;
       vec3 tangent = vec3(1.0, 0.0, 0.0);
       vec3 binormal = vec3(0.0, 0.0, 1.0);

       pos += gerstnerWave(uWaveA, position, uTime, tangent, binormal);
       pos += gerstnerWave(uWaveB, position, uTime, tangent, binormal);
       pos += gerstnerWave(uWaveC, position, uTime, tangent, binormal);

       // Compute the actual normal from the displaced surface
       vec3 computedNormal = normalize(cross(binormal, tangent));
       vNormal = computedNormal;

       vUv = uv;
       vec4 worldPos = modelMatrix * vec4(pos, 1.0);
       vWorldPosition = worldPos.xyz;
       gl_Position = projectionMatrix * viewMatrix * worldPos;
   }
   ```

3. Update render loop:
   ```javascript
   waterMaterial.uniforms.uTime.value = clock.getElapsedTime();
   ```

4. Connect to Leva controls:
   ```javascript
   const waveParams = useControls('Waves', {
       waveAAmplitude: { value: 0.3, min: 0, max: 1, step: 0.01 },
       waveAFrequency: { value: 2.0, min: 0.5, max: 10, step: 0.1 },
       // ...
   });
   ```

**Checkpoint:** The flat plane is now an animated wavy surface. The lighting responds to the wave normals — you can see brighter and darker areas shifting as waves move. This is vertex shader displacement in action.

---

### STEP 4: Fresnel + Cubemap Reflection

**What you're building:**
The Fresnel effect driving a mix between a base water color and cubemap reflection. This is where it starts looking like water.

**What you'll learn:**
Fresnel-Schlick approximation, cubemap sampling with `reflect()`, how the view angle changes the visual character of the surface.

**Tasks:**

1. Add uniforms:
   ```javascript
   uniforms: {
       ...existing,
       uEnvMap: { value: envMap }, // the cubemap loaded in Step 1
       cameraPosition: { value: new THREE.Vector3() },
       uFresnelPower: { value: 5.0 },
       uFresnelBias: { value: 0.02 },
   }
   ```

2. Update the fragment shader:
   ```glsl
   uniform samplerCube uEnvMap;
   uniform vec3 cameraPosition;
   uniform float uFresnelPower;
   uniform float uFresnelBias;

   varying vec3 vWorldPosition;
   varying vec3 vNormal;

   void main() {
       vec3 N = normalize(vNormal);
       vec3 V = normalize(cameraPosition - vWorldPosition);

       // Fresnel
       float NdotV = max(dot(N, V), 0.0);
       float fresnel = uFresnelBias + (1.0 - uFresnelBias) * pow(1.0 - NdotV, uFresnelPower);

       // Reflection
       vec3 R = reflect(-V, N);
       vec3 reflectionColor = textureCube(uEnvMap, R).rgb;

       // Mix water color with reflection based on Fresnel
       vec3 waterBase = uWaterColor;
       vec3 color = mix(waterBase, reflectionColor, fresnel);

       // Add specular highlight (Blinn-Phong)
       vec3 L = normalize(uLightPosition - vWorldPosition);
       vec3 H = normalize(L + V);
       float spec = pow(max(dot(N, H), 0.0), 128.0);
       color += uLightColor * spec * 0.5;

       gl_FragColor = vec4(color, 1.0);
   }
   ```

3. Update camera position uniform each frame:
   ```javascript
   waterMaterial.uniforms.cameraPosition.value.copy(camera.position);
   ```

4. Add a **debug mode** to visualize just the Fresnel value:
   ```glsl
   // In debug/fresnel.frag.js
   // Output fresnel as grayscale — white at edges, dark in center
   gl_FragColor = vec4(vec3(fresnel), 1.0);
   ```

**Checkpoint:** The water now reflects the skybox. When you orbit the camera to a low angle, the surface becomes almost fully reflective (mirror-like). Looking straight down, you see the base water color. This is the Fresnel effect working. The specular highlight from the light creates a sun glint on the waves.

---

### STEP 5: Refraction Pass (Render-to-Texture)

**What you're building:**
Render the underwater scene to an FBO, then sample it in the water shader with UV distortion based on the wave normals.

**What you'll learn:**
Multi-pass rendering for refraction, screen-space UV computation, how normal-based UV distortion creates the "bending" look.

**Tasks:**

1. Create the refraction render target in `RefractionPass.js`:
   ```javascript
   this.refractionTarget = new THREE.WebGLRenderTarget(
       window.innerWidth, window.innerHeight,
       { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter }
   );
   ```

2. Set up a clipping plane to only render objects below the water:
   ```javascript
   const underwaterClipPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
   renderer.clippingPlanes = [underwaterClipPlane];
   renderer.setRenderTarget(this.refractionTarget);
   renderer.render(scene, camera);
   renderer.clippingPlanes = [];
   renderer.setRenderTarget(null);
   ```

3. Pass the texture to the water shader:
   ```javascript
   uniforms: {
       ...existing,
       uRefractionMap: { value: this.refractionTarget.texture },
       uRefractionStrength: { value: 0.02 },
   }
   ```

4. Update the fragment shader:
   ```glsl
   uniform sampler2D uRefractionMap;
   uniform float uRefractionStrength;

   varying vec4 vClipPos; // added to vertex shader

   void main() {
       // Screen-space UVs
       vec2 screenUV = (vClipPos.xy / vClipPos.w) * 0.5 + 0.5;

       // Distort UVs based on wave normal — this creates the bending look
       vec2 refractedUV = screenUV + N.xz * uRefractionStrength;
       refractedUV = clamp(refractedUV, 0.001, 0.999); // prevent sampling outside texture

       vec3 refractionColor = texture2D(uRefractionMap, refractedUV).rgb;

       // Now mix with Fresnel:
       vec3 color = mix(refractionColor, reflectionColor, fresnel);
       // ...rest of lighting
   }
   ```

5. Pass `vClipPos` from the vertex shader:
   ```glsl
   varying vec4 vClipPos;
   void main() {
       // ... wave displacement ...
       vClipPos = projectionMatrix * viewMatrix * worldPos;
       gl_Position = vClipPos;
   }
   ```

**Checkpoint:** Looking straight down at the water, you can now see the underwater objects through the surface, distorted by the waves. Looking at a shallow angle, reflections dominate. The Fresnel effect seamlessly blends between the two. This is the "wow" moment — it actually looks like water.

---

### STEP 6: Depth-Based Effects

**What you're building:**
Read the scene depth to add edge foam, depth-dependent color tinting, and variable refraction intensity.

**What you'll learn:**
Depth buffer usage in shaders, depth linearization, how depth drives visual transitions.

**Tasks:**

1. Create a render target with a depth texture:
   ```javascript
   this.depthTarget = new THREE.WebGLRenderTarget(w, h, {
       depthTexture: new THREE.DepthTexture(),
   });
   this.depthTarget.depthTexture.type = THREE.UnsignedShortType;
   ```

2. Render the scene to capture depth:
   ```javascript
   renderer.setRenderTarget(this.depthTarget);
   renderer.render(scene, camera);
   ```

3. Add to fragment shader:
   ```glsl
   uniform sampler2D uDepthMap;
   uniform float uNear;
   uniform float uFar;
   uniform vec3 uShallowColor;
   uniform vec3 uDeepColor;
   uniform float uFoamThreshold;

   float linearizeDepth(float d) {
       float z = d * 2.0 - 1.0;
       return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear));
   }

   void main() {
       float sceneDepth = linearizeDepth(texture2D(uDepthMap, screenUV).r);
       float waterSurfaceDepth = linearizeDepth(gl_FragCoord.z);
       float waterDepth = sceneDepth - waterSurfaceDepth;

       // Depth-based water tint
       vec3 depthTint = mix(uShallowColor, uDeepColor, smoothstep(0.0, 8.0, waterDepth));

       // Edge foam
       float foam = 1.0 - smoothstep(0.0, uFoamThreshold, waterDepth);
       vec3 foamColor = vec3(1.0); // white foam

       // Apply to refraction color
       refractionColor = mix(refractionColor, depthTint, smoothstep(0.0, 5.0, waterDepth));

       // Final composite
       vec3 color = mix(refractionColor, reflectionColor, fresnel);
       color = mix(color, foamColor, foam * 0.7);
       // ... specular highlight
   }
   ```

**Checkpoint:** Shallow areas near objects show lighter, clearer water with white foam at the edges. Deep areas are dark blue-green. The water feels like it has *depth*, not just a surface.

---

### STEP 7: Dynamic Lighting

**What you're building:**
A moveable light source that updates the specular highlight, diffuse contribution, and optionally casts a sun path across the water.

**What you'll learn:**
Dynamic uniform updates, specular highlight behavior on animated normals, how light direction interacts with wave geometry.

**Tasks:**

1. Add light animation:
   ```javascript
   // In LightManager.js
   update(time) {
       // Sun moves across the sky
       const angle = time * 0.1;
       this.lightPosition.set(
           Math.cos(angle) * 20,
           15 + Math.sin(angle) * 5,
           Math.sin(angle) * 20
       );
       waterMaterial.uniforms.uLightPosition.value.copy(this.lightPosition);
   }
   ```

2. Enhance the specular calculation with PBR (optional upgrade from Blinn-Phong):
   ```glsl
   // GGX specular — more realistic than pow(NdotH, shininess)
   float D_GGX(vec3 N, vec3 H, float roughness) {
       float a = roughness * roughness;
       float a2 = a * a;
       float NdotH = max(dot(N, H), 0.0);
       float NdotH2 = NdotH * NdotH;
       float denom = NdotH2 * (a2 - 1.0) + 1.0;
       return a2 / (3.14159 * denom * denom);
   }

   // In main():
   float roughness = 0.05; // very smooth water
   float specNDF = D_GGX(N, H, roughness);
   vec3 specular = uLightColor * specNDF * FresnelSchlick(max(dot(H, V), 0.0), vec3(0.02));
   ```

3. Add Leva controls for light position, color, and intensity.

**Checkpoint:** A visible sun-glint path on the water that shifts as the light moves. The specular highlight stretches across the waves — brighter on wave peaks that face the light.

---

### STEP 8: Normal Map Detail Layer

**What you're building:**
A scrolling normal map texture layered on top of the Gerstner wave normals, adding fine ripple detail that would be too expensive to compute with vertex displacement alone.

**What you'll learn:**
Normal map sampling, tangent-space to world-space conversion, texture scrolling, blending multiple normal sources.

**Tasks:**

1. Load a tileable water normal map:
   ```javascript
   const normalMap = textureLoader.load('water-normal.jpg');
   normalMap.wrapS = normalMap.wrapT = THREE.RepeatWrapping;
   uniforms.uNormalMap = { value: normalMap };
   uniforms.uNormalMapScale = { value: 8.0 };
   ```

2. Sample and blend in the fragment shader:
   ```glsl
   uniform sampler2D uNormalMap;
   uniform float uNormalMapScale;
   uniform float uTime;

   vec3 getDetailNormal(vec2 uv, float time) {
       vec2 uv1 = uv * uNormalMapScale + vec2(time * 0.05, time * 0.03);
       vec2 uv2 = uv * uNormalMapScale * 2.0 + vec2(-time * 0.03, time * 0.07);

       vec3 n1 = texture2D(uNormalMap, uv1).rgb * 2.0 - 1.0;
       vec3 n2 = texture2D(uNormalMap, uv2).rgb * 2.0 - 1.0;

       return normalize(vec3(n1.xy + n2.xy, n1.z * n2.z));
   }

   void main() {
       vec3 waveNormal = vNormal; // from Gerstner computation
       vec3 detailNormal = getDetailNormal(vUv, uTime);

       // Blend: wave normal provides large-scale shape,
       // detail normal adds fine ripples
       vec3 N = normalize(vec3(
           waveNormal.x + detailNormal.x * 0.3,
           waveNormal.y,
           waveNormal.z + detailNormal.z * 0.3
       ));

       // Use N for all lighting, Fresnel, reflection, refraction
       // ...
   }
   ```

**Checkpoint:** Close-up, the water surface has fine, detailed ripples that scroll independently of the large waves. The reflections shimmer with more variation. The water now has both macro (Gerstner) and micro (normal map) detail.

---

### STEP 9: Debug Visualization Panel

**What you're building:**
Toggle overlays that show the intermediate shader values — normals as colors, Fresnel as grayscale, depth as a gradient, reflection and refraction FBOs side by side.

**What you'll learn:**
Debugging shader output, understanding what each component contributes to the final image.

**Tasks:**

1. Add a `uDebugMode` uniform (0 = none, 1 = normals, 2 = Fresnel, 3 = depth, 4 = reflection only, 5 = refraction only):
   ```glsl
   uniform int uDebugMode;

   void main() {
       // ... all calculations ...

       if (uDebugMode == 1) {
           gl_FragColor = vec4(N * 0.5 + 0.5, 1.0); return;
       }
       if (uDebugMode == 2) {
           gl_FragColor = vec4(vec3(fresnel), 1.0); return;
       }
       if (uDebugMode == 3) {
           gl_FragColor = vec4(vec3(smoothstep(0.0, 10.0, waterDepth)), 1.0); return;
       }
       if (uDebugMode == 4) {
           gl_FragColor = vec4(reflectionColor, 1.0); return;
       }
       if (uDebugMode == 5) {
           gl_FragColor = vec4(refractionColor, 1.0); return;
       }
       // ... normal output ...
   }
   ```

2. Wire to Leva dropdown:
   ```javascript
   const { debugMode } = useControls('Debug', {
       debugMode: { options: { None: 0, Normals: 1, Fresnel: 2, Depth: 3, Reflection: 4, Refraction: 5 } }
   });
   ```

**Checkpoint:** You can toggle each visualization and see exactly what each layer contributes. Normals show rainbow colors shifting with waves. Fresnel shows white at edges, dark in center. This confirms every shader component is working correctly.

---

### STEP 10: Planar Reflection (Advanced Upgrade)

**What you're building:**
Replace or supplement the cubemap reflection with a planar reflection — render the scene from a mirrored camera into an FBO and sample it.

**What you'll learn:**
Camera reflection math, oblique clip planes, why planar reflections are more accurate for flat surfaces than cubemaps.

**Tasks:**

1. Create the mirror camera in `ReflectionPass.js`:
   ```javascript
   update(camera, waterHeight) {
       // Mirror the camera across the water plane
       this.mirrorCamera.copy(camera);
       this.mirrorCamera.position.y = -camera.position.y + 2 * waterHeight;
       this.mirrorCamera.up.set(0, -1, 0); // flip up direction

       // Render mirrored view
       renderer.setRenderTarget(this.reflectionTarget);
       renderer.clippingPlanes = [new THREE.Plane(new THREE.Vector3(0, 1, 0), -waterHeight)];
       renderer.render(scene, this.mirrorCamera);
       renderer.clippingPlanes = [];
       renderer.setRenderTarget(null);
   }
   ```

2. In the fragment shader, sample the planar reflection:
   ```glsl
   uniform sampler2D uPlanarReflectionMap;

   // Screen UV with normal distortion for the reflection
   vec2 reflectUV = vec2(screenUV.x, 1.0 - screenUV.y) + N.xz * 0.02;
   vec3 planarReflection = texture2D(uPlanarReflectionMap, reflectUV).rgb;

   // Blend with cubemap reflection for fallback
   vec3 reflectionColor = mix(cubemapReflection, planarReflection, 0.7);
   ```

**Checkpoint:** Reflections now show the actual scene objects (not just the skybox). Move objects near the water and see their reflections ripple. This is production-quality water reflection.

---

### STEP 11: Polish + Performance + Cleanup

**Tasks:**

1. Handle window resize (update all render targets):
   ```javascript
   window.addEventListener('resize', () => {
       camera.aspect = window.innerWidth / window.innerHeight;
       camera.updateProjectionMatrix();
       renderer.setSize(window.innerWidth, window.innerHeight);
       reflectionTarget.setSize(window.innerWidth, window.innerHeight);
       refractionTarget.setSize(window.innerWidth, window.innerHeight);
       depthTarget.setSize(window.innerWidth, window.innerHeight);
   });
   ```

2. React cleanup:
   ```javascript
   useEffect(() => {
       const manager = new SceneManager(canvasRef.current);
       manager.start();
       return () => manager.dispose(); // dispose all targets, materials, geometries
   }, []);
   ```

3. Performance: render reflection/refraction at half resolution for speed:
   ```javascript
   const halfWidth = Math.floor(window.innerWidth / 2);
   const halfHeight = Math.floor(window.innerHeight / 2);
   this.reflectionTarget = new THREE.WebGLRenderTarget(halfWidth, halfHeight);
   ```

---

## Build Order Summary

```
Step 1:  Scene scaffolding — skybox, objects, flat placeholder water
         └── confirms: Three.js setup, environment ready
              │
Step 2:  Custom ShaderMaterial with basic Lambert lighting
         └── confirms: shader wiring, uniform passing
              │
Step 3:  Gerstner wave vertex displacement
         └── confirms: vertex shader displacement, wave normals, time animation
              │
Step 4:  Fresnel effect + cubemap reflection
         └── confirms: Fresnel-Schlick, reflect(), cubemap sampling, view-angle behavior
              │
Step 5:  Refraction via render-to-texture + UV distortion
         └── confirms: FBO for refraction, screen-space UVs, clipping planes
              │
Step 6:  Depth-based effects (foam, color tinting)
         └── confirms: depth buffer reading, linearization, smoothstep transitions
              │
Step 7:  Dynamic lighting (moving sun, GGX specular)
         └── confirms: PBR specular, dynamic uniform updates, sun path
              │
Step 8:  Normal map detail layer
         └── confirms: normal map sampling, texture scrolling, normal blending
              │
Step 9:  Debug visualization panel
         └── confirms: each shader component verified independently
              │
Step 10: Planar reflection (advanced)
         └── confirms: mirror camera, oblique clipping, planar FBO reflection
              │
Step 11: Polish, resize, performance, cleanup
         └── confirms: production concerns, resource management
```

---

## Concept Coverage Map

| Shader/GLSL Concept         | Covered In    | How                                              |
|------------------------------|---------------|--------------------------------------------------|
| Vertex shader displacement   | Step 3        | Gerstner wave functions modifying vertex positions |
| Fragment shader lighting     | Step 2, 4, 7  | Lambert → Blinn-Phong → GGX specular progression |
| Uniforms (time, vectors)     | Step 2-8      | Time, camera position, light, wave params, textures |
| Varyings                     | Step 2+       | World position, normals, UVs, clip-space coords    |
| `reflect()` built-in         | Step 4        | Mirror view direction across surface normal        |
| `refract()` / UV distortion  | Step 5        | Snell's law via UV offset from surface normals     |
| Cubemap sampling             | Step 4        | `textureCube(envMap, reflectDir)`                  |
| Fresnel-Schlick              | Step 4        | Angle-based reflection/refraction mixing           |
| Normal maps                  | Step 8        | Scrolling detail normals blended with wave normals |
| Screen-space UV computation  | Step 5        | Clip-space → NDC → screen UV for FBO sampling      |
| Depth buffer reading         | Step 6        | Depth texture sampling + linearization             |
| `smoothstep` transitions     | Step 6        | Foam edges, depth tinting, refraction falloff      |
| Multi-pass rendering         | Step 5, 10    | Reflection FBO, refraction FBO, depth FBO          |
| Clipping planes              | Step 5, 10    | Render only above/below water for each pass        |
| PBR concepts (D, F, G)       | Step 7        | GGX NDF + Fresnel for realistic specular           |
| Render target management     | Step 5, 6, 10 | Multiple FBOs at different resolutions             |
| Debug shader visualization   | Step 9        | Output intermediate values as colors for debugging |
| Gerstner waves               | Step 3        | Physics-based wave displacement + normal derivation|
