const state = {
  documents: [],
  activeDocument: null,
  annotations: [],
  compare: null,
  modules: null,
  parserStatus: [],
  importerStatus: null,
  audit: null,
  runs: [],
  affinity: null,
  editor: {
    document: null,
    originalText: "",
    annotations: [],
    selection: null,
    targetAnnotationId: null,
  },
  importMode: "file",
  selection: null,
};

const dataHooks = {
  documents: [],
  modules: [],
  parserStatus: [],
  importerStatus: [],
  audit: [],
  runs: [],
};

const VIEW_LABELS = {
  home: "Dashboard",
  library: "Testi",
  editor: "Editor",
  pipeline: "Pipeline",
  reports: "Report",
  linguistics: "Lessico e grammatica",
  affinity: "PCA",
  legal: "Termini giuridici",
  diff: "Diff testi",
  voyant: "Voyant",
  collatinus: "Collatinus",
  modules: "Moduli",
  "tool-detail": "Scheda tool",
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatNumber(value, digits = 0) {
  return new Intl.NumberFormat("it-IT", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(Number(value || 0));
}

async function api(path, options = {}) {
  const response = await request(path, options);
  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json") ? await response.json() : await response.text();
  if (!response.ok) {
    throw new Error(payload.error || payload || "Richiesta non riuscita.");
  }
  return payload;
}

function request(path, options = {}) {
  if (typeof fetch === "function") return fetch(path, options);
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(options.method || "GET", path);
    Object.entries(options.headers || {}).forEach(([key, value]) => xhr.setRequestHeader(key, value));
    xhr.onload = () => {
      const responseText = xhr.responseText || "";
      resolve({
        ok: xhr.status >= 200 && xhr.status < 300,
        status: xhr.status,
        headers: { get: (name) => xhr.getResponseHeader(name) },
        text: async () => responseText,
        json: async () => JSON.parse(responseText || "null"),
      });
    };
    xhr.onerror = () => reject(new Error("Richiesta non riuscita."));
    xhr.send(options.body || null);
  });
}

function onData(type, callback) {
  dataHooks[type]?.push(callback);
}

function notifyData(type) {
  for (const callback of dataHooks[type] || []) callback();
}

function toolContext() {
  return {
    $,
    $$,
    api,
    state,
    toast,
    escapeHtml,
    formatNumber,
    setView,
    bindViewControl,
    loadDocuments,
    loadRuns,
    renderDocumentChecklist,
    renderAnnotatedText,
    annotationToneClass,
    selectedProfile,
    selectedIds,
    selectedFullDocuments,
    onDocumentsChanged: (callback) => onData("documents", callback),
    onModulesChanged: (callback) => onData("modules", callback),
    onParserStatusChanged: (callback) => onData("parserStatus", callback),
    onImporterStatusChanged: (callback) => onData("importerStatus", callback),
    onAuditChanged: (callback) => onData("audit", callback),
    onRunsChanged: (callback) => onData("runs", callback),
  };
}

async function loadDynamicTools() {
  const tools = await api("/tools/manifest.json");
  const { loadToolModules } = await import("/js/tool-loader.js");
  await loadToolModules(tools, toolContext());
}

function toast(message) {
  const element = $("#toast");
  element.textContent = message;
  element.classList.add("is-visible");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => element.classList.remove("is-visible"), 2600);
}

function setView(name) {
  document.body.dataset.currentView = name;
  $$(".app-view").forEach((view) => view.classList.toggle("is-active", view.id === `view-${name}`));
  $$(".nav-button").forEach((button) => button.classList.toggle("is-active", button.dataset.view === name));
  $$(".rail-button").forEach((button) => button.classList.toggle("is-active", button.dataset.view === name));
  document.body.classList.remove("nav-open");
  renderTopbar();
  window.scrollTo({ top: 0, behavior: "auto" });
}

function renderTopbar() {
  const current = document.body.dataset.currentView || "home";
  const title = $("#current-view-title");
  if (title) title.textContent = VIEW_LABELS[current] || current;
}

function hasView(name) {
  return Boolean($(`#view-${name}`));
}

function bindViewControl(control) {
  control.addEventListener("click", (event) => {
    event.preventDefault();
    setView(control.dataset.view);
  });
}

function bindToolControl(control) {
  control.addEventListener("click", (event) => {
    event.preventDefault();
    openRegisteredTool(control.dataset.toolId);
  });
}

async function loadDocuments() {
  const payload = await api("/api/documents");
  state.documents = payload.documents;
  renderTopbar();
  notifyData("documents");
}

async function loadModules() {
  state.modules = await api("/api/modules");
  renderToolLauncher();
  renderTopbar();
  notifyData("modules");
}

async function loadParserStatus() {
  const payload = await api("/api/parsers/status");
  state.parserStatus = payload.parsers;
  notifyData("parserStatus");
}

async function loadImporterStatus() {
  const payload = await api("/api/importers/status");
  state.importerStatus = payload;
  renderImporterStatus();
  notifyData("importerStatus");
}

async function loadAudit() {
  state.audit = await api("/api/audit");
  notifyData("audit");
}

async function loadRuns() {
  const payload = await api("/api/runs?limit=50");
  state.runs = payload.runs;
  notifyData("runs");
}

function renderImporterStatus() {
  const container = $("#import-backend-status");
  if (!container || !state.importerStatus) return;
  const pdf = state.importerStatus.pdf;
  const available = pdf.backends.filter((backend) => backend.available).map((backend) => backend.name);
  const missing = pdf.backends.filter((backend) => !backend.available).map((backend) => backend.name);
  container.innerHTML = `
    <strong>${pdf.available ? "PDF testuali supportati" : "PDF non disponibili"}</strong>
    <span>${escapeHtml(pdf.message)}</span>
    <small>Backend attivi: ${escapeHtml(available.join(", ") || "nessuno")} · mancanti: ${escapeHtml(missing.join(", ") || "nessuno")}</small>
  `;
  container.classList.toggle("is-warning", !pdf.available);
}

const TOOL_ICONS = {
  library: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6.5h6l2 2h10v10.5H3z"/><path d="M3 6.5V5h7l2 2h9v1.5"/></svg>',
  editor: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3h10l4 4v14H5z"/><path d="M15 3v5h4M8 17l1-4 7-7 2 2-7 7z"/></svg>',
  pipeline: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="6" r="2"/><circle cx="18" cy="6" r="2"/><circle cx="12" cy="18" r="2"/><path d="M8 6h8M7 8l4 8M17 8l-4 8"/></svg>',
  reports: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3h10l4 4v14H5z"/><path d="M15 3v5h4M8 17v-3M12 17v-6M16 17v-8"/></svg>',
  affinity: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 3v17h17"/><circle cx="8" cy="15" r="1.5"/><circle cx="12" cy="9" r="1.5"/><circle cx="17" cy="12" r="1.5"/><circle cx="19" cy="6" r="1.5"/></svg>',
  legal: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v18M6 6h12M7 6l-4 7h8zM17 6l-4 7h8zM8 21h8"/></svg>',
  diff: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h6v16H4zM14 4h6v16h-6zM7 8h1M7 12h1M16 9h1M16 14h1"/></svg>',
  voyant: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20V10M9 20V4M14 20v-7M19 20V7"/></svg>',
  collatinus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5.5c3-1.5 6-1 9 1.5v13c-3-2.5-6-3-9-1.5zM21 5.5c-3-1.5-6-1-9 1.5v13c3-2.5 6-3 9-1.5z"/></svg>',
  linguistics: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h7v16H4zM13 4h7v16h-7z"/><path d="M6.5 8.5h2M6.5 12h2M15.5 8.5h2M15.5 12h2M15.5 15.5h2"/></svg>',
};

function toolIcon(view) {
  return TOOL_ICONS[view] || '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>';
}

function renderToolLauncher() {
  const container = $("#tool-launcher");
  if (!container || !state.modules) return;
  const tools = state.modules.tools || [];
  if (!tools.length) {
    container.innerHTML = `
      <div class="tool-card">
        <span class="tool-icon">!</span>
        <strong>Nessun tool registrato</strong>
        <small>Controlla i manifest in talon/modules o TALON_MODULE_PATH.</small>
      </div>
    `;
    return;
  }
  const sectionForView = {
    library: "sources",
    editor: "sources",
    diff: "sources",
    linguistics: "analysis",
    affinity: "analysis",
    legal: "analysis",
    voyant: "analysis",
    collatinus: "analysis",
    pipeline: "output",
    reports: "output",
  };
  const sections = [
    { id: "sources", label: "Prepara le fonti", description: "Importa, correggi, annota e confronta le trascrizioni." },
    { id: "analysis", label: "Analizza", description: "Esplora lessico, stile, morfologia e terminologia." },
    { id: "output", label: "Documenta", description: "Configura le analisi e conserva risultati riproducibili." },
    { id: "other", label: "Altri strumenti", description: "Moduli aggiunti al workspace." },
  ];
  const grouped = new Map(sections.map((section) => [section.id, []]));
  tools.forEach((tool) => {
    const ui = tool.ui || {};
    const section = ui.section || sectionForView[ui.view] || "other";
    (grouped.get(section) || grouped.get("other")).push(tool);
  });
  container.innerHTML = sections
    .filter((section) => grouped.get(section.id).length)
    .map((section) => `
      <section class="tool-group">
        <header>
          <h3>${escapeHtml(section.label)}</h3>
          <p>${escapeHtml(section.description)}</p>
        </header>
        <div class="tool-group-list">
          ${grouped.get(section.id).map((tool) => {
            const ui = tool.ui || {};
            const view = ui.view || "";
            const actionAttribute = hasView(view)
              ? `data-view="${escapeHtml(view)}"`
              : `data-tool-id="${escapeHtml(tool.id)}"`;
            return `
              <button class="tool-card" type="button" ${actionAttribute}>
                <span class="tool-icon">${toolIcon(view)}</span>
                <span class="tool-copy">
                  <strong>${escapeHtml(tool.label)}</strong>
                  <small>${escapeHtml(tool.description)}</small>
                </span>
                <span class="tool-open">Apri <span aria-hidden="true">&#8594;</span></span>
              </button>
            `;
          }).join("")}
        </div>
      </section>
    `).join("");
  $$("[data-view]", container).forEach(bindViewControl);
  $$("[data-tool-id]", container).forEach(bindToolControl);
}

function renderList(items) {
  if (!items?.length) return `<p class="muted">Non dichiarato nel manifest.</p>`;
  return `<ul class="manifest-list">${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function renderReferences(references) {
  if (!references?.length) return `<p class="muted">Nessun riferimento dichiarato.</p>`;
  return `<ul class="manifest-list">${references.map((item) => `
    <li><a href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">${escapeHtml(item.label || item.url)}</a></li>
  `).join("")}</ul>`;
}

function openRegisteredTool(toolId) {
  const tool = (state.modules?.tools || []).find((item) => item.id === toolId);
  if (!tool) {
    toast("Tool non trovato nel catalogo.");
    return;
  }
  $("#tool-detail-title").textContent = tool.label;
  $("#tool-detail-description").textContent = tool.description;
  $("#tool-detail-meta").innerHTML = `
    <span>ID: ${escapeHtml(tool.id)}</span>
    <span>Stato: ${escapeHtml(tool.status)}</span>
    <span>Categoria: ${escapeHtml(tool.category)}</span>
    <span>Sorgente: ${escapeHtml(tool.source || "manifest interno")}</span>
  `;
  const ui = tool.ui || {};
  const hasCustomView = ui.view && hasView(ui.view);
  const embedUrl = safeEmbedUrl(ui.embed_url);
  $("#tool-detail-results").innerHTML = `
    <section class="panel result-panel">
      <div class="result-heading">
        <div>
          <p class="eyebrow">Manifest tool</p>
          <h2>${escapeHtml(tool.label)}</h2>
          <p>${escapeHtml(tool.description)}</p>
        </div>
        <span class="badge">${escapeHtml(tool.status)}</span>
      </div>
      ${ui.view && !hasCustomView ? `<div class="warning">Il manifest punta alla vista "${escapeHtml(ui.view)}", ma questa UI non e ancora registrata. TALON mostra quindi la scheda generica del tool.</div>` : ""}
      ${ui.embed_url && !embedUrl ? `<div class="warning">L'URL embedded dichiarato non e valido. Usa un URL relativo, http:// o https://.</div>` : ""}
      ${embedUrl ? `
        <div class="embedded-tool">
          <iframe src="${escapeHtml(embedUrl)}" title="${escapeHtml(tool.label)}"></iframe>
        </div>
      ` : ""}
      <div class="manifest-grid">
        <article class="simple-card">
          <h3>Input</h3>
          ${renderList(tool.inputs)}
        </article>
        <article class="simple-card">
          <h3>Output</h3>
          ${renderList(tool.outputs)}
        </article>
        <article class="simple-card">
          <h3>Note</h3>
          ${renderList(tool.notes)}
        </article>
        <article class="simple-card">
          <h3>Riferimenti</h3>
          ${renderReferences(tool.references)}
        </article>
      </div>
    </section>
  `;
  setView("tool-detail");
}

function renderDocumentChecklist(containerSelector, dataAttribute, options = {}) {
  const container = $(containerSelector);
  if (!container) return;
  container.innerHTML = state.documents.map((document) => `
    <label class="check-item">
      <input type="checkbox" value="${document.id}" ${dataAttribute}>
      <span>
        <strong>${escapeHtml(document.title)}</strong>
        <small>${escapeHtml(document.genre || "tipo di testo ignoto")} · ${formatNumber(document.token_count)} parole riconosciute</small>
      </span>
    </label>
  `).join("");
  if (options.max === 2) {
    $$(`[${dataAttribute}]`, container).forEach((input) => {
      input.addEventListener("change", () => {
        const checked = $$(`[${dataAttribute}]:checked`, container);
        if (checked.length > 2) {
          input.checked = false;
          toast("Per questo tool seleziona al massimo due testi.");
        }
      });
    });
  }
}

function selectedIds(selector) {
  return $$(selector).filter((input) => input.checked).map((input) => Number(input.value));
}

function selectedProfile() {
  return {
    lower: $("#profile-lower")?.checked ?? true,
    j_to_i: $("#profile-ji")?.checked ?? false,
    v_to_u: $("#profile-vu")?.checked ?? false,
  };
}

const ANNOTATION_TONES = {
  nota: "annotation-tone-note",
  persona: "annotation-tone-person",
  luogo: "annotation-tone-place",
  bene: "annotation-tone-asset",
  "formula giuridica": "annotation-tone-legal",
  variante: "annotation-tone-variant",
  "incertezza testuale": "annotation-tone-uncertain",
};

function annotationToneClass(label) {
  return ANNOTATION_TONES[String(label || "").trim().toLocaleLowerCase()] || "annotation-tone-note";
}

function renderAnnotatedText(text, annotations) {
  const valid = annotations
    .filter((item) => item.start_offset >= 0 && item.end_offset > item.start_offset && item.end_offset <= text.length)
    .sort((a, b) => a.start_offset - b.start_offset);
  let cursor = 0;
  let output = "";
  for (const annotation of valid) {
    if (annotation.start_offset < cursor) continue;
    output += escapeHtml(text.slice(cursor, annotation.start_offset));
    output += `<mark class="annotation-mark ${annotationToneClass(annotation.label)}" data-annotation-id="${annotation.id}" title="${escapeHtml(`${annotation.label}: ${annotation.body}`)}">${escapeHtml(text.slice(annotation.start_offset, annotation.end_offset))}</mark>`;
    cursor = annotation.end_offset;
  }
  output += escapeHtml(text.slice(cursor));
  return output;
}

async function selectedFullDocuments(ids) {
  const payloads = await Promise.all(ids.map((id) => api(`/api/documents/${id}`)));
  return payloads.map((payload) => payload.document);
}

function setImportMode(mode) {
  state.importMode = mode;
  $$("[data-import-mode]").forEach((button) => button.classList.toggle("is-active", button.dataset.importMode === mode));
  $("#file-zone")?.classList.toggle("is-hidden", mode !== "file");
  $("#paste-zone")?.classList.toggle("is-hidden", mode !== "paste");
  $("#import-file").required = mode === "file";
  $("#import-text").required = mode === "paste";
}

async function submitImport(event) {
  event.preventDefault();
  const submit = $("#import-form button[type=submit]");
  const status = $("#import-status");
  submit.disabled = true;
  status.textContent = "Importazione in corso...";
  try {
    const metadata = {
      title: $("#import-title").value,
      witness: $("#import-witness").value,
      author: $("#import-author").value,
      date_label: $("#import-date").value,
      period: $("#import-period").value,
      place: $("#import-place").value,
      genre: $("#import-genre").value,
      notes: $("#import-notes").value,
    };
    if (state.importMode === "file") {
      const file = $("#import-file").files[0];
      if (!file) throw new Error("Scegli un file .docx, .txt o .pdf.");
      const formData = new FormData();
      formData.append("file", file);
      Object.entries(metadata).forEach(([key, value]) => formData.append(key, value));
      await api("/api/import", { method: "POST", body: formData });
    } else {
      await api("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...metadata, text: $("#import-text").value, source_type: "manuale" }),
      });
    }
    $("#import-form").reset();
    $("#import-dialog").close();
    await loadDocuments();
    toast("Documento importato nella raccolta.");
  } catch (error) {
    status.textContent = error.message;
  } finally {
    submit.disabled = false;
  }
}

function bindGlobalEvents() {
  $$("[data-view]").forEach(bindViewControl);
  $("#nav-toggle")?.addEventListener("click", () => {
    const mobile = window.matchMedia("(max-width: 860px)").matches;
    if (mobile) {
      document.body.classList.toggle("nav-open");
    } else {
      document.body.classList.toggle("nav-collapsed");
    }
    const expanded = mobile
      ? document.body.classList.contains("nav-open")
      : !document.body.classList.contains("nav-collapsed");
    $("#nav-toggle").setAttribute("aria-expanded", String(expanded));
  });
  $("#open-import").addEventListener("click", () => $("#import-dialog").showModal());
  $$("[data-close-dialog]").forEach((button) => button.addEventListener("click", () => $("#import-dialog").close()));
  $$("[data-import-mode]").forEach((button) => button.addEventListener("click", () => setImportMode(button.dataset.importMode)));
  $("#import-form").addEventListener("submit", submitImport);
  $("#import-dialog").addEventListener("click", (event) => {
    if (event.target === $("#import-dialog")) $("#import-dialog").close();
  });
}

async function init() {
  try {
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
    window.scrollTo({ top: 0, behavior: "auto" });
    await loadDynamicTools();
    bindGlobalEvents();
    await Promise.all([loadModules(), loadParserStatus(), loadImporterStatus(), loadDocuments(), loadAudit(), loadRuns()]);
  } catch (error) {
    console.error("TALON initialization failed", error);
    const documentList = $("#document-list");
    if (documentList) documentList.innerHTML = `<div class="warning">${escapeHtml(error.message)}</div>`;
    toast(`Errore di inizializzazione: ${error.message}`);
  }
}

init();
