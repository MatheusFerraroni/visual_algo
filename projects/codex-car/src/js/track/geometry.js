// Geometria da pista: paredes, centerline, projeções e utilidades espaciais.
function distanceSq(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function pointInPolygon(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    const intersect =
      yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / ((yj - yi) || 1e-9) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function distancePointToSegment(point, a, b) {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const apx = point.x - a.x;
  const apy = point.y - a.y;
  const abLenSq = abx * abx + aby * aby || 1e-9;
  const t = clamp((apx * abx + apy * aby) / abLenSq, 0, 1);
  const closestX = a.x + abx * t;
  const closestY = a.y + aby * t;
  const dx = point.x - closestX;
  const dy = point.y - closestY;
  return {
    distance: Math.hypot(dx, dy),
    t,
    point: { x: closestX, y: closestY }
  };
}

function raySegmentIntersection(origin, dir, a, b) {
  const v1x = origin.x - a.x;
  const v1y = origin.y - a.y;
  const v2x = b.x - a.x;
  const v2y = b.y - a.y;
  const cross = dir.x * v2y - dir.y * v2x;
  if (Math.abs(cross) < 1e-8) return null;
  const t = (v2x * v1y - v2y * v1x) / cross;
  const u = (dir.x * v1y - dir.y * v1x) / cross;
  if (t >= 0 && u >= 0 && u <= 1) {
    return {
      distance: t,
      point: {
        x: origin.x + dir.x * t,
        y: origin.y + dir.y * t
      }
    };
  }
  return null;
}

function buildSegments(points) {
  const segments = [];
  for (let i = 0; i < points.length; i++) {
    segments.push({
      a: points[i],
      b: points[(i + 1) % points.length]
    });
  }
  return segments;
}

function perimeter(points) {
  let total = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    total += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return total;
}

function resampleClosed(points, count) {
  if (points.length < 2) return clonePoints(points);
  const total = perimeter(points);
  const samples = [];
  for (let i = 0; i < count; i++) {
    const target = (i / count) * total;
    let walked = 0;
    for (let s = 0; s < points.length; s++) {
      const a = points[s];
      const b = points[(s + 1) % points.length];
      const segLen = Math.hypot(b.x - a.x, b.y - a.y);
      if (walked + segLen >= target) {
        const t = segLen > 0 ? (target - walked) / segLen : 0;
        samples.push({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) });
        break;
      }
      walked += segLen;
    }
  }
  return samples;
}

function rotateArray(arr, offset) {
  const out = [];
  for (let i = 0; i < arr.length; i++) {
    out.push(arr[(i + offset + arr.length) % arr.length]);
  }
  return out;
}

function reverseClosedArray(points) {
  return points.slice().reverse();
}

function normalizeVector(x, y) {
  const length = Math.hypot(x, y) || 1e-9;
  return { x: x / length, y: y / length };
}

function tangentAtClosedSample(points, index) {
  const prev = points[(index - 1 + points.length) % points.length];
  const next = points[(index + 1) % points.length];
  return normalizeVector(next.x - prev.x, next.y - prev.y);
}

function inwardNormalAtClosedSample(points, index, turnSign = polygonArea(points) >= 0 ? 1 : -1) {
  const tangent = tangentAtClosedSample(points, index);
  return turnSign > 0
    ? { x: -tangent.y, y: tangent.x }
    : { x: tangent.y, y: -tangent.x };
}

function nearestIndex(points, target) {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < points.length; i++) {
    const d = distanceSq(points[i], target);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}

function cumulativeClosedLengths(points) {
  const cum = [0];
  let total = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    total += Math.hypot(b.x - a.x, b.y - a.y);
    cum.push(total);
  }
  return { cum, total };
}

function pointOnClosedPath(points, cumulative, s) {
  const total = cumulative.total || 1;
  let target = s % total;
  if (target < 0) target += total;
  for (let i = 0; i < points.length; i++) {
    const start = cumulative.cum[i];
    const end = cumulative.cum[i + 1];
    if (target >= start && target <= end) {
      const segLen = end - start || 1e-9;
      const t = (target - start) / segLen;
      const a = points[i];
      const b = points[(i + 1) % points.length];
      return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), index: i };
    }
  }
  return clonePoint(points[0]);
}

function tangentOnClosedPath(points, cumulative, s) {
  const anchor = pointOnClosedPath(points, cumulative, s);
  const next = pointOnClosedPath(points, cumulative, s + 8);
  return Math.atan2(next.y - anchor.y, next.x - anchor.x);
}

function projectPointToClosedPolyline(point, points, cumulative) {
  let best = {
    distance: Infinity,
    s: 0,
    index: 0,
    point: clonePoint(points[0])
  };
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const hit = distancePointToSegment(point, a, b);
    if (hit.distance < best.distance) {
      const segLen = Math.hypot(b.x - a.x, b.y - a.y);
      best = {
        distance: hit.distance,
        s: cumulative.cum[i] + segLen * hit.t,
        index: i,
        point: hit.point
      };
    }
  }
  return best;
}

function wrapProgressDelta(delta, totalLength) {
  let d = delta;
  if (d > totalLength / 2) d -= totalLength;
  if (d < -totalLength / 2) d += totalLength;
  return d;
}

function smoothClosedPoints(points, passes = 2, blend = 0.5) {
  if (!Array.isArray(points) || points.length < 3) {
    return clonePoints(points || []);
  }

  let current = clonePoints(points);
  for (let pass = 0; pass < passes; pass++) {
    current = current.map((point, index) => {
      const prev = current[(index - 1 + current.length) % current.length];
      const next = current[(index + 1) % current.length];
      const neighborAverage = {
        x: (prev.x + next.x) * 0.5,
        y: (prev.y + next.y) * 0.5
      };
      return {
        x: lerp(point.x, neighborAverage.x, blend),
        y: lerp(point.y, neighborAverage.y, blend)
      };
    });
  }
  return current;
}

function pointOnSegmentAt(a, b, t) {
  return {
    x: lerp(a.x, b.x, t),
    y: lerp(a.y, b.y, t)
  };
}

function constrainPointToCheckpointBand(point, checkpoint, minT = 0.28, maxT = 0.72) {
  const hit = distancePointToSegment(point, checkpoint.a, checkpoint.b);
  const clampedT = clamp(hit.t, minT, maxT);
  return pointOnSegmentAt(checkpoint.a, checkpoint.b, clampedT);
}

function pointInsideTrackSamples(point, outerPoints, innerPoints) {
  return pointInPolygon(point, outerPoints) && !pointInPolygon(point, innerPoints);
}

function smoothCenterlineWithinTrack(checkpoints, outerPoints, innerPoints, passes = 2, blend = 0.45) {
  if (!Array.isArray(checkpoints) || checkpoints.length < 3) {
    return checkpoints.map(checkpoint => clonePoint(checkpoint.center));
  }

  let current = checkpoints.map(checkpoint => clonePoint(checkpoint.center));
  const rawCenters = checkpoints.map(checkpoint => clonePoint(checkpoint.center));

  for (let pass = 0; pass < passes; pass++) {
    current = current.map((point, index) => {
      const prev = current[(index - 1 + current.length) % current.length];
      const next = current[(index + 1) % current.length];
      const neighborAverage = {
        x: (prev.x + next.x) * 0.5,
        y: (prev.y + next.y) * 0.5
      };
      const smoothedCandidate = {
        x: lerp(point.x, neighborAverage.x, blend),
        y: lerp(point.y, neighborAverage.y, blend)
      };
      const constrained = constrainPointToCheckpointBand(smoothedCandidate, checkpoints[index]);
      return pointInsideTrackSamples(constrained, outerPoints, innerPoints)
        ? constrained
        : rawCenters[index];
    });
  }

  return current;
}

function nearestRayDistance(origin, angle, segments, maxDist) {
  const dir = { x: Math.cos(angle), y: Math.sin(angle) };
  let best = {
    distance: maxDist,
    point: {
      x: origin.x + dir.x * maxDist,
      y: origin.y + dir.y * maxDist
    }
  };
  for (const segment of segments) {
    const hit = raySegmentIntersection(origin, dir, segment.a, segment.b);
    if (hit && hit.distance < best.distance) {
      best = hit;
    }
  }
  return best;
}

function nearestRayHitOnSegments(origin, dir, segments, maxDist = 4000) {
  let best = null;
  for (const segment of segments) {
    const hit = raySegmentIntersection(origin, dir, segment.a, segment.b);
    if (!hit || hit.distance > maxDist) continue;
    if (!best || hit.distance < best.distance) {
      best = hit;
    }
  }
  return best;
}

function minDistanceToWalls(point, segments) {
  let best = Infinity;
  for (const segment of segments) {
    const hit = distancePointToSegment(point, segment.a, segment.b);
    if (hit.distance < best) best = hit.distance;
  }
  return best;
}

function buildStartLine(start, segments) {
  const normalAngle = start.angle + Math.PI / 2;
  const left = nearestRayDistance(start, normalAngle, segments, 500);
  const right = nearestRayDistance(start, normalAngle + Math.PI, segments, 500);
  return {
    a: left.point,
    b: right.point
  };
}

function buildTrackDirectionCandidate(outerSample, innerSample, startPoint) {
  const rotatedOuter = rotateArray(outerSample, nearestIndex(outerSample, startPoint));
  const rotatedInner = rotateArray(innerSample, nearestIndex(innerSample, startPoint));
  const innerSegments = buildSegments(rotatedInner);
  const outerTurnSign = polygonArea(rotatedOuter) >= 0 ? 1 : -1;
  const checkpoints = rotatedOuter.map((outerPoint, i) => {
    const inwardNormal = inwardNormalAtClosedSample(rotatedOuter, i, outerTurnSign);
    const rayOrigin = {
      x: outerPoint.x + inwardNormal.x * 0.5,
      y: outerPoint.y + inwardNormal.y * 0.5
    };

    // Em vez de assumir que outer[i] casa com inner[i], procuramos a parede
    // oposta pela normal local da pista. Isso reduz cruzamentos da centerline
    // em curvas fechadas e em chicanes mais agressivas.
    const hit =
      nearestRayHitOnSegments(rayOrigin, inwardNormal, innerSegments) ||
      nearestRayHitOnSegments(rayOrigin, { x: -inwardNormal.x, y: -inwardNormal.y }, innerSegments);
    const innerPoint = hit ? hit.point : rotatedInner[nearestIndex(rotatedInner, outerPoint)];
    return {
      a: outerPoint,
      b: innerPoint,
      center: {
        x: (outerPoint.x + innerPoint.x) * 0.5,
        y: (outerPoint.y + innerPoint.y) * 0.5
      }
    };
  });
  // Suavizamos a linha central, mas sem deixar cada ponto fugir da sua seção
  // transversal da pista. Isso reduz zigue-zagues sem empurrar a centerline
  // para fora da pista em curvas mais fechadas.
  const centerline = smoothCenterlineWithinTrack(
    checkpoints,
    rotatedOuter,
    rotatedInner,
    2,
    0.45
  );
  for (let i = 0; i < checkpoints.length; i++) {
    checkpoints[i].center = centerline[i];
  }
  const cumulative = cumulativeClosedLengths(centerline);
  const startProjection = projectPointToClosedPolyline(startPoint, centerline, cumulative);

  return {
    outerSample: rotatedOuter,
    innerSample: rotatedInner,
    centerline,
    cumulative,
    checkpoints,
    startS: startProjection.s,
    startHeading: tangentOnClosedPath(centerline, cumulative, startProjection.s)
  };
}

// Gera paredes, checkpoints e centerline a partir do traçado desenhado.
function buildTrackGeometry(track) {
  return profilerMeasure("track.buildGeometry", () => {
    if (!track || track.outer.length < 3 || track.inner.length < 3) return null;
    let outer = clonePoints(track.outer);
    let inner = clonePoints(track.inner);

  // Mantemos o mesmo sentido de percurso nas duas bordas para que a linha central
  // possa ser estimada pela média entre amostras correspondentes.
  if (polygonArea(outer) * polygonArea(inner) < 0) {
    inner.reverse();
  }

  const sampleCount = 120;
  const outerSample = resampleClosed(outer, sampleCount);
  const innerSample = resampleClosed(inner, sampleCount);
  const startPoint = { x: track.start.x, y: track.start.y };
  const walls = [...buildSegments(outer), ...buildSegments(inner)];
  const forwardCandidate = buildTrackDirectionCandidate(outerSample, innerSample, startPoint);
  const reverseCandidate = buildTrackDirectionCandidate(
    reverseClosedArray(outerSample),
    reverseClosedArray(innerSample),
    startPoint
  );

  // A pista é fechada e o desenho do usuário não garante um sentido "correto".
  // Então comparamos as duas ordens possíveis da linha central e escolhemos a que
  // melhor combina com o heading de largada definido pelo usuário.
  const startHeading = normalizeAngle(track.start.angle);
  const forwardError = Math.abs(signedAngleDiff(forwardCandidate.startHeading, startHeading));
  const reverseError = Math.abs(signedAngleDiff(reverseCandidate.startHeading, startHeading));
  const chosen = forwardError <= reverseError ? forwardCandidate : reverseCandidate;

    return {
      outer,
      inner,
      walls,
      outerSample: chosen.outerSample,
      innerSample: chosen.innerSample,
      centerline: chosen.centerline,
      cumulative: chosen.cumulative,
      checkpoints: chosen.checkpoints,
      totalLength: chosen.cumulative.total,
      startLine: buildStartLine(track.start, walls),
      startS: chosen.startS,
      startHeading: chosen.startHeading,
      progressDirection: forwardError <= reverseError ? "forward" : "reverse",
      contains(point) {
        return pointInPolygon(point, outer) && !pointInPolygon(point, inner);
      }
    };
  });
}

// Preset principal: circuito mais complexo, inspirado em autódromo.
function barcelonaCatalunyaTrackData() {
  return {
    "version": 1,
    "name": "Circuito Barcelona-Catalunya",
    "presetId": "barcelona-catalunya",
    "outer": [
        {
            "x": 954.2001308044473,
            "y": 50.46267857142857
        },
        {
            "x": 412.96608526629353,
            "y": 31.833443006716312
        },
        {
            "x": 369.05497415518244,
            "y": 36.05566522893854
        },
        {
            "x": 326.8327519329602,
            "y": 48.7223318956052
        },
        {
            "x": 287.1438630440713,
            "y": 60.544554117827424
        },
        {
            "x": 255.66121648136033,
            "y": 74.94267857142856
        },
        {
            "x": 205.23275193296018,
            "y": 91.78899856227187
        },
        {
            "x": 160.47719637740462,
            "y": 123.03344300671633
        },
        {
            "x": 135.98830748851574,
            "y": 149.2112207844941
        },
        {
            "x": 108.70634401569653,
            "y": 174.90267857142857
        },
        {
            "x": 77.72164082184908,
            "y": 215.9223318956052
        },
        {
            "x": 45.63275193296019,
            "y": 257.30010967338296
        },
        {
            "x": 28.289873880454095,
            "y": 301.33441409674225
        },
        {
            "x": 19.84542943600965,
            "y": 351.1566363189645
        },
        {
            "x": 34.222367560497055,
            "y": 415.62267857142854
        },
        {
            "x": 60.378762769342984,
            "y": 486.26774743007564
        },
        {
            "x": 80.64542943600965,
            "y": 525.9566363189645
        },
        {
            "x": 126.8240680183126,
            "y": 564.5426785714286
        },
        {
            "x": 174.37876276934298,
            "y": 589.2899696522978
        },
        {
            "x": 251.63505559189014,
            "y": 621.6626785714285
        },
        {
            "x": 301.8898738804541,
            "y": 642.4899696522979
        },
        {
            "x": 343.16770701077905,
            "y": 657.2329749850323
        },
        {
            "x": 376.9454847885568,
            "y": 674.1218638739214
        },
        {
            "x": 400.6898738804541,
            "y": 697.3788585411867
        },
        {
            "x": 411.6676516582319,
            "y": 738.7566363189644
        },
        {
            "x": 423.4898738804541,
            "y": 777.601080763409
        },
        {
            "x": 432.812295618051,
            "y": 825.6626785714285
        },
        {
            "x": 457.2676516582319,
            "y": 881.4677474300756
        },
        {
            "x": 488.51209610267637,
            "y": 915.2455252078533
        },
        {
            "x": 534.1120961026763,
            "y": 938.0455252078534
        },
        {
            "x": 600.8232072137874,
            "y": 949.0233029856312
        },
        {
            "x": 2860.587311968607,
            "y": 946.0226785714285
        },
        {
            "x": 2927.083241290759,
            "y": 935.8501377737136
        },
        {
            "x": 2983.385219097449,
            "y": 903.1826785714285
        },
        {
            "x": 3016.4420581929594,
            "y": 851.4556995883017
        },
        {
            "x": 3037.7383911052975,
            "y": 784.8626785714285
        },
        {
            "x": 3048.214081980409,
            "y": 679.6881959874047
        },
        {
            "x": 3051.829954218443,
            "y": 580.8626785714284
        },
        {
            "x": 3033.7122302158273,
            "y": 315.66267857142856
        },
        {
            "x": 3030.853758349358,
            "y": 276.09920819017424
        },
        {
            "x": 3008.8982027938023,
            "y": 244.85476374572977
        },
        {
            "x": 2986.098202793802,
            "y": 220.3658748568409
        },
        {
            "x": 2952.3204250160243,
            "y": 207.69920819017423
        },
        {
            "x": 2621.6024077096704,
            "y": 88.51828558919485
        },
        {
            "x": 2582.7406608793317,
            "y": 72.74830136818782
        },
        {
            "x": 2535.993921938489,
            "y": 72.185087646009
        },
        {
            "x": 2505.580380940833,
            "y": 78.94365231215487
        },
        {
            "x": 2470.661130165746,
            "y": 96.40327769969835
        },
        {
            "x": 2440.8315326532274,
            "y": 114.01899051322319
        },
        {
            "x": 2425.0494988658647,
            "y": 137.9174988198011
        },
        {
            "x": 2408.8165498274343,
            "y": 157.75776986677144
        },
        {
            "x": 2399.7982448060843,
            "y": 182.55810867548436
        },
        {
            "x": 2392.583600789004,
            "y": 205.10387122885973
        },
        {
            "x": 2388.5253635293966,
            "y": 224.94414227583007
        },
        {
            "x": 2381.761634763384,
            "y": 252.90088784201555
        },
        {
            "x": 2392.583600789004,
            "y": 277.250311399661
        },
        {
            "x": 2409.2708344482544,
            "y": 296.90736279535906
        },
        {
            "x": 2426.730459835798,
            "y": 309.29806468329315
        },
        {
            "x": 2448.695795000772,
            "y": 328.44733123737313
        },
        {
            "x": 2470.661130165746,
            "y": 345.3437429027378
        },
        {
            "x": 2497.6953888303296,
            "y": 361.67694084592364
        },
        {
            "x": 2521.913578884019,
            "y": 376.320497622573
        },
        {
            "x": 2550.07426499296,
            "y": 380.26299367782474
        },
        {
            "x": 2585.5292020314396,
            "y": 381.2417522658132
        },
        {
            "x": 2622.9870916826912,
            "y": 382.4992081901742
        },
        {
            "x": 2659.2792674950947,
            "y": 389.10267857142856
        },
        {
            "x": 2688.556533464083,
            "y": 404.34940928548605
        },
        {
            "x": 2715.3269033665497,
            "y": 421.6094584226656
        },
        {
            "x": 2737.922225786265,
            "y": 444.73952118545327
        },
        {
            "x": 2756.9366927897668,
            "y": 479.9873719418061
        },
        {
            "x": 2765.6312756543193,
            "y": 509.1763287013763
        },
        {
            "x": 2769.9986919555263,
            "y": 540.0626785714285
        },
        {
            "x": 2773.0837752525076,
            "y": 567.5542422205167
        },
        {
            "x": 2773.0837752525076,
            "y": 597.3642406132693
        },
        {
            "x": 2769.978567086596,
            "y": 625.9321557396572
        },
        {
            "x": 2757.9202092871155,
            "y": 648.1826785714285
        },
        {
            "x": 2748.863151558396,
            "y": 663.1946537305978
        },
        {
            "x": 2735.3888888841443,
            "y": 673.4783524676633
        },
        {
            "x": 2719.6741947988257,
            "y": 682.4469443592506
        },
        {
            "x": 2703.5670372792674,
            "y": 686.9426785714285
        },
        {
            "x": 2681.1696135415204,
            "y": 686.1731941583446
        },
        {
            "x": 2660.2333333285887,
            "y": 679.3894635787743
        },
        {
            "x": 2602.8111111063668,
            "y": 656.5894635787744
        },
        {
            "x": 2493.6223136280128,
            "y": 590.5223781271707
        },
        {
            "x": 2300.9509483322436,
            "y": 462.54267857142855
        },
        {
            "x": 1956.7141922825376,
            "y": 248.34267857142856
        },
        {
            "x": 1757.4192282537606,
            "y": 140.2226785714286
        },
        {
            "x": 1711.8827342976679,
            "y": 107.02413509059696
        },
        {
            "x": 1674.8829300196205,
            "y": 91.26267857142857
        },
        {
            "x": 1635.8827342976679,
            "y": 79.1574684239303
        },
        {
            "x": 1591.9716231865568,
            "y": 85.06857953504141
        },
        {
            "x": 1551.4382898532235,
            "y": 97.73524620170808
        },
        {
            "x": 1517.6605120754457,
            "y": 107.8685795350414
        },
        {
            "x": 1483.8827342976679,
            "y": 135.73524620170807
        },
        {
            "x": 1460.2382898532235,
            "y": 159.3796906461525
        },
        {
            "x": 1407.1432308698495,
            "y": 236.10267857142856
        },
        {
            "x": 1356.00800645464,
            "y": 289.53231722561253
        },
        {
            "x": 1293.7100621208572,
            "y": 369.31740382852746
        },
        {
            "x": 1238.0444735120993,
            "y": 482.94267857142853
        },
        {
            "x": 1213.8875081752778,
            "y": 548.2226785714286
        },
        {
            "x": 1201.809025506867,
            "y": 633.9026785714285
        },
        {
            "x": 1198.6237260324515,
            "y": 680.8071254974419
        },
        {
            "x": 1182.658224840863,
            "y": 713.2267843208083
        },
        {
            "x": 1157.091763143263,
            "y": 736.5473914803002
        },
        {
            "x": 1127.5822105641025,
            "y": 755.1274801412532
        },
        {
            "x": 1089.0765206017004,
            "y": 766.5026785714285
        },
        {
            "x": 983.3693359519742,
            "y": 768.9601176541416
        },
        {
            "x": 891.7946370176586,
            "y": 756.3026785714286
        },
        {
            "x": 724.7089601046436,
            "y": 715.5026785714285
        },
        {
            "x": 577.7540876389797,
            "y": 615.5426785714285
        },
        {
            "x": 509.6867834075442,
            "y": 570.3691999108181
        },
        {
            "x": 451.4201167408775,
            "y": 519.7025332441515
        },
        {
            "x": 418.48678340754424,
            "y": 480.01364435526256
        },
        {
            "x": 399.9090056297664,
            "y": 451.30253324415145
        },
        {
            "x": 396.53122785198866,
            "y": 415.8358665774848
        },
        {
            "x": 412.57567229643314,
            "y": 386.2803110219292
        },
        {
            "x": 438.85153695225637,
            "y": 366.66267857142856
        },
        {
            "x": 501.24233896309977,
            "y": 362.6358665774848
        },
        {
            "x": 591.5978945186553,
            "y": 375.30253324415145
        },
        {
            "x": 667.5978945186553,
            "y": 376.14697768859594
        },
        {
            "x": 730.7482014388489,
            "y": 370.74267857142854
        },
        {
            "x": 907.8992805755395,
            "y": 350.34267857142856
        },
        {
            "x": 977.5090056297663,
            "y": 322.9469776885959
        },
        {
            "x": 1022.6448659254413,
            "y": 299.34267857142856
        },
        {
            "x": 1057.7312278519887,
            "y": 248.6358665774848
        },
        {
            "x": 1073.7756722964332,
            "y": 215.70253324415145
        },
        {
            "x": 1074.9849574885545,
            "y": 185.10267857142856
        },
        {
            "x": 1082.2201167408775,
            "y": 142.2358665774848
        },
        {
            "x": 1072.9718770438194,
            "y": 107.58267857142857
        },
        {
            "x": 1051.8201167408777,
            "y": 78.90253324415147
        },
        {
            "x": 1019.7312278519887,
            "y": 63.702533244151475
        },
        {
            "x": 987.6423389630997,
            "y": 51.03586657748481
        }
    ],
    "inner": [
        {
            "x": 612.890583555276,
            "y": 893.324776060719
        },
        {
            "x": 582.270116306864,
            "y": 889.3674223134352
        },
        {
            "x": 541.7367829735307,
            "y": 870.7896445356574
        },
        {
            "x": 513.0256718624195,
            "y": 842.9229778689908
        },
        {
            "x": 497.0586723281034,
            "y": 805.3438630431664
        },
        {
            "x": 491.07011630686395,
            "y": 765.2340889801019
        },
        {
            "x": 489.38122741797514,
            "y": 728.0785334245462
        },
        {
            "x": 480.9367829735307,
            "y": 690.9229778689908
        },
        {
            "x": 441.24789408464176,
            "y": 645.3229778689907
        },
        {
            "x": 382.9812274179751,
            "y": 603.1007556467684
        },
        {
            "x": 336.53678297353065,
            "y": 590.4340889801019
        },
        {
            "x": 273.5100674391139,
            "y": 564.8572419731922
        },
        {
            "x": 211.5478768763534,
            "y": 515.2194681197752
        },
        {
            "x": 167.63676576524227,
            "y": 470.46391256421964
        },
        {
            "x": 129.63676576524227,
            "y": 424.8639125642196
        },
        {
            "x": 109.3700990985756,
            "y": 382.6416903419974
        },
        {
            "x": 106.83676576524228,
            "y": 322.68613478644187
        },
        {
            "x": 122.03676576524227,
            "y": 276.2416903419974
        },
        {
            "x": 152.43676576524226,
            "y": 217.1305792308863
        },
        {
            "x": 207.09688025850278,
            "y": 159.91162439820707
        },
        {
            "x": 243.63676576524225,
            "y": 136.9083570086641
        },
        {
            "x": 301.6211756156242,
            "y": 119.09431503945008
        },
        {
            "x": 366.0812102096867,
            "y": 98.06391256421965
        },
        {
            "x": 436.9627803315026,
            "y": 91.16668232030057
        },
        {
            "x": 511.8888229137628,
            "y": 91.3780419907088
        },
        {
            "x": 611.4626911317613,
            "y": 91.3780419907088
        },
        {
            "x": 677.1390722968241,
            "y": 91.3780419907088
        },
        {
            "x": 736.4596746394616,
            "y": 91.3780419907088
        },
        {
            "x": 797.8988699229075,
            "y": 95.61522787232576
        },
        {
            "x": 855.1008793247364,
            "y": 91.3780419907088
        },
        {
            "x": 893.01454354302,
            "y": 96.37502367533075
        },
        {
            "x": 936.0812102096867,
            "y": 102.28613478644186
        },
        {
            "x": 963.1034324319088,
            "y": 127.6194681197752
        },
        {
            "x": 974.9256546541311,
            "y": 161.39724589755298
        },
        {
            "x": 971.7295294108388,
            "y": 217.4808496115236
        },
        {
            "x": 948.7478768763533,
            "y": 250.06391256421963
        },
        {
            "x": 902.3034324319088,
            "y": 272.0194681197752
        },
        {
            "x": 818.7034324319088,
            "y": 289.75280145310853
        },
        {
            "x": 736.2475979561897,
            "y": 295.9748267630734
        },
        {
            "x": 672.9018864152072,
            "y": 296.8815572491314
        },
        {
            "x": 589.8589879874645,
            "y": 291.4416903419974
        },
        {
            "x": 502.03676576524225,
            "y": 293.13057923088627
        },
        {
            "x": 434.48121020968665,
            "y": 306.6416903419974
        },
        {
            "x": 394.79232132079784,
            "y": 326.0639125642196
        },
        {
            "x": 368.21783825359614,
            "y": 351.10849455238446
        },
        {
            "x": 339.5634060676428,
            "y": 379.761618526704
        },
        {
            "x": 333.55066181166654,
            "y": 412.8317119345732
        },
        {
            "x": 335.554909896992,
            "y": 456.92516981173213
        },
        {
            "x": 341.5676541529682,
            "y": 491.9995113049267
        },
        {
            "x": 376.81095601333436,
            "y": 533.7122469468236
        },
        {
            "x": 409.0351476123531,
            "y": 565.9364385458423
        },
        {
            "x": 454.6868135119338,
            "y": 599.8403477847439
        },
        {
            "x": 501.90750097900076,
            "y": 646.3266138749831
        },
        {
            "x": 558.0264473681121,
            "y": 694.4285679227929
        },
        {
            "x": 626.0113710457455,
            "y": 748.5401909402814
        },
        {
            "x": 701.2011514434557,
            "y": 772.1712647795617
        },
        {
            "x": 798.536217607161,
            "y": 798.649468359714
        },
        {
            "x": 894.7401257027805,
            "y": 810.6749568716665
        },
        {
            "x": 961.8824365611816,
            "y": 816.6877011276426
        },
        {
            "x": 1025.016251248932,
            "y": 817.6898251703053
        },
        {
            "x": 1090.0397300716143,
            "y": 810.8402946983841
        },
        {
            "x": 1140.749042368303,
            "y": 804.6019007375222
        },
        {
            "x": 1186.7123048686703,
            "y": 789.3575002990384
        },
        {
            "x": 1226.4422369590602,
            "y": 770.3246229012193
        },
        {
            "x": 1257.4036630248138,
            "y": 743.6736907097649
        },
        {
            "x": 1275.8418432525557,
            "y": 709.8353090724495
        },
        {
            "x": 1284.9545380007182,
            "y": 673.2658991046752
        },
        {
            "x": 1293.7587921841073,
            "y": 613.6531682354932
        },
        {
            "x": 1297.1993713233426,
            "y": 563.0623992010567
        },
        {
            "x": 1309.7791706567616,
            "y": 518.5989226310779
        },
        {
            "x": 1336.9950796218716,
            "y": 474.2873576120305
        },
        {
            "x": 1375.996735010399,
            "y": 411.7963994800496
        },
        {
            "x": 1425.7701212108977,
            "y": 364.0838577084119
        },
        {
            "x": 1490.0554961546754,
            "y": 269.18639945807365
        },
        {
            "x": 1527.6563178848594,
            "y": 215.2797568821574
        },
        {
            "x": 1578.8305377437014,
            "y": 171.2277328770794
        },
        {
            "x": 1617.3704373317235,
            "y": 153.33429345456094
        },
        {
            "x": 1657.5978411748276,
            "y": 160.37528627223602
        },
        {
            "x": 1723.0502967916132,
            "y": 186.82735494986326
        },
        {
            "x": 1790.2824452599896,
            "y": 228.28717983869527
        },
        {
            "x": 1943.7958509294483,
            "y": 325.77379511784073
        },
        {
            "x": 2181.3494421843775,
            "y": 478.1666649794935
        },
        {
            "x": 2385.383336341709,
            "y": 603.2893313999406
        },
        {
            "x": 2476.095292687816,
            "y": 657.716505207605
        },
        {
            "x": 2548.157753276397,
            "y": 704.3590056664079
        },
        {
            "x": 2598.6272413619226,
            "y": 732.280755832696
        },
        {
            "x": 2631.071685806367,
            "y": 743.8363113882515
        },
        {
            "x": 2662.1827969174783,
            "y": 750.5029780549181
        },
        {
            "x": 2695.071685806367,
            "y": 755.8363113882515
        },
        {
            "x": 2724.4050191397005,
            "y": 758.0585336104737
        },
        {
            "x": 2753.293908028589,
            "y": 754.5029780549181
        },
        {
            "x": 2777.293908028589,
            "y": 744.7252002771404
        },
        {
            "x": 2796.849463584145,
            "y": 732.280755832696
        },
        {
            "x": 2811.5161302508113,
            "y": 716.280755832696
        },
        {
            "x": 2818.6272413619226,
            "y": 699.391866943807
        },
        {
            "x": 2820.849463584145,
            "y": 679.8363113882515
        },
        {
            "x": 2827.960574695256,
            "y": 654.9474224993626
        },
        {
            "x": 2830.1827969174783,
            "y": 634.5029780549181
        },
        {
            "x": 2832.4050191397005,
            "y": 586.0585336104737
        },
        {
            "x": 2827.7354389725538,
            "y": 509.1763287013763
        },
        {
            "x": 2826.4933557061895,
            "y": 486.19778827362956
        },
        {
            "x": 2826.4933557061895,
            "y": 464.4613311122475
        },
        {
            "x": 2820.9039810075483,
            "y": 441.4827906845007
        },
        {
            "x": 2813.45148140936,
            "y": 422.85154168903034
        },
        {
            "x": 2800.409607112531,
            "y": 399.25195962810125
        },
        {
            "x": 2787.9887744488838,
            "y": 381.86279389899556
        },
        {
            "x": 2765.6312756543193,
            "y": 363.2315449035252
        },
        {
            "x": 2738.926485427479,
            "y": 349.5686289735136
        },
        {
            "x": 2695.517970949024,
            "y": 336.1212602211409
        },
        {
            "x": 2665.643572711962,
            "y": 324.7269636462198
        },
        {
            "x": 2633.87352650458,
            "y": 315.85459355447426
        },
        {
            "x": 2575.096968712535,
            "y": 300.4016530179285
        },
        {
            "x": 2553.319190934757,
            "y": 295.0683196845951
        },
        {
            "x": 2537.319190934757,
            "y": 289.7349863512618
        },
        {
            "x": 2520.8747464903126,
            "y": 280.4016530179285
        },
        {
            "x": 2506.208079823646,
            "y": 264.8460974623729
        },
        {
            "x": 2500.4303020458683,
            "y": 251.06831968459514
        },
        {
            "x": 2499.5414131569796,
            "y": 235.06831968459514
        },
        {
            "x": 2504.520304792468,
            "y": 218.75996427235697
        },
        {
            "x": 2511.5414131569796,
            "y": 203.06831968459514
        },
        {
            "x": 2518.6525242680905,
            "y": 187.51276412903957
        },
        {
            "x": 2532.4303020458683,
            "y": 176.40165301792845
        },
        {
            "x": 2544.8747464903126,
            "y": 169.7349863512618
        },
        {
            "x": 2560.4035977875665,
            "y": 164.50404786896186
        },
        {
            "x": 2588.27352650458,
            "y": 157.94348244336314
        },
        {
            "x": 2671.87352650458,
            "y": 178.21014911002982
        },
        {
            "x": 2744.495748726802,
            "y": 205.23237133225203
        },
        {
            "x": 2818.0049238027013,
            "y": 245.89891129735514
        },
        {
            "x": 2866.305172430539,
            "y": 262.89344322196473
        },
        {
            "x": 2916.394319155704,
            "y": 295.0936089738566
        },
        {
            "x": 2954.8556282482414,
            "y": 337.13271426104865
        },
        {
            "x": 2967.377914929533,
            "y": 379.1718195482408
        },
        {
            "x": 2971.850160172851,
            "y": 448.0443962953428
        },
        {
            "x": 2979.1764493033324,
            "y": 604.9474102569283
        },
        {
            "x": 2979.9002016108243,
            "y": 654.6621265366488
        },
        {
            "x": 2979.0057525621605,
            "y": 705.6457223104775
        },
        {
            "x": 2970.2048386186543,
            "y": 752.9789865541204
        },
        {
            "x": 2957.5389753942322,
            "y": 787.0405857388707
        },
        {
            "x": 2943.2277906156137,
            "y": 811.1907100527897
        },
        {
            "x": 2921.7610134476863,
            "y": 838.0241815126996
        },
        {
            "x": 2887.771949598467,
            "y": 864.8576529726095
        },
        {
            "x": 2847.5217424086018,
            "y": 883.6410829945463
        },
        {
            "x": 2793.854799488782,
            "y": 891.6911244325194
        },
        {
            "x": 1057.8653582002778,
            "y": 890.5436837191877
        }
    ],
    "start": {
        "x": 642.3432070761668,
        "y": 920.2345158630609,
        "angle": 0.014183445991308231
    }
};
}

function squareTrackData() {
  return {
    version: 1,
    name: "Quadrado",
    presetId: "square",
    outer: [
      { x: 131, y: 558 },
      { x: 220, y: 566 },
      { x: 370, y: 566 },
      { x: 520, y: 566 },
      { x: 660, y: 566 },
      { x: 748, y: 560 },
      { x: 798, y: 544 },
      { x: 836, y: 514 },
      { x: 866, y: 476 },
      { x: 882, y: 426 },
      { x: 888, y: 350 },
      { x: 888, y: 250 },
      { x: 882, y: 174 },
      { x: 866, y: 124 },
      { x: 836, y: 86 },
      { x: 798, y: 56 },
      { x: 748, y: 40 },
      { x: 660, y: 34 },
      { x: 520, y: 34 },
      { x: 370, y: 34 },
      { x: 220, y: 34 },
      { x: 132, y: 40 },
      { x: 82, y: 56 },
      { x: 44, y: 86 },
      { x: 14, y: 124 },
      { x: -2, y: 174 },
      { x: -8, y: 250 },
      { x: -8, y: 350 },
      { x: -2, y: 426 },
      { x: 14, y: 476 },
      { x: 44, y: 514 },
      { x: 82, y: 544 }
    ],
    inner: [
      { x: 190, y: 456 },
      { x: 290, y: 456 },
      { x: 410, y: 456 },
      { x: 530, y: 456 },
      { x: 610, y: 456 },
      { x: 666, y: 452 },
      { x: 700, y: 440 },
      { x: 726, y: 420 },
      { x: 746, y: 394 },
      { x: 758, y: 360 },
      { x: 762, y: 320 },
      { x: 762, y: 280 },
      { x: 758, y: 240 },
      { x: 746, y: 206 },
      { x: 726, y: 180 },
      { x: 700, y: 160 },
      { x: 666, y: 148 },
      { x: 610, y: 144 },
      { x: 530, y: 144 },
      { x: 410, y: 144 },
      { x: 290, y: 144 },
      { x: 190, y: 144 },
      { x: 134, y: 148 },
      { x: 100, y: 160 },
      { x: 74, y: 180 },
      { x: 54, y: 206 },
      { x: 42, y: 240 },
      { x: 38, y: 280 },
      { x: 38, y: 320 },
      { x: 42, y: 360 },
      { x: 54, y: 394 },
      { x: 74, y: 420 },
      { x: 100, y: 440 },
      { x: 134, y: 452 }
    ],
    start: { x: 170, y: 508, angle: 0 }
  };
}

function ellipseLoop(cx, cy, rx, ry, sampleCount = 28) {
  const points = [];
  for (let i = 0; i < sampleCount; i++) {
    const t = (i / sampleCount) * Math.PI * 2;
    points.push({
      x: cx + Math.cos(t) * rx,
      y: cy + Math.sin(t) * ry
    });
  }
  return points;
}

function ovalTrackData() {
  return {
    version: 1,
    name: "Oval",
    presetId: "oval",
    outer: ellipseLoop(400, 300, 320, 190, 32),
    inner: ellipseLoop(400, 300, 220, 95, 32),
    start: { x: 230, y: 438, angle: 0 }
  };
}

const BUILT_IN_TRACK_PRESETS = [
  {
    id: "barcelona-catalunya",
    label: "Circuito Barcelona-Catalunya",
    build: barcelonaCatalunyaTrackData
  },
  {
    id: "square",
    label: "Quadrado",
    build: squareTrackData
  },
  {
    id: "oval",
    label: "Oval",
    build: ovalTrackData
  }
];

function getBuiltInTrackPresets() {
  return BUILT_IN_TRACK_PRESETS.map(preset => ({
    id: preset.id,
    label: preset.label
  }));
}

function getBuiltInTrackPresetById(id) {
  const preset =
    BUILT_IN_TRACK_PRESETS.find(item => item.id === id) ||
    BUILT_IN_TRACK_PRESETS.find(item => item.id === DEFAULT_TRACK_PRESET_ID) ||
    BUILT_IN_TRACK_PRESETS[0];
  if (!preset) return null;
  return {
    id: preset.id,
    label: preset.label,
    data: preset.build()
  };
}

// Mantemos a função antiga como atalho para o preset principal.
function defaultTrackData() {
  const preset = getBuiltInTrackPresetById(DEFAULT_TRACK_PRESET_ID);
  return preset ? preset.data : barcelonaCatalunyaTrackData();
}
