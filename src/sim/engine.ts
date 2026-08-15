import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { BODIES, BODY_MAP, AU, KM, type BodyDef } from './data'
import { orbitalPosition, orbitPath, daysSinceJ2000, dateFromDays } from './kepler'
import { makePlanetMaterial, makeSunMaterial, makeAtmosphereMaterial, makeRingMaterial, ringGeometry, makeCoronaMaterial } from './shaders'
import { createStarfield, createMilkyWay } from './stars'

/* ----------------------------------------------------------------------- */
/* Escala: 1 unidade de mundo = 1000 km. Distâncias reais, raios ampliáveis. */

const AUW = AU * KM // 1 AU em unidades de mundo (~149.598)

export interface EngineState {
  days: number
  timeScale: number // dias por segundo
  paused: boolean
  focus: string
  planetScale: number
  showOrbits: boolean
  showLabels: boolean
  realScale: boolean
}

export interface BodyView {
  def: BodyDef
  group: THREE.Group // posição no sistema
  spin: THREE.Group // rotação própria + inclinação axial
  mesh: THREE.Mesh
  atmo?: THREE.Mesh
  rings?: THREE.Mesh
  glow?: THREE.Mesh
  corona?: THREE.Mesh
  coma?: THREE.Mesh
  orbitLine?: THREE.Line
  worldPos: THREE.Vector3
  radiusW: number // raio renderizado (unidades de mundo)
  trueRadiusW: number
  screen: { x: number; y: number; visible: boolean; dist: number }
  tail?: THREE.Points
}

export interface Marker {
  id: string
  name: string
  color: string
  kind: string
  x: number
  y: number
  visible: boolean
  dist: number
  focused: boolean
}

export class SolarEngine {
  renderer: THREE.WebGLRenderer
  scene = new THREE.Scene()
  skyScene = new THREE.Scene()
  camera: THREE.PerspectiveCamera
  composer: EffectComposer
  bloom: UnrealBloomPass
  views = new Map<string, BodyView>()
  state: EngineState = {
    days: daysSinceJ2000(new Date()),
    timeScale: 1,
    paused: false,
    focus: 'earth',
    planetScale: 1,
    showOrbits: true,
    showLabels: true,
    realScale: false,
  }

  // câmera orbital
  private target = new THREE.Vector3()
  /** Deslocamento residual ao trocar de foco; decai a zero (a câmera nunca "persegue" um alvo móvel). */
  private focusOffset = new THREE.Vector3()
  private camDist = 60
  private camTheta = 0.7
  private camPhi = 1.1
  private desired = { dist: 60, theta: 0.7, phi: 1.1 }
  private sunLight: THREE.PointLight
  private clock = new THREE.Clock()
  private raycaster = new THREE.Raycaster()
  private starfield: THREE.Points
  private milkyway: THREE.Mesh
  private tmp = new THREE.Vector3()
  private tmp2 = new THREE.Vector3()
  private disposed = false
  private orbitGroup = new THREE.Group()
  private container: HTMLElement

  onMarkers?: (m: Marker[]) => void
  onTick?: (info: { days: number; date: Date; fps: number; focusDist: number }) => void
  onPick?: (id: string | null) => void

  constructor(container: HTMLElement) {
    this.container = container
    const w = container.clientWidth || window.innerWidth
    const h = container.clientHeight || window.innerHeight

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', logarithmicDepthBuffer: true })
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    this.renderer.setSize(w, h)
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 0.92
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    container.appendChild(this.renderer.domElement)

    this.camera = new THREE.PerspectiveCamera(50, w / h, 0.02, 1e9)
    this.camera.position.set(0, 30, 90)

    this.scene.add(this.orbitGroup)

    this.milkyway = createMilkyWay()
    this.skyScene.add(this.milkyway)
    this.starfield = createStarfield()
    this.skyScene.add(this.starfield)

    this.sunLight = new THREE.PointLight(0xfff4e2, 3.2, 0, 0)
    this.scene.add(this.sunLight)
    this.scene.add(new THREE.AmbientLight(0x223344, 0.12))

    this.buildBodies()

    // o céu é uma cena à parte: sempre no fundo, sem interferir no depth dos corpos
    const skyPass = new RenderPass(this.skyScene, this.camera)
    const rp = new RenderPass(this.scene, this.camera)
    rp.clear = false
    rp.clearDepth = true
    this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.34, 0.55, 0.98)
    this.composer = new EffectComposer(this.renderer)
    this.composer.addPass(skyPass)
    this.composer.addPass(rp)
    this.composer.addPass(this.bloom)
    this.composer.addPass(new OutputPass())

    this.attachControls()
    this.focusBody('earth', true)
    this.animate()
  }

  /* --------------------------------------------------------------- build -- */

  private buildBodies() {
    for (const def of BODIES) {
      const group = new THREE.Group()
      const spin = new THREE.Group()
      group.add(spin)

      const trueRadiusW = def.radius * KM
      const radiusW = trueRadiusW

      const segs = def.radius > 20000 ? 128 : def.radius > 1000 ? 96 : 48
      const geo = new THREE.SphereGeometry(1, segs, segs / 2)
      const mat = def.surface === 'sun' ? makeSunMaterial(def) : makePlanetMaterial(def, radiusW)
      const mesh = new THREE.Mesh(geo, mat)
      mesh.scale.setScalar(radiusW)
      mesh.userData.bodyId = def.id
      spin.add(mesh)

      // inclinação axial
      spin.rotation.z = THREE.MathUtils.degToRad(def.tilt)

      const view: BodyView = {
        def,
        group,
        spin,
        mesh,
        worldPos: new THREE.Vector3(),
        radiusW,
        trueRadiusW,
        screen: { x: 0, y: 0, visible: false, dist: 0 },
      }

      if (def.p.atmo) {
        const am = makeAtmosphereMaterial(def.p.atmo, def.p.atmoStrength ?? 1)
        const atmo = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), am)
        atmo.scale.setScalar(radiusW * 1.035)
        spin.add(atmo)
        view.atmo = atmo
      }

      if (def.rings) {
        const tint = new THREE.Color(def.color)
        const rgeo = ringGeometry(def.rings.inner, def.rings.outer, 256)
        const rmat = makeRingMaterial(def.rings.inner, def.rings.outer, tint, def.p.seed, def.rings.opacity ?? 1)
        const rings = new THREE.Mesh(rgeo, rmat)
        rings.scale.setScalar(radiusW)
        rings.renderOrder = 3
        spin.add(rings)
        view.rings = rings
      }

      if (def.surface === 'sun') {
        // halo interno + coroa externa, ambos billboards (corretos a qualquer distância)
        const glow = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), makeCoronaMaterial(new THREE.Color(0xffc061), 0.5))
        glow.renderOrder = 6
        glow.frustumCulled = false
        group.add(glow)
        view.glow = glow

        const corona = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), makeCoronaMaterial(new THREE.Color(0xff8a2a), 0.16))
        corona.renderOrder = 5
        corona.frustumCulled = false
        group.add(corona)
        view.corona = corona
      }

      if (def.kind === 'comet') {
        view.tail = this.makeCometTail(radiusW)
        group.add(view.tail)
        // coma: envelope de gás brilhante ao redor do núcleo
        const coma = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), makeCoronaMaterial(new THREE.Color(0x9fd8ff), 0.55))
        coma.renderOrder = 6
        coma.frustumCulled = false
        group.add(coma)
        view.coma = coma
      }

      // linha de órbita
      if (def.orbit) {
        const pts = orbitPath(def.orbit, def.kind === 'comet' ? 1024 : 512).map((v) => v.multiplyScalar(AUW))
        const g = new THREE.BufferGeometry().setFromPoints(pts)
        const colors = new Float32Array(pts.length * 3)
        const c = new THREE.Color(def.color)
        for (let i = 0; i < pts.length; i++) {
          const f = 0.18 + 0.82 * Math.pow(i / pts.length, 2.2)
          colors[i * 3] = c.r * f
          colors[i * 3 + 1] = c.g * f
          colors[i * 3 + 2] = c.b * f
        }
        g.setAttribute('color', new THREE.BufferAttribute(colors, 3))
        const m = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.55, depthWrite: false })
        const line = new THREE.Line(g, m)
        line.frustumCulled = false
        view.orbitLine = line
        this.orbitGroup.add(line)
      }

      this.scene.add(group)
      this.views.set(def.id, view)
    }
  }

  private makeCometTail(radiusW: number) {
    const N = 3200
    const pos = new Float32Array(N * 3)
    const seed = new Float32Array(N)
    for (let i = 0; i < N; i++) {
      seed[i] = Math.random()
      pos[i * 3] = 0
      pos[i * 3 + 1] = 0
      pos[i * 3 + 2] = 0
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1))
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uDir: { value: new THREE.Vector3(1, 0, 0) },
        uLen: { value: radiusW * 900 },
        uSize: { value: 2.0 },
        uActivity: { value: 0 },
        uProj: { value: 1000 }, // projectionMatrix[1][1] * altura do viewport / 2
      },
      vertexShader: /* glsl */ `
        attribute float aSeed;
        uniform vec3 uDir; uniform float uLen; uniform float uSize; uniform float uActivity; uniform float uProj;
        varying float vT; varying float vType;
        float h(float x){ return fract(sin(x*127.1)*43758.5); }
        void main(){
          float t = pow(aSeed, 1.6);
          vT = t;
          vType = step(0.5, h(aSeed*7.3));
          vec3 perp1 = normalize(cross(uDir, vec3(0.0,1.0,0.0)+0.001));
          vec3 perp2 = normalize(cross(uDir, perp1));
          // cauda de íons (azul, reta e estreita) x cauda de poeira (amarela, curva e larga)
          float spread = (vType > 0.5 ? 0.022 : 0.115) * t;
          float a = h(aSeed*13.7)*6.2831;
          float rr = h(aSeed*31.1);
          // a poeira fica para trás na órbita, encurvando a cauda
          float curve = (vType > 0.5) ? 0.0 : t*t*0.20;
          vec3 off = uDir * (t*uLen*uActivity*(vType > 0.5 ? 1.0 : 0.72))
                   + (perp1*cos(a)+perp2*sin(a)) * spread * uLen * rr * uActivity
                   + perp1 * curve * uLen * uActivity;
          vec4 mv = modelViewMatrix * vec4(off, 1.0);
          gl_Position = projectionMatrix * mv;
          // tamanho em unidades de mundo, projetado corretamente em pixels
          float worldSize = uLen * (0.0020 + 0.016*t);
          gl_PointSize = clamp(worldSize * uProj / max(-mv.z, 0.0001), 1.0, 90.0);
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        varying float vT; varying float vType;
        void main(){
          float r = length(gl_PointCoord-0.5);
          if(r > 0.5) discard;
          float fall = exp(-r*r*15.0);
          // brilho cai rápido ao longo da cauda
          float a = fall * pow(1.0-vT, 1.7) * (vType > 0.5 ? 0.26 : 0.15);
          vec3 c = vType > 0.5 ? vec3(0.42,0.68,1.0) : vec3(0.98,0.93,0.76);
          if(a < 0.002) discard;
          gl_FragColor = vec4(c, a);
        }
      `,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    })
    const p = new THREE.Points(geo, mat)
    p.frustumCulled = false
    p.renderOrder = -5
    return p
  }

  /* ------------------------------------------------------------ controls -- */

  private attachControls() {
    const el = this.renderer.domElement
    let dragging = false
    let moved = 0
    let lx = 0
    let ly = 0
    const pointers = new Map<number, { x: number; y: number }>()
    let pinchDist = 0

    el.addEventListener('pointerdown', (e) => {
      el.setPointerCapture(e.pointerId)
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      dragging = true
      moved = 0
      lx = e.clientX
      ly = e.clientY
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()]
        pinchDist = Math.hypot(a.x - b.x, a.y - b.y)
      }
    })

    el.addEventListener('pointermove', (e) => {
      if (!pointers.has(e.pointerId)) return
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })

      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()]
        const d = Math.hypot(a.x - b.x, a.y - b.y)
        if (pinchDist > 0) this.zoom(Math.pow(d / pinchDist, -1.6))
        pinchDist = d
        return
      }
      if (!dragging) return
      const dx = e.clientX - lx
      const dy = e.clientY - ly
      lx = e.clientX
      ly = e.clientY
      moved += Math.abs(dx) + Math.abs(dy)
      this.desired.theta -= dx * 0.005
      this.desired.phi = THREE.MathUtils.clamp(this.desired.phi - dy * 0.005, 0.03, Math.PI - 0.03)
    })

    const end = (e: PointerEvent) => {
      pointers.delete(e.pointerId)
      if (pointers.size < 2) pinchDist = 0
      if (dragging && moved < 6) this.pick(e)
      if (pointers.size === 0) dragging = false
    }
    el.addEventListener('pointerup', end)
    el.addEventListener('pointercancel', end)

    el.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault()
        this.zoom(Math.exp(e.deltaY * 0.0012))
      },
      { passive: false },
    )
  }

  zoom(f: number) {
    const v = this.views.get(this.state.focus)
    const min = v ? v.radiusW * 1.035 : 1
    this.desired.dist = THREE.MathUtils.clamp(this.desired.dist * f, min, AUW * 260)
  }

  private pick(e: PointerEvent) {
    const rect = this.renderer.domElement.getBoundingClientRect()
    const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1)
    this.raycaster.setFromCamera(ndc, this.camera)
    const meshes = [...this.views.values()].map((v) => v.mesh)
    const hits = this.raycaster.intersectObjects(meshes, false)
    if (hits.length) {
      const id = hits[0].object.userData.bodyId as string
      this.onPick?.(id)
      return
    }
    // fallback: clique perto de um marcador na tela
    let best: { id: string; d: number } | null = null
    for (const v of this.views.values()) {
      if (!v.screen.visible) continue
      const d = Math.hypot(v.screen.x - (e.clientX - rect.left), v.screen.y - (e.clientY - rect.top))
      if (d < 34 && (!best || d < best.d)) best = { id: v.def.id, d }
    }
    this.onPick?.(best ? best.id : null)
  }

  /* --------------------------------------------------------------- focus -- */

  focusBody(id: string, instant = false) {
    const v = this.views.get(id)
    if (!v) return
    const prev = this.views.get(this.state.focus)
    this.state.focus = id
    const d = Math.max(v.radiusW * 5.5, 0.6)
    this.desired.dist = d

    // enquadra o corpo pelo lado iluminado (crescente de ~3/4), como numa foto de sonda
    const sun = this.views.get('sun')
    if (sun && v !== sun) {
      this.tmp.copy(v.worldPos).sub(sun.worldPos) // Sol -> corpo
      // ângulo da câmera no plano XZ, deslocado 38° para dar relevo ao terminador
      const base = Math.atan2(-this.tmp.x, -this.tmp.z)
      this.desired.theta = base + 0.66
      this.desired.phi = Math.PI / 2 - 0.28
      if (instant) {
        this.camTheta = this.desired.theta
        this.camPhi = this.desired.phi
      }
    }
    if (instant) {
      this.camDist = d
      this.updatePositions()
      this.target.copy(v.worldPos)
      this.focusOffset.set(0, 0, 0)
      return
    }
    // transição suave: parte da posição anterior e converge para o novo alvo
    if (prev) {
      this.focusOffset.copy(prev.worldPos).sub(v.worldPos)
      // evita viagens absurdas entre corpos muito distantes
      const max = AUW * 45
      if (this.focusOffset.length() > max) this.focusOffset.setLength(max)
    }
  }

  /* ---------------------------------------------------------------- tick -- */

  private updatePositions() {
    const days = this.state.days
    const scale = this.state.realScale ? 1 : this.state.planetScale

    for (const v of this.views.values()) {
      const def = v.def
      if (def.orbit && def.parent) {
        orbitalPosition(def.orbit, days, this.tmp).multiplyScalar(AUW)
        const parent = this.views.get(def.parent)
        if (parent) this.tmp.add(parent.worldPos)
        v.group.position.copy(this.tmp)
      } else {
        v.group.position.set(0, 0, 0)
      }
      v.worldPos.copy(v.group.position)

      // ampliação visual (Sol e planetas crescem menos que luas pequenas para manter legibilidade)
      let r = v.trueRadiusW
      if (!this.state.realScale) {
        const boost = def.kind === 'star' ? Math.pow(scale, 0.42) : def.radius < 500 ? Math.pow(scale, 1.15) : scale
        r = v.trueRadiusW * boost

        // garante um tamanho aparente mínimo: nada vira um pixel invisível ao afastar
        const camDist = this.camera.position.distanceTo(v.worldPos)
        const minR = camDist * 0.0022
        if (minR > r) {
          // ...sem nunca engolir a própria órbita (ou a do satélite mais próximo)
          let limit = Infinity
          if (def.orbit && def.parent) {
            const parentDist = def.orbit.a * AUW * (1 - def.orbit.e)
            limit = parentDist * 0.22
          }
          for (const child of this.views.values()) {
            if (child.def.parent === def.id && child.def.orbit) {
              limit = Math.min(limit, child.def.orbit.a * AUW * (1 - child.def.orbit.e) * 0.55)
            }
          }
          r = Math.min(minR, Math.max(r, limit === Infinity ? minR : limit))
        }
      }
      v.radiusW = r
      v.mesh.scale.setScalar(r)
      if (v.atmo) v.atmo.scale.setScalar(r * 1.035)
      if (v.rings) v.rings.scale.setScalar(r)
      if (v.glow) (v.glow.material as THREE.ShaderMaterial).uniforms.uSize.value = r * 1.55
      if (v.corona) (v.corona.material as THREE.ShaderMaterial).uniforms.uSize.value = r * 2.9

      // rotação própria
      const rotDays = def.rotation / 24
      v.spin.rotation.y = ((days / rotDays) % 1) * Math.PI * 2
    }

    // órbitas de luas seguem o planeta pai
    for (const v of this.views.values()) {
      if (v.orbitLine && v.def.parent && v.def.parent !== 'sun') {
        const p = this.views.get(v.def.parent)
        if (p) v.orbitLine.position.copy(p.worldPos)
      }
    }
  }

  private updateShading() {
    const sun = this.views.get('sun')!
    this.sunLight.position.copy(sun.worldPos)

    for (const v of this.views.values()) {
      const m = v.mesh.material as THREE.ShaderMaterial
      if (m.uniforms.uSunPos) m.uniforms.uSunPos.value.copy(sun.worldPos)
      if (m.uniforms.uSunRadius) m.uniforms.uSunRadius.value = sun.radiusW
      if (m.uniforms.uTime) m.uniforms.uTime.value = this.state.days

      // LOD: relevo/crateras finas só quando o corpo ocupa parte relevante da tela
      if (m.uniforms.uDetail) {
        const dist = this.camera.position.distanceTo(v.worldPos)
        const apparent = v.radiusW / Math.max(dist, 1e-6)
        m.uniforms.uDetail.value = THREE.MathUtils.clamp((apparent - 0.004) / 0.06, 0, 1)
      }
      if (v.atmo) {
        const am = v.atmo.material as THREE.ShaderMaterial
        am.uniforms.uSunPos.value.copy(sun.worldPos)
      }
      if (v.rings) {
        const rm = v.rings.material as THREE.ShaderMaterial
        rm.uniforms.uSunPos.value.copy(sun.worldPos)
        rm.uniforms.uPlanetPos.value.copy(v.worldPos)
        rm.uniforms.uPlanetRadius.value = v.radiusW
      }

      // ocultador mais relevante (eclipses)
      if (m.uniforms.uOccRadius) {
        let occ: BodyView | null = null
        let bestCover = 0
        for (const o of this.views.values()) {
          if (o === v || o.def.id === 'sun') continue
          // apenas relacionados (pai, filho, irmão) — mantém barato e fisicamente plausível
          const related =
            o.def.parent === v.def.id || v.def.parent === o.def.id || (o.def.parent && o.def.parent === v.def.parent)
          if (!related) continue
          this.tmp.copy(o.worldPos).sub(v.worldPos)
          const dist = this.tmp.length()
          if (dist <= 0) continue
          this.tmp2.copy(sun.worldPos).sub(v.worldPos).normalize()
          const tc = this.tmp.dot(this.tmp2)
          if (tc <= 0) continue
          const perp = Math.sqrt(Math.max(0, dist * dist - tc * tc))
          const angOcc = o.radiusW / tc
          const angSep = perp / tc
          // a sombra pode atingir qualquer ponto do disco, não só o centro:
          // inclui a extensão angular do próprio corpo receptor
          const angSelf = v.radiusW / tc
          const cover = angOcc + angSelf - angSep
          if (cover > bestCover) {
            bestCover = cover
            occ = o
          }
        }
        if (occ) {
          m.uniforms.uOccPos.value.copy(occ.worldPos)
          m.uniforms.uOccRadius.value = occ.radiusW
        } else {
          m.uniforms.uOccRadius.value = 0
        }
      }

      // cauda do cometa aponta para longe do Sol e cresce perto do periélio
      if (v.tail) {
        const tm = v.tail.material as THREE.ShaderMaterial
        tm.uniforms.uProj.value = (this.camera.projectionMatrix.elements[5] * this.renderer.domElement.height) / 2
        this.tmp.copy(v.worldPos).sub(sun.worldPos)
        const dAU = this.tmp.length() / AUW
        tm.uniforms.uDir.value.copy(this.tmp.normalize())
        const act = THREE.MathUtils.clamp(Math.pow(3.2 / Math.max(dAU, 0.25), 2.1), 0, 1)
        tm.uniforms.uActivity.value = act
        tm.uniforms.uLen.value = 0.55 * AUW * act
        v.tail.visible = act > 0.01
        if (v.coma) {
          const cm = v.coma.material as THREE.ShaderMaterial
          // a coma infla até ~100.000 km perto do Sol
          cm.uniforms.uSize.value = v.radiusW + 100 * act
          cm.uniforms.uStrength.value = 0.5 * act
          v.coma.visible = act > 0.01
        }
      }
    }
  }

  private updateCamera(dt: number) {
    const v = this.views.get(this.state.focus)
    if (v) {
      // trava exata no corpo + resíduo da transição decaindo (sem lag em alvo móvel)
      this.focusOffset.multiplyScalar(Math.exp(-dt * 3.4))
      if (this.focusOffset.lengthSq() < 1e-8) this.focusOffset.set(0, 0, 0)
      this.target.copy(v.worldPos).add(this.focusOffset)
    }
    const k = 1 - Math.exp(-dt * 7)
    this.camDist += (this.desired.dist - this.camDist) * k
    this.camTheta += (this.desired.theta - this.camTheta) * k
    this.camPhi += (this.desired.phi - this.camPhi) * k

    const sp = new THREE.Vector3(
      this.camDist * Math.sin(this.camPhi) * Math.sin(this.camTheta),
      this.camDist * Math.cos(this.camPhi),
      this.camDist * Math.sin(this.camPhi) * Math.cos(this.camTheta),
    )
    this.camera.position.copy(this.target).add(sp)
    this.camera.lookAt(this.target)

    // near/far dinâmicos para precisão em escalas planetárias e interestelares
    const focusR = v ? v.radiusW : 1
    this.camera.near = Math.max(0.0008, Math.min(this.camDist - focusR, this.camDist) * 0.002)
    this.camera.far = Math.max(this.camDist * 12, 6e8)
    this.camera.updateProjectionMatrix()

    // céu acompanha a câmera (fica no infinito)
    this.starfield.position.copy(this.camera.position)
    this.milkyway.position.copy(this.camera.position)
  }

  private computeMarkers() {
    const rect = this.renderer.domElement.getBoundingClientRect()
    const markers: Marker[] = []
    const v3 = new THREE.Vector3()
    for (const v of this.views.values()) {
      v3.copy(v.worldPos).project(this.camera)
      const behind = v3.z > 1
      const x = (v3.x * 0.5 + 0.5) * rect.width
      const y = (-v3.y * 0.5 + 0.5) * rect.height
      const dist = this.camera.position.distanceTo(v.worldPos)
      // ângulo aparente: esconde rótulo quando o corpo já domina a tela
      const ang = (2 * Math.atan(v.radiusW / Math.max(dist, 1e-6)) * 180) / Math.PI
      const visible = !behind && x > -60 && x < rect.width + 60 && y > -30 && y < rect.height + 30 && ang < 12
      v.screen = { x, y, visible, dist }
      markers.push({
        id: v.def.id,
        name: v.def.name,
        color: v.def.color,
        kind: v.def.kind,
        x,
        y,
        visible,
        dist,
        focused: v.def.id === this.state.focus,
      })
    }
    this.onMarkers?.(markers)
  }

  private fpsAcc = 0
  private fpsFrames = 0
  private fps = 60

  private animate = () => {
    if (this.disposed) return
    requestAnimationFrame(this.animate)
    const dt = Math.min(this.clock.getDelta(), 0.1)

    if (!this.state.paused) this.state.days += this.state.timeScale * dt

    this.updatePositions()
    this.updateShading()
    this.updateCamera(dt)
    this.orbitGroup.visible = this.state.showOrbits
    this.composer.render()
    this.computeMarkers()

    this.fpsAcc += dt
    this.fpsFrames++
    if (this.fpsAcc > 0.5) {
      this.fps = this.fpsFrames / this.fpsAcc
      this.fpsAcc = 0
      this.fpsFrames = 0
    }
    const f = this.views.get(this.state.focus)
    this.onTick?.({
      days: this.state.days,
      date: dateFromDays(this.state.days),
      fps: this.fps,
      focusDist: f ? this.camera.position.distanceTo(f.worldPos) - f.radiusW : 0,
    })
  }

  /* --------------------------------------------------------------- public - */

  setTime(days: number) {
    this.state.days = days
  }

  resize() {
    const w = this.container.clientWidth
    const h = this.container.clientHeight
    if (!w || !h) return
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(w, h)
    this.composer.setSize(w, h)
  }

  /** Distância entre dois corpos em km. */
  distanceKm(a: string, b: string) {
    const va = this.views.get(a)
    const vb = this.views.get(b)
    if (!va || !vb) return 0
    return va.worldPos.distanceTo(vb.worldPos) / KM
  }

  /** Velocidade orbital instantânea aproximada (km/s). */
  speedKmS(id: string) {
    const v = this.views.get(id)
    if (!v || !v.def.orbit) return 0
    const dt = 0.01
    const p1 = orbitalPosition(v.def.orbit, this.state.days).multiplyScalar(AU)
    const p2 = orbitalPosition(v.def.orbit, this.state.days + dt).multiplyScalar(AU)
    return p1.distanceTo(p2) / (dt * 86400)
  }

  dispose() {
    this.disposed = true
    this.renderer.dispose()
    this.renderer.domElement.remove()
    this.scene.traverse((o) => {
      const any = o as any
      any.geometry?.dispose?.()
      const m = any.material
      if (Array.isArray(m)) m.forEach((x: any) => x.dispose?.())
      else m?.dispose?.()
    })
  }
}

export { AUW, BODY_MAP }
