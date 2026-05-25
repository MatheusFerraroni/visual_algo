function formatNumber(value, digits = 2) {
  return Number(value).toFixed(digits);
}

export class P5PerceptronView {
  constructor(container) {
    this.container = container;
    this.instance = null;
    this.canvasElement = null;
    this.state = null;
    this.computed = null;
    this.resizeObserver = null;
    this.resizeFrame = null;
    this.resizeTimeout = null;
    this.firstStateReceived = false;
    this.lastSize = null;
  }

  mount() {
    if (!this.container || typeof p5 === "undefined") {
      return;
    }

    const sketch = (p) => {
      p.setup = () => {
        p.pixelDensity(1);
        p.frameRate(30);
        const initialSize = this.measureContainer();
        const canvas = p.createCanvas(initialSize.width, initialSize.height);
        canvas.parent(this.container);
        this.canvasElement = canvas.elt ?? null;
        this.queueInitialResize(p);
      };

      p.draw = () => {
        p.background("#fcf8f1");
        this.resizeToContainer(p);
        this.drawScene(p);
      };
    };

    this.instance = new p5(sketch);
    this.observeContainer();
  }

  update(state, computed) {
    this.state = state;
    this.computed = computed;

    if (!this.firstStateReceived) {
      this.firstStateReceived = true;
      this.queueInitialResize(this.instance);
    }

    if (this.instance) {
      this.instance.redraw?.();
    }
  }

  observeContainer() {
    if (!this.container || typeof ResizeObserver === "undefined") {
      return;
    }

    this.resizeObserver?.disconnect();
    this.resizeObserver = new ResizeObserver(() => {
      if (this.resizeFrame !== null) {
        cancelAnimationFrame(this.resizeFrame);
      }

      this.resizeFrame = requestAnimationFrame(() => {
        this.resizeFrame = null;
        this.resizeToContainer(this.instance);
        this.instance?.redraw?.();
      });
    });
    this.resizeObserver.observe(this.container);
  }

  queueInitialResize(instance = this.instance) {
    if (!instance) {
      return;
    }

    this.resizeToContainer(instance, { force: true });
    instance.redraw?.();

    requestAnimationFrame(() => {
      this.resizeToContainer(instance, { force: true });
      instance.redraw?.();
    });

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        this.resizeToContainer(instance, { force: true });
        instance.redraw?.();
      });
    });

    if (this.resizeTimeout !== null) {
      clearTimeout(this.resizeTimeout);
    }

    this.resizeTimeout = setTimeout(() => {
      this.resizeTimeout = null;
      this.resizeToContainer(instance, { force: true });
      instance.redraw?.();
    }, 80);
  }

  resizeToContainer(p, options = {}) {
    if (!p || !this.container) {
      return;
    }

    const { width: nextWidth, height: nextHeight, measuredWidth, measuredHeight } =
      this.measureContainer();

    if (!options.force && (measuredWidth < 2 || measuredHeight < 2)) {
      return;
    }

    if (
      this.lastSize &&
      this.lastSize.width === nextWidth &&
      this.lastSize.height === nextHeight
    ) {
      return;
    }

    this.lastSize = { width: nextWidth, height: nextHeight };
    p.resizeCanvas(nextWidth, nextHeight);

    if (this.canvasElement) {
      this.canvasElement.width = nextWidth;
      this.canvasElement.height = nextHeight;
      this.canvasElement.style.width = `${nextWidth}px`;
      this.canvasElement.style.height = `${nextHeight}px`;
    }
  }

  measureContainer() {
    const rect = this.container.getBoundingClientRect();
    const measuredWidth =
      rect.width || this.container.clientWidth || this.container.offsetWidth;
    const measuredHeight =
      rect.height || this.container.clientHeight || this.container.offsetHeight;

    return {
      measuredWidth,
      measuredHeight,
      width: Math.max(320, Math.floor(measuredWidth || 0)),
      height: Math.max(260, Math.floor(measuredHeight || 0)),
    };
  }

  drawScene(p) {
    if (!this.state || !this.computed) {
      this.drawEmptyState(p);
      return;
    }

    const margin = 28;
    const footerHeight = 62;
    const footerGap = 20;
    const inputX = margin + 30;
    const neuronX = p.width * 0.48;
    const outputX = p.width - margin - 36;
    const usableBottom = p.height - margin - footerHeight - footerGap;
    const centerY = (margin + usableBottom) * 0.5;
    const topLimit = margin + 24;
    const bottomLimit = usableBottom - 12;
    const totalInputs = this.state.inputs.length;
    const spacing =
      totalInputs > 1 ? (bottomLimit - topLimit) / (totalInputs - 1) : 0;

    p.noStroke();
    p.fill("#8e5a3b");
    p.textSize(12);
    p.textStyle(p.BOLD);
    p.text("Entradas", inputX - 16, margin - 2);
    p.text("Perceptron", neuronX - 32, margin - 2);
    p.text("Output", outputX - 18, margin - 2);

    this.state.inputs.forEach((inputValue, index) => {
      const y = totalInputs > 1 ? topLimit + spacing * index : centerY;
      const weight = this.state.weights[index];
      const product = this.computed.contributions[index].product;
      const strokeWeightValue = 1.5 + Math.min(6, Math.abs(weight) * 1.2);

      p.stroke(weight >= 0 ? "#c4632f" : "#3b82f6");
      p.strokeWeight(strokeWeightValue);
      p.line(inputX + 22, y, neuronX - 44, centerY);

      p.noStroke();
      p.fill("#ffffff");
      p.circle(inputX, y, 42);
      p.fill("#1f1a14");
      p.textAlign(p.CENTER, p.CENTER);
      p.textStyle(p.BOLD);
      p.text(`x${index + 1}`, inputX, y - 8);
      p.textStyle(p.NORMAL);
      p.text(formatNumber(inputValue), inputX, y + 10);

      const labelX = inputX + (neuronX - inputX) * 0.42;
      const labelY = y + (centerY - y) * 0.42;
      p.rectMode(p.CENTER);
      p.fill("rgba(255,253,248,0.96)");
      p.stroke("rgba(31,26,20,0.12)");
      p.strokeWeight(1);
      p.rect(labelX, labelY, 92, 38, 10);
      p.noStroke();
      p.fill("#1f1a14");
      p.textSize(11);
      p.text(`w${index + 1}=${formatNumber(weight)}`, labelX, labelY - 7);
      p.text(`xw=${formatNumber(product)}`, labelX, labelY + 8);
    });

    p.noStroke();
    p.fill("#1f1a14");
    p.circle(neuronX, centerY, 110);
    p.fill("#fffdf8");
    p.textAlign(p.CENTER, p.CENTER);
    p.textSize(14);
    p.textStyle(p.BOLD);
    p.text("Σ + b", neuronX, centerY - 10);
    p.textStyle(p.NORMAL);
    p.text(`z=${formatNumber(this.computed.weightedSum)}`, neuronX, centerY + 14);

    p.stroke("#2f7b49");
    p.strokeWeight(4);
    p.line(neuronX + 55, centerY, outputX - 30, centerY);

    p.noStroke();
    p.fill("rgba(56,132,255,0.1)");
    p.rectMode(p.CENTER);
    p.stroke("rgba(56,132,255,0.35)");
    p.strokeWeight(1);
    p.rect((neuronX + outputX) * 0.5, centerY - 44, 130, 52, 14);
    p.noStroke();
    p.fill("#1f1a14");
    p.textSize(12);
    p.textStyle(p.BOLD);
    p.text(this.computed.activation.label, (neuronX + outputX) * 0.5, centerY - 50);
    p.textStyle(p.NORMAL);
    p.text(this.computed.activation.formula, (neuronX + outputX) * 0.5, centerY - 34);

    p.fill("#ffffff");
    p.circle(outputX, centerY, 56);
    p.fill("#2f7b49");
    p.textStyle(p.BOLD);
    p.text("y", outputX, centerY - 8);
    p.textStyle(p.NORMAL);
    p.text(formatNumber(this.computed.output), outputX, centerY + 11);

    p.noStroke();
    p.fill("rgba(31,26,20,0.06)");
    p.rectMode(p.CORNER);
    p.rect(margin, p.height - margin - footerHeight, p.width - margin * 2, 46, 14);
    p.fill("#1f1a14");
    p.textAlign(p.LEFT, p.CENTER);
    p.textSize(12);
    p.text(
      `Bias = ${formatNumber(this.state.bias)}   |   Soma ponderada = ${formatNumber(this.computed.weightedSumWithoutBias)}   |   Output = ${formatNumber(this.computed.output)}`,
      margin + 16,
      p.height - margin - footerHeight + 23
    );
  }

  drawEmptyState(p) {
    p.noStroke();
    p.fill("#1f1a14");
    p.textAlign(p.CENTER, p.CENTER);
    p.textSize(16);
    p.text("Aguardando estado do perceptron", p.width * 0.5, p.height * 0.5);
  }
}
