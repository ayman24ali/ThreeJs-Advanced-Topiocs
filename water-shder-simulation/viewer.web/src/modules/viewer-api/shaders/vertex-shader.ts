//language=GLSL
export const VertexShader = `
    uniform float uTime;
    uniform vec4 uWaveA; // direction.xy, amplitude, frequency
    uniform vec4 uWaveB;
    uniform vec4 uWaveC;

    varying vec2 vUv;
    varying vec3 vWorldPosition;
    varying vec3 vNormal;
    varying vec4 vClipPos; // added to vertex shader

    vec3 gerstnerWave(vec4 wave, vec3 pos, float time, inout vec3 tangent, inout vec3 binormal) {
        float steepness = 0.5;
        float amp = wave.z;
        float freq = wave.w;
        vec2 dir = normalize(wave.xy);
        float phase = sqrt(9.8 * freq); // gravity-based phase speed

        float f = freq * dot(dir, pos.xz) - phase * time;
        float cosF = cos(f);
        float sinF = sin(f);

        // Displacement
        vec3 offset;
        offset.x = steepness * amp * dir.x * cosF;
        offset.z = steepness * amp * dir.y * cosF;
        offset.y = amp * sinF;

        // Accumulate tangent/binormal for normal calculation
        tangent += vec3(
        -steepness * amp * dir.x * dir.x * freq * sinF,
        steepness * amp * dir.x * freq * cosF,
        -steepness * amp * dir.x * dir.y * freq * sinF
        );
        binormal += vec3(
        -steepness * amp * dir.x * dir.y * freq * sinF,
        steepness * amp * dir.y * freq * cosF,
        -steepness * amp * dir.y * dir.y * freq * sinF
        );

        return offset;
    }

    void main() {
        vec3 pos = position;
        vec3 tangent = vec3(1.0, 0.0, 0.0);
        vec3 binormal = vec3(0.0, 0.0, 1.0);

        pos += gerstnerWave(uWaveA, position, uTime, tangent, binormal);
        pos += gerstnerWave(uWaveB, position, uTime, tangent, binormal);
        pos += gerstnerWave(uWaveC, position, uTime, tangent, binormal);

        // Compute the actual normal from the displaced surface
        vec3 computedNormal = normalize(cross(binormal, tangent));
        vNormal = computedNormal;

        vUv = uv;
        vec4 worldPos = modelMatrix * vec4(pos, 1.0);
        vWorldPosition = worldPos.xyz;
        vClipPos = projectionMatrix * viewMatrix * worldPos;
        gl_Position = vClipPos;
    }
`