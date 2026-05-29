"""Caption GlitchHunter images with Gemini for Klein LoRA curation.

Defaults are wired to:
  BFL/datasets/Flux.1/GlitchHunter/flux_gen2/gen1
  BFL/datasets/Flux.1/GlitchHunter/flux_gen2/gen2

Captions are written to a review folder by default. Use --write-next-to-images
only after you are ready to create paired image.txt files for training.
"""

from __future__ import annotations

import argparse
import json
import mimetypes
import os
import re
import time
from pathlib import Path
from typing import Any


IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".webp"}
STYLE_TOKENS = {"GH_3D", "GH_25D", "GH_2D"}
FORBIDDEN_STYLE_WORDS = [
    "3d",
    "2d",
    "2.5d",
    "comic",
    "cyberpunk",
    "neon",
    "designer toy",
    "zbrush",
    "ghibli",
    "cinematic",
    "generative art",
    "render",
    "illustration",
    "artwork",
]


PROMPT = """You are captioning one image for a FLUX.2 Klein style LoRA dataset.

Return strict JSON only:
{
  "style_token": "GH_3D or GH_25D or GH_2D",
  "caption": "GLITCHHUNTER <style_token>. <caption text>"
}

Rules:
- Start caption exactly with GLITCHHUNTER followed by one style token.
- Use GH_3D for sculptural, physical, volumetric forms.
- Use GH_25D for toon-shaded, semi-rendered, hybrid dimensional forms.
- Use GH_2D for flat drawn, graphic, painted, or line-art dominant forms.
- If uncertain, use GH_25D.
- Do not use these generic style words in the caption: 3D, 2D, 2.5D, comic, cyberpunk, neon, designer toy, ZBrush, Ghibli, cinematic, generative art, render, illustration, artwork.
- Describe only visible content: creature anatomy, head shape, limbs, horns, eyes, body materials, surrounding objects, pose, composition, background elements, color relationships, and mood.
- Do not mention artist names, model names, software, camera brands, quality words, or prompt-like hype.
- Keep the caption 35-80 words.
- Use natural sentences, not tag lists.
- Do not invent details that are not visible.

Filename: {filename}
"""


def image_paths(root: Path) -> list[Path]:
    return sorted(
        [p for p in root.iterdir() if p.is_file() and p.suffix.lower() in IMAGE_EXTS],
        key=lambda p: natural_key(p.name),
    )


def natural_key(text: str) -> list[Any]:
    return [int(part) if part.isdigit() else part.lower() for part in re.split(r"(\d+)", text)]


def strip_json_fence(text: str) -> str:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.IGNORECASE)
        text = re.sub(r"\s*```$", "", text)
    return text.strip()


def parse_response(text: str) -> dict[str, str]:
    cleaned = strip_json_fence(text)
    data = json.loads(cleaned)
    style_token = str(data.get("style_token", "")).strip().upper()
    caption = str(data.get("caption", "")).strip()
    if style_token not in STYLE_TOKENS:
        style_token = "GH_25D"
    if not caption:
        raise ValueError("Gemini returned an empty caption")
    return {"style_token": style_token, "caption": normalize_caption(caption, style_token)}


def normalize_caption(caption: str, style_token: str) -> str:
    caption = re.sub(r"\s+", " ", caption).strip()
    caption = re.sub(r"^GlitchHunter\b", "GLITCHHUNTER", caption)
    expected_prefix = f"GLITCHHUNTER {style_token}."
    if not caption.startswith("GLITCHHUNTER"):
        caption = f"{expected_prefix} {caption}"
    elif not caption.startswith(expected_prefix):
        caption = re.sub(r"^GLITCHHUNTER(?:\s+GH_(?:3D|25D|2D))?\.?\s*", "", caption)
        caption = f"{expected_prefix} {caption}"
    return caption.strip()


def caption_warnings(caption: str) -> list[str]:
    lower = caption.lower()
    warnings: list[str] = []
    for word in FORBIDDEN_STYLE_WORDS:
        if re.search(rf"\b{re.escape(word)}\b", lower):
            warnings.append(f"contains generic style word: {word}")
    words = re.findall(r"\b[\w'-]+\b", caption)
    if len(words) < 35:
        warnings.append(f"short caption: {len(words)} words")
    if len(words) > 90:
        warnings.append(f"long caption: {len(words)} words")
    return warnings


def import_genai() -> tuple[Any, Any]:
    try:
        from google import genai
        from google.genai import types
    except ImportError as exc:
        raise SystemExit(
            "Missing google-genai. Install with: pip install -r BFL/requirements.txt"
        ) from exc
    return genai, types


def gemini_caption(client: Any, types_module: Any, model: str, path: Path) -> dict[str, str]:
    mime_type = mimetypes.guess_type(path.name)[0] or "image/png"
    image_bytes = path.read_bytes()
    response = client.models.generate_content(
        model=model,
        contents=[
            types_module.Part.from_bytes(data=image_bytes, mime_type=mime_type),
            PROMPT.format(filename=path.name),
        ],
        config=types_module.GenerateContentConfig(
            response_mime_type="application/json",
            temperature=0.2,
        ),
    )
    return parse_response(response.text or "")


def caption_path_for(image_path: Path, source_root: Path, output_root: Path) -> Path:
    return output_root / source_root.name / image_path.with_suffix(".txt").name


def write_jsonl(path: Path, row: dict[str, Any]) -> None:
    with path.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(row, ensure_ascii=False) + "\n")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--dataset-root",
        type=Path,
        default=Path("BFL/datasets/Flux.1/GlitchHunter/flux_gen2"),
    )
    parser.add_argument("--sets", nargs="+", default=["gen1", "gen2"])
    parser.add_argument(
        "--output-root",
        type=Path,
        default=Path("BFL/datasets/Flux.1/GlitchHunter/captions/gemini"),
    )
    parser.add_argument("--model", default="gemini-2.5-flash")
    parser.add_argument("--api-key", default=os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY"))
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--overwrite", action="store_true")
    parser.add_argument("--write-next-to-images", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--sleep", type=float, default=0.2)
    args = parser.parse_args()

    if not args.api_key and not args.dry_run:
        raise SystemExit("Set GEMINI_API_KEY or GOOGLE_API_KEY, or pass --api-key.")

    genai_module = None
    types_module = None
    client = None
    if not args.dry_run:
        genai_module, types_module = import_genai()
        client = genai_module.Client(api_key=args.api_key)
    args.output_root.mkdir(parents=True, exist_ok=True)
    manifest_path = args.output_root / "manifest.jsonl"

    total = 0
    for set_name in args.sets:
        source_root = args.dataset_root / set_name
        if not source_root.exists():
            raise SystemExit(f"Missing image folder: {source_root}")
        out_dir = args.output_root / set_name
        out_dir.mkdir(parents=True, exist_ok=True)

        for image_path in image_paths(source_root):
            if args.limit is not None and total >= args.limit:
                return
            review_caption_path = caption_path_for(image_path, source_root, args.output_root)
            paired_caption_path = image_path.with_suffix(".txt")
            target_caption_path = paired_caption_path if args.write_next_to_images else review_caption_path
            if target_caption_path.exists() and not args.overwrite:
                print(f"skip existing: {target_caption_path}")
                continue
            if args.dry_run:
                print(f"would caption: {image_path} -> {target_caption_path}")
                total += 1
                continue

            assert client is not None
            try:
                result = gemini_caption(client, types_module, args.model, image_path)
                caption = result["caption"]
                warnings = caption_warnings(caption)
                target_caption_path.parent.mkdir(parents=True, exist_ok=True)
                target_caption_path.write_text(caption + "\n", encoding="utf-8")
                if args.write_next_to_images:
                    review_caption_path.parent.mkdir(parents=True, exist_ok=True)
                    review_caption_path.write_text(caption + "\n", encoding="utf-8")
                row = {
                    "set": set_name,
                    "image": str(image_path),
                    "caption_file": str(target_caption_path),
                    "review_caption_file": str(review_caption_path),
                    "model": args.model,
                    "style_token": result["style_token"],
                    "caption": caption,
                    "warnings": warnings,
                }
                write_jsonl(manifest_path, row)
                warn_text = f" warnings={warnings}" if warnings else ""
                print(f"captioned: {image_path.name} -> {target_caption_path}{warn_text}")
            except Exception as exc:  # noqa: BLE001 - keep batch captioning moving.
                row = {
                    "set": set_name,
                    "image": str(image_path),
                    "model": args.model,
                    "error": str(exc),
                }
                write_jsonl(manifest_path, row)
                print(f"error: {image_path}: {exc}")
            total += 1
            time.sleep(args.sleep)


if __name__ == "__main__":
    main()
