import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { request } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { createStaticServer, resolveRequestPath } from "../scripts/serve.mjs";

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function rawRequest(port, path, method = "GET") {
  return new Promise((resolveRequest, rejectRequest) => {
    const outgoing = request({ host: "127.0.0.1", port, path, method }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => resolveRequest({
        body: Buffer.concat(chunks),
        headers: response.headers,
        status: response.statusCode,
      }));
    });
    outgoing.on("error", rejectRequest);
    outgoing.end();
  });
}

test("index usa somente assets relativos e compatíveis com /evo/", async () => {
  const html = await readFile(resolve(PROJECT_ROOT, "index.html"), "utf8");
  const references = [...html.matchAll(/(?:href|src)="([^"]+)"/g)].map((match) => match[1]);

  assert(references.length > 0);
  for (const reference of references) {
    assert(reference.startsWith("./"), `asset não relativo: ${reference}`);
    const resolvedUrl = new URL(reference, "https://example.github.io/evo/");
    assert(resolvedUrl.pathname.startsWith("/evo/"));
    await readFile(resolve(PROJECT_ROOT, reference.slice(2)));
  }
  assert.doesNotMatch(html, /(?:href|src)="https?:\/\//i);
  assert.match(html, /id="random-map-seed"/);
  assert.match(html, /id="initial-food-input"/);
  assert.match(html, /id="initial-food-application-hint"/);
  assert.match(html, /id="spawn-food-input"/);
  assert.match(html, /id="max-food-input"/);
  assert.match(html, /id="max-food-application-hint"/);
  assert.match(html, /id="food-min-energy-input"/);
  assert.match(html, /id="food-max-energy-input"/);
  assert.match(html, /id="food-energy-application-hint"/);
  assert.match(html, /id="food-inactivity-input"/);
  assert.match(html, /id="food-inactivity-application-hint"/);
  assert.match(html, /id="spawn-interval-input"/);
  assert.match(html, /id="generation-duration-input"/);
  assert.match(html, /id="generation-duration-hint"/);
  assert.match(html, /id="balance-controls"/);
  assert.match(html, /id="balance-summary"/);
  assert.match(html, /id="seed-controls"/);
  assert.match(html, /id="population-controls"/);
  assert.match(html, /id="food-controls"/);
  assert.match(html, /id="seed-summary"/);
  assert.match(html, /id="population-summary"/);
  assert.match(html, /id="food-summary"/);
  assert.match(html, /id="food-metric"/);
  assert.match(html, /id="neural-controls"/);
  assert.match(html, /id="hidden-layers-input"/);
  assert.match(html, /id="brain-frequency-select"/);
  assert.match(html, /id="evolution-controls"/);
  assert.match(html, /id="elite-count-input"/);
  assert.match(html, /id="tournament-size-input"/);
  assert.match(html, /id="crossover-parent-a-input"/);
  assert.match(html, /id="mutation-chance-input"/);
  assert.match(html, /id="mutation-stddev-input"/);
  assert.match(html, /id="generation-history-chart"/);
  assert.match(html, /src="\.\/vendor\/chart\.umd\.min\.js"/);
  assert.match(html, /Média Top K global/);
  assert.match(html, /Média Top 10%/);
  assert.match(html, /MM10/);
  assert.match(html, /MM5 s/);
  assert.match(html, /id="history-last50"/);
  assert.match(html, /id="history-all"/);
  assert.match(html, /id="generation-timeline-select"/);
  assert.match(html, /id="generation-timeline-previous"/);
  assert.match(html, /id="generation-timeline-next"/);
  assert.match(html, /<details class="performance-debug" id="performance-debug-panel">/);
  assert.match(html, /id="performance-debug-reset"/);
  assert.match(html, /id="performance-debug-context"/);
  assert.match(html, /id="performance-debug-tables"/);
  assert.doesNotMatch(html, /<details[^>]+id="performance-debug-panel"[^>]+open/);
  const debugPanel = html.match(
    /<details class="performance-debug"[\s\S]*?<\/details>/,
  )?.[0];
  assert(debugPanel);
  assert.doesNotMatch(debugPanel, /aria-live=/);
  for (const chart of [
    "population",
    "food-energy",
    "being-condition",
    "fitness",
    "movement",
    "deaths",
    "food-flow",
  ]) {
    assert.match(html, new RegExp(`id="timeline-${chart}-chart"`));
    assert.match(html, new RegExp(`id="timeline-${chart}-summary"`));
  }
  assert.match(html, /id="total-time-metric"/);
  assert.match(html, /id="completed-generations-metric"/);
  assert.match(html, /id="best-ever-metric"/);
  assert.match(html, /id="camera-zoom-in"/);
  assert.match(html, /id="camera-zoom-out"/);
  assert.match(html, /id="camera-reset"/);
  assert.match(html, /id="follow-being-action"/);
  assert.match(html, /id="follow-best-action"/);
  assert.match(html, /id="population-application-hint"/);
  assert.match(html, /id="selected-being-brain-inputs"/);
  assert.match(html, /id="selected-being-brain-outputs"/);
  assert.match(html, /id="selected-being-feeding"/);
  assert.match(html, /id="selected-being-feeding-food"/);
  assert.match(html, />O que representa</);
  assert.match(html, />Efeito</);
  assert.match(html, /id="food-inspector-details"/);
  assert.match(html, /id="reset-settings-action"/);
  assert.match(html, /Comida — tamanho representa energia/);
  assert.match(html, /Barras do ser — vida e energia/);
  assert.match(html, /Janelas de 5 s/);
  assert.doesNotMatch(html, /name="spawn-food"[^>]*max="100"/);
  assert.doesNotMatch(html, /id="generate-map-action"|>Gerar mapa</);
});

test("barra persistente contém uma única instância dos controles frequentes", async () => {
  const html = await readFile(resolve(PROJECT_ROOT, "index.html"), "utf8");
  const css = await readFile(resolve(PROJECT_ROOT, "styles.css"), "utf8");
  const toolbar = html.match(
    /<section class="execution-toolbar"[\s\S]*?<\/section>/,
  )?.[0];

  assert(toolbar, "barra persistente ausente");
  for (const id of ["speed-select", "primary-action", "pause-action"]) {
    assert.match(toolbar, new RegExp(`id="${id}"`));
    assert.equal(html.match(new RegExp(`id="${id}"`, "g"))?.length, 1);
  }
  assert.doesNotMatch(toolbar, /id="new-action"|id="reset-settings-action"/);
  assert.match(toolbar, /<label[^>]+for="speed-select"/);
  assert.match(toolbar, /aria-describedby="help-speed"/);
  assert.match(toolbar, /id="help-speed" role="tooltip"/);
  assert.match(css, /.execution-toolbar\s*\{[^}]*position:\s*sticky;/s);
  assert.match(css, /top:\s*max\(8px, env\(safe-area-inset-top\)\)/);
});

test("controles são agrupados e mundo precede métricas e gráficos", async () => {
  const html = await readFile(resolve(PROJECT_ROOT, "index.html"), "utf8");
  const groupIds = [
    "seed-controls",
    "population-controls",
    "food-controls",
    "balance-controls",
    "neural-controls",
    "evolution-controls",
  ];

  for (const id of groupIds) {
    assert.match(html, new RegExp(`<details[^>]+id="${id}"`));
  }
  const groupOrder = [
    "population-controls",
    "food-controls",
    "balance-controls",
    "neural-controls",
    "evolution-controls",
    "seed-controls",
  ].map((id) => html.indexOf(`id="${id}"`));
  assert.deepEqual(groupOrder, [...groupOrder].sort((left, right) => left - right));
  const controlPanelIndex = html.indexOf('class="control-panel"');
  const worldIndex = html.indexOf('class="world-panel"');
  const metricsIndex = html.indexOf('class="metrics"');
  const historyIndex = html.indexOf('class="history-panel"');
  const timelineIndex = html.indexOf('class="timeline-panel"');
  const debugIndex = html.indexOf('<details class="performance-debug"');
  assert(controlPanelIndex < worldIndex);
  assert(worldIndex < metricsIndex);
  assert(metricsIndex < historyIndex);
  assert(historyIndex < timelineIndex);
  assert(timelineIndex < debugIndex);
  assert.equal(
    debugIndex,
    Math.max(html.lastIndexOf("<section"), html.lastIndexOf("<details")),
  );
});

test("todas as configurações possuem labels e tooltips acessíveis", async () => {
  const html = await readFile(resolve(PROJECT_ROOT, "index.html"), "utf8");
  const controlIds = [
    "simulation-seed-input", "map-seed-input", "population-input", "initial-food-input",
    "spawn-food-input", "max-food-input", "food-min-energy-input",
    "food-max-energy-input", "food-inactivity-input", "spawn-interval-input",
    "generation-duration-input", "speed-select", "movement-cost-coefficient-input",
    "movement-cost-exponent-input", "turn-cost-input", "basal-metabolism-input",
    "water-movement-cost-input", "zero-energy-damage-input",
    "healing-energy-threshold-input", "healing-energy-per-life-input",
    "healing-max-life-input", "eye-count-input", "eye-fov-input",
    "eye-range-input", "brain-frequency-select", "hidden-layers-input", "activation-select",
    "initial-gene-min-input", "initial-gene-max-input", "gene-min-input", "gene-max-input",
    "elite-count-input", "tournament-size-input", "crossover-parent-a-input",
    "mutation-chance-input", "mutation-stddev-input",
  ];
  for (const id of controlIds) {
    assert.match(html, new RegExp(`<label[^>]+for="${id}"`), `label ausente para ${id}`);
  }

  const tooltipIds = [...html.matchAll(/class="config-tooltip" id="([^"]+)" role="tooltip"/g)]
    .map((match) => match[1]);
  const describedIds = [...html.matchAll(/class="config-help__trigger"[^>]+aria-describedby="([^"]+)"/g)]
    .map((match) => match[1]);
  assert.equal(tooltipIds.length, controlIds.length);
  assert.equal(new Set(tooltipIds).size, tooltipIds.length);
  assert.deepEqual(describedIds.sort(), [...tooltipIds].sort());
});

test("p5.js local mantém o SHA-256 registrado", async () => {
  const library = await readFile(resolve(PROJECT_ROOT, "vendor/p5.min.js"));
  const checksum = createHash("sha256").update(library).digest("hex");
  assert.equal(checksum, "87adc350e8ec0e9bced22d4f03c181bdd208dc997d3956ab3ec2e90537643c9a");
});

test("Chart.js local mantém versão, licença e SHA-256 registrados", async () => {
  const library = await readFile(resolve(PROJECT_ROOT, "vendor/chart.umd.min.js"));
  const sourceMap = await readFile(resolve(PROJECT_ROOT, "vendor/chart.umd.min.js.map"));
  const license = await readFile(resolve(PROJECT_ROOT, "vendor/LICENSE.chartjs.txt"), "utf8");
  assert.equal(
    createHash("sha256").update(library).digest("hex"),
    "48444a82d4edcb5bec0f1965faacdde18d9c17db3063d042abada2f705c9f54a",
  );
  assert.equal(
    createHash("sha256").update(sourceMap).digest("hex"),
    "8c328df49d295935c81d64d3b36d6ac1c20c385f1ba5b4df3ec12a26b3d64d9b",
  );
  assert.match(library.toString("utf8", 0, 100), /Chart\.js v4\.5\.1/);
  assert.match(license, /The MIT License/);
});

test("CSP autoriza somente o estilo exato injetado pelo p5 fixado", async () => {
  const html = await readFile(resolve(PROJECT_ROOT, "index.html"), "utf8");
  const library = await readFile(resolve(PROJECT_ROOT, "vendor/p5.min.js"), "utf8");
  const inlineStyle = "@keyframes p5-loading-spin { to { transform: rotate(360deg); } }";
  const hash = createHash("sha256").update(inlineStyle).digest("base64");

  assert.equal(hash, "PmUnfxNLN1UfoJC2U19QX897emzGgojOx/9QxMkPonw=");
  assert(library.includes(inlineStyle));
  assert.match(html, new RegExp(`style-src 'self' 'sha256-${hash.replaceAll("/", "\\/")}'`));
  assert.doesNotMatch(html, /unsafe-inline/);
});

test("resolvedor bloqueia travessia e arquivos ocultos", () => {
  assert.equal(resolveRequestPath(PROJECT_ROOT, "/../package.json"), null);
  assert.equal(resolveRequestPath(PROJECT_ROOT, "/%2e%2e/package.json"), null);
  assert.equal(resolveRequestPath(PROJECT_ROOT, "/.git/config"), null);
  assert.equal(resolveRequestPath(PROJECT_ROOT, "/%E0%A4%A"), null);
  assert.equal(resolveRequestPath(PROJECT_ROOT, "/"), resolve(PROJECT_ROOT, "index.html"));
});

test("servidor entrega arquivos, MIME, HEAD, 404 e 405 corretamente", async (context) => {
  const server = createStaticServer({ root: PROJECT_ROOT });
  await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  context.after(() => new Promise((resolveClose) => server.close(resolveClose)));

  const address = server.address();
  const index = await rawRequest(address.port, "/");
  const module = await rawRequest(address.port, "/src/main.js");
  const sourceMap = await rawRequest(address.port, "/vendor/chart.umd.min.js.map", "HEAD");
  const head = await rawRequest(address.port, "/styles.css", "HEAD");
  const missing = await rawRequest(address.port, "/nao-existe.js");
  const method = await rawRequest(address.port, "/", "POST");

  assert.equal(index.status, 200);
  assert.match(index.headers["content-type"], /^text\/html/);
  assert.match(index.body.toString("utf8"), /<title>Evo/);
  assert.equal(module.status, 200);
  assert.match(module.headers["content-type"], /^text\/javascript/);
  assert.equal(head.status, 200);
  assert.equal(head.body.length, 0);
  assert.equal(sourceMap.status, 200);
  assert.match(sourceMap.headers["content-type"], /^application\/json/);
  assert.equal(missing.status, 404);
  assert.equal(method.status, 405);
  assert.equal(method.headers.allow, "GET, HEAD");
});
