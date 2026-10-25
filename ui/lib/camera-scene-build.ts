import * as THREE from "three";

/**
 * The parts of the preview scene, ported from FLUX Studio Lite
 * (`src/scene/create-camera-scene.ts`): the mannequin on its plinth, the
 * camera rig with its lens frustum, the path and sight lines. Helpers that
 * explain the shot (rig, frustum, path, light marker) live on HELPER_LAYER,
 * which only the scene diagram sees; SHOT_LAYER holds what only the shot
 * camera sees, such as the solid floor under its sky.
 */
export const HELPER_LAYER = 1;
export const SHOT_LAYER = 2;

export type ScenePalette = {
  accent: THREE.Color;
  intel: THREE.Color;
  subject: THREE.Color;
  dark: THREE.Color;
  sky: THREE.Color;
  ground: THREE.Color;
  light: THREE.Color;
  gridMajor: THREE.Color;
  gridMinor: THREE.Color;
  glass: THREE.Color;
  /** Theme surfaces for the shot view's default backdrop. */
  surfaceTop: THREE.Color;
  surfaceBottom: THREE.Color;
};

/** Colours from `--scene-*` custom properties on the canvas, so the preview follows the theme. */
export function readPalette(canvas: HTMLCanvasElement): ScenePalette {
  const css = getComputedStyle(canvas);
  const color = (name: string, fallback: string) => new THREE.Color(css.getPropertyValue(name).trim() || fallback);
  return {
    accent: color("--scene-accent", "#ea7b7b"),
    intel: color("--scene-emissive", "#62c4e6"),
    subject: color("--scene-subject", "#c9ced6"),
    dark: color("--scene-dark", "#566069"),
    sky: color("--scene-sky", "#dfeeee"),
    ground: color("--scene-ground", "#171a1e"),
    light: color("--scene-light", "#ffffff"),
    gridMajor: color("--scene-grid-major", "#566069"),
    gridMinor: color("--scene-grid-minor", "#333a42"),
    glass: color("--scene-glass", "#13161a"),
    surfaceTop: color("--scene-backdrop-top", "#262b31"),
    surfaceBottom: color("--scene-backdrop-bottom", "#101316")
  };
}

/** Puts an object and all its children on one layer. */
export function onLayer<T extends THREE.Object3D>(object: T, layer: number) {
  object.traverse((child) => child.layers.set(layer));
  return object;
}

/** The Studio Lite mannequin: head at 1.57, feet on the plinth, facing +Z. */
export function buildMannequin(material: THREE.Material) {
  const subject = new THREE.Group();
  function mesh(geometry: THREE.BufferGeometry) {
    const result = new THREE.Mesh(geometry, material);
    result.castShadow = true;
    subject.add(result);
    return result;
  }
  function limb(from: THREE.Vector3, to: THREE.Vector3, radius: number) {
    const direction = new THREE.Vector3().subVectors(to, from);
    const part = mesh(new THREE.CylinderGeometry(radius * 0.85, radius, direction.length(), 8));
    part.position.copy(from).add(to).multiplyScalar(0.5);
    part.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  }
  mesh(new THREE.SphereGeometry(0.135, 16, 12)).position.set(0, 1.57, 0);
  const torso = mesh(new THREE.CapsuleGeometry(0.18, 0.35, 4, 12));
  torso.position.set(0, 1.12, 0);
  torso.scale.z = 0.68;
  mesh(new THREE.SphereGeometry(0.15, 12, 8)).position.set(0, 0.77, 0);
  for (const side of [-1, 1]) {
    limb(new THREE.Vector3(side * 0.09, 0.74, 0), new THREE.Vector3(side * 0.13, 0.39, 0), 0.075);
    limb(new THREE.Vector3(side * 0.13, 0.39, 0), new THREE.Vector3(side * 0.14, 0.1, 0), 0.054);
    limb(new THREE.Vector3(side * 0.18, 1.29, 0), new THREE.Vector3(side * 0.29, 1.03, 0), 0.053);
    limb(new THREE.Vector3(side * 0.29, 1.03, 0), new THREE.Vector3(side * 0.27, 0.81, 0.07), 0.039);
    const foot = mesh(new THREE.BoxGeometry(0.11, 0.07, 0.21));
    foot.position.set(side * 0.14, 0.05, 0.055);
  }
  return subject;
}

/** The camera model, lens toward +Z (the direction Group.lookAt aims), plus its frustum. */
export function buildRig(palette: ScenePalette) {
  const rig = new THREE.Group();
  const accent = new THREE.MeshStandardMaterial({ color: palette.accent, roughness: 0.75, metalness: 0.1 });
  const dark = new THREE.MeshStandardMaterial({ color: palette.dark, roughness: 1 });
  function part(geometry: THREE.BufferGeometry, surface: THREE.Material, x: number, y: number, z: number) {
    const mesh = new THREE.Mesh(geometry, surface);
    mesh.position.set(x, y, z);
    rig.add(mesh);
    return mesh;
  }
  part(new THREE.BoxGeometry(0.4, 0.27, 0.34), accent, 0, 0, 0);
  part(new THREE.BoxGeometry(0.26, 0.16, 0.014), dark, -0.015, -0.01, -0.179);
  for (const side of [-1, 1]) {
    part(new THREE.BoxGeometry(0.014, 0.16, 0.23), dark, side * 0.207, 0, -0.01);
    part(new THREE.BoxGeometry(0.04, 0.095, 0.04), dark, 0, 0.18, side * 0.095);
  }
  part(new THREE.BoxGeometry(0.06, 0.04, 0.25), accent, 0, 0.235, 0);
  part(new THREE.BoxGeometry(0.1, 0.075, 0.12), dark, 0.13, 0.17, -0.15);
  const grip = part(new THREE.CapsuleGeometry(0.055, 0.13, 3, 8), dark, 0.24, -0.01, -0.015);
  grip.scale.z = 0.75;
  for (const [radius, length, z] of [
    [0.11, 0.27, 0.29],
    [0.125, 0.04, 0.2],
    [0.122, 0.04, 0.415]
  ]) {
    part(new THREE.CylinderGeometry(radius, radius, length, 16), dark, 0, 0, z).rotation.x = Math.PI / 2;
  }
  const glass = new THREE.MeshStandardMaterial({
    color: palette.glass,
    roughness: 0.2,
    metalness: 0.2,
    emissive: palette.intel,
    emissiveIntensity: 0.3
  });
  part(new THREE.CircleGeometry(0.095, 16), glass, 0, 0, 0.439);

  // The lens frustum: wider for wide lenses, a narrow cone for telephoto, skewed by composition.
  const frustumMaterial = new THREE.LineBasicMaterial({ color: palette.intel, transparent: true, opacity: 0.35 });
  const frustum = new THREE.LineSegments(new THREE.BufferGeometry(), frustumMaterial);
  rig.add(frustum);
  onLayer(rig, HELPER_LAYER);

  function setFrustum(fov: number, strong: boolean, shift: readonly [number, number] = [0, 0]) {
    const length = 1.35;
    const halfHeight = Math.tan((fov * Math.PI) / 360) * length;
    const halfWidth = halfHeight * (16 / 9);
    // The rig looks down +Z with +X to its left, so a subject placed right of centre shifts the window left.
    const [centerX, centerY] = [shift[0] * halfWidth, -shift[1] * halfHeight];
    const apex = new THREE.Vector3(0, 0, 0.44);
    const corners = [
      [-halfWidth, -halfHeight],
      [halfWidth, -halfHeight],
      [halfWidth, halfHeight],
      [-halfWidth, halfHeight]
    ].map(([x, y]) => new THREE.Vector3(x + centerX, y + centerY, 0.44 + length));
    const points = corners.flatMap((corner, index) => [apex, corner, corner, corners[(index + 1) % 4]]);
    frustum.geometry.dispose();
    frustum.geometry = new THREE.BufferGeometry().setFromPoints(points);
    frustumMaterial.opacity = strong ? 0.7 : 0.3;
  }
  return { rig, setFrustum };
}

/** The path the rig travels and its dashed line of sight, diagram-only. */
export function buildGuides(palette: ScenePalette) {
  const path = new THREE.Line(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({ color: palette.accent, transparent: true, opacity: 0.48 })
  );
  const sight = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
    new THREE.LineDashedMaterial({ color: palette.accent, dashSize: 0.065, gapSize: 0.065, transparent: true, opacity: 0.27 })
  );
  sight.computeLineDistances();
  const sun = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  return { path: onLayer(path, HELPER_LAYER), sight: onLayer(sight, HELPER_LAYER), sun: onLayer(sun, HELPER_LAYER) };
}

/** A vertical sky gradient for the shot view, top to bottom. */
export function gradientTexture(top: THREE.ColorRepresentation, bottom: THREE.ColorRepresentation) {
  const canvas = document.createElement("canvas");
  canvas.width = 4;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  if (context) {
    const gradient = context.createLinearGradient(0, 0, 0, 128);
    gradient.addColorStop(0, `#${new THREE.Color(top).getHexString()}`);
    gradient.addColorStop(1, `#${new THREE.Color(bottom).getHexString()}`);
    context.fillStyle = gradient;
    context.fillRect(0, 0, 4, 128);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Disposes every geometry, material and texture under an object. */
export function disposeTree(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  root.traverse((object) => {
    const drawable = object as THREE.Mesh;
    if (drawable.geometry) geometries.add(drawable.geometry);
    if (drawable.material) {
      (Array.isArray(drawable.material) ? drawable.material : [drawable.material]).forEach((surface) => materials.add(surface));
    }
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((surface) => {
    Object.values(surface).forEach((value) => {
      if (value instanceof THREE.Texture) value.dispose();
    });
    surface.dispose();
  });
}
