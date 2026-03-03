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

export class ViewerManager {
  toast: any;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera | undefined;
  renderer: THREE.WebGLRenderer | undefined;
  container: HTMLDivElement;
  controls!: OrbitControls;
  geometryManager: GeometryManager;
  lightManager:LightManager;
  composer:EffectComposer|undefined;
  clock:THREE.Clock;
  blurPassH:ShaderPass|undefined;
  blurPassV:ShaderPass|undefined;
  thresholdPass:ShaderPass | undefined;
  sceneRenderTarget: THREE.WebGLRenderTarget<THREE.Texture>;
  
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
  
  attachEvents = (): void => {
    window.addEventListener('resize', this.onWindowResize);
  }
  
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
  createBlurPassH(BlurShaderH:any){
    return new ShaderPass(BlurShaderH);
  }
  createBlurPassV(BlurShaderV:any){
    return new ShaderPass(BlurShaderV);
  }
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
  
  onWindowResize = (): void => {
    if (this.camera && this.renderer) {
      this.camera.aspect = this.container.clientWidth / this.container.clientHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    }
  }
}
