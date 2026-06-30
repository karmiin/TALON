import {
  affinityEvidenceLabel,
  affinityPairs,
  renderAffinityGraph,
  renderAffinityMergeCards,
  renderAffinityPairRows,
} from "../shared/affinity.js";

function affinityThreshold(ctx) {
  return Number(ctx.$("#affinity-threshold")?.value || 0.55);
}

function selectedAffinityProfile(ctx) {
  return {
    lower: ctx.$("#affinity-lower")?.checked ?? true,
    j_to_i: ctx.$("#affinity-ji")?.checked ?? false,
    v_to_u: ctx.$("#affinity-vu")?.checked ?? false,
  };
}

function selectedFeatureCount(ctx) {
  const value = ctx.$("#affinity-feature-count")?.value || "auto";
  return value === "auto" ? "auto" : Number(value);
}

function renderAffinityToolResults(ctx, payload) {
  const threshold = affinityThreshold(ctx);
  const { pairs, edges } = affinityPairs(payload, threshold);
  const nearest = pairs[0];
  const evidenceLabel = affinityEvidenceLabel(threshold);
  ctx.$("#affinity-tool-results").innerHTML = `
    <section class="panel result-panel affinity-tool-panel">
      <div class="result-heading">
        <div>
          <p class="eyebrow">Grafo di affinità</p>
          <h2>${payload.documents.length} testi · ${edges.length} legami disegnati</h2>
          <p>Il grafo mostra solo i testi con affinità lessicale/formulare abbastanza forte da meritare verifica.</p>
        </div>
        <span class="badge">tutto l'archivio</span>
      </div>
      <div class="affinity-dashboard">
        <div class="affinity-graph-shell">
          ${renderAffinityGraph(ctx, payload, threshold)}
        </div>
        <aside class="affinity-readout">
          <article><strong>${ctx.escapeHtml(evidenceLabel)}</strong><span>livello di evidenza</span></article>
          <article><strong>${edges.length}</strong><span>legami disegnati</span></article>
          <article><strong>${nearest ? ctx.formatNumber(nearest.distance, 3) : "-"}</strong><span>distanza minima</span></article>
          <article><strong>${ctx.formatNumber(payload.max_features || 0)}</strong><span>feature usate</span></article>
          <article><strong>${ctx.formatNumber(payload.shown_features || (payload.features || []).length)}</strong><span>prime feature visibili</span></article>
        </aside>
      </div>
      ${edges.length ? "" : `<div class="warning">Nessuna coppia abbastanza vicina: i testi restano separati. Se vuoi esplorare indizi più deboli usa il livello "Esplorativo".</div>`}
      <div class="warning">${ctx.escapeHtml(payload.warning)}</div>
    </section>

    <section class="panel result-panel">
      <div class="result-heading">
        <div>
          <p class="eyebrow">Lettura del risultato</p>
          <h2>Accostamenti e termini che spiegano i cluster</h2>
          <p>Le coppie marcate come da verificare sono quelle abbastanza vicine rispetto al livello scelto.</p>
        </div>
      </div>
      <div class="affinity-layout">
        <div>
          <div class="legal-table-wrap">
            <table class="legal-table">
              <thead><tr><th>Testo A</th><th>Testo B</th><th>Esito</th><th>Affinità</th><th>Distanza tecnica</th><th>Stato</th></tr></thead>
              <tbody>${renderAffinityPairRows(ctx, payload, threshold)}</tbody>
            </table>
          </div>
          <div class="affinity-feature-tags">
            ${(payload.features || []).map((feature) => `<span>${ctx.escapeHtml(feature)}</span>`).join("")}
          </div>
        </div>
        <div class="affinity-merges">
          ${renderAffinityMergeCards(ctx, payload, threshold)}
        </div>
      </div>
    </section>
  `;
}

export function init(ctx) {
  async function runAffinityTool() {
    const targetCount = ctx.state.documents.length;
    if (targetCount < 3) {
      ctx.toast("Servono almeno tre documenti.");
      return;
    }
    const button = ctx.$("#run-affinity-tool");
    button.disabled = true;
    button.textContent = "Calcolo in corso...";
    ctx.$("#affinity-tool-results").innerHTML = `<div class="empty-state panel"><p>Calcolo del grafo di affinità...</p></div>`;
    try {
      const payload = await ctx.api("/api/affinity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ids: [],
          profile: selectedAffinityProfile(ctx),
          parser: ctx.$("#affinity-parser-select").value,
          max_features: selectedFeatureCount(ctx),
          threshold: affinityThreshold(ctx),
        }),
      });
      ctx.state.affinity = payload;
      renderAffinityToolResults(ctx, payload);
    } catch (error) {
      ctx.$("#affinity-tool-results").innerHTML = `<div class="warning">${ctx.escapeHtml(error.message)}</div>`;
    } finally {
      button.disabled = false;
      button.textContent = "Calcola grafo";
    }
  }

  ctx.$("#run-affinity-tool")?.addEventListener("click", runAffinityTool);
  ctx.$("#affinity-threshold")?.addEventListener("change", () => {
    if (ctx.state.affinity) renderAffinityToolResults(ctx, ctx.state.affinity);
  });
}
