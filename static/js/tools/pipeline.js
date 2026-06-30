import { affinityPairs, renderAffinityGraph } from "../shared/affinity.js";
import { renderLegalTermTable } from "../shared/legal.js";

let ctxRef;

function selectedCompareIds() {
  return ctxRef.$$("[data-compare-id]:checked").map((input) => Number(input.value));
}

function selectedStylometrySettings() {
  const profile = ctxRef.$("#stylometry-profile")?.value || "standard";
  if (profile === "function") {
    return { feature_type: "function", max_features: 100 };
  }
  if (profile === "char3") {
    return { feature_type: "char3", max_features: 180 };
  }
  return { feature_type: "words", max_features: 100 };
}

function selectedLegalTerms() {
  return ctxRef.$("#legal-terms").value
    .split(/[,;\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function selectedPipelineModules() {
  return ctxRef.$$("[data-pipeline-module]:checked").map((input) => input.value);
}

function renderAllDocumentPickers() {
  const { renderDocumentChecklist } = ctxRef;
  renderDocumentChecklist("#compare-document-list", "data-compare-id");
  renderDocumentChecklist("#legal-document-list", "data-legal-id");
  renderDocumentChecklist("#diff-document-list", "data-diff-id", { max: 2 });
  renderDocumentChecklist("#voyant-document-list", "data-voyant-id");
  renderDocumentChecklist("#collatinus-document-list", "data-collatinus-id");
}

function renderModuleControls() {
  const { $, state, escapeHtml } = ctxRef;
  if (!state.modules) return;
  const parserSelect = $("#parser-select");
  const reportSelect = $("#report-style");
  const moduleList = $("#analysis-module-list");
  if (!parserSelect || !reportSelect || !moduleList) return;

  const parserStatusById = new Map(state.parserStatus.map((item) => [item.id, item]));
  parserSelect.innerHTML = state.modules.parsers.map((parser) => {
    const runtime = parserStatusById.get(parser.id);
    const disabled = runtime && !runtime.runnable && runtime.source !== "manual";
    const status = runtime?.runnable
      ? "runtime ok"
      : runtime?.source === "manual"
        ? "import manuale"
        : parser.status;
    return `<option value="${escapeHtml(parser.id)}" ${disabled ? "disabled" : ""}>${escapeHtml(parser.label)} · ${escapeHtml(status)}</option>`;
  }).join("");

  const legalParserSelect = $("#legal-parser-select");
  if (legalParserSelect) legalParserSelect.innerHTML = parserSelect.innerHTML;
  const affinityParserSelect = $("#affinity-parser-select");
  if (affinityParserSelect) affinityParserSelect.innerHTML = parserSelect.innerHTML;

  reportSelect.innerHTML = state.modules.report_styles.map((style) => `
    <option value="${escapeHtml(style.id)}">${escapeHtml(style.label)}</option>
  `).join("");

  const reportModules = [...state.modules.analyses, ...state.modules.integrations]
    .filter((module) => module.runnable)
    .filter((module) => module.id !== "voyant_export");
  moduleList.innerHTML = reportModules.map((module) => `
    <label class="module-choice">
      <input type="checkbox" value="${escapeHtml(module.id)}" data-pipeline-module checked>
      <span>
        <strong>${escapeHtml(module.label)}</strong>
        <small>${escapeHtml(module.description)}</small>
        ${module.outputs?.length ? `<em>${escapeHtml(module.outputs.join(" · "))}</em>` : ""}
      </span>
    </label>
  `).join("");
  const activeAnalyses = state.modules.analyses.filter((module) => module.status === "active").length;
  const parserLayers = state.modules.parsers.length;
  $("#module-summary").innerHTML = `
    <span>${reportModules.length} strumenti report</span>
    <span>${parserLayers} livelli linguistici</span>
    <span>${state.modules.module_paths.length} path moduli</span>
    <span>${activeAnalyses} analisi attive</span>
  `;
}

function featureTypeExplanation(type) {
  if (type === "function") {
    return "Sono contate solo parole grammaticali ricorrenti: elementi molto frequenti come congiunzioni, preposizioni e pronomi. Sono utili per osservare abitudini di scrittura meno dipendenti dal tema.";
  }
  if (type === "char3") {
    return "Sono contate sequenze di 3 caratteri. Questa scelta e meno leggibile, ma puo catturare grafie, terminazioni e abitudini ortografiche.";
  }
  return "Sono contate le parole piu frequenti del gruppo selezionato. E la scelta piu leggibile, ma risente anche dell'argomento dei testi.";
}

function profileExplanation(profile = {}) {
  const enabled = [];
  if (profile.lower) enabled.push("minuscole");
  if (profile.j_to_i) enabled.push("j -> i");
  if (profile.v_to_u) enabled.push("v -> u");
  if (!enabled.length) return "nessuna pulizia opzionale";
  return enabled.join(", ");
}

async function runCompare() {
  const { $, api, state, toast, escapeHtml } = ctxRef;
  const ids = selectedCompareIds();
  if (ids.length < 2) {
    toast("Seleziona almeno due documenti.");
    return;
  }
  const button = $("#run-compare");
  button.disabled = true;
  button.textContent = "Calcolo in corso...";
  $("#compare-results").innerHTML = `<div class="empty-state panel"><p>Calcolo delle frequenze e delle distanze...</p></div>`;
  try {
    state.compare = await api("/api/compare", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ids,
        feature_type: $("#feature-type").value,
        max_features: Number($("#feature-count").value),
        profile: ctxRef.selectedProfile(),
      }),
    });
    renderCompareResults(state.compare);
  } catch (error) {
    $("#compare-results").innerHTML = `<div class="warning">${escapeHtml(error.message)}</div>`;
  } finally {
    button.disabled = false;
    button.textContent = "Calcola confronto";
  }
}

function renderCompareResults(result) {
  const { $, escapeHtml } = ctxRef;
  $("#compare-results").innerHTML = `
    <section class="panel result-panel">
      <div class="result-heading">
        <div>
          <p class="eyebrow">Confronto dello stile misurabile</p>
          <h2>Quanto si assomigliano i testi?</h2>
          <p>${escapeHtml(result.interpretation)}</p>
        </div>
        <span class="badge">${result.max_features} caratteristiche</span>
      </div>
      <div class="warning-list">${result.warnings.map((warning) => `<div class="warning">${escapeHtml(warning)}</div>`).join("")}</div>
      <div class="result-note">
        <strong>Tabella usata:</strong>
        ${escapeHtml(featureTypeExplanation(result.feature_type))}
        <br>
        <strong>Pulizia applicata:</strong> ${escapeHtml(profileExplanation(result.profile))}.
      </div>
      ${renderStylometryDistanceTable(result)}
    </section>

    <section class="panel result-panel">
      <div class="result-heading">
        <div>
          <p class="eyebrow">Spiegazione</p>
          <h2>Perche due testi risultano vicini o lontani?</h2>
          <p>Apri una coppia e poi una caratteristica per tornare alle occorrenze nel testo.</p>
        </div>
      </div>
      <div class="explanation-grid">
        ${result.explanations.map((pair, index) => renderPairExplanation(pair, index === 0)).join("")}
      </div>
      <div id="feature-kwic" style="margin-top:1rem"></div>
    </section>
  `;
  bindCompareEvents();
}

function renderStylometryDistanceTable(result, limit = null) {
  const { escapeHtml, formatNumber } = ctxRef;
  const rows = [...(result.explanations || [])].sort((a, b) => a.delta - b.delta);
  const visibleRows = limit ? rows.slice(0, limit) : rows;
  return `
    <p class="table-note">Valori piu bassi indicano testi piu vicini sulle caratteristiche misurate. La riga e cliccabile per aprire le parole che spiegano la distanza.</p>
    <div class="legal-table-wrap">
      <table class="legal-table">
        <thead>
          <tr>
            <th>Testo A</th>
            <th>Testo B</th>
            <th>Delta</th>
            <th>Coseno</th>
            <th>Prime caratteristiche responsabili</th>
          </tr>
        </thead>
        <tbody>
          ${visibleRows.map((pair) => `
            <tr data-pair-key="${pair.left_id}-${pair.right_id}">
              <td>${escapeHtml(pair.left_title)}</td>
              <td>${escapeHtml(pair.right_title)}</td>
              <td><strong>${formatNumber(pair.delta, 3)}</strong></td>
              <td>${formatNumber(pair.cosine, 3)}</td>
              <td>${pair.contributors.slice(0, 4).map((item) => escapeHtml(item.feature)).join(", ")}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderPairExplanation(pair, expanded) {
  const { escapeHtml, formatNumber } = ctxRef;
  const key = `${pair.left_id}-${pair.right_id}`;
  return `
    <article class="pair-card ${expanded ? "is-selected" : ""}" data-pair-card="${key}">
      <button class="pair-summary" data-pair-toggle="${key}">
        <span><strong>${escapeHtml(pair.left_title)}</strong><br>vs ${escapeHtml(pair.right_title)}</span>
        <span>Distanza Delta <strong>${formatNumber(pair.delta, 3)}</strong><br>Distanza coseno ${formatNumber(pair.cosine, 3)}</span>
      </button>
      <div data-pair-details="${key}" class="${expanded ? "" : "is-hidden"}">
        <table class="contributor-table">
          <thead><tr><th>Caratteristica</th><th>Peso nella distanza</th><th>${escapeHtml(pair.left_title.slice(0, 18))}</th><th>${escapeHtml(pair.right_title.slice(0, 18))}</th></tr></thead>
          <tbody>
            ${pair.contributors.map((item) => `
              <tr>
                <td><button class="feature-link" data-feature="${escapeHtml(item.feature)}" data-ids="${pair.left_id},${pair.right_id}">${escapeHtml(item.feature)}</button></td>
                <td>${formatNumber(item.contribution, 3)}</td>
                <td>${formatNumber(item.left_frequency, 2)}</td>
                <td>${formatNumber(item.right_frequency, 2)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </article>
  `;
}

function bindCompareEvents() {
  const { $$ } = ctxRef;
  $$("[data-pair-toggle]").forEach((button) => {
    button.addEventListener("click", () => focusPair(button.dataset.pairToggle));
  });
  $$("[data-pair-key]").forEach((cell) => {
    cell.addEventListener("click", () => focusPair(cell.dataset.pairKey));
  });
  $$("[data-feature]").forEach((button) => {
    button.addEventListener("click", () => showFeatureKwic(button.dataset.feature, button.dataset.ids));
  });
}

function focusPair(key) {
  const { $, $$ } = ctxRef;
  $$("[data-pair-card]").forEach((card) => card.classList.toggle("is-selected", card.dataset.pairCard === key));
  $$("[data-pair-details]").forEach((details) => details.classList.toggle("is-hidden", details.dataset.pairDetails !== key));
  $(`[data-pair-card="${key}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
}

async function showFeatureKwic(feature, ids) {
  const { $, api, escapeHtml } = ctxRef;
  const container = $("#feature-kwic");
  container.innerHTML = `<div class="simple-card"><p>Ricerca nel testo di <strong>${escapeHtml(feature)}</strong>...</p></div>`;
  try {
    const payload = await api(`/api/kwic?ids=${encodeURIComponent(ids)}&q=${encodeURIComponent(feature.trim())}`);
    container.innerHTML = `
      <div class="simple-card">
        <h3>Occorrenze nel contesto: ${escapeHtml(feature)}</h3>
        <div class="kwic-list">${renderKwicRows(payload.results)}</div>
      </div>
    `;
  } catch (error) {
    container.innerHTML = `<div class="warning">${escapeHtml(error.message)}</div>`;
  }
}

function renderKwicRows(results) {
  const { escapeHtml } = ctxRef;
  if (!results.length) return `<p>Nessuna occorrenza.</p>`;
  return results.map((row) => `
    <div class="kwic-row">
      <span class="kwic-left">${escapeHtml(row.left)}</span>
      <strong class="kwic-match">${escapeHtml(row.match)}</strong>
      <span>${escapeHtml(row.right)}</span>
    </div>
  `).join("");
}

async function runParallels() {
  const { $, api, toast, escapeHtml } = ctxRef;
  const ids = selectedCompareIds();
  if (ids.length < 2) {
    toast("Seleziona almeno due documenti.");
    return;
  }
  const button = $("#run-parallels");
  button.disabled = true;
  button.textContent = "Ricerca in corso...";
  try {
    const payload = await api("/api/parallel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ids,
        profile: ctxRef.selectedProfile(),
      }),
    });
    renderParallelResults(payload);
  } catch (error) {
    $("#compare-results").innerHTML = `<div class="warning">${escapeHtml(error.message)}</div>`;
  } finally {
    button.disabled = false;
    button.textContent = "Cerca passi paralleli";
  }
}

function highlightTerms(text, terms) {
  const { escapeHtml } = ctxRef;
  let output = escapeHtml(text);
  const sorted = [...terms].sort((a, b) => b.length - a.length);
  for (const term of sorted) {
    const safeTerm = escapeHtml(term).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    output = output.replace(new RegExp(`\\b(${safeTerm})\\b`, "gi"), "<mark>$1</mark>");
  }
  return output;
}

function renderParallelResults(payload) {
  const { $, escapeHtml, formatNumber } = ctxRef;
  $("#compare-results").innerHTML = `
    <section class="panel result-panel">
      <div class="result-heading">
        <div>
          <p class="eyebrow">Passi simili</p>
          <h2>Passi che condividono parole importanti</h2>
          <p>${escapeHtml(payload.method)}</p>
        </div>
        <span class="badge">${payload.pairs.length} coppie</span>
      </div>
      <div class="warning">${escapeHtml(payload.warning)}</div>
      <div class="result-note">
        <strong>Metodo:</strong> TF-IDF pesa di piu le parole caratteristiche di un segmento; la similarita coseno misura quanto due segmenti condividono quei pesi.
      </div>
      <div class="parallel-list" style="margin-top:1rem">
        ${payload.pairs.length ? payload.pairs.map((pair) => `
          <article class="parallel-card">
            <div class="passage">
              <strong>${escapeHtml(pair.left.title)}</strong>
              <p>${highlightTerms(pair.left.text, pair.shared_terms)}</p>
            </div>
            <span class="similarity-chip">${formatNumber(pair.similarity * 100, 1)}%</span>
            <div class="passage">
              <strong>${escapeHtml(pair.right.title)}</strong>
              <p>${highlightTerms(pair.right.text, pair.shared_terms)}</p>
            </div>
          </article>
        `).join("") : `<div class="empty-state"><p>Nessuna coppia sopra la soglia minima.</p></div>`}
      </div>
    </section>
  `;
}

async function runPipeline() {
  const { $, api, toast, escapeHtml, loadRuns } = ctxRef;
  const ids = selectedCompareIds();
  if (!ids.length) {
    toast("Seleziona almeno un documento.");
    return;
  }
  const modules = selectedPipelineModules();
  if (!modules.length) {
    toast("Seleziona almeno un tool nella pipeline.");
    return;
  }
  const button = $("#run-pipeline");
  button.disabled = true;
  button.textContent = "Pipeline in corso...";
  $("#compare-results").innerHTML = `<div class="empty-state panel"><p>Esecuzione della pipeline sui testi selezionati...</p></div>`;
  try {
    const stylometry = selectedStylometrySettings();
    const payload = await api("/api/pipeline", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ids,
        modules,
        parser: $("#parser-select").value,
        report_style: $("#report-style").value,
        profile: ctxRef.selectedProfile(),
        terms: selectedLegalTerms(),
        feature_type: stylometry.feature_type,
        max_features: stylometry.max_features,
      }),
    });
    renderPipelineResults(payload);
    await loadRuns();
  } catch (error) {
    $("#compare-results").innerHTML = `<div class="warning">${escapeHtml(error.message)}</div>`;
  } finally {
    button.disabled = false;
    button.textContent = "Genera report";
  }
}

function moduleLabel(moduleId) {
  const modules = ctxRef.state.modules ? ctxRef.state.modules.modules : [];
  return modules.find((module) => module.id === moduleId)?.label || moduleId;
}

function modulePurpose(moduleId) {
  const purposes = {
    lexicon: "Descrive il lessico del testo e permette di controllare parole ricorrenti e contesti.",
    legal_terms: "Misura famiglie terminologiche giuridiche per confrontare documenti e autori.",
    stylometry: "Confronta profili di frequenza tra testi; utile per somiglianze e differenze stilistiche.",
    parallel_passages: "Cerca passi lessicalmente simili e mostra le parole condivise da verificare.",
    textual_affinity: "Raggruppa molti testi in un albero di affinità e mostra le parole/formule condivise.",
    voyant_export: "Apre i testi in Voyant come ambiente esterno di esplorazione.",
  };
  return purposes[moduleId] || "Modulo aggiunto dal catalogo; il report registra output e parametri.";
}

function renderPipelineResults(payload) {
  const { $, $$, escapeHtml, bindViewControl } = ctxRef;
  const statusCards = payload.module_order.map((moduleId) => {
    const module = payload.modules[moduleId] || {};
    const status = module.status || "unknown";
    const message = module.message || (
      status === "ok" ? "Modulo eseguito correttamente." : "Nessun dettaglio disponibile."
    );
    const actions = [
      module.workspace_view
        ? `<button class="secondary-button" data-view="${escapeHtml(module.workspace_view)}">Apri ${escapeHtml(moduleLabel(moduleId))}</button>`
        : "",
      module.download_url
        ? `<a class="secondary-button muted-action" href="${escapeHtml(module.download_url)}">${module.workspace_view ? "Fallback zip" : "Scarica output"}</a>`
        : "",
    ].join("");
    return `
      <article class="pipeline-status-card ${status}">
        <span>${escapeHtml(status)}</span>
        <h3>${escapeHtml(moduleLabel(moduleId))}</h3>
        <p>${escapeHtml(modulePurpose(moduleId))}</p>
        <small>${escapeHtml(message)}</small>
        ${actions ? `<div class="pipeline-status-actions">${actions}</div>` : ""}
      </article>
    `;
  }).join("");

  const legal = payload.modules.legal_terms?.result;
  const lexicon = payload.modules.lexicon?.result;
  const stylometry = payload.modules.stylometry?.result;
  const parallels = payload.modules.parallel_passages?.result;
  const affinity = payload.modules.textual_affinity?.result;

  $("#compare-results").innerHTML = `
    <section class="panel result-panel">
      <div class="result-heading">
        <div>
          <p class="eyebrow">Pipeline</p>
          <h2>Report #${payload.run_id}</h2>
          <p>Report interpretativo: ogni sezione espone una misura e il relativo controllo sul testo. Parser: ${escapeHtml(payload.parser)}.</p>
        </div>
        <div class="pipeline-report-actions">
          <a class="primary-button" href="${escapeHtml(payload.report_url)}" target="_blank" rel="noreferrer">Apri report</a>
          <a class="secondary-button" href="${escapeHtml(payload.report_pdf_url || `${payload.report_url}.pdf`)}">Scarica PDF</a>
        </div>
      </div>
      <div class="pipeline-status-grid">${statusCards}</div>
    </section>

    ${lexicon ? renderPipelineLexiconSummary(lexicon) : ""}
    ${legal ? renderPipelineLegalSummary(legal) : ""}
    ${stylometry ? renderPipelineStylometrySummary(stylometry) : ""}
    ${affinity ? renderPipelineAffinitySummary(affinity) : ""}
    ${parallels ? renderPipelineParallelSummary(parallels) : ""}
  `;
  $$("[data-view]", $("#compare-results")).forEach(bindViewControl);
}

function renderPipelineLexiconSummary(payload) {
  const { escapeHtml, formatNumber } = ctxRef;
  return `
    <section class="panel result-panel">
      <div class="result-heading">
        <div>
          <p class="eyebrow">Lessico</p>
          <h2>Profilo lessicale dei testi</h2>
          <p>${escapeHtml(payload.method)}</p>
        </div>
      </div>
      <div class="lexicon-summary-grid">
        ${payload.documents.map((document) => {
          const summary = document.summary;
          return `
            <article class="lexicon-summary-card">
              <h3>${escapeHtml(document.title)}</h3>
              <dl>
                <div><dt>Parole</dt><dd>${formatNumber(summary.token_count, 0)}</dd></div>
                <div><dt>Forme</dt><dd>${formatNumber(summary.type_count, 0)}</dd></div>
                <div><dt>MATTR</dt><dd>${formatNumber(summary.mattr_50, 3)}</dd></div>
              </dl>
              <p>${summary.top_content_words.slice(0, 5).map((item) => escapeHtml(item.term)).join(", ")}</p>
            </article>
          `;
        }).join("")}
      </div>
    </section>
  `;
}

function renderPipelineLegalSummary(payload) {
  const { escapeHtml } = ctxRef;
  const topTerms = payload.terms.slice(0, 6);
  const total = topTerms.reduce((sum, term) => sum + Number(term.total_count || 0), 0);
  return `
    <section class="panel result-panel">
      <div class="result-heading">
        <div>
          <p class="eyebrow">Termini giuridici</p>
          <h2>Occorrenze principali</h2>
          <p>${escapeHtml(payload.method)}</p>
        </div>
        <span class="badge">${total} occorrenze</span>
      </div>
      <div class="warning-list">${(payload.warnings || []).map((warning) => `<div class="warning">${escapeHtml(warning)}</div>`).join("")}</div>
      ${renderLegalTermTable(ctxRef, topTerms)}
    </section>
  `;
}

function renderPipelineStylometrySummary(payload) {
  const { escapeHtml } = ctxRef;
  return `
    <section class="panel result-panel">
      <div class="result-heading">
        <div>
          <p class="eyebrow">Stilometria</p>
          <h2>Distanze tra testi</h2>
          <p>${escapeHtml(payload.interpretation)}</p>
        </div>
        <span class="badge">${payload.max_features} caratteristiche</span>
      </div>
      <div class="warning-list">${payload.warnings.map((warning) => `<div class="warning">${escapeHtml(warning)}</div>`).join("")}</div>
      ${renderStylometryDistanceTable(payload, 8)}
    </section>
  `;
}

function renderPipelineParallelSummary(payload) {
  const { escapeHtml, formatNumber } = ctxRef;
  return `
    <section class="panel result-panel">
      <div class="result-heading">
        <div>
          <p class="eyebrow">Passi simili</p>
          <h2>${payload.pairs.length} coppie trovate</h2>
          <p>${escapeHtml(payload.method)}</p>
        </div>
      </div>
      <div class="warning">${escapeHtml(payload.warning)}</div>
      <div class="parallel-list" style="margin-top:1rem">
        ${payload.pairs.slice(0, 5).map((pair) => `
          <article class="parallel-card">
            <div class="passage"><strong>${escapeHtml(pair.left.title)}</strong><p>${highlightTerms(pair.left.text, pair.shared_terms)}</p></div>
            <span class="similarity-chip">${formatNumber(pair.similarity * 100, 1)}%</span>
            <div class="passage"><strong>${escapeHtml(pair.right.title)}</strong><p>${highlightTerms(pair.right.text, pair.shared_terms)}</p></div>
          </article>
        `).join("") || `<div class="empty-state"><p>Nessuna coppia sopra la soglia minima.</p></div>`}
      </div>
    </section>
  `;
}

function renderPipelineAffinitySummary(payload) {
  const { escapeHtml, formatNumber } = ctxRef;
  const threshold = 0.5;
  const { edges } = affinityPairs(payload, threshold);
  return `
    <section class="panel result-panel">
      <div class="result-heading">
        <div>
          <p class="eyebrow">Affinità testuale</p>
          <h2>Grafo delle relazioni possibili</h2>
          <p>Nodi = testi. Archi = affinità lessicale/formulare da verificare sul testo.</p>
        </div>
        <span class="badge">${payload.documents.length} testi · ${edges.length} legami</span>
      </div>
      <div class="warning">${escapeHtml(payload.warning)}</div>
      <div class="affinity-layout">
        <div class="affinity-graph-shell">
          ${renderAffinityGraph(ctxRef, payload, threshold)}
        </div>
        <div class="affinity-merges">
          <h3>Legami da controllare</h3>
          ${edges.length ? edges.slice(0, 6).map((edge) => `
            <article>
              <strong>${escapeHtml(edge.leftTitle)}</strong>
              <span>con ${escapeHtml(edge.rightTitle)}</span>
              <small>Affinità ${formatNumber(edge.affinity * 100, 1)}% · distanza tecnica ${formatNumber(edge.distance, 3)}</small>
            </article>
          `).join("") : `<p class="muted">Nessun legame abbastanza forte con soglia prudente.</p>`}
        </div>
      </div>
    </section>
  `;
}

function openPrintableReport() {
  const { $, toast } = ctxRef;
  const ids = selectedCompareIds();
  if (!ids.length) {
    toast("Seleziona almeno un documento.");
    return;
  }
  const profile = ctxRef.selectedProfile();
  const params = new URLSearchParams({
    ids: ids.join(","),
    style: $("#report-style").value,
    parser: $("#parser-select").value,
    lower: profile.lower ? "1" : "0",
    j_to_i: profile.j_to_i ? "1" : "0",
    v_to_u: profile.v_to_u ? "1" : "0",
    terms: selectedLegalTerms().join(","),
  });
  window.open(`/report?${params.toString()}`, "_blank");
}

export function init(ctx) {
  ctxRef = ctx;
  renderAllDocumentPickers();
  renderModuleControls();
  ctx.onDocumentsChanged(renderAllDocumentPickers);
  ctx.onModulesChanged(renderModuleControls);
  ctx.onParserStatusChanged(renderModuleControls);
  ctx.$("#run-compare")?.addEventListener("click", runCompare);
  ctx.$("#run-parallels")?.addEventListener("click", runParallels);
  ctx.$("#run-pipeline")?.addEventListener("click", runPipeline);
  ctx.$("#open-report")?.addEventListener("click", openPrintableReport);
}
