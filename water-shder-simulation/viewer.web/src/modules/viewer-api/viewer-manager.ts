import * as THREE from "three";
import {CubeTexture, LinearFilter, Mesh, ShaderMaterial, Vector3, WebGLRenderTarget} from "three";
import {GeometryManager} from "./managers/geometry-manager";
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls';
import {LightManager} from "./managers/light-manager";

export class ViewerManager {
  toast: any;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera | undefined;
  renderer: THREE.WebGLRenderer | undefined;
  container: HTMLDivElement;
  controls!: OrbitControls;
  geometryManager: GeometryManager;
  lightManager:LightManager;
  clock: THREE.Clock = new THREE.Clock();
  refractionTarget:WebGLRenderTarget

  constructor(containerRef: HTMLDivElement, toast: any) {
    this.toast = toast;
    this.container = containerRef;
    this.scene = new THREE.Scene();
    this.geometryManager = new GeometryManager();
    this.lightManager = new LightManager();
    this.refractionTarget = new THREE.WebGLRenderTarget(
        window.innerWidth, window.innerHeight,
        { minFilter: LinearFilter, magFilter: LinearFilter }
    );
    this.initializeScene(containerRef);
    this.attachEvents();
  }
  
  attachEvents = (): void => {
    window.addEventListener('resize', this.onWindowResize);
  }
  
  initializeScene(container: HTMLDivElement): void {
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

    const underwaterClipPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
    this.renderer.clippingPlanes = [underwaterClipPlane];
    this.renderer.setRenderTarget(this.refractionTarget);
    this.renderer.render(this.scene, this.camera!);
    this.renderer.clippingPlanes = [];
    this.renderer.setRenderTarget(null);
    
    // Initialize OrbitControls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true; // Smooth controls
    this.controls.dampingFactor = 0.05;

    const envMap:CubeTexture = this.scene.background = this.geometryManager.createCubeBox();

    const sphere = this.geometryManager.createSphere({
      radius: 1,
      position: { x: 3, y: 2, z: 0 },
    });
    this.scene.add(sphere);


    const cube = this.geometryManager.createCube()
    this.scene.add(cube);
    
    const plane = this.geometryManager.createPlane(envMap,this.refractionTarget.texture);
    this.scene.add(plane);
    
    this.lightManager.createPointLight(this.scene,new Vector3(0,5,0))
    this.lightManager.createAmbientLight(this.scene)
    // Start animation loop
    this.animate([cube,plane]);
  }
  
  animate = (rotatingObject: Mesh[]): void => {

    // rotatingObject.forEach(obj=>{
    //   // Rotate the cube
    //   obj.rotation.x += 0.01;
    //   obj.rotation.y += 0.01;
    // })


    (rotatingObject[1].material as ShaderMaterial).uniforms.uTime.value = this.clock.getElapsedTime();
    (rotatingObject[1].material as ShaderMaterial).uniforms.cameraPosition.value.copy(this.camera!.position);

    // Hide water plane
    rotatingObject[1].visible = false;

// Render scene to the refraction texture
    this.renderer?.setRenderTarget(this.refractionTarget);
    this.renderer?.render(this.scene, this.camera!);
    this.renderer?.setRenderTarget(null);

// Show water plane and render normally
    rotatingObject[1].visible = true;
    this.renderer?.render(this.scene, this.camera!);

    this.renderer?.render(this.scene, this.camera!);
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
