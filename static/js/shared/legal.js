export const LEGAL_TONE_COUNT = 8;

export function legalToneClass(index) {
  return `legal-tone-${index % LEGAL_TONE_COUNT}`;
}

export function highlightLegalFamiliesInText(ctx, text, rows, options = {}) {
  const preferredTerms = options.termsKey || "highlights";
  const entries = [];
  rows.forEach((row, index) => {
    const terms = row[preferredTerms]?.length
      ? row[preferredTerms]
      : row.highlights?.length
        ? row.highlights
        : row.aliases || [];
    for (const alias of terms) {
      const clean = String(alias || "").trim();
      if (clean) entries.push({ alias: clean, label: row.label, tone: legalToneClass(index) });
    }
  });
  const unique = new Map();
  entries
    .sort((a, b) => b.alias.length - a.alias.length)
    .forEach((item) => {
      const key = item.alias.toLocaleLowerCase();
      if (!unique.has(key)) unique.set(key, item);
    });
  const aliases = [...unique.values()];
  if (!aliases.length) return ctx.escapeHtml(text);
  const pattern = new RegExp(`(${aliases.map((item) => item.alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
  let cursor = 0;
  let output = "";
  for (const match of text.matchAll(pattern)) {
    const key = match[0].toLocaleLowerCase();
    const family = unique.get(key);
    output += ctx.escapeHtml(text.slice(cursor, match.index));
    output += `<mark class="legal-hit ${ctx.escapeHtml(family?.tone || legalToneClass(0))}" title="${ctx.escapeHtml(family?.label || "termine giuridico")}">${ctx.escapeHtml(match[0])}</mark>`;
    cursor = match.index + match[0].length;
  }
  output += ctx.escapeHtml(text.slice(cursor));
  return output;
}

export function renderLegalEvidenceTexts(ctx, payload, visibleRows) {
  if (!payload.evidence_texts?.length) return "";
  const activeRows = visibleRows.filter((term) => Number(term.total_count || 0) > 0);
  return `
    <div class="legal-evidence-block">
      <div class="result-heading">
        <div>
          <p class="eyebrow">Validazione sul testo</p>
          <h2>Testi completi con termini evidenziati</h2>
          <p>Qui si controllano direttamente le occorrenze nel contesto della trascrizione.</p>
        </div>
      </div>
      <div class="legal-legend">
        <strong class="legal-legend-title">Legenda evidenziazioni</strong>
        ${activeRows.map((term, index) => `
          <span class="legal-legend-item">
            <mark class="legal-swatch legal-hit ${legalToneClass(index)}"></mark>
            <span>${ctx.escapeHtml(term.label)}</span>
            <b>${term.total_count}</b>
          </span>
        `).join("") || `<span>Nessuna occorrenza da evidenziare.</span>`}
      </div>
      <div class="legal-text-grid">
        ${payload.evidence_texts.map((document) => `
          <article class="legal-text-card">
            <header>
              <strong>${ctx.escapeHtml(document.title)}</strong>
              <small>${ctx.escapeHtml(document.token_source_label || document.author)}${document.coverage ? ` · ${ctx.escapeHtml(document.coverage)}` : ""}</small>
            </header>
            <div class="legal-text-views ${document.lemma_text ? "has-lemmas" : ""}">
              <section>
                <span>Testo originale</span>
                <pre>${highlightLegalFamiliesInText(ctx, document.text, activeRows, { termsKey: "highlights" })}</pre>
              </section>
              ${document.lemma_text ? `
                <section>
                  <span>Lemmi usati nel conteggio</span>
                  <pre>${highlightLegalFamiliesInText(ctx, document.lemma_text, activeRows, { termsKey: "counted_terms" })}</pre>
                </section>
              ` : ""}
            </div>
          </article>
        `).join("")}
      </div>
    </div>
  `;
}

export function renderLegalDocumentHits(ctx, term) {
  const hits = (term.documents || []).filter((item) => Number(item.count || 0) > 0);
  if (!hits.length) return `<span class="muted">Nessuna occorrenza nei testi selezionati.</span>`;
  return `
    <div class="legal-doc-hits">
      ${hits.map((item) => `
        <span>
          <strong>${ctx.escapeHtml(item.title)}</strong>
          ${item.count} occ. · ${ctx.formatNumber(item.per_1000, 2)} / 1000
        </span>
      `).join("")}
    </div>
  `;
}

export function renderLegalAliases(ctx, term) {
  const aliases = (term.counted_terms?.length ? term.counted_terms : term.aliases || []).slice(0, 8);
  if (!aliases.length) return `<span class="muted">Non dichiarate.</span>`;
  return aliases.map((alias) => `<code>${ctx.escapeHtml(alias)}</code>`).join(" ");
}

export function renderLegalTermTable(ctx, terms) {
  return `
    <div class="legal-table-wrap">
      <table class="legal-table legal-term-table">
        <thead>
          <tr>
            <th>Famiglia</th>
            <th>Totale</th>
            <th>Distribuzione nei testi</th>
            <th>Termini conteggiati</th>
          </tr>
        </thead>
        <tbody>
          ${terms.map((term) => `
            <tr>
              <th>
                ${ctx.escapeHtml(term.label)}
                <small>${ctx.escapeHtml(term.description)}</small>
              </th>
              <td><strong>${term.total_count}</strong></td>
              <td>${renderLegalDocumentHits(ctx, term)}</td>
              <td class="legal-aliases">${renderLegalAliases(ctx, term)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

export function renderLegalTermResults(ctx, payload, targetSelector = "#compare-results") {
  const documents = payload.documents;
  const rows = payload.terms.filter((term) => term.total_count > 0);
  const visibleRows = rows.length ? rows : payload.terms.slice(0, 8);
  const totalHits = visibleRows.reduce((sum, term) => sum + Number(term.total_count || 0), 0);
  ctx.$(targetSelector).innerHTML = `
    <section class="panel result-panel">
      <div class="result-heading">
        <div>
          <p class="eyebrow">Modulo termini giuridici</p>
          <h2>Termini giuridici evidenziati</h2>
          <p>${ctx.escapeHtml(payload.method)}</p>
        </div>
        <span class="badge">${totalHits} occorrenze</span>
      </div>
      <div class="warning-list">${(payload.warnings || []).map((warning) => `<div class="warning">${ctx.escapeHtml(warning)}</div>`).join("")}</div>

      <div class="legal-summary-strip">
        <article><strong>${visibleRows.length}</strong><span>famiglie mostrate</span></article>
        <article><strong>${documents.length}</strong><span>testi analizzati</span></article>
        <article><strong>${ctx.escapeHtml(documents[0]?.token_source_label || "forme normalizzate")}</strong><span>livello linguistico</span></article>
      </div>

      ${renderLegalEvidenceTexts(ctx, payload, visibleRows)}
    </section>
  `;
}
