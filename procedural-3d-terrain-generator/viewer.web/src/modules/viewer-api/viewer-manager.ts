import {Mesh, Vector3} from "three";
import * as THREE from "three";
import {GeometryManager} from "./managers/geometry-manager";
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import {LightManager} from "./managers/light-manager";
import {TerrainGenerator} from "./managers/terrain-generator";
import {PerlinNoise} from "./managers/perlin-noise";

export class ViewerManager {
  toast: any;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera | undefined;
  renderer: THREE.WebGLRenderer | undefined;
  container: HTMLDivElement;
  controls!: OrbitControls;
  geometryManager: GeometryManager;
  terrainGenerator: TerrainGenerator;
  perlinNoise: PerlinNoise;
  lightManager:LightManager
  
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
  
  attachEvents = (): void => {
    window.addEventListener('resize', this.onWindowResize);
  }
  
  initializeScene(container: HTMLDivElement): void {
    // Initialize camera and renderer
    this.camera = new THREE.PerspectiveCamera(
      75,
      container.clientWidth / container.clientHeight,
      0.1,
      1000000
    );
    this.camera.position.set(0, 400, 600);
    this.camera.lookAt(0, 0, 0);
    
    this.renderer = new THREE.WebGLRenderer();
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.shadowMap.enabled = true; // Enable shadows
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Optional: softer shadows
    container.appendChild(this.renderer.domElement);
    
    // Initialize OrbitControls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true; // Smooth controls
    this.controls.dampingFactor = 0.05;
    
    // const cube = this.geometryManager.createCube()
    // this.scene.add(cube);

    const plane = this.geometryManager.createPlane(1000, 1000, 200, 200);
    this.scene.add(plane);

    const positions = plane.geometry.attributes.position;

    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i);
      const z = positions.getZ(i);
      const h = this.terrainGenerator.fbm(x, z, {
        scale: 0.003,       // was 0.003 — way too zoomed in for a 10x10 plane
        octaves: 6,
        persistence: 0.5,
        lacunarity: 2.0
      }) * 200;
      positions.setZ(i, h);
    }
    positions.needsUpdate = true; // flags the buffer for re-upload to GPU VRAM
    plane.geometry.computeVertexNormals();   // recalculates normals based on new slopes

    // After displacement loop
    let min = Infinity, max = -Infinity;
    for (let i = 0; i < positions.count; i++) {
      const z = positions.getZ(i);
      if (z < min) min = z;
      if (z > max) max = z;
    }

    const mat = plane.material as THREE.ShaderMaterial;
    mat.uniforms.uMinHeight.value = min;
    mat.uniforms.uMaxHeight.value = max;

    
    this.lightManager.createPointLight(this.scene,new Vector3(0,5,0))
    this.lightManager.createAmbientLight(this.scene)
    // Start animation loop
    this.animate();
  }
  
  animate = (rotatingObject?: Mesh): void => {

    // Rotate the cube
    // rotatingObject?.rotation.x += 0.01;
    // rotatingObject?.rotation.y += 0.01;

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
