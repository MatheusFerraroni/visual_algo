import assert from "node:assert/strict";
import test from "node:test";

import { Camera2D } from "../src/rendering/camera-2d.js";

function createCamera() {
  return new Camera2D({
    worldWidth: 100,
    worldHeight: 100,
    viewportWidth: 100,
    viewportHeight: 100,
    minZoom: 1,
    maxZoom: 8,
  });
}

test("projeções tela-mundo são inversas e snapshots são imutáveis", () => {
  const camera = createCamera();
  camera.zoomAt(50, 50, 2);
  camera.panBy(-10, 8);
  const screen = camera.worldToScreen(35, 45);
  const world = camera.screenToWorld(screen.x, screen.y);

  assert.deepEqual(world, { x: 35, y: 45 });
  assert(Object.isFrozen(screen));
  assert(Object.isFrozen(camera.getSnapshot()));
});

test("zoom preserva âncora e respeita limites", () => {
  const camera = createCamera();
  const before = camera.screenToWorld(25, 75);
  camera.zoomAt(25, 75, 4);
  const after = camera.screenToWorld(25, 75);
  assert.deepEqual(after, before);

  camera.zoomAt(50, 50, 100);
  assert.equal(camera.getSnapshot().zoom, 8);
  camera.zoomAt(50, 50, 0.1);
  assert.deepEqual(camera.getSnapshot(), {
    zoom: 1,
    offsetX: 0,
    offsetY: 0,
    minZoom: 1,
    maxZoom: 8,
  });
});

test("pan nunca revela espaço fora do mundo e reset centraliza", () => {
  const camera = createCamera();
  camera.zoomAt(50, 50, 2);
  camera.panBy(1_000, 1_000);
  assert.deepEqual(camera.getSnapshot(), {
    zoom: 2,
    offsetX: 0,
    offsetY: 0,
    minZoom: 1,
    maxZoom: 8,
  });
  camera.panBy(-1_000, -1_000);
  assert.equal(camera.getSnapshot().offsetX, -100);
  assert.equal(camera.getSnapshot().offsetY, -100);
  camera.reset();
  assert.equal(camera.getSnapshot().zoom, 1);
  assert.equal(camera.getSnapshot().offsetX, 0);
  assert.equal(camera.getSnapshot().offsetY, 0);
});

test("centerOn preserva zoom, centraliza o alvo e respeita as bordas", () => {
  const camera = createCamera();
  camera.zoomAt(50, 50, 4);
  camera.centerOn(60, 40);
  assert.deepEqual(camera.worldToScreen(60, 40), { x: 50, y: 50 });
  assert.equal(camera.getSnapshot().zoom, 4);

  camera.centerOn(0, 0);
  assert.equal(camera.getSnapshot().offsetX, 0);
  assert.equal(camera.getSnapshot().offsetY, 0);
  camera.centerOn(100, 100);
  assert.equal(camera.getSnapshot().offsetX, -300);
  assert.equal(camera.getSnapshot().offsetY, -300);
  assert.throws(() => camera.centerOn(Number.NaN, 1), /coordenadas finitas/);
});
