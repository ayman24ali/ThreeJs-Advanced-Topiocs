import {Scene, Vector3} from "three";
import * as THREE from "three";

/**
 * LightManager
 *
 * Responsible for creating and adding light sources to the Three.js scene.
 * Lights are added directly to the provided `scene` rather than returned,
 * so no further wiring is needed by the caller.
 */
export class LightManager {
  
  constructor() {
  }

  /**
   * Creates a red `PointLight` and adds it (plus a visual helper sphere)
   * to the scene at the given position.
   *
   * A `PointLightHelper` with radius 1 is also added so the light position
   * is visible in the viewport during development.
   *
   * @param scene    - The Three.js scene to add the light and helper to.
   * @param position - World-space position for the point light (e.g. (0, 5, 0) above the scene).
   */
  createPointLight = (scene:Scene, position:Vector3)=>{
    const pointLight = new THREE.PointLight( 0xff0000, 2, 100 );
    pointLight.position.set( position.x, position.y, position.z );
    scene.add( pointLight );
    
    const sphereSize = 1;
    const pointLightHelper = new THREE.PointLightHelper( pointLight, sphereSize );
    scene.add( pointLightHelper );
  }

  /**
   * Creates a soft `AmbientLight` and adds it to the scene.
   *
   * Ambient light illuminates all objects equally from every direction with no
   * shadows. It prevents completely unlit (pitch-black) faces on geometry that
   * is not directly facing the point light.
   *
   * Colour: `0x404040` (dark grey — subtle fill light).
   *
   * @param scene - The Three.js scene to add the ambient light to.
   */
  createAmbientLight = (scene:Scene)=>{
    // Add Ambient Light
    const ambientLight = new THREE.AmbientLight(0x404040); // Soft light
    scene.add(ambientLight);
  }
  
}