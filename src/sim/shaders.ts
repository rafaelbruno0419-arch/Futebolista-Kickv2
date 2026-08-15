import * as THREE from 'three'
import type { BodyDef } from './data'

/* ---------------------------------------------------------------- noise ---- */

const NOISE = /* glsl */ `
vec3 hash3(vec3 p){
  p = vec3(dot(p,vec3(127.1,311.7,74.7)), dot(p,vec3(269.5,183.3,246.1)), dot(p,vec3(113.5,271.9,124.6)));
  return fract(sin(p)*43758.5453123)*2.0-1.0;
}
float snoise(vec3 p){
  vec3 i = floor(p); vec3 f = fract(p);
  vec3 u = f*f*(3.0-2.0*f);
  float n000 = dot(hash3(i+vec3(0,0,0)), f-vec3(0,0,0));
  float n100 = dot(hash3(i+vec3(1,0,0)), f-vec3(1,0,0));
  float n010 = dot(hash3(i+vec3(0,1,0)), f-vec3(0,1,0));
  float n110 = dot(hash3(i+vec3(1,1,0)), f-vec3(1,1,0));
  float n001 = dot(hash3(i+vec3(0,0,1)), f-vec3(0,0,1));
  float n101 = dot(hash3(i+vec3(1,0,1)), f-vec3(1,0,1));
  float n011 = dot(hash3(i+vec3(0,1,1)), f-vec3(0,1,1));
  float n111 = dot(hash3(i+vec3(1,1,1)), f-vec3(1,1,1));
  return mix(mix(mix(n000,n100,u.x), mix(n010,n110,u.x), u.y),
             mix(mix(n001,n101,u.x), mix(n011,n111,u.x), u.y), u.z);
}
float fbm(vec3 p, int oct, float lac, float gain){
  float a = 0.5, s = 0.0, norm = 0.0;
  for(int i=0;i<8;i++){
    if(i>=oct) break;
    s += a*snoise(p); norm += a; p *= lac; a *= gain;
  }
  return s/max(norm,0.0001);
}
float ridge(vec3 p, int oct){
  float a = 0.5, s = 0.0, norm = 0.0;
  for(int i=0;i<8;i++){
    if(i>=oct) break;
    s += a*(1.0-abs(snoise(p))); norm += a; p *= 2.03; a *= 0.5;
  }
  return s/max(norm,0.0001);
}
// crateras: células de Worley invertidas com borda elevada
float craterField(vec3 p, float scale){
  vec3 sp = p*scale;
  vec3 ip = floor(sp); vec3 fp = fract(sp);
  float h = 0.0;
  for(int x=-1;x<=1;x++) for(int y=-1;y<=1;y++) for(int z=-1;z<=1;z++){
    vec3 o = vec3(float(x),float(y),float(z));
    vec3 rnd = hash3(ip+o)*0.5+0.5;
    vec3 c = o + rnd;
    float d = length(fp-c);
    float rad = 0.25 + 0.25*rnd.x;
    if(d < rad){
      float t = d/rad;
      float bowl = -(1.0 - t*t)*0.7;
      float rim = exp(-pow((t-0.88)*7.0,2.0))*0.9;
      h += (bowl + rim) * (0.4+0.6*rnd.y);
    }
  }
  return h;
}
`

/* --------------------------------------------------------------- planets --- */

const PLANET_VERT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vObjPos;
varying vec3 vNormalW;
varying vec3 vWorldPos;
void main(){
  vObjPos = position;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vec4 wp = modelMatrix * vec4(position,1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
  #include <logdepthbuf_vertex>
}
`

const PLANET_FRAG = /* glsl */ `
precision highp float;
#include <common>
#include <logdepthbuf_pars_fragment>
${NOISE}
varying vec3 vObjPos;
varying vec3 vNormalW;
varying vec3 vWorldPos;

uniform vec3 uSunPos;
uniform vec3 uColA;
uniform vec3 uColB;
uniform vec3 uColC;
uniform float uSeed;
uniform float uTime;
uniform float uCraters;
uniform float uBands;
uniform float uTurb;
uniform float uIce;
uniform float uRough;
uniform float uClouds;
uniform int   uType;      // 0 rocky, 1 earth, 2 gas, 3 ice giant, 4 venus, 5 icy
uniform float uAmbient;
uniform float uRadius;    // raio em unidades de mundo (para escala de relevo)
uniform float uAlbedoVar;
uniform float uDetail;   // 0 = longe (barato), 1 = perto (relevo completo)
uniform vec3  uOccPos;    // corpo que pode eclipsar (posição mundo)
uniform float uOccRadius; // raio do ocultador (0 = desligado)
uniform float uSunRadius;

float terrainHeight(vec3 p){
  float h = 0.0;
  h += fbm(p*2.2, 6, 2.1, 0.5)*0.6;
  h += ridge(p*4.5, 5)*0.35*uRough;
  if(uCraters > 0.001){
    h += craterField(p, 3.0)*0.55*uCraters;
    if(uDetail > 0.25) h += craterField(p+17.0, 7.5)*0.28*uCraters;
    if(uDetail > 0.6)  h += craterField(p+41.0, 18.0)*0.12*uCraters;
  }
  return h;
}

vec3 rockySurface(vec3 p, vec3 n, out float height, out float gloss){
  float h = terrainHeight(p);
  height = h;
  float strata = fbm(p*9.0 + 3.0, 4, 2.0, 0.5);
  vec3 c = mix(uColA, uColB, smoothstep(-0.35, 0.45, h));
  c = mix(c, uColC, smoothstep(0.25, 0.85, h + strata*0.25));
  c *= 0.85 + 0.3*fbm(p*26.0, 3, 2.2, 0.5);

  // regiões de albedo escuro (basalto/poeira), marcantes em Marte
  if(uAlbedoVar > 0.001){
    float dark = fbm(p*2.05 + 51.0, 5, 2.05, 0.55);
    float mask = smoothstep(0.02, 0.32, dark);
    c = mix(c, c*vec3(0.52,0.46,0.44), mask*uAlbedoVar);
    // grandes cânions / falhas
    float rift = 1.0 - abs(fbm(vec3(p.x*1.7, p.y*5.5, p.z*1.7) + 7.0, 4, 2.1, 0.5));
    c = mix(c, c*0.55, smoothstep(0.93, 1.0, rift)*uAlbedoVar);
  }
  gloss = 0.04;
  if(uIce > 0.001){
    float lat = abs(n.y);
    // calotas estreitas e irregulares (Marte ~10-15° de latitude)
    float capEdge = 0.88 - 0.05*uIce;
    float caps = smoothstep(capEdge, 0.985, lat + fbm(p*7.0,4,2.0,0.5)*0.055);
    c = mix(c, vec3(0.93,0.95,0.99), caps*uIce);
    gloss = mix(gloss, 0.30, caps*uIce);
  }
  return c;
}

vec3 earthSurface(vec3 p, vec3 n, out float height, out float gloss, out float ocean){
  float cont = fbm(p*1.6 + uSeed, 7, 2.05, 0.52);
  cont += 0.32*fbm(p*3.7 - uSeed, 5, 2.1, 0.5);
  float shore = smoothstep(0.02, 0.10, cont);
  ocean = 1.0 - shore;
  float mountains = ridge(p*7.0, 6);
  float h = mix(-0.25, 0.15 + mountains*0.55, shore);
  height = h;

  vec3 deep = vec3(0.008,0.045,0.13);
  vec3 shallow = vec3(0.03,0.24,0.42);
  vec3 sea = mix(deep, shallow, smoothstep(-0.05,0.03,cont));

  float arid = fbm(p*4.1 + 21.0, 5, 2.0, 0.5)*0.5+0.5;
  float lat = abs(n.y);
  arid = clamp(arid + smoothstep(0.05,0.42,lat)*0.35 - smoothstep(0.55,0.85,lat)*0.5, 0.0, 1.0);
  vec3 forest = vec3(0.045,0.17,0.055);
  vec3 grass  = vec3(0.17,0.28,0.09);
  vec3 desert = vec3(0.60,0.47,0.26);
  vec3 land = mix(forest, grass, smoothstep(0.25,0.55,arid));
  land = mix(land, desert, smoothstep(0.55,0.82,arid));
  land = mix(land, vec3(0.42,0.38,0.33), smoothstep(0.45,0.85,mountains));
  float snow = smoothstep(0.80, 0.95, lat + mountains*0.25 - 0.08);
  land = mix(land, vec3(0.95,0.96,0.98), snow);

  vec3 c = mix(sea, land, shore);
  gloss = mix(0.75, 0.05, shore);
  return c;
}

vec3 gasSurface(vec3 p, vec3 n, out float gloss){
  float lat = n.y;

  // domain warping: o escoamento zonal distorce a latitude, criando festões e ondas
  vec3 wq = vec3(n.x*2.0, n.y*5.5, n.z*2.0) + vec3(uTime*0.02, 0.0, uSeed);
  float warp1 = fbm(wq, 6, 2.1, 0.55);
  float warp2 = fbm(wq*2.7 + warp1*1.5 + 11.0, 5, 2.2, 0.5);
  float turb = (warp1*0.7 + warp2*0.45) * uTurb;

  float latW = lat + turb*0.075;
  float bandCoord = latW * 15.0 * max(uBands, 0.15);

  // harmônicos irregulares -> cinturões de larguras distintas
  float band = sin(bandCoord*2.15) * 0.46
             + sin(bandCoord*1.13 + 1.9) * 0.30
             + sin(bandCoord*3.7  + 0.4) * 0.16
             + sin(bandCoord*6.1  + 2.6) * 0.08;
  band = band*0.5 + 0.5;
  band = clamp(mix(band, smoothstep(0.20, 0.80, band), 0.7), 0.0, 1.0);

  // cor: cinturões escuros avermelhados x zonas claras amareladas
  vec3 belt = uColA;
  vec3 zone = uColB;
  vec3 c = mix(belt, zone, band);
  c = mix(c, uColC, smoothstep(0.72, 1.0, band) * 0.55);
  c = mix(c, belt*0.66, smoothstep(0.30, 0.0, band) * 0.7);

  // variação de matiz por banda (nem toda faixa tem a mesma cor)
  float hueVar = fbm(vec3(0.0, latW*9.0, uSeed), 3, 2.0, 0.5);
  c *= vec3(1.0 + hueVar*0.13, 1.0 + hueVar*0.04, 1.0 - hueVar*0.10);

  // turbulência fina: vórtices e plumas nas bordas dos cinturões
  float shear = abs(fract(bandCoord*0.35) - 0.5) * 2.0;
  float wisp = fbm(vec3(n.x*7.0, n.y*13.0, n.z*7.0) + turb*2.5 + uTime*0.03, 5, 2.2, 0.5);
  c *= 0.88 + 0.24 * wisp * (0.45 + 0.55*(1.0-shear));

  // pequenos ovais brancos
  float ovals = smoothstep(0.80, 0.95, fbm(vec3(n.x*11.0, n.y*26.0, n.z*11.0) + 31.0, 4, 2.1, 0.5)*0.5+0.5);
  c = mix(c, uColC*1.06, ovals*0.5*uBands);

  // escurecimento polar
  c *= 1.0 - smoothstep(0.66, 1.0, abs(lat))*0.38;

  // Grande Mancha Vermelha (só em Júpiter: uBands alto)
  if(uBands > 0.7){
    vec2 spot = vec2(atan(n.z, n.x), asin(clamp(n.y,-1.0,1.0)));
    float sx = mod(spot.x + uTime*0.004 + uSeed + 3.14159, 6.28318) - 3.14159;
    // oval ~1,4x mais largo que alto, centrado a ~22°S
    vec2 d2 = vec2(sx*0.52, (spot.y + 0.38)*1.5);
    float ang = atan(d2.y, d2.x);
    float rr = length(d2);
    // espiral interna da tempestade
    float swirlN = fbm(vec3(cos(ang*2.0+rr*9.0-uTime*0.05), sin(ang*2.0+rr*9.0), rr*4.0)*2.2, 4, 2.1, 0.5);
    float grs = exp(-pow(rr*3.1, 4.0));
    vec3 grsCol = mix(vec3(0.78,0.35,0.20), vec3(0.54,0.17,0.09), swirlN*0.5+0.5);
    c = mix(c, grsCol, grs*0.93);
    // halo claro estreito contornando a tempestade
    c = mix(c, uColC, exp(-pow((rr-0.40)*8.5, 2.0))*0.28);
  }

  gloss = 0.05;
  return c;
}

vec3 iceGiant(vec3 p, vec3 n, out float gloss){
  float lat = n.y;
  float flow = fbm(vec3(n.x*1.1, n.y*5.0, n.z*1.1) + uSeed + uTime*0.015, 5, 2.0, 0.55);
  float band = (sin(lat*11.0*max(uBands,0.1) + flow*0.5)*0.6 + sin(lat*4.5 + 0.8)*0.4)*0.5+0.5;
  vec3 c = mix(uColA, uColB, band*0.55 + 0.12);
  c = mix(c, uColA*0.78, smoothstep(0.3, 0.0, band)*0.45);
  float storm = smoothstep(0.62, 0.92, fbm(p*5.0 + 8.0 + uTime*0.02, 5, 2.1, 0.5)*0.5+0.5);
  c = mix(c, uColC, storm*0.5*uTurb);
  c *= 1.0 - smoothstep(0.8,1.0,abs(lat))*0.18;
  gloss = 0.08;
  return c;
}

vec3 venusSurface(vec3 p, vec3 n, out float gloss){
  float lat = n.y;
  float swirl = fbm(p*2.4 + vec3(uTime*0.05, uTime*0.01, uSeed), 6, 2.1, 0.55);
  float streak = fbm(vec3(n.x*1.2, n.y*8.0, n.z*1.2) + swirl*2.0 + uTime*0.06, 5, 2.0, 0.5);
  float v = swirl*0.6 + streak*0.6 + 0.5;
  vec3 c = mix(uColA, uColB, smoothstep(0.15,0.85,v));
  c = mix(c, uColC, smoothstep(0.72,1.05,v));
  c *= 1.0 - smoothstep(0.65,1.0,abs(lat))*0.22;
  gloss = 0.05;
  return c;
}

vec3 icySurface(vec3 p, vec3 n, out float height, out float gloss){
  float cracks = 1.0 - abs(fbm(p*4.0 + uSeed, 5, 2.1, 0.5));
  float cracks2 = 1.0 - abs(fbm(p*11.0 - uSeed, 4, 2.2, 0.5));
  float l = smoothstep(0.80, 1.0, cracks)*0.8 + smoothstep(0.86,1.0,cracks2)*0.5;
  float mottle = fbm(p*7.0, 5, 2.0, 0.5)*0.5+0.5;
  vec3 c = mix(uColB, uColC, mottle);
  c = mix(c, uColA*1.4, clamp(l,0.0,1.0)*0.55);
  height = (mottle-0.5)*0.25 - l*0.15;
  gloss = 0.45;
  return c;
}

void main(){
  #include <logdepthbuf_fragment>
  vec3 p = normalize(vObjPos);
  vec3 sp = p * 1.0 + uSeed;
  float height = 0.0, gloss = 0.05, ocean = 0.0;
  vec3 albedo;

  if(uType == 1){ albedo = earthSurface(sp, p, height, gloss, ocean); }
  else if(uType == 2){ albedo = gasSurface(sp, p, gloss); }
  else if(uType == 3){ albedo = iceGiant(sp, p, gloss); }
  else if(uType == 4){ albedo = venusSurface(sp, p, gloss); }
  else if(uType == 5){ albedo = icySurface(sp, p, height, gloss); }
  else { albedo = rockySurface(sp, p, height, gloss); }

  // normal do relevo por diferenças finitas (apenas superfícies sólidas)
  vec3 N = normalize(vNormalW);
  if(uDetail > 0.12 && (uType == 0 || uType == 1 || uType == 5)){
    float eps = 0.012;
    vec3 t1 = normalize(cross(N, abs(N.y) < 0.9 ? vec3(0.0,1.0,0.0) : vec3(1.0,0.0,0.0)));
    vec3 t2 = normalize(cross(N, t1));
    float h0 = height;
    float hx, hy, g, o;
    vec3 sa = sp + t1*eps, sb = sp + t2*eps;
    vec3 na = normalize(p + t1*eps), nb = normalize(p + t2*eps);
    if(uType == 1){ earthSurface(sa, na, hx, g, o); earthSurface(sb, nb, hy, g, o); }
    else if(uType == 5){ icySurface(sa, na, hx, g); icySurface(sb, nb, hy, g); }
    else { rockySurface(sa, na, hx, g); rockySurface(sb, nb, hy, g); }
    float amp = (uType == 1 ? 0.55 : 0.9) * (1.0 - ocean);
    N = normalize(N - (t1*(hx-h0) + t2*(hy-h0)) * amp / eps * 0.06);
  }

  vec3 L = normalize(uSunPos - vWorldPos);
  vec3 V = normalize(cameraPosition - vWorldPos);
  vec3 H = normalize(L+V);
  float ndl = dot(N, L);

  // eclipse: penumbra/umbra causada por outro corpo entre a superfície e o Sol
  float eclipse = 1.0;
  if(uOccRadius > 0.0){
    vec3 toOcc = uOccPos - vWorldPos;
    float tc = dot(toOcc, L);
    if(tc > 0.0){
      float sunDist = length(uSunPos - vWorldPos);
      float d = length(toOcc - L*tc);
      // raio aparente do ocultador vs. raio aparente do Sol, no céu deste ponto
      float angOcc = uOccRadius / max(tc, 1e-4);
      float angSun = uSunRadius / max(sunDist, 1e-4);
      float angSep = d / max(tc, 1e-4);
      float cover = smoothstep(angOcc + angSun, max(angOcc - angSun, 0.0), angSep);
      eclipse = 1.0 - cover * 0.97;
    }
  }

  // difusa com terminador suave (efeito de atmosfera / rugosidade)
  float diff = clamp(ndl, 0.0, 1.0);
  float wrap = clamp((ndl + 0.15)/1.15, 0.0, 1.0);
  diff = mix(diff, wrap, 0.35);

  float spec = pow(clamp(dot(N,H),0.0,1.0), mix(18.0, 190.0, gloss)) * gloss * 1.5;
  if(uType == 1) spec *= ocean*0.55 + 0.05;

  diff *= eclipse;
  spec *= eclipse;
  vec3 col = albedo * (diff * 1.15 + uAmbient);
  col += vec3(1.0,0.97,0.9) * spec * clamp(ndl*3.0,0.0,1.0) * 0.6;
  // luz avermelhada refratada durante eclipses totais
  col += albedo * vec3(0.55,0.14,0.05) * (1.0 - eclipse) * clamp(ndl,0.0,1.0) * 0.35;

  // nuvens (Terra)
  if(uClouds > 0.001){
    vec3 cp = sp*2.4 + vec3(uTime*0.012, 0.0, 0.0);
    float cl = fbm(cp, 6, 2.2, 0.55)*0.5+0.5;
    float cl2 = fbm(cp*2.6 + 5.0, 5, 2.1, 0.5)*0.5+0.5;
    float cover = smoothstep(0.52, 0.80, cl*0.75 + cl2*0.35);
    float lat = abs(p.y);
    cover *= 1.0 - smoothstep(0.78, 1.0, lat)*0.4;
    cover *= uClouds;
    vec3 cloudLit = vec3(0.97,0.98,1.0) * (diff*1.16 + uAmbient*1.3);
    col = mix(col, cloudLit, cover*0.92);
  }

  // luzes noturnas (Terra)
  if(uType == 1){
    float night = smoothstep(0.08, -0.22, ndl);
    float pop = smoothstep(0.55, 0.95, fbm(sp*22.0 + 4.0, 4, 2.3, 0.55)*0.5+0.5);
    float land = 1.0 - ocean;
    col += vec3(1.0,0.78,0.42) * night * pop * land * 0.55;
  }

  // Fresnel/rim
  float rim = pow(1.0 - clamp(dot(N,V),0.0,1.0), 3.0);
  col += albedo * rim * 0.10 * clamp(ndl+0.35,0.0,1.0);

  gl_FragColor = vec4(col, 1.0);
}
`

const TYPE_INDEX: Record<string, number> = { rocky: 0, earth: 1, gas: 2, 'ice-giant': 3, venus: 4, icy: 5, sun: 0 }

export function makePlanetMaterial(b: BodyDef, worldRadius: number) {
  const p = b.p
  return new THREE.ShaderMaterial({
    vertexShader: PLANET_VERT,
    fragmentShader: PLANET_FRAG,
    uniforms: {
      uSunPos: { value: new THREE.Vector3() },
      uColA: { value: new THREE.Vector3(...p.colA) },
      uColB: { value: new THREE.Vector3(...p.colB) },
      uColC: { value: new THREE.Vector3(...p.colC) },
      uSeed: { value: p.seed },
      uTime: { value: 0 },
      uCraters: { value: p.craters ?? 0 },
      uBands: { value: p.bands ?? 0 },
      uTurb: { value: p.turb ?? 0 },
      uIce: { value: p.ice ?? 0 },
      uRough: { value: p.rough ?? 0.6 },
      uClouds: { value: p.clouds ?? 0 },
      uType: { value: TYPE_INDEX[b.surface] ?? 0 },
      uAmbient: { value: 0.022 },
      uRadius: { value: worldRadius },
      uDetail: { value: 1 },
      uAlbedoVar: { value: p.albedoVar ?? 0 },
      uOccPos: { value: new THREE.Vector3() },
      uOccRadius: { value: 0 },
      uSunRadius: { value: 1 },
    },
  })
}

/* ------------------------------------------------------------------ sun ---- */

const SUN_FRAG = /* glsl */ `
precision highp float;
#include <common>
#include <logdepthbuf_pars_fragment>
${NOISE}
varying vec3 vObjPos;
varying vec3 vNormalW;
varying vec3 vWorldPos;
uniform float uTime;
uniform vec3 uColA;
uniform vec3 uColB;
uniform vec3 uColC;
void main(){
  #include <logdepthbuf_fragment>
  vec3 p = normalize(vObjPos);
  float t = uTime*0.05;
  float gran = fbm(p*14.0 + vec3(t*0.6, t*0.4, -t*0.5), 6, 2.2, 0.55);
  float gran2 = fbm(p*38.0 - vec3(t, 0.0, t*0.7), 5, 2.1, 0.5);
  float cells = 1.0 - abs(fbm(p*22.0 + t*0.8, 4, 2.3, 0.5));
  float v = gran*0.85 + gran2*0.42 + cells*0.30;
  float spots = smoothstep(0.62, 0.86, fbm(p*5.0 + 12.0 + t*0.2, 5, 2.0, 0.5)*0.5+0.5);
  vec3 col = mix(uColA, uColB, smoothstep(-0.30, 0.55, v));
  col = mix(col, uColC, smoothstep(0.52, 1.05, v)*0.75);
  col = mix(col, uColA*0.25, spots*0.75);
  // escurecimento de limbo
  vec3 V = normalize(cameraPosition - vWorldPos);
  float mu = clamp(dot(normalize(vNormalW), V), 0.0, 1.0);
  col *= 0.34 + 0.66*pow(mu, 0.62);
  // fáculas brilhantes perto do limbo
  col += uColC * pow(1.0-mu, 2.5) * 0.10;
  gl_FragColor = vec4(col*0.78, 1.0);
}
`

export function makeSunMaterial(b: BodyDef) {
  return new THREE.ShaderMaterial({
    vertexShader: PLANET_VERT,
    fragmentShader: SUN_FRAG,
    uniforms: {
      uTime: { value: 0 },
      uColA: { value: new THREE.Vector3(...b.p.colA) },
      uColB: { value: new THREE.Vector3(...b.p.colB) },
      uColC: { value: new THREE.Vector3(...b.p.colC) },
    },
  })
}

/* ----------------------------------------------------------- atmosphere ---- */

const ATMO_VERT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vNormalW;
varying vec3 vWorldPos;
void main(){
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vec4 wp = modelMatrix * vec4(position,1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
  #include <logdepthbuf_vertex>
}
`

const ATMO_FRAG = /* glsl */ `
precision highp float;
#include <common>
#include <logdepthbuf_pars_fragment>
varying vec3 vNormalW;
varying vec3 vWorldPos;
uniform vec3 uColor;
uniform vec3 uSunPos;
uniform float uStrength;
void main(){
  #include <logdepthbuf_fragment>
  vec3 N = normalize(vNormalW);
  vec3 V = normalize(cameraPosition - vWorldPos);
  vec3 L = normalize(uSunPos - vWorldPos);
  float fres = pow(1.0 - clamp(dot(N,V),0.0,1.0), 2.6);
  float lit = clamp(dot(N,L)+0.32, 0.0, 1.0);
  float scatter = pow(clamp(dot(V, -L),0.0,1.0), 3.0);
  float a = fres * lit * uStrength;
  vec3 c = uColor * (1.0 + scatter*1.4);
  gl_FragColor = vec4(c, clamp(a, 0.0, 1.0)*0.85);
}
`

export function makeAtmosphereMaterial(color: [number, number, number], strength: number) {
  return new THREE.ShaderMaterial({
    vertexShader: ATMO_VERT,
    fragmentShader: ATMO_FRAG,
    uniforms: {
      uColor: { value: new THREE.Vector3(...color) },
      uSunPos: { value: new THREE.Vector3() },
      uStrength: { value: strength },
    },
    transparent: true,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
    depthWrite: false,
  })
}

/* ---------------------------------------------------------------- rings ---- */

const RING_VERT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vWorldPos;
varying vec2 vUv;
void main(){
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position,1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
  #include <logdepthbuf_vertex>
}
`

const RING_FRAG = /* glsl */ `
precision highp float;
#include <common>
#include <logdepthbuf_pars_fragment>
${NOISE}
varying vec3 vWorldPos;
varying vec2 vUv;
uniform vec3 uSunPos;
uniform vec3 uPlanetPos;
uniform float uPlanetRadius;
uniform float uInner;
uniform float uOuter;
uniform vec3 uTint;
uniform float uSeed;
uniform float uOpacity;

void main(){
  #include <logdepthbuf_fragment>
  float r = mix(uInner, uOuter, vUv.x);
  float t = (r - uInner)/(uOuter - uInner);

  // estrutura fina de anéis
  float fine = fbm(vec3(t*160.0 + uSeed, 0.0, 0.0), 5, 2.3, 0.55)*0.5+0.5;
  float mid  = fbm(vec3(t*32.0 - uSeed, 5.0, 0.0), 4, 2.1, 0.5)*0.5+0.5;
  float dens = clamp(mid*0.75 + fine*0.55 - 0.18, 0.0, 1.0);

  // divisão de Cassini e bordas
  dens *= 1.0 - exp(-pow((t-0.62)*26.0, 2.0))*0.95;
  dens *= 1.0 - exp(-pow((t-0.28)*40.0, 2.0))*0.5;
  dens *= smoothstep(0.0, 0.05, t) * (1.0 - smoothstep(0.93, 1.0, t));

  // sombra do planeta sobre os anéis
  vec3 L = normalize(uSunPos - vWorldPos);
  vec3 toP = uPlanetPos - vWorldPos;
  float tc = dot(toP, L);
  float shadow = 1.0;
  if(tc > 0.0){
    float d = length(toP - L*tc);
    shadow = smoothstep(uPlanetRadius*0.92, uPlanetRadius*1.15, d);
  }
  shadow = mix(0.10, 1.0, shadow);

  vec3 col = uTint * (0.42 + 0.62*fine) * shadow * 0.95;
  float alpha = dens * 0.92 * uOpacity;
  gl_FragColor = vec4(col, alpha);
}
`

export function makeRingMaterial(inner: number, outer: number, tint: THREE.Color, seed: number, opacity = 1) {
  return new THREE.ShaderMaterial({
    vertexShader: RING_VERT,
    fragmentShader: RING_FRAG,
    uniforms: {
      uSunPos: { value: new THREE.Vector3() },
      uPlanetPos: { value: new THREE.Vector3() },
      uPlanetRadius: { value: 1 },
      uInner: { value: inner },
      uOuter: { value: outer },
      uTint: { value: new THREE.Vector3(tint.r, tint.g, tint.b) },
      uSeed: { value: seed },
      uOpacity: { value: opacity },
    },
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
  })
}

/** Geometria de anel com UV radial (vUv.x = raio normalizado). */
export function ringGeometry(inner: number, outer: number, segments = 256) {
  const geo = new THREE.RingGeometry(inner, outer, segments, 8)
  const pos = geo.attributes.position as THREE.BufferAttribute
  const uv = geo.attributes.uv as THREE.BufferAttribute
  const v = new THREE.Vector3()
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i)
    const r = v.length()
    uv.setXY(i, (r - inner) / (outer - inner), Math.atan2(v.y, v.x) / (Math.PI * 2) + 0.5)
  }
  uv.needsUpdate = true
  geo.rotateX(-Math.PI / 2)
  return geo
}

/* ---------------------------------------------------------------- glow ----- */

const GLOW_FRAG = /* glsl */ `
precision highp float;
#include <common>
#include <logdepthbuf_pars_fragment>
varying vec3 vNormalW;
varying vec3 vWorldPos;
uniform vec3 uColor;
uniform float uPower;
uniform float uStrength;
void main(){
  #include <logdepthbuf_fragment>
  vec3 N = normalize(vNormalW);
  vec3 V = normalize(cameraPosition - vWorldPos);
  float f = pow(1.0 - clamp(dot(N,V),0.0,1.0), uPower);
  gl_FragColor = vec4(uColor, f*uStrength);
}
`

/**
 * Halo/coroa como billboard: um quad que sempre encara a câmera e é escalado em
 * unidades de mundo. Evita o artefato de a câmera entrar dentro da esfera de brilho.
 */
export function makeCoronaMaterial(color: THREE.Color, strength = 1.0) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Vector3(color.r, color.g, color.b) },
      uStrength: { value: strength },
      uSize: { value: 1 },
    },
    vertexShader: /* glsl */ `
      uniform float uSize;
      varying vec2 vUv;
      void main(){
        vUv = uv * 2.0 - 1.0;
        // billboard: extrai a posição do objeto e desenha o quad no espaço da câmera
        vec3 center = (modelViewMatrix * vec4(0.0,0.0,0.0,1.0)).xyz;
        vec3 pos = center + vec3(position.x, position.y, 0.0) * uSize;
        gl_Position = projectionMatrix * vec4(pos, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform vec3 uColor;
      uniform float uStrength;
      varying vec2 vUv;
      void main(){
        float r = length(vUv);
        if(r > 1.0) discard;
        // soma de duas exponenciais: núcleo intenso + halo largo (perfil de estrela real)
        float core = exp(-r*r*26.0);
        float halo = exp(-r*3.1);
        float a = (core*0.85 + halo*0.42) * uStrength * smoothstep(1.0, 0.86, r);
        gl_FragColor = vec4(uColor, a);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
    side: THREE.DoubleSide,
  })
}

export function makeGlowMaterial(color: THREE.Color, power = 3.0, strength = 1.0) {
  return new THREE.ShaderMaterial({
    vertexShader: ATMO_VERT,
    fragmentShader: GLOW_FRAG,
    uniforms: {
      uColor: { value: new THREE.Vector3(color.r, color.g, color.b) },
      uPower: { value: power },
      uStrength: { value: strength },
    },
    transparent: true,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
    depthWrite: false,
  })
}
