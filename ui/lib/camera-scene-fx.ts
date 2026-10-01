import * as THREE from "three";
import type { CameraSelection } from "@/lib/camera-language";
import type { CameraFx } from "@/lib/camera-term";

type Palette = { accent: THREE.Color; intel: THREE.Color; subject: THREE.Color };

/**
 * Same-style stand-ins for visual effects in the 3D preview: a particle field,
 * a hologram, a glitch and so on, drawn on or around the mannequin (double
 * exposure is a second view screened in by the look pass),
 * plus the materials of the animation styles and the morph transition.
 * Illustrations of the idea, not predictions of the generated footage.
 */
export function createSceneFx(scene: THREE.Scene, subject: THREE.Group, palette: Palette) {
  const layer = new THREE.Group();
  scene.add(layer);
  const meshes = () => subject.children.filter((child): child is THREE.Mesh => child instanceof THREE.Mesh);
  const originals = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
  const owned: Array<THREE.BufferGeometry | THREE.Material> = [];
  let kind: CameraFx | undefined;
  let points: THREE.Points | null = null;
  let seeds: Float32Array | null = null;
  let base: Float32Array | null = null;
  let ghost: THREE.Group | null = null;
  let morph: THREE.Mesh | null = null;
  let glitchUntil = 0;

  function own<T extends THREE.BufferGeometry | THREE.Material>(item: T) {
    owned.push(item);
    return item;
  }

  function reskin(make: (mesh: THREE.Mesh) => THREE.Material) {
    for (const mesh of meshes()) {
      if (!originals.has(mesh)) originals.set(mesh, mesh.material);
      mesh.material = own(make(mesh));
    }
  }

  function clear() {
    originals.forEach((surface, mesh) => (mesh.material = surface));
    originals.clear();
    layer.clear();
    owned.splice(0).forEach((item) => item.dispose());
    points = null;
    seeds = null;
    base = null;
    ghost = null;
    morph = null;
    subject.position.set(0, 0, 0);
    subject.scale.set(1, 1, 1);
  }

  function field(count: number, radius: [number, number], height: [number, number], size: number, color: THREE.Color) {
    const positions = new Float32Array(count * 3);
    seeds = new Float32Array(count);
    for (let index = 0; index < count; index += 1) {
      const angle = Math.random() * Math.PI * 2;
      const distance = radius[0] + Math.random() * (radius[1] - radius[0]);
      positions.set([Math.cos(angle) * distance, height[0] + Math.random() * (height[1] - height[0]), Math.sin(angle) * distance], index * 3);
      seeds[index] = Math.random();
    }
    base = positions.slice();
    const geometry = own(new THREE.BufferGeometry());
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const material = own(new THREE.PointsMaterial({ color, size, transparent: true, opacity: 0.85, depthWrite: false }));
    points = new THREE.Points(geometry, material);
    layer.add(points);
  }

  /** A sphere with a cube as its morph target: the morph transition's explicit shape correspondence. */
  function morphTarget() {
    const geometry = own(new THREE.SphereGeometry(0.42, 40, 28));
    const positions = geometry.getAttribute("position");
    const cube = new Float32Array(positions.count * 3);
    const point = new THREE.Vector3();
    for (let index = 0; index < positions.count; index += 1) {
      point.fromBufferAttribute(positions, index);
      point.multiplyScalar(0.34 / (Math.max(Math.abs(point.x), Math.abs(point.y), Math.abs(point.z)) || 1));
      cube.set([point.x, point.y, point.z], index * 3);
    }
    const shape = new THREE.BufferGeometry();
    shape.setAttribute("position", new THREE.BufferAttribute(cube.slice(), 3));
    shape.setIndex(geometry.getIndex());
    shape.computeVertexNormals();
    geometry.morphAttributes.position = [new THREE.Float32BufferAttribute(cube, 3)];
    geometry.morphAttributes.normal = [shape.getAttribute("normal").clone()];
    shape.dispose();
    const mesh = new THREE.Mesh(geometry, own(new THREE.MeshStandardMaterial({ color: palette.accent, roughness: 0.5 })));
    mesh.position.set(0, 0.9, 0);
    mesh.castShadow = true;
    mesh.scale.setScalar(0.001);
    layer.add(mesh);
    return mesh;
  }

  function apply(fx: CameraFx | null | undefined, media: CameraSelection["animation"], morphs: boolean) {
    clear();
    kind = fx ?? undefined;
    if (media === "anime" || media === "paper-cutout") reskin(() => new THREE.MeshToonMaterial({ color: palette.subject }));
    if (media === "claymation") reskin(() => new THREE.MeshStandardMaterial({ color: "#c98f6b", roughness: 1, flatShading: true }));
    if (morphs) morph = morphTarget();
    if (fx === "particles") field(420, [0.35, 2.3], [0, 2.6], 0.035, palette.intel);
    if (fx === "disintegrate") {
      reskin((mesh) => own(((mesh.material as THREE.Material).clone() as THREE.MeshStandardMaterial)));
      meshes().forEach((mesh) => Object.assign(mesh.material as THREE.Material, { transparent: true }));
      field(260, [0, 0.35], [0.1, 1.7], 0.03, palette.subject);
    }
    if (fx === "hologram") {
      reskin(() => new THREE.MeshBasicMaterial({ color: palette.intel, wireframe: true, transparent: true, opacity: 0.7 }));
    }
    if (fx === "glitch") {
      ghost = subject.clone(true);
      ghost.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.material = own(new THREE.MeshBasicMaterial({ color: "#ff3b6b", transparent: true, opacity: 0.5, depthWrite: false }));
        }
      });
      ghost.visible = false;
      layer.add(ghost);
    }
    if (fx === "smoke") {
      const puff = own(new THREE.SphereGeometry(0.32, 12, 10));
      const haze = own(new THREE.MeshStandardMaterial({ color: "#9aa3ad", transparent: true, opacity: 0.16, depthWrite: false }));
      for (let index = 0; index < 12; index += 1) {
        const cloud = new THREE.Mesh(puff, haze);
        const angle = (index / 12) * Math.PI * 2;
        cloud.position.set(Math.cos(angle) * 0.7, 0.15 + (index % 3) * 0.28, Math.sin(angle) * 0.7);
        layer.add(cloud);
      }
    }
    if (fx === "growth") {
      const shard = own(new THREE.ConeGeometry(0.07, 0.6, 5));
      const crystal = own(new THREE.MeshStandardMaterial({ color: palette.intel, transparent: true, opacity: 0.8, roughness: 0.2, metalness: 0.3 }));
      for (let index = 0; index < 16; index += 1) {
        const piece = new THREE.Mesh(shard, crystal);
        const angle = (index / 16) * Math.PI * 2 + (index % 2) * 0.2;
        const distance = 0.55 + (index % 4) * 0.28;
        piece.position.set(Math.cos(angle) * distance, 0, Math.sin(angle) * distance);
        piece.rotation.set((Math.random() - 0.5) * 0.6, 0, (Math.random() - 0.5) * 0.6);
        layer.add(piece);
      }
    }
  }

  function update(progress: number, time: number) {
    if (points && seeds && base) {
      const positions = points.geometry.getAttribute("position") as THREE.BufferAttribute;
      for (let index = 0; index < seeds.length; index += 1) {
        const [x, y, z] = [base[index * 3], base[index * 3 + 1], base[index * 3 + 2]];
        const seed = seeds[index];
        if (kind === "disintegrate") {
          // Fragments lift off the body and scatter as it fades.
          const spread = 1 + progress * (1.5 + seed * 2);
          positions.setXYZ(index, x * spread, y + progress * (0.6 + seed * 1.2), z * spread);
        } else {
          // A slow upward drift that wraps, like motes in a light beam.
          positions.setY(index, (y + (time / 1000) * (0.08 + seed * 0.12)) % 2.6);
        }
      }
      positions.needsUpdate = true;
      points.visible = kind !== "disintegrate" || progress > 0.05;
    }
    if (kind === "disintegrate") {
      meshes().forEach((mesh) => Object.assign(mesh.material as THREE.Material, { opacity: Math.max(0.08, 1 - progress * 0.95) }));
    }
    if (kind === "hologram") {
      meshes().forEach((mesh) => Object.assign(mesh.material as THREE.Material, { opacity: 0.45 + 0.3 * Math.abs(Math.sin(time / 90)) }));
    }
    if (kind === "glitch" && ghost) {
      if (time > glitchUntil && Math.random() < 0.06) glitchUntil = time + 90;
      const glitching = time < glitchUntil;
      subject.position.x = glitching ? (Math.random() - 0.5) * 0.12 : 0;
      ghost.visible = glitching;
      ghost.position.x = subject.position.x + 0.06;
    }
    if (kind === "smoke") layer.children.forEach((cloud, index) => cloud.scale.setScalar(0.6 + progress * 1.1 + Math.sin(time / 600 + index) * 0.08));
    if (kind === "growth") layer.children.forEach((piece, index) => piece.scale.set(1, Math.max(0.01, progress * (0.5 + (index % 3) * 0.35)), 1));
    if (kind === "liquid") {
      const melt = Math.sin(Math.PI * progress);
      subject.scale.set(1 + melt * 0.22, 1 - melt * 0.4, 1 + melt * 0.22);
    }
    if (morph) {
      // The subject folds into a sphere at its centre, and the sphere becomes the next shape.
      const step = (from: number, to: number) => {
        const t = Math.min(1, Math.max(0, (progress - from) / (to - from)));
        return t * t * (3 - 2 * t);
      };
      const remaining = Math.max(0.001, 1 - step(0.3, 0.5));
      subject.scale.setScalar(remaining);
      subject.position.y = 0.9 * (1 - remaining);
      morph.scale.setScalar(Math.max(0.001, step(0.32, 0.5)));
      morph.morphTargetInfluences![0] = step(0.5, 0.85);
      morph.rotation.y = progress * 1.4;
    }
  }

  return {
    apply,
    update,
    dispose() {
      clear();
      scene.remove(layer);
    }
  };
}
