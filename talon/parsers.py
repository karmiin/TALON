from __future__ import annotations

import importlib.util
import os
import re
from dataclasses import asdict, dataclass
from typing import Any


WORD_RE = re.compile(r"[^\W\d_]+", re.UNICODE)

LEMMA_OVERRIDES = {
    "terra": "terra",
    "terram": "terra",
    "terrae": "terra",
    "terris": "terra",
    "fundus": "fundus",
    "fundum": "fundus",
    "fundi": "fundus",
    "ager": "ager",
    "agrum": "ager",
    "agri": "ager",
    "vinea": "vinea",
    "vineam": "vinea",
    "vineae": "vinea",
    "uinea": "vinea",
    "uineam": "vinea",
    "uineae": "vinea",
    "fines": "finis",
    "finis": "finis",
    "fine": "finis",
    "terminus": "terminus",
    "terminum": "terminus",
    "terminatur": "terminus",
    "via": "via",
    "publica": "publicus",
    "publicae": "publicus",
    "publicum": "publicus",
    "venditio": "venditio",
    "venditionem": "venditio",
    "venditionis": "venditio",
    "venditor": "venditor",
    "traditio": "traditio",
    "tradita": "trado",
    "donatio": "donatio",
    "donationem": "donatio",
    "donationis": "donatio",
    "concessio": "concessio",
    "pretium": "pretium",
    "pretio": "pretium",
    "solidus": "solidus",
    "solidos": "solidus",
    "solidis": "solidus",
    "argentum": "argentum",
    "argenti": "argentum",
    "obligatio": "obligatio",
    "pactum": "pactum",
    "firma": "firmus",
    "firmitate": "firmitas",
    "heres": "heres",
    "heredis": "heres",
    "heredibus": "heres",
    "heredes": "heres",
}


@dataclass(frozen=True)
class ParserStatus:
    id: str
    label: str
    status: str
    runnable: bool
    message: str
    source: str = ""
    install_hint: str = ""

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _has_module(name: str) -> bool:
    try:
        return importlib.util.find_spec(name) is not None
    except ModuleNotFoundError:
        return False


def parser_statuses() -> list[dict[str, Any]]:
    spacy_available = _has_module("spacy")
    latincy_model = os.environ.get("TALON_LATINCY_MODEL", "").strip()
    latincy_message = (
        f"spaCy presente; modello preferito: {latincy_model or 'auto-detect LatinCy'}."
        if spacy_available
        else "spaCy/LatinCy non installato in questo ambiente."
    )
    return [
        ParserStatus(
            id="forms",
            label="Forme normalizzate",
            status="active",
            runnable=True,
            message="Baseline senza lemmatizzazione: usa le forme dopo la pulizia grafica.",
            source="baseline",
        ).to_dict(),
        ParserStatus(
            id="latincy",
            label="LatinCy",
            status="active",
            runnable=spacy_available,
            message=latincy_message,
            source="optional_python",
            install_hint="Installare spaCy e un modello LatinCy, poi impostare TALON_LATINCY_MODEL se necessario.",
        ).to_dict(),
    ]


def _escape_conllu(value: str) -> str:
    value = str(value or "_").strip()
    if not value:
        return "_"
    return value.replace(" ", "_").replace("\t", "_").replace("\n", "_")


def _tokenize_fallback(text: str) -> list[str]:
    return WORD_RE.findall(text)


def fallback_conllu(text: str, source: str) -> str:
    """Very small fallback used only for tests and explicit degraded output."""

    tokens = _tokenize_fallback(text)
    if not tokens:
        raise ValueError("Nessun token riconosciuto nel testo.")
    lines = [f"# text = {text.strip()[:180]}", f"# source = {source}"]
    for index, token in enumerate(tokens, start=1):
        head = 0 if index == 1 else index - 1
        relation = "root" if index == 1 else "dep"
        lines.append(
            "\t".join(
                [
                    str(index),
                    _escape_conllu(token),
                    _escape_conllu(token.casefold()),
                    "X",
                    "_",
                    "_",
                    str(head),
                    relation,
                    "_",
                    "_",
                ]
            )
        )
    return "\n".join(lines) + "\n"


def rule_based_lemma(token: str) -> str:
    value = token.casefold().replace("j", "i")
    if value in LEMMA_OVERRIDES:
        return LEMMA_OVERRIDES[value]
    if len(value) > 6:
        for suffix, replacement in (
            ("ibus", ""),
            ("arum", "a"),
            ("orum", "us"),
            ("tionem", "tio"),
            ("tionis", "tio"),
            ("atis", "as"),
            ("atem", "as"),
        ):
            if value.endswith(suffix):
                return value[: -len(suffix)] + replacement
    if len(value) > 5:
        for suffix in ("que", "ne", "ve"):
            if value.endswith(suffix):
                return value[: -len(suffix)]
    return value


def lemma_rules_conllu(text: str) -> tuple[str, str]:
    tokens = _tokenize_fallback(text)
    if not tokens:
        raise ValueError("Nessun token riconosciuto nel testo.")
    lines = [f"# text = {text.strip()[:180]}", "# source = TALON lemma_rules"]
    for index, token in enumerate(tokens, start=1):
        head = 0 if index == 1 else index - 1
        relation = "root" if index == 1 else "dep"
        lines.append(
            "\t".join(
                [
                    str(index),
                    _escape_conllu(token),
                    _escape_conllu(rule_based_lemma(token)),
                    "X",
                    "_",
                    "LemmaRule=Heuristic",
                    str(head),
                    relation,
                    "_",
                    "_",
                ]
            )
        )
    return "\n".join(lines) + "\n", "TALON lemma_rules"


def _load_spacy_model() -> Any:
    try:
        import spacy
    except ModuleNotFoundError as error:
        raise ValueError(
            "LatinCy non disponibile: installare spaCy e un modello LatinCy prima di eseguire il parser."
        ) from error

    candidates = []
    configured = os.environ.get("TALON_LATINCY_MODEL", "").strip()
    if configured:
        candidates.append(configured)
    candidates.extend(["la_core_web_lg", "la_core_web_md", "la_core_web_sm"])
    errors = []
    for name in candidates:
        try:
            return spacy.load(name), name
        except Exception as error:  # spaCy raises several model-specific errors.
            errors.append(f"{name}: {error}")
    raise ValueError(
        "spaCy e presente, ma nessun modello LatinCy e caricabile. "
        "Impostare TALON_LATINCY_MODEL o installare un modello LatinCy. "
        + " | ".join(errors[:3])
    )


def _sentence_spans(doc: Any) -> list[list[Any]]:
    try:
        sentences = [list(sentence) for sentence in doc.sents]
        if sentences:
            return sentences
    except Exception:
        pass
    return [list(doc)]


def latincy_to_conllu(text: str) -> tuple[str, str]:
    model, model_name = _load_spacy_model()
    doc = model(text)
    blocks = []
    for sentence in _sentence_spans(doc):
        if not sentence:
            continue
        ids = {token.i: index for index, token in enumerate(sentence, start=1)}
        sentence_text = " ".join(token.text for token in sentence)
        lines = [f"# text = {sentence_text}", f"# source = LatinCy/{model_name}"]
        for index, token in enumerate(sentence, start=1):
            head = 0 if token.head.i == token.i or token.head.i not in ids else ids[token.head.i]
            relation = token.dep_ or ("root" if head == 0 else "dep")
            morph = str(token.morph) if getattr(token, "morph", None) else "_"
            lines.append(
                "\t".join(
                    [
                        str(index),
                        _escape_conllu(token.text),
                        _escape_conllu(token.lemma_ or token.text),
                        _escape_conllu(token.pos_ or "X"),
                        _escape_conllu(token.tag_ or "_"),
                        _escape_conllu(morph or "_"),
                        str(head),
                        _escape_conllu(relation),
                        "_",
                        "_",
                    ]
                )
            )
        blocks.append("\n".join(lines))
    if not blocks:
        raise ValueError("LatinCy non ha prodotto token.")
    return "\n\n".join(blocks) + "\n", f"LatinCy/{model_name}"


def run_parser(parser_id: str, text: str) -> dict[str, str]:
    parser_id = (parser_id or "").strip()
    if parser_id == "lemma_rules":
        conllu, source = lemma_rules_conllu(text)
        return {"conllu": conllu, "source": source}
    if parser_id == "latincy":
        conllu, source = latincy_to_conllu(text)
        return {"conllu": conllu, "source": source}
    if parser_id == "fallback_forms":
        return {
            "conllu": fallback_conllu(text, "fallback forme"),
            "source": "fallback forme senza lemmatizzazione",
        }
    raise ValueError("Il parser selezionato non esegue parsing automatico.")
