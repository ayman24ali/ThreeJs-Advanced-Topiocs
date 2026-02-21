import * as THREE from "three";
import {VertexShader} from "./shaders/vertex-shader";
import {FragmentShader} from "./shaders/fragment-shader";

/**
 * GeometryManager
 * ---------------
 * Factory class responsible for creating and configuring Three.js mesh
 * objects used in the scene.
 *
 * Responsibilities:
 *  - Constructing raw geometries (BoxGeometry, PlaneGeometry).
 *  - Assigning the correct material (basic colour or custom GLSL shader).
 *  - Setting initial transforms (position, rotation) and shadow flags.
 */
export class GeometryManager {

  constructor() {
  }

  /**
   * Creates a simple green unit cube for quick scene testing.
   * The cube is positioned 2 units above the origin and has shadow
   * casting/receiving enabled so it interacts with scene lights.
   *
   * @returns A THREE.Mesh representing the cube.
   */
  createCube = () => {
    const geometry = new THREE.BoxGeometry();
    const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
    const cube = new THREE.Mesh(geometry, material);

    cube.position.set(0, 2, 0);
    cube.castShadow = true;    // Enable shadow casting for the cube
    cube.receiveShadow = true; // Optional: if you want the cube to receive shadows too

    return cube;
  }

  /**
   * Creates the terrain plane mesh with a custom GLSL shader material.
   *
   * The plane is subdivided into (widthSegment × heightSegment) quads so
   * the terrain generator can displace each vertex along the Z axis.
   * After construction, the caller is expected to:
   *   1. Iterate `plane.geometry.attributes.position` and set Z heights.
   *   2. Call `geometry.computeVertexNormals()` to recalculate normals.
   *   3. Update `uMinHeight` / `uMaxHeight` uniforms with the actual range.
   *
   * Shader uniforms provided at creation:
   *  - uMinHeight  {float}  — lowest vertex height (used to normalise colour).
   *  - uMaxHeight  {float}  — highest vertex height.
   *  - uSunDir     {vec3}   — normalised direction toward the sun light source.
   *
   * The plane is rotated −90° around X so it lies flat (Three.js PlaneGeometry
   * is vertical by default) and positioned at the world origin.
   *
   * @param width          - Total width of the plane in world units.
   * @param height         - Total depth of the plane in world units.
   * @param widthSegment   - Number of column subdivisions.
   * @param heightSegment  - Number of row subdivisions.
   * @returns A THREE.Mesh ready to receive vertex displacement.
   */
  createPlane = (width: number, height: number, widthSegment: number, heightSegment: number) => {
    const geometry = new THREE.PlaneGeometry(width, height, widthSegment, heightSegment);

    // ShaderMaterial wires our custom GLSL vertex/fragment programs to Three.js.
    // The `uniforms` object is the bridge between JavaScript and GLSL — any
    // property here becomes accessible inside the shaders as a `uniform`.
    const material = new THREE.ShaderMaterial({
      vertexShader: VertexShader,
      fragmentShader: FragmentShader,
      uniforms: {
        uMinHeight: { value: -200.0 },                                    // placeholder — updated after displacement
        uMaxHeight: { value: 200.0 },                                     // placeholder — updated after displacement
        uSunDir:    { value: new THREE.Vector3(1.2, 2.0, 0.8).normalize() }, // sun direction vector
      }
    });

    const plane = new THREE.Mesh(geometry, material);

    plane.position.set(0, 0, 0);
    plane.rotation.x = -Math.PI / 2; // Rotate flat: PlaneGeometry faces +Z by default
    plane.receiveShadow = true;       // Enable shadow receiving for the ground

    console.log(plane.geometry.attributes);

    return plane;
  }
}