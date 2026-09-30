import * as THREE from "three";
import { emptyCameraSelection, type CameraSelection } from "@/lib/camera-language";
import { cameraPath, cameraPose, selectionPose } from "@/lib/camera-paths";
import { createSceneFx } from "@/lib/camera-scene-fx";

/**
 * The illustrative 3D preview, ported from FLUX Studio Lite
 * (`src/scene/create-camera-scene.ts`): a mannequin on a plinth, the camera
 * rig travelling its path, plus a lens frustum, a key light and the chosen
 * effect. Colours come from `--scene-*` custom properties on the canvas.
 */
export const SHOT_MS = 1600;
const REST_MS = 700;

export function createCameraScene(canvas: HTMLCanvasElement) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const view = new THREE.PerspectiveCamera(38, 1, 0.1, 40);
  const css = getComputedStyle(canvas);
  const color = (name: string, fallback: string) => new THREE.Color(css.getPropertyValue(name).trim() || fallback);
  const palette = {
    accent: color("--scene-accent", "#ea7b7b"),
    intel: color("--scene-emissive", "#62c4e6"),
    subject: color("--scene-subject", "#c9ced6")
  };

  const hemisphere = new THREE.HemisphereLight(color("--scene-sky", "#dfeeee"), color("--scene-ground", "#171a1e"), 2.1);
  scene.add(hemisphere);
  const key = new THREE.DirectionalLight(color("--scene-light", "#ffffff"), 2.7);
  scene.add(key);
  const sun = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  scene.add(sun);

  const material = new THREE.MeshStandardMaterial({ color: palette.subject, roughness: 0.9 });
  const accent = new THREE.MeshStandardMaterial({ color: palette.accent, roughness: 0.75, metalness: 0.1 });
  const dark = new THREE.MeshStandardMaterial({ color: color("--scene-dark", "#566069"), roughness: 1 });

  const subject = new THREE.Group();
  scene.add(subject);
  function mesh(geometry: THREE.BufferGeometry, surface: THREE.Material = material) {
    const result = new THREE.Mesh(geometry, surface);
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
  const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.55, 0.035, 48), dark);
  pedestal.position.y = -0.015;
  scene.add(pedestal);
  const grid = new THREE.GridHelper(8, 24, color("--scene-grid-major", "#566069"), color("--scene-grid-minor", "#333a42"));
  (grid.material as THREE.Material).transparent = true;
  (grid.material as THREE.Material).opacity = 0.34;
  grid.position.y = -0.04;
  scene.add(grid);

  const rig = new THREE.Group();
  function cameraPart(geometry: THREE.BufferGeometry, surface: THREE.Material, x: number, y: number, z: number) {
    const part = new THREE.Mesh(geometry, surface);
    part.position.set(x, y, z);
    rig.add(part);
    return part;
  }
  cameraPart(new THREE.BoxGeometry(0.4, 0.27, 0.34), accent, 0, 0, 0);
  cameraPart(new THREE.BoxGeometry(0.26, 0.16, 0.014), dark, -0.015, -0.01, -0.179);
  for (const side of [-1, 1]) {
    cameraPart(new THREE.BoxGeometry(0.014, 0.16, 0.23), dark, side * 0.207, 0, -0.01);
    cameraPart(new THREE.BoxGeometry(0.04, 0.095, 0.04), dark, 0, 0.18, side * 0.095);
  }
  cameraPart(new THREE.BoxGeometry(0.06, 0.04, 0.25), accent, 0, 0.235, 0);
  cameraPart(new THREE.BoxGeometry(0.1, 0.075, 0.12), dark, 0.13, 0.17, -0.15);
  const grip = cameraPart(new THREE.CapsuleGeometry(0.055, 0.13, 3, 8), dark, 0.24, -0.01, -0.015);
  grip.scale.z = 0.75;
  // The lens faces +Z, which is also the direction set by Group.lookAt below.
  for (const [radius, length, z] of [
    [0.11, 0.27, 0.29],
    [0.125, 0.04, 0.2],
    [0.122, 0.04, 0.415]
  ]) {
    const lens = cameraPart(new THREE.CylinderGeometry(radius, radius, length, 16), dark, 0, 0, z);
    lens.rotation.x = Math.PI / 2;
  }
  const glass = new THREE.MeshStandardMaterial({
    color: color("--scene-glass", "#13161a"),
    roughness: 0.2,
    metalness: 0.2,
    emissive: palette.intel,
    emissiveIntensity: 0.3
  });
  cameraPart(new THREE.CircleGeometry(0.095, 16), glass, 0, 0, 0.439);
  // The lens frustum: wider for wide lenses, a narrow cone for telephoto.
  const frustumMaterial = new THREE.LineBasicMaterial({ color: palette.intel, transparent: true, opacity: 0.35 });
  const frustum = new THREE.LineSegments(new THREE.BufferGeometry(), frustumMaterial);
  rig.add(frustum);
  scene.add(rig);

  function setFrustum(fov: number, strong: boolean) {
    const length = 1.35;
    const halfHeight = Math.tan(((fov * Math.PI) / 180) / 2) * length;
    const halfWidth = halfHeight * (16 / 9);
    const apex = new THREE.Vector3(0, 0, 0.44);
    const corners = [
      [-halfWidth, -halfHeight],
      [halfWidth, -halfHeight],
      [halfWidth, halfHeight],
      [-halfWidth, halfHeight]
    ].map(([x, y]) => new THREE.Vector3(x, y, 0.44 + length));
    const points = corners.flatMap((corner, index) => [apex, corner, corner, corners[(index + 1) % 4]]);
    frustum.geometry.dispose();
    frustum.geometry = new THREE.BufferGeometry().setFromPoints(points);
    frustumMaterial.opacity = strong ? 0.7 : 0.3;
  }

  const path = new THREE.Line(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({ color: palette.accent, transparent: true, opacity: 0.48 })
  );
  scene.add(path);
  const sight = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
    new THREE.LineDashedMaterial({ color: palette.accent, dashSize: 0.065, gapSize: 0.065, transparent: true, opacity: 0.27 })
  );
  scene.add(sight);

  const fx = createSceneFx(scene, subject, palette);

  let selected: CameraSelection = emptyCameraSelection;
  let duration = SHOT_MS;
  let frozen = false;
  let stepped = false;
  let reducedMotion = false;
  let started = 0;
  let frame = 0;
  let visible = !document.hidden;
  let disposed = false;

  function updatePose(progress: number, time: number) {
    const pose = cameraPose(selected, progress);
    rig.position.fromArray(pose.position);
    rig.lookAt(...pose.target);
    rig.rotateZ(pose.roll);
    subject.rotation.y = pose.subjectRotation;
    const positions = sight.geometry.getAttribute("position") as THREE.BufferAttribute;
    positions.setXYZ(0, ...pose.position);
    positions.setXYZ(1, ...pose.target);
    positions.needsUpdate = true;
    sight.geometry.computeBoundingSphere();
    sight.computeLineDistances();
    fx.update(progress, time);
  }

  function render() {
    if (visible && !disposed) renderer.render(scene, view);
  }

  function tick(now: number) {
    if (!started) started = now;
    const cycle = duration + REST_MS;
    let progress = Math.min(1, ((now - started) % cycle) / duration);
    // Stop-motion looks step at twelve frames a second.
    if (stepped) progress = Math.floor(progress * duration / 83) * 83 / duration;
    updatePose(frozen ? 0.5 : progress, now);
    render();
    frame = requestAnimationFrame(tick);
  }

  function stop() {
    cancelAnimationFrame(frame);
    frame = 0;
  }

  function resize() {
    const bounds = canvas.getBoundingClientRect();
    if (!bounds.width || !bounds.height || disposed) return;
    view.aspect = bounds.width / bounds.height;
    view.updateProjectionMatrix();
    renderer.setSize(bounds.width, bounds.height, false);
    render();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);

  return {
    play(selection: CameraSelection, reduced = false) {
      stop();
      selected = selection;
      reducedMotion = reduced;
      const pose = selectionPose(selection);
      frozen = pose.speed === 0;
      duration = pose.speed ? SHOT_MS / pose.speed : SHOT_MS;
      stepped = pose.look === "clay";
      renderer.setPixelRatio(pose.look === "pixel" ? 0.16 : Math.min(window.devicePixelRatio || 1, 1.5));
      setFrustum(pose.fov ?? 38, pose.fov !== undefined);
      const light = pose.light;
      const azimuth = ((light?.azimuth ?? -37) * Math.PI) / 180;
      const elevation = ((light?.elevation ?? 48) * Math.PI) / 180;
      const direction = new THREE.Vector3(Math.sin(azimuth) * Math.cos(elevation), Math.sin(elevation), Math.cos(azimuth) * Math.cos(elevation));
      key.position.copy(direction.clone().multiplyScalar(7));
      key.color.set(light?.color ?? css.getPropertyValue("--scene-light").trim() ?? "#ffffff");
      key.intensity = light?.intensity ?? 2.7;
      hemisphere.intensity = light ? 0.8 : 2.1;
      sun.visible = Boolean(light);
      sun.position.copy(direction.multiplyScalar(3.4)).add(new THREE.Vector3(0, 0.6, 0));
      (sun.material as THREE.MeshBasicMaterial).color.set(light?.color ?? "#ffffff");
      fx.apply(pose.fx, pose.look);

      const points = cameraPath(selection);
      path.geometry.dispose();
      path.geometry = new THREE.BufferGeometry().setFromPoints(points.map((point) => new THREE.Vector3(...point)));
      const scale = Math.max(1, Math.max(...points.map((point) => Math.hypot(...point))) / 3.5);
      view.position.set(6.5 * scale, 4.7 * scale, 7.4 * scale);
      view.lookAt(0, 1.1, 0);
      started = 0;
      resize();
      if (reducedMotion) {
        updatePose(frozen ? 0.5 : 1, 0);
        render();
      } else if (visible) {
        frame = requestAnimationFrame(tick);
      }
    },
    setVisible(next: boolean) {
      visible = next;
      stop();
      if (visible && !reducedMotion) frame = requestAnimationFrame(tick);
      else render();
    },
    dispose() {
      disposed = true;
      stop();
      observer.disconnect();
      fx.dispose();
      const geometries = new Set<THREE.BufferGeometry>();
      const materials = new Set<THREE.Material>();
      scene.traverse((object) => {
        const drawable = object as THREE.Mesh;
        if (drawable.geometry) geometries.add(drawable.geometry);
        if (drawable.material) {
          (Array.isArray(drawable.material) ? drawable.material : [drawable.material]).forEach((surface) => materials.add(surface));
        }
      });
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((surface) => surface.dispose());
      renderer.dispose();
    }
  };
}
