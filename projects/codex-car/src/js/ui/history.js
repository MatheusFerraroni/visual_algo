// Renderização do histórico do GA e do preview resumido sem renderização.
function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#039;");
}

function computePointsBounds(points) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const point of points) {
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }

  if (!Number.isFinite(minX)) {
    return { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  }

  return { minX, minY, maxX, maxY };
}

function createSvgMapper(points, width, height, margin) {
  const bounds = computePointsBounds(points);
  const rawWidth = Math.max(1, bounds.maxX - bounds.minX);
  const rawHeight = Math.max(1, bounds.maxY - bounds.minY);
  const scale = Math.min(
    (width - margin * 2) / rawWidth,
    (height - margin * 2) / rawHeight
  );
  const usedWidth = rawWidth * scale;
  const usedHeight = rawHeight * scale;
  const offsetX = (width - usedWidth) * 0.5;
  const offsetY = (height - usedHeight) * 0.5;

  return point => ({
    x: offsetX + (point.x - bounds.minX) * scale,
    y: offsetY + (point.y - bounds.minY) * scale
  });
}

function svgPolyline(points, mapPoint) {
  const closedPoints = points.length > 0 ? [...points, points[0]] : points;
  return closedPoints
    .map(point => {
      const mapped = mapPoint(point);
      return `${mapped.x.toFixed(2)},${mapped.y.toFixed(2)}`;
    })
    .join(" ");
}

// Cria um snapshot leve da geração para o painel lateral.
function createGenerationSnapshot(scored, best, avgFitness) {
  if (!state.track || !state.trackGeom) return null;

  const totalLength = state.trackGeom.totalLength || 1;
  const vehicles = scored.map((item, index) => ({
    rank: index + 1,
    x: item.vehicle.pos.x,
    y: item.vehicle.pos.y,
    fitness: item.fitness,
    bestProgress: item.bestProgress,
    progressPct: (item.bestProgress / totalLength) * 100,
    avgSpeed: item.avgSpeed,
    age: item.vehicle.age,
    alive: item.vehicle.alive,
    deadReason: item.vehicle.deadReason || (item.vehicle.alive ? "fim da geração" : "parou"),
    fuel: item.vehicle.fuel,
    fuelPct: item.vehicle.maxFuel > 0 ? (item.vehicle.fuel / item.vehicle.maxFuel) * 100 : 0
  }));

  return {
    generation: state.sim.generation,
    elapsed: state.sim.elapsed,
    observedStepsPerSecond: state.sim.avgObservedStepsPerSecond,
    avgFitness,
    bestFitness: best.fitness,
    bestProgress: best.bestProgress,
    bestProgressPct: (best.bestProgress / totalLength) * 100,
    totalLength,
    vehicles,
    track: {
      outer: clonePoints(state.track.outer),
      inner: clonePoints(state.track.inner),
      centerline: state.trackGeom.centerline ? clonePoints(state.trackGeom.centerline) : [],
      start: {
        x: state.track.start.x,
        y: state.track.start.y,
        angle: state.track.start.angle
      },
      startLine: state.trackGeom.startLine
        ? {
            a: clonePoint(state.trackGeom.startLine.a),
            b: clonePoint(state.trackGeom.startLine.b)
          }
        : null
    }
  };
}

// Mostra, no painel lateral, onde a geração terminou.
function renderBatchPreview() {
  profilerMeasure("ui.renderBatchPreview", () => {
    if (!state.ui.batchPreviewEmpty || !state.ui.batchPreviewPanel) return;

    const snapshot = state.sim.lastGenerationSnapshot;
    const modeBadge = state.ui.batchPreviewModeBadge;
    if (modeBadge) {
      modeBadge.textContent = state.renderEnabled ? "Tempo real" : "Sem render";
      modeBadge.className = `badge rounded-pill ${state.renderEnabled ? "text-bg-secondary" : "text-bg-info"}`;
    }

    const hasSnapshot = Boolean(snapshot);
    state.ui.batchPreviewEmpty.classList.toggle("d-none", hasSnapshot);
    state.ui.batchPreviewPanel.classList.toggle("d-none", !hasSnapshot);
    if (!hasSnapshot) {
      state.ui.batchPreviewSvg.innerHTML = "";
      state.ui.batchPreviewMeta.innerHTML = "";
      state.ui.batchPreviewList.innerHTML = "";
      return;
    }

    const previewWidth = 320;
    const previewHeight = 220;
    const mapper = createSvgMapper(
      [
        ...snapshot.track.outer,
        ...snapshot.track.inner,
        ...snapshot.vehicles.map(vehicle => ({ x: vehicle.x, y: vehicle.y })),
        snapshot.track.start,
        ...(snapshot.track.startLine ? [snapshot.track.startLine.a, snapshot.track.startLine.b] : [])
      ],
      previewWidth,
      previewHeight,
      16
    );
    const topVehicles = snapshot.vehicles.slice(0, 5);

  const outer = svgPolyline(snapshot.track.outer, mapper);
  const inner = svgPolyline(snapshot.track.inner, mapper);
  const centerline = snapshot.track.centerline.length ? svgPolyline(snapshot.track.centerline, mapper) : "";
  const start = mapper(snapshot.track.start);
  const startHeading = {
    x: start.x + Math.cos(snapshot.track.start.angle) * 13,
    y: start.y + Math.sin(snapshot.track.start.angle) * 13
  };
  const startLine = snapshot.track.startLine
    ? (() => {
        const a = mapper(snapshot.track.startLine.a);
        const b = mapper(snapshot.track.startLine.b);
        return `<line x1="${a.x.toFixed(2)}" y1="${a.y.toFixed(2)}" x2="${b.x.toFixed(2)}" y2="${b.y.toFixed(2)}" class="batch-preview-start-line" />`;
      })()
    : "";
  const dots = snapshot.vehicles.map(vehicle => {
    const point = mapper(vehicle);
    const title = [
      `Geração ${snapshot.generation} | #${vehicle.rank}`,
      `Fitness ${formatNumber(vehicle.fitness, 2)}`,
      `Progresso ${formatNumber(vehicle.progressPct, 1)}%`,
      `Tempo ${formatNumber(vehicle.age, 1)}s`,
      `Motivo ${vehicle.deadReason}`
    ].join(" | ");
    return `
      <g>
        <circle cx="${point.x.toFixed(2)}" cy="${point.y.toFixed(2)}" r="${vehicle.rank === 1 ? 5.8 : 3.3}" class="batch-preview-stop${vehicle.rank === 1 ? " best" : ""}" />
        <title>${escapeHtml(title)}</title>
      </g>
    `;
  }).join("");

  state.ui.batchPreviewSvg.innerHTML = `
    <rect x="0" y="0" width="${previewWidth}" height="${previewHeight}" rx="16" class="batch-preview-bg" />
    ${centerline ? `<polyline points="${centerline}" class="batch-preview-centerline" />` : ""}
    <polyline points="${outer}" class="batch-preview-track-outer" />
    <polyline points="${inner}" class="batch-preview-track-inner" />
    ${startLine}
    <circle cx="${start.x.toFixed(2)}" cy="${start.y.toFixed(2)}" r="3.8" class="batch-preview-start" />
    <line x1="${start.x.toFixed(2)}" y1="${start.y.toFixed(2)}" x2="${startHeading.x.toFixed(2)}" y2="${startHeading.y.toFixed(2)}" class="batch-preview-start-line" />
    ${dots}
  `;

  state.ui.batchPreviewMeta.innerHTML = `
    <div class="batch-preview-metric"><span>Geração</span><strong>${escapeHtml(snapshot.generation)}</strong></div>
    <div class="batch-preview-metric"><span>Tempo da geração</span><strong>${escapeHtml(formatNumber(snapshot.elapsed, 1))}s</strong></div>
    <div class="batch-preview-metric"><span>Melhor fitness</span><strong>${escapeHtml(formatNumber(snapshot.bestFitness, 2))}</strong></div>
    <div class="batch-preview-metric"><span>Fitness médio</span><strong>${escapeHtml(formatNumber(snapshot.avgFitness, 2))}</strong></div>
    <div class="batch-preview-metric"><span>Melhor progresso</span><strong>${escapeHtml(formatNumber(snapshot.bestProgressPct, 1))}%</strong></div>
    <div class="batch-preview-metric"><span>Steps/s</span><strong>${escapeHtml(formatSimulationRate(snapshot.observedStepsPerSecond, 1))}</strong></div>
  `;

    state.ui.batchPreviewList.innerHTML = topVehicles.map(vehicle => `
      <div class="batch-preview-row">
        <strong>#${escapeHtml(vehicle.rank)} | fitness ${escapeHtml(formatNumber(vehicle.fitness, 2))} | progresso ${escapeHtml(formatNumber(vehicle.progressPct, 1))}%</strong>
        <small>Posição final (${escapeHtml(formatNumber(vehicle.x, 1))}, ${escapeHtml(formatNumber(vehicle.y, 1))}) | tempo ${escapeHtml(formatNumber(vehicle.age, 1))}s | combustível ${escapeHtml(formatNumber(vehicle.fuelPct, 1))}% | ${escapeHtml(vehicle.deadReason)}</small>
      </div>
    `).join("");
  });
}

// Desenha o gráfico e a tabela de evolução por geração.
function renderHistory() {
  profilerMeasure("ui.renderHistory", () => {
    if (!state.ui.historyChart || !state.ui.historyTableBody) return;

  const history = state.sim.history;
  const hasHistory = history.length > 0;
  state.ui.historyEmpty.classList.toggle("d-none", hasHistory);
  state.ui.historyPanel.classList.toggle("d-none", !hasHistory);
  if (!hasHistory) {
    state.ui.historyChart.innerHTML = "";
    state.ui.historyTableBody.innerHTML = "";
    return;
  }

  const width = 860;
  const height = 280;
  const pad = { top: 18, right: 22, bottom: 38, left: 54 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const maxFitness = Math.max(
    1,
    ...history.map(item => Math.max(item.bestFitness, item.avgFitness))
  );
  const minGeneration = history[0].generation;
  const maxGeneration = history[history.length - 1].generation;
  const generationSpan = Math.max(1, maxGeneration - minGeneration);
  const yTicks = 5;

  const xFor = generation => pad.left + ((generation - minGeneration) / generationSpan) * plotW;
  const yFor = fitness => pad.top + plotH - (fitness / maxFitness) * plotH;

  const avgPath = history
    .map((item, index) => `${index === 0 ? "M" : "L"} ${xFor(item.generation).toFixed(2)} ${yFor(item.avgFitness).toFixed(2)}`)
    .join(" ");
  const bestPath = history
    .map((item, index) => `${index === 0 ? "M" : "L"} ${xFor(item.generation).toFixed(2)} ${yFor(item.bestFitness).toFixed(2)}`)
    .join(" ");

  const gridLines = [];
  for (let i = 0; i <= yTicks; i++) {
    const value = (maxFitness / yTicks) * i;
    const y = yFor(value);
    gridLines.push(`
      <line x1="${pad.left}" y1="${y.toFixed(2)}" x2="${width - pad.right}" y2="${y.toFixed(2)}" class="history-grid-line" />
      <text x="${pad.left - 10}" y="${(y + 4).toFixed(2)}" text-anchor="end" class="history-axis-label">${escapeHtml(formatNumber(value, 0))}</text>
    `);
  }

  const xTicks = history.map(item => `
    <text x="${xFor(item.generation).toFixed(2)}" y="${height - 12}" text-anchor="middle" class="history-axis-label">G${escapeHtml(item.generation)}</text>
  `).join("");

  const avgPoints = history.map(item => {
    const x = xFor(item.generation).toFixed(2);
    const y = yFor(item.avgFitness).toFixed(2);
    return `
      <g>
        <circle cx="${x}" cy="${y}" r="4.5" class="history-point-avg" />
        <title>Geração ${escapeHtml(item.generation)} | Fitness médio ${escapeHtml(formatNumber(item.avgFitness, 2))} | Melhor ${escapeHtml(formatNumber(item.bestFitness, 2))}</title>
      </g>
    `;
  }).join("");

  const bestPoints = history.map(item => {
    const x = xFor(item.generation).toFixed(2);
    const y = yFor(item.bestFitness).toFixed(2);
    return `
      <g>
        <circle cx="${x}" cy="${y}" r="4.5" class="history-point-best" />
        <title>Geração ${escapeHtml(item.generation)} | Fitness médio ${escapeHtml(formatNumber(item.avgFitness, 2))} | Melhor ${escapeHtml(formatNumber(item.bestFitness, 2))}</title>
      </g>
    `;
  }).join("");

  state.ui.historyChart.innerHTML = `
    <rect x="0" y="0" width="${width}" height="${height}" rx="14" class="history-chart-bg" />
    ${gridLines.join("")}
    <line x1="${pad.left}" y1="${height - pad.bottom}" x2="${width - pad.right}" y2="${height - pad.bottom}" class="history-axis-line" />
    <line x1="${pad.left}" y1="${pad.top}" x2="${pad.left}" y2="${height - pad.bottom}" class="history-axis-line" />
    <path d="${avgPath}" class="history-line-avg" />
    <path d="${bestPath}" class="history-line-best" />
    ${avgPoints}
    ${bestPoints}
    ${xTicks}
  `;

    state.ui.historyTableBody.innerHTML = history
      .slice()
      .reverse()
      .map(item => `
        <tr>
          <td>${escapeHtml(item.generation)}</td>
          <td>${escapeHtml(formatNumber(item.avgFitness, 2))}</td>
          <td>${escapeHtml(formatNumber(item.bestFitness, 2))}</td>
        </tr>
      `)
      .join("");
  });
}
