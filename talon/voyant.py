from __future__ import annotations

import io
import re
import zipfile
from typing import Any


def _filename(value: str, fallback: str) -> str:
    slug = re.sub(r"[^A-Za-z0-9_-]+", "_", value).strip("_")
    return f"{slug or fallback}.txt"


def build_voyant_zip(rows: list[Any], use_normalized: bool = True) -> bytes:
    """Build a Voyant-compatible corpus archive.
    """

    buffer = io.BytesIO()
    used_names: set[str] = set()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for index, row in enumerate(rows, start=1):
            base = _filename(row["title"], f"document_{index}")
            name = base
            counter = 2
            while name in used_names:
                stem = base[:-4]
                name = f"{stem}_{counter}.txt"
                counter += 1
            used_names.add(name)
            text = row["normalized_text"] if use_normalized else row["diplomatic_text"]
            header = (
                f"Title: {row['title']}\n"
                f"Author: {row['author'] or 'attribuzione non indicata'}\n"
                f"Date: {row['date_label'] or 'non indicata'}\n"
                f"Genre: {row['genre'] or 'non indicato'}\n\n"
            )
            archive.writestr(name, header + text)
    return buffer.getvalue()

