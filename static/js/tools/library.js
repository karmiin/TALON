let ctxRef;
let pendingDeleteId = null;

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
    <div class="document-row">
    <button class="document-open-button" type="button" data-document-id="${document.id}">
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
        <strong>${formatNumber(document.token_count)} parole</strong>
        <span>${document.has_syntax ? "Grammatica disponibile" : "Grammatica non generata"}</span>
      </span>
      <span class="row-arrow" aria-hidden="true">›</span>
    </button>
    <button class="document-delete-button" type="button" data-delete-document="${document.id}" aria-label="Elimina ${escapeHtml(document.title)}" title="Elimina documento">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/></svg>
    </button>
    </div>
  `).join("");
  $$("[data-document-id]", container).forEach((button) => {
    button.addEventListener("click", () => openDocument(Number(button.dataset.documentId)));
  });
  $$("[data-delete-document]", container).forEach((button) => {
    button.addEventListener("click", () => requestDocumentDelete(Number(button.dataset.deleteDocument)));
  });
}

async function openDocument(documentId) {
  const { $, api, state, escapeHtml } = ctxRef;
  const dialog = $("#document-dialog");
  $("#document-content").innerHTML = `<div class="empty-state"><p>Caricamento del documento...</p></div>`;
  dialog.showModal();
  try {
    const [documentPayload, annotationPayload] = await Promise.all([
      api(`/api/documents/${documentId}`),
      api(`/api/annotations?document_id=${documentId}`),
    ]);
    state.activeDocument = documentPayload.document;
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
    button.addEventListener("click", () => {
      const tab = button.dataset.tab;
      $$(".tab-button").forEach((item) => item.classList.toggle("is-active", item === button));
      $$("[data-tab-panel]").forEach((panel) => panel.classList.toggle("is-active", panel.dataset.tabPanel === tab));
    });
  });

  $("#annotation-source")?.addEventListener("mouseup", captureSelection);
  $("#annotation-form")?.addEventListener("submit", saveAnnotation);
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

function requestDocumentDelete(documentId) {
  const { $, state } = ctxRef;
  const document = state.documents.find((item) => item.id === documentId);
  if (!document) return;
  pendingDeleteId = documentId;
  $("#delete-document-message").textContent = document.title;
  $("#delete-document-dialog").showModal();
}

function cancelDocumentDelete() {
  pendingDeleteId = null;
  ctxRef.$("#delete-document-dialog")?.close();
}

async function confirmDocumentDelete() {
  const { $, api, state, toast, loadDocuments, loadRuns } = ctxRef;
  if (!pendingDeleteId) return;
  const documentId = pendingDeleteId;
  const button = $("#confirm-document-delete");
  button.disabled = true;
  button.textContent = "Eliminazione...";
  try {
    await api(`/api/documents/${documentId}`, { method: "DELETE" });
    if (state.activeDocument?.id === documentId) {
      $("#document-dialog")?.close();
      state.activeDocument = null;
      state.annotations = [];
    }
    cancelDocumentDelete();
    await Promise.all([loadDocuments(), loadRuns()]);
    toast("Documento eliminato.");
  } catch (error) {
    toast(error.message);
  } finally {
    button.disabled = false;
    button.textContent = "Elimina definitivamente";
  }
}

export function init(ctx) {
  ctxRef = ctx;
  ctx.onDocumentsChanged(() => {
    renderDocuments();
  });
  renderDocuments();
  ctx.$("#document-filter")?.addEventListener("input", renderDocuments);
  ctx.$$("[data-cancel-document-delete]").forEach((button) => button.addEventListener("click", cancelDocumentDelete));
  ctx.$("#confirm-document-delete")?.addEventListener("click", confirmDocumentDelete);
  ctx.$("#document-dialog")?.addEventListener("click", (event) => {
    if (event.target === ctx.$("#document-dialog")) ctx.$("#document-dialog").close();
  });
  ctx.$("#delete-document-dialog")?.addEventListener("click", (event) => {
    if (event.target === ctx.$("#delete-document-dialog")) cancelDocumentDelete();
  });
}
