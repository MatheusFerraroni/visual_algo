export class TemplateDemo {
  constructor(container) {
    this.container = container;
    this.instance = null;
    this.resizeObserver = null;
    this.lastSize = null;
    this.resizeFrame = null;
  }

  getCanvasSize() {
    if (!this.container) {
      return { width: 720, height: 420 };
    }

    const { width, height } = this.container.getBoundingClientRect();

    return {
      width: Math.max(320, Math.floor(width)),
      height: Math.max(240, Math.floor(height)),
    };
  }

  scheduleResize() {
    if (this.resizeFrame !== null) {
      cancelAnimationFrame(this.resizeFrame);
    }

    this.resizeFrame = requestAnimationFrame(() => {
      this.resizeFrame = null;
      this.instance?.resizeToContainer?.();
    });
  }

  mount() {
    if (!this.container) {
      return;
    }

    const sketch = (p) => {
      let x = 0;
      let y = 0;
      let isPositionInitialized = false;
      let radius = 28;
      let speedX = 2;
      let speedY = 2;

      p.setup = () => {
        p.pixelDensity(1);
        p.frameRate(60);
        const canvas = p.createCanvas(10, 10);
        canvas.parent(this.container);
        this.scheduleResize();
      };

      p.resizeToContainer = () => {
        const { width, height } = this.getCanvasSize();

        if (
          this.lastSize &&
          this.lastSize.width === width &&
          this.lastSize.height === height
        ) {
          return;
        }

        this.lastSize = { width, height };
        p.resizeCanvas(width, height);

        if (!isPositionInitialized) {
          x = p.width * 0.5;
          y = p.height * 0.5;
          isPositionInitialized = true;
          return;
        }

        x = p.constrain(x, radius, p.width - radius);
        y = p.constrain(y, radius, p.height - radius);
      };

      p.windowResized = () => {
        this.scheduleResize();
      };

      p.draw = () => {
        if (!isPositionInitialized) {
          return;
        }

        p.background("#d9cfbf");

        x += speedX;
        y += speedY;

        if (x > p.width - radius || x < radius) {
          speedX *= -1;
        }

        if (y > p.height - radius || y < radius) {
          speedY *= -1;
        }

        p.fill("#c4632f");
        p.circle(x, y, radius * 2);

        p.noStroke();
        p.fill("rgba(255, 253, 248, 0.9)");
        p.rect(12, 12, 88, 34);

        p.fill("#1f1a14");
        p.textSize(14);
        p.textAlign(p.LEFT, p.CENTER);
        p.text(`FPS: ${p.frameRate().toFixed(0)}`, 24, 29);
      };
    };

    this.instance = new p5(sketch);
    this.observeContainer();
  }

  observeContainer() {
    if (!this.container || typeof ResizeObserver === "undefined") {
      return;
    }

    this.resizeObserver?.disconnect();
    this.resizeObserver = new ResizeObserver(() => {
      this.scheduleResize();
    });
    this.resizeObserver.observe(this.container);
  }

  reset() {
    this.lastSize = null;
    this.resizeObserver?.disconnect();

    if (this.resizeFrame !== null) {
      cancelAnimationFrame(this.resizeFrame);
      this.resizeFrame = null;
    }

    if (this.instance) {
      this.instance.remove();
    }

    this.mount();
  }
}
