import { createDocumentPicker } from "../shared/document-picker.js";

let ctxRef;
let documentPicker;
let selectedDocumentId = null;
let activeTab = "lexicon";
let frequencyMode = "content";
let selectedTerm = null;
let selectedSentenceIndex = 0;
let selectedTokenId = null;
let analysis = null;
let syntax = null;
let loadVersion = 0;

const POS_LABELS = {
  ADJ: "aggettivo",
  ADP: "preposizione",
  ADV: "avverbio",
  AUX: "ausiliare",
  CCONJ: "congiunzione coordinante",
  DET: "determinante",
  INTJ: "interiezione",
  NOUN: "nome",
  NUM: "numerale",
  PART: "particella",
  PRON: "pronome",
  PROPN: "nome proprio",
  PUNCT: "punteggiatura",
  SCONJ: "congiunzione subordinante",
  SYM: "simbolo",
  VERB: "verbo",
  X: "altro",
};

const RELATION_LABELS = {
  root: "nucleo della frase",
  nsubj: "soggetto",
  csubj: "proposizione soggettiva",
  obj: "oggetto",
  iobj: "oggetto indiretto",
  obl: "complemento obliquo",
  amod: "modificatore aggettivale",
  advmod: "modificatore avverbiale",
  nmod: "modificatore nominale",
  appos: "apposizione",
  case: "preposizione o marcatore di caso",
  det: "determinante",
  conj: "elemento coordinato",
  cc: "congiunzione coordinante",
  mark: "marcatore di subordinazione",
  acl: "proposizione attributiva",
  advcl: "proposizione avverbiale",
  ccomp: "proposizione completiva",
  xcomp: "complemento verbale",
  cop: "copula",
  aux: "ausiliare",
  compound: "composto",
  flat: "espressione multiparola",
  dislocated: "elemento dislocato",
  nummod: "modificatore numerale",
  punct: "punteggiatura",
};

const FEATURE_KEYS = {
  Case: "caso",
  Number: "numero",
  Gender: "genere",
  Person: "persona",
  Tense: "tempo",
  Mood: "modo",
  Voice: "diatesi",
  VerbForm: "forma verbale",
  Aspect: "aspetto",
  Degree: "grado",
  PronType: "tipo pronominale",
  NumType: "tipo numerale",
};

const FEATURE_VALUES = {
  Nom: "nominativo",
  Gen: "genitivo",
  Dat: "dativo",
  Acc: "accusativo",
  Abl: "ablativo",
  Voc: "vocativo",
  Loc: "locativo",
  Sing: "singolare",
  Plur: "plurale",
  Masc: "maschile",
  Fem: "femminile",
  Neut: "neutro",
  Pres: "presente",
  Past: "passato",
  Fut: "futuro",
  Ind: "indicativo",
  Sub: "congiuntivo",
  Inf: "infinito",
  Act: "attiva",
  Pass: "passiva",
  Fin: "finita",
  Part: "participio",
  Ger: "gerundio",
  Pos: "positivo",
  Cmp: "comparativo",
};

function renderDocumentPicker() {
  const { state } = ctxRef;
  if (!documentPicker) return;
  if (!state.documents.length) {
    selectedDocumentId = null;
    documentPicker.setDocuments([]);
    renderEmpty();
    return;
  }
  const previous = selectedDocumentId;
  selectedDocumentId = documentPicker.setDocuments(state.documents, selectedDocumentId);
  if (previous !== selectedDocumentId || !analysis) loadDocumentAnalysis();
}

function renderEmpty() {
  const container = ctxRef.$("#linguistic-content");
  if (container) {
    container.innerHTML = '<div class="empty-state"><h2>Nessun testo disponibile</h2><p>Importa una trascrizione per iniziare.</p></div>';
  }
}

async function loadDocumentAnalysis() {
  const { $, api, escapeHtml } = ctxRef;
  if (!selectedDocumentId) {
    renderEmpty();
    return;
  }
  const version = ++loadVersion;
  selectedTerm = null;
  selectedSentenceIndex = 0;
  selectedTokenId = null;
  $("#linguistic-content").innerHTML = '<div class="empty-state"><p>Caricamento analisi...</p></div>';
  try {
    const [analysisPayload, syntaxPayload] = await Promise.all([
      api(`/api/documents/${selectedDocumentId}/analysis`),
      api(`/api/documents/${selectedDocumentId}/syntax`),
    ]);
    if (version !== loadVersion) return;
    analysis = analysisPayload.analysis;
    syntax = syntaxPayload;
    renderActiveTab();
  } catch (error) {
    if (version !== loadVersion) return;
    $("#linguistic-content").innerHTML = `<div class="warning">${escapeHtml(error.message)}</div>`;
  }
}

function setTab(tab) {
  activeTab = tab;
  ctxRef.$$("[data-linguistic-tab]").forEach((button) => {
    const selected = button.dataset.linguisticTab === tab;
    button.classList.toggle("is-active", selected);
    button.setAttribute("aria-selected", String(selected));
  });
  renderActiveTab();
}

function renderActiveTab() {
  if (!analysis || !syntax) return;
  if (activeTab === "syntax") renderSyntax();
  else renderLexicon();
}

function frequencyItems() {
  return frequencyMode === "all" ? analysis.top_words : analysis.top_content_words;
}

function renderLexicon() {
  const { $, escapeHtml, formatNumber } = ctxRef;
  const items = frequencyItems();
  if (!items.some((item) => item.term === selectedTerm)) {
    selectedTerm = items[0]?.term || null;
  }
  $("#linguistic-content").innerHTML = `
    <header class="linguistic-result-heading compact">
      <div>
        <h2>Frequenze e contesti</h2>
        <p>Le frequenze indicano cosa ricorre; le concordanze permettono di controllare come viene usato.</p>
      </div>
    </header>
    <div class="lexicon-summary-line" aria-label="Sintesi lessicale">
      <span><strong>${formatNumber(analysis.token_count)}</strong> parole</span>
      <span><strong>${formatNumber(analysis.type_count)}</strong> forme diverse</span>
      <span><strong>${formatNumber(analysis.mattr_50, 2)}</strong> MATTR</span>
      <span><strong>${formatNumber(analysis.average_sentence_length, 1)}</strong> parole per frase</span>
      ${analysis.token_count < 1000 ? '<small>Testo breve: interpretare i valori insieme alle occorrenze.</small>' : ""}
    </div>
    <div class="lexicon-workspace">
      <section class="lexicon-frequency-panel">
        <div class="section-command-bar">
          <div>
            <h3>Parole più frequenti</h3>
            <p id="frequency-mode-help">${frequencyMode === "content"
              ? "Esclude molte parole grammaticali per evidenziare il lessico tematico."
              : "Include anche congiunzioni, preposizioni, pronomi e altre parole grammaticali."}</p>
          </div>
          <div class="compact-switch" role="group" aria-label="Tipo di frequenza">
            <button type="button" data-frequency-mode="content" class="${frequencyMode === "content" ? "is-active" : ""}">Contenuto</button>
            <button type="button" data-frequency-mode="all" class="${frequencyMode === "all" ? "is-active" : ""}">Tutte</button>
          </div>
        </div>
        <div class="frequency-table-wrap">
          <table class="frequency-table">
            <thead><tr><th>Parola</th><th>Occorrenze</th><th>Ogni 1.000</th></tr></thead>
            <tbody>
              ${items.map((item) => `
                <tr class="${item.term === selectedTerm ? "is-selected" : ""}">
                  <td><button type="button" data-frequency-term="${escapeHtml(item.term)}">${escapeHtml(item.term)}</button></td>
                  <td>${formatNumber(item.count)}</td>
                  <td>${formatNumber((item.count / Math.max(analysis.token_count, 1)) * 1000, 1)}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </section>
      <aside class="lexicon-context-panel">
        <div class="section-command-bar">
          <div>
            <h3>Occorrenze nel testo</h3>
            <p id="kwic-active-term">${selectedTerm ? `Contesti di “${escapeHtml(selectedTerm)}”` : "Seleziona una parola."}</p>
          </div>
        </div>
        <div class="compact-search">
          <input id="linguistic-kwic-query" value="${escapeHtml(selectedTerm || "")}" placeholder="Cerca parola o formula">
          <button class="secondary-button" id="linguistic-kwic-run" type="button">Cerca</button>
        </div>
        <div id="linguistic-kwic-results" class="kwic-list compact-kwic"></div>
      </aside>
    </div>
    <details class="collocation-disclosure">
      <summary>Collocazioni ricorrenti <span>${analysis.collocations.length}</span></summary>
      <div>
        <p>Coppie che compaiono spesso entro cinque parole. logDice misura la forza dell'associazione, non un rapporto grammaticale.</p>
        <table class="compact-data-table">
          <thead><tr><th>Coppia</th><th>logDice</th></tr></thead>
          <tbody>
            ${analysis.collocations.length ? analysis.collocations.map((item) => `
              <tr><td>${escapeHtml(item.left)} + ${escapeHtml(item.right)}</td><td>${formatNumber(item.log_dice, 2)}</td></tr>
            `).join("") : '<tr><td colspan="2">Nessuna coppia abbastanza ricorrente.</td></tr>'}
          </tbody>
        </table>
      </div>
    </details>
  `;
  bindLexiconControls();
  if (selectedTerm) loadKwic(selectedTerm);
}

function bindLexiconControls() {
  const { $, $$ } = ctxRef;
  $$("[data-frequency-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      frequencyMode = button.dataset.frequencyMode;
      selectedTerm = null;
      renderLexicon();
    });
  });
  $$("[data-frequency-term]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedTerm = button.dataset.frequencyTerm;
      renderLexicon();
    });
  });
  $("#linguistic-kwic-run")?.addEventListener("click", runKwicSearch);
  $("#linguistic-kwic-query")?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") runKwicSearch();
  });
}

function runKwicSearch() {
  const query = ctxRef.$("#linguistic-kwic-query")?.value.trim();
  if (!query) return;
  selectedTerm = query;
  ctxRef.$("#kwic-active-term").textContent = `Contesti di “${query}”`;
  ctxRef.$$("[data-frequency-term]").forEach((button) => {
    button.closest("tr")?.classList.toggle("is-selected", button.dataset.frequencyTerm === query);
  });
  loadKwic(query);
}

async function loadKwic(query) {
  const { $, api, escapeHtml } = ctxRef;
  const container = $("#linguistic-kwic-results");
  if (!container) return;
  container.innerHTML = '<p class="muted">Ricerca...</p>';
  try {
    const payload = await api(`/api/kwic?ids=${selectedDocumentId}&q=${encodeURIComponent(query)}`);
    container.innerHTML = payload.results.length ? payload.results.map((row) => `
      <div class="kwic-row">
        <span class="kwic-left">${escapeHtml(row.left)}</span>
        <strong class="kwic-match">${escapeHtml(row.match)}</strong>
        <span>${escapeHtml(row.right)}</span>
      </div>
    `).join("") : '<p class="muted">Nessuna occorrenza.</p>';
  } catch (error) {
    container.innerHTML = `<p class="warning">${escapeHtml(error.message)}</p>`;
  }
}

function renderSyntax() {
  const { $, escapeHtml } = ctxRef;
  if (!syntax.sentences.length) {
    $("#linguistic-content").innerHTML = renderParserPanel();
    $("#run-linguistic-parser")?.addEventListener("click", runSyntaxParser);
    return;
  }
  selectedSentenceIndex = Math.min(selectedSentenceIndex, syntax.sentences.length - 1);
  const sentence = syntax.sentences[selectedSentenceIndex];
  if (!sentence.tokens.some((token) => token.id === selectedTokenId)) {
    selectedTokenId = sentence.tokens.find((token) => token.upos !== "PUNCT")?.id || sentence.tokens[0]?.id;
  }
  $("#linguistic-content").innerHTML = `
    <header class="linguistic-result-heading compact">
      <div>
        <h2>Grammatica della frase</h2>
        <p>${escapeHtml(syntax.source || "Parser non dichiarato")} · risultato automatico da verificare.</p>
      </div>
      <button class="text-button" id="refresh-syntax-parser" type="button">Rigenera analisi</button>
    </header>
    <div class="grammar-workspace">
      <nav class="sentence-browser" aria-label="Frasi del documento">
        <div class="sentence-browser-heading">
          <strong>Frasi</strong>
          <span>${syntax.sentences.length}</span>
        </div>
        <div class="sentence-browser-list">
          ${syntax.sentences.map((item, index) => `
            <button type="button" data-sentence-index="${index}" class="${index === selectedSentenceIndex ? "is-active" : ""}">
              <span>${index + 1}</span>
              <p>${escapeHtml(item.text)}</p>
            </button>
          `).join("")}
        </div>
      </nav>
      <section class="grammar-inspector">
        <div class="sentence-token-line" aria-label="Parole della frase">
          ${sentence.tokens.map((token) => `
            <button type="button" data-token-id="${token.id}" class="${token.id === selectedTokenId ? "is-active" : ""}">
              ${escapeHtml(token.form)}
            </button>
          `).join("")}
        </div>
        ${renderSentenceOverview(sentence.tokens)}
        ${renderTokenInspector(sentence.tokens)}
      </section>
    </div>
  `;
  ctxRef.$$("[data-sentence-index]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedSentenceIndex = Number(button.dataset.sentenceIndex);
      selectedTokenId = null;
      renderSyntax();
    });
  });
  ctxRef.$$("[data-token-id]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedTokenId = Number(button.dataset.tokenId);
      renderSyntax();
    });
  });
  $("#refresh-syntax-parser")?.addEventListener("click", runSyntaxParser);
}

function renderSentenceOverview(tokens) {
  const { escapeHtml } = ctxRef;
  const groups = [
    ["Nucleo", tokens.filter((token) => relationBase(token.relation) === "root")],
    ["Soggetto", tokens.filter((token) => ["nsubj", "csubj"].includes(relationBase(token.relation)))],
    ["Oggetto", tokens.filter((token) => ["obj", "iobj"].includes(relationBase(token.relation)))],
    ["Subordinate", tokens.filter((token) => ["acl", "advcl", "ccomp", "xcomp"].includes(relationBase(token.relation)))],
  ].filter(([, items]) => items.length);
  if (!groups.length) return "";
  return `
    <dl class="sentence-overview">
      ${groups.map(([label, items]) => `
        <div><dt>${label}</dt><dd>${items.map((token) => escapeHtml(token.form)).join(", ")}</dd></div>
      `).join("")}
    </dl>
  `;
}

function renderTokenInspector(tokens) {
  const { escapeHtml } = ctxRef;
  const token = tokens.find((item) => item.id === selectedTokenId);
  if (!token) return "";
  const head = tokens.find((item) => item.id === token.head);
  return `
    <section class="token-inspector">
      <header>
        <div>
          <small>Parola selezionata</small>
          <h3>${escapeHtml(token.form)}</h3>
        </div>
        <span>${escapeHtml(posLabel(token.upos))}</span>
      </header>
      <dl>
        <div><dt>Lemma</dt><dd>${escapeHtml(token.lemma || "non riconosciuto")}</dd></div>
        <div><dt>Morfologia</dt><dd>${escapeHtml(formatFeatures(token.features))}</dd></div>
        <div><dt>Funzione</dt><dd>${escapeHtml(relationLabel(token.relation))}</dd></div>
        <div><dt>Dipende da</dt><dd>${head ? escapeHtml(head.form) : "nucleo della frase"}</dd></div>
      </dl>
    </section>
  `;
}

function renderParserPanel() {
  const { state, escapeHtml } = ctxRef;
  const parser = state.parserStatus.find((item) => item.id === "latincy");
  const runnable = Boolean(parser?.runnable);
  return `
    <div class="linguistic-parser-empty">
      <div>
        <h2>Analisi grammaticale non disponibile</h2>
        <p>LatinCy puo produrre lemma, categoria, morfologia e relazioni sintattiche. Il risultato resta un'ipotesi automatica da controllare.</p>
      </div>
      <div class="parser-command">
        <span>${escapeHtml(parser?.message || "Stato di LatinCy non disponibile.")}</span>
        <button class="primary-button" id="run-linguistic-parser" type="button" ${runnable ? "" : "disabled"}>Genera con LatinCy</button>
      </div>
    </div>
  `;
}

async function runSyntaxParser() {
  const { $, api, toast, loadDocuments } = ctxRef;
  const button = $("#run-linguistic-parser") || $("#refresh-syntax-parser");
  if (!button || !selectedDocumentId) return;
  button.disabled = true;
  const originalLabel = button.textContent;
  button.textContent = "Analisi in corso...";
  try {
    const payload = await api(`/api/documents/${selectedDocumentId}/parse`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parser: "latincy" }),
    });
    syntax = await api(`/api/documents/${selectedDocumentId}/syntax`);
    selectedSentenceIndex = 0;
    selectedTokenId = null;
    await loadDocuments();
    toast(`Analisi prodotta da ${payload.source}.`);
    renderSyntax();
  } catch (error) {
    toast(error.message);
    button.disabled = false;
    button.textContent = originalLabel;
  }
}

function posLabel(value) {
  return POS_LABELS[value] ? `${POS_LABELS[value]} (${value})` : value || "non riconosciuta";
}

function relationBase(value) {
  return String(value || "").split(":")[0].toLowerCase();
}

function relationLabel(value) {
  return RELATION_LABELS[relationBase(value)] || value || "non riconosciuta";
}

function formatFeatures(features) {
  const entries = Object.entries(features || {});
  if (!entries.length) return "non specificata";
  return entries.map(([key, value]) => {
    const label = FEATURE_KEYS[key] || key;
    const translated = String(value).split(",").map((item) => {
      if (item === "Imp" && key === "Aspect") return "imperfettivo";
      if (item === "Perf" && key === "Aspect") return "perfettivo";
      if (item === "Imp" && key === "Mood") return "imperativo";
      if (item === "Sup" && key === "VerbForm") return "supino";
      if (item === "Sup" && key === "Degree") return "superlativo";
      return FEATURE_VALUES[item] || item;
    }).join(", ");
    return `${label}: ${translated}`;
  }).join(" · ");
}

export function init(ctx) {
  ctxRef = ctx;
  documentPicker = createDocumentPicker(ctx.$("#linguistic-document-picker"), {
    label: "Testo in analisi",
    onChange: (documentId) => {
      selectedDocumentId = documentId;
      analysis = null;
      syntax = null;
      loadDocumentAnalysis();
    },
  });
  ctx.onDocumentsChanged(renderDocumentPicker);
  ctx.onParserStatusChanged(() => {
    if (activeTab === "syntax" && syntax) renderSyntax();
  });
  renderDocumentPicker();
  ctx.$$("[data-linguistic-tab]").forEach((button) => {
    button.addEventListener("click", () => setTab(button.dataset.linguisticTab));
  });
}
