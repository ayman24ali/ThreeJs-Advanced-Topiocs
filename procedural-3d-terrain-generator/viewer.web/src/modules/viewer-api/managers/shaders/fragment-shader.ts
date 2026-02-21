//language=glsl
export const FragmentShader =  `

    precision highp float;

    uniform vec3  uSunDir;       // <-- missing

    varying vec3  vNormal;        // <-- missing
    varying vec3  vPosition;      // <-- missing
    
    // terrain.frag.js
    vec3 biomeColor(float t) {
        vec3 deepWater = vec3(0.04, 0.12, 0.28);
        vec3 water     = vec3(0.10, 0.24, 0.50);
        vec3 sand      = vec3(0.76, 0.70, 0.50);
        vec3 grass     = vec3(0.22, 0.48, 0.18);
        vec3 forest    = vec3(0.10, 0.30, 0.10);
        vec3 rock      = vec3(0.45, 0.42, 0.38);
        vec3 snow      = vec3(0.92, 0.95, 1.00);

        if      (t < 0.18) return mix(deepWater, water,  t / 0.18);
        else if (t < 0.25) return mix(water,     sand,   (t - 0.18) / 0.07);
        else if (t < 0.38) return mix(sand,      grass,  (t - 0.25) / 0.13);
        else if (t < 0.58) return mix(grass,     forest, (t - 0.38) / 0.20);
        else if (t < 0.72) return mix(forest,    rock,   (t - 0.58) / 0.14);
        else if (t < 0.88) return mix(rock,      snow,   (t - 0.72) / 0.16);
        return snow;
    }
    
    
    // terrain.frag.js  (Step 4 — grayscale height visualization)
    precision highp float;

    uniform float uMinHeight;
    uniform float uMaxHeight;

    varying float vHeight;

    void main() {
        float t     = clamp((vHeight - uMinHeight) / (uMaxHeight - uMinHeight), 0.0, 1.0);
        vec3 color  = biomeColor(t);

        vec3 lightDir = normalize(uSunDir);
        float diff    = max(dot(vNormal, lightDir), 0.0);

        vec3 ambient  = color * 0.35;           // base brightness — no pure black shadows
        vec3 diffuse  = color * diff * 0.85;    // sun contribution

        // Optional: rim light for silhouette pop
        vec3 viewDir  = normalize(-vPosition);
        float rim     = pow(1.0 - max(dot(vNormal, viewDir), 0.0), 3.0) * 0.12;

        gl_FragColor  = vec4(ambient + diffuse + rim, 1.0);
    }
`