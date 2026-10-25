import * as THREE from "three";
import type { CameraSelection } from "@/lib/camera-language";
import { MATCH_MOON, cameraPose, type RigPose } from "@/lib/camera-paths";
import { SHOT_LAYER, disposeTree, onLayer, type ScenePalette } from "@/lib/camera-scene-build";
import { previewChannels, selectedFov } from "@/lib/preview-channels";

/**
 * The test stage around the mannequin: background columns and two coloured
 * props give the shot depth and colour to work on, plus kits that switch on
 * with a term: a doorway, leading lines, a foreground shoulder, a near focus
 * marker, a bouncing timing ball, brutalist and retro-futurist sets, and the
 * match cut's moon. Small honest stand-ins, not a set designer.
 */
export function createStage(scene: THREE.Scene, palette: ScenePalette) {
  const root = new THREE.Group();
  scene.add(root);
  const stone = new THREE.MeshStandardMaterial({ color: palette.dark, roughness: 0.95 });

  // Always there: a floor the shot camera stands on, depth columns and two props.
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(30, 48),
    new THREE.MeshStandardMaterial({ color: palette.ground.clone().lerp(palette.dark, 0.25), roughness: 1 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.045;
  floor.receiveShadow = true;
  root.add(onLayer(floor, SHOT_LAYER));
  const shadowCatcher = new THREE.Mesh(new THREE.CircleGeometry(4, 40), new THREE.ShadowMaterial({ opacity: 0.28 }));
  shadowCatcher.rotation.x = -Math.PI / 2;
  shadowCatcher.position.y = -0.03;
  shadowCatcher.receiveShadow = true;
  root.add(shadowCatcher);

  const columns = new THREE.Group();
  const columnGeometry = new THREE.BoxGeometry(0.2, 2.6, 0.2);
  for (const [x, z] of [
    [-1.7, -2],
    [1.7, -2],
    [-2.2, -4.2],
    [2.2, -4.2],
    [-2.7, -6.6],
    [2.7, -6.6]
  ]) {
    const column = new THREE.Mesh(columnGeometry, stone);
    column.position.set(x, 1.3, z);
    column.castShadow = true;
    columns.add(column);
  }
  root.add(columns);

  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.13, 24, 16), new THREE.MeshStandardMaterial({ color: "#d6463c", roughness: 0.45 }));
  ball.position.set(-0.72, 0.1, 0.02);
  ball.castShadow = true;
  const block = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.26, 0.26), new THREE.MeshStandardMaterial({ color: "#2f8f8a", roughness: 0.6 }));
  block.position.set(0.74, 0.1, -0.35);
  block.rotation.y = 0.5;
  block.castShadow = true;
  root.add(ball, block);

  // Kits rebuilt on every play, with their own materials so disposing a kit never touches the stage.
  let kit = new THREE.Group();
  let kitStone = stone.clone();
  root.add(kit);
  let timer: THREE.Mesh | null = null;
  let moon: THREE.Mesh | null = null;
  let nearPoint: THREE.Vector3 | null = null;

  const add = (mesh: THREE.Mesh, cast = true) => {
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
    kit.add(mesh);
    return mesh;
  };
  const box = (size: [number, number, number], position: [number, number, number], material: THREE.Material) => {
    const mesh = add(new THREE.Mesh(new THREE.BoxGeometry(...size), material));
    mesh.position.set(...position);
    return mesh;
  };

  /** Camera-facing frame for kits that must sit in the shot whatever the angle. */
  function framing(pose: RigPose) {
    const position = new THREE.Vector3(...pose.position);
    const target = new THREE.Vector3(...pose.target);
    const forward = target.clone().sub(position).setY(0).normalize();
    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
    return { position, target, forward, right, distance: position.distanceTo(target) };
  }

  function doorway(pose: RigPose, fov: number) {
    const { position, target, forward, distance } = framing(pose);
    const door = new THREE.Group();
    // Stand the doorway 45% of the way from the camera, sized from what the lens sees there.
    const share = 0.45;
    const visible = 2 * Math.tan((fov * Math.PI) / 360) * distance * share;
    const sightY = position.y + (target.y - position.y) * share;
    const [width, height, thick] = [visible * 1.05, Math.max(0.5, sightY + visible * 0.36), visible * 0.07];
    const wall = new THREE.MeshStandardMaterial({ color: palette.dark.clone().lerp(palette.subject, 0.2), roughness: 0.9 });
    const parts: Array<[[number, number, number], [number, number, number]]> = [
      [[thick, height, thick], [-width / 2, height / 2, 0]],
      [[thick, height, thick], [width / 2, height / 2, 0]],
      [[width + thick, thick, thick], [0, height, 0]],
      [[visible, height + visible, thick * 0.6], [-width / 2 - visible / 2, (height + visible) / 2, 0]],
      [[visible, height + visible, thick * 0.6], [width / 2 + visible / 2, (height + visible) / 2, 0]],
      [[width, visible, thick * 0.6], [0, height + visible / 2 + thick / 2, 0]]
    ];
    for (const [size, at] of parts) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), wall);
      mesh.position.set(...at);
      mesh.castShadow = true;
      door.add(mesh);
    }
    door.position.copy(target).addScaledVector(forward, -distance * (1 - share)).setY(0);
    door.lookAt(position.x, 0, position.z);
    kit.add(door);
  }

  function shoulder(pose: RigPose) {
    const { position, forward, right } = framing(pose);
    const bust = new THREE.Group();
    const cloth = new THREE.MeshStandardMaterial({ color: palette.dark.clone().lerp(palette.ground, 0.3), roughness: 1 });
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 20, 14), cloth);
    head.position.set(0, 0.24, 0);
    const shoulders = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.34, 4, 12), cloth);
    shoulders.rotation.z = Math.PI / 2;
    bust.add(head, shoulders);
    // Half out of frame at the lower left, as a real over-the-shoulder edge sits.
    bust.position.copy(position).addScaledVector(forward, 0.85).addScaledVector(right, -0.52);
    bust.position.y = position.y - 0.6;
    bust.lookAt(bust.position.clone().add(forward));
    kit.add(bust);
  }

  function leadingLines() {
    const strip = new THREE.MeshStandardMaterial({ color: palette.intel, emissive: palette.intel, emissiveIntensity: 0.55, roughness: 0.6 });
    const line = (from: THREE.Vector3, to: THREE.Vector3) => {
      const mesh = add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.01, from.distanceTo(to)), strip), false);
      mesh.position.copy(from).add(to).multiplyScalar(0.5);
      mesh.lookAt(to);
    };
    // In front, for high angles and the diagram; behind, fanning in to the feet, for eye-level shots.
    for (const [x, z] of [
      [-3.4, 1.4],
      [-2.4, 3.2],
      [-1.1, 3.6],
      [1.1, 3.6],
      [2.4, 3.2],
      [3.4, 1.4]
    ]) {
      line(new THREE.Vector3(x, -0.02, z), new THREE.Vector3(Math.sign(x) * 0.22, -0.02, 0.62));
    }
    for (const [x, z] of [
      [-3.6, -3.2],
      [-2.2, -6],
      [-0.8, -7],
      [0.8, -7],
      [2.2, -6],
      [3.6, -3.2]
    ]) {
      line(new THREE.Vector3(x, -0.02, z), new THREE.Vector3(Math.sign(x) * 0.18, -0.02, -0.6));
    }
  }

  /** First person looks away from the plinth, so give the eyes forearms and a few landmarks ahead. */
  function firstPerson() {
    const skin = new THREE.MeshStandardMaterial({ color: palette.subject, roughness: 0.9 });
    for (const side of [-1, 1]) {
      const arm = add(new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.32, 4, 10), skin));
      arm.position.set(side * 0.2, 1.4, 0.85);
      arm.rotation.set(Math.PI / 2.2, 0, side * -0.2);
    }
    for (const [x, z] of [
      [-1.3, 3.2],
      [1.3, 3.2],
      [-1.9, 5.6],
      [1.9, 5.6]
    ]) {
      box([0.2, 2.6, 0.2], [x, 1.3, z], kitStone);
    }
    const target = add(new THREE.Mesh(new THREE.SphereGeometry(0.16, 24, 16), new THREE.MeshStandardMaterial({ color: "#d6463c", roughness: 0.45 })));
    target.position.set(0.25, 0.16, 2.6);
  }

  function brutalist() {
    const concrete = new THREE.MeshStandardMaterial({ color: "#8b8d8f", roughness: 1, flatShading: true });
    box([2.2, 3.4, 1.2], [-2.3, 1.7, -3.2], concrete);
    box([1.6, 4.6, 1.6], [0.2, 2.3, -4.6], concrete);
    box([2.6, 2.2, 1], [2.6, 1.1, -2.8], concrete);
    box([3.6, 0.3, 1.4], [0, 2.9, -2.6], concrete);
  }

  function retroFuturist() {
    const chrome = new THREE.MeshStandardMaterial({ color: "#d9dde3", metalness: 0.85, roughness: 0.18 });
    const plastic = new THREE.MeshStandardMaterial({ color: "#e8a35a", roughness: 0.35 });
    const arch = add(new THREE.Mesh(new THREE.TorusGeometry(1.9, 0.09, 12, 64, Math.PI), chrome));
    arch.position.set(0, 0, -2.4);
    const orb = add(new THREE.Mesh(new THREE.SphereGeometry(0.55, 32, 20), chrome));
    orb.position.set(-2.1, 0.55, -1.6);
    const pod = add(new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.9, 6, 20), plastic));
    pod.position.set(2.1, 0.78, -1.4);
  }

  function nearMarker(pose: RigPose, side: number) {
    const { position, target, right } = framing(pose);
    const at = position.clone().lerp(target, 0.32).addScaledVector(right, side * 0.42);
    const height = Math.max(0.2, at.y - 0.06);
    const post = add(new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, height, 10), kitStone));
    post.position.set(at.x, height / 2, at.z);
    const lamp = add(
      new THREE.Mesh(
        new THREE.SphereGeometry(0.05, 20, 14),
        new THREE.MeshStandardMaterial({ color: "#f2c46d", emissive: "#f2c46d", emissiveIntensity: 0.6 })
      )
    );
    lamp.position.set(at.x, height, at.z);
    nearPoint = lamp.position.clone();
  }

  function apply(selection: CameraSelection) {
    root.remove(kit);
    disposeTree(kit);
    kit = new THREE.Group();
    kitStone.dispose();
    kitStone = stone.clone();
    root.add(kit);
    timer = null;
    moon = null;
    nearPoint = null;
    const channels = previewChannels(selection);
    const start = cameraPose(selection, 0, "before");
    columns.visible = channels.grade !== "brutalist" && channels.grade !== "retro-futurist";
    // Symmetry needs a balanced frame: matching pale pillars, and the odd props put away.
    ball.visible = block.visible = channels.composition !== "centered";
    if (channels.composition === "centered") {
      const pale = new THREE.MeshStandardMaterial({ color: palette.subject.clone().lerp(palette.dark, 0.35), roughness: 0.85 });
      box([0.2, 2.2, 0.2], [-0.82, 1.1, -0.45], pale);
      box([0.2, 2.2, 0.2], [0.82, 1.1, -0.45], pale);
    }
    if (channels.composition === "leading-lines") leadingLines();
    if (channels.composition === "frame-within-frame") doorway(start, selectedFov(selection));
    if (channels.composition === "over-the-shoulder") shoulder(start);
    if (channels.focus) nearMarker(start, channels.focus === "split-diopter" ? -1 : 1);
    if (channels.lens === "anamorphic") {
      // Two bright practicals behind the subject: point highlights are what an anamorphic lens streaks.
      const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color("#fff4e0").multiplyScalar(6) });
      for (const [x, y, z] of [
        [-0.95, 1.75, -2.4],
        [1.25, 1.35, -3.6]
      ]) {
        const lamp = add(new THREE.Mesh(new THREE.SphereGeometry(0.05, 16, 12), glow), false);
        lamp.position.set(x, y, z);
      }
    }
    if (channels.rig === "first-person") firstPerson();
    if (channels.grade === "brutalist") brutalist();
    if (channels.grade === "retro-futurist") retroFuturist();
    if (channels.shutter) {
      timer = add(new THREE.Mesh(new THREE.SphereGeometry(0.09, 20, 14), new THREE.MeshStandardMaterial({ color: palette.intel, roughness: 0.4 })));
      timer.position.set(0.95, 0.09, 0.3);
    }
    if (channels.transition === "match-cut") {
      moon = add(
        new THREE.Mesh(
          new THREE.SphereGeometry(MATCH_MOON.radius, 32, 20),
          new THREE.MeshStandardMaterial({ color: "#e9e4d6", emissive: "#e9e4d6", emissiveIntensity: 0.55, roughness: 1 })
        ),
        false
      );
      moon.position.set(...MATCH_MOON.center);
    }
  }

  /** `sceneTime` is the shot's own clock in seconds, already slowed, sped up or frozen. */
  function update(progress: number, sceneTime: number, transition: CameraSelection["transitions"]) {
    if (timer) {
      // Three bounces a second of shot time, so slow motion and time-lapse read at a glance.
      timer.position.y = 0.09 + Math.abs(Math.sin(sceneTime * Math.PI * 1.6)) * 0.72;
    }
    if (moon) moon.visible = transition !== "match-cut" || progress >= 0.5;
  }

  return {
    apply,
    update,
    /** The near focus marker, for rack focus and the split diopter; null without a focus term. */
    nearPoint: () => nearPoint,
    dispose() {
      scene.remove(root);
      disposeTree(root);
      kitStone.dispose();
    }
  };
}
