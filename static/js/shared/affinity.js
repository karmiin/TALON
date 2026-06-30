export function affinityEvidenceLabel(threshold) {
  if (threshold <= 0.35) return "solo affinità forti";
  if (threshold <= 0.5) return "affinità probabili";
  return "esplorativo";
}

export function shortLabel(value, limit = 26) {
  const text = String(value || "");
  return text.length > limit ? `${text.slice(0, limit - 1)}...` : text;
}

function nodeLabelLines(value) {
  const words = String(value || "").trim().split(/\s+/).filter(Boolean);
  const lines = [""];
  for (const word of words) {
    const index = lines.length - 1;
    const candidate = `${lines[index]} ${word}`.trim();
    if (candidate.length <= 18 || lines.length >= 2) {
      lines[index] = candidate;
    } else {
      lines.push(word);
    }
  }
  if (!lines[0]) return ["Testo"];
  return lines.slice(0, 2).map((line) => shortLabel(line, 19));
}

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

export function affinityComponents(count, edges) {
  const graph = Array.from({ length: count }, () => []);
  edges.forEach((edge) => {
    graph[edge.left].push(edge.right);
    graph[edge.right].push(edge.left);
  });
  const seen = new Set();
  const components = [];
  for (let index = 0; index < count; index += 1) {
    if (seen.has(index)) continue;
    const stack = [index];
    const component = [];
    seen.add(index);
    while (stack.length) {
      const current = stack.pop();
      component.push(current);
      graph[current].forEach((next) => {
        if (!seen.has(next)) {
          seen.add(next);
          stack.push(next);
        }
      });
    }
    components.push(component.sort((a, b) => a - b));
  }
  return components.sort((a, b) => b.length - a.length || a[0] - b[0]);
}

export function affinityLayout(count, edges) {
  const width = 760;
  const nodeWidth = 156;
  const horizontalGap = 34;
  const rowGap = 96;
  const componentGap = 32;
  const components = affinityComponents(count, edges);
  const positions = [];
  let cursorY = 64;
  components.forEach((component, row) => {
    const columns = Math.max(1, Math.min(component.length, Math.floor((width - 72) / (nodeWidth + horizontalGap))));
    const rows = Math.ceil(component.length / columns);
    component.forEach((nodeIndex, index) => {
      const localRow = Math.floor(index / columns);
      const col = index % columns;
      const itemsInRow = Math.min(columns, component.length - localRow * columns);
      const usedWidth = itemsInRow * nodeWidth + (itemsInRow - 1) * horizontalGap;
      const startX = (width - usedWidth) / 2 + nodeWidth / 2;
      positions[nodeIndex] = {
        x: startX + col * (nodeWidth + horizontalGap),
        y: cursorY + localRow * rowGap,
      };
    });
    cursorY += rows * rowGap + (row < components.length - 1 ? componentGap : 0);
  });
  const height = Math.max(250, cursorY + 28);
  return { width, height, positions, components };
}

export function renderAffinityGraph(ctx, payload, threshold) {
  const documents = payload.documents || [];
  const { edges } = affinityPairs(payload, threshold);
  const { width, height, positions } = affinityLayout(documents.length, edges);
  const edgeMarkup = edges.map((edge) => {
    const left = positions[edge.left];
    const right = positions[edge.right];
    const strength = Math.max(0.12, 1 - edge.distance);
    return `
      <line class="affinity-edge"
        x1="${left.x.toFixed(1)}" y1="${left.y.toFixed(1)}"
        x2="${right.x.toFixed(1)}" y2="${right.y.toFixed(1)}"
        stroke-width="${(1.5 + strength * 4).toFixed(2)}"
        opacity="${Math.min(0.9, 0.28 + strength * 0.7).toFixed(2)}">
        <title>${ctx.escapeHtml(edge.leftTitle)} / ${ctx.escapeHtml(edge.rightTitle)}: distanza ${ctx.formatNumber(edge.distance, 3)}</title>
      </line>
    `;
  }).join("");
  const nodeMarkup = documents.map((document, index) => {
    const point = positions[index] || { x: width / 2, y: height / 2 };
    const lines = nodeLabelLines(document.title);
    return `
      <g class="affinity-node" transform="translate(${point.x.toFixed(1)} ${point.y.toFixed(1)})">
        <rect x="-78" y="-26" width="156" height="52" rx="4"></rect>
        <text class="affinity-node-index" y="-10">${index + 1}</text>
        <text class="affinity-node-label" y="6">${ctx.escapeHtml(lines[0])}</text>
        ${lines[1] ? `<text class="affinity-node-label" y="20">${ctx.escapeHtml(lines[1])}</text>` : ""}
      </g>
    `;
  }).join("");
  return `
    <svg class="affinity-graph" viewBox="0 0 ${width} ${height}" role="img" aria-label="Grafo delle affinità testuali">
      <rect class="affinity-graph-bg" x="0" y="0" width="${width}" height="${height}" rx="6"></rect>
      ${edgeMarkup}
      ${nodeMarkup}
    </svg>
  `;
}

export function renderAffinityMergeCards(ctx, payload, threshold) {
  const merges = payload.merges || [];
  const underThreshold = merges.filter((merge) => Number(merge.distance) <= threshold);
  const visible = (underThreshold.length ? underThreshold : merges).slice(0, 6);
  if (!visible.length) return `<p class="muted">Nessun cluster disponibile.</p>`;
  return visible.map((merge) => `
    <article class="affinity-merge-card ${Number(merge.distance) <= threshold ? "is-linked" : ""}">
      <strong>${ctx.escapeHtml(merge.left.join(" + "))}</strong>
      <span>con ${ctx.escapeHtml(merge.right.join(" + "))}</span>
      <small>Distanza ${ctx.formatNumber(merge.distance, 3)} · ${(merge.shared_terms || []).map(ctx.escapeHtml).join(", ") || "termini dominanti non evidenti"}</small>
    </article>
  `).join("");
}

export function renderAffinityPairRows(ctx, payload, threshold) {
  const { pairs } = affinityPairs(payload, threshold);
  return pairs.slice(0, 10).map((pair) => `
    <tr>
      <td>${ctx.escapeHtml(pair.leftTitle)}</td>
      <td>${ctx.escapeHtml(pair.rightTitle)}</td>
      <td>${pair.distance <= threshold ? "forte/probabile" : "debole"}</td>
      <td>${ctx.formatNumber(pair.affinity * 100, 1)}%</td>
      <td>${ctx.formatNumber(pair.distance, 3)}</td>
      <td>${pair.distance <= threshold ? '<span class="runtime-ok">da verificare</span>' : '<span class="runtime-missing">non mostrato</span>'}</td>
    </tr>
  `).join("");
}
