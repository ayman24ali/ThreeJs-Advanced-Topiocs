import {Scene, Vector3} from "three";
import * as THREE from "three";

export class LightManager {
  
  constructor() {
  }
  
  createPointLight = (scene:Scene, position:Vector3)=>{
    const pointLight = new THREE.PointLight( 0xff0000, 2, 100 );
    pointLight.position.set( position.x, position.y, position.z );
    scene.add( pointLight );
    
    const sphereSize = 1;
    const pointLightHelper = new THREE.PointLightHelper( pointLight, sphereSize );
    scene.add( pointLightHelper );
  }
  
  createAmbientLight = (scene:Scene)=>{
    // Add Ambient Light
    const ambientLight = new THREE.AmbientLight(0x404040); // Soft light
    scene.add(ambientLight);
  }
  
}