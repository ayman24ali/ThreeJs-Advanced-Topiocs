import * as THREE from "three";

export class GeometryManager {
  
  constructor() {
  }
  
  createCube = ()=>{
    const geometry = new THREE.BoxGeometry();
    const material =  new THREE.MeshStandardMaterial({
      color: 0x000000,
      emissive: new THREE.Color(2.0, 0.5, 0.0),  // orange, intensity > 1.0
      emissiveIntensity: 3.0,                      // this pushes it into HDR range
    })
    const cube = new THREE.Mesh(geometry, material)
    cube.position.set(0, 1.5, 0);
    // cube.position.set(0, 2, 0);
    cube.castShadow = true; // Enable shadow casting for the cube
    cube.receiveShadow = true; // Optional: if you want the cube to receive shadows too
    
    return cube
  }
  
  createPlane = () =>{
    const geometry = new THREE.PlaneGeometry( 10, 10 );
    const material = new THREE.MeshBasicMaterial( {color: 0x111122 , side: THREE.DoubleSide} );
    const plane = new THREE.Mesh( geometry, material );
    
    plane.position.set(0,0,0);
    plane.rotation.x = -Math.PI / 2;
    plane.receiveShadow = true; // Enable shadow receiving for the ground
    return plane
  }
 
  createSphere = ()=>{
  
  }
}