import { createDocumentPicker } from "../shared/document-picker.js";

let leftPicker;
let rightPicker;

function selectedDiffProfile(ctx) {
  return {
    lower: ctx.$("#diff-lower").checked,
    j_to_i: ctx.$("#diff-ji").checked,
    v_to_u: ctx.$("#diff-vu").checked,
  };
}

function renderDiffSegments(ctx, segments) {
  return segments.map((segment) => {
    if (!segment.text) return "";
    const type = ctx.escapeHtml(segment.type);
    return `<span class="diff-token diff-${type}" data-diff-type="${type}">${ctx.escapeHtml(segment.text)}</span>`;
  }).join("");
}

function renderLegendItem(className, label, detail) {
  return `
    <span class="diff-legend-item">
      <i class="diff-legend-swatch ${className}" aria-hidden="true"></i>
      <span><strong>${label}</strong><small>${detail}</small></span>
    </span>
  `;
}

function bindSynchronizedScrolling(ctx) {
  const panes = ctx.$$("[data-diff-scroll]");
  if (panes.length !== 2) return;
  let syncing = false;
  panes.forEach((source, index) => {
    source.addEventListener("scroll", () => {
      if (syncing) return;
      const target = panes[index === 0 ? 1 : 0];
      const sourceRange = source.scrollHeight - source.clientHeight;
      const targetRange = target.scrollHeight - target.clientHeight;
      syncing = true;
      target.scrollTop = sourceRange > 0 ? (source.scrollTop / sourceRange) * targetRange : 0;
      requestAnimationFrame(() => { syncing = false; });
    });
  });
}

function renderDiffResults(ctx, payload) {
  const variants = payload.summary.replace + payload.summary.delete + payload.summary.insert;
  ctx.$("#diff-tool-results").innerHTML = `
    <section class="panel diff-result-panel">
      <header class="diff-result-header">
        <div>
          <p class="eyebrow">Esito del confronto</p>
          <h2>${ctx.formatNumber(payload.similarity * 100, 1)}% di somiglianza</h2>
          <p>${ctx.escapeHtml(payload.method)}</p>
        </div>
        <dl class="diff-result-stats">
          <div><dt>Varianti</dt><dd>${ctx.formatNumber(variants)}</dd></div>
          <div><dt>Sostituzioni</dt><dd>${ctx.formatNumber(payload.summary.replace)}</dd></div>
          <div><dt>Solo A</dt><dd>${ctx.formatNumber(payload.summary.delete)}</dd></div>
          <div><dt>Solo B</dt><dd>${ctx.formatNumber(payload.summary.insert)}</dd></div>
        </dl>
      </header>
      <div class="diff-legend" aria-label="Legenda delle differenze">
        ${renderLegendItem("diff-replace", "Sostituzione", "passo modificato")}
        ${renderLegendItem("diff-delete", "Solo nel testo A", "omissione nel testo B")}
        ${renderLegendItem("diff-insert", "Solo nel testo B", "aggiunta rispetto al testo A")}
        <span class="diff-scroll-note">Scorrimento sincronizzato</span>
      </div>
      <div class="diff-grid">
        <article class="diff-pane">
          <header><span>Testo A</span><h3>${ctx.escapeHtml(payload.documents[0].title)}</h3></header>
          <pre data-diff-scroll>${renderDiffSegments(ctx, payload.left)}</pre>
        </article>
        <article class="diff-pane">
          <header><span>Testo B</span><h3>${ctx.escapeHtml(payload.documents[1].title)}</h3></header>
          <pre data-diff-scroll>${renderDiffSegments(ctx, payload.right)}</pre>
        </article>
      </div>
    </section>
  `;
  bindSynchronizedScrolling(ctx);
}

function refreshPickers(ctx) {
  const documents = ctx.state.documents || [];
  const leftId = leftPicker?.value || documents[0]?.id;
  const rightId = rightPicker?.value || documents.find((document) => document.id !== leftId)?.id || documents[0]?.id;
  leftPicker?.setDocuments(documents, leftId);
  rightPicker?.setDocuments(documents, rightId);
}

function keepDocumentsDistinct(changed, other, ctx) {
  if (!changed.value || changed.value !== other.value) return;
  const alternative = ctx.state.documents.find((document) => document.id !== changed.value);
  if (alternative) other.setValue(alternative.id);
}

export function init(ctx) {
  const leftRoot = ctx.$("#diff-left-picker");
  const rightRoot = ctx.$("#diff-right-picker");
  if (!leftRoot || !rightRoot) return;

  leftPicker = createDocumentPicker(leftRoot, {
    label: "Testo A",
    onChange: () => keepDocumentsDistinct(leftPicker, rightPicker, ctx),
  });
  rightPicker = createDocumentPicker(rightRoot, {
    label: "Testo B",
    onChange: () => keepDocumentsDistinct(rightPicker, leftPicker, ctx),
  });
  refreshPickers(ctx);
  ctx.onDocumentsChanged(() => refreshPickers(ctx));

  ctx.$("#diff-swap-documents")?.addEventListener("click", () => {
    const leftId = leftPicker.value;
    leftPicker.setValue(rightPicker.value);
    rightPicker.setValue(leftId);
  });

  async function runDiffTool() {
    const ids = [leftPicker.value, rightPicker.value].filter(Boolean);
    if (ids.length !== 2 || ids[0] === ids[1]) {
      ctx.toast("Seleziona due documenti diversi.");
      return;
    }
    const button = ctx.$("#run-diff-tool");
    button.disabled = true;
    button.textContent = "Confronto in corso...";
    ctx.$("#diff-tool-results").innerHTML = `<div class="empty-state panel"><p>Allineamento delle trascrizioni...</p></div>`;
    try {
      const payload = await ctx.api("/api/diff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, profile: selectedDiffProfile(ctx) }),
      });
      renderDiffResults(ctx, payload);
    } catch (error) {
      ctx.$("#diff-tool-results").innerHTML = `<div class="warning">${ctx.escapeHtml(error.message)}</div>`;
    } finally {
      button.disabled = false;
      button.textContent = "Confronta testi";
    }
  }

  ctx.$("#run-diff-tool")?.addEventListener("click", runDiffTool);
}
