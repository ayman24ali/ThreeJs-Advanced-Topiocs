import * as THREE from "three";
import {VertexShader} from "../shaders/vertex-shader";
import {FragmentShader} from "../shaders/fragment-shader";
import {Color, CubeTexture, Vector3} from "three";

export class GeometryManager {

    constructor() {
    }

    createCube = () => {
        const geometry = new THREE.BoxGeometry(2, 2, 2);
        const material = new THREE.MeshBasicMaterial({color: 0x44ff44});
        const cube = new THREE.Mesh(geometry, material)

        cube.position.set(-2, -3, 1);
        // cube.castShadow = true; // Enable shadow casting for the cube
        // cube.receiveShadow = true; // Optional: if you want the cube to receive shadows too

        return cube
    }

    createPlane = (envMap:CubeTexture,texture:any) => {
        const geometry = new THREE.PlaneGeometry(50, 50, 256, 256);
        const material = new THREE.ShaderMaterial({
            vertexShader: VertexShader,
            fragmentShader: FragmentShader,
            uniforms: {
                uWaterColor: {value:new Color(0.0, 0.3, 0.5)},
                uLightPosition:{value:new Vector3(10, 10, 10)},
                uLightColor:{value:new Color(1, 1, 1)},
                uTime: { value: 0 },
                uWaveA: { value: new THREE.Vector4(1.0, 0.0, 0.3, 2.0) }, // dir.x, dir.y, amplitude, frequency
                uWaveB: { value: new THREE.Vector4(0.7, 0.7, 0.15, 3.0) },
                uWaveC: { value: new THREE.Vector4(-0.4, 0.9, 0.08, 5.0) },

                uEnvMap: { value: envMap }, // the cubemap loaded in Step 1
                cameraPosition: { value: new THREE.Vector3() },
                uFresnelPower: { value: 5.0 },
                uFresnelBias: { value: 0.02 },

                uRefractionMap: { value: texture },
                uRefractionStrength: { value: 0.02 },
            },
            transparent: true
        });
        const plane = new THREE.Mesh(geometry, material);

        plane.position.set(0, 0, 0);
        plane.rotation.x = -Math.PI / 2;
        plane.receiveShadow = true; // Enable shadow receiving for the ground
        return plane
    }

    createSphere = ({
                        radius = 1,
                        widthSegments = 32,
                        heightSegments = 32,
                        color = 0x3aa0ff,
                        position = {x: 0, y: 0, z: 0},
                        rotation = {x: 0, y: 0, z: 0},
                        castShadow = true,
                        receiveShadow = true,
                    } = {}) => {
        // Geometry
        const geometry = new THREE.SphereGeometry(radius, widthSegments, heightSegments);

        // Material (good default for real lights)
        const material = new THREE.MeshStandardMaterial({
            color,
        });

        // Mesh
        const sphere = new THREE.Mesh(geometry, material);

        // Transform
        sphere.position.set(position.x, position.y, position.z);
        sphere.rotation.set(rotation.x, rotation.y, rotation.z);

        // Shadows
        sphere.castShadow = castShadow;
        sphere.receiveShadow = receiveShadow;

        return sphere;
    };

    createCubeBox = () => {
        const cubeTextureLoader = new THREE.CubeTextureLoader();
        return cubeTextureLoader.load([
            'px.jpg', 'nx.jpg', 'py.jpg', 'ny.jpg', 'pz.jpg', 'nz.jpg'
        ])
    }
}