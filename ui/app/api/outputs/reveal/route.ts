import { execFile } from "node:child_process";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { findLocalOutputImage } from "@/lib/server-output-store";
import { findFlux3VideoOutput } from "@/lib/flux3-video-server";
import { findVideoUpscaleOutput } from "@/lib/video-upscale-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Every revealable artifact lives under the shared outputs workspace. The id is
// only ever a lookup key into the known roots — a client can never supply a
// path — and this boundary check is the belt to that suspenders.
const OUTPUTS_BOUNDARY = path.resolve(process.cwd(), "..", "outputs");

function revealCommand(filePath: string) {
  if (process.platform === "darwin") return { command: "open", args: ["-R", filePath], strict: true };
  // Explorer exits non-zero even on success, so its errors are advisory only.
  if (process.platform === "win32") return { command: "explorer", args: [`/select,${filePath}`], strict: false };
  return { command: "xdg-open", args: [path.dirname(filePath)], strict: true };
}

function runReveal(command: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    execFile(command, args, (error) => (error ? reject(error) : resolve()));
  });
}

async function resolveLocalFile(id: string) {
  const image = await findLocalOutputImage(id).catch(() => null);
  if (image?.imagePath) return image.imagePath;
  const video = await findFlux3VideoOutput(id).catch(() => null);
  if (video?.filePath) return video.filePath;
  const upscale = await findVideoUpscaleOutput(id).catch(() => null);
  if (upscale?.filePath) return upscale.filePath;
  return null;
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const id = typeof body?.id === "string" ? body.id.trim() : "";
  if (!id) return NextResponse.json({ error: "Provide the asset id to reveal." }, { status: 400 });

  const filePath = await resolveLocalFile(id);
  if (!filePath) {
    return NextResponse.json(
      { error: "No local file exists for this asset. Browser-imported and remote-only assets have nothing on disk." },
      { status: 404 }
    );
  }

  const resolved = path.resolve(filePath);
  if (resolved !== OUTPUTS_BOUNDARY && !resolved.startsWith(OUTPUTS_BOUNDARY + path.sep)) {
    return NextResponse.json({ error: "Refusing to reveal a file outside the outputs workspace." }, { status: 400 });
  }

  const { command, args, strict } = revealCommand(resolved);
  try {
    await runReveal(command, args);
  } catch (error) {
    if (strict) {
      const message = error instanceof Error ? error.message : "Could not open the file manager.";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }
  return NextResponse.json({ ok: true, fileName: path.basename(resolved) });
}
