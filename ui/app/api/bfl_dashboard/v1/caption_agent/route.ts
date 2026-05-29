import { execFileSync, spawn } from "node:child_process";
import { closeSync, existsSync, openSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CaptionItem = {
  name?: string;
  fileName?: string;
  imageDataUrl?: string;
  caption?: string;
};

type CaptionCollection = {
  name?: string;
  triggerToken?: string;
  captionGuide?: string;
  items?: CaptionItem[];
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function imageExtension(item: CaptionItem, mimeType: string) {
  const fromName = item.fileName?.split(".").pop()?.toLowerCase();
  if (fromName && ["png", "jpg", "jpeg", "webp"].includes(fromName)) return fromName === "jpeg" ? "jpg" : fromName;
  if (mimeType.includes("png")) return "png";
  if (mimeType.includes("webp")) return "webp";
  return "jpg";
}

function dataUrlToBuffer(dataUrl: string) {
  const match = dataUrl.match(/^data:([^;,]+)(;base64)?,(.*)$/);
  if (!match) throw new Error("Image must be a data URL");
  const mimeType = match[1] || "image/png";
  const payload = match[3] || "";
  const buffer = match[2] ? Buffer.from(payload, "base64") : Buffer.from(decodeURIComponent(payload), "utf8");
  return { buffer, mimeType };
}

function captionPrompt(options: {
  collectionName: string;
  triggerToken: string;
  captionGuide: string;
  jobDir: string;
  itemCount: number;
}) {
  return `You are captioning a BFL FLUX LoRA training collection.

Working folder:
${options.jobDir}

Collection: ${options.collectionName}
Trigger token: ${options.triggerToken}
Image count: ${options.itemCount}

Caption rules:
${options.captionGuide}

Additional rules adapted from the existing BFL captioning pipeline:
- Caption only visible content in each image.
- Do not mention artist names, model names, software, camera brands, filenames, watermarks, or prompt-like quality hype.
- Keep each caption natural and training-friendly, not a comma-only tag soup.
- Prefer one sentence, roughly 20-70 words.
- Each caption must start with the trigger token: ${options.triggerToken}
- Keep captions specific: botanical anatomy, material, color relationships, pose/composition, background, and lighting.
- Do not invent details that are not visible.

Task:
1. Inspect the images in ./images.
2. Write one caption file for every image in ./captions.
3. Each caption filename must match the image stem exactly, with .txt extension.
4. Update ./manifest.json by adding finalCaption for each item when you finish.
5. Leave all image files unchanged.

Return a short summary with the count captioned and any images that were ambiguous.`;
}

function resolveCodexBin() {
  if (existsSync("/Users/radek/bin/codex")) return "/Users/radek/bin/codex";
  try {
    return execFileSync("which", ["codex"], { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const collection = body?.collection as CaptionCollection | undefined;
  const dryRun = Boolean(body?.dryRun);
  const items = (collection?.items || []).filter((item) => item.imageDataUrl).slice(0, 40);

  if (!collection || !items.length) {
    return NextResponse.json({ error: "Caption agent requires a collection with images" }, { status: 400 });
  }

  const now = new Date();
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  const collectionName = collection.name || "BFL training collection";
  const triggerToken = collection.triggerToken || "bfl_cyberflower";
  const rootDir = path.resolve(process.cwd(), "..", "outputs", "bfl-api-dashboard", "caption-jobs");
  const jobDir = path.join(rootDir, `${stamp}_${slugify(collectionName) || "collection"}`);
  const imageDir = path.join(jobDir, "images");
  const captionsDir = path.join(jobDir, "captions");
  await mkdir(imageDir, { recursive: true });
  await mkdir(captionsDir, { recursive: true });

  const manifestItems = [];
  const imagePaths: string[] = [];

  for (const [index, item] of items.entries()) {
    const { buffer, mimeType } = dataUrlToBuffer(item.imageDataUrl || "");
    const number = String(index + 1).padStart(2, "0");
    const baseName = `${number}_${slugify(item.name || item.fileName || "image") || "image"}`;
    const imageName = `${baseName}.${imageExtension(item, mimeType)}`;
    const captionName = `${baseName}.txt`;
    const imagePath = path.join(imageDir, imageName);
    const captionPath = path.join(captionsDir, captionName);
    await writeFile(imagePath, buffer);
    await writeFile(captionPath, item.caption || `${triggerToken}, `, "utf8");
    imagePaths.push(imagePath);
    manifestItems.push({
      index: index + 1,
      name: item.name || imageName,
      image: `images/${imageName}`,
      caption: `captions/${captionName}`,
      startingCaption: item.caption || ""
    });
  }

  const prompt = captionPrompt({
    collectionName,
    triggerToken,
    captionGuide: collection.captionGuide || "",
    jobDir,
    itemCount: manifestItems.length
  });
  const manifestPath = path.join(jobDir, "manifest.json");
  const promptPath = path.join(jobDir, "codex_caption_prompt.md");
  const resultPath = path.join(jobDir, "codex_caption_result.md");
  const stdoutPath = path.join(jobDir, "codex_stdout.log");
  const stderrPath = path.join(jobDir, "codex_stderr.log");
  await writeFile(manifestPath, JSON.stringify({ collectionName, triggerToken, items: manifestItems }, null, 2), "utf8");
  await writeFile(promptPath, prompt, "utf8");

  const codexBin = resolveCodexBin();
  const args = [
    "exec",
    "-C",
    jobDir,
    "--add-dir",
    jobDir,
    "--sandbox",
    "workspace-write",
    "--ask-for-approval",
    "never",
    "-o",
    resultPath,
    ...imagePaths.flatMap((imagePath) => ["--image", imagePath]),
    prompt
  ];
  const command = [codexBin || "codex", ...args];

  if (dryRun) {
    return NextResponse.json({ ok: true, mode: "dry-run", jobDir, promptPath, resultPath, command });
  }

  if (!codexBin) {
    return NextResponse.json({
      ok: true,
      mode: "prepared",
      jobDir,
      promptPath,
      resultPath,
      command,
      imageCount: imagePaths.length,
      note: "Codex CLI was not found on PATH, so the job folder and exact command were prepared without spawning."
    });
  }

  const stdout = openSync(stdoutPath, "a");
  const stderr = openSync(stderrPath, "a");
  try {
    const child = spawn(codexBin, args, {
      cwd: jobDir,
      detached: true,
      stdio: ["ignore", stdout, stderr],
      env: process.env
    });
    child.unref();
    return NextResponse.json({
      ok: true,
      mode: "spawned",
      pid: child.pid,
      jobDir,
      promptPath,
      resultPath,
      stdoutPath,
      stderrPath,
      command,
      imageCount: imagePaths.length
    });
  } finally {
    closeSync(stdout);
    closeSync(stderr);
  }
}
