let ctxRef;

function moduleLabel(moduleId) {
  const modules = ctxRef.state.modules ? ctxRef.state.modules.modules : [];
  return modules.find((module) => module.id === moduleId)?.label || moduleId;
}

function renderReportCenter() {
  const { $, state, escapeHtml } = ctxRef;
  const container = $("#report-center-panel");
  if (!container) return;
  const runs = state.runs || [];
  if (!runs.length) {
    container.innerHTML = `
      <div class="empty-state panel">
        <span class="empty-glyph">R</span>
        <h2>Nessun report</h2>
        <p>Esegui una pipeline per creare il primo report.</p>
      </div>
    `;
    return;
  }
  container.innerHTML = `
    <section class="panel result-panel">
      <div class="result-heading">
        <div>
          <p class="eyebrow">Storico</p>
          <h2>${runs.length} run registrati</h2>
          <p>Solo i run pipeline producono report HTML e PDF.</p>
        </div>
      </div>
      <div class="run-list">
        ${runs.map((run) => {
          const modules = Array.isArray(run.modules) ? run.modules.map(moduleLabel).join(", ") : "";
          const documents = (run.documents || []).map((document) => document.title).join(" · ");
          return `
            <article class="run-row">
              <div>
                <strong>Run #${escapeHtml(run.id)} · ${escapeHtml(run.kind)}</strong>
                <small>${escapeHtml(run.created_at)} · ${escapeHtml(documents || "nessun documento")}</small>
                <span>${escapeHtml(modules || run.parser || "parametri non dichiarati")}</span>
              </div>
              <div class="run-actions">
                ${run.report_url ? `<a class="secondary-button" href="${escapeHtml(run.report_url)}" target="_blank" rel="noreferrer">HTML</a>` : ""}
                ${run.report_pdf_url ? `<a class="primary-button" href="${escapeHtml(run.report_pdf_url)}">PDF</a>` : ""}
              </div>
            </article>
          `;
        }).join("")}
      </div>
    </section>
  `;
}

export function init(ctx) {
  ctxRef = ctx;
  ctx.onRunsChanged(renderReportCenter);
  ctx.onModulesChanged(renderReportCenter);
  renderReportCenter();
}
