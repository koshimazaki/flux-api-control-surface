import * as THREE from "three";
import { emptyCameraSelection, type CameraSelection } from "@/lib/camera-language";
import { cameraPath, cameraPose, type RigPose } from "@/lib/camera-paths";
import {
  HELPER_LAYER,
  SHOT_LAYER,
  buildGuides,
  buildMannequin,
  buildRig,
  disposeTree,
  gradientTexture,
  readPalette
} from "@/lib/camera-scene-build";
import { createSceneFx } from "@/lib/camera-scene-fx";
import { FOCUS, FORMAT, GRADE, MEDIA, createLookPass, type LookUniforms } from "@/lib/camera-scene-post";
import { createStage } from "@/lib/camera-scene-stage";
import { insetOnLeft, previewChannels, warpProgress, type PreviewChannels } from "@/lib/preview-channels";

/**
 * The illustrative 3D preview, ported from FLUX Studio Lite
 * (`src/scene/create-camera-scene.ts`) and grown into two views: the scene
 * diagram (the default: the rig travelling its path around the mannequin) and
 * the shot (what the rig's camera sees, finished by the look pass, with the
 * diagram inset). Colours come from `--scene-*` custom properties on the canvas.
 */
export const SHOT_MS = 1600;
const REST_MS = 700;
export type PreviewView = "shot" | "diagram";
/** Where the diagram sits over the shot, as fractions of the stage (mirrored to the left by insetOnLeft); the CSS frame matches it. */
export const INSET = { width: 0.3, right: 0.025, top: 0.045 };

const FLIP = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
const smooth = (from: number, to: number, value: number) => {
  const t = Math.min(1, Math.max(0, (value - from) / (to - from)));
  return t * t * (3 - 2 * t);
};

type LightingId = NonNullable<CameraSelection["lighting"]>;
/** Fill and backdrop per lighting style; key light colour and direction come from the term itself. */
const LIGHTING: Record<LightingId, { hemisphere: number; rim?: [string, number]; sky: [string, string] }> = {
  "golden-hour": { hemisphere: 0.8, sky: ["#4a3550", "#f2a65a"] },
  "blue-hour": { hemisphere: 0.7, sky: ["#0b1430", "#40609e"] },
  backlit: { hemisphere: 0.5, sky: ["#262b33", "#c9d2dc"] },
  "low-key": { hemisphere: 0.08, sky: ["#030405", "#0b0d10"] },
  "high-key": { hemisphere: 2.8, rim: ["#ffffff", 1.4], sky: ["#eef2f5", "#ffffff"] },
  neon: { hemisphere: 0.3, rim: ["#3ff0ff", 2.6], sky: ["#14061c", "#2c0b30"] },
  overcast: { hemisphere: 2.3, sky: ["#8e98a3", "#c7cfd6"] },
  silhouette: { hemisphere: 0.03, sky: ["#ffb764", "#fff0d2"] }
};

const GRADE_CODES: Record<NonNullable<PreviewChannels["grade"]>, number> = {
  noir: GRADE.noir,
  pastel: GRADE.pastel,
  "teal-orange": GRADE.tealOrange,
  "colour-accent": GRADE.accent,
  brutalist: GRADE.brutalist,
  "retro-futurist": GRADE.retro
};
const MEDIA_CODES: Record<NonNullable<PreviewChannels["media"]>, number> = {
  "pixel-art": MEDIA.pixel,
  claymation: MEDIA.clay,
  anime: MEDIA.anime,
  watercolour: MEDIA.watercolour,
  "paper-cutout": MEDIA.paper,
  "cgi-render": MEDIA.none
};
const FORMAT_CODES: Partial<Record<NonNullable<PreviewChannels["format"]>, number>> = {
  "film-16mm": FORMAT.film,
  "super-8": FORMAT.super8,
  vhs: FORMAT.vhs
};

/**
 * One renderer per canvas, kept across theme rebuilds: every new WebGLRenderer
 * allocates a few internal textures and framebuffers that dispose() never
 * frees, so a renderer per rebuild would pile them up on the same context.
 */
const renderers = new WeakMap<HTMLCanvasElement, THREE.WebGLRenderer>();

function rendererFor(canvas: HTMLCanvasElement) {
  const existing = renderers.get(canvas);
  if (existing) return existing;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderers.set(canvas, renderer);
  return renderer;
}

export function createCameraScene(canvas: HTMLCanvasElement) {
  const renderer = rendererFor(canvas);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  const palette = readPalette(canvas);
  const scene = new THREE.Scene();
  const diagram = new THREE.PerspectiveCamera(38, 1, 0.1, 120);
  diagram.layers.enable(HELPER_LAYER);
  const shot = new THREE.PerspectiveCamera(38, 16 / 9, 0.05, 60);
  shot.layers.enable(SHOT_LAYER);
  const shotB = shot.clone();

  const hemisphere = new THREE.HemisphereLight(palette.sky, palette.ground, 2.1);
  const key = new THREE.DirectionalLight(palette.light, 2.7);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: 0.5, far: 20 });
  key.shadow.camera.updateProjectionMatrix();
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  const rim = new THREE.DirectionalLight(0xffffff, 0);
  scene.add(hemisphere, key, rim);

  const material = new THREE.MeshStandardMaterial({ color: palette.subject, roughness: 0.9 });
  const subject = buildMannequin(material);
  scene.add(subject);
  const pedestal = new THREE.Mesh(
    new THREE.CylinderGeometry(0.52, 0.55, 0.035, 48),
    new THREE.MeshStandardMaterial({ color: palette.dark, roughness: 1 })
  );
  pedestal.position.y = -0.015;
  pedestal.receiveShadow = true;
  scene.add(pedestal);
  const grid = new THREE.GridHelper(8, 24, palette.gridMajor, palette.gridMinor);
  (grid.material as THREE.Material).transparent = true;
  (grid.material as THREE.Material).opacity = 0.34;
  grid.position.y = -0.04;
  scene.add(grid);
  const { rig, setFrustum } = buildRig(palette);
  const { path, sight, sun } = buildGuides(palette);
  scene.add(rig, path, sight, sun);
  const stage = createStage(scene, palette);
  const fx = createSceneFx(scene, subject, palette);
  const look = createLookPass(renderer);

  let selected: CameraSelection = emptyCameraSelection;
  let channels = previewChannels(selected);
  let view: PreviewView = "diagram";
  let sky: THREE.Texture | null = null;
  let duration = SHOT_MS;
  let stepMs = 0;
  let reducedMotion = false;
  let started = 0;
  let cycle = -1;
  let lastRaw = 1;
  let frame = 0;
  let visible = !document.hidden;
  let disposed = false;
  const size = { width: 1, height: 1 };
  const aim = new THREE.Object3D();
  const viewDirection = new THREE.Vector3();

  /** Places the rig, or a shot camera on the rig: a camera looks down -Z where the rig's lens faces +Z. */
  function orient(object: THREE.Object3D, pose: RigPose, isCamera: boolean) {
    aim.position.fromArray(pose.position);
    aim.lookAt(...pose.target);
    aim.rotateZ(pose.roll);
    object.position.copy(aim.position);
    object.quaternion.copy(aim.quaternion);
    if (isCamera) object.quaternion.multiply(FLIP);
  }

  /** Composition shifts the view window (off-axis) so the subject sits where the term puts it. */
  function frameShot(camera: THREE.PerspectiveCamera) {
    camera.aspect = size.width / size.height;
    const [x, y] = channels.geometry.frame ?? [0, 0];
    if (x || y) {
      const [width, height] = [1000 * camera.aspect, 1000];
      camera.setViewOffset(width, height, (-x * width) / 2, (y * height) / 2, width, height);
    } else {
      camera.clearViewOffset();
    }
    camera.updateProjectionMatrix();
  }

  function depthTo(camera: THREE.PerspectiveCamera, point: THREE.Vector3) {
    camera.getWorldDirection(viewDirection);
    return Math.max(0.05, point.clone().sub(camera.position).dot(viewDirection));
  }

  function placeKey(progress: number) {
    const light = channels.light;
    const sweep = channels.shutter === "timelapse" || channels.shutter === "hyperlapse" ? progress * 150 : 0;
    const azimuth = (((light?.azimuth ?? -37) + sweep) * Math.PI) / 180;
    const elevation = ((light?.elevation ?? 48) * Math.PI) / 180;
    const direction = new THREE.Vector3(Math.sin(azimuth) * Math.cos(elevation), Math.sin(elevation), Math.cos(azimuth) * Math.cos(elevation));
    key.position.copy(direction).multiplyScalar(7);
    sun.position.copy(direction).multiplyScalar(3.4).add(new THREE.Vector3(0, 0.6, 0));
  }

  function applyLighting() {
    const light = channels.light;
    const style = channels.lighting ? LIGHTING[channels.lighting] : null;
    key.color.set(light?.color ?? palette.light);
    key.intensity = light?.intensity ?? 2.7;
    hemisphere.intensity = style?.hemisphere ?? 2.1;
    rim.color.set(style?.rim?.[0] ?? "#ffffff");
    rim.intensity = style?.rim?.[1] ?? 0;
    const opposite = (((light?.azimuth ?? -37) + 180) * Math.PI) / 180;
    rim.position.set(Math.sin(opposite) * 6, 2.5, Math.cos(opposite) * 6);
    sun.visible = Boolean(light);
    (sun.material as THREE.MeshBasicMaterial).color.set(light?.color ?? "#ffffff");
    sky?.dispose();
    sky = style ? gradientTexture(...style.sky) : gradientTexture(palette.surfaceTop, palette.surfaceBottom);
  }

  /** Where a camera focuses this frame: the subject, or for a rack, pulling in from the near marker. */
  function focusDistance(camera: THREE.PerspectiveCamera, pose: RigPose, progress: number) {
    const subject = depthTo(camera, new THREE.Vector3(...pose.target));
    if (channels.focus !== "rack-focus") return subject;
    const near = stage.nearPoint();
    const from = near ? depthTo(camera, near) : subject * 0.35;
    return THREE.MathUtils.lerp(from, subject, smooth(0.25, 0.7, progress));
  }

  function focusUniforms(progress: number, pose: RigPose, second: RigPose | null) {
    const near = stage.nearPoint();
    const depth = {
      aperture: 2.2,
      maxBlur: 9,
      focusDistance: focusDistance(shot, pose, progress),
      focusDistanceB: second ? focusDistance(shotB, second, progress) : 0,
      focusNear: near ? depthTo(shot, near) : 1
    };
    switch (channels.focus) {
      case "shallow-focus":
      case "rack-focus":
        return { ...depth, focusMode: FOCUS.depth };
      case "split-diopter":
        return { ...depth, focusMode: FOCUS.diopter };
      case "tilt-shift":
        return { ...depth, focusMode: FOCUS.tilt, maxBlur: 7 };
      case "soft-focus":
        return { ...depth, focusMode: FOCUS.soft };
      default:
        return { ...depth, focusMode: FOCUS.none, aperture: 0 };
    }
  }

  /** The same shot swung around the subject and pulled back: split screen's and double exposure's second view. */
  function orbitView(pose: RigPose, degrees: number, scale = 1): RigPose {
    const [px, py, pz] = pose.position;
    const [tx, , tz] = pose.target;
    const [dx, dz] = [px - tx, pz - tz];
    const angle = (degrees * Math.PI) / 180;
    const [cos, sin] = [Math.cos(angle), Math.sin(angle)];
    return { ...pose, position: [tx + (dx * cos - dz * sin) * scale, py, tz + (dx * sin + dz * cos) * scale] };
  }

  /**
   * The one second render the look pass can mix in, by priority: split
   * screen's other view, then the dissolve's next shot, then the double
   * exposure's second view. `combinationNotes` explains the losers.
   */
  function secondShot(pose: RigPose, progress: number, mix: number): { pose: RigPose; use: "split" | "dissolve" | "double" } | null {
    if (channels.format === "split-screen") return { pose: orbitView(pose, -90), use: "split" };
    if (mix > 0) return { pose: cameraPose(selected, progress, "after"), use: "dissolve" };
    if (channels.fx === "double") return { pose: orbitView(pose, 150, 1.5), use: "double" };
    return null;
  }

  function renderInset() {
    const width = Math.round(size.width * INSET.width);
    const height = Math.round((width * 9) / 16);
    const margin = Math.round(size.width * INSET.right);
    const x = insetOnLeft(selected) ? margin : Math.round(size.width) - margin - width;
    const y = size.height - Math.round(size.height * INSET.top) - height;
    renderer.setScissorTest(true);
    renderer.setScissor(x, y, width, height);
    renderer.setViewport(x, y, width, height);
    diagram.aspect = width / height;
    diagram.updateProjectionMatrix();
    scene.background = null;
    renderer.render(scene, diagram);
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, size.width, size.height);
  }

  function render(pose: RigPose, progress: number, now: number) {
    if (!visible || disposed) return;
    renderer.shadowMap.needsUpdate = true;
    if (view === "diagram") {
      scene.background = null;
      renderer.setRenderTarget(null);
      diagram.aspect = size.width / size.height;
      diagram.updateProjectionMatrix();
      renderer.render(scene, diagram);
      return;
    }
    const dissolve = channels.transition === "dissolve";
    const first = dissolve ? cameraPose(selected, progress, "before") : pose;
    orient(shot, first, true);
    frameShot(shot);
    scene.background = sky;
    renderer.setRenderTarget(look.shotA);
    renderer.render(scene, shot);
    const mix = dissolve && channels.format !== "split-screen" ? smooth(0.35, 0.65, progress) : 0;
    const second = secondShot(pose, progress, mix);
    if (second) {
      orient(shotB, second.pose, true);
      shotB.fov = shot.fov;
      frameShot(shotB);
      renderer.setRenderTarget(look.shotB);
      renderer.render(scene, shotB);
    }
    renderer.setRenderTarget(null);
    const uniforms: LookUniforms = {
      ...focusUniforms(progress, first, second?.pose ?? null),
      barrel: channels.lens === "fisheye" ? 0.55 : channels.rig === "security-camera" ? 0.22 : 0,
      flare: channels.lens === "anamorphic" ? 1 : 0,
      mix,
      split: second?.use === "split" ? 1 : 0,
      double: second?.use === "double" ? 1 : 0,
      fade: channels.transition === "fade-black" ? smooth(0.6, 0.9, progress) : 0,
      whip: channels.transition === "whip-pan" ? Math.max(0, 1 - Math.abs(progress - 0.5) / 0.07) * 0.09 : 0,
      trail: channels.shutter === "motion-blur" && !reducedMotion ? 0.62 : 0,
      grade: channels.grade ? GRADE_CODES[channels.grade] : GRADE.none,
      format: (channels.format && FORMAT_CODES[channels.format]) || FORMAT.none,
      letterbox: channels.format === "letterbox" ? 1 : 0,
      media: channels.media ? MEDIA_CODES[channels.media] : MEDIA.none,
      time: now / 1000
    };
    look.render(uniforms, shot);
    renderInset();
  }

  function renderAt(raw: number, now: number) {
    lastRaw = raw;
    const progress = warpProgress(channels.shutter, raw);
    const pose = cameraPose(selected, progress);
    orient(rig, pose, false);
    subject.rotation.y = pose.subjectRotation;
    const positions = sight.geometry.getAttribute("position") as THREE.BufferAttribute;
    positions.setXYZ(0, ...pose.position);
    positions.setXYZ(1, ...pose.target);
    positions.needsUpdate = true;
    sight.geometry.computeBoundingSphere();
    // Update the dash distances in place: Line.computeLineDistances() allocates a new attribute,
    // and the replaced one's GL buffer is never freed, so calling it per frame leaks.
    const dashes = sight.geometry.getAttribute("lineDistance") as THREE.BufferAttribute;
    dashes.setX(1, Math.hypot(...pose.position.map((value, axis) => value - pose.target[axis])));
    dashes.needsUpdate = true;
    placeKey(progress);
    fx.update(progress, now);
    stage.update(progress, (progress * SHOT_MS) / 1000, channels.transition);
    render(pose, progress, now);
  }

  function tick(now: number) {
    if (!started) started = now;
    const span = duration + REST_MS;
    const index = Math.floor((now - started) / span);
    if (index !== cycle) {
      cycle = index;
      look.resetTrail();
    }
    let raw = Math.min(1, ((now - started) % span) / duration);
    // Stop-motion steps at twelve frames a second, Super 8 at eighteen.
    if (stepMs) raw = (Math.floor((raw * duration) / stepMs) * stepMs) / duration;
    renderAt(raw, now);
    frame = requestAnimationFrame(tick);
  }

  function stop() {
    cancelAnimationFrame(frame);
    frame = 0;
  }

  /** One useful still when motion is reduced: after the cut, mid-dissolve, or the end of the move. */
  function stillProgress() {
    if (channels.transition === "dissolve" || channels.shutter === "freeze-frame") return 0.5;
    if (channels.transition === "fade-black") return 0.78;
    if (channels.transition) return 0.75;
    return 1;
  }

  function start() {
    stop();
    started = 0;
    cycle = -1;
    look.resetTrail();
    if (reducedMotion) renderAt(stillProgress(), 0);
    else if (visible) frame = requestAnimationFrame(tick);
  }

  function resize() {
    const bounds = canvas.getBoundingClientRect();
    if (!bounds.width || !bounds.height || disposed) return;
    size.width = bounds.width;
    size.height = bounds.height;
    renderer.setSize(bounds.width, bounds.height, false);
    look.setSize(bounds.width, bounds.height);
    renderAt(lastRaw, performance.now());
  }
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);

  return {
    play(selection: CameraSelection, reduced = false) {
      selected = selection;
      channels = previewChannels(selection);
      reducedMotion = reduced;
      duration = SHOT_MS / channels.rate;
      stepMs = channels.media === "claymation" ? 83 : channels.format === "super-8" ? 55 : 0;
      shot.fov = channels.fov;
      setFrustum(channels.fov, Boolean(channels.lens), channels.geometry.frame);
      applyLighting();
      fx.apply(channels.fx, channels.media, channels.transition === "morph-cut");
      stage.apply(selection);
      const points = cameraPath(selection);
      path.geometry.dispose();
      path.geometry = new THREE.BufferGeometry().setFromPoints(points.map((point) => new THREE.Vector3(...point)));
      const reach = Math.max(...points.map((point) => Math.hypot(...point)).filter((distance) => distance < 14), 0);
      const scale = Math.max(1, reach / 3.5);
      diagram.position.set(6.5 * scale, 4.7 * scale, 7.4 * scale);
      diagram.lookAt(0, 1.1, 0);
      lastRaw = reduced ? stillProgress() : 0;
      resize();
      start();
    },
    setView(next: PreviewView) {
      view = next;
      look.resetTrail();
      if (!frame) renderAt(lastRaw, performance.now());
    },
    setVisible(next: boolean) {
      visible = next;
      stop();
      if (visible && !reducedMotion) frame = requestAnimationFrame(tick);
      else if (visible) renderAt(lastRaw, 0);
    },
    /** Frees the scene; `keepRenderer` hands the canvas's renderer to the next scene (a theme rebuild). */
    dispose({ keepRenderer = false }: { keepRenderer?: boolean } = {}) {
      disposed = true;
      stop();
      observer.disconnect();
      fx.dispose();
      stage.dispose();
      look.dispose();
      // The shadow map is a render target the light owns; renderer.dispose() does not free it.
      key.shadow.dispose();
      sky?.dispose();
      disposeTree(scene);
      if (keepRenderer) return;
      renderer.dispose();
      renderers.delete(canvas);
    }
  };
}
