//language=GLSL
// ─────────────────────────────────────────────────────────────────────────────
// VERTEX SHADER  –  Water Surface (Gerstner Waves)
//
// Responsible for:
//  1. Displacing each vertex on the water plane using Gerstner waves to
//     simulate realistic ocean-like surface movement.
//  2. Computing the analytical surface normal (tangent × binormal) so that
//     lighting and Fresnel calculations in the fragment shader are correct.
//  3. Forwarding world-space position and clip-space position so the
//     fragment shader can sample the refraction render-target at the right
//     screen-space UV.
// ─────────────────────────────────────────────────────────────────────────────
export const VertexShader = `

    // ── Uniforms ──────────────────────────────────────────────────────────────
    // uTime      : elapsed seconds since the scene started; drives wave animation.
    // uWaveA/B/C : each vec4 encodes one wave layer:
    //              .xy = 2-D direction vector (will be normalised in the function)
    //              .z  = amplitude  (how tall the wave crest is, in world units)
    //              .w  = frequency  (spatial frequency; higher = tighter waves)
    uniform float uTime;
    uniform vec4 uWaveA;
    uniform vec4 uWaveB;
    uniform vec4 uWaveC;

    // ── Varyings ──────────────────────────────────────────────────────────────
    // These are interpolated across fragments and read by the fragment shader.
    varying vec2 vUv;             // texture coordinates (passed through)
    varying vec3 vWorldPosition;  // world-space position of the displaced vertex
    varying vec3 vNormal;         // analytically computed surface normal
    varying vec4 vClipPos;        // clip-space position used for screen-space UVs

    // ── Gerstner Wave Function ────────────────────────────────────────────────
    // Computes the per-vertex displacement and accumulates the partial
    // derivatives (tangent / binormal) needed for the surface normal.
    //
    // Parameters:
    //   wave     – the vec4 wave descriptor (dir.xy, amplitude, frequency)
    //   pos      – current world-space XZ position of the vertex
    //   time     – current animation time
    //   tangent  – in/out: accumulated tangent vector (X-axis of surface)
    //   binormal – in/out: accumulated binormal vector (Z-axis of surface)
    //
    // Returns the XYZ displacement to add to the vertex position.
    //
    // Theory:
    //   A Gerstner (trochoidal) wave moves water particles in circles rather
    //   than simple sine waves. This produces the characteristic sharp crests
    //   and flat troughs seen in real ocean waves.
    //
    //   Phase speed is derived from the linear deep-water dispersion relation:
    //     c = sqrt(g / k)   →   phase = sqrt(9.8 * frequency)
    vec3 gerstnerWave(vec4 wave, vec3 pos, float time, inout vec3 tangent, inout vec3 binormal) {
        float steepness = 0.5;           // controls sharpness of crests (0 = sine, 1 = cusp)
        float amp  = wave.z;             // amplitude
        float freq = wave.w;             // spatial frequency (wave number k)
        vec2  dir  = normalize(wave.xy); // unit direction vector in the XZ plane
        float phase = sqrt(9.8 * freq);  // gravity-based phase speed (deep-water dispersion)

        // Phase function: advances the wave in its direction over time
        float f    = freq * dot(dir, pos.xz) - phase * time;
        float cosF = cos(f);
        float sinF = sin(f);

        // ── Vertex displacement ───────────────────────────────────────────────
        // X and Z are shifted horizontally (rolling motion), Y is the height.
        vec3 offset;
        offset.x = steepness * amp * dir.x * cosF;  // horizontal shift along wave direction X
        offset.z = steepness * amp * dir.y * cosF;  // horizontal shift along wave direction Z
        offset.y = amp * sinF;                       // vertical height

        // ── Partial derivatives for normal reconstruction ─────────────────────
        // Analytical derivatives of the Gerstner displacement with respect to
        // the surface coordinates let us compute an exact normal without finite
        // differences, which would be expensive and noisy.
        tangent += vec3(
            -steepness * amp * dir.x * dir.x * freq * sinF,   // dX/du
             steepness * amp * dir.x * freq * cosF,            // dY/du
            -steepness * amp * dir.x * dir.y * freq * sinF    // dZ/du
        );
        binormal += vec3(
            -steepness * amp * dir.x * dir.y * freq * sinF,   // dX/dv
             steepness * amp * dir.y * freq * cosF,            // dY/dv
            -steepness * amp * dir.y * dir.y * freq * sinF    // dZ/dv
        );

        return offset;
    }

    // ── Main ──────────────────────────────────────────────────────────────────
    void main() {
        vec3 pos = position; // start with the flat grid vertex position

        // Initialise tangent/binormal to the flat-plane basis vectors.
        // Each gerstnerWave call adds its contribution to them.
        vec3 tangent  = vec3(1.0, 0.0, 0.0);
        vec3 binormal = vec3(0.0, 0.0, 1.0);

        // Superimpose three independent Gerstner wave layers to build a
        // complex, non-repeating ocean-like surface.
        pos += gerstnerWave(uWaveA, position, uTime, tangent, binormal);
        pos += gerstnerWave(uWaveB, position, uTime, tangent, binormal);
        pos += gerstnerWave(uWaveC, position, uTime, tangent, binormal);

        // Reconstruct the surface normal from the accumulated tangent frame.
        // cross(binormal, tangent) gives a vector perpendicular to the surface.
        vec3 computedNormal = normalize(cross(binormal, tangent));
        vNormal = computedNormal;

        vUv = uv; // pass through UV coordinates unchanged

        // Compute world-space position (needed for lighting & refraction in fragment)
        vec4 worldPos    = modelMatrix * vec4(pos, 1.0);
        vWorldPosition   = worldPos.xyz;

        // Clip-space position used in the fragment shader to derive screen-space
        // UVs for refraction texture sampling.
        vClipPos     = projectionMatrix * viewMatrix * worldPos;
        gl_Position  = vClipPos;
    }
`