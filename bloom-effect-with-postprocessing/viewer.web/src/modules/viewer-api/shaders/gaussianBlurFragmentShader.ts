/**
 * gaussianBlurFragmentShader  (Separable Gaussian Blur)
 *
 * Second stage of the bloom pipeline (applied 100× — 100 horizontal + 100 vertical passes).
 * Blurs the bright-pass result outward to create the characteristic soft glow/halo
 * that spreads from emissive objects.
 *
 * Because a full 2-D Gaussian is separable, this shader is applied twice per
 * iteration — once horizontally and once vertically — producing the same result as a
 * 2-D convolution at a fraction of the cost.
 *
 * Uniforms:
 *  - `tDiffuse`     {sampler2D} — Input texture from the previous pass (auto-filled by EffectComposer).
 *  - `uDirection`   {vec2}      — Blur axis: `(1.0, 0.0)` for horizontal, `(0.0, 1.0)` for vertical.
 *  - `uResolution`  {vec2}      — Viewport dimensions in pixels, used to convert offsets to UV space.
 *
 * Algorithm:
 *  - 9-tap (radius 4) Gaussian kernel with weights:
 *    `[0.227027, 0.194595, 0.121622, 0.054054, 0.016216]`
 *  - The centre texel is sampled once; the 4 symmetric pairs are sampled with
 *    increasing pixel offsets along `uDirection`.
 *  - Running the pass 100 times greatly widens the blur radius, creating a
 *    large, soft glow suitable for HDR bloom.
 */
//language=GLSL
export const gaussianBlurFragmentShader = `
     uniform sampler2D tDiffuse;
     uniform vec2 uDirection;    // (1,0) for horizontal, (0,1) for vertical
     uniform vec2 uResolution;
     varying vec2 vUv;
     
     void main() {
       vec2 texelSize = 1.0 / uResolution;
       vec4 result = vec4(0.0);
       
       // 9-tap Gaussian kernel weights
       float weights[5];
       weights[0] = 0.227027;
       weights[1] = 0.1945946;
       weights[2] = 0.1216216;
       weights[3] = 0.054054;
       weights[4] = 0.016216;
       
       // Center sample
       result += texture2D(tDiffuse, vUv) * weights[0];
       
       // Symmetric samples
       for (int i = 1; i < 5; i++) {
         vec2 offset = uDirection * texelSize * float(i);
         result += texture2D(tDiffuse, vUv + offset) * weights[i];
         result += texture2D(tDiffuse, vUv - offset) * weights[i];
       }
       
       gl_FragColor = result;
     }
   `;