//language=glsl
export const VertexShader =  `
    precision highp float;

    varying float vHeight;
    varying vec3  vNormal;
    varying vec3  vPosition;

    void main() {
        vHeight   = position.z;  // <-- Z, not Y
        vNormal   = normalize(normalMatrix * normal);
        vPosition = (modelViewMatrix * vec4(position, 1.0)).xyz;

        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`