const SVG_NS = "http://www.w3.org/2000/svg";
const curvePlot = document.querySelector("#curve-plot");
const functionalPlot = document.querySelector("#functional-plot");
const amplitudeInput = document.querySelector("#amplitude");
const amplitudeOutput = document.querySelector("#amplitude-output");
const variationSelect = document.querySelector("#variation-shape");
const baseJOutput = document.querySelector("#base-j");
const variedJOutput = document.querySelector("#varied-j");
const deltaJOutput = document.querySelector("#delta-j");
const statusOutput = document.querySelector("#experiment-status");
const shakeButton = document.querySelector("#shake-button");
const straightButton = document.querySelector("#straight-button");
const curveButton = document.querySelector("#curve-button");

const curveBox = { width: 760, height: 430, left: 52, right: 24, top: 24, bottom: 42 };
const yMin = -1.5;
const yMax = 1.5;
const nodeXs = Array.from({ length: 7 }, (_, index) => -1 + (2 * index) / 6);
let nodeYs = nodeXs.map(() => 0);
let dragIndex = null;
let animationFrame = null;
let animationStart = null;
let shakeRange = 0.35;

function svgElement(name, attributes = {}) {
  const element = document.createElementNS(SVG_NS, name);
  Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
  return element;
}

function mapX(x) {
  const innerWidth = curveBox.width - curveBox.left - curveBox.right;
  return curveBox.left + ((x + 1) / 2) * innerWidth;
}

function mapY(y) {
  const innerHeight = curveBox.height - curveBox.top - curveBox.bottom;
  return curveBox.top + ((yMax - y) / (yMax - yMin)) * innerHeight;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function baseValue(x) {
  if (x <= -1) return nodeYs[0];
  if (x >= 1) return nodeYs[nodeYs.length - 1];

  const scaled = ((x + 1) / 2) * (nodeXs.length - 1);
  const index = Math.min(nodeXs.length - 2, Math.floor(scaled));
  const t = scaled - index;
  const y0 = nodeYs[index];
  const y1 = nodeYs[index + 1];
  const previous = nodeYs[Math.max(0, index - 1)];
  const next = nodeYs[Math.min(nodeYs.length - 1, index + 2)];
  const slope0 = (y1 - previous) / 2;
  const slope1 = (next - y0) / 2;
  const h00 = 2 * t ** 3 - 3 * t ** 2 + 1;
  const h10 = t ** 3 - 2 * t ** 2 + t;
  const h01 = -2 * t ** 3 + 3 * t ** 2;
  const h11 = t ** 3 - t ** 2;
  return h00 * y0 + h10 * slope0 + h01 * y1 + h11 * slope1;
}

function variationValue(x) {
  if (variationSelect.value === "sin2") return Math.sin(2 * Math.PI * x);
  if (variationSelect.value === "arch") return Math.cos((Math.PI * x) / 2);
  return Math.sin(Math.PI * x);
}

function variedValue(x, amplitude) {
  return baseValue(x) + amplitude * variationValue(x);
}

function sampleFunction(fn, count = 360) {
  return Array.from({ length: count }, (_, index) => {
    const x = -1 + (2 * index) / (count - 1);
    return { x, y: fn(x) };
  });
}

function pathFromSamples(samples, xMapper = mapX, yMapper = mapY) {
  return samples.map((point, index) => `${index === 0 ? "M" : "L"} ${xMapper(point.x).toFixed(2)} ${yMapper(point.y).toFixed(2)}`).join(" ");
}

function arcLength(fn, count = 700) {
  const dx = 2 / (count - 1);
  let total = 0;
  let previousX = -1;
  let previousY = fn(previousX);
  for (let index = 1; index < count; index += 1) {
    const x = -1 + index * dx;
    const y = fn(x);
    total += Math.hypot(x - previousX, y - previousY);
    previousX = x;
    previousY = y;
  }
  return total;
}

function drawCurveAxes() {
  [-1, -0.5, 0, 0.5, 1].forEach((x) => {
    curvePlot.append(svgElement("line", { x1: mapX(x), y1: curveBox.top, x2: mapX(x), y2: curveBox.height - curveBox.bottom, class: "plot-grid" }));
  });
  [-1, -0.5, 0, 0.5, 1].forEach((y) => {
    curvePlot.append(svgElement("line", { x1: curveBox.left, y1: mapY(y), x2: curveBox.width - curveBox.right, y2: mapY(y), class: "plot-grid" }));
  });
  curvePlot.append(svgElement("line", { x1: curveBox.left, y1: mapY(0), x2: curveBox.width - curveBox.right, y2: mapY(0), class: "plot-axis" }));
  curvePlot.append(svgElement("line", { x1: mapX(0), y1: curveBox.top, x2: mapX(0), y2: curveBox.height - curveBox.bottom, class: "plot-axis" }));

  const xLabel = svgElement("text", { x: curveBox.width - curveBox.right, y: mapY(0) - 10, class: "plot-axis-label", "text-anchor": "end" });
  xLabel.textContent = "x";
  curvePlot.append(xLabel);
  const yLabel = svgElement("text", { x: mapX(0) + 10, y: curveBox.top + 12, class: "plot-axis-label" });
  yLabel.textContent = "y";
  curvePlot.append(yLabel);
}

function drawControlPoints() {
  nodeXs.forEach((x, index) => {
    const fixed = index === 0 || index === nodeXs.length - 1;
    const circle = svgElement("circle", {
      cx: mapX(x),
      cy: mapY(nodeYs[index]),
      r: fixed ? 7 : 9,
      class: fixed ? "fixed-point" : "control-point",
    });
    if (!fixed) {
      circle.setAttribute("tabindex", "0");
      circle.setAttribute("role", "slider");
      circle.setAttribute("aria-label", `Control point ${index}`);
      circle.setAttribute("aria-valuemin", "-0.7");
      circle.setAttribute("aria-valuemax", "0.7");
      circle.setAttribute("aria-valuenow", nodeYs[index].toFixed(2));
      circle.addEventListener("pointerdown", (event) => {
        stopAnimation();
        dragIndex = index;
        curvePlot.setPointerCapture(event.pointerId);
      });
      circle.addEventListener("keydown", (event) => {
        if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
        event.preventDefault();
        stopAnimation();
        nodeYs[index] = clamp(nodeYs[index] + (event.key === "ArrowUp" ? 0.04 : -0.04), -0.7, 0.7);
        render();
        const refreshedPoints = curvePlot.querySelectorAll(".control-point");
        refreshedPoints[index - 1]?.focus();
      });
    }
    curvePlot.append(circle);
  });
}

function drawCurvePlot(amplitude) {
  curvePlot.querySelectorAll(":scope > :not(title):not(desc)").forEach((element) => element.remove());
  drawCurveAxes();

  const baseSamples = sampleFunction(baseValue);
  const upperSamples = sampleFunction((x) => variedValue(x, Math.abs(amplitude)));
  const lowerSamples = sampleFunction((x) => variedValue(x, -Math.abs(amplitude))).reverse();
  if (Math.abs(amplitude) > 0.005) {
    const bandPath = `${pathFromSamples(upperSamples)} ${lowerSamples.map((point) => `L ${mapX(point.x).toFixed(2)} ${mapY(point.y).toFixed(2)}`).join(" ")} Z`;
    curvePlot.append(svgElement("path", { d: bandPath, class: "variation-band" }));
  }
  curvePlot.append(svgElement("path", { d: pathFromSamples(baseSamples), class: "base-path" }));
  curvePlot.append(svgElement("path", { d: pathFromSamples(sampleFunction((x) => variedValue(x, amplitude))), class: "varied-path" }));
  drawControlPoints();
}

function drawFunctionalPlot(currentAmplitude) {
  functionalPlot.querySelectorAll(":scope > :not(title):not(desc)").forEach((element) => element.remove());
  const box = { width: 620, height: 300, left: 50, right: 24, top: 20, bottom: 42 };
  const values = Array.from({ length: 101 }, (_, index) => {
    const a = -0.75 + (1.5 * index) / 100;
    return { x: a, y: arcLength((x) => variedValue(x, a), 420) };
  });
  const minimum = Math.min(...values.map((point) => point.y));
  const maximum = Math.max(...values.map((point) => point.y));
  const padding = Math.max(0.025, (maximum - minimum) * 0.12);
  const graphMin = minimum - padding;
  const graphMax = maximum + padding;
  const graphX = (a) => box.left + ((a + 0.75) / 1.5) * (box.width - box.left - box.right);
  const graphY = (value) => box.top + ((graphMax - value) / (graphMax - graphMin)) * (box.height - box.top - box.bottom);

  [-0.75, 0, 0.75].forEach((a) => {
    functionalPlot.append(svgElement("line", { x1: graphX(a), y1: box.top, x2: graphX(a), y2: box.height - box.bottom, class: "functional-guide" }));
    const label = svgElement("text", { x: graphX(a), y: box.height - 15, class: "plot-axis-label", "text-anchor": "middle" });
    label.textContent = a === 0 ? "a = 0" : a.toFixed(2);
    functionalPlot.append(label);
  });
  functionalPlot.append(svgElement("line", { x1: box.left, y1: box.height - box.bottom, x2: box.width - box.right, y2: box.height - box.bottom, class: "plot-axis" }));
  functionalPlot.append(svgElement("line", { x1: box.left, y1: box.top, x2: box.left, y2: box.height - box.bottom, class: "plot-axis" }));
  functionalPlot.append(svgElement("path", { d: pathFromSamples(values, graphX, graphY), class: "functional-line" }));

  const currentJ = arcLength((x) => variedValue(x, currentAmplitude));
  functionalPlot.append(svgElement("line", { x1: graphX(currentAmplitude), y1: graphY(currentJ), x2: graphX(currentAmplitude), y2: box.height - box.bottom, class: "functional-guide" }));
  functionalPlot.append(svgElement("circle", { cx: graphX(currentAmplitude), cy: graphY(currentJ), r: 7, class: "functional-dot" }));
  const jLabel = svgElement("text", { x: box.left + 8, y: box.top + 12, class: "plot-axis-label" });
  jLabel.textContent = "J[yₐ]";
  functionalPlot.append(jLabel);
}

function updateReadout(amplitude) {
  const baseJ = arcLength(baseValue);
  const variedJ = arcLength((x) => variedValue(x, amplitude));
  const difference = variedJ - baseJ;
  baseJOutput.textContent = baseJ.toFixed(3);
  variedJOutput.textContent = variedJ.toFixed(3);
  deltaJOutput.textContent = `${difference >= 0 ? "+" : ""}${difference.toFixed(3)}`;
  amplitudeOutput.textContent = amplitude.toFixed(2);

  const straight = nodeYs.every((value) => Math.abs(value) < 0.002);
  if (Math.abs(amplitude) < 0.005) {
    statusOutput.textContent = "At a = 0, the varied curve and the base curve are the same function.";
  } else if (straight) {
    statusOutput.textContent = "Shaking the straight line makes it longer. Here the straight line is the minimum-length curve.";
  } else if (Math.abs(difference) < 0.001) {
    statusOutput.textContent = "Along this variation direction, J is almost unchanged at the current scale.";
  } else if (difference > 0) {
    statusOutput.textContent = "This shake increases J: the nearby curve is longer than your base curve.";
  } else {
    statusOutput.textContent = "This shake decreases J: the variation found a shorter nearby curve.";
  }
}

function render() {
  const amplitude = Number(amplitudeInput.value);
  drawCurvePlot(amplitude);
  drawFunctionalPlot(amplitude);
  updateReadout(amplitude);
}

function stopAnimation() {
  if (animationFrame !== null) cancelAnimationFrame(animationFrame);
  animationFrame = null;
  animationStart = null;
  shakeButton.textContent = "Shake the function";
  shakeButton.setAttribute("aria-pressed", "false");
}

function animate(timestamp) {
  if (animationStart === null) animationStart = timestamp;
  const elapsed = timestamp - animationStart;
  const amplitude = shakeRange * Math.sin(elapsed / 520);
  amplitudeInput.value = amplitude.toFixed(2);
  render();
  animationFrame = requestAnimationFrame(animate);
}

curvePlot.addEventListener("pointermove", (event) => {
  if (dragIndex === null) return;
  const bounds = curvePlot.getBoundingClientRect();
  const svgY = ((event.clientY - bounds.top) / bounds.height) * curveBox.height;
  const y = yMax - ((svgY - curveBox.top) / (curveBox.height - curveBox.top - curveBox.bottom)) * (yMax - yMin);
  nodeYs[dragIndex] = clamp(y, -0.7, 0.7);
  render();
});

curvePlot.addEventListener("pointerup", (event) => {
  dragIndex = null;
  if (curvePlot.hasPointerCapture(event.pointerId)) curvePlot.releasePointerCapture(event.pointerId);
});
curvePlot.addEventListener("pointercancel", () => { dragIndex = null; });

amplitudeInput.addEventListener("input", () => {
  stopAnimation();
  render();
});

variationSelect.addEventListener("change", () => {
  stopAnimation();
  render();
});

shakeButton.addEventListener("click", () => {
  if (animationFrame !== null) {
    stopAnimation();
    return;
  }
  shakeRange = Math.max(0.2, Math.abs(Number(amplitudeInput.value)));
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    amplitudeInput.value = (-Number(amplitudeInput.value || 0.35)).toFixed(2);
    render();
    statusOutput.textContent = "Reduced-motion mode: each press moves to one nearby function instead of animating.";
    return;
  }
  shakeButton.textContent = "Pause the shake";
  shakeButton.setAttribute("aria-pressed", "true");
  animationFrame = requestAnimationFrame(animate);
});

straightButton.addEventListener("click", () => {
  stopAnimation();
  nodeYs = nodeXs.map(() => 0);
  amplitudeInput.value = "0.05";
  render();
});

curveButton.addEventListener("click", () => {
  stopAnimation();
  nodeYs = nodeXs.map((x) => 0.48 * Math.cos((Math.PI * x) / 2));
  nodeYs[0] = 0;
  nodeYs[nodeYs.length - 1] = 0;
  amplitudeInput.value = "0.05";
  render();
});

render();
