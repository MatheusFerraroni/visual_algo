export function drawScene(p, state) {
  p.background("#d9cfbf");
  p.stroke("#b8ac98");
  p.strokeWeight(1);
  p.noFill();
  p.rect(0, 0, p.width - 1, p.height - 1);

  p.noStroke();
  p.fill(255, 252, 245, 230);
  p.rect(12, 12, 148, 34, 8);
  p.fill("#1f1a14");
  p.textSize(14);
  p.textAlign(p.LEFT, p.CENTER);
  p.text(`Pontos: ${state.samples.length}`, 24, 29);

  p.noStroke();

  for (const sample of state.samples) {
    p.fill(sample.color ?? "#1f1a14");
    p.circle(sample.x, sample.y, 10);
  }

  for (const centroid of state.centroids) {
    const centroidColor = centroid.color ?? "#c4632f";

    // A bright halo plus dark outline keeps the centroid visible over dense clusters.
    p.noStroke();
    p.fill(255, 250, 242, 235);
    p.circle(centroid.x, centroid.y, 28);

    p.stroke("#1f1a14");
    p.strokeWeight(5);
    p.noFill();
    p.circle(centroid.x, centroid.y, 22);
    p.line(centroid.x - 13, centroid.y, centroid.x + 13, centroid.y);
    p.line(centroid.x, centroid.y - 13, centroid.x, centroid.y + 13);

    p.stroke(centroidColor);
    p.strokeWeight(3);
    p.circle(centroid.x, centroid.y, 22);
    p.line(centroid.x - 13, centroid.y, centroid.x + 13, centroid.y);
    p.line(centroid.x, centroid.y - 13, centroid.x, centroid.y + 13);

    p.noStroke();
    p.fill(centroidColor);
    p.circle(centroid.x, centroid.y, 6);
  }
}
