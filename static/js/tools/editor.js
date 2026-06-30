let ctxRef;

function editorPayload() {
  const { state } = ctxRef;
  const document = state.editor.document || {};
  return {
    title: document.title || "",
    author: document.author || "",
    date_label: document.date_label || "",
    witness: document.witness || "",
    place: document.place || "",
    genre: document.genre || "",
    notes: document.notes || "",
    diplomatic_text: editorTextValue(),
  };
}

function fillEditorFields(document) {
  const { $ } = ctxRef;
  $("#editor-current-title").textContent = document.title;
  $("#editor-status").textContent = `${document.token_count} parole riconosciute · ${document.source_type}`;
  $("#editor-start")?.classList.add("is-hidden");
  renderEditorDocumentPage(document.diplomatic_text || "");
}

function editorTextValue() {
  const editor = ctxRef.$("#editor-text");
  if (!editor) return "";
  return editor.innerText.replace(/\u00a0/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

function renderEditorDocumentPage(text = editorTextValue()) {
  const { $, state, renderAnnotatedText } = ctxRef;
  const editor = $("#editor-text");
  if (!editor) return;
  editor.innerHTML = renderAnnotatedText(text, state.editor.annotations);
}

function renderEditorAnnotations() {
  const { $, state, escapeHtml, annotationToneClass } = ctxRef;
  const container = $("#editor-annotations");
  if (!container) return;
  container.innerHTML = state.editor.annotations.map((item) => `
    <article class="annotation-card ${annotationToneClass(item.label)}">
      <strong>${escapeHtml(item.label)} · ${escapeHtml(item.certainty)}</strong>
      <p>"${escapeHtml(item.quote)}"</p>
      <p>${escapeHtml(item.body)}</p>
      <small>${escapeHtml(item.source || "fonte non indicata")}</small>
      <button class="secondary-button" type="button" data-delete-editor-annotation="${item.id}">Cancella</button>
    </article>
  `).join("") || `<p class="muted">Nessuna annotazione salvata.</p>`;
}

function hideEditorContextMenu() {
  const { $, state } = ctxRef;
  $("#editor-context-menu")?.classList.remove("is-visible");
  state.editor.targetAnnotationId = null;
}

function showEditorAnnotationForm() {
  const { $, state, toast } = ctxRef;
  if (!state.editor.selection?.quote.trim()) {
    toast("Seleziona un passo nel testo.");
    return;
  }
  hideEditorContextMenu();
  $("#editor-annotation-form")?.classList.add("is-visible");
  $("#editor-annotation-body")?.focus();
}

function hideEditorAnnotationForm() {
  ctxRef.$("#editor-annotation-form")?.classList.remove("is-visible");
}

function hasEditorChanges() {
  const { state } = ctxRef;
  return Boolean(state.editor.document) && editorTextValue() !== state.editor.originalText;
}

async function loadEditorDocument(documentId = null) {
  const { $, api, state, toast } = ctxRef;
  const select = $("#editor-document-select");
  const id = Number(documentId || select?.value || 0);
  if (!id) {
    toast("Seleziona un documento.");
    return;
  }
  if (state.editor.document?.id === id && !hasEditorChanges()) return;
  if (state.editor.document?.id !== id && hasEditorChanges()) {
    const keepEditing = !window.confirm("Ci sono modifiche non salvate. Cambiare documento senza salvare?");
    if (keepEditing) {
      select.value = String(state.editor.document.id);
      return;
    }
  }
  $("#editor-status").textContent = "Caricamento...";
  try {
    const [documentPayload, annotationPayload] = await Promise.all([
      api(`/api/documents/${id}`),
      api(`/api/annotations?document_id=${id}`),
    ]);
    state.editor.document = documentPayload.document;
    state.editor.originalText = documentPayload.document.diplomatic_text || "";
    state.editor.annotations = annotationPayload.annotations;
    state.editor.selection = null;
    if (select) select.value = String(id);
    fillEditorFields(state.editor.document);
    renderEditorAnnotations();
    $("#editor-selection-preview").textContent = "Seleziona un passo nel testo.";
    hideEditorContextMenu();
    hideEditorAnnotationForm();
  } catch (error) {
    $("#editor-status").textContent = error.message;
  }
}

async function saveEditorDocument({ silent = false } = {}) {
  const { $, api, state, toast, loadDocuments } = ctxRef;
  if (!state.editor.document) {
    toast("Carica prima un documento.");
    return null;
  }
  const button = $("#editor-save");
  if (button && !silent) {
    button.disabled = true;
    button.textContent = "Salvataggio...";
  }
  try {
    const result = await api(`/api/documents/${state.editor.document.id}/update`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editorPayload()),
    });
    state.editor.document = result.document;
    state.editor.originalText = result.document.diplomatic_text || "";
    fillEditorFields(result.document);
    await loadDocuments();
    renderEditorDocumentSelect();
    $("#editor-document-select").value = String(result.document.id);
    renderEditorDocumentPage(result.document.diplomatic_text || "");
    if (!silent) {
      toast(result.text_changed ? "Testo salvato. Analisi grammaticale da rigenerare." : "Metadati salvati.");
    }
    return result;
  } catch (error) {
    toast(error.message);
    return null;
  } finally {
    if (button && !silent) {
      button.disabled = false;
      button.textContent = "Salva";
    }
  }
}

function resetEditorDocument() {
  const { $, state } = ctxRef;
  if (!state.editor.document) return;
  fillEditorFields(state.editor.document);
  state.editor.selection = null;
  $("#editor-selection-preview").textContent = "Seleziona un passo nel testo.";
  hideEditorContextMenu();
  hideEditorAnnotationForm();
}

function captureEditorSelection() {
  const { $, state } = ctxRef;
  const editor = $("#editor-text");
  const selection = window.getSelection();
  if (!editor || !state.editor.document || !selection || selection.isCollapsed || !selection.rangeCount) return;
  if (!editor.contains(selection.anchorNode) || !editor.contains(selection.focusNode)) return;
  const range = selection.getRangeAt(0);
  const prefix = range.cloneRange();
  prefix.selectNodeContents(editor);
  prefix.setEnd(range.startContainer, range.startOffset);
  const start = prefix.toString().length;
  const quote = range.toString();
  const end = start + quote.length;
  if (end <= start) return;
  state.editor.selection = { start, end, quote };
  $("#editor-selection-preview").textContent = `"${quote}"`;
}

function openEditorContextMenu(event) {
  const { $, state } = ctxRef;
  const editor = $("#editor-text");
  const menu = $("#editor-context-menu");
  if (!editor || !menu || !state.editor.document) return;
  const mark = event.target.closest?.("[data-annotation-id]");
  state.editor.targetAnnotationId = mark ? Number(mark.dataset.annotationId) : null;
  if (!mark) captureEditorSelection();
  const canAnnotate = Boolean(state.editor.selection?.quote.trim());
  const canDelete = Boolean(state.editor.targetAnnotationId);
  if (!canAnnotate && !canDelete) {
    hideEditorContextMenu();
    return;
  }
  event.preventDefault();
  $("#editor-menu-annotate").hidden = !canAnnotate;
  $("#editor-menu-delete").hidden = !canDelete;
  menu.classList.add("is-visible");
  const width = menu.offsetWidth || 180;
  const height = menu.offsetHeight || 80;
  const left = Math.min(event.clientX, window.innerWidth - width - 8);
  const top = Math.min(event.clientY, window.innerHeight - height - 8);
  menu.style.left = `${Math.max(8, left)}px`;
  menu.style.top = `${Math.max(8, top)}px`;
}

async function saveEditorAnnotation(event) {
  event.preventDefault();
  const { $, api, state, toast } = ctxRef;
  if (!state.editor.document) {
    toast("Carica prima un documento.");
    return;
  }
  captureEditorSelection();
  if (!state.editor.selection?.quote.trim()) {
    toast("Seleziona un passo nel testo.");
    return;
  }
  if (editorTextValue() !== state.editor.originalText) {
    const saved = await saveEditorDocument({ silent: true });
    if (!saved) return;
  }
  const button = $("#editor-annotation-form button[type=submit]");
  button.disabled = true;
  try {
    await api("/api/annotations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        document_id: state.editor.document.id,
        start_offset: state.editor.selection.start,
        end_offset: state.editor.selection.end,
        quote: state.editor.selection.quote,
        label: $("#editor-annotation-label").value,
        certainty: "possibile",
        body: $("#editor-annotation-body").value,
        source: $("#editor-annotation-source").value,
      }),
    });
    const payload = await api(`/api/annotations?document_id=${state.editor.document.id}`);
    state.editor.annotations = payload.annotations;
    state.editor.selection = null;
    $("#editor-annotation-form").reset();
    $("#editor-selection-preview").textContent = "Seleziona un passo nel testo.";
    hideEditorAnnotationForm();
    renderEditorAnnotations();
    renderEditorDocumentPage();
    toast("Annotazione salvata.");
  } catch (error) {
    toast(error.message);
  } finally {
    button.disabled = false;
  }
}

async function deleteEditorAnnotation(annotationId = ctxRef.state.editor.targetAnnotationId) {
  const { api, state, toast } = ctxRef;
  if (!annotationId) {
    toast("Nessuna annotazione selezionata.");
    return;
  }
  try {
    await api(`/api/annotations/${annotationId}`, { method: "DELETE" });
    const payload = await api(`/api/annotations?document_id=${state.editor.document.id}`);
    state.editor.annotations = payload.annotations;
    hideEditorContextMenu();
    hideEditorAnnotationForm();
    renderEditorAnnotations();
    renderEditorDocumentPage();
    toast("Annotazione cancellata.");
  } catch (error) {
    toast(error.message);
  }
}

function renderEditorDocumentSelect() {
  const { $, state, escapeHtml } = ctxRef;
  const select = $("#editor-document-select");
  if (!select) return;
  const current = select.value || state.editor.document?.id || "";
  select.innerHTML = state.documents.length ? state.documents.map((document) => `
    <option value="${document.id}">${escapeHtml(document.title)}</option>
  `).join("") : `<option value="">Nessun documento disponibile</option>`;
  if (current && state.documents.some((document) => String(document.id) === String(current))) {
    select.value = String(current);
  }
  if (!state.editor.document && state.documents.length) {
    loadEditorDocument(select.value || state.documents[0].id);
  }
}

export function init(ctx) {
  ctxRef = ctx;
  const { $, onDocumentsChanged } = ctx;
  onDocumentsChanged(renderEditorDocumentSelect);
  renderEditorDocumentSelect();

  $("#editor-document-select")?.addEventListener("change", () => loadEditorDocument());
  $("#editor-save")?.addEventListener("click", () => saveEditorDocument());
  $("#editor-reset")?.addEventListener("click", resetEditorDocument);
  $("#editor-text")?.addEventListener("select", captureEditorSelection);
  $("#editor-text")?.addEventListener("keyup", captureEditorSelection);
  $("#editor-text")?.addEventListener("mouseup", captureEditorSelection);
  $("#editor-text")?.addEventListener("contextmenu", openEditorContextMenu);
  $("#editor-menu-annotate")?.addEventListener("click", showEditorAnnotationForm);
  $("#editor-menu-delete")?.addEventListener("click", () => deleteEditorAnnotation());
  $("#editor-close-annotation")?.addEventListener("click", hideEditorAnnotationForm);
  $("#editor-annotation-form")?.addEventListener("submit", saveEditorAnnotation);
  $("#editor-annotations")?.addEventListener("click", (event) => {
    const button = event.target.closest?.("[data-delete-editor-annotation]");
    if (button) deleteEditorAnnotation(Number(button.dataset.deleteEditorAnnotation));
  });
  document.addEventListener("click", (event) => {
    if (!event.target.closest?.("#editor-context-menu")) hideEditorContextMenu();
  });
}
