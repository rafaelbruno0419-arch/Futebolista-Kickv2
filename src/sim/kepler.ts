import * as THREE from 'three'
import type { Orbit } from './data'

const D2R = Math.PI / 180

/** Resolve a equação de Kepler M = E − e·sin E por Newton-Raphson. */
export function eccentricAnomaly(M: number, e: number): number {
  let E = M + e * Math.sin(M)
  for (let k = 0; k < 8; k++) {
    const dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E))
    E -= dE
    if (Math.abs(dE) < 1e-10) break
  }
  return E
}

/**
 * Posição heliocêntrica (ou relativa ao pai) em AU, para um tempo em dias desde J2000.
 * Plano de referência: eclíptica. Retorna coordenadas com Y para cima (convenção three.js).
 */
export function orbitalPosition(o: Orbit, days: number, out = new THREE.Vector3()): THREE.Vector3 {
  const n = 360 / o.period // graus por dia
  const L = (o.L + n * days) * D2R
  const peri = o.peri * D2R
  const node = o.node * D2R
  const inc = o.i * D2R

  const M = L - peri
  const E = eccentricAnomaly(((M % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI), o.e)

  // Coordenadas no plano orbital
  const xv = o.a * (Math.cos(E) - o.e)
  const yv = o.a * Math.sqrt(1 - o.e * o.e) * Math.sin(E)

  const w = peri - node // argumento do periélio
  const cosw = Math.cos(w)
  const sinw = Math.sin(w)
  const cosn = Math.cos(node)
  const sinn = Math.sin(node)
  const cosi = Math.cos(inc)
  const sini = Math.sin(inc)

  // rotação: plano orbital -> eclíptica
  const xh = xv * (cosw * cosn - sinw * sinn * cosi) - yv * (sinw * cosn + cosw * sinn * cosi)
  const yh = xv * (cosw * sinn + sinw * cosn * cosi) + yv * (cosw * cosn * cosi - sinw * sinn)
  const zh = xv * (sinw * sini) + yv * (cosw * sini)

  // eclíptica (x, y, z) -> three.js (x, z_up, -y)
  return out.set(xh, zh, -yh)
}

/** Amostra a elipse orbital completa (para desenhar a linha da órbita). */
export function orbitPath(o: Orbit, segments = 512): THREE.Vector3[] {
  const pts: THREE.Vector3[] = []
  for (let s = 0; s <= segments; s++) {
    const t = (s / segments) * o.period
    pts.push(orbitalPosition(o, t))
  }
  return pts
}

/** Dias desde J2000 (2000-01-01 12:00 TT) para uma data JS. */
export function daysSinceJ2000(date: Date): number {
  return (date.getTime() - Date.UTC(2000, 0, 1, 12, 0, 0)) / 86_400_000
}

export function dateFromDays(days: number): Date {
  return new Date(Date.UTC(2000, 0, 1, 12, 0, 0) + days * 86_400_000)
}
