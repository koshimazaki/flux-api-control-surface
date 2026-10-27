import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { readGenerationRecipe, readRecipeMedia, saveGenerationRecipe } from "@/lib/generation-recipe-store";
import { isGenerationRecipe, recipeMediaName } from "@/lib/generation-recipe";
import { resolveImageInput } from "@/lib/bfl-server";
import { resolveVideoInput } from "@/lib/video-input-server";
import { flux3Recreation } from "@/lib/asset-recreation";
import { applyCameraChoice, emptyCameraSelection } from "@/lib/camera-language";

describe("saved generation recipes", () => {
  it("round-trips PNG and raw JPEG uploads through the real image resolver", async () => {
    const image = sharp({ create: { width: 2, height: 2, channels: 3, background: "red" } });
    const png = await image.png().toBuffer(), jpg = await image.jpeg().toBuffer();
    expect(jpg.toString("base64").startsWith("/")).toBe(true);
    await saveGenerationRecipe("images", "image", "generate", {
      references: [`data:image/png;base64,${png.toString("base64")}`, jpg.toString("base64")],
      seed: 0, normalizeReferences: false, apiKey: "never-persist", requestKey: "not-a-recipe-setting"
    });
    const recipe = await readGenerationRecipe("images");
    expect(recipe?.body).toMatchObject({ seed: 0, normalizeReferences: false });
    expect(JSON.stringify(recipe)).not.toContain("never-persist");
    expect(recipe?.body).not.toHaveProperty("requestKey");
    const refs = recipe!.body.references as string[];
    expect(refs.every(value => value.startsWith("/api/outputs/recreate/media/"))).toBe(true);
    expect(await resolveImageInput(refs[0])).toBe(png.toString("base64"));
    expect(await resolveImageInput(refs[1])).toBe(jpg.toString("base64"));
    await expect(resolveVideoInput(refs[0])).rejects.toThrow(/recipe video/);
  });

  it("preserves timed-frame zero and uploaded continuation video without HTTP", async () => {
    const clip = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftypisom-original-upload")]);
    await saveGenerationRecipe("video", "video", "v2v", {
      mode: "v2v", startVideo: `data:video/mp4;base64,${clip.toString("base64")}`,
      timedKeyframes: [[0, "/api/outputs/first/image"], [4, "/api/outputs/last/image"]], generateAudio: false
    });
    const recipe = (await readGenerationRecipe("video"))!;
    expect(recipe.body.timedKeyframes).toEqual([[0, "/api/outputs/first/image"], [4, "/api/outputs/last/image"]]);
    expect(recipe.body.generateAudio).toBe(false);
    const resolved = await resolveVideoInput(recipe.body.startVideo as string);
    expect(resolved.buffer).toEqual(clip);
    expect(resolved.contentType).toBe("video/mp4");
    await expect(resolveImageInput(recipe.body.startVideo as string)).rejects.toThrow(/recipe image/);
  });

  it("retains camera choices and restores the editable scene without repeated clauses", async () => {
    const camera = { selection: { ...emptyCameraSelection, movements: "dolly-in" }, edits: {} };
    const directed = applyCameraChoice("A fox at dawn", camera);
    // Use a published selection rather than assuming a specific term ID.
    if (!directed.camera) throw new Error("Camera fixture must select a valid term");
    await saveGenerationRecipe("camera", "video", "t2v", { mode: "t2v", prompt: directed.prompt, camera });
    const restored = flux3Recreation((await readGenerationRecipe("camera"))!);
    expect(restored.prompt).toBe("A fox at dawn");
    expect(applyCameraChoice(restored.prompt, restored.camera).prompt).toBe(directed.prompt);
  });

  it("supports overlapping writes to the same asset", async () => {
    await Promise.all(["one", "two"].map(prompt => saveGenerationRecipe("same", "image", "generate", { prompt })));
    expect(["one", "two"]).toContain((await readGenerationRecipe("same"))?.body.prompt);
  });

  it("rejects malformed recipes, traversal and pointers to missing local inputs", async () => {
    expect(isGenerationRecipe({ version: 1, kind: "image", operation: "generate", body: null })).toBe(false);
    expect(isGenerationRecipe({ version: 2, kind: "image", operation: "generate", body: {} })).toBe(false);
    expect(recipeMediaName("https://other.example/api/outputs/recreate/media/" + "a".repeat(64) + ".png")).toBeNull();
    expect(await readRecipeMedia("../private.mp4")).toBeNull();
    await expect(resolveVideoInput("/api/outputs/recreate/media/" + "a".repeat(64) + ".mp4")).rejects.toThrow(/no longer available/);
    await expect(resolveImageInput("/api/outputs/recreate/media/" + "b".repeat(64) + ".png")).rejects.toThrow(/no longer available/);
  });
});
