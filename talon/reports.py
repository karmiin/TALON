from __future__ import annotations

import html
import textwrap
from datetime import datetime
from typing import Any


def _escape(value: Any) -> str:
    return html.escape(str(value if value is not None else ""))


def _document_rows(rows: list[Any]) -> str:
    return "\n".join(
        f"""
        <tr>
          <td>{_escape(row['title'])}</td>
          <td>{_escape(row['author'] or 'attribuzione non indicata')}</td>
          <td>{_escape(row['date_label'] or 'non indicata')}</td>
          <td>{_escape(row['genre'] or 'non indicato')}</td>
          <td>{_escape(row['period'] or 'non indicato')}</td>
        </tr>
        """
        for row in rows
    )


def _legal_rows(legal_result: dict[str, Any]) -> str:
    rows = []
    for term in legal_result.get("terms", [])[:12]:
        values = "".join(
            f"<td>{item['count']}<small>{item['per_1000']}/1000</small></td>"
            for item in term["documents"]
        )
        rows.append(
            f"""
            <tr>
              <th>{_escape(term['label'])}<small>{_escape(term['description'])}</small></th>
              <td>{term['total_count']}</td>
              {values}
            </tr>
            """
        )
    return "\n".join(rows)


def _legal_head(legal_result: dict[str, Any]) -> str:
    return "".join(
        f"<th>{_escape(document['title'])}<small>{_escape(document.get('token_source_label', ''))}</small></th>"
        for document in legal_result.get("documents", [])
    )


def _warning_rows(legal_result: dict[str, Any]) -> str:
    warnings = legal_result.get("warnings", [])
    if not warnings:
        return ""
    return "".join(f"<p class='notice'>{_escape(warning)}</p>" for warning in warnings)


def _module_rows(module_catalog: dict[str, Any]) -> str:
    modules = (
        module_catalog.get("analyses", [])
        + module_catalog.get("parsers", [])
        + module_catalog.get("integrations", [])
    )
    return "\n".join(
        f"""
        <tr>
          <td>{_escape(module['label'])}</td>
          <td>{_escape(module['category'])}</td>
          <td>{_escape(module['status'])}</td>
          <td>{_escape(module['description'])}</td>
        </tr>
        """
        for module in modules
    )


def _selected_module_rows(module_catalog: dict[str, Any], selected_ids: list[str]) -> str:
    if not selected_ids:
        return ""
    by_id = {module["id"]: module for module in module_catalog.get("modules", [])}
    rows = []
    for module_id in selected_ids:
        module = by_id.get(module_id)
        if not module:
            rows.append(
                f"<tr><td>{_escape(module_id)}</td><td>non registrato</td><td></td></tr>"
            )
            continue
        rows.append(
            f"""
            <tr>
              <td>{_escape(module['label'])}</td>
              <td>{_escape(module['category'])}</td>
              <td>{_escape(module['description'])}</td>
            </tr>
            """
        )
    return "\n".join(rows)


def _module_label(module_catalog: dict[str, Any], module_id: str) -> str:
    for module in module_catalog.get("modules", []):
        if module.get("id") == module_id:
            return str(module.get("label") or module_id)
    return module_id


def _run_status_rows(
    module_catalog: dict[str, Any],
    module_order: list[str],
    summary: dict[str, Any],
) -> str:
    rows = []
    for module_id in module_order:
        item = summary.get(module_id, {})
        rows.append(
            f"""
            <tr>
              <td>{_escape(_module_label(module_catalog, module_id))}</td>
              <td>{_escape(item.get('status', ''))}</td>
              <td>{_escape(item.get('message', ''))}</td>
            </tr>
            """
        )
    return "\n".join(rows)


def _lexicon_report(summary: dict[str, Any]) -> str:
    item = summary.get("lexicon")
    if not item or not item.get("documents"):
        return ""
    rows = []
    for document in item.get("documents", []):
        top_words = ", ".join(word.get("term", "") for word in document.get("top_words", []))
        rows.append(
            f"""
            <tr>
              <td>{_escape(document.get('title'))}</td>
              <td>{_escape(document.get('token_count'))}</td>
              <td>{_escape(document.get('type_count'))}</td>
              <td>{_escape(document.get('mattr_50'))}</td>
              <td>{_escape(top_words)}</td>
            </tr>
            """
        )
    return f"""
    <section>
      <h2>Lessico</h2>
      <table>
        <thead><tr><th>Documento</th><th>Parole</th><th>Forme</th><th>MATTR</th><th>Parole principali</th></tr></thead>
        <tbody>{''.join(rows)}</tbody>
      </table>
    </section>
    """


def _legal_run_report(summary: dict[str, Any]) -> str:
    item = summary.get("legal_terms")
    if not item or not item.get("terms"):
        return ""
    rows = []
    for term in item.get("terms", []):
        docs = "; ".join(
            f"{document.get('title')}: {document.get('count')} ({document.get('per_1000')}/1000)"
            for document in term.get("documents", [])
        )
        rows.append(
            f"""
            <tr>
              <td>{_escape(term.get('label'))}</td>
              <td>{_escape(term.get('total_count'))}</td>
              <td>{_escape(docs)}</td>
            </tr>
            """
        )
    warnings = "".join(f"<p class='notice'>{_escape(warning)}</p>" for warning in item.get("warnings", []))
    return f"""
    <section>
      <h2>Termini giuridici</h2>
      {warnings}
      <table>
        <thead><tr><th>Famiglia</th><th>Totale</th><th>Distribuzione</th></tr></thead>
        <tbody>{''.join(rows)}</tbody>
      </table>
    </section>
    """


def _stylometry_section(summary: dict[str, Any], module_id: str, title: str) -> str:
    item = summary.get(module_id)
    if not item or not item.get("pairs"):
        return ""
    rows = []
    for pair in item.get("pairs", []):
        contributors = ", ".join(
            str(contributor.get("feature", ""))
            for contributor in pair.get("contributors", [])
        )
        rows.append(
            f"""
            <tr>
              <td>{_escape(pair.get('left_title'))} / {_escape(pair.get('right_title'))}</td>
              <td>{_escape(pair.get('delta'))}</td>
              <td>{_escape(pair.get('cosine'))}</td>
              <td>{_escape(contributors)}</td>
            </tr>
            """
        )
    warnings = "".join(f"<p class='notice'>{_escape(warning)}</p>" for warning in item.get("warnings", []))
    profile_labels = {
        "words": "parole frequenti",
        "function": "parole grammaticali",
        "char3": "sequenze grafiche di tre caratteri",
    }
    profile_label = profile_labels.get(item.get("feature_type"), item.get("feature_type"))
    return f"""
    <section>
      <h2>{_escape(title)}</h2>
      <p>Profilo usato: {_escape(profile_label)}.</p>
      {warnings}
      <table>
        <thead><tr><th>Coppia</th><th>Delta</th><th>Coseno</th><th>Contributi principali</th></tr></thead>
        <tbody>{''.join(rows)}</tbody>
      </table>
    </section>
    """


def _stylometry_report(summary: dict[str, Any]) -> str:
    return (
        _stylometry_section(summary, "stylometry", "Stilometria")
        + _stylometry_section(summary, "function_words", "Function words")
    )


def _parallel_report(summary: dict[str, Any]) -> str:
    item = summary.get("parallel_passages")
    if not item or not item.get("pairs"):
        return ""
    rows = []
    for pair in item.get("pairs", []):
        rows.append(
            f"""
            <tr>
              <td>{_escape(pair.get('left_title'))} / {_escape(pair.get('right_title'))}</td>
              <td>{_escape(pair.get('similarity'))}</td>
              <td>{_escape(', '.join(pair.get('shared_terms', [])))}</td>
            </tr>
            """
        )
    warning = f"<p class='notice'>{_escape(item.get('warning'))}</p>" if item.get("warning") else ""
    return f"""
    <section>
      <h2>Passi simili</h2>
      {warning}
      <table>
        <thead><tr><th>Coppia</th><th>Similarita</th><th>Termini condivisi</th></tr></thead>
        <tbody>{''.join(rows)}</tbody>
      </table>
    </section>
    """


def _affinity_report(summary: dict[str, Any]) -> str:
    item = summary.get("textual_affinity")
    if not item or (not item.get("merges") and not item.get("pca")):
        return ""
    rows = []
    for merge in item.get("merges", []):
        rows.append(
            f"""
            <tr>
              <td>{_escape(' + '.join(merge.get('left', [])))}</td>
              <td>{_escape(' + '.join(merge.get('right', [])))}</td>
              <td>{_escape(merge.get('distance'))}</td>
              <td>{_escape(', '.join(merge.get('shared_terms', [])))}</td>
            </tr>
            """
        )
    warning = f"<p class='notice'>{_escape(item.get('warning'))}</p>" if item.get("warning") else ""
    return f"""
    <section>
      <h2>PCA lessicale</h2>
      {warning}
      <p>{_escape(item.get('method'))}</p>
      <table>
        <thead><tr><th>Gruppo A</th><th>Gruppo B</th><th>Distanza</th><th>Termini condivisi</th></tr></thead>
        <tbody>{''.join(rows)}</tbody>
      </table>
    </section>
    """


def _report_style_info(style: str) -> dict[str, str]:
    if style == "technical_appendix":
        return {
            "label": "Appendice tecnica",
            "class": "technical",
            "description": "Output denso con parametri, stato moduli e risultati serializzabili.",
        }
    return {
        "label": "Report di ricerca",
        "class": "brief",
        "description": "Sintesi leggibile dei risultati principali del run.",
    }


def _generic_module_report(
    summary: dict[str, Any],
    module_catalog: dict[str, Any],
    module_order: list[str],
) -> str:
    builtin = {"lexicon", "legal_terms", "stylometry", "function_words", "parallel_passages", "textual_affinity", "voyant_export"}
    rows = []
    for module_id in module_order:
        if module_id in builtin:
            continue
        item = summary.get(module_id, {})
        result = item.get("result", "")
        if not result:
            continue
        rows.append(
            f"""
            <tr>
              <td>{_escape(_module_label(module_catalog, module_id))}</td>
              <td><pre>{_escape(result)}</pre></td>
            </tr>
            """
        )
    if not rows:
        return ""
    return f"""
    <section>
      <h2>Output moduli esterni</h2>
      <table>
        <thead><tr><th>Modulo</th><th>Risultato</th></tr></thead>
        <tbody>{''.join(rows)}</tbody>
      </table>
    </section>
    """


def _pdf_hex_string(value: Any) -> str:
    raw = str(value if value is not None else "").encode("cp1252", "replace")
    return "<" + raw.hex().upper() + ">"


def _append_wrapped_pdf_line(
    items: list[tuple[str, str]],
    style: str,
    text: Any,
    width: int = 96,
) -> None:
    value = " ".join(str(text if text is not None else "").split())
    if not value:
        items.append(("blank", ""))
        return
    for line in textwrap.wrap(value, width=width, break_long_words=False) or [""]:
        items.append((style, line))


def _run_report_pdf_items(
    rows: list[Any],
    module_catalog: dict[str, Any],
    run: dict[str, Any],
) -> list[tuple[str, str]]:
    parameters = run.get("parameters", {})
    module_order = [str(item) for item in parameters.get("modules", [])]
    summary = parameters.get("summary", {})
    style = str(parameters.get("report_style", "research_brief"))
    style_info = _report_style_info(style)
    compact = style == "technical_appendix"
    limit = 14 if compact else 8
    generated = datetime.now().strftime("%d/%m/%Y %H:%M")

    items: list[tuple[str, str]] = []
    items.append(("title", f"TALON - {style_info['label']} #{run.get('id')}"))
    items.append(("body", f"Generato: {generated} | Run: {run.get('created_at', '')} | Stile: {style_info['label']}"))
    items.append(("small", style_info["description"]))
    items.append(("blank", ""))

    items.append(("section", "Documenti inclusi"))
    for row in rows:
        _append_wrapped_pdf_line(
            items,
            "body",
            f"- {row['title']} | {row['author'] or 'attribuzione non indicata'} | "
            f"{row['date_label'] or 'data non indicata'} | {row['genre'] or 'genere non indicato'}",
        )
    items.append(("blank", ""))

    items.append(("section", "Configurazione"))
    _append_wrapped_pdf_line(items, "body", f"Parser: {parameters.get('parser', 'non indicato')}")
    _append_wrapped_pdf_line(items, "body", f"Normalizzazione: {parameters.get('profile', {})}")
    _append_wrapped_pdf_line(items, "body", f"Moduli: {', '.join(module_order) or 'non indicati'}")
    if compact:
        _append_wrapped_pdf_line(items, "body", f"Documento IDs: {[row['id'] for row in rows]}")
    items.append(("blank", ""))

    items.append(("section", "Stato moduli"))
    for module_id in module_order:
        item = summary.get(module_id, {})
        label = _module_label(module_catalog, module_id)
        message = item.get("message", "")
        _append_wrapped_pdf_line(
            items,
            "body",
            f"- {label}: {item.get('status', 'non eseguito')}. {message}",
        )
    items.append(("blank", ""))

    lexicon = summary.get("lexicon")
    if lexicon and lexicon.get("documents"):
        items.append(("section", "Lessico"))
        for document in lexicon.get("documents", [])[:limit]:
            top_words = ", ".join(word.get("term", "") for word in document.get("top_words", [])[:6])
            _append_wrapped_pdf_line(
                items,
                "body",
                f"- {document.get('title')}: parole {document.get('token_count')}, "
                f"forme {document.get('type_count')}, MATTR {document.get('mattr_50')}. "
                f"Parole principali: {top_words}",
            )
        items.append(("blank", ""))

    legal = summary.get("legal_terms")
    if legal and legal.get("terms"):
        items.append(("section", "Termini giuridici"))
        for term in legal.get("terms", [])[:limit]:
            docs = "; ".join(
                f"{document.get('title')}: {document.get('count')} ({document.get('per_1000')}/1000)"
                for document in term.get("documents", [])[:4]
            )
            _append_wrapped_pdf_line(
                items,
                "body",
                f"- {term.get('label')}: totale {term.get('total_count')}. {docs}",
            )
        for warning in legal.get("warnings", [])[:4]:
            _append_wrapped_pdf_line(items, "small", f"Nota: {warning}")
        items.append(("blank", ""))

    profile_labels = {
        "words": "parole frequenti",
        "function": "parole grammaticali",
        "char3": "sequenze grafiche di tre caratteri",
    }
    for stylometry_id, title in (("stylometry", "Stilometria"), ("function_words", "Function words")):
        stylometry = summary.get(stylometry_id)
        if stylometry and stylometry.get("pairs"):
            items.append(("section", title))
            _append_wrapped_pdf_line(
                items,
                "body",
                f"Profilo usato: {profile_labels.get(stylometry.get('feature_type'), stylometry.get('feature_type'))}.",
            )
            for pair in stylometry.get("pairs", [])[:limit]:
                contributors = ", ".join(
                    str(contributor.get("feature", ""))
                    for contributor in pair.get("contributors", [])[:5]
                )
                _append_wrapped_pdf_line(
                    items,
                    "body",
                    f"- {pair.get('left_title')} / {pair.get('right_title')}: "
                    f"Delta {pair.get('delta')}, coseno {pair.get('cosine')}. "
                    f"Contributi: {contributors}",
                )
            items.append(("blank", ""))

    parallels = summary.get("parallel_passages")
    if parallels and parallels.get("pairs"):
        items.append(("section", "Passi simili"))
        for pair in parallels.get("pairs", [])[:limit]:
            _append_wrapped_pdf_line(
                items,
                "body",
                f"- {pair.get('left_title')} / {pair.get('right_title')}: "
                f"similarita {pair.get('similarity')}; termini condivisi: "
                f"{', '.join(pair.get('shared_terms', [])[:8])}",
            )
        if parallels.get("warning"):
            _append_wrapped_pdf_line(items, "small", f"Nota: {parallels.get('warning')}")

    affinity = summary.get("textual_affinity")
    if affinity and (affinity.get("merges") or affinity.get("pca")):
        items.append(("blank", ""))
        items.append(("section", "PCA lessicale"))
        if affinity.get("warning"):
            _append_wrapped_pdf_line(items, "small", f"Nota: {affinity.get('warning')}")
        for merge in affinity.get("merges", [])[:limit]:
            _append_wrapped_pdf_line(
                items,
                "body",
                f"- {' + '.join(merge.get('left', []))} / {' + '.join(merge.get('right', []))}: "
                f"distanza {merge.get('distance')}; termini condivisi: {', '.join(merge.get('shared_terms', [])[:8])}",
            )

    builtin = {"lexicon", "legal_terms", "stylometry", "function_words", "parallel_passages", "textual_affinity", "voyant_export"}
    external_rows = [
        (module_id, summary.get(module_id, {}))
        for module_id in module_order
        if module_id not in builtin and summary.get(module_id, {}).get("result")
    ]
    if external_rows:
        items.append(("blank", ""))
        items.append(("section", "Output moduli esterni"))
        for module_id, item in external_rows[:limit]:
            _append_wrapped_pdf_line(
                items,
                "body",
                f"- {_module_label(module_catalog, module_id)}: {item.get('result')}",
            )
    return items


def render_run_report_pdf(
    rows: list[Any],
    module_catalog: dict[str, Any],
    run: dict[str, Any],
) -> bytes:
    items = _run_report_pdf_items(rows, module_catalog, run)
    page_width = 595
    page_height = 842
    margin_x = 48
    y_start = 792
    y_min = 52
    styles = {
        "title": (18, "F2", 25),
        "section": (13, "F2", 19),
        "body": (10, "F1", 14),
        "small": (8, "F1", 12),
        "blank": (8, "F1", 8),
    }
    pages: list[list[tuple[str, str, int]]] = [[]]
    y = y_start
    for style, text in items:
        size, font, line_height = styles.get(style, styles["body"])
        if y - line_height < y_min:
            pages.append([])
            y = y_start
        pages[-1].append((font, text, y))
        y -= line_height

    objects: list[bytes] = [b"", b""]

    def add_object(data: bytes) -> int:
        objects.append(data)
        return len(objects)

    font_regular = add_object(
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"
    )
    font_bold = add_object(
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>"
    )
    page_ids: list[int] = []
    for page in pages:
        commands: list[str] = []
        for font, text, y_position in page:
            size = 10 if font == "F1" else 13
            if y_position == y_start and font == "F2":
                size = 18
            elif font == "F2":
                size = 13
            commands.append(
                f"BT /{font} {size} Tf {margin_x} {y_position} Td {_pdf_hex_string(text)} Tj ET"
            )
        stream = "\n".join(commands).encode("ascii")
        content_id = add_object(
            b"<< /Length "
            + str(len(stream)).encode("ascii")
            + b" >>\nstream\n"
            + stream
            + b"\nendstream"
        )
        page_id = add_object(
            (
                f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {page_width} {page_height}] "
                f"/Resources << /Font << /F1 {font_regular} 0 R /F2 {font_bold} 0 R >> >> "
                f"/Contents {content_id} 0 R >>"
            ).encode("ascii")
        )
        page_ids.append(page_id)

    objects[0] = b"<< /Type /Catalog /Pages 2 0 R >>"
    kids = " ".join(f"{page_id} 0 R" for page_id in page_ids)
    objects[1] = f"<< /Type /Pages /Kids [{kids}] /Count {len(page_ids)} >>".encode("ascii")

    output = bytearray(b"%PDF-1.4\n%\xE2\xE3\xCF\xD3\n")
    offsets = [0]
    for index, data in enumerate(objects, start=1):
        offsets.append(len(output))
        output.extend(f"{index} 0 obj\n".encode("ascii"))
        output.extend(data)
        output.extend(b"\nendobj\n")
    xref_offset = len(output)
    output.extend(f"xref\n0 {len(objects) + 1}\n".encode("ascii"))
    output.extend(b"0000000000 65535 f \n")
    for offset in offsets[1:]:
        output.extend(f"{offset:010d} 00000 n \n".encode("ascii"))
    output.extend(
        (
            f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\n"
            f"startxref\n{xref_offset}\n%%EOF\n"
        ).encode("ascii")
    )
    return bytes(output)


def render_run_report_html(
    rows: list[Any],
    module_catalog: dict[str, Any],
    run: dict[str, Any],
) -> bytes:
    parameters = run.get("parameters", {})
    module_order = [str(item) for item in parameters.get("modules", [])]
    summary = parameters.get("summary", {})
    style = str(parameters.get("report_style", "research_brief"))
    style_info = _report_style_info(style)
    generated = datetime.now().strftime("%d/%m/%Y %H:%M")
    run_created = run.get("created_at", "")
    title = f"TALON - {style_info['label']} run #{_escape(run.get('id'))}"
    html_value = f"""<!doctype html>
<html lang="it">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{title}</title>
  <style>
    :root {{
      --ink: #17201d;
      --muted: #5d6863;
      --line: #d8ded8;
      --paper: #f7f8f6;
      --panel: #ffffff;
      --accent: #1f4b3d;
    }}
    * {{ box-sizing: border-box; }}
    body {{
      margin: 0;
      color: var(--ink);
      background: var(--paper);
      font: 14px/1.55 Inter, ui-sans-serif, system-ui, "Segoe UI", sans-serif;
    }}
    body.technical {{ font-size: 12px; }}
    main {{
      width: min(1080px, calc(100% - 40px));
      margin: 0 auto;
      padding: 32px 0 64px;
    }}
    header.report-header {{
      display: flex;
      justify-content: space-between;
      gap: 24px;
      padding: 26px;
      color: white;
      background: var(--accent);
      border-radius: 18px;
    }}
    h1, h2 {{ margin: 0; letter-spacing: -0.02em; }}
    h1 {{ font-size: 30px; }}
    h2 {{ margin-bottom: 12px; font-size: 18px; }}
    p {{ margin-top: 0; }}
    section {{
      margin-top: 18px;
      padding: 22px;
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 16px;
    }}
    table {{ width: 100%; border-collapse: collapse; }}
    th, td {{
      padding: 10px 8px;
      border-bottom: 1px solid var(--line);
      text-align: left;
      vertical-align: top;
    }}
    th small, td small {{
      display: block;
      color: var(--muted);
      font-size: 11px;
      font-weight: 500;
    }}
    .notice {{
      margin: 8px 0;
      padding: 8px 10px;
      color: #6c4b16;
      background: #fff7e2;
      border: 1px solid #ead39a;
      border-radius: 8px;
      font-size: 12px;
    }}
    .actions {{ display: flex; gap: 10px; margin-top: 14px; }}
    .report-button {{
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 10px 14px;
      color: white;
      background: var(--accent);
      border: 0;
      border-radius: 9px;
      cursor: pointer;
      font-weight: 700;
      text-decoration: none;
    }}
    @media print {{
      body {{ background: white; }}
      main {{ width: 100%; padding: 0; }}
      section, header.report-header {{ border-radius: 0; box-shadow: none; }}
      .actions {{ display: none; }}
    }}
  </style>
</head>
<body class="{_escape(style_info['class'])}">
  <main>
    <header class="report-header">
      <div>
        <h1>{title}</h1>
        <p>{_escape(style_info['description'])}</p>
      </div>
      <div>
        <strong>{len(rows)} testi</strong><br>
        <span>Run: {_escape(run_created)}</span><br>
        <span>Generato: {_escape(generated)}</span>
        <div class="actions">
          <button class="report-button" onclick="window.print()">Stampa</button>
          <a class="report-button" href="/report/run/{_escape(run.get('id'))}.pdf">Scarica PDF</a>
        </div>
      </div>
    </header>

    <section>
      <h2>Documenti inclusi</h2>
      <table>
        <thead><tr><th>Titolo</th><th>Autore</th><th>Data</th><th>Genere</th><th>Periodo</th></tr></thead>
        <tbody>{_document_rows(rows)}</tbody>
      </table>
    </section>

    <section>
      <h2>Configurazione del run</h2>
      <table>
        <tbody>
          <tr><th>Parser</th><td>{_escape(parameters.get('parser', 'non indicato'))}</td></tr>
          <tr><th>Profilo normalizzazione</th><td>{_escape(parameters.get('profile', {}))}</td></tr>
          <tr><th>Stile report</th><td>{_escape(parameters.get('report_style', 'non indicato'))}</td></tr>
          <tr><th>Moduli</th><td>{_escape(', '.join(module_order))}</td></tr>
          {f"<tr><th>Document IDs</th><td>{_escape([row['id'] for row in rows])}</td></tr>" if style == "technical_appendix" else ""}
        </tbody>
      </table>
    </section>

    <section>
      <h2>Stato moduli</h2>
      <table>
        <thead><tr><th>Modulo</th><th>Stato</th><th>Messaggio</th></tr></thead>
        <tbody>{_run_status_rows(module_catalog, module_order, summary)}</tbody>
      </table>
    </section>

    {_lexicon_report(summary)}
    {_legal_run_report(summary)}
    {_stylometry_report(summary)}
    {_affinity_report(summary)}
    {_parallel_report(summary)}
    {_generic_module_report(summary, module_catalog, module_order)}
  </main>
</body>
</html>
"""
    return html_value.encode("utf-8")


def render_report_html(
    rows: list[Any],
    module_catalog: dict[str, Any],
    legal_result: dict[str, Any],
    style: str = "research_brief",
    selection: dict[str, Any] | None = None,
) -> bytes:
    compact = style == "technical_appendix"
    selection = selection or {}
    selected_modules = [str(item) for item in selection.get("modules", []) if str(item)]
    generated = datetime.now().strftime("%d/%m/%Y %H:%M")
    title = "TALON - report tecnico" if compact else "TALON - report di ricerca"
    body_class = "compact" if compact else ""
    html_value = f"""<!doctype html>
<html lang="it">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{_escape(title)}</title>
  <style>
    :root {{
      --ink: #17201d;
      --muted: #5d6863;
      --line: #d8ded8;
      --paper: #f7f8f6;
      --panel: #ffffff;
      --accent: #1f4b3d;
    }}
    * {{ box-sizing: border-box; }}
    body {{
      margin: 0;
      color: var(--ink);
      background: var(--paper);
      font: 14px/1.55 Inter, ui-sans-serif, system-ui, "Segoe UI", sans-serif;
    }}
    main {{
      width: min(1080px, calc(100% - 40px));
      margin: 0 auto;
      padding: 32px 0 64px;
    }}
    header.report-header {{
      display: flex;
      justify-content: space-between;
      gap: 24px;
      padding: 26px;
      color: white;
      background: var(--accent);
      border-radius: 18px;
    }}
    h1, h2 {{ margin: 0; letter-spacing: -0.02em; }}
    h1 {{ font-size: 30px; }}
    h2 {{ margin-bottom: 12px; font-size: 18px; }}
    p {{ margin-top: 0; }}
    section {{
      margin-top: 18px;
      padding: 22px;
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 16px;
    }}
    table {{ width: 100%; border-collapse: collapse; }}
    th, td {{
      padding: 10px 8px;
      border-bottom: 1px solid var(--line);
      text-align: left;
      vertical-align: top;
    }}
    th small, td small {{
      display: block;
      color: var(--muted);
      font-size: 11px;
      font-weight: 500;
    }}
    .pipeline {{
      display: grid;
      grid-template-columns: repeat(6, 1fr);
      gap: 8px;
    }}
    .stage {{
      padding: 10px;
      background: #eef4f0;
      border-radius: 10px;
      font-size: 12px;
    }}
    .stage strong {{ display: block; margin-bottom: 4px; }}
    .actions {{ display: flex; gap: 10px; margin-top: 14px; }}
    .notice {{
      margin: 8px 0;
      padding: 8px 10px;
      color: #6c4b16;
      background: #fff7e2;
      border: 1px solid #ead39a;
      border-radius: 8px;
      font-size: 12px;
    }}
    button {{
      padding: 10px 14px;
      color: white;
      background: var(--accent);
      border: 0;
      border-radius: 9px;
      cursor: pointer;
      font-weight: 700;
    }}
    .compact section {{ padding: 16px; }}
    .compact body, .compact table {{ font-size: 12px; }}
    @media print {{
      body {{ background: white; }}
      main {{ width: 100%; padding: 0; }}
      section, header.report-header {{ border-radius: 0; box-shadow: none; }}
      .actions {{ display: none; }}
    }}
  </style>
</head>
<body class="{body_class}">
  <main>
    <header class="report-header">
      <div>
        <h1>{_escape(title)}</h1>
        <p>Report stampabile generato sui testi selezionati. I risultati sono indizi esplorativi da verificare sul testo.</p>
      </div>
      <div>
        <strong>{len(rows)} testi</strong><br>
        <span>Generato: {_escape(generated)}</span>
        <div class="actions"><button onclick="window.print()">Stampa / salva PDF</button></div>
      </div>
    </header>

    <section>
      <h2>Documenti inclusi</h2>
      <table>
        <thead><tr><th>Titolo</th><th>Autore</th><th>Data</th><th>Genere</th><th>Periodo</th></tr></thead>
        <tbody>{_document_rows(rows)}</tbody>
      </table>
    </section>

    <section>
      <h2>Configurazione</h2>
      <table>
        <tbody>
          <tr><th>Parser selezionato</th><td>{_escape(selection.get('parser', 'non indicato'))}</td></tr>
          <tr><th>Profilo normalizzazione</th><td>{_escape(selection.get('profile', legal_result.get('profile', {})))}</td></tr>
          <tr><th>Stile report</th><td>{_escape(style)}</td></tr>
          <tr><th>Moduli selezionati</th><td>{_escape(', '.join(selected_modules) if selected_modules else 'report manuale')}</td></tr>
        </tbody>
      </table>
    </section>

    {f'''
    <section>
      <h2>Moduli eseguiti nella pipeline</h2>
      <table>
        <thead><tr><th>Modulo</th><th>Categoria</th><th>Descrizione</th></tr></thead>
        <tbody>{_selected_module_rows(module_catalog, selected_modules)}</tbody>
      </table>
    </section>
    ''' if selected_modules else ''}

    <section>
      <h2>Pipeline configurabile</h2>
      <div class="pipeline">
        {''.join(f"<div class='stage'><strong>{_escape(stage['label'])}</strong>{_escape(stage['description'])}</div>" for stage in module_catalog.get('pipeline', []))}
      </div>
    </section>

    <section>
      <h2>Termini giuridici</h2>
      <p>{_escape(legal_result.get('method', ''))}</p>
      {_warning_rows(legal_result)}
      <table>
        <thead><tr><th>Famiglia</th><th>Totale</th>{_legal_head(legal_result)}</tr></thead>
        <tbody>{_legal_rows(legal_result)}</tbody>
      </table>
    </section>

    <section>
      <h2>Moduli disponibili</h2>
      <table>
        <thead><tr><th>Modulo</th><th>Categoria</th><th>Stato</th><th>Descrizione</th></tr></thead>
        <tbody>{_module_rows(module_catalog)}</tbody>
      </table>
    </section>
  </main>
</body>
</html>
"""
    return html_value.encode("utf-8")
