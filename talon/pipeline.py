from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable


@dataclass(frozen=True)
class PipelineContext:
    """Runtime data shared by analysis module runners."""

    ids: list[int]
    rows: list[Any]
    profile: dict[str, Any]
    parser_id: str
    report_style: str
    terms: Any
    payload: dict[str, Any]


@dataclass(frozen=True)
class ModuleRunner:
    """Executable backend adapter for a selectable TALON module."""

    id: str
    handler: Callable[[PipelineContext], dict[str, Any]]
    min_documents: int = 1
    skipped_message: str = ""

    def execute(self, context: PipelineContext) -> dict[str, Any]:
        if len(context.ids) < self.min_documents:
            return {
                "status": "skipped",
                "message": self.skipped_message
                or f"Servono almeno {self.min_documents} documenti per eseguire il modulo.",
            }
        result = self.handler(context)
        if "status" not in result:
            result = {"status": "ok", **result}
        return result


def run_selected_modules(
    requested_modules: list[str],
    context: PipelineContext,
    runners: dict[str, ModuleRunner],
) -> tuple[list[str], dict[str, Any]]:
    """Execute selected module IDs, preserving order and isolating failures."""

    module_order: list[str] = []
    modules: dict[str, Any] = {}
    for module_id in requested_modules:
        module_order.append(module_id)
        runner = runners.get(module_id)
        if not runner:
            modules[module_id] = {
                "status": "unknown",
                "message": "Modulo registrato nel catalogo, ma non collegato a un runner backend.",
            }
            continue
        try:
            modules[module_id] = runner.execute(context)
        except Exception as error:
            modules[module_id] = {"status": "error", "message": str(error)}
    return module_order, modules

