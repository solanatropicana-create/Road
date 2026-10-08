import * as THREE from 'three';
import { WORLD, type IslandDef } from '../data/world';
import { wavesGLSL } from '../sim/waves';

export const MAX_SHADER_ISLANDS = 16;

const vert = /* glsl */ `
uniform float uTime;
varying vec3 vWorld;
varying vec3 vNormal;
varying float vSea;
${wavesGLSL()}
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  wp.y += waveH(wp.xz, uTime);
  vec2 g = waveGrad(wp.xz, uTime);
  // Lighting uses a softened normal: steep storm waves otherwise flood the view with glints.
  vNormal = normalize(vec3(-g.x * 0.45, 1.0, -g.y * 0.45));
  vSea = seaState(wp.xz);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const frag = /* glsl */ `
uniform float uTime;
uniform vec3 uDeep;
uniform vec3 uShallow;
uniform vec3 uFoam;
uniform vec3 uSky;
uniform vec3 uFog;
uniform float uFogNear;
uniform float uFogFar;
uniform vec3 uSunDir;
uniform vec4 uIsl[${MAX_SHADER_ISLANDS * 3}];
uniform int uIslN;
uniform float uEdge;
varying vec3 vWorld;
varying vec3 vNormal;
varying float vSea;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

void main() {
  vec2 p = vWorld.xz;
  float sd = 1e4;
  for (int i = 0; i < ${MAX_SHADER_ISLANDS}; i++) {
    if (i >= uIslN) break;
    vec4 a = uIsl[i * 3];
    vec2 d = p - a.xy;
    float dc = length(d);
    if (dc > a.z * 1.4 + 45.0) continue;
    vec4 b = uIsl[i * 3 + 1];
    vec4 c = uIsl[i * 3 + 2];
    float ang = atan(d.y, d.x);
    float r = a.z * (1.0 + b.x * cos(2.0 * ang + b.y) + b.z * cos(3.0 * ang + b.w) + c.x * cos(5.0 * ang + c.y));
    sd = min(sd, dc - r);
  }

  // Mottled light pattern drifting over the water.
  float n1 = vnoise(p * 0.07 + vec2(uTime * 0.04, uTime * 0.02));
  float n2 = vnoise(p * 0.19 - vec2(uTime * 0.05, -uTime * 0.03));
  float n = n1 * 0.6 + n2 * 0.4;

  float shallow = 1.0 - smoothstep(0.0, 30.0, sd + (n - 0.5) * 6.0);
  vec3 col = mix(uDeep, uShallow, shallow * 0.9);
  col *= 0.9 + 0.2 * smoothstep(0.35, 0.75, n);

  vec3 N = normalize(vNormal + vec3(n1 - 0.5, 0.0, n2 - 0.5) * 0.18);
  vec3 V = normalize(cameraPosition - vWorld);
  float fres = pow(1.0 - max(dot(N, V), 0.0), 5.0);
  col = mix(col, uSky, min(fres * 0.3, 0.18));
  vec3 H = normalize(uSunDir + V);
  col += pow(max(dot(N, H), 0.0), 160.0) * 0.55;
  // Light catches the crests.
  // Whitecaps on crests in rough water.
  float crest = smoothstep(0.55, 1.0, vWorld.y / (vSea * 1.02 + 0.001));
  float caps = crest * smoothstep(1.3, 2.4, vSea) * smoothstep(0.55, 0.8, vnoise(p * 0.35 + uTime * 0.3));
  col = mix(col, uFoam, caps * 0.7);
  col += crest * 0.04;

  // Shore foam: lapping bands.
  float band = 1.0 - smoothstep(0.0, 4.5, sd);
  float lap = 0.55 + 0.45 * sin(sd * 1.6 - uTime * 2.2 + n * 5.0);
  float foam = clamp(band * lap * 1.4, 0.0, 1.0);
  foam = max(foam, (1.0 - smoothstep(0.0, 1.2, sd)));
  col = mix(col, uFoam, foam * 0.92);

  float dist = length(vWorld - cameraPosition);
  float fogK = smoothstep(uFogNear, uFogFar, dist);
  fogK = max(fogK, uEdge * smoothstep(${(WORLD.radius - 200).toFixed(1)}, ${(WORLD.radius + 80).toFixed(1)}, length(p)));
  col = mix(col, uFog, fogK);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export class Water {
  readonly mesh: THREE.Mesh;
  readonly uniforms: Record<string, THREE.IUniform>;
  private islVec = Array.from({ length: MAX_SHADER_ISLANDS * 3 }, () => new THREE.Vector4());
  private cell: number;

  constructor(size = 900, segments = 180) {
    const geo = new THREE.PlaneGeometry(size, size, segments, segments);
    geo.rotateX(-Math.PI / 2);
    this.cell = size / segments;
    this.uniforms = {
      uTime: { value: 0 },
      uDeep: { value: new THREE.Color('#1f7fb0') },
      uShallow: { value: new THREE.Color('#45c7c9') },
      uFoam: { value: new THREE.Color('#f4fbff') },
      uSky: { value: new THREE.Color('#bfe6f7') },
      uFog: { value: new THREE.Color('#9fd8ef') },
      uFogNear: { value: 220 },
      uFogFar: { value: 480 },
      uSunDir: { value: new THREE.Vector3(-0.4, 0.85, 0.35).normalize() },
      uIsl: { value: this.islVec },
      uIslN: { value: 0 },
      uEdge: { value: 1 },
    };
    const mat = new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: frag, uniforms: this.uniforms });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
  }

  /** Keeps the grid under the camera (snapped so vertices do not swim) and feeds nearby islands. */
  update(t: number, cx: number, cz: number) {
    this.uniforms.uTime.value = t;
    const c = this.cell;
    this.mesh.position.set(Math.round(cx / c) * c, 0, Math.round(cz / c) * c);
    const near: IslandDef[] = [];
    for (const isl of WORLD.islands) {
      const d = Math.hypot(isl.x - cx, isl.z - cz) - isl.r * 1.4;
      if (d < 420) near.push(isl);
    }
    near.sort((a, b) => Math.hypot(a.x - cx, a.z - cz) - a.r - (Math.hypot(b.x - cx, b.z - cz) - b.r));
    const n = Math.min(MAX_SHADER_ISLANDS, near.length);
    for (let i = 0; i < n; i++) {
      const isl = near[i];
      this.islVec[i * 3].set(isl.x, isl.z, isl.r, 0);
      this.islVec[i * 3 + 1].set(isl.h[0], isl.h[1], isl.h[2], isl.h[3]);
      this.islVec[i * 3 + 2].set(isl.h[4], isl.h[5], 0, 0);
    }
    this.uniforms.uIslN.value = n;
  }
}
