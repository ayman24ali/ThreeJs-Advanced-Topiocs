
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