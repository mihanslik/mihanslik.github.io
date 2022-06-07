//import * as THREE from 'https://cdn.skypack.dev/three@0.129.0/build/three.module.js';
//import { GLTFLoader } from 'https://cdn.skypack.dev/three@0.129.0/examples/jsm/loaders/GLTFLoader.js';
//import { EffectComposer } from 'https://cdn.skypack.dev/three@0.129.0/examples/jsm/postprocessing/EffectComposer.js';
//import { CopyShader } from 'https://cdn.skypack.dev/three@0.129.0/examples/jsm/shaders/CopyShader.js';


const _unlitSymbolVS = `
varying vec2 vUv;
varying vec3 vNormal;

uniform vec3 Color;

void main(){
    vUv = uv;
    vNormal = normalize(normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const _unlitSymbolFS = `
varying vec2 vUv;
varying vec3 vNormal;

uniform vec3 Color;


void main(void)
{
    float dotOfNormal = abs(dot(vNormal, vec3(0.0, 0.0, 1.0)));
    vec3 color = mix(Color * 0.8, Color, dotOfNormal);
    gl_FragColor = vec4(color, 1.0);
}
`;

const _raymarchCloudVS = `
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vPos;

varying vec3 rayOrigin;
varying vec3 hitPos;

uniform float Time;
uniform vec3 RayOrigin;

void main(){
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    vPos = (projectionMatrix * modelViewMatrix * vec4(position, 1.0)).rgb;

    rayOrigin = vec3(0.0, 0.0, -5.0);
    hitPos = (projectionMatrix * modelViewMatrix * vec4(position, 1.0)).rgb;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const _raymarchCloudFS = `
#define PI 3.1415926538
#define MAX_STEPS 1000.0
#define MAX_DIST 5.0
#define SURF_DIST 0.01

varying vec3 vNormal;
varying vec2 vUv;
varying vec3 vPos;
varying vec3 rayOrigin;
varying vec3 hitPos;

uniform float Time;

//	Simplex 3D Noise 
//	by Ian McEwan, Ashima Arts
vec4 permute(vec4 x){return mod(((x*34.0)+1.0)*x, 289.0);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314 * r;}

float snoise(vec3 v)
{ 
  const vec2  C = vec2(1.0/6.0, 1.0/3.0) ;
  const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);

  // First corner
  vec3 i  = floor(v + dot(v, C.yyy) );
  vec3 x0 =   v - i + dot(i, C.xxx) ;

  // Other corners
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min( g.xyz, l.zxy );
  vec3 i2 = max( g.xyz, l.zxy );

  //  x0 = x0 - 0. + 0.0 * C 
  vec3 x1 = x0 - i1 + 1.0 * C.xxx;
  vec3 x2 = x0 - i2 + 2.0 * C.xxx;
  vec3 x3 = x0 - 1. + 3.0 * C.xxx;

  // Permutations
  i = mod(i, 289.0 ); 
  vec4 p = permute( permute( permute( 
             i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
           + i.y + vec4(0.0, i1.y, i2.y, 1.0 )) 
           + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));

  // Gradients
  // ( N*N points uniformly over a square, mapped onto an octahedron.)
  float n_ = 1.0/7.0; // N=7
  vec3  ns = n_ * D.wyz - D.xzx;

  vec4 j = p - 49.0 * floor(p * ns.z *ns.z);  //  mod(p,N*N)

  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_ );    // mod(j,N)

  vec4 x = x_ *ns.x + ns.yyyy;
  vec4 y = y_ *ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);

  vec4 b0 = vec4( x.xy, y.xy );
  vec4 b1 = vec4( x.zw, y.zw );

  vec4 s0 = floor(b0)*2.0 + 1.0;
  vec4 s1 = floor(b1)*2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));

  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;

  vec3 p0 = vec3(a0.xy,h.x);
  vec3 p1 = vec3(a0.zw,h.y);
  vec3 p2 = vec3(a1.xy,h.z);
  vec3 p3 = vec3(a1.zw,h.w);

  //Normalise gradients
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;

  // Mix final noise value
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3) ) );
}

float AngleToRadians(float angle){
  return angle * PI/180.0;
}

mat2 Rot(float a)
{
    float s = sin(a);
    float c = cos(a);
    return mat2(c, -s, s, c);
}

mat4 Rot3D(vec3 axis, float angle) {
  axis = normalize(axis);
  float s = sin(angle);
  float c = cos(angle);
  float oc = 1.0 - c;

  return mat4(
		oc * axis.x * axis.x + c,           oc * axis.x * axis.y - axis.z * s,  oc * axis.z * axis.x + axis.y * s,  0.0,
    oc * axis.x * axis.y + axis.z * s,  oc * axis.y * axis.y + c,           oc * axis.y * axis.z - axis.x * s,  0.0,
    oc * axis.z * axis.x - axis.y * s,  oc * axis.y * axis.z + axis.x * s,  oc * axis.z * axis.z + c,           0.0,
		0.0,                                0.0,                                0.0,                                1.0
	);
}

float GetDist(vec3 p){
  float d = length(p) - 1.0;
  float nd = snoise(p * 50.0);
  return nd;
}

vec3 GetNormal(vec3 p){
  vec2 e = vec2(0.001, 0.0);
  vec3 n = GetDist(p) - vec3(GetDist(p - e.xyy), GetDist(p - e.yxy), GetDist(p - e.yyx));
  return normalize(n);
}

float Raymarch(vec3 ro, vec3 rd){
  float dO = 0.0;
  float dS = 0.0;
  for(float i = 0.0; i < MAX_DIST; i++)
  {
    vec3 p = ro + dO * rd;
    dS = GetDist(p);
    dO += dS;
    if(dS < SURF_DIST || dO > MAX_DIST) 
    {
      break;
    }  
  }

  return dO;
}

void main(void)
{
    vec2 uv = vUv - 0.5;
    vec3 ro = rayOrigin;
    vec3 rd = normalize(hitPos - ro);
    
    float d = Raymarch(ro, rd);
    
    vec4 color = vec4(0.0);
    if(d < MAX_DIST)
    {
      vec3 p = ro + rd * d;
      color.rgb = vec3(d);
      color.a = d;
    }

    float noiseValue = snoise(vPos * 1.1 + vec3(0.0, 1.0, 0.0) * 3.0) * snoise(vPos * 0.5);
    color = vec4(vec3(noiseValue), noiseValue * 5.0);

    float glassyShine = dot(vNormal, normalize(vec3(1.0, 0.2, 0.0)));
    glassyShine = clamp(glassyShine, 0.0, 1.0) / 2.0;
    //color += glassyShine;

    gl_FragColor = color;
}
`;
const _kaleidoscopeVS = `
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vPos;
varying vec3 vEyeDir;

uniform float Time;

void main(){
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    vPos = (projectionMatrix * modelViewMatrix * vec4(position, 1.0)).rgb;
    vEyeDir = normalize(vPos - cameraPosition);

    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const _kaleidoscopeFS = `
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vPos;
varying vec3 vEyeDir;

uniform float IOR;
uniform float Time;
uniform sampler2D Texture;

void main(void)
{
    vec2 uv = (vPos.rg);

    /////////// refract uv
    vec3 refracted = refract(vEyeDir, vNormal, 1.0/IOR);
	  uv += refracted.xy;

    /////////// kaleidoscope effect
    uv = (uv) * 3.2;
    float r = 1.0;
    float a = Time*.1;
    float c = cos(a)*r;
    float s = sin(a)*r;
    for (float i = 0.0; i < 32.0; i++)
    {
    	uv = abs(uv);
      uv -= 0.25;
      uv = uv * c + s * uv.yx * vec2(1.0, -1.0);
    }
    
    vec4 color =  0.5 + 0.5 * sin(Time + vec4(13.0, 17.0, 23.0, 1.0) * texture2D(Texture, uv * vec2(1.0, -1) + 0.5, -1.0 ));
    color.a = color.r * color.g * color.b;
    color.a = round(color.a);

    /////////// glass shine effect
    float glassyShine = dot(vNormal, normalize(vec3(1.0, 0.2, 0.0)));
    glassyShine = clamp(glassyShine, 0.0, 1.0) / 2.0;
    //color += glassyShine;

    gl_FragColor = color;
}   
`;

// Consts
///////////////////////////////////////

const canvas = document.querySelector('canvas.logo-shader')
const header = document.getElementById("header");
const headerClosedName = "header-closed";

const scene = new THREE.Scene()
const loader = new THREE.GLTFLoader();

const sizes = {
  width: 400,
  height: 400
}
CalculateSizes();

const marbTexture = new THREE.TextureLoader().load( '../public/img/marbS.png' );

// Materials
///////////////////////////////////////

const raymarchCloudMat = new THREE.ShaderMaterial({
  uniforms: {
      Time: {
        value: 0.0
      }
  },
  vertexShader: _raymarchCloudVS,
  fragmentShader: _raymarchCloudFS,
})
raymarchCloudMat.transparent = true;
raymarchCloudMat.side = THREE.DoubleSide;

const kaleidoscopeMat = new THREE.ShaderMaterial({
  uniforms: {
      IOR: {
        value: 1.2
      },
      Time: {
        value: 0.0
      },
      Texture: { 
        type: "t", 
        value: marbTexture
      }
  },
  vertexShader: _kaleidoscopeVS,
  fragmentShader: _kaleidoscopeFS,
})
kaleidoscopeMat.transparent = true;


const redMat = new THREE.ShaderMaterial({
  uniforms: {
      Color: { type: "c", value: new THREE.Color("rgb(255, 0, 0)") }
  },
  vertexShader: _unlitSymbolVS,
  fragmentShader: _unlitSymbolFS,
})


// Geometries
///////////////////////////////////////
const boxGeometry = new THREE.BoxGeometry( 300, 300, 300 );


// Meshes
///////////////////////////////////////

const raymarchCloud = new THREE.Mesh( boxGeometry, kaleidoscopeMat );
scene.add( raymarchCloud );

/*
var square;
loader.load( './public/models/SquareSymbol.glb', function ( gltf ) {
  square = gltf.scene;
  square.traverse((o) => {
    if (o.isMesh) o.material = redMat;
  });
  square.scale.set(150, 150, 150);
  //scene.add(square);
} );
*/

// Cameras
///////////////////////////////////////

//const camera = new THREE.PerspectiveCamera(70, sizes.width / sizes.height, 0.1, 10000)
const camera = new THREE.OrthographicCamera( sizes.width / - 2, sizes.width / 2, sizes.height / 2, sizes.height / - 2, 1, 1000 );
camera.position.x = 0;
camera.position.y = 0;
camera.position.z = 500;
//scene.add(camera);


// Renderer
///////////////////////////////////////

const renderer = new THREE.WebGLRenderer({
    canvas: canvas,
    alpha: true
})
renderer.antialias = true;
renderer.setSize(sizes.width, sizes.height);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.autoClear = false;


// PostProcessing
///////////////////////////////////////

const composer = new THREE.EffectComposer( renderer );
composer.addPass( new THREE.RenderPass( scene, camera ) );

const effectBloom = new THREE.BloomPass( 2.2, 15, 8, 256 );//( strength, kernelSize, sigma, resolution )
composer.addPass( effectBloom );

const effectCopy = new THREE.ShaderPass( THREE.CopyShader );
composer.addPass( effectCopy );

effectCopy.renderToScreen = true;


// Update loop
///////////////////////////////////////

const clock = new THREE.Clock()
const tick = () =>
{

    if(!header.classList.contains(headerClosedName))//update if in view
    {
      // Time
      const elapsedTime = clock.getElapsedTime();

      // Update Materials
      raymarchCloud.material.uniforms.Time.value = elapsedTime;

      //Animate
      raymarchCloud.rotation.y = elapsedTime/ 2 ;
      raymarchCloud.rotation.z = elapsedTime/ 4;
      //raymarchCloud.rotation.x = elapsedTime/ 4;

      // Render
      //renderer.render(scene, camera);
    	composer.render();
    }

    window.requestAnimationFrame(tick);
}
tick();

// Resize canvas
///////////////////////////////////////

window.addEventListener('resize', () =>
{
    ResizeCameraAndRenderer();
})

function CalculateSizes(){
  if(window.innerWidth > 768)
  {
    sizes.height = 600;
    sizes.width = 500;
  }else
  {
    sizes.height = window.innerWidth * 0.8;
    sizes.width = window.innerWidth * 0.8;
  }
}

function ResizeCameraAndRenderer()
{
  // Update sizes
  CalculateSizes();

  // Update camera
  camera.aspect = sizes.width / sizes.height;
  camera.updateProjectionMatrix();

  // Update renderer
  renderer.setSize(sizes.width, sizes.height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
}
ResizeCameraAndRenderer();
