let ctxRef;

function renderCorpusStats() {
  const { $, state, escapeHtml, formatNumber } = ctxRef;
  const container = $("#corpus-stats");
  if (!container) return;
  const documents = state.documents;
  const tokens = documents.reduce((sum, item) => sum + item.token_count, 0);
  const periods = new Set(documents.map((item) => item.period).filter(Boolean));
  const syntax = documents.filter((item) => item.has_syntax).length;
  container.innerHTML = [
    [documents.length, "testi caricati"],
    [formatNumber(tokens), "parole riconosciute"],
    [periods.size, "periodi dichiarati"],
    [syntax, "testi con analisi grammaticale"],
  ]
    .map(([value, label]) => `<div class="stat-card"><strong>${escapeHtml(value)}</strong><span>${escapeHtml(label)}</span></div>`)
    .join("");
}

function renderDocuments() {
  const { $, $$, state, escapeHtml, formatNumber } = ctxRef;
  const query = ($("#document-filter")?.value || "").trim().toLowerCase();
  const documents = state.documents.filter((document) => {
    const haystack = [
      document.title,
      document.author,
      document.place,
      document.genre,
      document.period,
      document.witness,
    ].join(" ").toLowerCase();
    return haystack.includes(query);
  });
  const container = $("#document-list");
  if (!container) return;
  if (!documents.length) {
    container.innerHTML = `<div class="empty-state"><h2>Nessun documento</h2><p>Modifica il filtro oppure importa una nuova trascrizione.</p></div>`;
    return;
  }
  container.innerHTML = documents.map((document) => `
    <button class="document-row" data-document-id="${document.id}">
      <span class="document-title">
        <strong>${escapeHtml(document.title)}</strong>
        <span>${escapeHtml(document.witness || "Copia o segnatura non indicata")}</span>
      </span>
      <span class="document-meta">
        <strong>${escapeHtml(document.date_label || "Data incerta")}</strong>
        <span>${escapeHtml(document.period || "Periodo da verificare")}</span>
      </span>
      <span class="document-meta">
        <strong>${escapeHtml(document.genre || "Genere non indicato")}</strong>
        <span>${escapeHtml(document.place || "Provenienza non indicata")}</span>
      </span>
      <span class="document-meta">
        <strong>${formatNumber(document.token_count)} parole riconosciute</strong>
        <span>${document.has_syntax ? "Analisi grammaticale disponibile" : "Analisi grammaticale non importata"}</span>
      </span>
      <span>
        ${document.is_demo ? `<span class="badge demo">demo sintetica</span>` : `<span class="badge">fonte importata</span>`}
      </span>
      <span class="row-arrow" aria-hidden="true">›</span>
    </button>
  `).join("");
  $$("[data-document-id]", container).forEach((button) => {
    button.addEventListener("click", () => openDocument(Number(button.dataset.documentId)));
  });
}

async function openDocument(documentId) {
  const { $, api, state, escapeHtml } = ctxRef;
  const dialog = $("#document-dialog");
  $("#document-content").innerHTML = `<div class="empty-state"><p>Caricamento del documento...</p></div>`;
  dialog.showModal();
  try {
    const [documentPayload, analysisPayload, annotationPayload] = await Promise.all([
      api(`/api/documents/${documentId}`),
      api(`/api/documents/${documentId}/analysis`),
      api(`/api/annotations?document_id=${documentId}`),
    ]);
    state.activeDocument = documentPayload.document;
    state.analysis = analysisPayload.analysis;
    state.annotations = annotationPayload.annotations;
    state.selection = null;
    renderDocument();
  } catch (error) {
    $("#document-content").innerHTML = `<div class="empty-state"><h2>Documento non disponibile</h2><p>${escapeHtml(error.message)}</p></div>`;
  }
}

function renderDocument() {
  const { $, state, escapeHtml, renderAnnotatedText } = ctxRef;
  const document = state.activeDocument;
  const analysis = state.analysis;
  const annotated = renderAnnotatedText(document.diplomatic_text, state.annotations);
  $("#document-content").innerHTML = `
    <div class="document-shell">
      <header class="document-header">
        <div>
          <span class="${document.is_demo ? "badge demo" : "badge"}">${document.is_demo ? "demo sintetica" : "fonte importata"}</span>
          <h2>${escapeHtml(document.title)}</h2>
          <div class="metadata-line">
            <span>${escapeHtml(document.witness || "copia/segnatura non indicata")}</span>
            <span>${escapeHtml(document.date_label || "data incerta")}</span>
            <span>${escapeHtml(document.period || "periodo da verificare")}</span>
            <span>${escapeHtml(document.place || "provenienza non indicata")}</span>
            <span>${escapeHtml(document.genre || "tipo di testo non indicato")}</span>
          </div>
        </div>
        <button class="icon-button" type="button" data-close-document aria-label="Chiudi">x</button>
      </header>
      <nav class="document-tabs" aria-label="Viste del documento">
        <button class="tab-button is-active" data-tab="reader">Lettura</button>
        <button class="tab-button" data-tab="lexicon">Lessico</button>
        <button class="tab-button" data-tab="syntax">Grammatica</button>
        <button class="tab-button" data-tab="annotations">Annotazioni (${state.annotations.length})</button>
        <button class="tab-button" data-tab="metadata">Metadati</button>
      </nav>

      <section class="tab-panel is-active" data-tab-panel="reader">
        <div class="reader-grid">
          <article class="text-panel">
            <header><strong>Trascrizione originale</strong><span class="badge">sorgente</span></header>
            <p class="muted">Questa e la versione da non sovrascrivere; in filologia puo essere chiamata testo diplomatico.</p>
            <pre class="text-body">${annotated}</pre>
          </article>
          <article class="text-panel">
            <header><strong>Testo normalizzato di base</strong><span class="badge">derivato</span></header>
            <p class="muted">Qui sono uniformati solo spazi e paragrafi. Minuscole, j -> i e v -> u vengono applicati temporaneamente quando avvii un'analisi.</p>
            <pre class="text-body">${escapeHtml(document.normalized_text)}</pre>
          </article>
        </div>
      </section>

      <section class="tab-panel" data-tab-panel="lexicon">
        ${renderLexicalAnalysis(analysis)}
      </section>

      <section class="tab-panel" data-tab-panel="syntax">
        <div id="syntax-content"><div class="empty-state"><p>Caricamento dell'analisi grammaticale...</p></div></div>
      </section>

      <section class="tab-panel" data-tab-panel="annotations">
        ${renderAnnotationPanel(document, annotated)}
      </section>

      <section class="tab-panel" data-tab-panel="metadata">
        ${renderMetadata(document)}
      </section>
    </div>
  `;
  bindDocumentEvents();
}

function renderLexicalAnalysis(analysis) {
  const { escapeHtml, formatNumber } = ctxRef;
  const metrics = [
    [analysis.token_count, "parole riconosciute"],
    [analysis.type_count, "forme diverse"],
    [analysis.sentence_count, "segmenti/frasi"],
    [analysis.average_word_length, "lettere per parola"],
    [analysis.mattr_50, "varieta lessicale"],
  ];
  return `
    <div class="analysis-grid">
      ${metrics.map(([value, label]) => `<div class="metric-card"><strong>${formatNumber(value, typeof value === "number" && value % 1 ? 2 : 0)}</strong><span>${escapeHtml(label)}</span></div>`).join("")}
    </div>
    ${analysis.warnings.map((warning) => `<div class="warning">${escapeHtml(warning)}</div>`).join("")}
    <details class="inline-explainer">
      <summary>Come leggere questi valori</summary>
      <div class="explainer-grid">
        <p><strong>Parole riconosciute</strong> conta i token trovati nel testo normalizzato.</p>
        <p><strong>Forme diverse</strong> conta quante grafie distinte compaiono, senza unirle in lemmi.</p>
        <p><strong>Segmenti/frasi</strong> dipende dalla punteggiatura disponibile nella trascrizione.</p>
        <p><strong>Varieta lessicale</strong> e la MATTR su finestre di 50 parole: cresce quando il lessico cambia spesso.</p>
      </div>
    </details>
    <div class="analysis-columns">
      <article class="simple-card">
        <h3>Parole di contenuto</h3>
        ${renderBarList(analysis.top_content_words)}
      </article>
      <article class="simple-card">
        <h3>Parole che ricorrono vicine</h3>
        <p class="card-help">Collocazioni: coppie entro 5 parole, escluse molte parole grammaticali. Il punteggio e logDice.</p>
        <div class="bar-list">
          ${analysis.collocations.length ? analysis.collocations.map((item) => `
            <div class="loading-row">
              <span>${escapeHtml(item.left)} + ${escapeHtml(item.right)}</span>
              <strong>${formatNumber(item.log_dice, 2)}</strong>
            </div>
          `).join("") : `<p class="muted">Il testo e troppo breve per coppie ripetute.</p>`}
        </div>
      </article>
    </div>
    <article class="simple-card" style="margin-top: 1rem">
      <h3>Occorrenze nel contesto</h3>
      <p class="card-help">KWIC: cerca una forma e mostra il testo prima e dopo. Serve a controllare gli esempi, non a calcolare la distanza.</p>
      <div class="kwic-controls">
        <input id="document-kwic-query" placeholder="Cerca una forma o una formula">
        <button class="secondary-button" id="document-kwic-run">Cerca</button>
      </div>
      <div id="document-kwic-results" class="kwic-list"></div>
    </article>
  `;
}

function renderBarList(items) {
  const { escapeHtml } = ctxRef;
  const max = Math.max(...items.map((item) => item.count), 1);
  return `<div class="bar-list">${items.map((item) => `
    <div class="bar-row">
      <button class="feature-link" data-document-feature="${escapeHtml(item.term)}">${escapeHtml(item.term)}</button>
      <span class="bar-track"><span class="bar-fill" style="width:${(item.count / max) * 100}%"></span></span>
      <strong>${item.count}</strong>
    </div>
  `).join("")}</div>`;
}

function renderAnnotationPanel(document, annotated) {
  const { state, escapeHtml, annotationToneClass } = ctxRef;
  return `
    <div class="annotation-layout">
      <article class="text-panel">
        <header><strong>Seleziona un passo da annotare</strong><span class="badge">manuale</span></header>
        <pre class="text-body" id="annotation-source">${annotated}</pre>
      </article>
      <aside>
        <form id="annotation-form" class="simple-card">
          <h3>Nuova annotazione</h3>
          <div class="selection-preview" id="selection-preview">Seleziona parole nel testo a sinistra.</div>
          <label class="field">
            <span>Tipo</span>
            <select id="annotation-label">
              <option>nota</option>
              <option>persona</option>
              <option>luogo</option>
              <option>bene</option>
              <option>formula giuridica</option>
              <option>variante</option>
              <option>incertezza testuale</option>
            </select>
          </label>
          <label class="field">
            <span>Certezza</span>
            <select id="annotation-certainty">
              <option>certo</option>
              <option>probabile</option>
              <option selected>possibile</option>
              <option>ignoto</option>
            </select>
          </label>
          <label class="field">
            <span>Nota interpretativa</span>
            <textarea id="annotation-body" rows="4" required></textarea>
          </label>
          <label class="field">
            <span>Fonte / riferimento</span>
            <input id="annotation-source-field">
          </label>
          <button class="primary-button full-width" type="submit">Salva annotazione</button>
        </form>
        <div class="annotation-list">
          ${state.annotations.map((item) => `
            <article class="annotation-card ${annotationToneClass(item.label)}">
              <strong>${escapeHtml(item.label)} · ${escapeHtml(item.certainty)}</strong>
              <p>"${escapeHtml(item.quote)}"</p>
              <p>${escapeHtml(item.body)}</p>
              <small>${escapeHtml(item.source || "fonte non indicata")}</small>
            </article>
          `).join("") || `<p class="muted">Nessuna annotazione manuale.</p>`}
        </div>
      </aside>
    </div>
  `;
}

function renderMetadata(document) {
  const { escapeHtml } = ctxRef;
  return `
    <div class="analysis-columns">
      <article class="simple-card">
        <h3>Descrizione</h3>
        <dl>
          <dt>Titolo</dt><dd>${escapeHtml(document.title)}</dd>
          <dt>Autore / attribuzione</dt><dd>${escapeHtml(document.author || "ignoto")}</dd>
          <dt>Datazione</dt><dd>${escapeHtml(document.date_label || "non indicata")}</dd>
          <dt>Periodo</dt><dd>${escapeHtml(document.period || "da verificare")}</dd>
          <dt>Luogo</dt><dd>${escapeHtml(document.place || "non indicato")}</dd>
          <dt>Tipo di testo / genere</dt><dd>${escapeHtml(document.genre || "non indicato")}</dd>
        </dl>
      </article>
      <article class="simple-card">
        <h3>Provenienza digitale</h3>
        <dl>
          <dt>File</dt><dd>${escapeHtml(document.source_name || "inserimento manuale")}</dd>
          <dt>Tipo</dt><dd>${escapeHtml(document.source_type)}</dd>
          <dt>Hash SHA-256</dt><dd style="overflow-wrap:anywhere">${escapeHtml(document.source_hash || "non disponibile")}</dd>
          <dt>Note</dt><dd>${escapeHtml(document.notes || "nessuna")}</dd>
        </dl>
        <p class="muted">TEI XML e un formato standard per scambiare testi e metadati in ambito filologico.</p>
        <a class="secondary-button" href="/api/export/tei?id=${document.id}">Esporta formato TEI XML</a>
      </article>
    </div>
  `;
}

function bindDocumentEvents() {
  const { $, $$ } = ctxRef;
  $("[data-close-document]")?.addEventListener("click", () => $("#document-dialog").close());
  $$(".tab-button").forEach((button) => {
    button.addEventListener("click", async () => {
      const tab = button.dataset.tab;
      $$(".tab-button").forEach((item) => item.classList.toggle("is-active", item === button));
      $$("[data-tab-panel]").forEach((panel) => panel.classList.toggle("is-active", panel.dataset.tabPanel === tab));
      if (tab === "syntax") await loadSyntax();
    });
  });

  $("#document-kwic-run")?.addEventListener("click", runDocumentKwic);
  $("#document-kwic-query")?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") runDocumentKwic();
  });
  $$("[data-document-feature]").forEach((button) => {
    button.addEventListener("click", () => {
      $("#document-kwic-query").value = button.dataset.documentFeature;
      runDocumentKwic();
    });
  });

  $("#annotation-source")?.addEventListener("mouseup", captureSelection);
  $("#annotation-form")?.addEventListener("submit", saveAnnotation);
}

async function runDocumentKwic() {
  const { $, api, state, escapeHtml } = ctxRef;
  const query = $("#document-kwic-query").value.trim();
  if (!query) return;
  const container = $("#document-kwic-results");
  container.innerHTML = `<p>Ricerca...</p>`;
  try {
    const payload = await api(`/api/kwic?ids=${state.activeDocument.id}&q=${encodeURIComponent(query)}`);
    container.innerHTML = renderKwicRows(payload.results);
  } catch (error) {
    container.innerHTML = `<p>${escapeHtml(error.message)}</p>`;
  }
}

function renderKwicRows(results) {
  const { escapeHtml } = ctxRef;
  if (!results.length) return `<p>Nessuna occorrenza.</p>`;
  return results.map((row) => `
    <div class="kwic-row">
      <span class="kwic-left">${escapeHtml(row.left)}</span>
      <strong class="kwic-match">${escapeHtml(row.match)}</strong>
      <span>${escapeHtml(row.right)}</span>
    </div>
  `).join("");
}

function captureSelection() {
  const { $, state } = ctxRef;
  const container = $("#annotation-source");
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || !selection.rangeCount || !container.contains(selection.anchorNode) || !container.contains(selection.focusNode)) {
    return;
  }
  const range = selection.getRangeAt(0);
  const prefix = range.cloneRange();
  prefix.selectNodeContents(container);
  prefix.setEnd(range.startContainer, range.startOffset);
  const start = prefix.toString().length;
  const quote = range.toString();
  state.selection = { start, end: start + quote.length, quote };
  $("#selection-preview").textContent = `"${quote}"`;
}

async function saveAnnotation(event) {
  event.preventDefault();
  const { $, api, state, toast } = ctxRef;
  if (!state.selection?.quote.trim()) {
    toast("Seleziona prima un passo nel testo.");
    return;
  }
  const button = $("#annotation-form button[type=submit]");
  button.disabled = true;
  try {
    await api("/api/annotations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        document_id: state.activeDocument.id,
        start_offset: state.selection.start,
        end_offset: state.selection.end,
        quote: state.selection.quote,
        label: $("#annotation-label").value,
        certainty: $("#annotation-certainty").value,
        body: $("#annotation-body").value,
        source: $("#annotation-source-field").value,
      }),
    });
    const payload = await api(`/api/annotations?document_id=${state.activeDocument.id}`);
    state.annotations = payload.annotations;
    state.selection = null;
    renderDocument();
    toast("Annotazione salvata.");
    ctxRef.$(`.tab-button[data-tab="annotations"]`)?.click();
  } catch (error) {
    toast(error.message);
  } finally {
    button.disabled = false;
  }
}

async function loadSyntax() {
  const { $, api, state, escapeHtml } = ctxRef;
  const container = $("#syntax-content");
  try {
    const payload = await api(`/api/documents/${state.activeDocument.id}/syntax`);
    if (!payload.sentences.length) {
      container.innerHTML = renderSyntaxImport();
      bindSyntaxControls();
      return;
    }
    container.innerHTML = `
      <div class="result-heading">
        <div><h2>Analisi grammaticale della frase</h2><p>Da dove arriva: ${escapeHtml(payload.source || "non dichiarato")}</p></div>
        <span class="badge">analisi interna</span>
      </div>
      <label class="field" style="max-width:420px">
        <span>Frase</span>
        <select id="syntax-sentence-select">
          ${payload.sentences.map((sentence, index) => `<option value="${index}">${index + 1}. ${escapeHtml(sentence.text.slice(0, 80))}</option>`).join("")}
        </select>
      </label>
      <div id="syntax-sentence-view"></div>
      <details style="margin-top:1rem">
        <summary>Aggiorna con LatinCy</summary>
        ${renderSyntaxImport(true)}
      </details>
    `;
    const select = $("#syntax-sentence-select");
    const show = () => {
      $("#syntax-sentence-view").innerHTML = renderSyntaxSentence(payload.sentences[Number(select.value)]);
    };
    select.addEventListener("change", show);
    show();
    bindSyntaxControls();
  } catch (error) {
    container.innerHTML = `<div class="warning">${escapeHtml(error.message)}</div>`;
  }
}

function renderSyntaxSentence(sentence) {
  const { escapeHtml } = ctxRef;
  return `
    <p class="syntax-sentence">${escapeHtml(sentence.text)}</p>
    <div class="syntax-layout">
      <div class="simple-card">
        <table class="token-table">
          <thead><tr><th>Forma</th><th>Lemma</th><th>Categoria</th><th>Tratti grammaticali</th><th>Ruolo nella frase</th></tr></thead>
          <tbody>
            ${sentence.tokens.map((token) => `
              <tr>
                <td>${escapeHtml(token.form)}</td>
                <td>${escapeHtml(token.lemma)}</td>
                <td>${escapeHtml(token.upos)}</td>
                <td>${escapeHtml(Object.entries(token.features).map(([key, value]) => `${key}=${value}`).join(" · ") || "_")}</td>
                <td>${escapeHtml(token.relation)} -> ${token.head || "ROOT"}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
      <div class="simple-card">
        <h3>Chi dipende da chi nella frase</h3>
        ${renderDependencyTree(sentence.tokens)}
      </div>
    </div>
  `;
}

function renderDependencyTree(tokens) {
  const { escapeHtml } = ctxRef;
  const children = new Map();
  tokens.forEach((token) => {
    if (!children.has(token.head)) children.set(token.head, []);
    children.get(token.head).push(token);
  });
  const visit = (head, seen = new Set()) => {
    const nodes = children.get(head) || [];
    if (!nodes.length) return "";
    return `<ul>${nodes.map((token) => {
      if (seen.has(token.id)) return "";
      const nextSeen = new Set(seen);
      nextSeen.add(token.id);
      return `<li><strong>${escapeHtml(token.form)}</strong> <em>${escapeHtml(token.relation)}</em>${visit(token.id, nextSeen)}</li>`;
    }).join("")}</ul>`;
  };
  return `<div class="dependency-tree">${visit(0)}</div>`;
}

function renderSyntaxImport(compact = false) {
  const { state, escapeHtml } = ctxRef;
  const automaticParsers = state.parserStatus.filter((parser) => parser.id === "latincy");
  const runnable = automaticParsers.some((parser) => parser.runnable);
  return `
    <div class="syntax-empty">
      ${compact ? "" : `<h3>Nessuna analisi grammaticale disponibile</h3><p>Per generarla usa LatinCy installato localmente. Senza LatinCy TALON resta sulle forme normalizzate.</p>`}
      <div class="parser-runner simple-card">
        <h3>LatinCy</h3>
        <p class="muted">Genera lemmi, categorie grammaticali e relazioni sintattiche. Il formato tecnico resta interno all'app.</p>
        <label class="field">
          <span>Parser</span>
          <select id="syntax-parser-select">
            ${automaticParsers.map((parser) => `<option value="${escapeHtml(parser.id)}" ${parser.runnable ? "" : "disabled"}>${escapeHtml(parser.label)} · ${parser.runnable ? "disponibile" : "non disponibile"}</option>`).join("")}
          </select>
        </label>
        <button class="secondary-button" id="run-syntax-parser" type="button" ${runnable ? "" : "disabled"}>Genera analisi grammaticale</button>
        <div class="parser-status-list">
          ${automaticParsers.map((parser) => `
            <div class="parser-status ${parser.runnable ? "ok" : "missing"}">
              <strong>${escapeHtml(parser.label)}</strong>
              <span>${escapeHtml(parser.message)}</span>
              ${parser.install_hint ? `<small>${escapeHtml(parser.install_hint)}</small>` : ""}
            </div>
          `).join("")}
        </div>
      </div>
    </div>
  `;
}

function bindSyntaxControls() {
  ctxRef.$("#run-syntax-parser")?.addEventListener("click", runSyntaxParser);
}

async function runSyntaxParser() {
  const { $, api, state, toast, loadDocuments } = ctxRef;
  const parser = $("#syntax-parser-select")?.value;
  if (!parser) {
    toast("Nessun parser automatico disponibile.");
    return;
  }
  const button = $("#run-syntax-parser");
  button.disabled = true;
  button.textContent = "Parsing in corso...";
  try {
    const payload = await api(`/api/documents/${state.activeDocument.id}/parse`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parser }),
    });
    toast(`Analisi prodotta da ${payload.source}.`);
    await loadSyntax();
    await loadDocuments();
  } catch (error) {
    toast(error.message);
  } finally {
    button.disabled = false;
    button.textContent = "Genera analisi grammaticale";
  }
}

export function init(ctx) {
  ctxRef = ctx;
  ctx.onDocumentsChanged(() => {
    renderCorpusStats();
    renderDocuments();
  });
  renderCorpusStats();
  renderDocuments();
  ctx.$("#document-filter")?.addEventListener("input", renderDocuments);
  ctx.$("#document-dialog")?.addEventListener("click", (event) => {
    if (event.target === ctx.$("#document-dialog")) ctx.$("#document-dialog").close();
  });
}
