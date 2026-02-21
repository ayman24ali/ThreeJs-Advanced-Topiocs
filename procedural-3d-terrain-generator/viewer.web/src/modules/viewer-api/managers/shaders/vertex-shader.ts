/**
 * VertexShader
 * ------------
 * Runs once per vertex on the GPU.  Its two jobs are:
 *  1. Pass interpolated data (varyings) down to the fragment shader.
 *  2. Project each vertex into clip space for rasterisation.
 *
 * Varyings produced:
 *  - vHeight   : raw Z coordinate of the vertex in object space.
 *                The fragment shader uses this to pick a biome colour.
 *  - vNormal   : surface normal transformed into view (camera) space.
 *                Used for the diffuse + rim lighting calculation.
 *  - vPosition : vertex position in view space (camera at origin).
 *                Used for the rim-light view-direction computation.
 *
 * Important: Three.js PlaneGeometry is created in the XY plane and then
 * rotated −90° on X so it lies flat.  Vertex displacement is applied to
 * the Z axis BEFORE the rotation, so Z effectively becomes the height.
 * That is why `vHeight = position.z` (not position.y).
 *
 * Built-in Three.js uniforms used (injected automatically):
 *  - projectionMatrix  : maps view space → clip space (perspective).
 *  - modelViewMatrix   : combines model→world and world→view transforms.
 *  - normalMatrix      : inverse-transpose of modelViewMatrix, used to
 *                        correctly transform normals under non-uniform scale.
 */
//language=glsl
export const VertexShader = `
    precision highp float;

    /* --- Varyings (outputs sent to the fragment shader) --- */
    varying float vHeight;    // raw height in object space (used for biome colour)
    varying vec3  vNormal;    // normal in view space (used for lighting)
    varying vec3  vPosition;  // position in view space (used for rim light)

    void main() {
        // Height is stored in the Z channel because the geometry is rotated
        // flat in the scene — Z in object space == Y in world space (up).
        vHeight   = position.z;

        // Transform the normal into view space using the normal matrix
        // (avoids distortion when the model is scaled non-uniformly).
        vNormal   = normalize(normalMatrix * normal);

        // View-space position for the rim-light direction calculation.
        vPosition = (modelViewMatrix * vec4(position, 1.0)).xyz;

        // Standard MVP transform: object space → clip space.
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`