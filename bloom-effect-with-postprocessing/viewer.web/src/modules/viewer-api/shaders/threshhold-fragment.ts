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