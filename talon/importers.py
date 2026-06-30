from __future__ import annotations

import io
import re
import shutil
import subprocess
import tempfile
from typing import Any


def _pdf_reader_class() -> Any | None:
    try:
        from pypdf import PdfReader

        return PdfReader
    except ModuleNotFoundError:
        pass
    try:
        from PyPDF2 import PdfReader

        return PdfReader
    except ModuleNotFoundError:
        return None


def pdf_backend_status() -> list[dict[str, Any]]:
    """Return optional PDF extraction backends visible to the current runtime."""

    backends = []
    for name, import_name in [
        ("pypdf/PyPDF2", "pypdf"),
        ("pdfplumber", "pdfplumber"),
        ("pdfminer.six", "pdfminer.high_level"),
    ]:
        try:
            __import__(import_name)
            available = True
        except ModuleNotFoundError:
            available = False
        backends.append({"name": name, "available": available})
    backends.append({"name": "pdftotext", "available": bool(shutil.which("pdftotext"))})
    return backends


def _clean_pdf_text(value: str) -> str:
    value = value.replace("\x00", "")
    value = re.sub(r"[ \t]+\n", "\n", value)
    value = re.sub(r"\n{3,}", "\n\n", value)
    return value.strip()


def _format_pages(pages: list[str]) -> str:
    chunks = []
    for page_number, text in enumerate(pages, start=1):
        cleaned = _clean_pdf_text(text)
        if cleaned:
            chunks.append(f"[pagina {page_number}]\n{cleaned}")
    return "\n\n".join(chunks)


def _extract_with_pypdf(data: bytes) -> str:
    PdfReader = _pdf_reader_class()
    if not PdfReader:
        raise ModuleNotFoundError("pypdf/PyPDF2")
    reader = PdfReader(io.BytesIO(data))
    pages = []
    for page in reader.pages:
        pages.append(page.extract_text() or "")
    return _format_pages(pages)


def _extract_with_pdfplumber(data: bytes) -> str:
    try:
        import pdfplumber
    except ModuleNotFoundError as error:
        raise ModuleNotFoundError("pdfplumber") from error
    pages = []
    with pdfplumber.open(io.BytesIO(data)) as pdf:
        for page in pdf.pages:
            pages.append(page.extract_text() or "")
    return _format_pages(pages)


def _extract_with_pdfminer(data: bytes) -> str:
    try:
        from pdfminer.high_level import extract_text
    except ModuleNotFoundError as error:
        raise ModuleNotFoundError("pdfminer.six") from error
    text = extract_text(io.BytesIO(data)) or ""
    pages = text.split("\f")
    return _format_pages(pages)


def _extract_with_pdftotext(data: bytes) -> str:
    executable = shutil.which("pdftotext")
    if not executable:
        raise FileNotFoundError("pdftotext")
    with tempfile.TemporaryDirectory() as temp_dir:
        input_path = f"{temp_dir}/input.pdf"
        output_path = f"{temp_dir}/output.txt"
        with open(input_path, "wb") as handle:
            handle.write(data)
        completed = subprocess.run(
            [executable, "-layout", "-enc", "UTF-8", input_path, output_path],
            check=False,
            capture_output=True,
            text=True,
            timeout=30,
        )
        if completed.returncode:
            message = completed.stderr.strip() or "pdftotext non ha prodotto output."
            raise ValueError(message)
        with open(output_path, "r", encoding="utf-8", errors="replace") as handle:
            text = handle.read()
    return _format_pages(text.split("\f"))


def extract_pdf_text(data: bytes) -> str:
    """Extract embedded text from a PDF using the best available backend."""

    errors: list[str] = []
    for label, extractor in [
        ("pypdf/PyPDF2", _extract_with_pypdf),
        ("pdfplumber", _extract_with_pdfplumber),
        ("pdfminer.six", _extract_with_pdfminer),
        ("pdftotext", _extract_with_pdftotext),
    ]:
        try:
            text = extractor(data)
        except (ModuleNotFoundError, FileNotFoundError):
            errors.append(f"{label}: non disponibile")
            continue
        except Exception as error:
            errors.append(f"{label}: {error}")
            continue
        if text:
            return text
        errors.append(f"{label}: nessun testo estraibile")

    available = [item for item in pdf_backend_status() if item["available"]]
    if not available:
        raise ValueError(
            "Importazione PDF non disponibile: installare pypdf, pdfplumber o pdfminer.six; "
            "in alternativa convertire il file in .txt/.docx."
        )
    raise ValueError(
        "Il PDF non contiene testo estraibile oppure e una scansione. "
        "Serve OCR o una trascrizione .txt/.docx. Dettagli backend: "
        + "; ".join(errors)
    )
