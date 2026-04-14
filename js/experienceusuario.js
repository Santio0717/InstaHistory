import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.164.1/build/three.module.js";
import { GLTFLoader } from "https://cdn.jsdelivr.net/npm/three@0.164.1/examples/jsm/loaders/GLTFLoader.js";

const canvas = document.getElementById("threeCanvas");

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x1a2238);

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(50, window.innerWidth/window.innerHeight, 0.1, 100);
camera.position.set(0,0,4);

scene.add(new THREE.AmbientLight(0xffffff,1.5));

const light = new THREE.DirectionalLight(0xffffff,1.2);
light.position.set(3,5,3);
scene.add(light);

const loader = new GLTFLoader();
const url = localStorage.getItem("model_url");

if(url){
  loader.load(url, (gltf)=>{
    const obj = gltf.scene;
    scene.add(obj);
  });
}else{
  console.log("No hay modelo guardado");
}

function animate(){
  requestAnimationFrame(animate);
  renderer.render(scene,camera);
}
animate();
