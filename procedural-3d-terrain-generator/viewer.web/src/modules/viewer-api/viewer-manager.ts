import {Mesh, Vector3} from "three";
import * as THREE from "three";
import {GeometryManager} from "./managers/geometry-manager";
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import {LightManager} from "./managers/light-manager";
import {TerrainGenerator} from "./managers/terrain-generator";
import {PerlinNoise} from "./managers/perlin-noise";

/**
 * ViewerManager
 * -------------
 * Top-level orchestrator for the Three.js scene.
 *
 * Responsibilities:
 *  - Creating and owning the THREE.Scene, Camera, and WebGLRenderer.
 *  - Wiring together all manager classes (geometry, lighting, terrain).
 *  - Performing the CPU-side terrain displacement loop.
 *  - Running the render loop via requestAnimationFrame.
 *  - Handling window resize events.
 *
 * Terrain generation pipeline (runs once at startup):
 *  1. GeometryManager.createPlane()  → flat, subdivided PlaneGeometry with ShaderMaterial.
 *  2. For each vertex: TerrainGenerator.fbm() → height value → written to position.Z.
 *  3. geometry.computeVertexNormals() → recalculates normals based on new slopes.
 *  4. Min/max height scan → updates uMinHeight / uMaxHeight uniforms so the fragment
 *     shader can normalise colour correctly.
 */
export class ViewerManager {
  /** PrimeReact Toast reference — used for UI notifications. */
  toast: any;

  /** The Three.js scene graph that holds all objects, lights, and helpers. */
  scene: THREE.Scene;

  /** Perspective camera: 75° FOV, near=0.1, far=1 000 000 units. */
  camera: THREE.PerspectiveCamera | undefined;

  /** WebGL renderer — appended as a canvas element into `container`. */
  renderer: THREE.WebGLRenderer | undefined;

  /** The host <div> element that owns the renderer's <canvas>. */
  container: HTMLDivElement;

  /** OrbitControls — mouse drag to orbit, scroll to zoom, right-drag to pan. */
  controls!: OrbitControls;

  /** Factory for terrain and debug geometry. */
  geometryManager: GeometryManager;

  /** Converts fBm noise values into displaced terrain vertex heights. */
  terrainGenerator: TerrainGenerator;

  /** Raw Perlin noise sampler shared with the TerrainGenerator. */
  perlinNoise: PerlinNoise;

  /** Factory for scene lights. */
  lightManager: LightManager;

  /**
   * Constructs the viewer and immediately initialises the 3-D scene.
   *
   * @param containerRef - The <div> that will host the renderer canvas.
   * @param toast        - PrimeReact toast ref for user notifications.
   */
  constructor(containerRef: HTMLDivElement, toast: any) {
    this.toast = toast;
    this.container = containerRef;
    this.scene = new THREE.Scene();
    this.geometryManager = new GeometryManager();
    this.lightManager = new LightManager();
    this.perlinNoise = new PerlinNoise();
    this.terrainGenerator = new TerrainGenerator(this.perlinNoise);
    this.initializeScene(containerRef);
    this.attachEvents();
  }

  /**
   * Registers global event listeners (currently: window resize).
   */
  attachEvents = (): void => {
    window.addEventListener('resize', this.onWindowResize);
  }

  /**
   * Builds the full scene: camera, renderer, controls, terrain mesh, lights.
   *
   * Terrain displacement details:
   *  - A 1000×1000 unit plane with 200×200 segments (≈40 000 vertices) is created.
   *  - Each vertex position (x, z in object space) is fed into `fbm()` with:
   *      scale       = 0.003  → zooms the noise out for large-scale features
   *      octaves     = 6      → 6 layers of detail
   *      persistence = 0.5    → each octave is half as loud
   *      lacunarity  = 2.0    → each octave is twice as fine
   *  - The fBm result (−1 to 1) is multiplied by 200 to get world-unit heights.
   *  - After all vertices are displaced, `computeVertexNormals()` recalculates
   *    per-vertex normals so lighting is correct on the new slopes.
   *  - A min/max scan updates the shader uniforms so the biome colour gradient
   *    spans exactly the actual height range of the generated terrain.
   *
   * @param container - The <div> element to attach the renderer canvas to.
   */
  initializeScene(container: HTMLDivElement): void {
    // --- Camera ---
    this.camera = new THREE.PerspectiveCamera(
      75,
      container.clientWidth / container.clientHeight,
      0.1,
      1000000
    );
    this.camera.position.set(0, 400, 600); // start position: above and behind the terrain
    this.camera.lookAt(0, 0, 0);

    // --- Renderer ---
    this.renderer = new THREE.WebGLRenderer();
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.shadowMap.enabled = true;                           // Enable shadows
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;           // Softer shadow edges
    container.appendChild(this.renderer.domElement);

    // --- OrbitControls ---
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true; // Smooth, inertia-like camera movement
    this.controls.dampingFactor = 0.05;

    // --- Terrain mesh ---
    // const cube = this.geometryManager.createCube()
    // this.scene.add(cube);
    const plane = this.geometryManager.createPlane(1000, 1000, 200, 200);
    this.scene.add(plane);

    // --- CPU-side vertex displacement ---
    // Read each vertex's (x, z) position and overwrite its Z with an fBm height.
    const positions = plane.geometry.attributes.position;

    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i);
      const z = positions.getZ(i);
      const h = this.terrainGenerator.fbm(x, z, {
        scale:       0.003, // base frequency — small = zoomed-out, large features
        octaves:     6,     // 6 noise layers stacked
        persistence: 0.5,   // each layer is 50 % as tall as the previous
        lacunarity:  2.0    // each layer is 2× finer than the previous
      }) * 200;             // scale result from [-1,1] to [-200, 200] world units
      positions.setZ(i, h);
    }

    positions.needsUpdate = true;           // flags the buffer for re-upload to GPU VRAM
    plane.geometry.computeVertexNormals();  // recalculates normals based on new slopes

    // --- Scan actual height range and update shader uniforms ---
    // Ensures biomeColor() maps exactly from the lowest valley to the highest peak.
    let min = Infinity, max = -Infinity;
    for (let i = 0; i < positions.count; i++) {
      const z = positions.getZ(i);
      if (z < min) min = z;
      if (z > max) max = z;
    }

    const mat = plane.material as THREE.ShaderMaterial;
    mat.uniforms.uMinHeight.value = min;
    mat.uniforms.uMaxHeight.value = max;

    // --- Lights ---
    this.lightManager.createPointLight(this.scene, new Vector3(0, 5, 0));
    this.lightManager.createAmbientLight(this.scene);

    // Start the render loop
    this.animate();
  }

  /**
   * The render loop — called every frame via requestAnimationFrame.
   *
   * Currently only renders the scene; rotation logic is commented out
   * but kept for reference / future use.
   *
   * @param rotatingObject - Optional mesh to rotate each frame (unused).
   */
  animate = (rotatingObject?: Mesh): void => {
    // Rotate the cube (disabled)
    // rotatingObject?.rotation.x += 0.01;
    // rotatingObject?.rotation.y += 0.01;

    this.renderer?.render(this.scene, this.camera!);
    requestAnimationFrame(() => this.animate(rotatingObject));
  }

  /**
   * Handles browser window resize events.
   * Updates the camera's aspect ratio and the renderer's pixel dimensions
   * so the scene is never stretched or cropped.
   */
  onWindowResize = (): void => {
    if (this.camera && this.renderer) {
      this.camera.aspect = this.container.clientWidth / this.container.clientHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    }
  }
}
