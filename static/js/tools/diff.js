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
    return `<span class="diff-token diff-${ctx.escapeHtml(segment.type)}">${ctx.escapeHtml(segment.text)}</span>`;
  }).join("");
}

function renderDiffResults(ctx, payload) {
  ctx.$("#diff-tool-results").innerHTML = `
    <section class="panel result-panel">
      <div class="result-heading">
        <div>
          <p class="eyebrow">Differenze</p>
          <h2>${ctx.formatNumber(payload.similarity * 100, 1)}% di somiglianza</h2>
          <p>${ctx.escapeHtml(payload.method)}</p>
        </div>
        <span class="badge">${payload.summary.replace + payload.summary.delete + payload.summary.insert} blocchi varianti</span>
      </div>
      <div class="diff-legend">
        <span class="diff-replace">sostituzione</span>
        <span class="diff-delete">solo nel primo</span>
        <span class="diff-insert">solo nel secondo</span>
      </div>
      <div class="diff-summary-strip">
        <article><strong>${ctx.formatNumber(payload.summary.replace)}</strong><span>sostituzioni</span></article>
        <article><strong>${ctx.formatNumber(payload.summary.delete)}</strong><span>solo nel primo</span></article>
        <article><strong>${ctx.formatNumber(payload.summary.insert)}</strong><span>solo nel secondo</span></article>
      </div>
      <div class="diff-grid">
        <article class="diff-pane">
          <h3>${ctx.escapeHtml(payload.documents[0].title)}</h3>
          <pre>${renderDiffSegments(ctx, payload.left)}</pre>
        </article>
        <article class="diff-pane">
          <h3>${ctx.escapeHtml(payload.documents[1].title)}</h3>
          <pre>${renderDiffSegments(ctx, payload.right)}</pre>
        </article>
      </div>
    </section>
  `;
}

export function init(ctx) {
  async function runDiffTool() {
    const ids = ctx.selectedIds("[data-diff-id]");
    if (ids.length !== 2) {
      ctx.toast("Seleziona esattamente due documenti.");
      return;
    }
    const button = ctx.$("#run-diff-tool");
    button.disabled = true;
    button.textContent = "Confronto in corso...";
    ctx.$("#diff-tool-results").innerHTML = `<div class="empty-state panel"><p>Calcolo delle differenze...</p></div>`;
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
      button.textContent = "Confronta differenze";
    }
  }

  ctx.$("#run-diff-tool")?.addEventListener("click", runDiffTool);
}
