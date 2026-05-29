"""
Build a FLUX.2 plant prompt batch from editable axes.

The output is compatible with BFL/pipeline/generate_assets.py:

    python3 BFL/pipeline/build_plant_prompt_matrix.py
    python3 BFL/pipeline/generate_assets.py \
      --prompts BFL/configs/plants_matrix_prompts.json \
      --endpoint https://api.bfl.ai/v1/flux-2-pro-preview \
      --out outputs/bfl/plants_pro

Use --variants-per-species 2 for the first "two picks per species" pass.
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any


DEFAULT_AXES = Path("BFL/configs/plant_prompt_axes.json")
DEFAULT_OUT = Path("BFL/configs/plants_matrix_prompts.json")


def slugify(value: str) -> str:
    value = value.lower()
    value = re.sub(r"[^a-z0-9]+", "_", value)
    return value.strip("_") or "plant"


def load_axes(path: Path) -> dict[str, Any]:
    axes = json.loads(path.read_text())
    required = ["species", "locations", "times_of_day", "shot_types", "lighting"]
    missing = [key for key in required if not axes.get(key)]
    if missing:
        raise ValueError(f"Missing required axes: {', '.join(missing)}")
    return axes


def normalize_species(item: str | dict[str, Any]) -> tuple[str, str]:
    if isinstance(item, str):
        return item, ""
    name = str(item.get("name", "")).strip()
    notes = str(item.get("notes", "")).strip()
    if not name:
        raise ValueError(f"Species entry is missing name: {item}")
    return name, notes


def pick(axis: list[str], species_index: int, variant_index: int, stride: int) -> str:
    return axis[(species_index * stride + variant_index) % len(axis)]


def build_prompt(
    *,
    species_name: str,
    species_notes: str,
    plant_form: str,
    location: str,
    time_of_day: str,
    shot_type: str,
    lighting: str,
    style_frame: str,
    delivery_constraints: str,
) -> str:
    details = f"{species_notes}. " if species_notes else ""
    hybrid = f"Hybridize the flower with {plant_form}. " if plant_form else ""
    return (
        f"{shot_type} of a {species_name} in a {location} at {time_of_day}. "
        f"{details}{hybrid}{style_frame}, {lighting}. "
        f"Emphasize range-ready morphology, clean silhouette, coherent petals, stems, seed pods, "
        f"and believable material transitions between living plant tissue and constructed detail. "
        f"{delivery_constraints}"
    )


def build_structured_prompt(
    *,
    species_name: str,
    species_notes: str,
    plant_form: str,
    location: str,
    time_of_day: str,
    shot_type: str,
    lighting: str,
    style_frame: str,
    delivery_constraints: str,
) -> dict[str, Any]:
    subject_description = species_name
    if species_notes:
        subject_description = f"{subject_description}; {species_notes}"
    if plant_form:
        subject_description = f"{subject_description}; hybridized with {plant_form}"

    return {
        "scene": f"{shot_type} of a single cybernetic botanical specimen",
        "subjects": [
            {
                "description": subject_description,
                "position": "centered dominant specimen, readable at thumbnail size",
                "action": "held still as a training-ready source image with recognisable plant anatomy",
            }
        ],
        "style": style_frame,
        "environment": f"{location}, {time_of_day}",
        "lighting": lighting,
        "composition": (
            "clean silhouette, coherent petals or tendrils, visible stems and seed structures, "
            "one dominant subject with stable crop margins"
        ),
        "camera": {
            "angle": "botanical macro study",
            "lens": "100mm macro lens",
            "depth_of_field": "controlled shallow depth of field with critical anatomy sharp",
        },
        "materials": (
            "believable transitions between living plant tissue, translucent membranes, wet organic texture, "
            "ceramic or metallic cybernetic detail"
        ),
        "delivery": delivery_constraints,
    }


def build_records(
    axes: dict[str, Any],
    variants_per_species: int,
    start_seed: int,
    domain: str,
    limit: int | None,
    prompt_format: str,
) -> list[dict[str, Any]]:
    style_frame = axes.get(
        "style_frame",
        "photorealistic cinematic botanical macro, plausible plant anatomy, high-frequency organic detail",
    )
    delivery_constraints = axes.get(
        "delivery_constraints",
        axes.get("negative", "clean unmarked label-free specimen image"),
    )
    locations = [str(v) for v in axes["locations"]]
    times_of_day = [str(v) for v in axes["times_of_day"]]
    shot_types = [str(v) for v in axes["shot_types"]]
    lighting = [str(v) for v in axes["lighting"]]
    plant_forms = [str(v) for v in axes.get("plant_forms", [])]

    records: list[dict[str, Any]] = []
    for species_index, species_item in enumerate(axes["species"]):
        species_name, species_notes = normalize_species(species_item)
        for variant_index in range(variants_per_species):
            location = pick(locations, species_index, variant_index, stride=3)
            time_of_day = pick(times_of_day, species_index, variant_index, stride=5)
            shot_type = pick(shot_types, species_index, variant_index, stride=2)
            light = pick(lighting, species_index, variant_index, stride=7)
            plant_form = pick(plant_forms, species_index, variant_index, stride=4) if plant_forms else ""
            suffix = variant_index + 1
            record_id = f"{slugify(species_name)}_{suffix:02d}"
            prompt_text = build_prompt(
                species_name=species_name,
                species_notes=species_notes,
                plant_form=plant_form,
                location=location,
                time_of_day=time_of_day,
                shot_type=shot_type,
                lighting=light,
                style_frame=style_frame,
                delivery_constraints=delivery_constraints,
            )
            prompt_json = build_structured_prompt(
                species_name=species_name,
                species_notes=species_notes,
                plant_form=plant_form,
                location=location,
                time_of_day=time_of_day,
                shot_type=shot_type,
                lighting=light,
                style_frame=style_frame,
                delivery_constraints=delivery_constraints,
            )
            records.append(
                {
                    "id": record_id,
                    "domain": domain,
                    "seed": start_seed + len(records),
                    "species": species_name,
                    "location": location,
                    "time_of_day": time_of_day,
                    "shot_type": shot_type,
                    "lighting": light,
                    "plant_form": plant_form,
                    "prompt_format": prompt_format,
                    "prompt": json.dumps(prompt_json, separators=(", ", ": "))
                    if prompt_format == "json"
                    else prompt_text,
                }
            )
            if limit is not None and len(records) >= limit:
                return records
    return records


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--axes", type=Path, default=DEFAULT_AXES)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--variants-per-species", type=int, default=2)
    parser.add_argument("--start-seed", type=int, default=3101)
    parser.add_argument("--domain", default="plant")
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--prompt-format", choices=["natural", "json"], default="natural")
    args = parser.parse_args()

    if args.variants_per_species < 1:
        raise ValueError("--variants-per-species must be at least 1")

    axes = load_axes(args.axes)
    records = build_records(
        axes=axes,
        variants_per_species=args.variants_per_species,
        start_seed=args.start_seed,
        domain=args.domain,
        limit=args.limit,
        prompt_format=args.prompt_format,
    )

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(records, indent=2) + "\n")
    species_count = len(axes["species"])
    print(f"wrote {len(records)} prompts from {species_count} species -> {args.out}")


if __name__ == "__main__":
    main()
