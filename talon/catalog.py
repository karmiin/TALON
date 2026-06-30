from __future__ import annotations

import json
import os
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any


BUILTIN_MODULE_DIR = Path(__file__).resolve().parent / "modules"


@dataclass(frozen=True)
class ModuleSpec:
    """Public description of a selectable TALON module."""

    id: str
    label: str
    category: str
    status: str
    description: str
    inputs: list[str] = field(default_factory=list)
    outputs: list[str] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)
    references: list[dict[str, str]] = field(default_factory=list)
    ui: dict[str, Any] = field(default_factory=dict)
    runtime: dict[str, Any] = field(default_factory=dict)
    order: int = 100
    source: str = ""

    @classmethod
    def from_mapping(cls, payload: dict[str, Any], source: str) -> "ModuleSpec":
        required = ("id", "label", "category", "status", "description")
        missing = [key for key in required if not str(payload.get(key, "")).strip()]
        if missing:
            raise ValueError(f"Modulo incompleto ({', '.join(missing)}): {source}")
        return cls(
            id=str(payload["id"]).strip(),
            label=str(payload["label"]).strip(),
            category=str(payload["category"]).strip(),
            status=str(payload["status"]).strip(),
            description=str(payload["description"]).strip(),
            inputs=[str(item) for item in payload.get("inputs", [])],
            outputs=[str(item) for item in payload.get("outputs", [])],
            notes=[str(item) for item in payload.get("notes", [])],
            references=[
                {"label": str(item.get("label", "")), "url": str(item.get("url", ""))}
                for item in payload.get("references", [])
                if isinstance(item, dict)
            ],
            ui=dict(payload.get("ui", {})) if isinstance(payload.get("ui", {}), dict) else {},
            runtime=(
                dict(payload.get("runtime", {}))
                if isinstance(payload.get("runtime", {}), dict)
                else {}
            ),
            order=int(payload.get("order", 100)),
            source=source,
        )

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def configured_module_paths(extra_paths: list[str | Path] | None = None) -> list[Path]:
    paths = [BUILTIN_MODULE_DIR]
    env_value = os.environ.get("TALON_MODULE_PATH", "")
    paths.extend(Path(value) for value in env_value.split(os.pathsep) if value.strip())
    if extra_paths:
        paths.extend(Path(value) for value in extra_paths)
    resolved = []
    for path in paths:
        if path not in resolved:
            resolved.append(path)
    return resolved


def _manifest_payloads(path: Path) -> list[dict[str, Any]]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(data, dict) and isinstance(data.get("modules"), list):
        return [item for item in data["modules"] if isinstance(item, dict)]
    if isinstance(data, list):
        return [item for item in data if isinstance(item, dict)]
    if isinstance(data, dict):
        return [data]
    raise ValueError(f"Manifest non valido: {path}")


def load_module_specs(
    extra_paths: list[str | Path] | None = None,
) -> tuple[list[ModuleSpec], list[str]]:
    specs: list[ModuleSpec] = []
    errors: list[str] = []
    seen: set[str] = set()
    for folder in configured_module_paths(extra_paths):
        if not folder.exists():
            errors.append(f"Cartella moduli non trovata: {folder}")
            continue
        if not folder.is_dir():
            errors.append(f"Percorso moduli non e una cartella: {folder}")
            continue
        for manifest in sorted(folder.glob("*.json")):
            try:
                for payload in _manifest_payloads(manifest):
                    spec = ModuleSpec.from_mapping(payload, str(manifest))
                    if spec.id in seen:
                        errors.append(f"Modulo duplicato ignorato: {spec.id} ({manifest})")
                        continue
                    seen.add(spec.id)
                    specs.append(spec)
            except (OSError, ValueError, json.JSONDecodeError) as error:
                errors.append(str(error))
    specs.sort(key=lambda item: (item.category, item.order, item.label))
    return specs, errors


def _category(specs: list[ModuleSpec], name: str) -> list[dict[str, Any]]:
    return [
        spec.to_dict()
        for spec in sorted(
            [item for item in specs if item.category == name],
            key=lambda item: (item.order, item.label),
        )
    ]


def _compact_category(specs: list[ModuleSpec], name: str) -> list[dict[str, Any]]:
    return [
        {
            "id": item.id,
            "label": item.label,
            "description": item.description,
            "status": item.status,
            "order": item.order,
            "source": item.source,
        }
        for item in sorted(
            [spec for spec in specs if spec.category == name],
            key=lambda spec: (spec.order, spec.label),
        )
    ]


def build_module_catalog(extra_paths: list[str | Path] | None = None) -> dict[str, Any]:
    """Return module registry exposed to the UI and report layer."""

    specs, errors = load_module_specs(extra_paths)
    return {
        "module_paths": [str(path) for path in configured_module_paths(extra_paths)],
        "tools": _category(specs, "tool"),
        "pipeline": _compact_category(specs, "pipeline"),
        "analyses": _category(specs, "analysis"),
        "parsers": _category(specs, "parser"),
        "integrations": _category(specs, "integration"),
        "report_styles": _compact_category(specs, "report_style"),
        "modules": [spec.to_dict() for spec in specs],
        "errors": errors,
    }
