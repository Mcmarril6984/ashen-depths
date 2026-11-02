// Post-processing: half-resolution bloom (torches, lava, magic actually glow) + one grading pass
// (split-tone colour script per biome, contrast, saturation, vignette, fine grain). Drops itself on slow devices.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// Colour script: shadows lean cool, highlights lean warm, so firelight pops against the stone.
export const GRADES = {
  halls: { shadow: [0.32, 0.42, 0.62], highlight: [1.0, 0.82, 0.6], contrast: 1.12, saturation: 0.92, lift: 0.015 },
  forge: { shadow: [0.42, 0.3, 0.55], highlight: [1.0, 0.72, 0.45], contrast: 1.14, saturation: 0.95, lift: 0.012 },
  crypt: { shadow: [0.25, 0.45, 0.5], highlight: [0.85, 1.0, 0.92], contrast: 1.14, saturation: 0.82, lift: 0.015 },
  hell: { shadow: [0.45, 0.22, 0.4], highlight: [1.0, 0.68, 0.5], contrast: 1.15, saturation: 0.9, lift: 0.012 },
};

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null }, time: { value: 0 },
    shadow: { value: new THREE.Vector3() }, highlight: { value: new THREE.Vector3() },
    contrast: { value: 1.1 }, saturation: { value: 0.95 }, lift: { value: 0.01 }, vignette: { value: 0.42 },
    hurt: { value: 0 },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float time, contrast, saturation, lift, vignette, hurt;
    uniform vec3 shadow, highlight; varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
    void main(){
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      // split tone: tint shadows and highlights toward the biome's colour script
      vec3 tone = mix(shadow, highlight, smoothstep(0.05, 0.75, l));
      c = mix(c, c * tone * 1.6, 0.35);
      c = mix(vec3(l), c, saturation);
      c = (c - 0.5) * contrast + 0.5 + lift;
      vec2 d = vUv - vec2(0.5, 0.55);
      c *= 1.0 - vignette * smoothstep(0.25, 0.85, length(d * vec2(1.25, 1.0)));
      c = mix(c, c * vec3(1.25, 0.55, 0.5), hurt);
      c += (hash(vUv * 900.0 + time) - 0.5) * 0.025; // fine grain breaks up banding on phones
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }`,
};

export class Post {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));
    const size = renderer.getSize(new THREE.Vector2());
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.38, 0.4, 0.9);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
    this.enabled = true;
    this.setBiome('halls');
  }
  setBiome(b) {
    const g = GRADES[b] || GRADES.halls, u = this.grade.uniforms;
    u.shadow.value.set(...g.shadow); u.highlight.value.set(...g.highlight);
    u.contrast.value = g.contrast; u.saturation.value = g.saturation; u.lift.value = g.lift;
  }
  setSize(w, h) {
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
    this.bloom.resolution.set(w / 2, h / 2);
  }
  render(dt, hurt = 0) {
    this.grade.uniforms.time.value += dt;
    this.grade.uniforms.hurt.value = hurt;
    this.composer.render(dt);
  }
}
