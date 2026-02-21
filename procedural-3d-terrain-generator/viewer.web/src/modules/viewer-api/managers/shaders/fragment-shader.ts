/**
 * FragmentShader
 * --------------
 * Runs once per rasterised pixel (fragment) on the GPU.
 * It computes the final on-screen colour by combining:
 *   1. Biome colour  — determined by the vertex's normalised height.
 *   2. Diffuse light — Lambertian shading from a directional sun.
 *   3. Ambient light — constant fill to avoid pure-black shadows.
 *   4. Rim light     — edge glow for silhouette pop.
 *
 * Uniforms received from JavaScript (set in GeometryManager):
 *  - uSunDir    {vec3}  — normalised direction toward the sun (world / view).
 *  - uMinHeight {float} — lowest vertex height in the mesh (for normalisation).
 *  - uMaxHeight {float} — highest vertex height in the mesh (for normalisation).
 *
 * Varyings received from the vertex shader:
 *  - vHeight   {float} — raw Z height of this fragment's vertex.
 *  - vNormal   {vec3}  — interpolated surface normal in view space.
 *  - vPosition {vec3}  — interpolated position in view space.
 */
//language=glsl
export const FragmentShader = `

    precision highp float;

    /* --- Uniforms (set from JavaScript) --- */
    uniform vec3  uSunDir;      // normalised direction toward the sun
    uniform float uMinHeight;   // lowest terrain height (for colour normalisation)
    uniform float uMaxHeight;   // highest terrain height (for colour normalisation)

    /* --- Varyings (interpolated from vertex shader) --- */
    varying float vHeight;      // raw object-space height of this fragment
    varying vec3  vNormal;      // view-space surface normal
    varying vec3  vPosition;    // view-space position

    /**
     * biomeColor
     * ----------
     * Maps a normalised height value t ∈ [0, 1] to an RGB biome colour
     * using piecewise linear interpolation (mix) between terrain zones:
     *
     *  0.00 – 0.18  deep ocean  →  ocean
     *  0.18 – 0.25  ocean       →  beach sand
     *  0.25 – 0.38  sand        →  grassland
     *  0.38 – 0.58  grass       →  forest
     *  0.58 – 0.72  forest      →  rocky mountain
     *  0.72 – 0.88  rock        →  snow cap
     *  0.88 – 1.00  snow
     *
     * @param t  normalised height in [0, 1]
     * @returns  RGB colour for the biome at height t
     */
    vec3 biomeColor(float t) {
        vec3 deepWater = vec3(0.04, 0.12, 0.28);  // deep ocean blue
        vec3 water     = vec3(0.10, 0.24, 0.50);  // shallow ocean blue
        vec3 sand      = vec3(0.76, 0.70, 0.50);  // beach / desert
        vec3 grass     = vec3(0.22, 0.48, 0.18);  // grassland green
        vec3 forest    = vec3(0.10, 0.30, 0.10);  // dark forest green
        vec3 rock      = vec3(0.45, 0.42, 0.38);  // grey mountain rock
        vec3 snow      = vec3(0.92, 0.95, 1.00);  // near-white snow cap

        if      (t < 0.18) return mix(deepWater, water,  t / 0.18);
        else if (t < 0.25) return mix(water,     sand,   (t - 0.18) / 0.07);
        else if (t < 0.38) return mix(sand,      grass,  (t - 0.25) / 0.13);
        else if (t < 0.58) return mix(grass,     forest, (t - 0.38) / 0.20);
        else if (t < 0.72) return mix(forest,    rock,   (t - 0.58) / 0.14);
        else if (t < 0.88) return mix(rock,      snow,   (t - 0.72) / 0.16);
        return snow;
    }

    void main() {
        // --- Step 1: Normalise height to [0, 1] and look up biome colour ---
        float t    = clamp((vHeight - uMinHeight) / (uMaxHeight - uMinHeight), 0.0, 1.0);
        vec3 color = biomeColor(t);

        // --- Step 2: Lambertian (diffuse) shading ---
        // dot(normal, lightDir) gives cos(θ) — 1 when facing the sun, 0 at 90°.
        vec3 lightDir = normalize(uSunDir);
        float diff    = max(dot(vNormal, lightDir), 0.0);

        // --- Step 3: Combine ambient + diffuse ---
        // Ambient prevents fully-shadowed faces from going black.
        vec3 ambient = color * 0.35;        // constant fill — 35 % of biome colour
        vec3 diffuse = color * diff * 0.85; // sun contribution — 85 % * cosine factor

        // --- Step 4: Rim light (silhouette edge glow) ---
        // viewDir points from the fragment toward the camera (opposite of vPosition).
        // Rim is strongest when the surface is perpendicular to the view ray (grazing angle).
        vec3  viewDir = normalize(-vPosition);
        float rim     = pow(1.0 - max(dot(vNormal, viewDir), 0.0), 3.0) * 0.12;

        // Final colour = ambient + diffuse + subtle rim highlight
        gl_FragColor = vec4(ambient + diffuse + rim, 1.0);
    }
`