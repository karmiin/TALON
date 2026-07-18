export function createDocumentPicker(root, options = {}) {
  if (!root) throw new Error("Contenitore del selettore documento non trovato.");

  let documents = [];
  let selectedId = null;
  let filter = "";
  const label = options.label || "Documento";

  root.classList.add("document-picker");
  root.innerHTML = `
    <button class="document-picker-trigger" type="button" aria-haspopup="listbox" aria-expanded="false">
      <svg class="document-picker-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3h10l4 4v14H5z"/><path d="M15 3v5h4"/></svg>
      <span class="document-picker-copy">
        <small>${escapeText(label)}</small>
        <strong data-picker-title>Nessun documento</strong>
      </span>
      <svg class="document-picker-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m8 10 4 4 4-4"/></svg>
    </button>
    <div class="document-picker-popover" hidden>
      <div class="document-picker-heading">Seleziona documento</div>
      <label class="document-picker-search" hidden>
        <span class="sr-only">Filtra documenti</span>
        <input type="search" placeholder="Cerca un documento">
      </label>
      <div class="document-picker-options" role="listbox"></div>
    </div>
  `;

  const trigger = root.querySelector(".document-picker-trigger");
  const popover = root.querySelector(".document-picker-popover");
  const title = root.querySelector("[data-picker-title]");
  const search = root.querySelector(".document-picker-search");
  const searchInput = search.querySelector("input");
  const optionList = root.querySelector(".document-picker-options");

  function isOpen() {
    return !popover.hidden;
  }

  function close() {
    popover.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
    root.classList.remove("is-open");
    filter = "";
    searchInput.value = "";
  }

  function open() {
    if (!documents.length) return;
    popover.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    root.classList.add("is-open");
    renderOptions();
    if (documents.length > 7) searchInput.focus();
  }

  function toggle() {
    if (isOpen()) close();
    else open();
  }

  function renderOptions() {
    const query = filter.trim().toLocaleLowerCase();
    const visible = documents.filter((document) =>
      [document.title, document.author, document.witness]
        .join(" ")
        .toLocaleLowerCase()
        .includes(query)
    );
    search.hidden = documents.length <= 7;
    optionList.innerHTML = visible.length ? visible.map((document) => {
      const selected = document.id === selectedId;
      const secondary = document.witness || document.author || `${document.token_count || 0} parole`;
      return `
        <button class="document-picker-option${selected ? " is-selected" : ""}" type="button"
          role="option" aria-selected="${selected}" data-document-picker-id="${document.id}">
          <span>
            <strong>${escapeText(document.title)}</strong>
            <small>${escapeText(secondary)}</small>
          </span>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 12 4 4 8-8"/></svg>
        </button>
      `;
    }).join("") : '<p class="document-picker-empty">Nessun risultato.</p>';
    optionList.querySelectorAll("[data-document-picker-id]").forEach((button) => {
      button.addEventListener("click", () => {
        const nextId = Number(button.dataset.documentPickerId);
        if (nextId === selectedId) {
          close();
          return;
        }
        selectedId = nextId;
        renderTrigger();
        close();
        options.onChange?.(nextId);
      });
    });
  }

  function renderTrigger() {
    const selected = documents.find((document) => document.id === selectedId);
    title.textContent = selected?.title || "Nessun documento";
    trigger.disabled = !documents.length;
    trigger.title = selected?.title || "";
  }

  function setDocuments(nextDocuments, preferredId = selectedId) {
    documents = [...(nextDocuments || [])];
    const numericPreferred = Number(preferredId);
    selectedId = documents.some((document) => document.id === numericPreferred)
      ? numericPreferred
      : documents[0]?.id || null;
    renderTrigger();
    if (isOpen()) renderOptions();
    return selectedId;
  }

  function setValue(value) {
    const numeric = Number(value);
    if (documents.some((document) => document.id === numeric)) {
      selectedId = numeric;
      renderTrigger();
      if (isOpen()) renderOptions();
    }
  }

  trigger.addEventListener("click", toggle);
  searchInput.addEventListener("input", () => {
    filter = searchInput.value;
    renderOptions();
  });
  root.addEventListener("keydown", (event) => {
    if (event.key === "Escape") close();
  });
  document.addEventListener("click", (event) => {
    if (isOpen() && !root.contains(event.target)) close();
  });

  renderTrigger();
  return {
    get value() {
      return selectedId;
    },
    setDocuments,
    setValue,
    close,
  };
}

function escapeText(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
