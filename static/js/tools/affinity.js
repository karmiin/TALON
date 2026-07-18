import {
  affinityPairs,
  renderPcaDocumentKey,
  renderPcaLoadings,
  renderPcaPlot,
  renderPcaVariance,
} from "../shared/affinity.js";

function selectedPcaProfile(ctx) {
  return {
    lower: ctx.$("#affinity-lower")?.checked ?? true,
    j_to_i: ctx.$("#affinity-ji")?.checked ?? false,
    v_to_u: ctx.$("#affinity-vu")?.checked ?? false,
  };
}

function selectedMode(ctx) {
  return ctx.$('input[name="pca-mode"]:checked')?.value || "lexical";
}

function selectedFeatureCount(ctx, mode) {
  const value = ctx.$("#affinity-feature-count")?.value || "auto";
  if (mode === "function") return value === "auto" ? 120 : Number(value);
  return value === "auto" ? "auto" : Number(value);
}

function modeCopy(mode) {
  if (mode === "function") {
    return {
      eyebrow: "PCA su parole grammaticali",
      title: "Parole grammaticali",
      description: "Profilo non tematico: congiunzioni, preposizioni, pronomi e particelle.",
      empty: "Calcolo della PCA sulle parole grammaticali...",
    };
  }
  return {
    eyebrow: "PCA lessicale",
    title: "Lessico / lemmi",
    description: "Profilo contenutistico: parole o lemmi pieni, senza function words.",
    empty: "Calcolo della PCA lessicale...",
  };
}

function parserLabel(payload, mode) {
  if (mode === "function") return "Function words · forme normalizzate";
  if (payload.parser === "latincy") return "LatinCy · lemmi";
  return "Forme normalizzate";
}

function renderFeaturePreview(ctx, payload, mode) {
  const features = (payload.features || []).slice(0, 12);
  if (!features.length) return "";
  return `
    <div class="pca-feature-preview">
      <strong>${ctx.escapeHtml(parserLabel(payload, mode))}</strong>
      <span>${features.map((feature) => ctx.escapeHtml(feature)).join(" · ")}</span>
    </div>
  `;
}

function renderDistanceRows(ctx, payload, mode) {
  let rows = [];
  if (mode === "function") {
    rows = [...(payload.explanations || [])]
      .sort((a, b) => a.delta - b.delta)
      .slice(0, 8)
      .map((pair) => ({
        left: pair.left_title,
        right: pair.right_title,
        metric: ctx.formatNumber(pair.delta, 3),
        cosine: ctx.formatNumber(pair.cosine, 3),
        features: pair.contributors.slice(0, 5).map((item) => item.feature).join(", "),
      }));
  } else {
    rows = affinityPairs(payload, 1).pairs.slice(0, 8).map((pair) => ({
      left: pair.leftTitle,
      right: pair.rightTitle,
      metric: `${ctx.formatNumber(pair.affinity * 100, 1)}%`,
      cosine: ctx.formatNumber(pair.distance, 3),
      features: "",
    }));
  }
  if (!rows.length) return `<p class="muted">Nessuna coppia disponibile.</p>`;
  return `
    <div class="legal-table-wrap">
      <table class="legal-table">
        <thead>
          <tr>
            <th>Testo A</th>
            <th>Testo B</th>
            <th>${mode === "function" ? "Delta" : "Similarità"}</th>
            <th>Coseno</th>
            ${mode === "function" ? "<th>Feature principali</th>" : ""}
          </tr>
        </thead>
        <tbody>
          ${rows.map((row) => `
            <tr>
              <td>${ctx.escapeHtml(row.left)}</td>
              <td>${ctx.escapeHtml(row.right)}</td>
              <td><strong>${ctx.escapeHtml(row.metric)}</strong></td>
              <td>${ctx.escapeHtml(row.cosine)}</td>
              ${mode === "function" ? `<td>${ctx.escapeHtml(row.features)}</td>` : ""}
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderWarnings(ctx, payload) {
  const warnings = payload.warnings || (payload.warning ? [payload.warning] : []);
  if (!warnings.length) return "";
  return `<div class="warning-list">${warnings.map((warning) => `<div class="warning">${ctx.escapeHtml(warning)}</div>`).join("")}</div>`;
}

function renderPcaToolResults(ctx, payload, mode) {
  const copy = modeCopy(mode);
  ctx.$("#affinity-tool-results").innerHTML = `
    <section class="panel result-panel pca-result-panel">
      <div class="result-heading">
        <div>
          <p class="eyebrow">${copy.eyebrow}</p>
          <h2>${copy.title}</h2>
          <p>${copy.description}</p>
        </div>
        <span class="badge">${payload.documents.length} testi · ${payload.max_features} feature</span>
      </div>
      ${renderPcaVariance(ctx, payload)}
      ${renderFeaturePreview(ctx, payload, mode)}
      <div class="affinity-dashboard">
        <div class="affinity-graph-shell pca-shell">
          ${renderPcaPlot(ctx, payload, { label: copy.eyebrow })}
        </div>
        ${renderPcaDocumentKey(ctx, payload)}
      </div>
      <div class="result-note">
        Punti vicini indicano profili più simili sulle feature selezionate. Se il piano 2D spiega poca varianza, la mappa va letta come orientamento e non come prova.
      </div>
      ${renderWarnings(ctx, payload)}
    </section>

    <details class="panel result-panel pca-detail-panel">
      <summary>Dettagli tecnici</summary>
      <div class="pca-detail-grid">
        <section>
          <h3>Feature sugli assi</h3>
          ${renderPcaLoadings(ctx, payload)}
        </section>
        <section>
          <h3>Coppie più vicine</h3>
          ${renderDistanceRows(ctx, payload, mode)}
        </section>
      </div>
    </details>
  `;
}

function syncPcaControls(ctx) {
  const functionMode = selectedMode(ctx) === "function";
  const parser = ctx.$("#affinity-parser-select");
  if (parser) parser.disabled = functionMode;
}

export function init(ctx) {
  async function runPcaTool() {
    const mode = selectedMode(ctx);
    const minDocs = mode === "function" ? 2 : 3;
    if (ctx.state.documents.length < minDocs) {
      ctx.toast(`Servono almeno ${minDocs} documenti.`);
      return;
    }
    const button = ctx.$("#run-affinity-tool");
    button.disabled = true;
    button.textContent = "Calcolo in corso...";
    ctx.$("#affinity-tool-results").innerHTML = `<div class="empty-state panel"><p>${modeCopy(mode).empty}</p></div>`;
    try {
      let payload;
      if (mode === "function") {
        payload = await ctx.api("/api/compare", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ids: ctx.state.documents.map((document) => document.id),
            feature_type: "function",
            max_features: selectedFeatureCount(ctx, mode),
            profile: selectedPcaProfile(ctx),
          }),
        });
      } else {
        payload = await ctx.api("/api/affinity", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ids: [],
            profile: selectedPcaProfile(ctx),
            parser: ctx.$("#affinity-parser-select").value,
            max_features: selectedFeatureCount(ctx, mode),
          }),
        });
      }
      ctx.state.affinity = payload;
      renderPcaToolResults(ctx, payload, mode);
    } catch (error) {
      ctx.$("#affinity-tool-results").innerHTML = `<div class="warning">${ctx.escapeHtml(error.message)}</div>`;
    } finally {
      button.disabled = false;
      button.textContent = "Calcola PCA";
    }
  }

  ctx.$("#run-affinity-tool")?.addEventListener("click", runPcaTool);
  ctx.$$('input[name="pca-mode"]').forEach((input) => input.addEventListener("change", () => syncPcaControls(ctx)));
  syncPcaControls(ctx);
}
