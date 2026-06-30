function collatinusSrcdoc(htmlValue) {
  return `<!doctype html>
<html lang="it">
<head>
  <meta charset="utf-8">
  <style>
    body { margin: 0; padding: 16px; color: #1f2328; font: 15px/1.6 Arial, sans-serif; background: #fff; }
    ul { padding-left: 1.3rem; }
    li { margin: 0.35rem 0; }
    strong big { color: #0f172a; }
    em { color: #475569; }
    small { color: #667085; }
    a { color: #0f6cbd; }
  </style>
</head>
<body>${htmlValue || "<p>Nessun risultato restituito da Collatinus.</p>"}</body>
</html>`;
}

export function init(ctx) {
  async function runCollatinusTool() {
    const ids = ctx.selectedIds("[data-collatinus-id]");
    if (!ids.length) {
      ctx.toast("Seleziona almeno un documento.");
      return;
    }
    const button = ctx.$("#run-collatinus-tool");
    button.disabled = true;
    button.textContent = "Collatinus in corso...";
    ctx.$("#collatinus-tool-results").innerHTML = `<div class="empty-state panel"><p>Invio dei testi a Collatinus-web...</p></div>`;
    try {
      const payload = await ctx.api("/api/collatinus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ids,
          action: ctx.$("#collatinus-action").value,
          language: ctx.$("#collatinus-language").value,
          medieval: ctx.$("#collatinus-medieval").checked,
        }),
      });
      ctx.$("#collatinus-tool-results").innerHTML = `
        <section class="panel result-panel">
          <div class="result-heading">
            <div>
              <p class="eyebrow">Collatinus-web</p>
              <h2>${ctx.escapeHtml(payload.action_label)} · ${payload.documents.length} testi</h2>
              <p>Risultato prodotto da Collatinus-web/Biblissima e mostrato in un riquadro isolato.</p>
            </div>
            <a class="secondary-button" href="https://outils.biblissima.fr/en/collatinus-web/index.php" target="_blank" rel="noreferrer">Sito originale</a>
          </div>
          <iframe id="collatinus-result-frame" class="collatinus-frame" sandbox title="Risultato Collatinus"></iframe>
        </section>
      `;
      ctx.$("#collatinus-result-frame").srcdoc = collatinusSrcdoc(payload.html);
    } catch (error) {
      ctx.$("#collatinus-tool-results").innerHTML = `<div class="warning">${ctx.escapeHtml(error.message)}</div>`;
    } finally {
      button.disabled = false;
      button.textContent = "Esegui Collatinus";
    }
  }

  ctx.$("#run-collatinus-tool")?.addEventListener("click", runCollatinusTool);
}
