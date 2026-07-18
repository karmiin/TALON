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
    if (clean) entries.push({ alias: clean, label: row.label, tone: legalToneClass(index), family: String(index) });
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
    output += `<mark class="legal-hit ${ctx.escapeHtml(family?.tone || legalToneClass(0))}" data-legal-family="${ctx.escapeHtml(family?.family || "0")}" title="${ctx.escapeHtml(family?.label || "termine giuridico")}">${ctx.escapeHtml(match[0])}</mark>`;
    cursor = match.index + match[0].length;
  }
  output += ctx.escapeHtml(text.slice(cursor));
  return output;
}

export function renderLegalEvidenceTexts(ctx, payload, visibleRows) {
  if (!payload.evidence_texts?.length) return "";
  const activeRows = visibleRows.filter((term) => Number(term.total_count || 0) > 0);
  return `
    <div class="legal-evidence-block" data-legal-browser>
      <div class="legal-evidence-heading">
        <div>
          <h3>Famiglie rilevate</h3>
          <p>Seleziona una famiglia per isolarla nel testo.</p>
        </div>
      </div>
      <div class="legal-legend" role="toolbar" aria-label="Filtra famiglie terminologiche">
        <button class="legal-legend-item is-active" type="button" data-legal-family-filter="all">
          <span class="legal-all-swatch" aria-hidden="true"></span>
          <span>Tutte le famiglie</span>
          <b>${activeRows.reduce((sum, term) => sum + Number(term.total_count || 0), 0)}</b>
        </button>
        ${activeRows.map((term, index) => `
          <button class="legal-legend-item" type="button" data-legal-family-filter="${index}">
            <mark class="legal-swatch legal-hit ${legalToneClass(index)}"></mark>
            <span>${ctx.escapeHtml(term.label)}</span>
            <b>${term.total_count}</b>
          </button>
        `).join("") || `<span class="muted">Nessuna occorrenza da evidenziare.</span>`}
      </div>
      <div class="legal-reader">
        <div class="legal-document-tabs" role="tablist" aria-label="Documenti analizzati">
          ${payload.evidence_texts.map((document, index) => `
            <button type="button" role="tab" aria-selected="${index === 0}" class="${index === 0 ? "is-active" : ""}" data-legal-document-tab="${index}">
              <span>${index + 1}</span>${ctx.escapeHtml(document.title)}
            </button>
          `).join("")}
        </div>
        <div class="legal-document-panels">
          ${payload.evidence_texts.map((document, index) => `
            <article class="legal-text-card${index === 0 ? " is-active" : ""}" data-legal-document-panel="${index}" ${index === 0 ? "" : "hidden"}>
              <header>
                <div><span>Documento ${index + 1}</span><strong>${ctx.escapeHtml(document.title)}</strong></div>
                <small>${ctx.escapeHtml(document.token_source_label || document.author)}${document.coverage ? ` · ${ctx.escapeHtml(document.coverage)}` : ""}</small>
              </header>
              ${document.lemma_text ? `
                <div class="legal-view-switch" role="tablist" aria-label="Versione del testo">
                  <button type="button" class="is-active" data-legal-view="original">Testo originale</button>
                  <button type="button" data-legal-view="lemmas">Testo lemmatizzato</button>
                </div>
              ` : ""}
              <section class="legal-text-view is-active" data-legal-text-view="original">
                <pre>${highlightLegalFamiliesInText(ctx, document.text, activeRows, { termsKey: "highlights" })}</pre>
              </section>
              ${document.lemma_text ? `
                <section class="legal-text-view" data-legal-text-view="lemmas" hidden>
                  <pre>${highlightLegalFamiliesInText(ctx, document.lemma_text, activeRows, { termsKey: "counted_terms" })}</pre>
                </section>
              ` : ""}
            </article>
          `).join("")}
        </div>
      </div>
    </div>
  `;
}

function bindLegalEvidenceControls(ctx, targetSelector) {
  const target = ctx.$(targetSelector);
  if (!target) return;
  const browser = target.querySelector("[data-legal-browser]");
  if (!browser) return;

  browser.querySelectorAll("[data-legal-family-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      const family = button.dataset.legalFamilyFilter;
      browser.querySelectorAll("[data-legal-family-filter]").forEach((item) => item.classList.toggle("is-active", item === button));
      browser.querySelectorAll("mark[data-legal-family]").forEach((mark) => {
        mark.classList.toggle("is-muted", family !== "all" && mark.dataset.legalFamily !== family);
      });
    });
  });

  browser.querySelectorAll("[data-legal-document-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      const index = button.dataset.legalDocumentTab;
      browser.querySelectorAll("[data-legal-document-tab]").forEach((item) => {
        const active = item === button;
        item.classList.toggle("is-active", active);
        item.setAttribute("aria-selected", String(active));
      });
      browser.querySelectorAll("[data-legal-document-panel]").forEach((panel) => {
        const active = panel.dataset.legalDocumentPanel === index;
        panel.hidden = !active;
        panel.classList.toggle("is-active", active);
      });
    });
  });

  browser.querySelectorAll("[data-legal-view]").forEach((button) => {
    button.addEventListener("click", () => {
      const panel = button.closest("[data-legal-document-panel]");
      const view = button.dataset.legalView;
      panel.querySelectorAll("[data-legal-view]").forEach((item) => item.classList.toggle("is-active", item === button));
      panel.querySelectorAll("[data-legal-text-view]").forEach((section) => {
        const active = section.dataset.legalTextView === view;
        section.hidden = !active;
        section.classList.toggle("is-active", active);
      });
    });
  });
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
    <section class="panel result-panel legal-result-panel">
      <div class="legal-result-heading">
        <div>
          <p class="eyebrow">Risultato</p>
          <h2>${totalHits} occorrenze in ${documents.length} ${documents.length === 1 ? "documento" : "documenti"}</h2>
          <p>${ctx.escapeHtml(payload.method)}</p>
        </div>
        <span class="legal-source-badge"><small>Livello linguistico</small>${ctx.escapeHtml(documents[0]?.token_source_label || "forme normalizzate")}</span>
      </div>
      <div class="warning-list">${(payload.warnings || []).map((warning) => `<div class="warning">${ctx.escapeHtml(warning)}</div>`).join("")}</div>
      ${renderLegalEvidenceTexts(ctx, payload, visibleRows)}
    </section>
  `;
  bindLegalEvidenceControls(ctx, targetSelector);
}
