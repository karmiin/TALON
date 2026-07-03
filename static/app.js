const state = {
  documents: [],
  activeDocument: null,
  annotations: [],
  analysis: null,
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
  renderTopbar();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderTopbar() {
  const current = document.body.dataset.currentView || "home";
  const title = $("#current-view-title");
  const status = $("#workspace-status");
  if (title) title.textContent = VIEW_LABELS[current] || current;
  if (status) {
    const docs = state.documents?.length ?? 0;
    const tools = state.modules?.tools?.length ?? state.modules?.runtime_modules?.length ?? 0;
    status.textContent = `${docs} testi · ${tools} tool`;
  }
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
  renderHomeKpis();
  renderTopbar();
  notifyData("documents");
}

async function loadModules() {
  state.modules = await api("/api/modules");
  renderHomeKpis();
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
  renderHomeKpis();
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

function renderHomeKpis() {
  const container = $("#home-kpis");
  if (!container) return;
  const pdfOk = state.audit?.pdf_import?.available;
  const values = [
    [state.documents?.length ?? "-", "Documenti"],
    [state.modules?.modules?.length ?? state.audit?.modules ?? "-", "Moduli"],
    [state.modules?.runtime_modules?.length ?? state.audit?.runtime_modules ?? "-", "Runtime"],
    [pdfOk === undefined ? "-" : pdfOk ? "OK" : "NO", "PDF"],
  ];
  container.innerHTML = values.map(([value, label]) => `
    <article>
      <strong>${escapeHtml(value)}</strong>
      <span>${escapeHtml(label)}</span>
    </article>
  `).join("");
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
  container.innerHTML = tools.map((tool) => {
    const ui = tool.ui || {};
    const view = ui.view || "";
    const icon = ui.icon || String(tool.order || "").padStart(2, "0");
    const primary = ui.primary ? " primary-tool" : "";
    const outputs = (tool.outputs || []).slice(0, 2).join(" · ");
    const statusLabel = tool.status === "active" ? "Attivo" : tool.status;
    const actionAttribute = hasView(view)
      ? `data-view="${escapeHtml(view)}"`
      : `data-tool-id="${escapeHtml(tool.id)}"`;
    return `
      <button class="tool-card${primary}" ${actionAttribute}>
        <span class="tool-icon">${escapeHtml(icon)}</span>
        <span class="tool-copy">
          <strong>${escapeHtml(tool.label)}</strong>
          <small>${escapeHtml(tool.description)}</small>
        </span>
        <span class="tool-output">${escapeHtml(outputs || tool.category)}</span>
        <span class="tool-meta">
          <b>${escapeHtml(statusLabel)}</b>
        </span>
      </button>
    `;
  }).join("");
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
    await loadDynamicTools();
    bindGlobalEvents();
    await Promise.all([loadModules(), loadParserStatus(), loadImporterStatus(), loadDocuments(), loadAudit(), loadRuns()]);
  } catch (error) {
    $("#document-list").innerHTML = `<div class="warning">${escapeHtml(error.message)}</div>`;
    toast("Impossibile collegarsi al server locale.");
  }
}

init();
