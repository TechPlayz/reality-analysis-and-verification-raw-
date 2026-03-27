const express = require("express");
const cors = require("cors");
const { analyzeText, adaptWeights } = require("./engine");
const { getWeights, saveWeights, appendFeedback } = require("./store");

const app = express();
const PORT = process.env.PORT || 8787;

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "RealityOps API" });
});

app.get("/api/weights", (_req, res) => {
  const weights = getWeights();
  res.json({ weights });
});

app.post("/api/analyze", (req, res) => {
  const text = String(req.body?.text || "").trim();

  if (!text) {
    return res.status(400).json({ error: "Text is required." });
  }

  if (text.split(/\s+/).length < 15) {
    return res.status(400).json({ error: "Minimum 15 words required." });
  }

  const weights = getWeights();
  const result = analyzeText(text, weights);
  const analysisId = `a_${Date.now()}_${Math.round(Math.random() * 1e6)}`;

  return res.json({ analysisId, ...result });
});

app.post("/api/feedback", (req, res) => {
  const analysisId = String(req.body?.analysisId || "");
  const correct = Boolean(req.body?.correct);
  const target = String(req.body?.target || "skeptic");

  if (!analysisId) {
    return res.status(400).json({ error: "analysisId is required." });
  }

  const current = getWeights();
  const updated = adaptWeights(current, { correct, target });
  saveWeights(updated);

  appendFeedback({
    analysisId,
    correct,
    target,
    at: new Date().toISOString()
  });

  return res.json({ ok: true, weights: updated });
});

app.listen(PORT, () => {
  console.log(`RealityOps API running on http://localhost:${PORT}`);
});
