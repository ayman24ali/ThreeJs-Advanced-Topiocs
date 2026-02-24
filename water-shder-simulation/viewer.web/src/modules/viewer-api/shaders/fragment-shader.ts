//language=GLSL
export const FragmentShader = `

    uniform vec3 uWaterColor;
    uniform vec3 uLightPosition;
    uniform vec3 uLightColor;
    
    varying vec2 vUv;
    varying vec3 vWorldPosition;
    varying vec3 vNormal;
    varying vec4 vClipPos; // added to vertex shader

    uniform samplerCube uEnvMap;
//    uniform vec3 cameraPosition;
    uniform float uFresnelPower;
    uniform float uFresnelBias;

    uniform sampler2D uRefractionMap;
    uniform float uRefractionStrength;
    

    void main() {
        vec3 N = normalize(vNormal);
        vec3 V = normalize(cameraPosition - vWorldPosition);

        // Fresnel
        float NdotV = max(dot(N, V), 0.0);
        float fresnel = uFresnelBias + (1.0 - uFresnelBias) * pow(1.0 - NdotV, uFresnelPower);

        // Reflection
        vec3 R = reflect(-V, N);
        vec3 reflectionColor = textureCube(uEnvMap, R).rgb;

        // Screen-space UVs
        vec2 screenUV = (vClipPos.xy / vClipPos.w) * 0.5 + 0.5;

        // Distort UVs based on wave normal — this creates the bending look
        vec2 refractedUV = screenUV + N.xz * uRefractionStrength;
        refractedUV = clamp(refractedUV, 0.001, 0.999); // prevent sampling outside texture

        vec3 refractionColor = texture2D(uRefractionMap, refractedUV).rgb;
//        vec3 color = mix(refractionColor, reflectionColor, fresnel);

        // Mix water color with reflection based on Fresnel
        vec3 waterBase = uWaterColor;
        vec3 refractionTinted = mix(waterBase, refractionColor, 0.1); // tint refraction with water color
        vec3 color = mix(refractionTinted, reflectionColor, fresnel);

        // Add specular highlight (Blinn-Phong)
        vec3 L = normalize(uLightPosition - vWorldPosition);
        vec3 H = normalize(L + V);
        float spec = pow(max(dot(N, H), 0.0), 128.0);
        color += uLightColor * spec * 0.5;

        gl_FragColor = vec4(color, 1.0);
    }
`