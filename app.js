const messagesInput = document.getElementById("messages");
const failInput = document.getElementById("fail");
const consumersInput = document.getElementById("consumers");
const runBtn = document.getElementById("run");
const optimizeBtn = document.getElementById("optimize");

const messagesVal = document.getElementById("messagesVal");
const failVal = document.getElementById("failVal");
const consumersVal = document.getElementById("consumersVal");

const throughputText = document.getElementById("throughput");
const p95Text = document.getElementById("p95");
const retriesText = document.getElementById("retries");
const dlqText = document.getElementById("dlq");

const timeline = document.getElementById("timeline");
const depthCanvas = document.getElementById("depth");
const tctx = timeline.getContext("2d");
const dctx = depthCanvas.getContext("2d");

let sim = null;

function rand(min, max) {
  return Math.random() * (max - min) + min;
}

function percentile(arr, p) {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.floor(p * (sorted.length - 1));
  return sorted[idx];
}

function simulateWorkload(tune = false) {
  const messages = Number(messagesInput.value);
  const failRate = Number(failInput.value);
  let consumers = Number(consumersInput.value);

  if (tune) {
    consumers = Math.max(2, Math.min(18, Math.round(6 + (messages / 700) * (1 + failRate))));
    consumersInput.value = String(consumers);
  }

  const consumerTimes = Array(consumers).fill(0);
  const depths = [];
  const latencies = [];
  const segments = [];

  let retries = 0;
  let dlq = 0;
  let queueDepth = messages;

  for (let i = 0; i < messages; i += 1) {
    let c = 0;
    for (let j = 1; j < consumers; j += 1) {
      if (consumerTimes[j] < consumerTimes[c]) c = j;
    }

    let attempts = 0;
    let done = false;
    let finishTime = consumerTimes[c];

    while (!done && attempts < 3) {
      attempts += 1;
      const proc = rand(18, 115) * (1 + failRate * 0.8);
      const failed = Math.random() < failRate * (attempts === 1 ? 1 : 0.65);

      finishTime += proc;

      if (failed) {
        retries += 1;
        finishTime += 12 * attempts;
      } else {
        done = true;
      }
    }

    if (!done) {
      dlq += 1;
    }

    const start = consumerTimes[c];
    consumerTimes[c] = finishTime;

    latencies.push(finishTime - start);
    segments.push({ c, start, end: finishTime, failed: !done });

    queueDepth -= 1;
    depths.push({ t: finishTime, depth: queueDepth });
  }

  const totalTime = Math.max(...consumerTimes, 1);
  const throughput = messages / (totalTime / 1000);
  const p95 = percentile(latencies, 0.95);

  sim = { consumers, throughput, p95, retries, dlq, segments, depths, totalTime };
  render();
}

function renderTimeline() {
  tctx.clearRect(0, 0, timeline.width, timeline.height);
  tctx.fillStyle = "#07100e";
  tctx.fillRect(0, 0, timeline.width, timeline.height);

  if (!sim) return;

  const padX = 56;
  const padY = 24;
  const plotW = timeline.width - 80;
  const laneH = (timeline.height - 48) / sim.consumers;

  for (let i = 0; i < sim.consumers; i += 1) {
    const y = padY + i * laneH;
    tctx.strokeStyle = "rgba(165,230,210,0.2)";
    tctx.beginPath();
    tctx.moveTo(padX, y + laneH - 6);
    tctx.lineTo(padX + plotW, y + laneH - 6);
    tctx.stroke();

    tctx.fillStyle = "#c6efe3";
    tctx.font = "10px monospace";
    tctx.fillText(`C${i + 1}`, 18, y + laneH * 0.6);
  }

  sim.segments.forEach((s) => {
    const x1 = padX + (s.start / sim.totalTime) * plotW;
    const x2 = padX + (s.end / sim.totalTime) * plotW;
    const y = padY + s.c * laneH + 4;
    const h = Math.max(6, laneH - 12);

    tctx.fillStyle = s.failed ? "rgba(255,170,140,0.78)" : "rgba(145,231,196,0.78)";
    tctx.fillRect(x1, y, Math.max(1, x2 - x1), h);
  });
}

function renderDepth() {
  dctx.clearRect(0, 0, depthCanvas.width, depthCanvas.height);
  dctx.fillStyle = "#07100e";
  dctx.fillRect(0, 0, depthCanvas.width, depthCanvas.height);

  if (!sim || !sim.depths.length) return;

  const w = depthCanvas.width;
  const h = depthCanvas.height;
  const maxDepth = Math.max(...sim.depths.map((d) => d.depth), 1);

  const sx = (t) => 20 + (t / sim.totalTime) * (w - 40);
  const sy = (depth) => 20 + ((maxDepth - depth) / maxDepth) * (h - 40);

  dctx.beginPath();
  sim.depths.forEach((p, i) => {
    const x = sx(p.t);
    const y = sy(p.depth);
    if (i === 0) dctx.moveTo(x, y);
    else dctx.lineTo(x, y);
  });
  dctx.strokeStyle = "#8fe1c8";
  dctx.lineWidth = 2;
  dctx.stroke();
}

function renderMetrics() {
  if (!sim) return;
  throughputText.textContent = `${sim.throughput.toFixed(1)} msg/s`;
  p95Text.textContent = `${sim.p95.toFixed(1)} ms`;
  retriesText.textContent = String(sim.retries);
  dlqText.textContent = String(sim.dlq);
}

function render() {
  renderTimeline();
  renderDepth();
  renderMetrics();
}

function syncLabels() {
  messagesVal.textContent = messagesInput.value;
  failVal.textContent = Number(failInput.value).toFixed(2);
  consumersVal.textContent = consumersInput.value;
}

[messagesInput, failInput, consumersInput].forEach((el) => {
  el.addEventListener("input", syncLabels);
});

runBtn.addEventListener("click", () => simulateWorkload(false));
optimizeBtn.addEventListener("click", () => simulateWorkload(true));

syncLabels();
simulateWorkload(false);
