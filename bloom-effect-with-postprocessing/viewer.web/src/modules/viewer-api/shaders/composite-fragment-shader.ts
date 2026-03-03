/**
 * compositeFragmentShader  (Bloom Composite / Merge Pass)
 *
 * Final stage of the bloom pipeline. Merges the blurred bloom texture with the
 * original unmodified scene so that both glowing and non-glowing elements are
 * visible in the final output.
 *
 * Uniforms:
 *  - `tDiffuse`       {sampler2D} — The blurred bloom texture produced by the
 *                                   preceding 100× Gaussian blur passes
 *                                   (auto-filled by EffectComposer as the last
 *                                   pass's write-buffer).
 *  - `tOriginal`      {sampler2D} — The original scene texture captured before
 *                                   the ThresholdPass stripped away dark pixels.
 *                                   Set manually from `sceneRenderTarget.texture`.
 *  - `uBloomStrength` {float}     — Multiplier applied to the bloom contribution.
 *                                   Default: 1.5. Increase for a more intense glow.
 *
 * Formula:
 *  ```glsl
 *  gl_FragColor = original + bloom * uBloomStrength;
 *  ```
 *  Additive blending ensures the bloom only brightens — it never darkens pixels.
 */
//language=GLSL
export const compositeFragmentShader = `
     uniform sampler2D tDiffuse;      // blurred bloom from the previous pass
     uniform sampler2D tOriginal;     // the original scene render
     uniform float uBloomStrength;
     varying vec2 vUv;
     
     void main() {
       vec4 original = texture2D(tOriginal, vUv);
       vec4 bloom = texture2D(tDiffuse, vUv);
       
       gl_FragColor = original + bloom * uBloomStrength;
     }
   `;