function buildVoyantCorpusText(documents) {
  return documents.map((document) => [
    `Title: ${document.title}`,
    `Author: ${document.author || "attribuzione non indicata"}`,
    "",
    document.normalized_text,
  ].join("\n")).join("\n\n-----\n\n");
}

function submitVoyantCorpus(tool, corpus, targetName) {
  const form = document.createElement("form");
  form.method = "POST";
  form.action = `https://voyant-tools.org/tool/${encodeURIComponent(tool)}/`;
  form.target = targetName;
  form.style.display = "none";

  const input = document.createElement("textarea");
  input.name = "input";
  input.value = corpus;
  form.appendChild(input);

  document.body.appendChild(form);
  form.submit();
  form.remove();
}

export function init(ctx) {
  async function openVoyantTool({ newWindow = false } = {}) {
    const ids = ctx.selectedIds("[data-voyant-id]");
    if (!ids.length) {
      ctx.toast("Seleziona almeno un documento.");
      return;
    }
    const button = newWindow ? ctx.$("#open-voyant-window") : ctx.$("#open-voyant-tool");
    button.disabled = true;
    button.textContent = "Preparazione...";
    try {
      const documents = await ctx.selectedFullDocuments(ids);
      const corpus = buildVoyantCorpusText(documents);
      const tool = ctx.$("#voyant-tool-select").value;
      const targetName = `talon_voyant_${Date.now()}`;
      if (newWindow) {
        const opened = window.open("about:blank", targetName);
        if (!opened) throw new Error("Il browser ha bloccato la nuova finestra.");
        submitVoyantCorpus(tool, corpus, targetName);
        return;
      }
      ctx.$("#voyant-tool-results").innerHTML = `
        <section class="panel result-panel">
          <div class="result-heading">
            <div>
              <p class="eyebrow">Voyant Tools</p>
              <h2>${ctx.escapeHtml(tool)} integrato</h2>
              <p>Il corpus viene inviato a Voyant tramite POST, quindi non passa dall'URL e supporta testi estesi.</p>
            </div>
            <button class="primary-button" type="button" id="voyant-post-window">Apri fuori da TALON</button>
          </div>
          <iframe class="voyant-frame" name="${ctx.escapeHtml(targetName)}" title="Voyant ${ctx.escapeHtml(tool)}"></iframe>
        </section>
      `;
      submitVoyantCorpus(tool, corpus, targetName);
      ctx.$("#voyant-post-window")?.addEventListener("click", () => openVoyantTool({ newWindow: true }));
    } catch (error) {
      ctx.$("#voyant-tool-results").innerHTML = `<div class="warning">${ctx.escapeHtml(error.message)}</div>`;
    } finally {
      button.disabled = false;
      button.textContent = newWindow ? "Apri in nuova finestra" : "Apri in TALON";
    }
  }

  ctx.$("#open-voyant-tool")?.addEventListener("click", () => openVoyantTool());
  ctx.$("#open-voyant-window")?.addEventListener("click", () => openVoyantTool({ newWindow: true }));
}
