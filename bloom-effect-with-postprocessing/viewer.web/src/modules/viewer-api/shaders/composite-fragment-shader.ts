
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