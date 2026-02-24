//language=GLSL
// ─────────────────────────────────────────────────────────────────────────────
// FRAGMENT SHADER  –  Water Surface (Fresnel + Reflection + Refraction)
//
// Responsible for:
//  1. Computing a Fresnel blend between reflection (sky cubemap) and
//     refraction (underwater render-target) to simulate how real water
//     becomes more mirror-like at grazing angles.
//  2. Distorting the refraction UV based on the wave normal to make
//     underwater objects appear to "bend" through the water surface.
//  3. Tinting the water with a configurable base color.
//  4. Adding a Blinn-Phong specular highlight for sun/light sparkle.
// ─────────────────────────────────────────────────────────────────────────────
export const FragmentShader = `

    // ── Uniforms ──────────────────────────────────────────────────────────────
    uniform vec3 uWaterColor;        // base tint of the water (e.g. deep blue-green)
    uniform vec3 uLightPosition;     // world-space position of the primary light
    uniform vec3 uLightColor;        // colour/intensity of the specular highlight
    
    // ── Varyings (from vertex shader) ─────────────────────────────────────────
    varying vec2 vUv;                // UV coordinates (not used directly here)
    varying vec3 vWorldPosition;     // world-space position of this fragment
    varying vec3 vNormal;            // analytically computed Gerstner wave normal
    varying vec4 vClipPos;           // clip-space position for screen-space UV math

    // ── Environment / lighting uniforms ───────────────────────────────────────
    uniform samplerCube uEnvMap;     // skybox cubemap used for reflections
    // Note: cameraPosition is a built-in Three.js uniform; no need to declare it
    // uniform vec3 cameraPosition;

    // Fresnel controls:
    //   uFresnelBias  – minimum reflectivity even when looking straight down
    //   uFresnelPower – exponent; higher = sharper transition at the horizon
    uniform float uFresnelPower;
    uniform float uFresnelBias;

    // Refraction render-target (the scene rendered without the water plane)
    uniform sampler2D uRefractionMap;
    // How much the wave normal displaces the refraction UV (distortion strength)
    uniform float uRefractionStrength;
    

    void main() {
        // ── Surface vectors ───────────────────────────────────────────────────
        vec3 N = normalize(vNormal);                        // unit surface normal
        vec3 V = normalize(cameraPosition - vWorldPosition); // unit view vector (surface → eye)

        // ── Fresnel term ──────────────────────────────────────────────────────
        // Schlick approximation of the Fresnel equation.
        // NdotV approaches 0 at grazing angles → fresnel approaches 1 (fully reflective).
        // NdotV approaches 1 when looking straight down → fresnel approaches uFresnelBias.
        float NdotV   = max(dot(N, V), 0.0);
        float fresnel = uFresnelBias + (1.0 - uFresnelBias) * pow(1.0 - NdotV, uFresnelPower);

        // ── Reflection ────────────────────────────────────────────────────────
        // Reflect the view vector around the surface normal to get the direction
        // toward the sky that this pixel "mirrors". Sample the skybox cubemap in
        // that direction.
        vec3 R = reflect(-V, N);
        vec3 reflectionColor = textureCube(uEnvMap, R).rgb;

        // ── Screen-space refraction UVs ───────────────────────────────────────
        // Convert clip-space position to normalised device coordinates (NDC) in [0,1].
        // This gives the position of this fragment on the screen – we use it to
        // look up the refraction render-target (the underwater image).
        vec2 screenUV = (vClipPos.xy / vClipPos.w) * 0.5 + 0.5;

        // Offset the screen UV by the XZ components of the wave normal to simulate
        // the bending (refraction) of light as it passes through the water surface.
        // A larger uRefractionStrength = more distortion.
        vec2 refractedUV = screenUV + N.xz * uRefractionStrength;
        // Clamp to avoid artefacts at texture borders
        refractedUV = clamp(refractedUV, 0.001, 0.999);

        vec3 refractionColor = texture2D(uRefractionMap, refractedUV).rgb;

        // ── Water color blend ─────────────────────────────────────────────────
        // Mix the refraction color with the water's base tint so that deep water
        // looks coloured even when the underwater geometry is bright.
        vec3 waterBase       = uWaterColor;
        vec3 refractionTinted = mix(waterBase, refractionColor, 0.1); // 10% scene, 90% water tint

        // Final color = blend between tinted refraction (looking down) and
        // reflection (looking sideways), driven by the Fresnel term.
        vec3 color = mix(refractionTinted, reflectionColor, fresnel);

        // ── Specular highlight (Blinn-Phong) ──────────────────────────────────
        // H is the halfway vector between the light direction and the view direction.
        // When H aligns closely with N (dot product near 1) a bright specular
        // highlight appears. Exponent 128 gives a tight, sun-like sparkle.
        vec3  L    = normalize(uLightPosition - vWorldPosition); // surface → light
        vec3  H    = normalize(L + V);                            // half-vector
        float spec = pow(max(dot(N, H), 0.0), 128.0);
        color += uLightColor * spec * 0.5; // add specular contribution

        gl_FragColor = vec4(color, 1.0);
    }
`