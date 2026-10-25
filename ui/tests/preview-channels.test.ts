import { describe, expect, it } from "vitest";
import { emptyCameraSelection, type CameraSelection } from "@/lib/camera-language";
import { MATCH_MOON, cameraPose } from "@/lib/camera-paths";
import { DEFAULT_FOV, geometryPose, lensReach, previewChannels, warpProgress } from "@/lib/preview-channels";

const pick = (choice: Partial<CameraSelection>) => ({ ...emptyCameraSelection, ...choice }) as CameraSelection;

describe("preview channels", () => {
  it("keeps format, grade and animation in separate channels", () => {
    const channels = previewChannels(pick({ format: "vhs", "art-direction": "teal-orange", animation: "anime" }));
    expect(channels.format).toBe("vhs");
    expect(channels.grade).toBe("teal-orange");
    expect(channels.media).toBe("anime");
  });

  it("merges pose hints from the camera sections only", () => {
    const pose = geometryPose(pick({ "shot-sizes": "close-up", lenses: "telephoto", format: "vhs", vfx: "hologram" }));
    expect(pose).toEqual({ distance: 1.3, targetY: 1.4 });
  });

  it("reads lens, light and speed from their own sections", () => {
    const channels = previewChannels(pick({ lenses: "lens-85mm", lighting: "neon", shutter: "slow-motion" }));
    expect(channels.fov).toBe(16);
    expect(channels.light?.color).toBe("#ff4fd8");
    expect(channels.rate).toBe(0.35);
    expect(previewChannels(emptyCameraSelection).fov).toBe(DEFAULT_FOV);
  });

  it("plays freezes and ramps at real speed and warps their time instead", () => {
    expect(previewChannels(pick({ shutter: "freeze-frame" })).rate).toBe(1);
    expect(previewChannels(pick({ shutter: "speed-ramp" })).rate).toBe(1);
    expect(warpProgress("freeze-frame", 0.3)).toBe(0.3);
    expect(warpProgress("freeze-frame", 0.9)).toBe(0.5);
    const ramp = [0, 0.3, 0.6, 0.8, 1].map((value) => warpProgress("speed-ramp", value));
    expect(ramp[0]).toBe(0);
    expect(ramp[4]).toBeCloseTo(1);
    // A third of the speed during the slow part, then real time.
    const slow = ramp[1] / 0.3;
    const fast = (ramp[4] - ramp[3]) / 0.2;
    expect(slow / fast).toBeCloseTo(1 / 3);
    expect(ramp.every((value, index) => index === 0 || value > ramp[index - 1])).toBe(true);
    expect(warpProgress(null, 0.4)).toBe(0.4);
  });

  it("backs a long lens away and brings a wide lens close, keeping the default lens in place", () => {
    expect(lensReach(DEFAULT_FOV)).toBeCloseTo(1);
    expect(lensReach(16)).toBeGreaterThan(lensReach(27));
    expect(lensReach(81)).toBeLessThan(lensReach(53));
    expect(lensReach(100)).toBe(lensReach(81));
    expect(lensReach(7)).toBeLessThanOrEqual(6);
  });
});

describe("camera pose for the shot view", () => {
  const distance = (selection: CameraSelection) => Math.hypot(...cameraPose(selection, 0).position.map((value, axis) => value - [0, 0.9, 0][axis]));

  it("puts thirds in the frame, not by orbiting the subject", () => {
    expect(cameraPose(pick({ composition: "rule-of-thirds" }), 0)).toEqual(cameraPose(emptyCameraSelection, 0));
    expect(geometryPose(pick({ composition: "rule-of-thirds" })).frame).toEqual([-1 / 3, 0]);
  });

  it("moves the camera with the lens so the framing holds", () => {
    expect(distance(pick({ lenses: "lens-85mm" }))).toBeGreaterThan(distance(emptyCameraSelection) * 2);
    expect(distance(pick({ lenses: "lens-14mm" }))).toBeLessThan(distance(emptyCameraSelection) * 0.5);
  });

  it("poses both sides of a dissolve, and the match cut lands on the moon", () => {
    const dissolve = pick({ transitions: "dissolve" });
    expect(cameraPose(dissolve, 0.5, "before").position).not.toEqual(cameraPose(dissolve, 0.5, "after").position);
    const match = pick({ transitions: "match-cut" });
    expect(cameraPose(match, 0.2)).toEqual(cameraPose(match, 0.2, "before"));
    const after = cameraPose(match, 0.8);
    const toMoon = Math.hypot(...after.position.map((value, axis) => value - MATCH_MOON.center[axis]));
    expect(toMoon).toBeGreaterThan(3);
    expect(after.target[0]).toBeCloseTo(MATCH_MOON.center[0]);
  });
});
