import * as THREE from "three";

/**
 * GeometryManager
 *
 * Responsible for creating and configuring all 3D mesh objects in the scene.
 * Each method returns a fully configured `THREE.Mesh` ready to be added to
 * the scene via `scene.add()`.
 */
export class GeometryManager {
  
  constructor() {
  }

  /**
   * Creates the primary emissive cube used to demonstrate the bloom effect.
   *
   * The cube uses a `MeshStandardMaterial` with:
   *  - A black base colour (so only emissive light is visible).
   *  - An orange HDR emissive colour (RGB values > 1.0) that pushes the pixel
   *    luminance well above the bloom threshold, causing it to glow.
   *  - An `emissiveIntensity` of 3.0 to amplify the emission into HDR range.
   *
   * Shadow casting and receiving are both enabled.
   *
   * @returns A `THREE.Mesh` box positioned at (0, 1.5, 0).
   */
  createCube = ()=>{
    const geometry = new THREE.BoxGeometry();
    const material =  new THREE.MeshStandardMaterial({
      color: 0x000000,
      emissive: new THREE.Color(2.0, 0.5, 0.0),  // orange, intensity > 1.0
      emissiveIntensity: 3.0,                      // this pushes it into HDR range
    })
    const cube = new THREE.Mesh(geometry, material)
    cube.position.set(0, 1.5, 0);
    // cube.position.set(0, 2, 0);
    cube.castShadow = true; // Enable shadow casting for the cube
    cube.receiveShadow = true; // Optional: if you want the cube to receive shadows too
    
    return cube
  }

  /**
   * Creates a large flat ground plane that acts as the non-emissive surface
   * in the scene. Because its colour is very dark (`0x111122`), its luminance
   * sits well below the bloom threshold and it will not glow — demonstrating
   * selective bloom on emissive-only objects.
   *
   * `THREE.DoubleSide` is used so the plane is visible from both sides.
   * Shadow receiving is enabled so point-light shadows fall on it.
   *
   * @returns A `THREE.Mesh` plane (10×10 units) lying flat on the XZ plane at y=0.
   */
  createPlane = () =>{
    const geometry = new THREE.PlaneGeometry( 10, 10 );
    const material = new THREE.MeshBasicMaterial( {color: 0x111122 , side: THREE.DoubleSide} );
    const plane = new THREE.Mesh( geometry, material );
    
    plane.position.set(0,0,0);
    plane.rotation.x = -Math.PI / 2;
    plane.receiveShadow = true; // Enable shadow receiving for the ground
    return plane
  }

  /**
   * Placeholder for creating a sphere mesh.
   * Not yet implemented.
   *
   * @returns `void` — to be implemented in a future iteration.
   */
  createSphere = ()=>{
  
  }
}