import {Mesh, RenderTarget, Vector3} from "three";
import * as THREE from "three";
import {GeometryManager} from "./managers/geometry-manager";
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import {LightManager} from "./managers/light-manager";
import {EffectComposer} from "three/examples/jsm/postprocessing/EffectComposer";
import {RenderPass} from "three/examples/jsm/postprocessing/RenderPass";
import {fullscreenVertexShader} from "./shaders/fullscreen-vertex-shader";
import {thresholdFragmentShader} from "./shaders/threshhold-fragment";
import {ShaderPass} from "three/examples/jsm/postprocessing/ShaderPass";
import {gaussianBlurFragmentShader} from "./shaders/gaussianBlurFragmentShader";
import {compositeFragmentShader} from "./shaders/composite-fragment-shader";

/**
 * ViewerManager
 *
 * Central orchestrator for the Three.js bloom-effect POC.
 *
 * Responsibilities:
 *  - Creates and owns the Three.js Scene, Camera, Renderer, and OrbitControls.
 *  - Builds the manual bloom post-processing pipeline:
 *      1. Renders the scene into `sceneRenderTarget` (preserves original pixels).
 *      2. Feeds that texture through a ThresholdPass (bright-pass filter).
 *      3. Applies 100× separable Gaussian blur passes (H then V).
 *      4. Composites the blurred bloom on top of the original scene.
 *  - Drives the animation loop via `requestAnimationFrame`.
 *  - Handles window resize events.
 */
export class ViewerManager {
  /** PrimeReact toast ref for in-app notifications. */
  toast: any;
  /** The Three.js scene that holds all 3D objects and lights. */
  scene: THREE.Scene;
  /** Perspective camera used to view the scene. */
  camera: THREE.PerspectiveCamera | undefined;
  /** WebGL renderer that draws to the canvas. */
  renderer: THREE.WebGLRenderer | undefined;
  /** The HTML div element the renderer's canvas is appended to. */
  container: HTMLDivElement;
  /** OrbitControls — enables mouse-driven camera rotation, pan and zoom. */
  controls!: OrbitControls;
  /** Manages creation and configuration of scene geometry (cube, plane). */
  geometryManager: GeometryManager;
  /** Manages creation and configuration of lights. */
  lightManager:LightManager;
  /** Three.js EffectComposer that chains all post-processing passes. */
  composer:EffectComposer|undefined;
  /** Clock used for time-based animation (available for future use). */
  clock:THREE.Clock;
  /** Horizontal Gaussian blur ShaderPass (direction = (1,0)). */
  blurPassH:ShaderPass|undefined;
  /** Vertical Gaussian blur ShaderPass (direction = (0,1)). */
  blurPassV:ShaderPass|undefined;
  /** Bright-pass threshold ShaderPass — isolates HDR/emissive pixels. */
  thresholdPass:ShaderPass | undefined;
  /** Final composite ShaderPass — merges original scene with bloom result. */
  compositePass:ShaderPass | undefined;
  /** TexturePass that feeds `sceneRenderTarget` as the first step of the composer chain. */
  texturePass:any;
  /**
   * Off-screen render target that captures the full original scene each frame.
   * Its texture is used as `tOriginal` in the composite pass so non-glowing
   * elements remain visible in the final output.
   */
  sceneRenderTarget: THREE.WebGLRenderTarget<THREE.Texture>;

  /**
   * Creates a new ViewerManager, sets up the render target, initialises the
   * scene, and attaches window event listeners.
   *
   * @param containerRef - The HTML div that will host the WebGL canvas.
   * @param toast        - PrimeReact toast ref for showing notifications.
   */
  constructor(containerRef: HTMLDivElement, toast: any) {
    this.toast = toast;
    this.container = containerRef;
    this.scene = new THREE.Scene();
    this.geometryManager = new GeometryManager();
    this.lightManager = new LightManager();
    this.clock = new THREE.Clock();


    this.sceneRenderTarget = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
    });


    this.initializeScene(containerRef);
    this.attachEvents();
  }
  
  /**
   * Attaches global window event listeners (currently: resize).
   */
  attachEvents = (): void => {
    window.addEventListener('resize', this.onWindowResize);
  }
  
  /**
   * Builds the complete Three.js scene and bloom post-processing pipeline.
   *
   * Steps performed:
   *  1. Creates the PerspectiveCamera and WebGLRenderer.
   *  2. Creates the EffectComposer with a TexturePass as the entry point.
   *  3. Attaches OrbitControls to the camera.
   *  4. Adds a cube (emissive HDR material) and a ground plane to the scene.
   *  5. Adds a PointLight and an AmbientLight.
   *  6. Constructs and chains the ThresholdPass, 100× Blur passes, and CompositePass.
   *  7. Kicks off the animation loop.
   *
   * @param container - The HTML div element used for sizing and canvas attachment.
   */
  initializeScene(container: HTMLDivElement): void {
    this.scene.background = new THREE.Color(0x050510);
    // Initialize camera and renderer
    this.camera = new THREE.PerspectiveCamera(
      75,
      container.clientWidth / container.clientHeight,
      0.1,
      1000
    );
    this.camera.position.z = 5;

    this.renderer = new THREE.WebGLRenderer();
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.shadowMap.enabled = true; // Enable shadows
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Optional: softer shadows
    container.appendChild(this.renderer.domElement);

    this.composer = new EffectComposer(this.renderer);
    const renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(renderPass);

    // Initialize OrbitControls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true; // Smooth controls
    this.controls.dampingFactor = 0.05;
    
    const cube = this.geometryManager.createCube()
    this.scene.add(cube);
    
    const plane = this.geometryManager.createPlane();
    this.scene.add(plane);
    
    this.lightManager.createPointLight(this.scene,new Vector3(0,5,0))
    this.lightManager.createAmbientLight(this.scene);

    const thresholdPass  = {
         uniforms: {
           tDiffuse: { value: null },       // EffectComposer auto-fills this
           uThreshold: { value: 1.0 },
           uKnee: { value: 0.1 },
         },
      vertexShader: fullscreenVertexShader,
      fragmentShader: thresholdFragmentShader,
    }

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

    this.thresholdPass = new ShaderPass(thresholdPass);
    this.composer.addPass(this.thresholdPass);
    for (let i = 0; i < 100; i++) {
      this.composer.addPass(this.createBlurPassH(BlurShaderH));
      this.composer.addPass(this.createBlurPassV(BlurShaderV));
    }


    const compositeShader = {
      uniforms: {
        tDiffuse: { value: null },
        tOriginal: { value: null },        // set after construction
        uBloomStrength: { value: 1.5 },
      },
      vertexShader: fullscreenVertexShader,
      fragmentShader: compositeFragmentShader,
    };

    const compositePass = new ShaderPass(compositeShader);
    compositePass.uniforms.tOriginal.value = this.sceneRenderTarget.texture;
    this.composer.addPass(compositePass);  // must be LAST in the chain

    // Start animation loop
    this.animate(cube);
  }
  /**
   * Creates a new horizontal Gaussian blur ShaderPass from the provided shader descriptor.
   * Called in a loop to create 100 independent horizontal blur passes.
   *
   * @param BlurShaderH - Shader descriptor with uniforms for horizontal blur direction.
   * @returns A configured `ShaderPass` instance for horizontal blurring.
   */
  createBlurPassH(BlurShaderH:any){
    return new ShaderPass(BlurShaderH);
  }
  /**
   * Creates a new vertical Gaussian blur ShaderPass from the provided shader descriptor.
   * Called in a loop to create 100 independent vertical blur passes.
   *
   * @param BlurShaderV - Shader descriptor with uniforms for vertical blur direction.
   * @returns A configured `ShaderPass` instance for vertical blurring.
   */
  createBlurPassV(BlurShaderV:any){
    return new ShaderPass(BlurShaderV);
  }
  /**
   * Main animation loop, driven by `requestAnimationFrame`.
   *
   * Each frame:
   *  1. Rotates the target mesh slightly on X and Y axes.
   *  2. Updates OrbitControls (required for damping to work).
   *  3. Renders the scene into `sceneRenderTarget` to capture the original pixels.
   *  4. Refreshes the `TexturePass` and `compositePass` uniforms so they always
   *     reference the latest frame's original texture.
   *  5. Runs the EffectComposer chain (TexturePass → Threshold → Blur×100 → Composite)
   *     and outputs the bloom-composited result to the screen.
   *
   * @param rotatingObject - The mesh to rotate each frame (the emissive cube).
   */
  animate = (rotatingObject: Mesh): void => {
    rotatingObject.rotation.x += 0.01;
    rotatingObject.rotation.y += 0.01;

    // Save original scene to render target
    this.renderer!.setRenderTarget(this.sceneRenderTarget);
    this.renderer!.render(this.scene, this.camera!);
    this.renderer!.setRenderTarget(null);

    // Composer runs threshold → blur passes → composite
    this.composer?.render();

    requestAnimationFrame(() => this.animate(rotatingObject));
  }
  
  /**
   * Handles browser window resize events.
   * Updates the camera aspect ratio and the renderer's output size to match
   * the container's new dimensions.
   */
  onWindowResize = (): void => {
    if (this.camera && this.renderer) {
      this.camera.aspect = this.container.clientWidth / this.container.clientHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    }
  }
}
