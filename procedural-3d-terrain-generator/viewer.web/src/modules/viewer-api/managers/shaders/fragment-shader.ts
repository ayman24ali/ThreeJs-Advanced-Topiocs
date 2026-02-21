//language=glsl
export const FragmentShader =  `
    // terrain.frag.js  (Step 4 — grayscale height visualization)
    precision highp float;

    uniform float uMinHeight;
    uniform float uMaxHeight;

    varying float vHeight;

    void main() {
        float t = clamp((vHeight - uMinHeight) / (uMaxHeight - uMinHeight), 0.0, 1.0);
        gl_FragColor = vec4(vec3(t), 1.0);
    }
`