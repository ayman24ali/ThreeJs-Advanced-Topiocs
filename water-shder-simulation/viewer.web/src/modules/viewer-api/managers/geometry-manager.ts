import * as THREE from "three";
import {VertexShader} from "../shaders/vertex-shader";
import {FragmentShader} from "../shaders/fragment-shader";
import {Color, CubeTexture, Vector3} from "three";

/**
 * GeometryManager
 *
 * Central factory for all Three.js geometry in the scene.
 * It creates:
 *  - A simple cube (placeholder object floating in the water)
 *  - The animated water plane (using custom GLSL shaders)
 *  - A reflective sphere
 *  - The skybox cubemap environment
 */
export class GeometryManager {

    constructor() {
    }

    /**
     * Creates a simple green box that sits partially submerged in the water.
     * Uses MeshBasicMaterial so it is unaffected by lights and always visible
     * both above and below the water surface.
     */
    createCube = () => {
        const geometry = new THREE.BoxGeometry(2, 2, 2);
        const material = new THREE.MeshBasicMaterial({color: 0x44ff44});
        const cube = new THREE.Mesh(geometry, material)

        // Position the cube so it is partially below the water plane (y = 0)
        cube.position.set(-2, -3, 1);
        // cube.castShadow = true;    // Enable shadow casting for the cube
        // cube.receiveShadow = true; // Optional: if you want the cube to receive shadows too

        return cube
    }

    /**
     * Creates the animated water surface plane.
     *
     * Geometry:
     *  - PlaneGeometry with 256×256 segments gives enough vertex density for
     *    the Gerstner wave displacement to look smooth.
     *
     * Material:
     *  - THREE.ShaderMaterial wires up our custom vertex + fragment shaders.
     *  - All wave parameters, lighting values, and texture samplers are passed
     *    in as uniforms so they can be updated every frame or tweaked at runtime.
     *
     * @param envMap        - The skybox CubeTexture used for reflections
     * @param texture       - The WebGLRenderTarget texture holding the refraction image
     */
    createPlane = (envMap:CubeTexture,texture:any) => {
        // High vertex count (256×256) is essential so the Gerstner displacement
        // produces a smooth wave shape rather than a faceted polygon look.
        const geometry = new THREE.PlaneGeometry(50, 50, 256, 256);

        const material = new THREE.ShaderMaterial({
            vertexShader: VertexShader,
            fragmentShader: FragmentShader,
            uniforms: {
                // ── Water appearance ──────────────────────────────────────────
                // Base tint of the water in RGB (0–1). This deep teal is mixed
                // with the refraction and reflection colours in the fragment shader.
                uWaterColor: {value:new Color(0.0, 0.3, 0.5)},

                // ── Lighting ──────────────────────────────────────────────────
                // World-space position of the key light (used for Blinn-Phong specular).
                uLightPosition:{value:new Vector3(10, 10, 10)},
                // RGB colour of the specular highlight (white = sun-like sparkle).
                uLightColor:{value:new Color(1, 1, 1)},

                // ── Animation ─────────────────────────────────────────────────
                // Elapsed time in seconds; updated every frame in ViewerManager.animate().
                uTime: { value: 0 },

                // ── Gerstner wave layers ──────────────────────────────────────
                // Each vec4 = (dirX, dirZ, amplitude, frequency).
                // Three overlapping waves with different directions/frequencies
                // produce a convincing ocean surface without repeating patterns.
                uWaveA: { value: new THREE.Vector4(1.0, 0.0, 0.3, 2.0) },  // primary swell
                uWaveB: { value: new THREE.Vector4(0.7, 0.7, 0.15, 3.0) }, // diagonal chop
                uWaveC: { value: new THREE.Vector4(-0.4, 0.9, 0.08, 5.0) },// cross-swell ripple

                // ── Reflection ────────────────────────────────────────────────
                // The skybox cubemap. Sampled in the fragment shader along the
                // reflected view direction to render the sky on the water surface.
                uEnvMap: { value: envMap },

                // Camera position is used for the Fresnel and specular calculations.
                // Three.js injects this as a built-in, but we also keep it here so
                // we can copy the camera position each frame for accuracy.
                cameraPosition: { value: new THREE.Vector3() },

                // ── Fresnel ───────────────────────────────────────────────────
                // Power: controls how sharply reflectivity rises toward the horizon.
                //        Higher values produce a thinner reflective band at the edge.
                uFresnelPower: { value: 5.0 },
                // Bias: minimum reflectivity when looking straight down (0 = none).
                uFresnelBias:  { value: 0.02 },

                // ── Refraction ────────────────────────────────────────────────
                // The render-target texture captured with the water plane hidden,
                // representing what is visible beneath the surface.
                uRefractionMap: { value: texture },
                // How strongly the wave normals distort the underwater UVs.
                // 0.02 is subtle; increase toward 0.1+ for a stormy sea look.
                uRefractionStrength: { value: 0.02 },
            },
            transparent: true
        });

        const plane = new THREE.Mesh(geometry, material);

        // The plane is created in the XY plane; rotate it to lie flat in XZ.
        plane.position.set(0, 0, 0);
        plane.rotation.x = -Math.PI / 2;
        plane.receiveShadow = true; // Enable shadow receiving for the ground
        return plane
    }

    /**
     * Creates a MeshStandardMaterial sphere that interacts with the scene lights.
     * It acts as an object floating above/near the water to showcase reflections.
     *
     * All parameters are optional and default to sensible values.
     */
    createSphere = ({
                        radius = 1,
                        widthSegments = 32,
                        heightSegments = 32,
                        color = 0x3aa0ff,
                        position = {x: 0, y: 0, z: 0},
                        rotation = {x: 0, y: 0, z: 0},
                        castShadow = true,
                        receiveShadow = true,
                    } = {}) => {
        // Geometry
        const geometry = new THREE.SphereGeometry(radius, widthSegments, heightSegments);

        // MeshStandardMaterial responds to PointLight and AmbientLight in the scene.
        const material = new THREE.MeshStandardMaterial({
            color,
        });

        // Mesh
        const sphere = new THREE.Mesh(geometry, material);

        // Transform
        sphere.position.set(position.x, position.y, position.z);
        sphere.rotation.set(rotation.x, rotation.y, rotation.z);

        // Shadows
        sphere.castShadow = castShadow;
        sphere.receiveShadow = receiveShadow;

        return sphere;
    };

    /**
     * Loads a skybox cubemap from six face images (px/nx/py/ny/pz/nz).
     *
     * The cubemap is used for two purposes:
     *  1. Scene background – wraps the entire scene in a sky environment.
     *  2. Reflection map   – passed to the water shader as uEnvMap so the
     *     water surface can mirror the sky.
     *
     * Image files must be placed in the /public folder so they are served
     * as static assets by the React dev server.
     */
    createCubeBox = () => {
        const cubeTextureLoader = new THREE.CubeTextureLoader();
        return cubeTextureLoader.load([
            'px.jpg', 'nx.jpg', // +X / -X (right / left)
            'py.jpg', 'ny.jpg', // +Y / -Y (top   / bottom)
            'pz.jpg', 'nz.jpg'  // +Z / -Z (front / back)
        ])
    }
}