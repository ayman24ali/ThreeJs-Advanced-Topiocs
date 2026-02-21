import * as THREE from "three";
import {VertexShader} from "./shaders/vertex-shader";
import {FragmentShader} from "./shaders/fragment-shader";

export class GeometryManager {
  
  constructor() {
  }
  
  createCube = ()=>{
    const geometry = new THREE.BoxGeometry();
    const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
    const cube = new THREE.Mesh(geometry, material)
    
    cube.position.set(0, 2, 0);
    cube.castShadow = true; // Enable shadow casting for the cube
    cube.receiveShadow = true; // Optional: if you want the cube to receive shadows too
    
    return cube
  }
  
  createPlane = (width:number, height:number,widthSegment:number,heightSegment:number) =>{
    const geometry = new THREE.PlaneGeometry( width, height , widthSegment, heightSegment );
    const material = new THREE.ShaderMaterial({vertexShader:VertexShader,fragmentShader:FragmentShader,uniforms:{
        uMinHeight: { value: -200.0 },
        uMaxHeight: { value: 200.0 }
      }} );
    const plane = new THREE.Mesh( geometry, material );
    
    plane.position.set(0,0,0);
    plane.rotation.x = -Math.PI / 2;
    plane.receiveShadow = true; // Enable shadow receiving for the ground

    console.log(plane.geometry.attributes);

    return plane
  }
}