from __future__ import annotations

import re
import unicodedata
from collections.abc import Iterable
from collections import Counter, defaultdict
from typing import Any


WORD_RE = re.compile(r"[^\W\d_]+", re.UNICODE)


LEGAL_TERM_FAMILIES = [
    {
        "id": "dominium_proprietas",
        "label": "Dominium / proprietas",
        "description": "titolarita, proprieta e dominio su beni o fondi",
        "lemmas": [
            "dominium",
            "proprietas",
            "possessio",
            "possideo",
        ],
        "aliases": [
            "dominium",
            "dominio",
            "dominii",
            "proprietas",
            "proprietatem",
            "proprietatis",
            "proprietate",
            "possessio",
            "possessionem",
            "possessionis",
            "possidere",
            "possideo",
            "possideat",
            "possideatis",
        ],
    },
    {
        "id": "terra_fundus",
        "label": "Terra / fundus",
        "description": "beni fondiari, campi, appezzamenti e pertinenze",
        "lemmas": [
            "terra",
            "fundus",
            "ager",
            "petia",
            "vinea",
            "pertinentia",
        ],
        "aliases": [
            "terra",
            "terram",
            "terrae",
            "terris",
            "fundus",
            "fundum",
            "fundi",
            "ager",
            "agrum",
            "agri",
            "petia",
            "petiam",
            "petias",
            "vinea",
            "vineam",
            "vineae",
            "pertinentia",
            "pertinentiis",
        ],
    },
    {
        "id": "transfer",
        "label": "Venditio / traditio / donatio",
        "description": "atti di trasferimento, vendita, consegna e donazione",
        "lemmas": [
            "vendo",
            "venditio",
            "venditor",
            "trado",
            "traditio",
            "dono",
            "donatio",
            "offero",
            "concedo",
            "concessio",
        ],
        "aliases": [
            "vendo",
            "venditio",
            "venditionem",
            "venditionis",
            "venditor",
            "trado",
            "traditio",
            "tradita",
            "dono",
            "donatio",
            "donationem",
            "donationis",
            "offero",
            "concedo",
            "concessio",
        ],
    },
    {
        "id": "boundaries",
        "label": "Fines / termini",
        "description": "confini, lati, limiti e descrizioni topografiche",
        "lemmas": [
            "finis",
            "terminus",
            "termino",
            "latus",
            "iuxta",
            "prope",
            "rivus",
            "via",
            "publicus",
        ],
        "aliases": [
            "fines",
            "finis",
            "fine",
            "terminus",
            "terminum",
            "terminatur",
            "latere",
            "lateribus",
            "iuxta",
            "prope",
            "rivo",
            "rivus",
            "via",
            "publica",
        ],
    },
    {
        "id": "price_obligation",
        "label": "Pretium / obligatio",
        "description": "prezzo, pagamento, pena e obbligazione",
        "lemmas": [
            "pretium",
            "solidus",
            "argentum",
            "accipio",
            "duplus",
            "compono",
            "restituo",
            "obligatio",
            "pactum",
            "firmus",
            "firmitas",
        ],
        "aliases": [
            "pretium",
            "pretio",
            "solidos",
            "solidis",
            "argenti",
            "accepi",
            "duplum",
            "componat",
            "restituat",
            "obligatio",
            "pactum",
            "firma",
            "firmitate",
        ],
    },
    {
        "id": "inheritance",
        "label": "Heres / successio",
        "description": "eredi, successione e trasmissione del diritto",
        "lemmas": [
            "heres",
            "successio",
            "successor",
            "relinquo",
            "revoco",
            "vindico",
        ],
        "aliases": [
            "heres",
            "heredis",
            "heredibus",
            "heredes",
            "successio",
            "successor",
            "relinquo",
            "relinquas",
            "revocare",
            "vindicare",
        ],
    },
]


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
    return re.sub(r"\s+", " ", value).strip()


def tokenize(text: str, profile: dict[str, Any] | None = None) -> list[str]:
    return WORD_RE.findall(apply_profile(text, profile))


def _row_value(row: Any, key: str, default: Any = "") -> Any:
    try:
        value = row[key]
    except (KeyError, IndexError, TypeError):
        value = getattr(row, key, default)
    return default if value is None else value


def conllu_lemma_tokens(value: str, profile: dict[str, Any] | None = None) -> list[str]:
    lemmas: list[str] = []
    for line in value.splitlines():
        if not line or line.startswith("#"):
            continue
        columns = line.split("\t")
        if len(columns) != 10 or "-" in columns[0] or "." in columns[0]:
            continue
        try:
            int(columns[0])
        except ValueError:
            continue
        lemma = columns[2] if columns[2] != "_" else columns[1]
        lemmas.extend(tokenize(lemma, profile))
    return lemmas


def conllu_form_lemma_pairs(value: str, profile: dict[str, Any] | None = None) -> list[dict[str, str]]:
    pairs: list[dict[str, str]] = []
    for line in value.splitlines():
        if not line or line.startswith("#"):
            continue
        columns = line.split("\t")
        if len(columns) != 10 or "-" in columns[0] or "." in columns[0]:
            continue
        try:
            int(columns[0])
        except ValueError:
            continue
        form_tokens = tokenize(columns[1], profile)
        lemma_tokens = tokenize(columns[2] if columns[2] != "_" else columns[1], profile)
        if not form_tokens or not lemma_tokens:
            continue
        pairs.append({"form": form_tokens[0], "lemma": lemma_tokens[0]})
    return pairs


def token_layer(row: Any, profile: dict[str, Any], parser: str) -> dict[str, Any]:
    conllu = str(_row_value(row, "conllu", "")).strip()
    if parser != "forms" and conllu:
        lemmas = conllu_lemma_tokens(conllu, profile)
        if lemmas:
            lemma_pairs = conllu_form_lemma_pairs(conllu, profile)
            source = "lemmas_conllu" if parser == "conllu_import" else f"lemmas_{parser}"
            label = (
                "lemmi CoNLL-U importati"
                if parser == "conllu_import"
                else f"lemmi prodotti da {parser}"
            )
            return {
                "tokens": lemmas,
                "source": source,
                "description": label,
                "coverage": "parziale" if len(lemmas) < len(tokenize(_row_value(row, "normalized_text", ""), profile)) else "completa",
                "lemma_pairs": lemma_pairs,
            }
    tokens = tokenize(_row_value(row, "normalized_text", ""), profile)
    return {
        "tokens": tokens,
        "source": "forms",
        "description": "forme normalizzate",
        "coverage": "testo completo",
        "lemma_pairs": [{"form": token, "lemma": token} for token in tokens],
    }


def parse_requested_terms(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, str):
        return [item.strip() for item in re.split(r"[,;\n]+", value) if item.strip()]
    if isinstance(value, Iterable):
        return [str(item).strip() for item in value if str(item).strip()]
    return []


def families_for_terms(raw_terms: Any, profile: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    requested = parse_requested_terms(raw_terms)
    if not requested:
        return LEGAL_TERM_FAMILIES

    selected = []
    seen = set()
    normalized_requested = {apply_profile(term, profile) for term in requested}
    for family in LEGAL_TERM_FAMILIES:
        aliases = {apply_profile(alias, profile) for alias in family["aliases"]}
        keys = {apply_profile(family["id"], profile), apply_profile(family["label"], profile)}
        if normalized_requested & (aliases | keys):
            selected.append(family)
            seen.add(family["id"])

    known_aliases = {
        apply_profile(alias, profile)
        for family in LEGAL_TERM_FAMILIES
        for alias in family["aliases"]
    }
    for term in requested:
        normalized = apply_profile(term, profile)
        if normalized in known_aliases:
            continue
        custom_id = re.sub(r"[^a-z0-9]+", "_", normalized).strip("_") or "termine"
        if custom_id in seen:
            continue
        selected.append(
            {
                "id": f"custom_{custom_id}",
                "label": term,
                "description": "termine indicato manualmente",
                "lemmas": [term],
                "aliases": [term],
            }
        )
        seen.add(custom_id)
    return selected


def alias_token_sequences(
    aliases: list[str], profile: dict[str, Any] | None = None
) -> list[tuple[str, ...]]:
    sequences = []
    seen = set()
    for alias in aliases:
        sequence = tuple(tokenize(alias, profile))
        if sequence and sequence not in seen:
            sequences.append(sequence)
            seen.add(sequence)
    sequences.sort(key=len, reverse=True)
    return sequences


def family_terms_for_layer(family: dict[str, Any], layer_source: str) -> list[str]:
    if layer_source.startswith("lemmas_") and family.get("lemmas"):
        return [str(item) for item in family["lemmas"]]
    return [str(item) for item in family["aliases"]]


def highlight_terms_for_layer(
    family: dict[str, Any],
    layer: dict[str, Any],
    profile: dict[str, Any] | None = None,
) -> list[str]:
    if not layer["source"].startswith("lemmas_") or not family.get("lemmas"):
        return [str(item) for item in family["aliases"]]
    target_lemmas = {
        token
        for lemma in family.get("lemmas", [])
        for token in tokenize(str(lemma), profile)
    }
    forms = {
        pair["form"]
        for pair in layer.get("lemma_pairs", [])
        if pair.get("lemma") in target_lemmas and pair.get("form")
    }
    return sorted(forms, key=lambda value: (-len(value), value))


def count_sequences(tokens: list[str], sequences: list[tuple[str, ...]]) -> int:
    total = 0
    for sequence in sequences:
        length = len(sequence)
        if length == 1:
            total += tokens.count(sequence[0])
            continue
        for index in range(0, max(0, len(tokens) - length + 1)):
            if tuple(tokens[index : index + length]) == sequence:
                total += 1
    return total


def contexts_for_aliases(
    text: str,
    aliases: list[str],
    profile: dict[str, Any] | None = None,
    width: int = 58,
    limit: int = 3,
) -> list[dict[str, str]]:
    processed = apply_profile(text, profile)
    normalized_aliases = sorted(
        {apply_profile(alias, profile) for alias in aliases if alias.strip()},
        key=len,
        reverse=True,
    )
    if not normalized_aliases:
        return []
    pattern = re.compile(
        r"(?<![^\W\d_])(" + "|".join(re.escape(alias) for alias in normalized_aliases) + r")(?![^\W\d_])",
        re.IGNORECASE,
    )
    rows = []
    for match in pattern.finditer(processed):
        rows.append(
            {
                "left": processed[max(0, match.start() - width) : match.start()],
                "match": match.group(0),
                "right": processed[match.end() : match.end() + width],
            }
        )
        if len(rows) >= limit:
            break
    return rows


def compare_legal_terms(
    rows: list[Any],
    profile: dict[str, Any] | None = None,
    terms: Any = None,
    parser: str = "forms",
) -> dict[str, Any]:
    profile = profile or {"lower": True}
    families = families_for_terms(terms, profile)
    layers = {int(_row_value(row, "id", 0)): token_layer(row, profile, parser) for row in rows}
    documents = []
    warnings = []
    for row in rows:
        layer = layers[int(_row_value(row, "id", 0))]
        if layer["source"] == "lemmas_conllu" and layer["coverage"] == "parziale":
            warnings.append(
                f"{_row_value(row, 'title')}: i lemmi coprono solo la porzione importata in CoNLL-U."
            )
        if parser == "conllu_import" and layer["source"] != "lemmas_conllu":
            warnings.append(
                f"{_row_value(row, 'title')}: nessun CoNLL-U disponibile, uso forme normalizzate."
            )
        if parser not in {"forms", "conllu_import"} and not layer["source"].startswith("lemmas_"):
            warnings.append(
                f"{_row_value(row, 'title')}: il parser selezionato non ha prodotto lemmi, uso forme normalizzate."
            )
        documents.append(
            {
                "id": _row_value(row, "id"),
                "title": _row_value(row, "title"),
                "author": _row_value(row, "author") or "attribuzione non indicata",
                "tokens": len(layer["tokens"]),
                "token_source": layer["source"],
                "token_source_label": layer["description"],
                "coverage": layer["coverage"],
            }
        )

    result_terms = []
    author_totals: dict[str, dict[str, Any]] = defaultdict(
        lambda: {"author": "", "total_count": 0, "terms": Counter()}
    )

    for family in families:
        per_document = []
        total_count = 0
        highlight_terms: set[str] = set()
        counted_terms: set[str] = set()
        for row in rows:
            row_id = int(_row_value(row, "id", 0))
            layer = layers[row_id]
            tokens = layer["tokens"]
            terms_for_count = family_terms_for_layer(family, layer["source"])
            terms_for_highlight = highlight_terms_for_layer(family, layer, profile)
            highlight_terms.update(terms_for_highlight)
            counted_terms.update(terms_for_count)
            sequences = alias_token_sequences(terms_for_count, profile)
            count = count_sequences(tokens, sequences)
            token_count = len(tokens)
            total_count += count
            author = _row_value(row, "author") or "attribuzione non indicata"
            author_totals[author]["author"] = author
            author_totals[author]["total_count"] += count
            author_totals[author]["terms"][family["label"]] += count
            per_document.append(
                {
                    "document_id": _row_value(row, "id"),
                    "title": _row_value(row, "title"),
                    "author": author,
                    "count": count,
                    "per_1000": round(1000 * count / max(token_count, 1), 3),
                    "token_source": layer["source"],
                    "counted_terms": terms_for_count,
                    "highlight_terms": terms_for_highlight,
                    "examples": contexts_for_aliases(
                        _row_value(row, "normalized_text", ""),
                        terms_for_highlight,
                        profile,
                    ),
                }
            )
        result_terms.append(
            {
                "id": family["id"],
                "label": family["label"],
                "description": family["description"],
                "aliases": family["aliases"],
                "counted_terms": sorted(counted_terms),
                "highlights": sorted(highlight_terms, key=lambda value: (-len(value), value)),
                "total_count": total_count,
                "documents": per_document,
            }
        )

    author_rows = []
    for value in author_totals.values():
        author_rows.append(
            {
                "author": value["author"],
                "total_count": value["total_count"],
                "terms": [
                    {"label": label, "count": count}
                    for label, count in value["terms"].most_common()
                ],
            }
        )
    author_rows.sort(key=lambda item: item["total_count"], reverse=True)
    result_terms.sort(key=lambda item: item["total_count"], reverse=True)

    return {
        "documents": documents,
        "terms": result_terms,
        "authors": author_rows,
        "profile": profile,
        "parser": parser,
        "warnings": warnings,
        "method": (
            "Conteggio di famiglie terminologiche giuridiche. Se il parser selezionato "
            "fornisce lemmi, il modulo conta le famiglie sui lemmi; negli altri casi "
            "conta le forme normalizzate."
        ),
    }
