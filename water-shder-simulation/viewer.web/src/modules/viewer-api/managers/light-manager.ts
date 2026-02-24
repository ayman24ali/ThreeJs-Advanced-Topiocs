import {Scene, Vector3} from "three";
import * as THREE from "three";

/**
 * LightManager
 *
 * Encapsulates the creation of all lights in the scene.
 * Two lights are used:
 *  - PointLight  : acts as the primary light source (sun/lamp) that drives
 *                  shadows and specular highlights on the water surface.
 *  - AmbientLight: provides a base level of illumination so the scene never
 *                  goes completely black in areas not reached by the point light.
 */
export class LightManager {
  
  constructor() {
  }
  
  /**
   * Creates a red PointLight at the given world position and adds it to the scene.
   *
   * A PointLight emits light equally in all directions from a single point
   * in space, similar to a bare light bulb. The colour 0xff0000 (red) is used
   * here to make the light contribution easy to spot during development.
   *
   * A PointLightHelper sphere is also added so the light position is visible
   * in the viewport while authoring the scene.
   *
   * @param scene    - The Three.js Scene to add the light to
   * @param position - World-space position of the light
   */
  createPointLight = (scene:Scene, position:Vector3)=>{
    // Colour 0xff0000 = red | intensity 2 | distance 100 (light fades to 0 at 100 units)
    const pointLight = new THREE.PointLight( 0xff0000, 2, 100 );
    pointLight.position.set( position.x, position.y, position.z );
    scene.add( pointLight );
    
    // PointLightHelper draws a small wireframe sphere at the light's position
    // so you can see where it is in the 3-D view. Remove in production.
    const sphereSize = 1;
    const pointLightHelper = new THREE.PointLightHelper( pointLight, sphereSize );
    scene.add( pointLightHelper );
  }
  
  /**
   * Adds a soft AmbientLight to the scene.
   *
   * AmbientLight uniformly illuminates every surface in the scene regardless
   * of its facing direction. It has no position and casts no shadows.
   * Colour 0x404040 is a dark grey that lifts the shadow areas slightly
   * without washing out the scene.
   *
   * @param scene - The Three.js Scene to add the light to
   */
  createAmbientLight = (scene:Scene)=>{
    const ambientLight = new THREE.AmbientLight(0x404040); // Soft, non-directional fill light
    scene.add(ambientLight);
  }
  
}