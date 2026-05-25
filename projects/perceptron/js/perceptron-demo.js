import { getActivationConfig, listActivationOptions } from "./activation-functions.js";
import { ChartController } from "./chart-controller.js";
import { P5PerceptronView } from "./p5-perceptron-view.js";
import {
  createInitialState,
  createInputValues,
  createWeightValues,
  syncVectorLength,
} from "./state.js";

function formatNumber(value, digits = 3) {
  return Number(value).toFixed(digits);
}

export class PerceptronDemo {
  constructor({ controlPanel, container }) {
    this.controlPanel = controlPanel;
    this.container = container;
    this.state = createInitialState();
    this.chartController = null;
    this.p5View = null;
    this.chartCanvas = null;
    this.inputFieldsRoot = null;
    this.weightFieldsRoot = null;
    this.summaryNodes = {};
    this.visualNodes = {};
  }

  mount() {
    if (!this.controlPanel || !this.container) {
      return;
    }

    this.renderShell();
    this.bindStaticEvents();
    this.renderDynamicFields();
    this.renderState();
  }

  reset() {
    this.state = createInitialState();
    this.renderDynamicFields();
    this.renderState();
  }

  renderShell() {
    this.controlPanel.innerHTML = `
      <div class="control-panel__section perceptron-controls">
        <div class="perceptron-controls__group">
          <label class="form-label" for="input-count">Número de entradas</label>
          <input id="input-count" class="form-control" type="number" min="1" max="8" step="1" value="${this.state.inputCount}" />
        </div>

        <div class="perceptron-controls__group">
          <label class="form-label" for="activation-key">Função de ativação</label>
          <select id="activation-key" class="form-select">
            ${listActivationOptions()
              .map(
                (option) => `
                  <option value="${option.key}" ${option.key === this.state.activationKey ? "selected" : ""}>
                    ${option.label}
                  </option>
                `
              )
              .join("")}
          </select>
          <p id="activation-formula" class="form-text mb-0"></p>
        </div>

        <div class="perceptron-controls__group">
          <label class="form-label" for="bias-value">Bias</label>
          <input id="bias-value" class="form-control" type="number" step="0.1" value="${this.state.bias}" />
        </div>

        <div class="perceptron-controls__group">
          <div class="d-flex align-items-center justify-content-between">
            <h3 class="h6 mb-0">Entradas</h3>
            <span class="small text-secondary">x1..xn</span>
          </div>
          <div id="input-fields" class="perceptron-vector-grid"></div>
        </div>

        <div class="perceptron-controls__group">
          <div class="d-flex align-items-center justify-content-between">
            <h3 class="h6 mb-0">Pesos</h3>
            <span class="small text-secondary">w1..wn</span>
          </div>
          <div id="weight-fields" class="perceptron-vector-grid"></div>
        </div>

        <div class="perceptron-controls__group">
          <h3 class="h6 mb-0">Gráfico automático</h3>
          <div class="perceptron-range-grid">
            <div>
              <label class="form-label" for="chart-min">Mínimo</label>
              <input id="chart-min" class="form-control" type="number" step="0.5" value="${this.state.chartRange.min}" />
            </div>
            <div>
              <label class="form-label" for="chart-max">Máximo</label>
              <input id="chart-max" class="form-control" type="number" step="0.5" value="${this.state.chartRange.max}" />
            </div>
            <div>
              <label class="form-label" for="chart-steps">Pontos</label>
              <input id="chart-steps" class="form-control" type="number" min="5" max="241" step="1" value="${this.state.chartRange.steps}" />
            </div>
          </div>
        </div>

        <div class="perceptron-controls__group">
          <button id="reset-button" class="btn btn-dark" type="button">
            Resetar configuração
          </button>
        </div>
      </div>
    `;

    this.container.innerHTML = `
      <section class="perceptron-stage">
        <div class="perceptron-stage__top">
          <article class="perceptron-visual-card">
            <div class="perceptron-visual-card__header">
              <div>
                <p class="eyebrow mb-1">Parte 1</p>
                <h2 class="h5 mb-0">Entradas, pesos, soma e bias</h2>
              </div>
            </div>
            <div id="stage-inputs" class="perceptron-stage__content"></div>
          </article>

          <article class="perceptron-visual-card">
            <div class="perceptron-visual-card__header">
              <div>
                <p class="eyebrow mb-1">Parte 2</p>
                <h2 class="h5 mb-0">Ativação e output</h2>
              </div>
            </div>
            <div id="stage-activation" class="perceptron-stage__content"></div>
          </article>
        </div>

        <article class="perceptron-visual-card perceptron-summary-card">
          <div class="perceptron-visual-card__header">
            <div>
              <p class="eyebrow mb-1">Resumo</p>
              <h2 class="h5 mb-0">Cálculo atual</h2>
            </div>
          </div>
          <div class="perceptron-summary-grid">
            <div class="perceptron-summary-item">
              <span class="perceptron-summary-item__label">Soma ponderada</span>
              <strong id="summary-weighted-sum"></strong>
            </div>
            <div class="perceptron-summary-item">
              <span class="perceptron-summary-item__label">Bias</span>
              <strong id="summary-bias"></strong>
            </div>
            <div class="perceptron-summary-item">
              <span class="perceptron-summary-item__label">Ativação</span>
              <strong id="summary-activation"></strong>
            </div>
            <div class="perceptron-summary-item">
              <span class="perceptron-summary-item__label">Output</span>
              <strong id="summary-output"></strong>
            </div>
          </div>
        </article>

        <article class="perceptron-visual-card perceptron-p5-card">
          <div class="perceptron-visual-card__header">
            <div>
              <p class="eyebrow mb-1">Visualização p5</p>
              <h2 class="h5 mb-0">Perceptron desenhado no canvas</h2>
            </div>
          </div>
          <div class="perceptron-p5-card__body">
            <div id="perceptron-p5-root" class="perceptron-p5-root"></div>
          </div>
        </article>

        <article class="perceptron-visual-card perceptron-chart-card">
          <div class="perceptron-visual-card__header">
            <div>
              <p class="eyebrow mb-1">Gráfico</p>
              <h2 class="h5 mb-0">Variação automática das entradas</h2>
            </div>
          </div>
          <div class="perceptron-chart-card__body">
            <canvas id="perceptron-chart"></canvas>
          </div>
        </article>
      </section>
    `;

    this.inputFieldsRoot = this.controlPanel.querySelector("#input-fields");
    this.weightFieldsRoot = this.controlPanel.querySelector("#weight-fields");
    this.chartCanvas = this.container.querySelector("#perceptron-chart");
    this.chartController = new ChartController(this.chartCanvas);
    this.p5View = new P5PerceptronView(this.container.querySelector("#perceptron-p5-root"));
    this.p5View.mount();
    this.summaryNodes = {
      weightedSum: this.container.querySelector("#summary-weighted-sum"),
      bias: this.container.querySelector("#summary-bias"),
      activation: this.container.querySelector("#summary-activation"),
      output: this.container.querySelector("#summary-output"),
      formula: this.controlPanel.querySelector("#activation-formula"),
    };
    this.visualNodes = {
      stageInputs: this.container.querySelector("#stage-inputs"),
      stageActivation: this.container.querySelector("#stage-activation"),
    };
  }

  bindStaticEvents() {
    this.controlPanel.querySelector("#input-count")?.addEventListener("input", (event) => {
      const count = Math.min(8, Math.max(1, Number(event.target.value) || 1));
      this.updateInputCount(count);
    });

    this.controlPanel.querySelector("#activation-key")?.addEventListener("change", (event) => {
      this.state.activationKey = event.target.value;
      this.renderState();
    });

    this.controlPanel.querySelector("#bias-value")?.addEventListener("input", (event) => {
      this.state.bias = Number(event.target.value) || 0;
      this.renderState();
    });

    this.controlPanel.querySelector("#chart-min")?.addEventListener("input", (event) => {
      this.state.chartRange.min = Number(event.target.value) || -5;
      this.renderState();
    });

    this.controlPanel.querySelector("#chart-max")?.addEventListener("input", (event) => {
      this.state.chartRange.max = Number(event.target.value) || 5;
      this.renderState();
    });

    this.controlPanel.querySelector("#chart-steps")?.addEventListener("input", (event) => {
      this.state.chartRange.steps = Math.max(5, Number(event.target.value) || 81);
      this.renderState();
    });

    this.controlPanel.querySelector("#reset-button")?.addEventListener("click", () => {
      this.reset();
    });
  }

  updateInputCount(count) {
    this.state.inputCount = count;
    this.state.inputs = syncVectorLength(this.state.inputs, count, (index) => {
      return createInputValues(count)[index];
    });
    this.state.weights = syncVectorLength(this.state.weights, count, (index) => {
      return createWeightValues(count)[index];
    });

    this.renderDynamicFields();
    this.renderState();
  }

  renderDynamicFields() {
    this.inputFieldsRoot.replaceChildren(
      ...this.state.inputs.map((value, index) =>
        this.buildNumericField({
          label: `x${index + 1}`,
          value,
          onInput: (nextValue) => {
            this.state.inputs[index] = nextValue;
            this.renderState();
          },
        })
      )
    );

    this.weightFieldsRoot.replaceChildren(
      ...this.state.weights.map((value, index) =>
        this.buildNumericField({
          label: `w${index + 1}`,
          value,
          onInput: (nextValue) => {
            this.state.weights[index] = nextValue;
            this.renderState();
          },
        })
      )
    );
  }

  buildNumericField({ label, value, onInput }) {
    const wrapper = document.createElement("label");
    wrapper.className = "perceptron-number-field";

    const title = document.createElement("span");
    title.className = "perceptron-number-field__label";
    title.textContent = label;

    const input = document.createElement("input");
    input.className = "form-control";
    input.type = "number";
    input.step = "0.1";
    input.value = value;
    input.addEventListener("input", (event) => {
      onInput(Number(event.target.value) || 0);
    });

    wrapper.append(title, input);
    return wrapper;
  }

  computeCurrentValues() {
    const activation = getActivationConfig(this.state.activationKey);
    const contributions = this.state.inputs.map((inputValue, index) => ({
      input: inputValue,
      weight: this.state.weights[index],
      product: inputValue * this.state.weights[index],
    }));
    const weightedSumWithoutBias = contributions.reduce((sum, item) => sum + item.product, 0);
    const weightedSum = weightedSumWithoutBias + this.state.bias;
    const output = activation.apply(weightedSum);

    return {
      activation,
      contributions,
      weightedSumWithoutBias,
      weightedSum,
      output,
    };
  }

  renderState() {
    const computed = this.computeCurrentValues();

    this.summaryNodes.weightedSum.textContent = formatNumber(computed.weightedSum);
    this.summaryNodes.bias.textContent = formatNumber(this.state.bias);
    this.summaryNodes.activation.textContent = computed.activation.label;
    this.summaryNodes.output.textContent = formatNumber(computed.output);
    this.summaryNodes.formula.textContent = computed.activation.formula;

    this.renderInputStage(computed);
    this.renderActivationStage(computed);
    this.p5View?.update(this.state, computed);
    this.chartController?.render(this.state);
  }

  renderInputStage(computed) {
    const lines = computed.contributions
      .map((item, index) => {
        return `
          <div class="perceptron-flow-row">
            <div class="perceptron-token perceptron-token--input">x${index + 1} = ${formatNumber(item.input, 2)}</div>
            <div class="perceptron-flow-operator">×</div>
            <div class="perceptron-token perceptron-token--weight">w${index + 1} = ${formatNumber(item.weight, 2)}</div>
            <div class="perceptron-flow-operator">=</div>
            <div class="perceptron-token perceptron-token--product">${formatNumber(item.product)}</div>
          </div>
        `;
      })
      .join("");

    this.visualNodes.stageInputs.innerHTML = `
      <div class="perceptron-flow">
        ${lines}
      </div>
      <div class="perceptron-sum-box">
        <div class="perceptron-sum-box__line">
          <span>Soma ponderada</span>
          <strong>${formatNumber(computed.weightedSumWithoutBias)}</strong>
        </div>
        <div class="perceptron-sum-box__line">
          <span>Bias</span>
          <strong>${formatNumber(this.state.bias)}</strong>
        </div>
        <div class="perceptron-sum-box__line perceptron-sum-box__line--result">
          <span>z = Σ(xi · wi) + b</span>
          <strong>${formatNumber(computed.weightedSum)}</strong>
        </div>
      </div>
    `;
  }

  renderActivationStage(computed) {
    this.visualNodes.stageActivation.innerHTML = `
      <div class="perceptron-activation-diagram">
        <div class="perceptron-node perceptron-node--sum">
          <span class="perceptron-node__label">Entrada da ativação</span>
          <strong>z = ${formatNumber(computed.weightedSum)}</strong>
        </div>
        <div class="perceptron-activation-arrow" aria-hidden="true">→</div>
        <div class="perceptron-node perceptron-node--activation">
          <span class="perceptron-node__label">${computed.activation.label}</span>
          <strong>${computed.activation.formula}</strong>
        </div>
        <div class="perceptron-activation-arrow" aria-hidden="true">→</div>
        <div class="perceptron-node perceptron-node--output">
          <span class="perceptron-node__label">Output</span>
          <strong>y = ${formatNumber(computed.output)}</strong>
        </div>
      </div>
    `;
  }
}
