import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { OUTPUT_ROOT } from "./server-output-store";
import { RECIPE_FIELDS, type GenerationRecipe } from "./generation-recipe";

export function recipeRoot() { return process.env.BFL_RECIPE_DIR || path.join(OUTPUT_ROOT, ".generation-recipes"); }
const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const recipePath = (id: string) => path.join(recipeRoot(), `${hash(id)}.recipe`);
const MEDIA_KEYS = /^(references|keyframes|timedKeyframes|startVideo|inputVideo|image|mask|garment|garments|value)$/;

function mediaType(buffer: Buffer) {
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return "jpg";
  if (buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return "png";
  if (buffer.subarray(8,12).toString() === "WEBP") return "webp";
  if (buffer.subarray(0,3).toString() === "GIF") return "gif";
  if (buffer.subarray(4,8).toString() === "ftyp") return "mp4";
  return null;
}

export async function saveGenerationRecipe(id: string, kind: GenerationRecipe["kind"], operation: string, body: Record<string, unknown>) {
  const directory = recipeRoot();
  await mkdir(path.join(directory, "media"), { recursive: true });
  async function persist(value: unknown, key: string): Promise<unknown> {
    if (Array.isArray(value)) return Promise.all(value.map(item => persist(item, key)));
    if (value && typeof value === "object") {
      // Only reference metadata has nested objects in these request fields.
      const fields = ["id", "name", "role", "targetId", "assetId", "value"];
      return Object.fromEntries(await Promise.all(Object.entries(value).filter(([name]) => fields.includes(name))
        .map(async ([name, child]) => [name, await persist(child, name)])));
    }
    if (typeof value !== "string" || !MEDIA_KEYS.test(key)) return value;
    if (/^(\/|https?:\/\/)/.test(value) || value.startsWith("[")) return value;
    const encoded = value.match(/^data:(?:image|video)\/[^;,]+;base64,([\s\S]+)$/)?.[1] || value;
    if (!/^[A-Za-z0-9+/=\s]+$/.test(encoded)) return "";
    const buffer = Buffer.from(encoded, "base64");
    const extension = mediaType(buffer);
    if (!extension) return "";
    const file = `${hash(buffer)}.${extension}`;
    await writeFile(path.join(directory, "media", file), buffer);
    return `/api/outputs/recreate/media/${file}`;
  }
  const safeBody = Object.fromEntries(await Promise.all(RECIPE_FIELDS.filter(key => body[key] !== undefined)
    .map(async key => [key, await persist(body[key], key)])));
  const target = recipePath(id), temporary = `${target}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify({ version: 1, kind, operation, body: safeBody } satisfies GenerationRecipe));
  await rename(temporary, target);
}

export async function readGenerationRecipe(id: string): Promise<GenerationRecipe | null> {
  try { return JSON.parse(await readFile(recipePath(id), "utf8")); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
}

export async function readRecipeMedia(file: string) {
  if (!/^[a-f0-9]{64}\.(png|jpg|webp|gif|mp4)$/.test(file)) return null;
  const types: Record<string, string> = { png:"image/png", jpg:"image/jpeg", webp:"image/webp", gif:"image/gif", mp4:"video/mp4" };
  try { return { buffer: await readFile(path.join(recipeRoot(), "media", file)), type: types[file.split(".")[1]] }; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
}
