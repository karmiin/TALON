from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

from talon.pipeline import ModuleRunner, PipelineContext


def _documents_for_payload(context: PipelineContext, include_text: bool) -> list[dict[str, Any]]:
    documents = []
    for row in context.rows:
        item = {
            "id": row["id"],
            "title": row["title"],
            "author": row["author"],
            "date_label": row["date_label"],
            "genre": row["genre"],
            "period": row["period"],
            "token_count": row["token_count"],
        }
        if include_text:
            item["text"] = row["normalized_text"]
        documents.append(item)
    return documents


def _manifest_payload(
    module: dict[str, Any],
    context: PipelineContext,
    include_text: bool,
) -> dict[str, Any]:
    return {
        "module": {
            "id": module.get("id"),
            "label": module.get("label"),
            "category": module.get("category"),
        },
        "documents": _documents_for_payload(context, include_text),
        "profile": context.profile,
        "parser": context.parser_id,
        "report_style": context.report_style,
        "terms": context.terms,
        "parameters": context.payload,
    }


def _remote_allowed(url: str, allow_remote: bool) -> bool:
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme not in {"http", "https"}:
        return False
    if allow_remote:
        return True
    host = (parsed.hostname or "").casefold()
    return host in {"localhost", "127.0.0.1", "::1"}


def _run_static(module: dict[str, Any]) -> dict[str, Any]:
    runtime = module.get("runtime") or {}
    result = runtime.get("result")
    if not isinstance(result, dict):
        result = {
            "module_id": module.get("id"),
            "label": module.get("label"),
            "description": module.get("description"),
        }
    return {
        "status": str(runtime.get("status", "ok")),
        "message": str(runtime.get("message", "Modulo dichiarativo eseguito dal manifest.")),
        "result": result,
    }


def _run_http_json(module: dict[str, Any], context: PipelineContext) -> dict[str, Any]:
    runtime = module.get("runtime") or {}
    url = str(runtime.get("url", "")).strip()
    if not _remote_allowed(url, bool(runtime.get("allow_remote", False))):
        raise ValueError(
            "runtime http_json non valido: usare http(s) locale oppure dichiarare allow_remote=true."
        )
    include_text = bool(runtime.get("include_text", False))
    timeout = float(runtime.get("timeout_seconds", 10))
    body = json.dumps(
        _manifest_payload(module, context, include_text),
        ensure_ascii=False,
    ).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=body,
        method=str(runtime.get("method", "POST")).upper(),
        headers={"Content-Type": "application/json; charset=utf-8"},
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            raw = response.read()
            content_type = response.headers.get("Content-Type", "")
    except urllib.error.URLError as error:
        raise ValueError(f"tool esterno non raggiungibile: {error}") from error
    if "json" not in content_type:
        raise ValueError("tool esterno raggiunto, ma la risposta non e JSON.")
    payload = json.loads(raw.decode("utf-8"))
    if not isinstance(payload, dict):
        raise ValueError("tool esterno raggiunto, ma la risposta JSON non e un oggetto.")
    return {
        "status": str(payload.get("status", "ok")),
        "message": str(payload.get("message", "Risposta ricevuta dal tool esterno.")),
        "result": payload.get("result", payload),
    }


def manifest_runner_for(module: dict[str, Any]) -> ModuleRunner | None:
    runtime = module.get("runtime") or {}
    kind = str(runtime.get("kind", "")).strip()
    if not kind:
        return None

    def handler(context: PipelineContext) -> dict[str, Any]:
        if kind == "static":
            return _run_static(module)
        if kind == "http_json":
            return _run_http_json(module, context)
        raise ValueError(f"Runtime manifest non supportato: {kind}")

    return ModuleRunner(
        str(module["id"]),
        handler,
        min_documents=int(runtime.get("min_documents", 1)),
        skipped_message=str(runtime.get("skipped_message", "")),
    )


def manifest_runners(catalog: dict[str, Any]) -> dict[str, ModuleRunner]:
    runners: dict[str, ModuleRunner] = {}
    for module in catalog.get("modules", []):
        if module.get("category") not in {"analysis", "integration"}:
            continue
        runner = manifest_runner_for(module)
        if runner:
            runners[runner.id] = runner
    return runners
