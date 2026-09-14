import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_CONFIG } from "../src/config.js";
import { SimulationClock } from "../src/core/simulation-clock.js";

function runForOneRealSecond(speed) {
  const clock = new SimulationClock(DEFAULT_CONFIG.time);
  let ticks = 0;
  clock.setSpeed(speed);
  clock.resume();

  for (let frame = 0; frame < 10; frame += 1) {
    clock.advance(100, () => { ticks += 1; });
  }

  return ticks;
}

test("multiplicadores produzem a quantidade esperada de ticks fixos", () => {
  assert.equal(runForOneRealSecond(1), 30);
  assert.equal(runForOneRealSecond(2), 60);
  assert.equal(runForOneRealSecond(4), 120);
  assert.equal(runForOneRealSecond(8), 240);
});

test("cada tick recebe sempre dt = 1/30", () => {
  const clock = new SimulationClock(DEFAULT_CONFIG.time);
  const steps = [];
  clock.resume();
  clock.advance(100, (dt) => steps.push(dt));
  assert.deepEqual(steps, [1 / 30, 1 / 30, 1 / 30]);
});

test("pausa não processa nem acumula tempo real", () => {
  const clock = new SimulationClock(DEFAULT_CONFIG.time);
  let ticks = 0;

  clock.advance(200, () => { ticks += 1; });
  assert.equal(ticks, 0);

  clock.resume();
  clock.advance(100, () => { ticks += 1; });
  clock.pause();
  clock.advance(10_000, () => { ticks += 1; });
  clock.resume();
  clock.advance(100, () => { ticks += 1; });

  assert.equal(ticks, 6);
});

test("step executa exatamente um tick sem alterar a pausa", () => {
  const clock = new SimulationClock(DEFAULT_CONFIG.time);
  let receivedDt;
  assert.equal(clock.step((dt) => { receivedDt = dt; }), 1);
  assert.equal(receivedDt, 1 / 30);
  assert.equal(clock.paused, true);
});

test("delta real acima de 250 ms é descartado", () => {
  const clock = new SimulationClock(DEFAULT_CONFIG.time);
  let ticks = 0;
  clock.resume();
  assert.equal(clock.advance(1_000, () => { ticks += 1; }), 7);
  assert.equal(ticks, 7);
});

test("modo máximo respeita o orçamento de processamento injetado", () => {
  let fakeTime = 0;
  const clock = new SimulationClock(DEFAULT_CONFIG.time, { now: () => fakeTime });
  let ticks = 0;
  clock.setSpeed("max");
  clock.resume();

  const processed = clock.advance(0, () => {
    ticks += 1;
    fakeTime += 2;
  });

  assert.equal(processed, 4);
  assert.equal(ticks, 4);
});

test("reset limpa frações pendentes e setSpeed rejeita presets ausentes", () => {
  const clock = new SimulationClock(DEFAULT_CONFIG.time);
  let ticks = 0;
  clock.resume();
  clock.advance(20, () => { ticks += 1; });
  clock.reset({ paused: false });
  clock.advance(20, () => { ticks += 1; });
  assert.equal(ticks, 0);
  assert.throws(() => clock.setSpeed(3), /não suportada/);
});

test("pausa solicitada dentro do callback interrompe o lote normal e máximo", () => {
  const normal = new SimulationClock(DEFAULT_CONFIG.time);
  let normalTicks = 0;
  normal.resume();
  const normalProcessed = normal.advance(250, () => {
    normalTicks += 1;
    normal.pause();
  });
  assert.equal(normalProcessed, 1);
  assert.equal(normalTicks, 1);

  let fakeTime = 0;
  const maximum = new SimulationClock(DEFAULT_CONFIG.time, { now: () => fakeTime });
  let maximumTicks = 0;
  maximum.setSpeed("max");
  maximum.resume();
  const maximumProcessed = maximum.advance(0, () => {
    maximumTicks += 1;
    fakeTime += 1;
    maximum.pause();
  });
  assert.equal(maximumProcessed, 1);
  assert.equal(maximumTicks, 1);
});
