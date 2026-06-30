let ctxRef;

function renderAuditSummary() {
  const { $, state } = ctxRef;
  const container = $("#audit-summary");
  if (!container || !state.audit) return;
  const pdf = state.audit.pdf_import;
  container.innerHTML = `
    <article><strong>${state.audit.documents}</strong><span>documenti</span></article>
    <article><strong>${state.audit.modules}</strong><span>moduli</span></article>
    <article><strong>${state.audit.runtime_modules}</strong><span>runtime</span></article>
    <article><strong>${pdf.available ? "ok" : "no"}</strong><span>PDF import</span></article>
    <article><strong>${state.audit.frontino_present ? "si" : "no"}</strong><span>frontino ${state.audit.frontino_in_documents ? "importato" : "file"}</span></article>
  `;
}

function renderModuleCatalog() {
  const { $, state, escapeHtml } = ctxRef;
  const container = $("#module-catalog-panel");
  if (!container || !state.modules) return;
  const modules = state.modules.modules || [];
  const rows = modules.map((module) => {
    const runtime = module.runtime?.kind || (module.runnable ? "built-in" : "manifest");
    return `
      <tr>
        <td><strong>${escapeHtml(module.label)}</strong><small>${escapeHtml(module.id)}</small></td>
        <td>${escapeHtml(module.category)}</td>
        <td><span class="badge">${escapeHtml(module.status)}</span></td>
        <td>${module.runnable ? '<span class="runtime-ok">runnable</span>' : '<span class="runtime-missing">catalogo</span>'}</td>
        <td>${escapeHtml(runtime)}</td>
        <td>${escapeHtml(module.source || "interno")}</td>
      </tr>
    `;
  }).join("");
  container.innerHTML = `
    <section class="panel result-panel">
      <div class="result-heading">
        <div>
          <p class="eyebrow">Manifest</p>
          <h2>${modules.length} moduli registrati</h2>
          <p>${(state.modules.runtime_modules || []).length} moduli eseguibili nella pipeline.</p>
        </div>
        <a class="secondary-button" href="/api/audit.json">Scarica audit JSON</a>
      </div>
      <div class="module-paths">
        ${(state.modules.module_paths || []).map((path) => `<code>${escapeHtml(path)}</code>`).join("")}
      </div>
      <div id="audit-summary" class="audit-summary"></div>
      ${(state.modules.errors || []).map((error) => `<div class="warning">${escapeHtml(error)}</div>`).join("")}
      <div class="legal-table-wrap">
        <table class="legal-table module-table">
          <thead><tr><th>Modulo</th><th>Tipo</th><th>Stato</th><th>Pipeline</th><th>Runtime</th><th>Sorgente</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </section>
  `;
  renderAuditSummary();
}

export function init(ctx) {
  ctxRef = ctx;
  ctx.onModulesChanged(renderModuleCatalog);
  ctx.onAuditChanged(renderAuditSummary);
  renderModuleCatalog();
  renderAuditSummary();
}
