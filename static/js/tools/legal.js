import { renderLegalTermResults } from "../shared/legal.js";

export function init(ctx) {
  async function runLegalTool() {
    const ids = ctx.selectedIds("[data-legal-id]");
    if (!ids.length) {
      ctx.toast("Seleziona almeno un documento.");
      return;
    }
    const button = ctx.$("#run-legal-tool");
    button.disabled = true;
    button.textContent = "Analisi in corso...";
    ctx.$("#legal-tool-results").innerHTML = `<div class="empty-state panel"><p>Calcolo dei termini e preparazione dei testi evidenziati...</p></div>`;
    try {
      const payload = await ctx.api("/api/legal-terms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ids,
          profile: ctx.selectedProfile(),
          terms: ctx.$("#legal-tool-terms").value.split(/[,;\n]+/).map((item) => item.trim()).filter(Boolean),
          parser: ctx.$("#legal-parser-select").value,
        }),
      });
      renderLegalTermResults(ctx, payload, "#legal-tool-results");
    } catch (error) {
      ctx.$("#legal-tool-results").innerHTML = `<div class="warning">${ctx.escapeHtml(error.message)}</div>`;
    } finally {
      button.disabled = false;
      button.textContent = "Analizza termini";
    }
  }

  ctx.$("#run-legal-tool")?.addEventListener("click", runLegalTool);
}
