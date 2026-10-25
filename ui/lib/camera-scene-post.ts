import * as THREE from "three";
import { LOOK_FRAGMENT } from "@/lib/camera-scene-shader";

/**
 * The shot view's finishing pass: each view renders into a target with
 * depth, then one full-screen shader finishes each view (focus, lens, media),
 * combines them, and applies grade and format to the whole frame. Each channel has its own uniform, so VHS, a
 * colour grade and an animation style stack instead of replacing each other.
 */
export type LookUniforms = {
  focusMode: number;
  focusDistance: number;
  /** The second view's own focus distance (split screen, dissolve, double exposure). */
  focusDistanceB: number;
  focusNear: number;
  aperture: number;
  maxBlur: number;
  barrel: number;
  flare: number;
  mix: number;
  split: number;
  double: number;
  fade: number;
  whip: number;
  trail: number;
  grade: number;
  format: number;
  letterbox: number;
  media: number;
  time: number;
};

/** Shader codes for each channel; 0 is always "none". */
export const FOCUS = { none: 0, depth: 1, soft: 2, tilt: 3, diopter: 4 } as const;
export const GRADE = { none: 0, noir: 1, pastel: 2, tealOrange: 3, accent: 4, brutalist: 5, retro: 6 } as const;
export const FORMAT = { none: 0, film: 1, super8: 2, vhs: 3 } as const;
export const MEDIA = { none: 0, pixel: 1, watercolour: 2, paper: 3, anime: 4, clay: 5 } as const;

const VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

export function createLookPass(renderer: THREE.WebGLRenderer) {
  const options = { type: THREE.HalfFloatType, samples: 4 };
  const shotA = new THREE.WebGLRenderTarget(1, 1, { ...options, depthTexture: new THREE.DepthTexture(1, 1) });
  const shotB = new THREE.WebGLRenderTarget(1, 1, { ...options, depthTexture: new THREE.DepthTexture(1, 1) });
  const history = [new THREE.WebGLRenderTarget(1, 1), new THREE.WebGLRenderTarget(1, 1)];
  let historyIndex = 0;
  let historyFresh = false;

  const uniforms: Record<string, THREE.IUniform> = {
    tA: { value: shotA.texture },
    tDepth: { value: shotA.depthTexture },
    tB: { value: shotB.texture },
    tDepthB: { value: shotB.depthTexture },
    tHistory: { value: history[0].texture },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uNear: { value: 0.05 },
    uFar: { value: 60 },
    uTime: { value: 0 },
    uFocusMode: { value: 0 },
    uFocusDistance: { value: 2.7 },
    uFocusDistanceB: { value: 2.7 },
    uFocusNear: { value: 1 },
    uAperture: { value: 0 },
    uMaxBlur: { value: 0 },
    uBarrel: { value: 0 },
    uFlare: { value: 0 },
    uMix: { value: 0 },
    uSplit: { value: 0 },
    uDouble: { value: 0 },
    uFade: { value: 0 },
    uWhip: { value: 0 },
    uTrail: { value: 0 },
    uGrade: { value: 0 },
    uFormat: { value: 0 },
    uLetterbox: { value: 0 },
    uMedia: { value: 0 }
  };
  const material = new THREE.ShaderMaterial({ uniforms, vertexShader: VERTEX, fragmentShader: LOOK_FRAGMENT, depthTest: false, depthWrite: false });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  quad.frustumCulled = false;
  const postScene = new THREE.Scene();
  postScene.add(quad);
  const postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  function setSize(width: number, height: number) {
    const pixelRatio = renderer.getPixelRatio();
    const [w, h] = [Math.max(1, Math.round(width * pixelRatio)), Math.max(1, Math.round(height * pixelRatio))];
    shotA.setSize(w, h);
    shotB.setSize(w, h);
    history.forEach((target) => target.setSize(w, h));
    historyFresh = false;
    (uniforms.uResolution.value as THREE.Vector2).set(w, h);
  }

  /**
   * Draws the finished shot into the canvas viewport. With a trail, the frame
   * also lands in a history target so the next frame can smear over it.
   */
  function render(look: LookUniforms, camera: THREE.PerspectiveCamera) {
    uniforms.uNear.value = camera.near;
    uniforms.uFar.value = camera.far;
    uniforms.uTime.value = look.time;
    uniforms.uFocusMode.value = look.focusMode;
    uniforms.uFocusDistance.value = look.focusDistance;
    uniforms.uFocusDistanceB.value = look.focusDistanceB;
    uniforms.uFocusNear.value = look.focusNear;
    uniforms.uAperture.value = look.aperture;
    uniforms.uMaxBlur.value = look.maxBlur;
    uniforms.uBarrel.value = look.barrel;
    uniforms.uFlare.value = look.flare;
    uniforms.uMix.value = look.mix;
    uniforms.uSplit.value = look.split;
    uniforms.uDouble.value = look.double;
    uniforms.uFade.value = look.fade;
    uniforms.uWhip.value = look.whip;
    uniforms.uGrade.value = look.grade;
    uniforms.uFormat.value = look.format;
    uniforms.uLetterbox.value = look.letterbox;
    uniforms.uMedia.value = look.media;
    const trailing = look.trail > 0;
    uniforms.uTrail.value = trailing && historyFresh ? look.trail : 0;
    if (trailing) {
      const read = history[historyIndex];
      const write = history[1 - historyIndex];
      uniforms.tHistory.value = read.texture;
      renderer.setRenderTarget(write);
      renderer.render(postScene, postCamera);
      historyIndex = 1 - historyIndex;
      historyFresh = true;
    } else {
      historyFresh = false;
    }
    renderer.setRenderTarget(null);
    renderer.render(postScene, postCamera);
  }

  return {
    shotA,
    shotB,
    setSize,
    render,
    /** Forget the trail, so a replay starts clean. */
    resetTrail() {
      historyFresh = false;
    },
    dispose() {
      shotA.depthTexture?.dispose();
      shotB.depthTexture?.dispose();
      [shotA, shotB, ...history].forEach((target) => target.dispose());
      quad.geometry.dispose();
      material.dispose();
    }
  };
}
