import { useMemo, useState } from "react";
import "./App.css";

function meterClass(value, inverse = false) {
  const score = inverse ? 100 - value : value;
  if (score >= 70) return "meter-strong";
  if (score >= 45) return "meter-mid";
  return "meter-low";
}

function predictIntent(text) {
  const lower = text.toLowerCase();
  if (!lower.trim()) return "Intent pending";
  if (/(safe|risk|harm|fake|hallucinat)/.test(lower)) return "Intent: safety check";
  if (/(should i|decision|choose|better)/.test(lower)) return "Intent: decision support";
  if (/(why|how|explain|what is)/.test(lower)) return "Intent: factual verification";
  return "Intent: general reliability check";
}

const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

const AI_MEDIA_KEYWORDS = [
  "stable diffusion", "midjourney", "comfyui", "automatic1111", "dall-e",
  "runway", "sora", "prompt", "negative prompt", "seed", "sampler", "cfg"
];

const CAMERA_KEYWORDS = [
  "canon", "nikon", "sony", "iphone", "samsung", "pixel", "fujifilm", "exif", "lens", "exposure"
];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function scanMetadataFootprints(file) {
  const buffer = await file.arrayBuffer();
  const text = new TextDecoder("latin1").decode(new Uint8Array(buffer).slice(0, 1_200_000)).toLowerCase();

  const aiHits = AI_MEDIA_KEYWORDS.filter((k) => text.includes(k)).length;
  const cameraHits = CAMERA_KEYWORDS.filter((k) => text.includes(k)).length;

  const reasons = [];
  if (aiHits > 0) reasons.push("AI-generation metadata footprint detected.");
  if (cameraHits > 0) reasons.push("Camera/exif-like metadata footprint detected.");

  const hasSignal = aiHits > 0 || cameraHits > 0;
  const aiBias = hasSignal ? aiHits / Math.max(aiHits + cameraHits, 1) : 0.5;

  return { hasSignal, aiBias, reasons };
}

function computePixelMetrics(data, stride = 16) {
  let variation = 0;
  let edges = 0;
  let entropy = 0;
  let count = 0;

  for (let i = 0; i < data.length - 10; i += stride) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const r2 = data[i + 4];
    const g2 = data[i + 5];
    const b2 = data[i + 6];
    const r3 = data[i + 8];
    const g3 = data[i + 9];
    const b3 = data[i + 10];

    variation += Math.abs(r - r2) + Math.abs(g - g2) + Math.abs(b - b2);
    edges += Math.abs(r - r3) + Math.abs(g - g3) + Math.abs(b - b3);

    const luminance = (r + g + b) / 3;
    entropy += 1 - Math.abs(luminance / 255 - 0.5);
    count += 1;
  }

  const safe = Math.max(1, count);
  return {
    variation: variation / safe,
    edges: edges / safe,
    entropy: entropy / safe
  };
}

function normalizeRange(value, min, max) {
  if (max <= min) return 0;
  return clamp((value - min) / (max - min), 0, 1);
}

function inverseNormalizeRange(value, min, max) {
  return 1 - normalizeRange(value, min, max);
}

function buildTrustResult(risk, uncertainty, reasons, modality, extra = {}) {
  const trust = clamp(Math.round(100 - (risk * 0.72 + uncertainty * 0.38)), 5, 95);
  let verdict = "Needs Review";
  if (uncertainty >= 66) verdict = "Uncertain";
  else if (risk >= 75) verdict = `${modality} High Synthetic Risk`;
  else if (risk >= 60) verdict = `${modality} Likely Synthetic`;
  else if (risk <= 35) verdict = `${modality} Likely Authentic`;

  return {
    hallucinationRisk: risk,
    uncertainty,
    trust,
    verdict,
    topReasons: reasons.slice(0, 6),
    agents: extra.agents || [],
    ...extra
  };
}

async function analyzeImageFile(file) {
  if (!file.type.startsWith("image/")) {
    throw new Error("Please upload a valid image file.");
  }

  if (file.size > 12 * 1024 * 1024) {
    throw new Error("Image is too large. Please use a file under 12MB.");
  }

  await sleep(900 + Math.floor(Math.random() * 350));
  const metadata = await scanMetadataFootprints(file);

  const url = URL.createObjectURL(file);
  const img = await new Promise((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("Could not load image."));
    el.src = url;
  }).finally(() => {
    URL.revokeObjectURL(url);
  });

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas not available for image analysis.");

  const scale = Math.min(1, 520 / Math.max(img.width, img.height));
  canvas.width = Math.max(80, Math.floor(img.width * scale));
  canvas.height = Math.max(80, Math.floor(img.height * scale));
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const m = computePixelMetrics(data, 16);

  // Continuous signal scoring (not fixed-step buckets).
  const aiSmoothness = inverseNormalizeRange(m.variation, 24, 54);
  const aiSoftEdges = inverseNormalizeRange(m.edges, 27, 58);
  const aiLowEntropy = inverseNormalizeRange(m.entropy, 0.62, 0.81);

  const humanTexture = normalizeRange(m.variation, 34, 64);
  const humanEdges = normalizeRange(m.edges, 35, 66);
  const humanEntropy = normalizeRange(m.entropy, 0.7, 0.9);

  const aiScore = aiSmoothness * 0.39 + aiSoftEdges * 0.34 + aiLowEntropy * 0.27;
  const humanScore = humanTexture * 0.4 + humanEdges * 0.35 + humanEntropy * 0.25;

  let risk = 50 + (aiScore - humanScore) * 42;
  const reasons = [];

  reasons.push(`Measured variation ${m.variation.toFixed(1)} and edges ${m.edges.toFixed(1)} from image pixels.`);
  reasons.push(`Measured entropy proxy ${m.entropy.toFixed(3)} from luminance distribution.`);

  if (aiScore > humanScore + 0.14) {
    reasons.push("Visual metrics lean toward synthetic rendering patterns.");
  } else if (humanScore > aiScore + 0.14) {
    reasons.push("Visual metrics lean toward camera-captured authenticity.");
  } else {
    reasons.push("Visual signals are mixed and close to neutral.");
  }

  if (metadata.hasSignal) {
    risk = risk * 0.34 + metadata.aiBias * 100 * 0.66;
    reasons.push(...metadata.reasons);
  }

  risk = clamp(Math.round(risk), 8, 95);
  const uncertainty = clamp(Math.round(36 + Math.abs(50 - risk) * 0.72), 24, 90);

  return buildTrustResult(risk, uncertainty, reasons, "Image", {
    agents: [
      { name: "Visual", risk: clamp(Math.round(50 + (aiScore - humanScore) * 45), 5, 95), reasons: reasons.slice(0, 2) },
      { name: "Metadata", risk: metadata.hasSignal ? Math.round(metadata.aiBias * 100) : 50, reasons: metadata.reasons }
    ],
    metrics: {
      variation: Number(m.variation.toFixed(2)),
      edges: Number(m.edges.toFixed(2)),
      entropy: Number(m.entropy.toFixed(4))
    }
  });
}

async function analyzeVideoFile(file) {
  if (!file.type.startsWith("video/")) {
    throw new Error("Please upload a valid video file.");
  }

  if (file.size > 80 * 1024 * 1024) {
    throw new Error("Video is too large. Please use a file under 80MB.");
  }

  await sleep(1000 + Math.floor(Math.random() * 350));
  const metadata = await scanMetadataFootprints(file);
  const url = URL.createObjectURL(file);

  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = url;

  const waitForEvent = (target, eventName, timeoutMs, errorMessage) => {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(errorMessage));
      }, timeoutMs);

      const onSuccess = () => {
        cleanup();
        resolve();
      };

      const onError = () => {
        cleanup();
        reject(new Error(errorMessage));
      };

      const cleanup = () => {
        clearTimeout(timer);
        target.removeEventListener(eventName, onSuccess);
        target.removeEventListener("error", onError);
      };

      target.addEventListener(eventName, onSuccess, { once: true });
      target.addEventListener("error", onError, { once: true });
    });
  };

  const captureFrameAt = async (ctx, canvas, target, time) => {
    const safeTime = clamp(time, 0, Math.max(0, Number.isFinite(target.duration) ? target.duration - 0.01 : time));

    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error("Video seek timed out. Try another video format (MP4/WebM)."));
      }, 5000);

      const cleanup = () => {
        clearTimeout(timer);
        target.removeEventListener("seeked", onSeeked);
        target.removeEventListener("error", onError);
      };

      const onSeeked = () => {
        cleanup();
        resolve();
      };

      const onError = () => {
        cleanup();
        reject(new Error("Video decode failed during frame sampling."));
      };

      if (Math.abs(target.currentTime - safeTime) < 0.005 && target.readyState >= 2) {
        cleanup();
        resolve();
        return;
      }

      target.addEventListener("seeked", onSeeked, { once: true });
      target.addEventListener("error", onError, { once: true });

      try {
        target.currentTime = safeTime;
      } catch {
        cleanup();
        reject(new Error("Video seek is not supported for this file."));
      }
    });

    ctx.drawImage(target, 0, 0, canvas.width, canvas.height);
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return computePixelMetrics(data, 20);
  };

  try {
    video.load();
    await waitForEvent(video, "loadedmetadata", 7000, "Could not load video metadata. Use MP4/WebM if possible.");

    if (!video.videoWidth || !video.videoHeight) {
      throw new Error("Video codec is not supported in this browser runtime.");
    }

    // Ensure decodable frame data is available before sampling.
    if (video.readyState < 2) {
      await waitForEvent(video, "loadeddata", 7000, "Could not decode video frames. Try another file.");
    }

    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    const timestamps = duration > 1
      ? [0.15, 0.45, 0.75].map((r) => clamp(duration * r, 0.05, duration - 0.05))
      : [0];

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Canvas not available for video analysis.");

    canvas.width = Math.max(120, Math.min(480, video.videoWidth || 320));
    canvas.height = Math.max(80, Math.min(270, video.videoHeight || 180));

    const frameMetrics = [];
    for (const time of timestamps) {
      frameMetrics.push(await captureFrameAt(ctx, canvas, video, time));
    }

    const avg = frameMetrics.reduce((acc, m) => {
      acc.variation += m.variation;
      acc.edges += m.edges;
      acc.entropy += m.entropy;
      return acc;
    }, { variation: 0, edges: 0, entropy: 0 });
    const count = Math.max(1, frameMetrics.length);
    avg.variation /= count;
    avg.edges /= count;
    avg.entropy /= count;

    const changeSpread = frameMetrics.length > 1
      ? Math.max(...frameMetrics.map((m) => m.variation)) - Math.min(...frameMetrics.map((m) => m.variation))
      : 0;

    const aiSmoothness = inverseNormalizeRange(avg.variation, 22, 50);
    const aiSoftEdges = inverseNormalizeRange(avg.edges, 24, 53);
    const aiLowEntropy = inverseNormalizeRange(avg.entropy, 0.6, 0.8);
    const aiLowTemporalSpread = inverseNormalizeRange(changeSpread, 2, 14);

    const humanTexture = normalizeRange(avg.variation, 32, 62);
    const humanEdges = normalizeRange(avg.edges, 32, 62);
    const humanEntropy = normalizeRange(avg.entropy, 0.68, 0.9);
    const humanTemporalSpread = normalizeRange(changeSpread, 4, 20);

    const aiScore = aiSmoothness * 0.29 + aiSoftEdges * 0.27 + aiLowEntropy * 0.24 + aiLowTemporalSpread * 0.2;
    const humanScore = humanTexture * 0.29 + humanEdges * 0.26 + humanEntropy * 0.23 + humanTemporalSpread * 0.22;

    let risk = 50 + (aiScore - humanScore) * 44;
    const reasons = [];
    reasons.push(`Sampled ${frameMetrics.length} frame(s): variation ${avg.variation.toFixed(1)}, edges ${avg.edges.toFixed(1)}.`);
    reasons.push(`Temporal spread ${changeSpread.toFixed(2)} and entropy ${avg.entropy.toFixed(3)} across sampled frames.`);

    if (aiScore > humanScore + 0.12) {
      reasons.push("Frame-level metrics lean toward synthetic video consistency.");
    } else if (humanScore > aiScore + 0.12) {
      reasons.push("Frame-level metrics lean toward authentic capture dynamics.");
    } else {
      reasons.push("Video frame signals are mixed and uncertain.");
    }

    if (metadata.hasSignal) {
      risk = risk * 0.32 + metadata.aiBias * 100 * 0.68;
      reasons.push(...metadata.reasons);
    }

    risk = clamp(Math.round(risk), 8, 95);
    const uncertainty = clamp(Math.round(42 + (duration < 2 ? 18 : 0) + Math.abs(50 - risk) * 0.58), 28, 92);

    return buildTrustResult(risk, uncertainty, reasons, "Video", {
      agents: [
        { name: "Frame Audit", risk: clamp(Math.round(50 + (aiScore - humanScore) * 46), 5, 95), reasons: reasons.slice(0, 2) },
        { name: "Metadata", risk: metadata.hasSignal ? Math.round(metadata.aiBias * 100) : 50, reasons: metadata.reasons }
      ],
      metrics: {
        variation: Number(avg.variation.toFixed(2)),
        edges: Number(avg.edges.toFixed(2)),
        entropy: Number(avg.entropy.toFixed(4)),
        temporalSpread: Number(changeSpread.toFixed(3)),
        sampledFrames: frameMetrics.length
      }
    });
  } finally {
    URL.revokeObjectURL(url);
    video.src = "";
  }
}

function App() {
  const [mode, setMode] = useState("text");
  const [text, setText] = useState("");
  const [imageFile, setImageFile] = useState(null);
  const [videoFile, setVideoFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [analysisId, setAnalysisId] = useState("");
  const [feedbackTarget, setFeedbackTarget] = useState("skeptic");
  const [feedbackMsg, setFeedbackMsg] = useState("");
  const [consistencyLoading, setConsistencyLoading] = useState(false);
  const [consistencyReport, setConsistencyReport] = useState(null);

  const switchMode = (nextMode) => {
    setMode(nextMode);
    setLoading(false);
    setConsistencyLoading(false);
    setError("");
    setFeedbackMsg("");
    setResult(null);
    setAnalysisId("");
    setConsistencyReport(null);

    // Reset non-active inputs to avoid accidental stale analysis inputs.
    if (nextMode !== "text") setText("");
    if (nextMode !== "image") setImageFile(null);
    if (nextMode !== "video") setVideoFile(null);
  };

  const intent = useMemo(() => (mode === "text" ? predictIntent(text) : "Intent: media authenticity check"), [text, mode]);
  const toneClass = result?.uncertainty >= 65 ? "tone-alert" : "tone-calm";

  const analyze = async () => {
    setLoading(true);
    setError("");
    setFeedbackMsg("");
    setResult(null);
    setAnalysisId("");
    setConsistencyReport(null);

    try {
      if (mode === "text") {
        const response = await fetch(`${API_BASE}/api/analyze`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text })
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || "Analyze request failed.");
        }

        setAnalysisId(data.analysisId);
        setResult(data);
      } else if (mode === "image") {
        if (!imageFile) throw new Error("Please upload an image first.");
        setAnalysisId("");
        setResult(await analyzeImageFile(imageFile));
      } else {
        if (!videoFile) throw new Error("Please upload a video first.");
        setAnalysisId("");
        setResult(await analyzeVideoFile(videoFile));
      }
    } catch (e) {
      setError(e.message || "Unable to analyze content right now.");
    } finally {
      setLoading(false);
    }
  };

  const runConsistencyTest = async () => {
    if (mode === "text") return;
    if (!result?.metrics) return;

    setConsistencyLoading(true);
    setError("");

    try {
      const rerun = mode === "image"
        ? await analyzeImageFile(imageFile)
        : await analyzeVideoFile(videoFile);

      if (!rerun?.metrics) {
        throw new Error("Consistency test could not collect metric values.");
      }

      const metricKeys = Object.keys(result.metrics).filter((key) => {
        return typeof result.metrics[key] === "number" && typeof rerun.metrics[key] === "number";
      });

      const rows = metricKeys.map((key) => {
        const previous = Number(result.metrics[key]);
        const current = Number(rerun.metrics[key]);
        const delta = Math.abs(current - previous);
        const relative = previous === 0 ? delta : (delta / Math.abs(previous)) * 100;
        return {
          key,
          previous,
          current,
          delta,
          relative
        };
      });

      const avgRelativeDrift = rows.length > 0
        ? rows.reduce((sum, row) => sum + row.relative, 0) / rows.length
        : 0;

      const riskDelta = Math.abs(Number(rerun.hallucinationRisk || 0) - Number(result.hallucinationRisk || 0));
      const trustDelta = Math.abs(Number(rerun.trust || 0) - Number(result.trust || 0));

      let stability = "High Stability";
      if (avgRelativeDrift > 8 || riskDelta > 6) stability = "Moderate Stability";
      if (avgRelativeDrift > 16 || riskDelta > 12) stability = "Low Stability";

      setConsistencyReport({
        stability,
        avgRelativeDrift,
        riskDelta,
        trustDelta,
        rows
      });
    } catch (e) {
      setError(e.message || "Consistency test failed.");
    } finally {
      setConsistencyLoading(false);
    }
  };

  const sendFeedback = async (correct) => {
    if (!analysisId) return;

    setFeedbackMsg("Saving feedback...");
    try {
      const response = await fetch(`${API_BASE}/api/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analysisId, correct, target: feedbackTarget })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Feedback failed.");
      }

      setResult((prev) => (prev ? { ...prev, weights: data.weights } : prev));
      setFeedbackMsg("Feedback learned. Agent weights updated in real time.");
    } catch (e) {
      setFeedbackMsg(e.message || "Could not save feedback.");
    }
  };

  return (
    <main className={`shell ${toneClass}`}>
      <section className="hero">
        <p className="eyebrow">RealityOps</p>
        <h1>Uncertainty Tester</h1>
        <p>
          Multi-agent system for hallucination risk detection without ground truth,
          with live feedback adaptation.
        </p>
      </section>

      <section className="panel input-panel">
        <header>
          <h2>Trust Tester</h2>
          <p>{intent}</p>
        </header>

        <div className="row tabs">
          <button className={mode === "text" ? "ghost active-tab" : "ghost"} onClick={() => switchMode("text")}>Text</button>
          <button className={mode === "image" ? "ghost active-tab" : "ghost"} onClick={() => switchMode("image")}>Image</button>
          <button className={mode === "video" ? "ghost active-tab" : "ghost"} onClick={() => switchMode("video")}>Video</button>
        </div>

        {mode === "text" && (
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste an AI response (15+ words) to score hallucination risk and uncertainty..."
            rows={9}
          />
        )}

        {mode === "image" && (
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => {
              setError("");
              setResult(null);
              setFeedbackMsg("");
              setImageFile(e.target.files?.[0] || null);
            }}
          />
        )}

        {mode === "video" && (
          <input
            type="file"
            accept="video/mp4,video/webm,video/quicktime"
            onChange={(e) => {
              setError("");
              setResult(null);
              setFeedbackMsg("");
              setVideoFile(e.target.files?.[0] || null);
            }}
          />
        )}

        <div className="row">
          <button
            onClick={analyze}
            disabled={
              loading ||
              (mode === "text" && text.trim().split(/\s+/).length < 15) ||
              (mode === "image" && !imageFile) ||
              (mode === "video" && !videoFile)
            }
          >
            {loading ? "Analyzing..." : "Run Multi-Agent Audit"}
          </button>
          {mode === "text" && (
            <span className="word-count">Words: {text.trim() ? text.trim().split(/\s+/).length : 0}</span>
          )}
          {mode === "image" && imageFile && <span className="word-count">Image: {imageFile.name}</span>}
          {mode === "video" && videoFile && <span className="word-count">Video: {videoFile.name}</span>}
        </div>

        {error && <p className="error">{error}</p>}
      </section>

      <section className="panel output-panel">
        <header>
          <h2>Decision Board</h2>
          <p>Risk, uncertainty, trust score, and explainable agent outputs.</p>
        </header>

        {!result && <p className="empty">No result yet. Run analysis to start.</p>}

        {result && (
          <>
            <div className="pill-row">
              <span className="pill">Verdict: {result.verdict}</span>
              <span className="pill">Trust: {result.trust}%</span>
            </div>

            <div className="metric">
              <div className="label-row">
                <span>Hallucination Risk</span>
                <strong>{result.hallucinationRisk}%</strong>
              </div>
              <div className="bar">
                <div
                  className={`fill ${meterClass(result.hallucinationRisk)}`}
                  style={{ width: `${result.hallucinationRisk}%` }}
                />
              </div>
            </div>

            <div className="metric">
              <div className="label-row">
                <span>Uncertainty</span>
                <strong>{result.uncertainty}%</strong>
              </div>
              <div className="bar">
                <div
                  className={`fill ${meterClass(result.uncertainty)}`}
                  style={{ width: `${result.uncertainty}%` }}
                />
              </div>
            </div>

            <div className="metric">
              <div className="label-row">
                <span>Trust Score</span>
                <strong>{result.trust}%</strong>
              </div>
              <div className="bar">
                <div
                  className={`fill ${meterClass(result.trust, true)}`}
                  style={{ width: `${result.trust}%` }}
                />
              </div>
            </div>

            <div className="reasons">
              <h3>Top Reasons</h3>
              <ul>
                {result.topReasons.map((reason, idx) => (
                  <li key={`${reason}-${idx}`}>{reason}</li>
                ))}
              </ul>
            </div>

            {result.metrics && (
              <div className="reasons">
                <h3>Measured Signals</h3>
                <ul>
                  {Object.entries(result.metrics).map(([key, value]) => (
                    <li key={key}>{key}: {String(value)}</li>
                  ))}
                </ul>
              </div>
            )}

            {(mode === "image" || mode === "video") && result.metrics && (
              <div className="reasons consistency-box">
                <h3>Consistency Check</h3>
                <p>Re-runs analysis on the same file to estimate metric drift and output stability.</p>
                <div className="row">
                  <button className="ghost" onClick={runConsistencyTest} disabled={consistencyLoading || loading}>
                    {consistencyLoading ? "Re-running..." : "Re-run Consistency Test"}
                  </button>
                </div>

                {consistencyReport && (
                  <>
                    <ul>
                      <li>Stability: {consistencyReport.stability}</li>
                      <li>Average metric drift: {consistencyReport.avgRelativeDrift.toFixed(2)}%</li>
                      <li>Risk delta: {consistencyReport.riskDelta.toFixed(2)} points</li>
                      <li>Trust delta: {consistencyReport.trustDelta.toFixed(2)} points</li>
                    </ul>
                    {consistencyReport.rows.length > 0 && (
                      <ul>
                        {consistencyReport.rows.slice(0, 5).map((row) => (
                          <li key={row.key}>
                            {row.key}: {row.previous.toFixed(4)} {"->"} {row.current.toFixed(4)} (drift {row.relative.toFixed(2)}%)
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
              </div>
            )}

            <div className="agents">
              {result.agents.map((agent) => (
                <article key={agent.name} className="agent-card">
                  <h4>{agent.name} Agent</h4>
                  <p>Risk: {agent.risk}%</p>
                  <ul>
                    {agent.reasons.length === 0 && <li>No strong warning from this agent.</li>}
                    {agent.reasons.map((reason, idx) => (
                      <li key={`${agent.name}-${idx}`}>{reason}</li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>

            {mode === "text" && (
            <div className="feedback-box">
              <h3>Real-Time Adaptation</h3>
              <p>Tell the system if this judgment was correct. It updates agent weights instantly.</p>

              <div className="row">
                <label htmlFor="target">Adjust Focus:</label>
                <select
                  id="target"
                  value={feedbackTarget}
                  onChange={(e) => setFeedbackTarget(e.target.value)}
                >
                  <option value="skeptic">Skeptic Agent</option>
                  <option value="consistency">Consistency Agent</option>
                  <option value="grounding">Grounding Agent</option>
                </select>
              </div>

              <div className="row">
                <button className="ghost" onClick={() => sendFeedback(true)}>This was correct</button>
                <button className="ghost" onClick={() => sendFeedback(false)}>This was wrong</button>
              </div>

              {result.weights && (
                <p className="weights">
                  Weights now: skeptic {Math.round(result.weights.skeptic * 100)}%, consistency {Math.round(result.weights.consistency * 100)}%, grounding {Math.round(result.weights.grounding * 100)}%
                </p>
              )}
              {feedbackMsg && <p className="feedback-msg">{feedbackMsg}</p>}
            </div>
            )}
          </>
        )}
      </section>
    </main>
  );
}

export default App;
