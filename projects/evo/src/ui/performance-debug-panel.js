const REFRESH_INTERVAL_MS = 250;

function requireElement(root, selector) {
  const element = root.querySelector(selector);
  if (!element) {
    throw new Error(`Elemento obrigatório ausente: ${selector}.`);
  }
  return element;
}

function formatNumber(value, maximumFractionDigits = 2) {
  return value === null
    ? "—"
    : value.toLocaleString("pt-BR", { maximumFractionDigits });
}

function formatMilliseconds(value) {
  if (value === null) {
    return "—";
  }
  if (value > 0 && value < 0.001) {
    return "<0,001";
  }
  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });
}

function formatSpeed(speed) {
  return speed === "max" ? "máximo" : `${speed}×`;
}

export class PerformanceDebugPanel {
  #root;
  #profiler;
  #details;
  #status;
  #context;
  #tables;
  #intervalId = null;

  constructor(root, profiler) {
    if (!root || typeof root.querySelector !== "function"
      || !profiler || typeof profiler.getSnapshot !== "function") {
      throw new TypeError("O painel de desempenho exige DOM e profiler válidos.");
    }
    this.#root = root;
    this.#profiler = profiler;
    this.#details = requireElement(root, "#performance-debug-panel");
    this.#status = requireElement(root, "#performance-debug-status");
    this.#context = requireElement(root, "#performance-debug-context");
    this.#tables = requireElement(root, "#performance-debug-tables");
    requireElement(root, "#performance-debug-reset").addEventListener("click", () => {
      this.#profiler.resetStatistics();
      this.render();
    });
    this.#details.addEventListener("toggle", () => {
      if (this.#details.open) {
        this.render();
        this.#startUpdates();
      } else {
        this.#stopUpdates();
      }
    });
  }

  render() {
    if (!this.#details.open) {
      return;
    }
    const renderPanel = () => this.#renderSnapshot(this.#profiler.getSnapshot());
    if (this.#profiler.collecting) {
      this.#profiler.measure("diagnostics.refresh", renderPanel);
    } else {
      renderPanel();
    }
  }

  destroy() {
    this.#stopUpdates();
  }

  #renderSnapshot(snapshot) {
    this.#status.textContent = !snapshot.hasSession
      ? "A coleta começará ao iniciar a simulação."
      : snapshot.collecting
        ? "Coletando tempos da execução atual."
        : "Coleta pausada; as estatísticas estão congeladas.";
    this.#renderContext(snapshot.context);
    this.#renderTables(snapshot.categories);
  }

  #renderContext(context) {
    const values = [
      ["Estado", context.mode === "running" ? "Executando" : context.mode === "paused" ? "Pausada" : "Ociosa"],
      ["Velocidade", formatSpeed(context.speed)],
      ["FPS", formatNumber(context.framesPerSecond, 1)],
      ["Intervalo do frame", `${formatMilliseconds(context.lastFrameIntervalMs)} ms`],
      ["Ticks no frame", formatNumber(context.lastTicksPerFrame, 0)],
      ["Ticks por segundo", formatNumber(context.ticksPerSecond, 1)],
      ["Custo médio do tick", `${formatMilliseconds(context.meanTickCostMs)} ms`],
      ["Geração / tick", `G${context.generation} · ${context.tick.toLocaleString("pt-BR")}`],
      ["Seres vivos", `${context.aliveBeings.toLocaleString("pt-BR")}/${context.totalBeings.toLocaleString("pt-BR")}`],
      ["Comidas", context.foods.toLocaleString("pt-BR")],
    ];
    const fragment = this.#root.createDocumentFragment();
    for (const [label, value] of values) {
      const item = this.#root.createElement("div");
      const term = this.#root.createElement("dt");
      const description = this.#root.createElement("dd");
      term.textContent = label;
      description.textContent = value;
      item.append(term, description);
      fragment.append(item);
    }
    this.#context.replaceChildren(fragment);
  }

  #renderTables(categories) {
    const fragment = this.#root.createDocumentFragment();
    for (const category of categories) {
      const section = this.#root.createElement("section");
      section.className = "performance-debug__group";
      const title = this.#root.createElement("h3");
      title.textContent = category.label;
      section.append(title);

      const wrapper = this.#root.createElement("div");
      wrapper.className = "performance-debug__table-wrap";
      const table = this.#root.createElement("table");
      table.className = "performance-debug__table";
      const caption = this.#root.createElement("caption");
      caption.className = "sr-only";
      caption.textContent = `Tempos de ${category.label.toLocaleLowerCase()} em milissegundos`;
      const head = this.#root.createElement("thead");
      const headerRow = this.#root.createElement("tr");
      for (const label of ["Etapa", "Último", "Média", "P95", "Máximo", "Chamadas", "Total", "% do pai"]) {
        const cell = this.#root.createElement("th");
        cell.scope = "col";
        cell.textContent = label;
        headerRow.append(cell);
      }
      head.append(headerRow);
      const body = this.#root.createElement("tbody");
      for (const stage of category.stages) {
        const row = this.#root.createElement("tr");
        row.dataset.hasSamples = String(stage.callCount > 0);
        const values = [
          stage.label,
          formatMilliseconds(stage.lastMs),
          formatMilliseconds(stage.meanMs),
          formatMilliseconds(stage.p95Ms),
          formatMilliseconds(stage.maxMs),
          stage.callCount.toLocaleString("pt-BR"),
          formatMilliseconds(stage.callCount === 0 ? null : stage.totalMs),
          stage.parentShare === null
            ? "—"
            : `${(stage.parentShare * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`,
        ];
        values.forEach((value, index) => {
          const cell = this.#root.createElement(index === 0 ? "th" : "td");
          if (index === 0) {
            cell.scope = "row";
          }
          cell.textContent = value;
          row.append(cell);
        });
        body.append(row);
      }
      table.append(caption, head, body);
      wrapper.append(table);
      section.append(wrapper);
      fragment.append(section);
    }
    this.#tables.replaceChildren(fragment);
  }

  #startUpdates() {
    if (this.#intervalId !== null) {
      return;
    }
    this.#intervalId = window.setInterval(() => this.render(), REFRESH_INTERVAL_MS);
  }

  #stopUpdates() {
    if (this.#intervalId === null) {
      return;
    }
    window.clearInterval(this.#intervalId);
    this.#intervalId = null;
  }
}
