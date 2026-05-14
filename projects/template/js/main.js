import { TemplateDemo } from "./template-demo.js";

const canvasRoot = document.getElementById("canvas-root");
const resetButton = document.getElementById("reset-button");

const demo = new TemplateDemo(canvasRoot);
demo.mount();

if (resetButton) {
  resetButton.addEventListener("click", () => {
    demo.reset();
  });
}
