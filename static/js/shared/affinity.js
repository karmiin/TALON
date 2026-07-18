export function affinityPairs(payload, threshold) {
  const documents = payload.documents || [];
  const matrix = payload.distance_matrix || [];
  const pairs = [];
  const edges = [];
  for (let left = 0; left < documents.length; left += 1) {
    for (let right = left + 1; right < documents.length; right += 1) {
      const distance = Number(matrix[left]?.[right] ?? 1);
      const pair = {
        left,
        right,
        leftTitle: documents[left]?.title || `Testo ${left + 1}`,
        rightTitle: documents[right]?.title || `Testo ${right + 1}`,
        distance,
        affinity: Math.max(0, 1 - distance),
      };
      pairs.push(pair);
      if (distance <= threshold) edges.push(pair);
    }
  }
  pairs.sort((a, b) => a.distance - b.distance);
  edges.sort((a, b) => b.distance - a.distance);
  return { pairs, edges };
}

function pcaBounds(points, axis) {
  const values = points.map((point) => Number(point[axis] || 0));
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 0);
  if (Math.abs(max - min) < 1e-9) return { min: -1, max: 1 };
  const padding = (max - min) * 0.12;
  return { min: min - padding, max: max + padding };
}

function pcaScale(value, bounds, start, end) {
  return start + ((Number(value || 0) - bounds.min) / (bounds.max - bounds.min)) * (end - start);
}

export function renderPcaPlot(ctx, payload, options = {}) {
  const pca = payload.pca || {};
  const points = pca.points || [];
  if (!points.length) {
    return `<div class="empty-state"><p>PCA non disponibile per i testi selezionati.</p></div>`;
  }
  const width = 920;
  const height = 520;
  const margin = { left: 72, right: 34, top: 34, bottom: 62 };
  const xBounds = pcaBounds(points, "x");
  const yBounds = pcaBounds(points, "y");
  const xZero = pcaScale(0, xBounds, margin.left, width - margin.right);
  const yZero = pcaScale(0, yBounds, height - margin.bottom, margin.top);
  const pointMarkup = points.map((point, index) => {
    const x = pcaScale(point.x, xBounds, margin.left, width - margin.right);
    const y = pcaScale(point.y, yBounds, height - margin.bottom, margin.top);
    return `
      <g class="pca-point" transform="translate(${x.toFixed(1)} ${y.toFixed(1)})">
        <circle r="8"></circle>
        <text class="pca-point-index" text-anchor="middle" y="3.5">${index + 1}</text>
        <title>${ctx.escapeHtml(point.title)} | PC1 ${ctx.formatNumber(point.x, 3)} | PC2 ${ctx.formatNumber(point.y, 3)}</title>
      </g>
    `;
  }).join("");
  const variance = pca.variance || [];
  return `
    <svg class="pca-plot" viewBox="0 0 ${width} ${height}" role="img" aria-label="${ctx.escapeHtml(options.label || "PCA dei testi")}">
      <rect class="pca-bg" x="0" y="0" width="${width}" height="${height}" rx="6"></rect>
      <line class="pca-axis" x1="${margin.left}" y1="${yZero.toFixed(1)}" x2="${width - margin.right}" y2="${yZero.toFixed(1)}"></line>
      <line class="pca-axis" x1="${xZero.toFixed(1)}" y1="${margin.top}" x2="${xZero.toFixed(1)}" y2="${height - margin.bottom}"></line>
      ${pointMarkup}
      <text class="pca-axis-label" x="${width / 2}" y="${height - 18}">PC1 ${ctx.formatNumber(variance[0] || 0, 1)}%</text>
      <text class="pca-axis-label" transform="translate(22 ${height / 2}) rotate(-90)">PC2 ${ctx.formatNumber(variance[1] || 0, 1)}%</text>
    </svg>
  `;
}

export function renderPcaDocumentKey(ctx, payload) {
  const points = payload.pca?.points || [];
  if (!points.length) return "";
  return `
    <div class="pca-document-key">
      ${points.map((point, index) => `
        <article>
          <b>${index + 1}</b>
          <span>${ctx.escapeHtml(point.title)}</span>
          <small>PC1 ${ctx.formatNumber(point.x, 3)} · PC2 ${ctx.formatNumber(point.y, 3)}</small>
        </article>
      `).join("")}
    </div>
  `;
}

export function renderPcaVariance(ctx, payload) {
  const variance = payload.pca?.variance || [];
  return `
    <div class="pca-variance-strip">
      <article><strong>${ctx.formatNumber(variance[0] || 0, 1)}%</strong><span>PC1</span></article>
      <article><strong>${ctx.formatNumber(variance[1] || 0, 1)}%</strong><span>PC2</span></article>
      <article><strong>${ctx.formatNumber((variance[0] || 0) + (variance[1] || 0), 1)}%</strong><span>piano 2D</span></article>
    </div>
  `;
}

export function renderPcaLoadings(ctx, payload) {
  const loadings = payload.pca?.loadings || [];
  if (!loadings.length) return "";
  return `
    <div class="pca-loadings">
      ${loadings.slice(0, 3).map((axisRows, axisIndex) => `
        <article>
          <h3>Asse PC${axisIndex + 1}</h3>
          ${(axisRows || []).slice(0, 8).map((item) => `
            <div class="pca-loading-row">
              <span>${ctx.escapeHtml(item.feature)}</span>
              <b>${ctx.formatNumber(item.weight, 3)}</b>
            </div>
          `).join("") || `<p class="muted">Nessun peso disponibile.</p>`}
        </article>
      `).join("")}
    </div>
  `;
}

export function renderDocumentFeatureProfiles(ctx, payload) {
  const profiles = payload.document_profiles || [];
  if (!profiles.length) return "";
  return `
    <div class="profile-card-grid">
      ${profiles.map((profile) => `
        <article class="profile-card">
          <h3>${ctx.escapeHtml(profile.title)}</h3>
          <div class="profile-feature-list">
            ${(profile.features || []).slice(0, 8).map((item) => `
              <span><b>${ctx.escapeHtml(item.feature)}</b>${ctx.formatNumber(item.frequency, 2)}</span>
            `).join("") || `<p class="muted">Nessuna feature dominante.</p>`}
          </div>
        </article>
      `).join("")}
    </div>
  `;
}
