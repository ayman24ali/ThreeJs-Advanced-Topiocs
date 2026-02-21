import {Scene, Vector3} from "three";
import * as THREE from "three";

/**
 * LightManager
 * ------------
 * Factory class for creating and adding Three.js light objects to a scene.
 *
 * Lighting strategy used in this project:
 *  - AmbientLight  : fills all shadows with a soft base colour so no face
 *                    goes completely black.
 *  - PointLight    : simulates a small, localised light source (e.g. a lamp
 *                    or debug marker) that radiates in all directions.
 *
 * Note: The sun's directional contribution to terrain shading is handled
 * entirely in the fragment shader via the `uSunDir` uniform — it does NOT
 * require a Three.js DirectionalLight object.
 */
export class LightManager {

  constructor() {
  }

  /**
   * Creates a red PointLight and adds it (along with a visual helper sphere)
   * to the provided scene.
   *
   * PointLight parameters:
   *  - color    : 0xff0000 (red) — useful as a visible debug marker.
   *  - intensity: 2        — brightness multiplier.
   *  - distance : 100      — the light fades to zero at this world-unit radius.
   *
   * A PointLightHelper (wireframe sphere) is also added so the light's
   * position is visible in the viewport during development.
   *
   * @param scene    - The Three.js scene to add the light to.
   * @param position - World-space position of the light source.
   */
  createPointLight = (scene: Scene, position: Vector3) => {
    const pointLight = new THREE.PointLight(0xff0000, 2, 100);
    pointLight.position.set(position.x, position.y, position.z);
    scene.add(pointLight);

    // PointLightHelper draws a small wireframe sphere at the light's position
    const sphereSize = 1;
    const pointLightHelper = new THREE.PointLightHelper(pointLight, sphereSize);
    scene.add(pointLightHelper);
  }

  /**
   * Creates a soft AmbientLight and adds it to the provided scene.
   *
   * AmbientLight illuminates every surface equally from all directions —
   * it has no position or direction.  It prevents shadowed faces from
   * rendering as pure black, giving the terrain a more natural look.
   *
   * Color 0x404040 is a dark grey that provides subtle fill lighting
   * without washing out the shader's diffuse calculation.
   *
   * @param scene - The Three.js scene to add the light to.
   */
  createAmbientLight = (scene: Scene) => {
    // Add Ambient Light
    const ambientLight = new THREE.AmbientLight(0x404040); // Soft dark-grey light
    scene.add(ambientLight);
  }

}