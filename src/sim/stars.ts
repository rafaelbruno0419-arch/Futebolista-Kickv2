import * as THREE from 'three'

const STAR_VERT = /* glsl */ `
attribute float aSize;
attribute vec3 aColor;
varying vec3 vColor;
varying float vSize;
uniform float uPixelRatio;
uniform float uScale;
void main(){
  vColor = aColor;
  vSize = aSize;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize * uPixelRatio * uScale;
}
`

const STAR_FRAG = /* glsl */ `
precision highp float;
varying vec3 vColor;
varying float vSize;
void main(){
  vec2 d = gl_PointCoord - 0.5;
  float r = length(d);
  float core = smoothstep(0.5, 0.0, r);
  float halo = exp(-r*r*14.0);
  float a = core*0.85 + halo*0.55;
  // pontas de difração sutis nas estrelas mais brilhantes
  float spike = max(0.0, 1.0 - abs(d.x)*22.0) * max(0.0, 1.0 - abs(d.y)*3.0)
              + max(0.0, 1.0 - abs(d.y)*22.0) * max(0.0, 1.0 - abs(d.x)*3.0);
  a += spike * smoothstep(2.2, 5.0, vSize) * 0.35;
  if(a < 0.004) discard;
  gl_FragColor = vec4(vColor, a);
}
`

function kelvinToRGB(k: number): [number, number, number] {
  const t = k / 100
  let r: number, g: number, b: number
  if (t <= 66) {
    r = 255
    g = 99.47 * Math.log(t) - 161.12
    b = t <= 19 ? 0 : 138.52 * Math.log(t - 10) - 305.04
  } else {
    r = 329.7 * Math.pow(t - 60, -0.1332)
    g = 288.12 * Math.pow(t - 60, -0.0755)
    b = 255
  }
  const c = (v: number) => Math.min(1, Math.max(0, v / 255))
  return [c(r), c(g), c(b)]
}

/** Céu estrelado com concentração na faixa da Via Láctea. */
export function createStarfield(count = 14000, radius = 4e8) {
  const pos = new Float32Array(count * 3)
  const col = new Float32Array(count * 3)
  const size = new Float32Array(count)

  // inclinação do plano galáctico em relação à eclíptica (~60°)
  const galactic = new THREE.Matrix4().makeRotationX(THREE.MathUtils.degToRad(60.2))
  const v = new THREE.Vector3()

  for (let i = 0; i < count; i++) {
    const inBand = Math.random() < 0.42
    let theta = Math.random() * Math.PI * 2
    let z: number
    if (inBand) {
      // concentração num disco fino
      const g = (Math.random() + Math.random() + Math.random() - 1.5) / 1.5
      z = g * 0.13
    } else {
      z = Math.random() * 2 - 1
    }
    const r = Math.sqrt(Math.max(0, 1 - z * z))
    v.set(r * Math.cos(theta), r * Math.sin(theta), z).applyMatrix4(galactic)
    v.multiplyScalar(radius * (0.85 + Math.random() * 0.3))
    pos[i * 3] = v.x
    pos[i * 3 + 1] = v.y
    pos[i * 3 + 2] = v.z

    // distribuição de temperaturas parecida com a real (muitas anãs vermelhas)
    const u = Math.random()
    const kelvin = u < 0.62 ? 3000 + Math.random() * 1800 : u < 0.88 ? 4800 + Math.random() * 2200 : 7000 + Math.random() * 12000
    const [cr, cg, cb] = kelvinToRGB(kelvin)
    const bright = Math.pow(Math.random(), 3.1)
    const lum = 0.35 + bright * 0.9
    col[i * 3] = cr * lum
    col[i * 3 + 1] = cg * lum
    col[i * 3 + 2] = cb * lum
    size[i] = 0.9 + bright * 5.2 + (inBand ? 0 : 0.15)
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3))
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1))

  const mat = new THREE.ShaderMaterial({
    vertexShader: STAR_VERT,
    fragmentShader: STAR_FRAG,
    uniforms: {
      uPixelRatio: { value: Math.min(devicePixelRatio, 2) },
      uScale: { value: 1 },
    },
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
  })

  const points = new THREE.Points(geo, mat)
  points.frustumCulled = false
  points.renderOrder = -100
  return points
}

/** Nebulosa difusa da Via Láctea (esfera interna com ruído). */
export function createMilkyWay(radius = 3.6e8) {
  const geo = new THREE.SphereGeometry(radius, 64, 48)
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    transparent: true,
    blending: THREE.AdditiveBlending,
    uniforms: { uIntensity: { value: 1 } },
    vertexShader: /* glsl */ `
      varying vec3 vPos;
      void main(){
        vPos = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      varying vec3 vPos;
      uniform float uIntensity;
      vec3 hash3(vec3 p){
        p = vec3(dot(p,vec3(127.1,311.7,74.7)), dot(p,vec3(269.5,183.3,246.1)), dot(p,vec3(113.5,271.9,124.6)));
        return fract(sin(p)*43758.5453123)*2.0-1.0;
      }
      float snoise(vec3 p){
        vec3 i = floor(p); vec3 f = fract(p); vec3 u = f*f*(3.0-2.0*f);
        return mix(mix(mix(dot(hash3(i),f), dot(hash3(i+vec3(1,0,0)),f-vec3(1,0,0)),u.x),
                       mix(dot(hash3(i+vec3(0,1,0)),f-vec3(0,1,0)), dot(hash3(i+vec3(1,1,0)),f-vec3(1,1,0)),u.x),u.y),
                   mix(mix(dot(hash3(i+vec3(0,0,1)),f-vec3(0,0,1)), dot(hash3(i+vec3(1,0,1)),f-vec3(1,0,1)),u.x),
                       mix(dot(hash3(i+vec3(0,1,1)),f-vec3(0,1,1)), dot(hash3(i+vec3(1,1,1)),f-vec3(1,1,1)),u.x),u.y),u.z);
      }
      float fbm(vec3 p){
        float a=0.5,s=0.0;
        for(int i=0;i<6;i++){ s+=a*snoise(p); p*=2.07; a*=0.52; }
        return s;
      }
      void main(){
        // plano galáctico inclinado
        float ang = radians(60.2);
        mat3 R = mat3(1.0,0.0,0.0, 0.0,cos(ang),-sin(ang), 0.0,sin(ang),cos(ang));
        vec3 g = R * vPos;
        float band = exp(-pow(g.z*7.0, 2.0));
        float clouds = fbm(vPos*3.4)*0.5+0.5;
        float dust = smoothstep(0.35,0.85, fbm(vPos*7.0 + 11.0)*0.5+0.5);
        float bulge = exp(-pow(length(g.xy - vec2(0.0,0.0))*1.5, 2.0));
        float v = band * (0.35 + clouds*0.9) * (1.0 - dust*0.6);
        v += band * bulge * 0.35;
        vec3 col = mix(vec3(0.30,0.36,0.62), vec3(0.85,0.80,0.68), clouds*0.7);
        gl_FragColor = vec4(col * v * 0.16 * uIntensity, 1.0);
      }
    `,
  })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.frustumCulled = false
  mesh.renderOrder = -101
  return mesh
}
