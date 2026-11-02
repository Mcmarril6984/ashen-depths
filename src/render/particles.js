// Pooled additive point particles (sparks, embers, dust). One draw call.
import * as THREE from 'three';

export class Particles {
  constructor(max) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.drift = new Uint8Array(max);
    this.next = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { scale: { value: 600 } },
      vertexShader: `attribute float size; attribute float alpha; attribute vec3 color; varying vec3 vC; varying float vA;
        uniform float scale;
        void main(){ vC = color; vA = alpha; vec4 mv = modelViewMatrix * vec4(position,1.0);
          gl_PointSize = size * scale / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying vec3 vC; varying float vA;
        void main(){ vec2 d = gl_PointCoord - 0.5; float r = dot(d,d) * 4.0; if (r > 1.0) discard;
          float a = (1.0 - r); a *= a; gl_FragColor = vec4(vC * a * vA * 1.6, a * vA); }`,
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    this.mat = mat;
    addEventListener('resize', () => this.fitScale());
    this.fitScale();
  }
  fitScale() { this.mat.uniforms.scale.value = innerHeight * Math.min(devicePixelRatio || 1, 2) * 0.9; }

  emit(x, y, z, n, color, { speed = 3, up = 0, life = 0.5, size = 0.25, gravity = 0, drift = false, flat = false, dir = 0, dirY = 0 } = {}) {
    const c = new THREE.Color(color);
    for (let k = 0; k < n; k++) {
      const i = this.next; this.next = (this.next + 1) % this.max;
      const a = Math.random() * Math.PI * 2, s = speed * (0.4 + Math.random() * 0.6);
      this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
      this.vel[i * 3] = Math.cos(a) * s * (dir ? 0.5 : 1) + dir * s * 1.2;
      this.vel[i * 3 + 1] = (flat ? Math.abs(Math.sin(a)) * 0.3 : Math.sin(a)) * s * (dirY ? 0.5 : 1) + up + dirY * s * 1.2;
      this.vel[i * 3 + 2] = (Math.random() - 0.5) * s * 0.3;
      this.col[i * 3] = c.r; this.col[i * 3 + 1] = c.g; this.col[i * 3 + 2] = c.b;
      this.life[i] = this.maxLife[i] = life * (0.6 + Math.random() * 0.6);
      this.size[i] = size * (0.6 + Math.random() * 0.8);
      this.grav[i] = gravity; this.drift[i] = drift ? 1 : 0;
    }
  }

  update(dt) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) { this.alpha[i] = 0; continue; }
      this.life[i] -= dt;
      const j = i * 3;
      if (this.drift[i]) this.vel[j] += Math.sin(this.life[i] * 2 + i) * dt * 0.6;
      this.vel[j + 1] -= this.grav[i] * dt;
      this.pos[j] += this.vel[j] * dt; this.pos[j + 1] += this.vel[j + 1] * dt; this.pos[j + 2] += this.vel[j + 2] * dt;
      const t = this.life[i] / this.maxLife[i];
      this.alpha[i] = this.drift[i] ? Math.sin(t * Math.PI) * 0.7 : Math.min(1, t * 2);
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true; g.attributes.alpha.needsUpdate = true;
    g.attributes.color.needsUpdate = true; g.attributes.size.needsUpdate = true;
  }
  clear() { this.life.fill(0); }
}

export function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const grd = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grd; ctx.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
