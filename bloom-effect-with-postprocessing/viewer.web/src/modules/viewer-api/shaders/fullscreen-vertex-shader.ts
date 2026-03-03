/**
 * fullscreenVertexShader
 *
 * Shared vertex shader used by every post-processing `ShaderPass` in the
 * bloom pipeline (ThresholdPass, BlurPassH, BlurPassV, CompositePass).
 *
 * Responsibilities:
 *  - Passes the mesh UV coordinates to the fragment shader as `vUv` so
 *    each fragment can sample the input texture at the correct screen position.
 *  - Transforms the vertex position using the standard MVP matrix so the
 *    full-screen quad covers the entire viewport.
 */
//language=GLSL
export const fullscreenVertexShader = `
    varying vec2 vUv;
    void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`