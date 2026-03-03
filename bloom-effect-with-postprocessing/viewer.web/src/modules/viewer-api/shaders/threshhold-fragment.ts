/**
 * thresholdFragmentShader  (Bright-Pass Filter)
 *
 * First stage of the bloom pipeline. Reads the scene texture and discards any
 * pixel whose luminance is below the configured threshold, leaving only the
 * brightest (HDR / emissive) areas.
 *
 * Uniforms:
 *  - `tDiffuse`    {sampler2D} — Input scene texture (auto-filled by EffectComposer).
 *  - `uThreshold`  {float}     — Luminance value above which a pixel is considered "bright".
 *                                Default: 1.0 (above standard SDR range, catches HDR emissives).
 *  - `uKnee`       {float}     — Half-width of the smooth transition zone around the threshold.
 *                                Default: 0.1 — avoids a hard cutoff line.
 *
 * Algorithm:
 *  1. Sample the input colour.
 *  2. Compute the ITU-R BT.709 relative luminance: `luma = dot(rgb, vec3(0.2126, 0.7152, 0.0722))`.
 *  3. Use `smoothstep(threshold - knee, threshold + knee, luma)` to get a 0–1 contribution factor.
 *  4. Multiply the original colour by the contribution — dark pixels become black,
 *     bright pixels pass through at full strength.
 */
//language=GLSL
export const thresholdFragmentShader = `
   uniform sampler2D tDiffuse;
   uniform float uThreshold;
   uniform float uKnee;
   varying vec2 vUv;

   float cgLuma(vec3 color) {
      return dot(color, vec3(0.2126, 0.7152, 0.0722));
   }

   void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      float lum = cgLuma(color.rgb);

      float contribution = smoothstep(uThreshold - uKnee, uThreshold + uKnee, lum);
      gl_FragColor = vec4(color.rgb * contribution, 1.0);
   }
   `;