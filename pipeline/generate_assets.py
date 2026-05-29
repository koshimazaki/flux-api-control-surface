"""
Generate/download BFL source images for the LTX anchor image pool.

Uses the public BFL async API when BFL_API_KEY is set. With --dry-run it writes
the exact request manifest without spending credits.
"""

from __future__ import annotations

import argparse
import json
import os
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any


DEFAULT_API_BASE = "https://api.bfl.ai/v1"
MODEL_ENDPOINTS = {
    "max": "flux-2-max",
    "pro-preview": "flux-2-pro-preview",
    "pro": "flux-2-pro",
    "flex": "flux-2-flex",
    "klein-4b": "flux-2-klein-4b",
    "klein-9b-preview": "flux-2-klein-9b-preview",
    "klein-9b": "flux-2-klein-9b",
    "klein-9b-finetuned": "flux-2-klein-9b-kv-finetuned",
}
DEFAULT_MODEL = "pro-preview"
READY_STATUSES = {"Ready"}
FAILED_STATUSES = {"Error", "Failed"}


def http_json(method: str, url: str, api_key: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=data,
        method=method,
        headers={
            "accept": "application/json",
            "x-key": api_key,
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"BFL API error {exc.code}: {body}") from exc


def download_file(url: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    with urllib.request.urlopen(url, timeout=120) as response:
        dest.write_bytes(response.read())


def load_env_file(path: Path) -> None:
    if not path.exists():
        raise FileNotFoundError(f"Env file not found: {path}")
    for raw_line in path.read_text().splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[len("export ") :].strip()
        if "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip("'\"")
        if key and key not in os.environ:
            os.environ[key] = value


def resolve_endpoint(model: str | None, endpoint: str | None, api_base: str, finetune_id: str | None) -> tuple[str, str]:
    if endpoint:
        endpoint_name = endpoint.rsplit("/", 1)[-1]
        if endpoint.startswith("http://") or endpoint.startswith("https://"):
            return endpoint, endpoint_name
        return f"{api_base.rstrip('/')}/{endpoint.lstrip('/')}", endpoint_name

    resolved_model = model or DEFAULT_MODEL
    if finetune_id and resolved_model == DEFAULT_MODEL:
        resolved_model = "klein-9b-finetuned"
    if resolved_model not in MODEL_ENDPOINTS:
        allowed = ", ".join(sorted(MODEL_ENDPOINTS))
        raise ValueError(f"Unknown --model {resolved_model!r}. Allowed models: {allowed}")
    endpoint_name = MODEL_ENDPOINTS[resolved_model]
    return f"{api_base.rstrip('/')}/{endpoint_name}", endpoint_name


def submit_generation(
    prompt: str,
    seed: int | None,
    width: int,
    height: int,
    endpoint: str,
    api_key: str,
    output_format: str = "jpeg",
    prompt_upsampling: bool = False,
    safety_tolerance: int | None = None,
    finetune_id: str | None = None,
    finetune_strength: float | None = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "prompt": prompt,
        "width": width,
        "height": height,
        "output_format": output_format,
    }
    if seed is not None:
        payload["seed"] = seed
    if prompt_upsampling:
        payload["prompt_upsampling"] = True
    if safety_tolerance is not None:
        payload["safety_tolerance"] = safety_tolerance
    if finetune_id:
        payload["finetune_id"] = finetune_id
        if finetune_strength is not None:
            payload["finetune_strength"] = finetune_strength
    return http_json("POST", endpoint, api_key, payload)


def poll_result(polling_url: str, api_key: str, poll_interval: float = 0.75, timeout_sec: int = 300) -> dict[str, Any]:
    deadline = time.time() + timeout_sec
    while time.time() < deadline:
        result = http_json("GET", polling_url, api_key)
        status = result.get("status")
        if status in READY_STATUSES:
            return result
        if status in FAILED_STATUSES:
            raise RuntimeError(f"BFL generation failed: {json.dumps(result, indent=2)}")
        time.sleep(poll_interval)
    raise TimeoutError(f"Timed out waiting for BFL result: {polling_url}")


def load_prompt_plan(path: Path) -> list[dict[str, Any]]:
    payload = json.loads(path.read_text())
    if not isinstance(payload, list):
        raise ValueError("Prompt plan must be a JSON list")
    for item in payload:
        if "id" not in item or "prompt" not in item:
            raise ValueError("Each prompt item needs at least id and prompt")
    return payload


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--prompts", type=Path, default=Path("BFL/configs/organic_anchor_prompts.json"))
    parser.add_argument("--out", type=Path, default=Path("outputs/bfl/organic_anchors"))
    parser.add_argument("--model", choices=sorted(MODEL_ENDPOINTS), default=None)
    parser.add_argument("--endpoint", default=None, help="Full endpoint URL or endpoint slug; overrides --model")
    parser.add_argument("--api-base", default=DEFAULT_API_BASE)
    parser.add_argument("--env-file", type=Path, default=None, help="Optional .env file containing BFL_API_KEY")
    parser.add_argument("--width", type=int, default=1024)
    parser.add_argument("--height", type=int, default=1024)
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--output-format", choices=["jpeg", "png"], default="jpeg")
    parser.add_argument("--prompt-upsampling", action="store_true")
    parser.add_argument("--safety-tolerance", type=int, default=None)
    parser.add_argument("--poll-interval", type=float, default=0.75)
    parser.add_argument("--timeout-sec", type=int, default=300)
    parser.add_argument("--skip-existing", action="store_true")
    parser.add_argument("--finetune-id", default=None, help="Uploaded BFL Finetune / LoRA id")
    parser.add_argument("--finetune-strength", type=float, default=1.0)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    if args.env_file:
        load_env_file(args.env_file)

    endpoint, endpoint_name = resolve_endpoint(
        model=args.model,
        endpoint=args.endpoint,
        api_base=args.api_base,
        finetune_id=args.finetune_id,
    )
    if args.finetune_id and "finetuned" not in endpoint_name:
        raise ValueError("--finetune-id requires a BFL -finetuned endpoint")
    if args.prompt_upsampling and "klein" in endpoint_name:
        raise ValueError("FLUX.2 [klein] endpoints do not support prompt upsampling; remove --prompt-upsampling")

    plan = load_prompt_plan(args.prompts)
    if args.limit:
        plan = plan[: args.limit]

    manifest: list[dict[str, Any]] = []
    api_key = os.environ.get("BFL_API_KEY")
    if not api_key and not args.dry_run:
        raise RuntimeError("Set BFL_API_KEY or run with --dry-run")

    for item in plan:
        image_ext = "jpg" if args.output_format == "jpeg" else "png"
        image_path = args.out / item.get("domain", "mixed") / f"{item['id']}.{image_ext}"
        request_payload = {
            "prompt": item["prompt"],
            "seed": item.get("seed"),
            "width": args.width,
            "height": args.height,
            "endpoint": endpoint,
            "endpoint_name": endpoint_name,
            "output_format": args.output_format,
        }
        if args.prompt_upsampling:
            request_payload["prompt_upsampling"] = True
        if args.safety_tolerance is not None:
            request_payload["safety_tolerance"] = args.safety_tolerance
        if args.finetune_id:
            request_payload["finetune_id"] = args.finetune_id
            request_payload["finetune_strength"] = args.finetune_strength

        record = {
            "id": item["id"],
            "domain": item.get("domain"),
            "prompt": item["prompt"],
            "seed": item.get("seed"),
            "image_path": str(image_path.resolve()),
            "request": request_payload,
        }
        metadata = {key: value for key, value in item.items() if key not in {"id", "domain", "prompt", "seed"}}
        if metadata:
            record["metadata"] = metadata

        if args.dry_run:
            record["status"] = "planned"
        elif args.skip_existing and image_path.exists():
            record["status"] = "skipped_existing"
        else:
            assert api_key is not None
            submitted = submit_generation(
                prompt=item["prompt"],
                seed=item.get("seed"),
                width=args.width,
                height=args.height,
                endpoint=endpoint,
                api_key=api_key,
                output_format=args.output_format,
                prompt_upsampling=args.prompt_upsampling,
                safety_tolerance=args.safety_tolerance,
                finetune_id=args.finetune_id,
                finetune_strength=args.finetune_strength,
            )
            result = poll_result(
                submitted["polling_url"],
                api_key=api_key,
                poll_interval=args.poll_interval,
                timeout_sec=args.timeout_sec,
            )
            sample_url = result["result"]["sample"]
            download_file(sample_url, image_path)
            record["status"] = "downloaded"
            record["request_id"] = submitted.get("id")
            record["polling_url"] = submitted.get("polling_url")

        manifest.append(record)
        print(f"{record['status']}: {item['id']} -> {image_path}")

    args.out.mkdir(parents=True, exist_ok=True)
    manifest_path = args.out / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2))
    print(f"manifest -> {manifest_path}")


if __name__ == "__main__":
    main()
