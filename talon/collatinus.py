from __future__ import annotations

import urllib.parse
import urllib.request
from typing import Any


COLLATINUS_ENDPOINT = "https://outils.biblissima.fr/collatinus-web/collatinus-web.php"


def run_collatinus_tool(rows: list[Any], payload: dict[str, Any]) -> dict[str, Any]:
    action_map = {
        "lemmatise": "Lemmatiser",
        "analyse": "Analyser",
        "tag": "Taguer",
        "scan": "Scander",
        "accentuate": "Accentuer",
    }
    action_id = str(payload.get("action", "lemmatise"))
    action = action_map.get(action_id, "Lemmatiser")
    language = str(payload.get("language", "it ")).strip()[:2] or "it"
    text = "\n\n".join(
        f"[{row['title']}]\n{row['normalized_text']}"
        for row in rows
    )
    if not text.strip():
        raise ValueError("I testi selezionati sono vuoti.")

    form = {
        "texte": text,
        "langue": f"{language} ",
        "opera": "traite_txt",
        "action": action,
        "token": "talon",
        "medieval": "true" if payload.get("medieval") else "false",
    }
    data = urllib.parse.urlencode(form).encode("utf-8")
    request = urllib.request.Request(
        COLLATINUS_ENDPOINT,
        data=data,
        headers={
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            "User-Agent": "TALON/1.0",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=25) as response:
            charset = response.headers.get_content_charset() or "utf-8"
            html_value = response.read().decode(charset, errors="replace")
    except Exception as error:
        raise ValueError(f"Collatinus non ha risposto: {error}") from error

    return {
        "html": html_value,
        "documents": [{"id": row["id"], "title": row["title"]} for row in rows],
        "action": action_id,
        "action_label": action,
        "language": language,
        "source": COLLATINUS_ENDPOINT,
    }
