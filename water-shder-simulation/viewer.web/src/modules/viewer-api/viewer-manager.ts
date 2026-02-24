import * as THREE from "three";
import {CubeTexture, LinearFilter, Mesh, ShaderMaterial, Vector3, WebGLRenderTarget} from "three";
import {GeometryManager} from "./managers/geometry-manager";
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls';
import {LightManager} from "./managers/light-manager";

/**
 * ViewerManager
 *
 * Top-level orchestrator for the Three.js water shader scene.
 *
 * Responsibilities:
 *  1. Bootstrap the renderer, camera, and orbit controls.
 *  2. Set up a WebGLRenderTarget (off-screen framebuffer) for the refraction
 *     pass – this captures what the scene looks like below the water surface.
 *  3. Compose the scene by delegating geometry and lighting creation to their
 *     respective manager classes.
 *  4. Run the per-frame animation loop using a two-pass rendering strategy:
 *       Pass 1 – hide the water plane, render to the refraction texture.
 *       Pass 2 – show the water plane, render to the screen canvas.
 *  5. Handle window resize events to keep the camera and renderer in sync.
 */
export class ViewerManager {
  toast: any;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera | undefined;
  renderer: THREE.WebGLRenderer | undefined;
  container: HTMLDivElement;
  controls!: OrbitControls;
  geometryManager: GeometryManager;
  lightManager:LightManager;
  /** Clock drives uTime in the vertex shader – elapsed seconds since scene start */
  clock: THREE.Clock = new THREE.Clock();
  /**
   * Off-screen render target used for the refraction effect.
   * The scene is rendered into this texture (with the water plane hidden) so
   * the fragment shader can sample what lies beneath the water surface.
   */
  refractionTarget:WebGLRenderTarget

  constructor(containerRef: HTMLDivElement, toast: any) {
    this.toast = toast;
    this.container = containerRef;
    this.scene = new THREE.Scene();
    this.geometryManager = new GeometryManager();
    this.lightManager = new LightManager();

    // Create the refraction render-target at full screen resolution.
    // LinearFilter on both min and mag avoids blocky artefacts when the
    // texture is displayed at a slightly different size.
    this.refractionTarget = new THREE.WebGLRenderTarget(
        window.innerWidth, window.innerHeight,
        { minFilter: LinearFilter, magFilter: LinearFilter }
    );
    this.initializeScene(containerRef);
    this.attachEvents();
  }
  
  /** Register global DOM event listeners (resize, etc.) */
  attachEvents = (): void => {
    window.addEventListener('resize', this.onWindowResize);
  }
  
  /**
   * Initialises all Three.js objects and starts the render loop.
   *
   * Steps:
   *  1. Create a PerspectiveCamera and position it behind/above the water.
   *  2. Create the WebGLRenderer, enable shadows, and append its canvas.
   *  3. Do an initial refraction pre-render (captures scene before animation).
   *  4. Set up OrbitControls for interactive camera movement.
   *  5. Build the skybox, objects, water plane, and lights.
   *  6. Start the animation loop.
   */
  initializeScene(container: HTMLDivElement): void {
    // ── Camera ────────────────────────────────────────────────────────────────
    // 75° FOV gives a natural wide-angle view similar to a human field of view.
    this.camera = new THREE.PerspectiveCamera(
      75,
      container.clientWidth / container.clientHeight,
      0.1,    // near plane (objects closer than 0.1 units are clipped)
      1000    // far plane  (objects farther than 1000 units are clipped)
    );
    this.camera.position.z = 5; // start 5 units in front of the origin

    // ── Renderer ──────────────────────────────────────────────────────────────
    this.renderer = new THREE.WebGLRenderer();
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.shadowMap.enabled = true;              // enable PCF shadow maps
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap; // softer shadow edges
    container.appendChild(this.renderer.domElement);     // attach canvas to the DOM div

    // ── Initial refraction pre-pass ───────────────────────────────────────────
    // Clip everything below the water plane (y < 0) and render the scene into
    // the refraction texture. This gives the water shader its first "underwater"
    // image even before the animation loop starts.
    const underwaterClipPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
    this.renderer.clippingPlanes = [underwaterClipPlane]; // only show geometry above y = 0
    this.renderer.setRenderTarget(this.refractionTarget);  // render into texture, not screen
    this.renderer.render(this.scene, this.camera!);
    this.renderer.clippingPlanes = [];                     // remove clipping for normal render
    this.renderer.setRenderTarget(null);                   // switch back to screen framebuffer

    // ── Orbit Controls ────────────────────────────────────────────────────────
    // Lets the user rotate, pan, and zoom the camera with the mouse/touch.
    // Damping gives the motion a smooth deceleration feel.
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;

    // ── Skybox ────────────────────────────────────────────────────────────────
    // The cubemap is used both as the scene background AND as the reflection
    // environment map sampled in the water fragment shader (uEnvMap).
    const envMap:CubeTexture = this.scene.background = this.geometryManager.createCubeBox();

    // ── Scene objects ─────────────────────────────────────────────────────────
    const sphere = this.geometryManager.createSphere({
      radius: 1,
      position: { x: 3, y: 2, z: 0 }, // floating above and beside the water
    });
    this.scene.add(sphere);

    const cube = this.geometryManager.createCube(); // sits below the water surface
    this.scene.add(cube);
    
    // The water plane receives the envMap for reflections and the refraction
    // render-target texture for the underwater distortion effect.
    const plane = this.geometryManager.createPlane(envMap,this.refractionTarget.texture);
    this.scene.add(plane);
    
    // ── Lighting ──────────────────────────────────────────────────────────────
    this.lightManager.createPointLight(this.scene, new Vector3(0, 5, 0)); // overhead point light
    this.lightManager.createAmbientLight(this.scene);                     // soft fill light

    // ── Start render loop ─────────────────────────────────────────────────────
    // Pass [cube, plane] so animate() can reference both objects:
    //   index 0 = cube  (currently unused for rotation but available)
    //   index 1 = plane (water surface – needs uniform updates each frame)
    this.animate([cube, plane]);
  }
  
  /**
   * Per-frame animation callback.
   *
   * Two-pass render strategy
   * ─────────────────────────
   * Water transparency / refraction requires that the scene be rendered twice:
   *
   *  Pass 1 (Refraction pass)
   *    - Hide the water plane so it does not occlude the underwater geometry.
   *    - Render the scene into `refractionTarget` (off-screen texture).
   *    - This texture is sampled in the fragment shader as `uRefractionMap`.
   *
   *  Pass 2 (Final render)
   *    - Restore the water plane.
   *    - Render the scene normally to the screen. The water shader blends
   *      the refraction texture with reflections using the Fresnel equation.
   *
   * @param rotatingObject - [cube, waterPlane] from initializeScene
   */
  animate = (rotatingObject: Mesh[]): void => {

    // rotatingObject.forEach(obj=>{
    //   obj.rotation.x += 0.01;
    //   obj.rotation.y += 0.01;
    // })

    // ── Update water shader uniforms ──────────────────────────────────────────
    // uTime drives the Gerstner wave animation in the vertex shader.
    (rotatingObject[1].material as ShaderMaterial).uniforms.uTime.value = this.clock.getElapsedTime();
    // cameraPosition is used for Fresnel and specular calculations in the fragment shader.
    (rotatingObject[1].material as ShaderMaterial).uniforms.cameraPosition.value.copy(this.camera!.position);

    // ── Pass 1: Refraction render ─────────────────────────────────────────────
    // Hide the water plane so we can see what's below the surface.
    rotatingObject[1].visible = false;
    // Redirect rendering output to the off-screen framebuffer.
    this.renderer?.setRenderTarget(this.refractionTarget);
    this.renderer?.render(this.scene, this.camera!);
    // Restore the default framebuffer (the screen).
    this.renderer?.setRenderTarget(null);

    // ── Pass 2: Final composite render ───────────────────────────────────────
    // Show the water plane again; the shader will blend refraction + reflection.
    rotatingObject[1].visible = true;
    this.renderer?.render(this.scene, this.camera!);

    // Update OrbitControls damping (must be called each frame when damping is enabled)
    this.controls?.update();

    // Schedule the next frame
    requestAnimationFrame(() => this.animate(rotatingObject));
  }
  
  /**
   * Handles browser window resize events.
   * Updates the camera's aspect ratio and the renderer's output size so the
   * scene always fills the container div without stretching.
   */
  onWindowResize = (): void => {
    if (this.camera && this.renderer) {
      this.camera.aspect = this.container.clientWidth / this.container.clientHeight;
      this.camera.updateProjectionMatrix(); // must be called after changing camera properties
      this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    }
  }
}
