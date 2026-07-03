from __future__ import annotations

import argparse
import difflib
import hashlib
import html
import io
import json
import math
import mimetypes
import re
import sqlite3
import unicodedata
import urllib.parse
import zipfile
from collections import Counter
from contextlib import contextmanager
from datetime import datetime, timezone
from email import policy
from email.parser import BytesParser
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from xml.etree import ElementTree as ET

from talon.catalog import build_module_catalog
from talon.collatinus import run_collatinus_tool
from talon.importers import extract_pdf_text, pdf_backend_status
from talon.legal_terms import compare_legal_terms, conllu_lemma_tokens
from talon.manifest_runtime import manifest_runners
from talon.parsers import parser_statuses, run_parser
from talon.pipeline import ModuleRunner, PipelineContext, run_selected_modules
from talon.reports import render_report_html, render_run_report_html, render_run_report_pdf
from talon.voyant import build_voyant_zip


ROOT = Path(__file__).resolve().parent
STATIC_DIR = ROOT / "static"
DATA_DIR = ROOT / "data"
UPLOAD_DIR = DATA_DIR / "uploads"
DB_PATH = DATA_DIR / "reti.sqlite3"
MAX_BODY = 20 * 1024 * 1024

WORD_RE = re.compile(r"[^\W\d_]+", re.UNICODE)
SENTENCE_RE = re.compile(r"(?<=[.!?;:])\s+|\n{2,}")

LATIN_FUNCTION_WORDS = {
    "a",
    "ab",
    "ac",
    "ad",
    "adhuc",
    "aliquid",
    "alius",
    "ante",
    "apud",
    "at",
    "atque",
    "aut",
    "autem",
    "circa",
    "contra",
    "cum",
    "cur",
    "de",
    "dum",
    "e",
    "enim",
    "ergo",
    "et",
    "etiam",
    "eius",
    "eorum",
    "eos",
    "ea",
    "eum",
    "ex",
    "eram",
    "erant",
    "erat",
    "ero",
    "erit",
    "est",
    "esse",
    "essent",
    "esset",
    "haec",
    "hanc",
    "hic",
    "his",
    "hoc",
    "iam",
    "ibi",
    "idem",
    "igitur",
    "ille",
    "illa",
    "illi",
    "illis",
    "illum",
    "in",
    "infra",
    "inter",
    "ita",
    "itaque",
    "ne",
    "nec",
    "neque",
    "nisi",
    "non",
    "nos",
    "noster",
    "nostra",
    "nostrum",
    "nunc",
    "per",
    "post",
    "pro",
    "propter",
    "quae",
    "quam",
    "quando",
    "qui",
    "quia",
    "quibus",
    "quod",
    "quorum",
    "quoque",
    "se",
    "sed",
    "seu",
    "sibi",
    "si",
    "sic",
    "sine",
    "sub",
    "sui",
    "sum",
    "sunt",
    "sua",
    "suum",
    "suus",
    "super",
    "tamen",
    "te",
    "tibi",
    "tu",
    "ubi",
    "uel",
    "uero",
    "ut",
    "vel",
    "vero",
    "vos",
    "vester",
    "vestra",
}


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def db_connect() -> sqlite3.Connection:
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


@contextmanager
def db_session():
    connection = db_connect()
    try:
        yield connection
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def init_storage() -> None:
    DATA_DIR.mkdir(exist_ok=True)
    UPLOAD_DIR.mkdir(exist_ok=True)
    with db_session() as db:
        db.executescript(
            """
            CREATE TABLE IF NOT EXISTS documents (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                author TEXT NOT NULL DEFAULT '',
                date_label TEXT NOT NULL DEFAULT '',
                period TEXT NOT NULL DEFAULT '',
                place TEXT NOT NULL DEFAULT '',
                genre TEXT NOT NULL DEFAULT '',
                witness TEXT NOT NULL DEFAULT '',
                source_name TEXT NOT NULL DEFAULT '',
                source_hash TEXT NOT NULL DEFAULT '',
                source_type TEXT NOT NULL DEFAULT 'text',
                diplomatic_text TEXT NOT NULL,
                normalized_text TEXT NOT NULL,
                notes TEXT NOT NULL DEFAULT '',
                structure_json TEXT NOT NULL DEFAULT '[]',
                conllu TEXT NOT NULL DEFAULT '',
                conllu_source TEXT NOT NULL DEFAULT '',
                is_demo INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS annotations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
                start_offset INTEGER NOT NULL DEFAULT 0,
                end_offset INTEGER NOT NULL DEFAULT 0,
                quote TEXT NOT NULL DEFAULT '',
                label TEXT NOT NULL DEFAULT 'nota',
                body TEXT NOT NULL DEFAULT '',
                certainty TEXT NOT NULL DEFAULT 'possibile',
                source TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS analysis_runs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                kind TEXT NOT NULL,
                document_ids TEXT NOT NULL,
                parameters TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            """
        )
        count = db.execute("SELECT COUNT(*) FROM documents").fetchone()[0]
        if count == 0:
            seed_demo_documents(db)


def seed_demo_documents(db: sqlite3.Connection) -> None:
    demos = [
        {
            "title": "Charta venditionis A",
            "author": "ignoto",
            "date_label": "ca. 820 (demo)",
            "period": "alto medioevo",
            "place": "Tuscia (demo)",
            "genre": "carta di vendita",
            "witness": "Demo A",
            "text": (
                "In nomine domini. Ego Petrus filius quondam Iohannis vendo et trado "
                "tibi Martino presbytero petiam unam de terra cum vinea et arboribus, "
                "positam in loco qui dicitur Campum Longum. Habet fines: a primo latere "
                "terra ecclesiae, a secundo via publica, a tertio rivus, a quarto terra "
                "Leonis. Ipsa terra est per mensura tabulas duodecim. Pretium inter nos "
                "constitutum est solidos argenti viginti, quos a te accepi et nihil mihi "
                "remansit. Ab hodierna die habeas, teneas, possideas atque tuis heredibus "
                "relinquas. Si ego aut meus heres contra hanc cartulam venire temptaverit, "
                "componat duplum et haec venditio firma permaneat. Actum ante testes."
            ),
            "conllu": (
                "# text = Ego Petrus vendo et trado tibi petiam unam de terra.\n"
                "1\tEgo\tego\tPRON\t_\tCase=Nom|Number=Sing|Person=1\t3\tnsubj\t_\t_\n"
                "2\tPetrus\tPetrus\tPROPN\t_\tCase=Nom|Number=Sing\t1\tappos\t_\t_\n"
                "3\tvendo\tvendo\tVERB\t_\tMood=Ind|Number=Sing|Person=1|Tense=Pres|Voice=Act\t0\troot\t_\t_\n"
                "4\tet\tet\tCCONJ\t_\t_\t5\tcc\t_\t_\n"
                "5\ttrado\ttrado\tVERB\t_\tMood=Ind|Number=Sing|Person=1|Tense=Pres|Voice=Act\t3\tconj\t_\t_\n"
                "6\ttibi\ttu\tPRON\t_\tCase=Dat|Number=Sing|Person=2\t5\tiobj\t_\t_\n"
                "7\tpetiam\tpetia\tNOUN\t_\tCase=Acc|Gender=Fem|Number=Sing\t5\tobj\t_\t_\n"
                "8\tunam\tunus\tNUM\t_\tCase=Acc|Gender=Fem|Number=Sing\t7\tnummod\t_\t_\n"
                "9\tde\tde\tADP\t_\t_\t10\tcase\t_\t_\n"
                "10\tterra\tterra\tNOUN\t_\tCase=Abl|Gender=Fem|Number=Sing\t7\tnmod\t_\tSpaceAfter=No\n"
                "11\t.\t.\tPUNCT\t_\t_\t3\tpunct\t_\t_\n"
            ),
        },
        {
            "title": "Charta venditionis B",
            "author": "ignoto",
            "date_label": "ca. 825 (demo)",
            "period": "alto medioevo",
            "place": "Tuscia (demo)",
            "genre": "carta di vendita",
            "witness": "Demo B",
            "text": (
                "In nomine domini nostri. Ego Leo filius bone memorie Andreae per hanc "
                "cartulam vendo vobis, Petro et Martino fratribus, casa et terra mea in "
                "loco Campum Longum. Fines sunt: de uno latere via publica, de alio terra "
                "sancti Petri, de tertio aqua currente, de quarto vinea Dominici. Accepi "
                "a vobis pretium solidos viginti et duo, finitum pretium, unde me bene "
                "contentum profiteor. A presenti die habeatis et possideatis vos et "
                "heredes vestri, faciendi quod volueritis. Si quis contra hanc venditionem "
                "agere presumpserit, duplum pretium restituat et cartula in sua firmitate "
                "permaneat. Signum Leonis venditoris et testium."
            ),
            "conllu": "",
        },
        {
            "title": "Charta donationis C",
            "author": "ignoto",
            "date_label": "ca. 870 (demo)",
            "period": "alto medioevo",
            "place": "Tuscia (demo)",
            "genre": "donazione",
            "witness": "Demo C",
            "text": (
                "Regnante domino nostro, pro remedio animae meae dono atque offero "
                "ecclesiae beati Petri duas petias de terra et medietatem vineae. Prima "
                "petia iacet prope viam publicam et terminatur a rivo; secunda est iuxta "
                "silvam communem. Dono omnia cum ingressu, exitu, arboribus et pertinentiis, "
                "ita ut sacerdotes ea teneant et fructum ad luminaria ecclesiae impendant. "
                "Nullus ex heredibus meis hanc donationem minuere aut revocare presumat. "
                "Qui contra fecerit, componat ecclesiae auri libras duas et quod repetit "
                "non valeat vindicare. Haec pagina donationis firma sit omni tempore, "
                "manu mea roborata et testibus tradita."
            ),
            "conllu": "",
        },
    ]
    for demo in demos:
        db.execute(
            """
            INSERT INTO documents (
                title, author, date_label, period, place, genre, witness,
                source_name, source_hash, source_type, diplomatic_text,
                normalized_text, notes, structure_json, conllu, conllu_source,
                is_demo, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
            """,
            (
                demo["title"],
                demo["author"],
                demo["date_label"],
                demo["period"],
                demo["place"],
                demo["genre"],
                demo["witness"],
                "dataset dimostrativo sintetico",
                "",
                "demo",
                demo["text"],
                normalize_whitespace(demo["text"]),
                "Testo sintetico per dimostrare l'interfaccia; non e una fonte storica.",
                "[]",
                demo["conllu"],
                "annotazione manuale dimostrativa" if demo["conllu"] else "",
                utc_now(),
            ),
        )


def normalize_whitespace(text: str) -> str:
    paragraphs = []
    for paragraph in re.split(r"\n\s*\n", text.replace("\r\n", "\n")):
        clean = re.sub(r"[ \t]+", " ", paragraph).strip()
        if clean:
            paragraphs.append(clean)
    return "\n\n".join(paragraphs)


def apply_profile(text: str, profile: dict[str, Any] | None = None) -> str:
    profile = profile or {}
    value = unicodedata.normalize("NFC", text)
    if profile.get("lower", True):
        value = value.casefold()
    if profile.get("j_to_i"):
        value = value.replace("j", "i").replace("J", "I")
    if profile.get("v_to_u"):
        value = value.replace("v", "u").replace("V", "U")
    if profile.get("strip_marks"):
        value = "".join(
            character
            for character in unicodedata.normalize("NFD", value)
            if unicodedata.category(character) != "Mn"
        )
    return normalize_whitespace(value)


def tokenize(text: str, profile: dict[str, Any] | None = None) -> list[str]:
    return WORD_RE.findall(apply_profile(text, profile))


def tokenize_with_offsets(text: str, profile: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    processed = apply_profile(text, profile)
    return [
        {"token": match.group(0), "start": match.start(), "end": match.end()}
        for match in WORD_RE.finditer(processed)
    ]


def split_passages(text: str) -> list[str]:
    passages = []
    for piece in SENTENCE_RE.split(normalize_whitespace(text)):
        clean = piece.strip()
        if len(tokenize(clean)) >= 5:
            passages.append(clean)
    if len(passages) < 2:
        passages = [
            part.strip()
            for part in re.split(r"\n+|(?<=[.;])\s+", normalize_whitespace(text))
            if len(tokenize(part)) >= 5
        ]
    return passages


def moving_average_ttr(tokens: list[str], window: int = 50) -> float:
    if not tokens:
        return 0.0
    if len(tokens) <= window:
        return len(set(tokens)) / len(tokens)
    values = [
        len(set(tokens[index : index + window])) / window
        for index in range(len(tokens) - window + 1)
    ]
    return sum(values) / len(values)


def document_summary(text: str, profile: dict[str, Any] | None = None) -> dict[str, Any]:
    tokens = tokenize(text, profile)
    sentences = split_passages(text)
    counts = Counter(tokens)
    content_counts = Counter(
        token for token in tokens if token not in LATIN_FUNCTION_WORDS and len(token) > 2
    )
    collocations = collocation_rows(tokens)
    warnings = []
    if len(tokens) < 1000:
        warnings.append(
            "Testo sotto 1.000 parole riconosciute: i confronti di stile sono solo esplorativi."
        )
    if len(sentences) < 3:
        warnings.append(
            "La segmentazione in frasi e fragile: controllare la punteggiatura della trascrizione."
        )
    return {
        "token_count": len(tokens),
        "type_count": len(counts),
        "sentence_count": len(sentences),
        "average_word_length": round(
            sum(len(token) for token in tokens) / len(tokens), 2
        )
        if tokens
        else 0,
        "average_sentence_length": round(len(tokens) / len(sentences), 2)
        if sentences
        else 0,
        "ttr": round(len(counts) / len(tokens), 4) if tokens else 0,
        "mattr_50": round(moving_average_ttr(tokens), 4),
        "top_words": [
            {"term": term, "count": count} for term, count in counts.most_common(18)
        ],
        "top_content_words": [
            {"term": term, "count": count}
            for term, count in content_counts.most_common(18)
        ],
        "collocations": collocations[:15],
        "warnings": warnings,
    }


def collocation_rows(tokens: list[str], window: int = 5) -> list[dict[str, Any]]:
    unigram = Counter(tokens)
    pairs: Counter[tuple[str, str]] = Counter()
    total = len(tokens)
    for index, left in enumerate(tokens):
        if left in LATIN_FUNCTION_WORDS or len(left) <= 2:
            continue
        for right in tokens[index + 1 : index + window + 1]:
            if right in LATIN_FUNCTION_WORDS or len(right) <= 2 or right == left:
                continue
            pair = tuple(sorted((left, right)))
            pairs[pair] += 1
    rows = []
    for (left, right), count in pairs.items():
        if count < 2:
            continue
        denominator = unigram[left] + unigram[right]
        log_dice = 14 + math.log2((2 * count) / denominator) if denominator else 0
        rows.append(
            {
                "left": left,
                "right": right,
                "count": count,
                "log_dice": round(log_dice, 2),
                "window": window,
                "tokens": total,
            }
        )
    rows.sort(key=lambda row: (row["log_dice"], row["count"]), reverse=True)
    return rows


def extract_docx(data: bytes) -> tuple[str, list[dict[str, Any]], str]:
    namespace = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        document_root = ET.fromstring(archive.read("word/document.xml"))
        structure = []
        paragraphs = []
        for paragraph in document_root.findall(".//w:body/w:p", namespace):
            style_node = paragraph.find("./w:pPr/w:pStyle", namespace)
            style = ""
            if style_node is not None:
                style = style_node.attrib.get(
                    "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}val",
                    "",
                )
            chunks = []
            for node in paragraph.iter():
                local = node.tag.rsplit("}", 1)[-1]
                if local == "t" and node.text:
                    chunks.append(node.text)
                elif local == "tab":
                    chunks.append("\t")
                elif local in {"br", "cr"}:
                    chunks.append("\n")
            text = "".join(chunks).strip()
            if text:
                paragraphs.append(text)
                structure.append({"type": "paragraph", "style": style, "text": text})

        notes = []
        if "word/footnotes.xml" in archive.namelist():
            footnote_root = ET.fromstring(archive.read("word/footnotes.xml"))
            for footnote in footnote_root.findall(".//w:footnote", namespace):
                note_id = footnote.attrib.get(
                    "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}id",
                    "",
                )
                if note_id.startswith("-"):
                    continue
                note_text = " ".join(
                    node.text for node in footnote.findall(".//w:t", namespace) if node.text
                ).strip()
                if note_text:
                    notes.append(f"Nota {note_id}: {note_text}")
        return "\n\n".join(paragraphs), structure, "\n".join(notes)


def safe_source_name(filename: str, digest: str) -> str:
    suffix = Path(filename).suffix.lower()
    if suffix not in {".docx", ".txt", ".xml", ".conllu", ".pdf"}:
        suffix = ".bin"
    return f"{digest}{suffix}"


def create_document(payload: dict[str, Any], file_data: bytes | None = None) -> int:
    title = str(payload.get("title", "")).strip()
    if not title:
        raise ValueError("Il titolo e obbligatorio.")

    source_name = str(payload.get("source_name", "")).strip()
    source_type = str(payload.get("source_type", "text")).strip() or "text"
    structure: list[dict[str, Any]] = []
    notes_from_file = ""
    diplomatic = str(payload.get("text", "")).strip()
    digest = ""

    if file_data is not None:
        digest = hashlib.sha256(file_data).hexdigest()
        suffix = Path(source_name).suffix.lower()
        if suffix == ".docx":
            diplomatic, structure, notes_from_file = extract_docx(file_data)
            source_type = "docx"
        elif suffix == ".pdf":
            diplomatic = extract_pdf_text(file_data)
            source_type = "pdf"
        elif suffix in {".txt", ".xml", ".conllu"}:
            diplomatic = file_data.decode("utf-8-sig", errors="replace")
            source_type = suffix.lstrip(".")
        else:
            raise ValueError("Formato non supportato. Usare .docx, .txt o .pdf.")
        if not diplomatic.strip():
            raise ValueError("Il file non contiene testo leggibile.")
        stored_name = safe_source_name(source_name, digest)
        (UPLOAD_DIR / stored_name).write_bytes(file_data)

    if not diplomatic:
        raise ValueError("Inserire un testo o scegliere un file.")

    notes = str(payload.get("notes", "")).strip()
    if notes_from_file:
        notes = f"{notes}\n\n{notes_from_file}".strip()
    normalized = normalize_whitespace(diplomatic)
    with db_session() as db:
        cursor = db.execute(
            """
            INSERT INTO documents (
                title, author, date_label, period, place, genre, witness,
                source_name, source_hash, source_type, diplomatic_text,
                normalized_text, notes, structure_json, conllu, conllu_source,
                is_demo, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', '', 0, ?)
            """,
            (
                title,
                str(payload.get("author", "")).strip(),
                str(payload.get("date_label", "")).strip(),
                str(payload.get("period", "")).strip(),
                str(payload.get("place", "")).strip(),
                str(payload.get("genre", "")).strip(),
                str(payload.get("witness", "")).strip(),
                source_name,
                digest,
                source_type,
                diplomatic,
                normalized,
                notes,
                json.dumps(structure, ensure_ascii=False),
                utc_now(),
            ),
        )
        return int(cursor.lastrowid)


def serialize_document(row: sqlite3.Row, include_text: bool = False) -> dict[str, Any]:
    result = {
        "id": row["id"],
        "title": row["title"],
        "author": row["author"],
        "date_label": row["date_label"],
        "period": row["period"],
        "place": row["place"],
        "genre": row["genre"],
        "witness": row["witness"],
        "source_name": row["source_name"],
        "source_hash": row["source_hash"],
        "source_type": row["source_type"],
        "notes": row["notes"],
        "is_demo": bool(row["is_demo"]),
        "created_at": row["created_at"],
        "has_syntax": bool(row["conllu"].strip()),
        "conllu_source": row["conllu_source"],
        "token_count": len(tokenize(row["normalized_text"])),
    }
    if include_text:
        result.update(
            {
                "diplomatic_text": row["diplomatic_text"],
                "normalized_text": row["normalized_text"],
                "structure": json.loads(row["structure_json"] or "[]"),
            }
        )
    return result


def update_document(document_id: int, payload: dict[str, Any]) -> dict[str, Any]:
    row = fetch_document(document_id)
    if not row:
        raise ValueError("Documento non trovato.")
    diplomatic = str(payload.get("diplomatic_text", row["diplomatic_text"]))
    if not diplomatic.strip():
        raise ValueError("Il testo non puo essere vuoto.")
    text_changed = diplomatic != row["diplomatic_text"]
    values = {
        "title": str(payload.get("title", row["title"])).strip() or row["title"],
        "author": str(payload.get("author", row["author"])).strip(),
        "date_label": str(payload.get("date_label", row["date_label"])).strip(),
        "period": str(payload.get("period", row["period"])).strip(),
        "place": str(payload.get("place", row["place"])).strip(),
        "genre": str(payload.get("genre", row["genre"])).strip(),
        "witness": str(payload.get("witness", row["witness"])).strip(),
        "notes": str(payload.get("notes", row["notes"])).strip(),
        "diplomatic_text": diplomatic,
        "normalized_text": normalize_whitespace(diplomatic),
    }
    with db_session() as db:
        db.execute(
            """
            UPDATE documents
            SET title = ?, author = ?, date_label = ?, period = ?, place = ?,
                genre = ?, witness = ?, notes = ?, diplomatic_text = ?,
                normalized_text = ?,
                conllu = CASE WHEN ? THEN '' ELSE conllu END,
                conllu_source = CASE WHEN ? THEN '' ELSE conllu_source END
            WHERE id = ?
            """,
            (
                values["title"],
                values["author"],
                values["date_label"],
                values["period"],
                values["place"],
                values["genre"],
                values["witness"],
                values["notes"],
                values["diplomatic_text"],
                values["normalized_text"],
                1 if text_changed else 0,
                1 if text_changed else 0,
                document_id,
            ),
        )
        db.execute(
            "INSERT INTO analysis_runs (kind, document_ids, parameters, created_at) VALUES (?, ?, ?, ?)",
            (
                "document_edit",
                json.dumps([document_id]),
                json.dumps({"text_changed": text_changed}, ensure_ascii=False),
                utc_now(),
            ),
        )
    updated = fetch_document(document_id)
    return {"document": serialize_document(updated, include_text=True), "text_changed": text_changed}


def delete_annotation(annotation_id: int) -> None:
    with db_session() as db:
        cursor = db.execute("DELETE FROM annotations WHERE id = ?", (annotation_id,))
        if cursor.rowcount == 0:
            raise ValueError("Annotazione non trovata.")


def fetch_documents(ids: list[int] | None = None) -> list[sqlite3.Row]:
    with db_session() as db:
        if ids:
            placeholders = ",".join("?" for _ in ids)
            rows = db.execute(
                f"SELECT * FROM documents WHERE id IN ({placeholders}) ORDER BY id", ids
            ).fetchall()
        else:
            rows = db.execute("SELECT * FROM documents ORDER BY created_at DESC, id DESC").fetchall()
    return rows


def fetch_document(document_id: int) -> sqlite3.Row | None:
    with db_session() as db:
        return db.execute(
            "SELECT * FROM documents WHERE id = ?", (document_id,)
        ).fetchone()


def fetch_analysis_run(run_id: int) -> dict[str, Any] | None:
    with db_session() as db:
        row = db.execute("SELECT * FROM analysis_runs WHERE id = ?", (run_id,)).fetchone()
    if not row:
        return None
    try:
        parameters = json.loads(row["parameters"] or "{}")
    except json.JSONDecodeError:
        parameters = {}
    try:
        document_ids = [int(value) for value in json.loads(row["document_ids"] or "[]")]
    except (TypeError, ValueError, json.JSONDecodeError):
        document_ids = []
    return {
        "id": row["id"],
        "kind": row["kind"],
        "document_ids": document_ids,
        "parameters": parameters,
        "created_at": row["created_at"],
    }


def fetch_analysis_runs(limit: int = 50) -> list[dict[str, Any]]:
    limit = max(1, min(int(limit or 50), 200))
    with db_session() as db:
        rows = db.execute(
            "SELECT * FROM analysis_runs ORDER BY created_at DESC, id DESC LIMIT ?",
            (limit,),
        ).fetchall()
    runs = []
    for row in rows:
        try:
            parameters = json.loads(row["parameters"] or "{}")
        except json.JSONDecodeError:
            parameters = {}
        try:
            document_ids = [int(value) for value in json.loads(row["document_ids"] or "[]")]
        except (TypeError, ValueError, json.JSONDecodeError):
            document_ids = []
        documents = ordered_documents(document_ids) if document_ids else []
        runs.append(
            {
                "id": row["id"],
                "kind": row["kind"],
                "document_ids": document_ids,
                "documents": [
                    {"id": document["id"], "title": document["title"]}
                    for document in documents
                ],
                "created_at": row["created_at"],
                "parser": parameters.get("parser", ""),
                "report_style": parameters.get("report_style", ""),
                "modules": parameters.get("modules", []),
                "summary": parameters.get("summary", {}),
                "report_url": f"/report/run/{row['id']}" if row["kind"] == "pipeline" else "",
                "report_pdf_url": f"/report/run/{row['id']}.pdf" if row["kind"] == "pipeline" else "",
            }
        )
    return runs


def feature_table(
    rows: list[sqlite3.Row],
    profile: dict[str, Any],
    feature_type: str,
    max_features: int,
) -> tuple[list[str], list[list[float]], list[int]]:
    raw_features: list[Counter[str]] = []
    lengths = []
    aggregate: Counter[str] = Counter()
    for row in rows:
        if feature_type == "char3":
            processed = re.sub(r"\s+", " ", apply_profile(row["normalized_text"], profile))
            features = Counter(
                processed[index : index + 3]
                for index in range(max(0, len(processed) - 2))
                if processed[index : index + 3].strip()
            )
            length = sum(features.values())
        elif feature_type == "function":
            tokens = tokenize(row["normalized_text"], profile)
            features = Counter(token for token in tokens if token in LATIN_FUNCTION_WORDS)
            length = len(tokens)
        else:
            tokens = tokenize(row["normalized_text"], profile)
            features = Counter(tokens)
            length = len(tokens)
        raw_features.append(features)
        lengths.append(length)
        aggregate.update(features)
    selected = [feature for feature, _ in aggregate.most_common(max_features)]
    scale = 10000 if feature_type == "char3" else 1000
    table = [
        [counter.get(feature, 0) * scale / max(length, 1) for feature in selected]
        for counter, length in zip(raw_features, lengths)
    ]
    return selected, table, lengths


def zscore_columns(table: list[list[float]]) -> list[list[float]]:
    if not table or not table[0]:
        return [[] for _ in table]
    row_count = len(table)
    column_count = len(table[0])
    result = [[0.0] * column_count for _ in range(row_count)]
    for column in range(column_count):
        values = [table[row][column] for row in range(row_count)]
        mean = sum(values) / row_count
        variance = sum((value - mean) ** 2 for value in values) / row_count
        deviation = math.sqrt(variance)
        if deviation:
            for row in range(row_count):
                result[row][column] = (table[row][column] - mean) / deviation
    return result


def cosine_distance(left: list[float], right: list[float]) -> float:
    dot = sum(a * b for a, b in zip(left, right))
    left_norm = math.sqrt(sum(value * value for value in left))
    right_norm = math.sqrt(sum(value * value for value in right))
    if not left_norm or not right_norm:
        return 1.0
    return 1 - dot / (left_norm * right_norm)


def top_symmetric_eigen(
    matrix: list[list[float]], count: int = 2
) -> list[tuple[float, list[float]]]:
    size = len(matrix)
    working = [row[:] for row in matrix]
    pairs = []
    for component in range(min(count, size)):
        vector = [
            math.sin((index + 1) * (component + 1) * 1.618) + 0.5
            for index in range(size)
        ]
        norm = math.sqrt(sum(value * value for value in vector)) or 1
        vector = [value / norm for value in vector]
        for _ in range(150):
            next_vector = [
                sum(working[row][column] * vector[column] for column in range(size))
                for row in range(size)
            ]
            norm = math.sqrt(sum(value * value for value in next_vector))
            if norm < 1e-12:
                break
            next_vector = [value / norm for value in next_vector]
            if sum(abs(a - b) for a, b in zip(vector, next_vector)) < 1e-10:
                vector = next_vector
                break
            vector = next_vector
        product = [
            sum(working[row][column] * vector[column] for column in range(size))
            for row in range(size)
        ]
        eigenvalue = sum(a * b for a, b in zip(vector, product))
        if eigenvalue < 1e-10:
            pairs.append((0.0, [0.0] * size))
            continue
        pairs.append((eigenvalue, vector))
        for row in range(size):
            for column in range(size):
                working[row][column] -= eigenvalue * vector[row] * vector[column]
    return pairs


def pca_projection(
    table: list[list[float]],
    features: list[str],
    titles: list[str],
    component_count: int = 3,
) -> dict[str, Any]:
    component_count = max(2, min(component_count, 3))
    if not table or not table[0]:
        return {
            "points": [],
            "variance": [0] * component_count,
            "loadings": [[] for _ in range(component_count)],
        }
    row_count = len(table)
    column_count = len(table[0])
    means = [
        sum(table[row][column] for row in range(row_count)) / row_count
        for column in range(column_count)
    ]
    centered = [
        [table[row][column] - means[column] for column in range(column_count)]
        for row in range(row_count)
    ]
    gram = [
        [
            sum(centered[left][column] * centered[right][column] for column in range(column_count))
            / max(column_count - 1, 1)
            for right in range(row_count)
        ]
        for left in range(row_count)
    ]
    eigenpairs = top_symmetric_eigen(gram, component_count)
    total = sum(max(gram[index][index], 0) for index in range(row_count)) or 1
    coordinates = [[0.0 for _ in range(component_count)] for _ in range(row_count)]
    loadings: list[list[dict[str, Any]]] = []
    variance = []
    for axis, (eigenvalue, vector) in enumerate(eigenpairs):
        variance.append(round(100 * max(eigenvalue, 0) / total, 1))
        scale = math.sqrt(max(eigenvalue, 0))
        for row in range(row_count):
            coordinates[row][axis] = vector[row] * scale
        axis_loadings = []
        for column, feature in enumerate(features):
            weight = sum(
                centered[row][column] * vector[row] for row in range(row_count)
            )
            axis_loadings.append({"feature": feature, "weight": round(weight, 4)})
        axis_loadings.sort(key=lambda item: abs(item["weight"]), reverse=True)
        loadings.append(axis_loadings[:10])
    while len(variance) < component_count:
        variance.append(0)
        loadings.append([])
    return {
        "points": [
            {
                "title": titles[index],
                "x": round(coordinates[index][0], 5),
                "y": round(coordinates[index][1], 5),
                "z": round(coordinates[index][2], 5) if component_count > 2 else 0,
            }
            for index in range(row_count)
        ],
        "variance": variance,
        "loadings": loadings,
    }


def document_feature_profiles(
    rows: list[Any], features: list[str], table: list[list[float]], limit: int = 10
) -> list[dict[str, Any]]:
    profiles = []
    for row_index, row in enumerate(rows):
        ranked = sorted(
            [
                {"feature": feature, "frequency": round(table[row_index][index], 3)}
                for index, feature in enumerate(features)
                if table[row_index][index] > 0
            ],
            key=lambda item: item["frequency"],
            reverse=True,
        )
        profiles.append(
            {
                "id": row["id"],
                "title": row["title"],
                "features": ranked[:limit],
            }
        )
    return profiles


def stylometry_result(
    rows: list[Any],
    profile: dict[str, Any],
    feature_type: str,
    max_features: int,
) -> dict[str, Any]:
    features, table, lengths = feature_table(rows, profile, feature_type, max_features)
    zscores = zscore_columns(table)
    delta_matrix = [[0.0 for _ in rows] for _ in rows]
    cosine_matrix = [[0.0 for _ in rows] for _ in rows]
    explanations = []
    for left in range(len(rows)):
        for right in range(left + 1, len(rows)):
            contributions = [
                {
                    "feature": features[index],
                    "contribution": round(
                        abs(zscores[left][index] - zscores[right][index]), 4
                    ),
                    "left_frequency": round(table[left][index], 3),
                    "right_frequency": round(table[right][index], 3),
                }
                for index in range(len(features))
            ]
            contributions.sort(key=lambda item: item["contribution"], reverse=True)
            delta = (
                sum(item["contribution"] for item in contributions) / len(features)
                if features
                else 0
            )
            cosine = cosine_distance(table[left], table[right])
            delta_matrix[left][right] = delta_matrix[right][left] = round(delta, 4)
            cosine_matrix[left][right] = cosine_matrix[right][left] = round(cosine, 4)
            explanations.append(
                {
                    "left_id": rows[left]["id"],
                    "right_id": rows[right]["id"],
                    "left_title": rows[left]["title"],
                    "right_title": rows[right]["title"],
                    "delta": round(delta, 4),
                    "cosine": round(cosine, 4),
                    "contributors": contributions[:12],
                }
            )
    warnings = []
    short = [rows[index]["title"] for index, length in enumerate(lengths) if length < 1000]
    if short:
        warnings.append(
            "Campioni brevi (<1.000 unita): " + ", ".join(short) + "."
        )
    periods = {row["period"] for row in rows if row["period"]}
    genres = {row["genre"] for row in rows if row["genre"]}
    if len(periods) > 1:
        warnings.append("I documenti appartengono a periodi diversi.")
    if len(genres) > 1:
        warnings.append("I documenti appartengono a generi diversi.")
    if len(rows) < 3:
        warnings.append("La mappa riassuntiva con meno di tre documenti non e informativa.")
    return {
        "documents": [
            {"id": row["id"], "title": row["title"], "units": lengths[index]}
            for index, row in enumerate(rows)
        ],
        "feature_type": feature_type,
        "max_features": len(features),
        "features": features,
        "document_profiles": document_feature_profiles(rows, features, table),
        "profile": profile,
        "delta_matrix": delta_matrix,
        "cosine_matrix": cosine_matrix,
        "explanations": explanations,
        "pca": pca_projection(table, features, [row["title"] for row in rows], 3),
        "warnings": warnings,
        "interpretation": (
            "Distanze minori indicano testi piu simili nelle caratteristiche misurate. "
            "Non equivalgono a identita d'autore."
        ),
    }


def compare_documents(payload: dict[str, Any]) -> dict[str, Any]:
    ids = [int(value) for value in payload.get("ids", [])]
    if len(ids) < 2:
        raise ValueError("Selezionare almeno due documenti.")
    rows = fetch_documents(ids)
    if len(rows) != len(set(ids)):
        raise ValueError("Uno o piu documenti non esistono.")
    rows_by_id = {row["id"]: row for row in rows}
    rows = [rows_by_id[document_id] for document_id in ids]
    profile = payload.get("profile") or {"lower": True}
    feature_type = str(payload.get("feature_type", "words"))
    max_features = max(10, min(int(payload.get("max_features", 100)), 500))
    result = stylometry_result(rows, profile, feature_type, max_features)
    with db_session() as db:
        db.execute(
            "INSERT INTO analysis_runs (kind, document_ids, parameters, created_at) VALUES (?, ?, ?, ?)",
            (
                "stylometry",
                json.dumps(ids),
                json.dumps(
                    {
                        "feature_type": feature_type,
                        "max_features": max_features,
                        "profile": profile,
                    }
                ),
                utc_now(),
            ),
        )
    return result


def parallel_passages(payload: dict[str, Any]) -> dict[str, Any]:
    ids = [int(value) for value in payload.get("ids", [])]
    if len(ids) < 2:
        raise ValueError("Selezionare almeno due documenti.")
    rows = fetch_documents(ids)
    row_by_id = {row["id"]: row for row in rows}
    rows = [row_by_id[document_id] for document_id in ids if document_id in row_by_id]
    passages = []
    for row in rows:
        for index, text in enumerate(split_passages(row["normalized_text"])):
            terms = [
                token
                for token in tokenize(text, payload.get("profile"))
                if token not in LATIN_FUNCTION_WORDS and len(token) > 2
            ]
            if terms:
                passages.append(
                    {
                        "document_id": row["id"],
                        "title": row["title"],
                        "index": index,
                        "text": text,
                        "terms": Counter(terms),
                    }
                )
    document_frequency: Counter[str] = Counter()
    for passage in passages:
        document_frequency.update(passage["terms"].keys())
    total = len(passages)
    vectors = []
    for passage in passages:
        vector = {
            term: count * (math.log((total + 1) / (document_frequency[term] + 1)) + 1)
            for term, count in passage["terms"].items()
        }
        vectors.append(vector)
    pairs = []
    for left in range(len(passages)):
        for right in range(left + 1, len(passages)):
            if passages[left]["document_id"] == passages[right]["document_id"]:
                continue
            terms = set(vectors[left]) | set(vectors[right])
            left_vector = [vectors[left].get(term, 0.0) for term in terms]
            right_vector = [vectors[right].get(term, 0.0) for term in terms]
            similarity = 1 - cosine_distance(left_vector, right_vector)
            shared = sorted(
                set(passages[left]["terms"]) & set(passages[right]["terms"]),
                key=lambda term: (
                    passages[left]["terms"][term] + passages[right]["terms"][term]
                ),
                reverse=True,
            )
            if similarity >= 0.08 and shared:
                pairs.append(
                    {
                        "similarity": round(similarity, 4),
                        "left": {
                            key: passages[left][key]
                            for key in ("document_id", "title", "index", "text")
                        },
                        "right": {
                            key: passages[right][key]
                            for key in ("document_id", "title", "index", "text")
                        },
                        "shared_terms": shared[:10],
                    }
                )
    pairs.sort(key=lambda pair: pair["similarity"], reverse=True)
    return {
        "pairs": pairs[:30],
        "method": "Confronto lessicale: il sistema pesa le parole dei passi con TF-IDF e misura la sovrapposizione con similarita coseno.",
        "warning": (
            "E una somiglianza tra parole, non una comprensione del significato. "
            "Sinonimi e varianti non normalizzate possono sfuggire."
        ),
    }


def affinity_tokens(row: Any, profile: dict[str, Any], parser_id: str) -> list[str]:
    conllu = str(row["conllu"] if isinstance(row, sqlite3.Row) else row.get("conllu", "")).strip()
    if parser_id != "forms" and conllu:
        tokens = conllu_lemma_tokens(conllu, profile)
    else:
        tokens = tokenize(row["normalized_text"], profile)
    return [token for token in tokens if len(token) > 2 and token not in LATIN_FUNCTION_WORDS]


def average_cluster_distance(left: list[int], right: list[int], matrix: list[list[float]]) -> float:
    values = [matrix[i][j] for i in left for j in right if i != j]
    return sum(values) / max(len(values), 1)


def shared_cluster_terms(left: list[int], right: list[int], counters: list[Counter[str]], limit: int = 8) -> list[str]:
    left_terms: Counter[str] = Counter()
    right_terms: Counter[str] = Counter()
    for index in left:
        left_terms.update(counters[index])
    for index in right:
        right_terms.update(counters[index])
    shared = set(left_terms) & set(right_terms)
    return sorted(shared, key=lambda term: min(left_terms[term], right_terms[term]), reverse=True)[:limit]


def resolve_affinity_feature_count(value: Any, lengths: list[int], vocabulary_size: int) -> tuple[int, str]:
    if value in (None, "", "auto"):
        ordered = sorted(lengths)
        median_length = ordered[len(ordered) // 2] if ordered else 0
        target = round(median_length * 0.12)
        target = max(40, min(target, 220))
        if vocabulary_size:
            target = min(target, vocabulary_size)
        return max(20, min(target, 500)), "auto"
    return max(20, min(int(value), 500)), "manual"


def text_affinity_tree(payload: dict[str, Any], rows_override: list[Any] | None = None) -> dict[str, Any]:
    ids = [int(value) for value in payload.get("ids", [])]
    if rows_override is None:
        if len(ids) < 3:
            raise ValueError("Selezionare almeno tre documenti per calcolare una PCA lessicale.")
        rows = ordered_documents(ids)
    else:
        rows = rows_override
        ids = [int(row["id"]) for row in rows]
    if len(rows) < 3:
        raise ValueError("Servono almeno tre documenti per una PCA leggibile.")

    profile = payload.get("profile") or {"lower": True}
    parser_id = str(payload.get("parser", "forms"))
    counters = [Counter(affinity_tokens(row, profile, parser_id)) for row in rows]
    lengths = [sum(counter.values()) for counter in counters]
    aggregate: Counter[str] = Counter()
    for counter in counters:
        aggregate.update(counter)
    max_features, feature_mode = resolve_affinity_feature_count(payload.get("max_features", 120), lengths, len(aggregate))
    features = [term for term, _ in aggregate.most_common(max_features)]
    table = [
        [counter.get(feature, 0) * 1000 / max(length, 1) for feature in features]
        for counter, length in zip(counters, lengths)
    ]
    matrix = [[0.0 for _ in rows] for _ in rows]
    for left in range(len(rows)):
        for right in range(left + 1, len(rows)):
            matrix[left][right] = matrix[right][left] = round(cosine_distance(table[left], table[right]), 4)

    clusters: dict[int, dict[str, Any]] = {
        index: {
            "id": index,
            "label": rows[index]["title"],
            "members": [index],
            "children": [],
            "distance": 0,
        }
        for index in range(len(rows))
    }
    active = set(clusters)
    next_id = len(rows)
    merges = []
    while len(active) > 1:
        best_pair = None
        best_distance = float("inf")
        active_list = sorted(active)
        for pos, left_id in enumerate(active_list):
            for right_id in active_list[pos + 1 :]:
                distance = average_cluster_distance(clusters[left_id]["members"], clusters[right_id]["members"], matrix)
                if distance < best_distance:
                    best_distance = distance
                    best_pair = (left_id, right_id)
        if best_pair is None:
            break
        left_id, right_id = best_pair
        left = clusters[left_id]
        right = clusters[right_id]
        shared = shared_cluster_terms(left["members"], right["members"], counters)
        clusters[next_id] = {
            "id": next_id,
            "label": f"Cluster {next_id - len(rows) + 1}",
            "members": left["members"] + right["members"],
            "children": [left, right],
            "distance": round(best_distance, 4),
            "shared_terms": shared,
        }
        merges.append(
            {
                "left": [rows[index]["title"] for index in left["members"]],
                "right": [rows[index]["title"] for index in right["members"]],
                "distance": round(best_distance, 4),
                "shared_terms": shared,
            }
        )
        active.remove(left_id)
        active.remove(right_id)
        active.add(next_id)
        next_id += 1
    root = clusters[next(iter(active))]
    return {
        "documents": [{"id": row["id"], "title": row["title"], "units": lengths[index]} for index, row in enumerate(rows)],
        "tree": root,
        "merges": merges,
        "distance_matrix": matrix,
        "features": features[:20],
        "document_profiles": document_feature_profiles(rows, features, table),
        "pca": pca_projection(table, features, [row["title"] for row in rows], 3),
        "max_features": len(features),
        "requested_max_features": max_features,
        "shown_features": min(len(features), 20),
        "feature_mode": feature_mode,
        "parser": parser_id,
        "profile": profile,
        "method": "PCA su frequenze normalizzate di forme o lemmi; la distanza coseno resta come misura tecnica di controllo.",
        "warning": "La mappa PCA mostra vicinanza lessicale/formulare da verificare; non dimostra da sola dipendenza diretta, autore comune o stemma.",
    }


def kwic(document_ids: list[int], query: str, width: int = 72) -> list[dict[str, Any]]:
    query = query.strip()
    if not query:
        return []
    rows = fetch_documents(document_ids or None)
    results = []
    pattern = re.compile(re.escape(query), re.IGNORECASE)
    for row in rows:
        text = row["normalized_text"]
        for match in pattern.finditer(text):
            results.append(
                {
                    "document_id": row["id"],
                    "title": row["title"],
                    "left": text[max(0, match.start() - width) : match.start()],
                    "match": text[match.start() : match.end()],
                    "right": text[match.end() : match.end() + width],
                    "start": match.start(),
                }
            )
            if len(results) >= 100:
                return results
    return results


def diff_documents(payload: dict[str, Any]) -> dict[str, Any]:
    ids = [int(value) for value in payload.get("ids", [])]
    if len(ids) != 2:
        raise ValueError("Selezionare esattamente due documenti per il confronto differenze.")
    rows = ordered_documents(ids)
    left, right = rows
    profile = payload.get("profile") or {"lower": False}
    left_text = apply_profile(left["normalized_text"], profile)
    right_text = apply_profile(right["normalized_text"], profile)
    left_units = re.findall(r"\s+|\S+", left_text)
    right_units = re.findall(r"\s+|\S+", right_text)
    matcher = difflib.SequenceMatcher(a=left_units, b=right_units, autojunk=False)
    left_segments = []
    right_segments = []
    summary = {"equal": 0, "replace": 0, "delete": 0, "insert": 0}
    for tag, left_start, left_end, right_start, right_end in matcher.get_opcodes():
        left_chunk = "".join(left_units[left_start:left_end])
        right_chunk = "".join(right_units[right_start:right_end])
        summary[tag] = summary.get(tag, 0) + 1
        if tag == "equal":
            left_segments.append({"type": "equal", "text": left_chunk})
            right_segments.append({"type": "equal", "text": right_chunk})
        elif tag == "replace":
            left_segments.append({"type": "replace", "text": left_chunk})
            right_segments.append({"type": "replace", "text": right_chunk})
        elif tag == "delete":
            left_segments.append({"type": "delete", "text": left_chunk})
            right_segments.append({"type": "empty", "text": ""})
        elif tag == "insert":
            left_segments.append({"type": "empty", "text": ""})
            right_segments.append({"type": "insert", "text": right_chunk})
    ratio = matcher.ratio()
    with db_session() as db:
        db.execute(
            "INSERT INTO analysis_runs (kind, document_ids, parameters, created_at) VALUES (?, ?, ?, ?)",
            (
                "diff",
                json.dumps(ids),
                json.dumps({"profile": profile, "ratio": ratio}, ensure_ascii=False),
                utc_now(),
            ),
        )
    return {
        "documents": [
            {"id": left["id"], "title": left["title"]},
            {"id": right["id"], "title": right["title"]},
        ],
        "profile": profile,
        "similarity": round(ratio, 4),
        "summary": summary,
        "left": left_segments,
        "right": right_segments,
        "method": "Diff testuale su unita lessicali e spazi, utile per trovare aggiunte, omissioni e varianti locali.",
    }


def parse_conllu(value: str) -> list[dict[str, Any]]:
    sentences = []
    for block in re.split(r"\n\s*\n", value.strip()):
        if not block.strip():
            continue
        text = ""
        tokens = []
        for line in block.splitlines():
            if line.startswith("# text ="):
                text = line.split("=", 1)[1].strip()
            if not line or line.startswith("#"):
                continue
            columns = line.split("\t")
            if len(columns) != 10 or "-" in columns[0] or "." in columns[0]:
                continue
            try:
                token_id = int(columns[0])
                head = int(columns[6])
            except ValueError:
                continue
            features = {}
            if columns[5] != "_":
                for feature in columns[5].split("|"):
                    if "=" in feature:
                        key, item = feature.split("=", 1)
                        features[key] = item
            tokens.append(
                {
                    "id": token_id,
                    "form": columns[1],
                    "lemma": columns[2],
                    "upos": columns[3],
                    "xpos": columns[4],
                    "features": features,
                    "head": head,
                    "relation": columns[7],
                    "misc": columns[9],
                }
            )
        if tokens:
            sentences.append(
                {"text": text or " ".join(token["form"] for token in tokens), "tokens": tokens}
            )
    return sentences


def tei_export(row: sqlite3.Row) -> bytes:
    paragraphs = [
        f"      <p>{html.escape(paragraph)}</p>"
        for paragraph in re.split(r"\n\s*\n", row["diplomatic_text"])
        if paragraph.strip()
    ]
    value = f"""<?xml version="1.0" encoding="UTF-8"?>
<TEI xmlns="http://www.tei-c.org/ns/1.0">
  <teiHeader>
    <fileDesc>
      <titleStmt>
        <title>{html.escape(row["title"])}</title>
        <author>{html.escape(row["author"] or "ignoto")}</author>
      </titleStmt>
      <publicationStmt>
        <p>Esportazione locale da TALON.</p>
      </publicationStmt>
      <sourceDesc>
        <msDesc>
          <msIdentifier>
            <settlement>{html.escape(row["place"])}</settlement>
            <idno>{html.escape(row["witness"])}</idno>
          </msIdentifier>
          <history><origin><origDate>{html.escape(row["date_label"])}</origDate></origin></history>
        </msDesc>
      </sourceDesc>
    </fileDesc>
    <profileDesc>
      <textClass><keywords><term>{html.escape(row["genre"])}</term></keywords></textClass>
    </profileDesc>
  </teiHeader>
  <text>
    <body>
{chr(10).join(paragraphs)}
    </body>
  </text>
</TEI>
"""
    return value.encode("utf-8")


def parse_multipart(content_type: str, body: bytes) -> tuple[dict[str, str], dict[str, Any]]:
    message = BytesParser(policy=policy.default).parsebytes(
        b"Content-Type: "
        + content_type.encode("utf-8")
        + b"\r\nMIME-Version: 1.0\r\n\r\n"
        + body
    )
    fields: dict[str, str] = {}
    files: dict[str, Any] = {}
    for part in message.iter_parts():
        name = part.get_param("name", header="content-disposition")
        if not name:
            continue
        filename = part.get_filename()
        content = part.get_payload(decode=True) or b""
        if filename:
            files[name] = {
                "filename": filename,
                "content": content,
                "content_type": part.get_content_type(),
            }
        else:
            fields[name] = content.decode(part.get_content_charset() or "utf-8", errors="replace")
    return fields, files


def parse_document_ids(query: dict[str, list[str]]) -> list[int]:
    return [
        int(value)
        for item in query.get("ids", [])
        for value in item.split(",")
        if value.strip().isdigit()
    ]


def ordered_documents(ids: list[int]) -> list[sqlite3.Row]:
    rows = fetch_documents(ids)
    rows_by_id = {row["id"]: row for row in rows}
    ordered = [rows_by_id[document_id] for document_id in ids if document_id in rows_by_id]
    if len(ordered) != len(set(ids)):
        raise ValueError("Uno o piu documenti non esistono.")
    return ordered


def run_lexicon_module(context: PipelineContext) -> dict[str, Any]:
    return {
        "status": "ok",
        "message": f"Analisi lessicale calcolata per {len(context.rows)} documenti.",
        "result": {
            "method": (
                "Conteggio dei token, forme diverse, varieta lessicale MATTR, "
                "parole di contenuto e collocazioni logDice."
            ),
            "documents": [
                {
                    "id": row["id"],
                    "title": row["title"],
                    "summary": document_summary(row["normalized_text"], context.profile),
                }
                for row in context.rows
            ],
        },
    }


def run_legal_terms_module(context: PipelineContext) -> dict[str, Any]:
    return {
        "status": "ok",
        "result": compare_legal_terms(
            context.rows,
            context.profile,
            context.terms,
            context.parser_id,
        ),
    }


def run_stylometry_module(context: PipelineContext) -> dict[str, Any]:
    return {
        "status": "ok",
        "result": stylometry_result(
            context.rows,
            context.profile,
            str(context.payload.get("feature_type", "words")),
            max(10, min(int(context.payload.get("max_features", 100)), 500)),
        ),
    }


def run_function_words_module(context: PipelineContext) -> dict[str, Any]:
    return {
        "status": "ok",
        "message": "Analisi calcolata solo sulle parole grammaticali ricorrenti.",
        "result": stylometry_result(context.rows, context.profile, "function", 120),
    }


def run_parallel_passages_module(context: PipelineContext) -> dict[str, Any]:
    return {
        "status": "ok",
        "result": parallel_passages({"ids": context.ids, "profile": context.profile}),
    }


def run_textual_affinity_module(context: PipelineContext) -> dict[str, Any]:
    return {
        "status": "ok",
        "result": text_affinity_tree(
            {
                "ids": context.ids,
                "profile": context.profile,
                "parser": context.parser_id,
                "max_features": context.payload.get("max_features", 120),
            },
            context.rows,
        ),
    }


def run_voyant_export_module(context: PipelineContext) -> dict[str, Any]:
    return {
        "status": "available",
        "message": "Workspace Voyant disponibile dalla UI; export zip disponibile come fallback per VoyantServer locale.",
        "workspace_view": "voyant",
        "download_url": "/api/export/voyant?ids="
        + urllib.parse.quote(",".join(map(str, context.ids))),
    }


def pipeline_runners(catalog: dict[str, Any] | None = None) -> dict[str, ModuleRunner]:
    runners = {
        "lexicon": ModuleRunner("lexicon", run_lexicon_module),
        "legal_terms": ModuleRunner("legal_terms", run_legal_terms_module),
        "stylometry": ModuleRunner(
            "stylometry",
            run_stylometry_module,
            min_documents=2,
            skipped_message="Servono almeno due documenti per il confronto stilometrico.",
        ),
        "function_words": ModuleRunner(
            "function_words",
            run_function_words_module,
            min_documents=2,
            skipped_message="Servono almeno due documenti per l'analisi sulle function words.",
        ),
        "parallel_passages": ModuleRunner(
            "parallel_passages",
            run_parallel_passages_module,
            min_documents=2,
            skipped_message="Servono almeno due documenti per cercare passi simili.",
        ),
        "textual_affinity": ModuleRunner(
            "textual_affinity",
            run_textual_affinity_module,
            min_documents=3,
            skipped_message="Servono almeno tre documenti per calcolare una PCA lessicale.",
        ),
        "voyant_export": ModuleRunner("voyant_export", run_voyant_export_module),
    }
    catalog = catalog or build_module_catalog()
    for module_id, runner in manifest_runners(catalog).items():
        runners.setdefault(module_id, runner)
    return runners


def runtime_module_catalog() -> dict[str, Any]:
    catalog = build_module_catalog()
    runnable = set(pipeline_runners(catalog))
    for key in ("analyses", "integrations", "modules"):
        for module in catalog.get(key, []):
            module["runnable"] = module.get("id") in runnable
    catalog["runtime_modules"] = sorted(runnable)
    return catalog


def project_audit() -> dict[str, Any]:
    catalog = runtime_module_catalog()
    pdf_backends = pdf_backend_status()
    documents = fetch_documents()
    frontino_in_documents = any(
        re.search(r"frontin|frontino", row["title"] or "", re.IGNORECASE)
        or re.search(r"frontin|frontino", row["source_name"] or "", re.IGNORECASE)
        for row in documents
    )
    frontino_files = [
        str(path.relative_to(ROOT))
        for path in ROOT.rglob("*")
        if path.is_file()
        and re.search(r"frontin|frontino", path.name, re.IGNORECASE)
        and path.suffix.lower() == ".pdf"
    ]
    return {
        "documents": len(documents),
        "modules": len(catalog.get("modules", [])),
        "runtime_modules": len(catalog.get("runtime_modules", [])),
        "external_paths": catalog.get("module_paths", []),
        "catalog_errors": catalog.get("errors", []),
        "pdf_import": {
            "available": any(item["available"] for item in pdf_backends),
            "backends": pdf_backends,
        },
        "frontino_present": frontino_in_documents or bool(frontino_files),
        "frontino_in_documents": frontino_in_documents,
        "frontino_files": frontino_files,
        "parser_runtime": parser_statuses(),
    }


def compact_external_result(value: Any, limit: int = 1200) -> str:
    if value in (None, "", [], {}):
        return ""
    try:
        text = json.dumps(value, ensure_ascii=False, indent=2)
    except TypeError:
        text = str(value)
    return text if len(text) <= limit else text[: limit - 1] + "…"


def summarize_pipeline_modules(modules: dict[str, Any]) -> dict[str, Any]:
    summary: dict[str, Any] = {}
    for module_id, payload in modules.items():
        item: dict[str, Any] = {
            "status": payload.get("status"),
            "message": payload.get("message", ""),
        }
        result = payload.get("result") or {}
        if module_id == "lexicon":
            item["documents"] = [
                {
                    "title": document.get("title"),
                    "token_count": document.get("summary", {}).get("token_count", 0),
                    "type_count": document.get("summary", {}).get("type_count", 0),
                    "mattr_50": document.get("summary", {}).get("mattr_50", 0),
                    "top_words": document.get("summary", {}).get("top_content_words", [])[:6],
                }
                for document in result.get("documents", [])
            ]
        elif module_id == "legal_terms":
            item["terms"] = [
                {
                    "label": term.get("label"),
                    "total_count": term.get("total_count", 0),
                    "documents": [
                        {
                            "title": row.get("title"),
                            "count": row.get("count", 0),
                            "per_1000": row.get("per_1000", 0),
                        }
                        for row in term.get("documents", [])
                    ],
                }
                for term in result.get("terms", [])[:8]
            ]
            item["warnings"] = result.get("warnings", [])
        elif module_id in {"stylometry", "function_words"}:
            item["max_features"] = result.get("max_features", 0)
            item["feature_type"] = result.get("feature_type", "")
            item["warnings"] = result.get("warnings", [])
            item["pca"] = result.get("pca", {})
            item["document_profiles"] = result.get("document_profiles", [])[:8]
            item["pairs"] = [
                {
                    "left_title": pair.get("left_title"),
                    "right_title": pair.get("right_title"),
                    "delta": pair.get("delta"),
                    "cosine": pair.get("cosine"),
                    "contributors": pair.get("contributors", [])[:5],
                }
                for pair in result.get("explanations", [])[:8]
            ]
        elif module_id == "parallel_passages":
            item["pairs"] = [
                {
                    "similarity": pair.get("similarity"),
                    "left_title": pair.get("left", {}).get("title"),
                    "right_title": pair.get("right", {}).get("title"),
                    "shared_terms": pair.get("shared_terms", [])[:8],
                }
                for pair in result.get("pairs", [])[:8]
            ]
            item["warning"] = result.get("warning", "")
        elif module_id == "textual_affinity":
            item["method"] = result.get("method", "")
            item["warning"] = result.get("warning", "")
            item["merges"] = result.get("merges", [])[:8]
            item["features"] = result.get("features", [])[:12]
            item["pca"] = result.get("pca", {})
            item["document_profiles"] = result.get("document_profiles", [])[:8]
        elif module_id == "voyant_export":
            item["workspace_view"] = payload.get("workspace_view", "")
            item["download_url"] = payload.get("download_url", "")
        else:
            item["result"] = compact_external_result(result or payload.get("result"))
        summary[module_id] = item
    return summary


def rows_with_pipeline_parser(rows: list[sqlite3.Row], parser_id: str) -> list[Any]:
    if parser_id in {"", "forms", "conllu_import"}:
        return rows
    parsed_rows = []
    for row in rows:
        parsed = run_parser(parser_id, row["normalized_text"])
        parsed_row = dict(row)
        parsed_row["conllu"] = str(parsed["conllu"]).strip()
        parsed_row["conllu_source"] = str(parsed.get("source", parser_id))
        parsed_rows.append(parsed_row)
    return parsed_rows


def execute_pipeline(payload: dict[str, Any]) -> dict[str, Any]:
    ids = [int(value) for value in payload.get("ids", [])]
    if not ids:
        raise ValueError("Selezionare almeno un documento.")

    rows = ordered_documents(ids)
    requested_modules = [
        str(module_id)
        for module_id in payload.get("modules", ["legal_terms"])
        if str(module_id).strip()
    ]
    if not requested_modules:
        raise ValueError("Selezionare almeno un modulo di analisi.")

    profile = payload.get("profile") or {"lower": True}
    parser_id = str(payload.get("parser", "forms"))
    report_style = str(payload.get("report_style", "research_brief"))
    terms = payload.get("terms")
    pipeline_rows = rows_with_pipeline_parser(rows, parser_id)
    context = PipelineContext(
        ids=ids,
        rows=pipeline_rows,
        profile=profile,
        parser_id=parser_id,
        report_style=report_style,
        terms=terms,
        payload=payload,
    )
    module_order, modules = run_selected_modules(
        requested_modules,
        context,
        pipeline_runners(build_module_catalog()),
    )

    report_params = urllib.parse.urlencode(
        {
            "ids": ",".join(map(str, ids)),
            "style": report_style,
            "parser": parser_id,
            "lower": "1" if profile.get("lower", True) else "0",
            "j_to_i": "1" if profile.get("j_to_i") else "0",
            "v_to_u": "1" if profile.get("v_to_u") else "0",
            "terms": ",".join(str(term) for term in terms) if isinstance(terms, list) else str(terms or ""),
            "modules": ",".join(module_order),
        }
    )

    result = {
        "documents": [serialize_document(row) for row in rows],
        "profile": profile,
        "parser": parser_id,
        "report_style": report_style,
        "module_order": module_order,
        "modules": modules,
        "report_url": f"/report?{report_params}",
    }
    summary = summarize_pipeline_modules(modules)
    with db_session() as db:
        cursor = db.execute(
            "INSERT INTO analysis_runs (kind, document_ids, parameters, created_at) VALUES (?, ?, ?, ?)",
            (
                "pipeline",
                json.dumps(ids),
                json.dumps(
                    {
                        "modules": module_order,
                        "profile": profile,
                        "parser": parser_id,
                        "report_style": report_style,
                        "summary": summary,
                    },
                    ensure_ascii=False,
                ),
                utc_now(),
            ),
        )
    result["run_id"] = cursor.lastrowid
    result["report_url"] = f"/report/run/{result['run_id']}"
    result["report_pdf_url"] = f"/report/run/{result['run_id']}.pdf"
    return result


def run_affinity_tool(payload: dict[str, Any]) -> dict[str, Any]:
    ids = [int(value) for value in payload.get("ids", [])]
    rows = ordered_documents(ids) if ids else fetch_documents()
    if len(rows) < 3:
        raise ValueError("Servono almeno tre documenti per calcolare una PCA lessicale.")

    profile = payload.get("profile") or {"lower": True}
    parser_id = str(payload.get("parser", "forms"))
    max_features = payload.get("max_features", "auto")
    parsed_rows = rows_with_pipeline_parser(rows, parser_id)
    result = text_affinity_tree(
        {
            "ids": [row["id"] for row in rows],
            "profile": profile,
            "parser": parser_id,
            "max_features": max_features,
        },
        parsed_rows,
    )
    result["selection_mode"] = "selected" if ids else "all"
    result["threshold"] = float(payload.get("threshold", 0.55))
    with db_session() as db:
        cursor = db.execute(
            "INSERT INTO analysis_runs (kind, document_ids, parameters, created_at) VALUES (?, ?, ?, ?)",
            (
                "textual_affinity",
                json.dumps([row["id"] for row in rows]),
                json.dumps(
                    {
                        "profile": profile,
                        "parser": parser_id,
                        "max_features": result.get("max_features", max_features),
                        "feature_mode": result.get("feature_mode", "manual"),
                        "threshold": result["threshold"],
                        "selection_mode": result["selection_mode"],
                    },
                    ensure_ascii=False,
                ),
                utc_now(),
            ),
        )
        result["run_id"] = cursor.lastrowid
    return result


def parse_document_with_adapter(document_id: int, parser_id: str) -> dict[str, Any]:
    row = fetch_document(document_id)
    if not row:
        raise ValueError("Documento non trovato.")
    parsed = run_parser(parser_id, row["normalized_text"])
    conllu = str(parsed["conllu"]).strip()
    if not parse_conllu(conllu):
        raise ValueError("Il parser non ha prodotto CoNLL-U valido.")
    source = str(parsed.get("source", parser_id))
    with db_session() as db:
        db.execute(
            "UPDATE documents SET conllu = ?, conllu_source = ? WHERE id = ?",
            (conllu, source, document_id),
        )
        db.execute(
            "INSERT INTO analysis_runs (kind, document_ids, parameters, created_at) VALUES (?, ?, ?, ?)",
            (
                "parser",
                json.dumps([document_id]),
                json.dumps({"parser": parser_id, "source": source}, ensure_ascii=False),
                utc_now(),
            ),
        )
    return {
        "status": "ok",
        "parser": parser_id,
        "source": source,
        "sentences": parse_conllu(conllu),
    }


class TalonHandler(BaseHTTPRequestHandler):
    server_version = "TALON/0.1"

    def log_message(self, format_string: str, *args: Any) -> None:
        print(f"[{self.log_date_time_string()}] {format_string % args}")

    def send_json(self, payload: Any, status: HTTPStatus = HTTPStatus.OK) -> None:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(data)

    def send_error_json(self, message: str, status: HTTPStatus) -> None:
        self.send_json({"error": message}, status)

    def read_body(self) -> bytes:
        length = int(self.headers.get("Content-Length", "0"))
        if length > MAX_BODY:
            raise ValueError("File troppo grande (massimo 20 MB).")
        return self.rfile.read(length)

    def read_json(self) -> dict[str, Any]:
        body = self.read_body()
        if not body:
            return {}
        return json.loads(body.decode("utf-8"))

    def serve_static(self, path: str) -> None:
        relative = "index.html" if path in {"", "/"} else path.lstrip("/")
        target = (STATIC_DIR / relative).resolve()
        if STATIC_DIR.resolve() not in target.parents and target != STATIC_DIR.resolve():
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        if not target.is_file():
            target = STATIC_DIR / "index.html"
        data = target.read_bytes()
        content_type = mimetypes.guess_type(str(target))[0] or "application/octet-stream"
        if content_type.startswith("text/") or content_type in {
            "application/javascript",
            "application/json",
        }:
            content_type += "; charset=utf-8"
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(data)

    def do_HEAD(self) -> None:
        self.do_GET()

    def do_GET(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        query = urllib.parse.parse_qs(parsed.query)
        try:
            if path == "/api/health":
                self.send_json({"status": "ok", "time": utc_now()})
                return
            if path == "/api/modules":
                self.send_json(runtime_module_catalog())
                return
            if path == "/api/audit.json":
                data = json.dumps(project_audit(), ensure_ascii=False, indent=2).encode("utf-8")
                self.send_response(HTTPStatus.OK)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Content-Disposition", 'attachment; filename="talon-audit.json"')
                self.send_header("Content-Length", str(len(data)))
                self.send_header("Cache-Control", "no-cache")
                self.end_headers()
                if self.command != "HEAD":
                    self.wfile.write(data)
                return
            if path == "/api/audit":
                self.send_json(project_audit())
                return
            if path == "/api/parsers/status":
                self.send_json({"parsers": parser_statuses()})
                return
            if path == "/api/importers/status":
                pdf_backends = pdf_backend_status()
                pdf_available = any(item["available"] for item in pdf_backends)
                self.send_json(
                    {
                        "pdf": {
                            "available": pdf_available,
                            "backends": pdf_backends,
                            "ocr": False,
                            "message": (
                                "PDF testuali supportati; scansioni richiedono OCR esterno."
                                if pdf_available
                                else "Nessun backend PDF disponibile in questo runtime."
                            ),
                        }
                    }
                )
                return
            if path == "/api/runs":
                limit = int(query.get("limit", ["50"])[0])
                self.send_json({"runs": fetch_analysis_runs(limit)})
                return
            if path == "/api/documents":
                rows = fetch_documents()
                self.send_json({"documents": [serialize_document(row) for row in rows]})
                return
            match = re.fullmatch(r"/api/documents/(\d+)", path)
            if match:
                row = fetch_document(int(match.group(1)))
                if not row:
                    self.send_error_json("Documento non trovato.", HTTPStatus.NOT_FOUND)
                    return
                self.send_json({"document": serialize_document(row, include_text=True)})
                return
            match = re.fullmatch(r"/api/documents/(\d+)/analysis", path)
            if match:
                row = fetch_document(int(match.group(1)))
                if not row:
                    self.send_error_json("Documento non trovato.", HTTPStatus.NOT_FOUND)
                    return
                self.send_json(
                    {
                        "analysis": document_summary(row["normalized_text"]),
                        "method": "conteggio parole, varieta lessicale e parole che ricorrono vicine",
                    }
                )
                return
            match = re.fullmatch(r"/api/documents/(\d+)/syntax", path)
            if match:
                row = fetch_document(int(match.group(1)))
                if not row:
                    self.send_error_json("Documento non trovato.", HTTPStatus.NOT_FOUND)
                    return
                self.send_json(
                    {
                        "sentences": parse_conllu(row["conllu"]),
                        "source": row["conllu_source"],
                    }
                )
                return
            if path == "/api/annotations":
                document_id = int(query.get("document_id", ["0"])[0])
                with db_session() as db:
                    rows = db.execute(
                        "SELECT * FROM annotations WHERE document_id = ? ORDER BY start_offset, id",
                        (document_id,),
                    ).fetchall()
                self.send_json({"annotations": [dict(row) for row in rows]})
                return
            if path == "/api/kwic":
                ids = parse_document_ids(query)
                term = query.get("q", [""])[0]
                self.send_json({"results": kwic(ids, term), "query": term})
                return
            if path == "/api/export/voyant":
                ids = parse_document_ids(query)
                rows = fetch_documents(ids or None)
                if not rows:
                    raise ValueError("Nessun documento da esportare.")
                data = build_voyant_zip(rows, use_normalized=True)
                self.send_response(HTTPStatus.OK)
                self.send_header("Content-Type", "application/zip")
                self.send_header(
                    "Content-Disposition", 'attachment; filename="talon-voyant-corpus.zip"'
                )
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                if self.command != "HEAD":
                    self.wfile.write(data)
                return
            if path == "/api/export/tei":
                document_id = int(query.get("id", ["0"])[0])
                row = fetch_document(document_id)
                if not row:
                    self.send_error_json("Documento non trovato.", HTTPStatus.NOT_FOUND)
                    return
                data = tei_export(row)
                filename = re.sub(r"[^A-Za-z0-9_-]+", "_", row["title"]).strip("_") or "documento"
                self.send_response(HTTPStatus.OK)
                self.send_header("Content-Type", "application/xml; charset=utf-8")
                self.send_header(
                    "Content-Disposition", f'attachment; filename="{filename}.tei.xml"'
                )
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                if self.command != "HEAD":
                    self.wfile.write(data)
                return
            match = re.fullmatch(r"/report/run/(\d+)\.pdf", path)
            if match:
                run = fetch_analysis_run(int(match.group(1)))
                if not run:
                    self.send_error_json("Run non trovato.", HTTPStatus.NOT_FOUND)
                    return
                if run["kind"] != "pipeline":
                    raise ValueError("Il report PDF e disponibile per i run pipeline.")
                rows = ordered_documents(run["document_ids"])
                data = render_run_report_pdf(rows, runtime_module_catalog(), run)
                self.send_response(HTTPStatus.OK)
                self.send_header("Content-Type", "application/pdf")
                self.send_header(
                    "Content-Disposition",
                    f'attachment; filename="talon-run-{run["id"]}.pdf"',
                )
                self.send_header("Content-Length", str(len(data)))
                self.send_header("Cache-Control", "no-cache")
                self.end_headers()
                if self.command != "HEAD":
                    self.wfile.write(data)
                return
            match = re.fullmatch(r"/report/run/(\d+)", path)
            if match:
                run = fetch_analysis_run(int(match.group(1)))
                if not run:
                    self.send_error_json("Run non trovato.", HTTPStatus.NOT_FOUND)
                    return
                if run["kind"] != "pipeline":
                    raise ValueError("Il report run e disponibile per i run pipeline.")
                rows = ordered_documents(run["document_ids"])
                data = render_run_report_html(rows, runtime_module_catalog(), run)
                self.send_response(HTTPStatus.OK)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(data)))
                self.send_header("Cache-Control", "no-cache")
                self.end_headers()
                if self.command != "HEAD":
                    self.wfile.write(data)
                return
            if path == "/report":
                ids = parse_document_ids(query)
                rows = fetch_documents(ids or None)
                if ids:
                    rows_by_id = {row["id"]: row for row in rows}
                    rows = [rows_by_id[document_id] for document_id in ids if document_id in rows_by_id]
                if not rows:
                    raise ValueError("Selezionare almeno un documento per il report.")
                profile = {
                    "lower": query.get("lower", ["1"])[0] != "0",
                    "j_to_i": query.get("j_to_i", ["0"])[0] == "1",
                    "v_to_u": query.get("v_to_u", ["0"])[0] == "1",
                }
                parser_id = query.get("parser", ["forms"])[0]
                legal = compare_legal_terms(rows, profile, query.get("terms", [""])[0], parser_id)
                data = render_report_html(
                    rows,
                    build_module_catalog(),
                    legal,
                    query.get("style", ["research_brief"])[0],
                    {
                        "parser": parser_id,
                        "profile": profile,
                        "modules": [
                            value
                            for item in query.get("modules", [])
                            for value in item.split(",")
                            if value.strip()
                        ],
                    },
                )
                self.send_response(HTTPStatus.OK)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(data)))
                self.send_header("Cache-Control", "no-cache")
                self.end_headers()
                if self.command != "HEAD":
                    self.wfile.write(data)
                return
            if path.startswith("/api/"):
                self.send_error_json("Endpoint non trovato.", HTTPStatus.NOT_FOUND)
                return
            self.serve_static(path)
        except (ValueError, json.JSONDecodeError) as error:
            self.send_error_json(str(error), HTTPStatus.BAD_REQUEST)
        except Exception as error:
            self.send_error_json(f"Errore interno: {error}", HTTPStatus.INTERNAL_SERVER_ERROR)

    def do_POST(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        try:
            if path == "/api/documents":
                document_id = create_document(self.read_json())
                self.send_json({"id": document_id}, HTTPStatus.CREATED)
                return
            if path == "/api/import":
                body = self.read_body()
                fields, files = parse_multipart(
                    self.headers.get("Content-Type", ""), body
                )
                file_info = files.get("file")
                if not file_info:
                    raise ValueError("Scegliere un file .docx, .txt o .pdf.")
                fields["source_name"] = file_info["filename"]
                document_id = create_document(fields, file_info["content"])
                self.send_json({"id": document_id}, HTTPStatus.CREATED)
                return
            if path == "/api/pipeline":
                self.send_json(execute_pipeline(self.read_json()))
                return
            if path == "/api/compare":
                self.send_json(compare_documents(self.read_json()))
                return
            if path == "/api/parallel":
                self.send_json(parallel_passages(self.read_json()))
                return
            if path == "/api/diff":
                self.send_json(diff_documents(self.read_json()))
                return
            if path == "/api/affinity":
                self.send_json(run_affinity_tool(self.read_json()))
                return
            if path == "/api/collatinus":
                payload = self.read_json()
                ids = [int(value) for value in payload.get("ids", [])]
                if not ids:
                    raise ValueError("Selezionare almeno un documento.")
                self.send_json(run_collatinus_tool(ordered_documents(ids), payload))
                return
            if path == "/api/legal-terms":
                payload = self.read_json()
                ids = [int(value) for value in payload.get("ids", [])]
                if not ids:
                    raise ValueError("Selezionare almeno un documento.")
                parser_id = str(payload.get("parser", "forms"))
                rows = fetch_documents(ids)
                rows_by_id = {row["id"]: row for row in rows}
                rows = [rows_by_id[document_id] for document_id in ids if document_id in rows_by_id]
                if not rows:
                    raise ValueError("Nessun documento valido selezionato.")
                rows = rows_with_pipeline_parser(rows, parser_id)
                result = compare_legal_terms(
                    rows,
                    payload.get("profile") or {"lower": True},
                    payload.get("terms"),
                    parser_id,
                )
                document_layers = {int(document["id"]): document for document in result.get("documents", [])}
                profile = payload.get("profile") or {"lower": True}
                evidence_texts = []
                for row in rows:
                    layer = document_layers.get(int(row["id"]), {})
                    token_source = layer.get("token_source", "forms")
                    lemma_text = ""
                    if str(token_source).startswith("lemmas_") and str(row["conllu"]).strip():
                        lemma_text = " ".join(conllu_lemma_tokens(row["conllu"], profile))
                    evidence_texts.append(
                        {
                            "id": row["id"],
                            "title": row["title"],
                            "author": row["author"] or "attribuzione non indicata",
                            "token_source": token_source,
                            "token_source_label": layer.get("token_source_label", "forme normalizzate"),
                            "coverage": layer.get("coverage", ""),
                            "text": apply_profile(row["normalized_text"], profile),
                            "lemma_text": lemma_text,
                        }
                    )
                result["evidence_texts"] = evidence_texts
                with db_session() as db:
                    db.execute(
                        "INSERT INTO analysis_runs (kind, document_ids, parameters, created_at) VALUES (?, ?, ?, ?)",
                        (
                            "legal_terms",
                            json.dumps(ids),
                            json.dumps(
                                {
                                    "profile": payload.get("profile") or {"lower": True},
                                    "terms": payload.get("terms") or [],
                                    "parser": parser_id,
                                }
                            ),
                            utc_now(),
                        ),
                    )
                self.send_json(result)
                return
            match = re.fullmatch(r"/api/documents/(\d+)/update", path)
            if match:
                document_id = int(match.group(1))
                self.send_json(update_document(document_id, self.read_json()))
                return
            if path == "/api/annotations":
                payload = self.read_json()
                document_id = int(payload.get("document_id", 0))
                if not fetch_document(document_id):
                    raise ValueError("Documento non trovato.")
                with db_session() as db:
                    cursor = db.execute(
                        """
                        INSERT INTO annotations (
                            document_id, start_offset, end_offset, quote, label,
                            body, certainty, source, created_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            document_id,
                            int(payload.get("start_offset", 0)),
                            int(payload.get("end_offset", 0)),
                            str(payload.get("quote", "")),
                            str(payload.get("label", "nota")),
                            str(payload.get("body", "")),
                            str(payload.get("certainty", "possibile")),
                            str(payload.get("source", "")),
                            utc_now(),
                        ),
                    )
                self.send_json({"id": cursor.lastrowid}, HTTPStatus.CREATED)
                return
            match = re.fullmatch(r"/api/documents/(\d+)/conllu", path)
            if match:
                document_id = int(match.group(1))
                payload = self.read_json()
                conllu = str(payload.get("conllu", "")).strip()
                if not parse_conllu(conllu):
                    raise ValueError("Nessuna analisi grammaticale valida in formato CoNLL-U.")
                with db_session() as db:
                    db.execute(
                        "UPDATE documents SET conllu = ?, conllu_source = ? WHERE id = ?",
                        (
                            conllu,
                            str(payload.get("source", "importazione manuale")),
                            document_id,
                        ),
                    )
                self.send_json({"status": "ok"})
                return
            match = re.fullmatch(r"/api/documents/(\d+)/parse", path)
            if match:
                document_id = int(match.group(1))
                payload = self.read_json()
                parser_id = str(payload.get("parser", "")).strip()
                self.send_json(parse_document_with_adapter(document_id, parser_id))
                return
            self.send_error_json("Endpoint non trovato.", HTTPStatus.NOT_FOUND)
        except (ValueError, json.JSONDecodeError, zipfile.BadZipFile) as error:
            self.send_error_json(str(error), HTTPStatus.BAD_REQUEST)
        except Exception as error:
            self.send_error_json(f"Errore interno: {error}", HTTPStatus.INTERNAL_SERVER_ERROR)

    def do_DELETE(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        try:
            match = re.fullmatch(r"/api/annotations/(\d+)", path)
            if match:
                delete_annotation(int(match.group(1)))
                self.send_json({"status": "ok"})
                return
            self.send_error_json("Endpoint non trovato.", HTTPStatus.NOT_FOUND)
        except ValueError as error:
            self.send_error_json(str(error), HTTPStatus.BAD_REQUEST)
        except Exception as error:
            self.send_error_json(f"Errore interno: {error}", HTTPStatus.INTERNAL_SERVER_ERROR)


def main() -> None:
    parser = argparse.ArgumentParser(description="TALON - analisi visuale di testi latini")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()
    init_storage()
    server = ThreadingHTTPServer((args.host, args.port), TalonHandler)
    print(f"TALON disponibile su http://{args.host}:{args.port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
