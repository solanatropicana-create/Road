import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Accumulates flat-coloured triangles into one non-indexed geometry. */
export class TriBuilder {
  pos: number[] = [];
  col: number[] = [];
  private c = new THREE.Color();

  tri(a: number[], b: number[], c: number[], color: THREE.ColorRepresentation, jitter = 0) {
    this.c.set(color);
    if (jitter) this.c.offsetHSL(0, 0, (Math.random() - 0.5) * jitter);
    this.pos.push(...a, ...b, ...c);
    for (let i = 0; i < 3; i++) this.col.push(this.c.r, this.c.g, this.c.b);
  }

  quad(a: number[], b: number[], c: number[], d: number[], color: THREE.ColorRepresentation, jitter = 0) {
    this.c.set(color);
    if (jitter) this.c.offsetHSL(0, 0, (Math.random() - 0.5) * jitter);
    const hex = this.c.getHex();
    this.tri(a, b, c, hex);
    this.tri(a, c, d, hex);
  }

  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.computeVertexNormals();
    return g;
  }
}

/** Gives a primitive a uniform vertex colour and bakes a transform, ready for merging. */
export function colored(
  geo: THREE.BufferGeometry,
  color: THREE.ColorRepresentation,
  pos?: [number, number, number],
  rot?: [number, number, number],
  scale?: [number, number, number],
): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  const m = new THREE.Matrix4();
  m.compose(
    new THREE.Vector3(...(pos ?? [0, 0, 0])),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...(rot ?? [0, 0, 0]))),
    new THREE.Vector3(...(scale ?? [1, 1, 1])),
  );
  g.applyMatrix4(m);
  // Strip attributes that would break merging.
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'color') g.deleteAttribute(k);
  if (!g.attributes.normal) g.computeVertexNormals();
  return g;
}

export function merge(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const m = mergeGeometries(geos, false);
  if (!m) throw new Error('merge failed');
  return m;
}

export const flatMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide });
