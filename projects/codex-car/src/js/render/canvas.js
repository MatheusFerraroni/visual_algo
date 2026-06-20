// Desenho do canvas principal e HUD visual.
function updateFollowLeaderCamera(targetVehicle) {
  if (!state.view.followLeader || !targetVehicle) return;
  state.view.panX = width * 0.5 - targetVehicle.pos.x * state.view.zoom;
  state.view.panY = height * 0.5 - targetVehicle.pos.y * state.view.zoom;
}

function drawTrack() {
  if (!state.track) return;
  noFill();
  strokeWeight(3);

  stroke(72, 187, 255, 230);
  drawClosedPolyline(state.track.outer);
  stroke(245, 158, 11, 230);
  drawClosedPolyline(state.track.inner);

  if (state.trackGeom && state.ui.showCheckpoints.value === "true") {
    stroke(148, 163, 184, 45);
    strokeWeight(1.3);
    for (let i = 0; i < state.trackGeom.checkpoints.length; i += 3) {
      const cp = state.trackGeom.checkpoints[i];
      line(cp.a.x, cp.a.y, cp.b.x, cp.b.y);
    }

    stroke(42, 242, 199, 115);
    strokeWeight(1.2);
    drawClosedPolyline(state.trackGeom.centerline);
  }

  if (state.trackGeom && state.trackGeom.startLine) {
    stroke(16, 185, 129);
    strokeWeight(4);
    line(
      state.trackGeom.startLine.a.x,
      state.trackGeom.startLine.a.y,
      state.trackGeom.startLine.b.x,
      state.trackGeom.startLine.b.y
    );
  }

  push();
  translate(state.track.start.x, state.track.start.y);
  rotate(state.track.start.angle);
  stroke(14, 165, 233);
  fill(14, 165, 233, 60);
  line(-8, 0, 24, 0);
  line(24, 0, 12, -7);
  line(24, 0, 12, 7);
  circle(0, 0, 8);
  pop();

  if (isEditorEnabled()) {
    drawVertices(state.track.outer, color(72, 187, 255), state.editor.mode === "outer");
    drawVertices(state.track.inner, color(245, 158, 11), state.editor.mode === "inner");
  }
  drawBestStopMarker();
}

// Marca onde o melhor carro da geração anterior terminou.
function drawBestStopMarker() {
  const marker = state.sim.bestStopMarker;
  if (!marker || !state.trackGeom) return;

  const progressPct = (marker.bestProgress / state.trackGeom.totalLength) * 100;
  const markerScreen = worldToScreenPoint(marker.x, marker.y);
  push();
  stroke(248, 113, 113);
  strokeWeight(2);
  fill(248, 113, 113, 85);
  circle(marker.x, marker.y, 26);
  line(marker.x - 10, marker.y, marker.x + 10, marker.y);
  line(marker.x, marker.y - 10, marker.x, marker.y + 10);

  const label = [
    `Melhor parada G${marker.generation}`,
    `${formatNumber(progressPct, 1)}% da pista em ${formatNumber(marker.age, 1)}s`
  ];
  const boxW = 220;
  const boxH = 38;

  // A âncora do marcador fica no mundo, mas a caixa deve ser posicionada e
  // limitada no espaço da tela para continuar correta com zoom/pan ativos.
  push();
  resetMatrix();
  const boxX = clamp(markerScreen.x + 16, 8, width - boxW - 8);
  const boxY = clamp(markerScreen.y - 36, 8, height - boxH - 8);
  noStroke();
  fill(10, 19, 33, 220);
  rect(boxX, boxY, boxW, boxH, 8);
  fill(226, 232, 240);
  textSize(11);
  textAlign(LEFT, TOP);
  text(label[0], boxX + 8, boxY + 6);
  text(label[1], boxX + 8, boxY + 20);
  pop();
  pop();
}

function drawClosedPolyline(points) {
  if (!points || points.length === 0) return;
  beginShape();
  for (const point of points) {
    vertex(point.x, point.y);
  }
  endShape(CLOSE);
}

function drawVertices(points, col, emphasize) {
  for (const point of points) {
    noStroke();
    fill(red(col), green(col), blue(col), emphasize ? 240 : 150);
    circle(point.x, point.y, emphasize ? 9 : 6);
  }
}

function drawVehicle(vehicle, isBest, isInspected) {
  push();
  translate(vehicle.pos.x, vehicle.pos.y);
  rotate(vehicle.angle);
  if (isInspected) {
    stroke(250, 204, 21, 230);
    strokeWeight(2.2);
  } else {
    noStroke();
  }

  const bodyColor = vehicle.alive
    ? (
        isInspected
          ? color(250, 204, 21, 240)
          : isBest
            ? color(34, 197, 94)
            : color(148, 163, 184, 210)
      )
    : (isInspected ? color(251, 191, 36, 175) : color(239, 68, 68, 90));

  const wheelColor = color(15, 23, 42, vehicle.alive ? 235 : 120);
  rectMode(CENTER);

  // Corpo mais próximo de um carro visto de cima: chassi, cabine e rodas.
  noStroke();
  fill(wheelColor);
  rect(-9.5, -6.5, 7.2, 4.2, 1.2);
  rect(-9.5, 6.5, 7.2, 4.2, 1.2);
  rect(9.5, -6.5, 7.2, 4.2, 1.2);
  rect(9.5, 6.5, 7.2, 4.2, 1.2);

  if (isInspected) {
    stroke(250, 204, 21, 230);
    strokeWeight(2.2);
  } else {
    noStroke();
  }
  fill(bodyColor);
  rect(0, 0, 28, 14, 4.5);

  noStroke();
  fill(226, 232, 240, vehicle.alive ? 215 : 90);
  rect(-3.5, 0, 11, 10, 3.2);

  fill(14, 165, 233, vehicle.alive ? 225 : 90);
  rect(11.2, 0, 4.2, 8.5, 2.3);

  fill(248, 250, 252, vehicle.alive ? 220 : 90);
  circle(12.5, 0, 2.3);

  if (isInspected) {
    noFill();
    stroke(250, 204, 21, 110);
    strokeWeight(1.6);
    circle(0, 0, 34);
  }
  pop();
}

function drawSensors(vehicle) {
  if (!vehicle || state.ui.showSensorsFor.value === "none") return;
  stroke(56, 189, 248, 170);
  strokeWeight(1.3);
  for (const hit of vehicle.sensorHits) {
    line(vehicle.pos.x, vehicle.pos.y, hit.x, hit.y);
    noStroke();
    fill(56, 189, 248);
    circle(hit.x, hit.y, 4);
    stroke(56, 189, 248, 170);
  }
}

function drawInspectionGuide(inspectState) {
  if (!inspectState || !inspectState.vehicle) return;

  const vehicleScreen = worldToScreenPoint(inspectState.vehicle.pos.x, inspectState.vehicle.pos.y);
  const startPoint = insideCanvas(mouseX, mouseY)
    ? { x: mouseX, y: mouseY }
    : (state.inspect.panelAnchor || vehicleScreen);

  push();
  stroke(250, 204, 21, 230);
  strokeWeight(1.6);
  drawingContext.setLineDash([7, 5]);
  line(startPoint.x, startPoint.y, vehicleScreen.x, vehicleScreen.y);
  drawingContext.setLineDash([]);
  noStroke();
  fill(250, 204, 21, 235);
  circle(startPoint.x, startPoint.y, 8);
  circle(vehicleScreen.x, vehicleScreen.y, 9);
  pop();
}

// HUD simples com modo de edição, FPS e zoom atual.
function drawOverlay() {
  noStroke();
  fill(226, 232, 240, 180);
  textSize(13);
  textAlign(LEFT, TOP);
  const modeLabel = isEditorEnabled()
    ? {
        outer: "Editando parede externa",
        inner: "Editando parede interna",
        start: "Editando largada e direção"
      }[state.editor.mode]
    : "Editor de pista desativado";
  text(modeLabel, 14, 14);
  text(`FPS ${formatNumber(state.renderFps, 1)}`, 14, 32);
  text(`Zoom ${formatNumber(state.view.zoom * 100, 0)}%`, 14, 50);

  if (state.sim.architectureChangedNotice) {
    fill(251, 191, 36);
    text("Arquitetura alterada: reinicie a evolução para aplicar o novo formato da rede.", 14, 68);
  }
}

// Hook do p5 para criar o canvas.
function setup() {
  const holder = $("canvas-holder");
  const canvas = createCanvas(holder.clientWidth, holder.clientHeight);
  canvas.parent("canvas-holder");
  canvas.elt.oncontextmenu = () => false;
  state.canvasReady = true;
  resetSimulationClock(Date.now());
  startBackgroundSimulationLoop();
  updateStats();
}

function windowResized() {
  if (!state.canvasReady) return;
  const holder = $("canvas-holder");
  resizeCanvas(holder.clientWidth, holder.clientHeight);
}

// Hook do p5 chamado a cada frame quando a renderização está ligada.
function draw() {
  if (!state.renderEnabled) return;
  profilerMeasure("render.draw.total", () => {
    state.renderFps = lerp(state.renderFps, frameRate(), 0.15);
    syncCanvasInteractionClasses();
    const inspectState = profilerMeasure("render.resolveInspection", () => resolveVehicleInspectionState());
    const inspectedVehicle = inspectState?.vehicle || null;
    const bestVehicle = bestVehicleCurrentGeneration();
    updateFollowLeaderCamera(bestVehicle);

    background(9, 17, 31);

    noStroke();
    fill(15, 23, 42, 150);
    rect(0, 0, width, height);

    push();
    translate(state.view.panX, state.view.panY);
    scale(state.view.zoom);
    profilerMeasure("render.drawTrack", () => {
      drawTrack();
    });

    profilerMeasure("render.drawVehicles", () => {
      if (state.sim.vehicles.length > 0) {
        for (const vehicle of state.sim.vehicles) {
          drawVehicle(vehicle, vehicle === bestVehicle, vehicle === inspectedVehicle);
        }
      }
    });
    profilerMeasure("render.drawSensors", () => {
      drawSensors(bestVehicle);
    });
    pop();

    profilerIncrement("render.frames");
    profilerObserveMax("render.fpsPeak", state.renderFps);
    profilerMeasure("render.drawInspectionGuide", () => {
      drawInspectionGuide(inspectState);
    });
    updateVehicleHoverPanel(inspectState);
    profilerMeasure("render.drawOverlay", () => {
      drawOverlay();
    });
  });
}

function keyPressed() {
  if (keyCode === 32) {
    state.input.spacePressed = true;
  }
  if (keyCode === SHIFT) {
    state.input.shiftPressed = true;
  }
  syncCanvasInteractionClasses();
  return true;
}

function keyReleased() {
  if (keyCode === 32) {
    state.input.spacePressed = false;
  }
  if (keyCode === SHIFT) {
    state.input.shiftPressed = false;
  }
  syncCanvasInteractionClasses();
  return true;
}
