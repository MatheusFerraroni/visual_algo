import { PerceptronDemo } from "./perceptron-demo.js";

const controlPanel = document.getElementById("control-panel");
const canvasRoot = document.getElementById("canvas-root");

const demo = new PerceptronDemo({
  controlPanel,
  container: canvasRoot,
});

demo.mount();
