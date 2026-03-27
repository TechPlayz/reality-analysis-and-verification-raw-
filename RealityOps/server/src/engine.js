const { normalizeWeights } = require("./store");

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9'\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function splitSentences(text) {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function skepticAgent(text, words) {
  const lower = text.toLowerCase();
  const absolutePhrases = ["always", "never", "guaranteed", "proves", "undeniably", "100%"];
  const hedgePhrases = ["might", "may", "possibly", "seems", "appears", "likely"];
  const modelPhrases = ["as an ai", "as a language model", "i cannot browse", "i don't have access"];

  const absoluteHits = absolutePhrases.filter((p) => lower.includes(p)).length;
  const hedgeHits = hedgePhrases.filter((p) => lower.includes(p)).length;
  const modelHits = modelPhrases.filter((p) => lower.includes(p)).length;

  let risk = 48 + absoluteHits * 9 + modelHits * 11 - hedgeHits * 5;
  risk = clamp(risk, 8, 95);

  const reasons = [];
  if (absoluteHits > 0) reasons.push("Contains high-certainty wording without validation cues.");
  if (modelHits > 0) reasons.push("Contains known LLM self-referential footprint phrases.");
  if (hedgeHits > 1) reasons.push("Uses uncertainty qualifiers that reduce hallucination risk.");
  if (words.length > 180) reasons.push("Long-form answer increases surface area for unsupported claims.");

  return { name: "Skeptic", risk, reasons: reasons.slice(0, 2) };
}

function consistencyAgent(text, words) {
  const sentences = splitSentences(text);
  const openings = sentences.map((s) => tokenize(s).slice(0, 3).join(" ")).filter(Boolean);
  const repeatedOpenings = openings.length - new Set(openings).size;

  const uniqueRatio = new Set(words).size / Math.max(words.length, 1);
  const abruptPivotHits = (text.match(/however|but|on the other hand|at the same time/gi) || []).length;

  let risk = 44 + repeatedOpenings * 7 + (uniqueRatio < 0.45 ? 12 : 0) + (abruptPivotHits > 4 ? 8 : 0);
  risk = clamp(risk, 8, 95);

  const reasons = [];
  if (repeatedOpenings >= 2) reasons.push("Repeated sentence openings suggest templated generation.");
  if (uniqueRatio < 0.45) reasons.push("Low lexical diversity can indicate synthetic patterning.");
  if (abruptPivotHits > 4) reasons.push("High pivot count may indicate coherence drift.");

  return { name: "Consistency", risk, reasons: reasons.slice(0, 2) };
}

function groundingAgent(text, words) {
  const lower = text.toLowerCase();
  const citationLike = (text.match(/\[[0-9]+\]|\(\d{4}\)|according to|source|study/gi) || []).length;
  const concreteSignals = (text.match(/\b\d+(\.\d+)?%|\b\d{4}\b|http(s)?:\/\//gi) || []).length;
  const sweepingClaims = (lower.match(/everyone knows|it is clear that|no doubt|obviously/gi) || []).length;

  let risk = 46 + sweepingClaims * 10 - citationLike * 7 - Math.min(concreteSignals, 4) * 3;
  risk = clamp(risk, 8, 95);

  const reasons = [];
  if (sweepingClaims > 0) reasons.push("Sweeping claims found without explicit support.");
  if (citationLike === 0 && words.length > 70) reasons.push("No source-like cues detected in a detailed answer.");
  if (citationLike > 0) reasons.push("Includes reference-style language that lowers grounding risk.");

  return { name: "Grounding", risk, reasons: reasons.slice(0, 2) };
}

function verdictFromRisk(score, uncertainty) {
  if (uncertainty >= 65) return "Uncertain";
  if (score >= 75) return "High Hallucination Risk";
  if (score >= 60) return "Likely Hallucination";
  if (score <= 35) return "Likely Grounded";
  return "Needs Review";
}

function scoreTrust(risk, uncertainty) {
  return clamp(Math.round(100 - (risk * 0.75 + uncertainty * 0.45)), 5, 95);
}

function analyzeText(text, weights) {
  const words = tokenize(text);
  const calibratedWeights = normalizeWeights(weights);

  const skeptic = skepticAgent(text, words);
  const consistency = consistencyAgent(text, words);
  const grounding = groundingAgent(text, words);

  const weightedRisk =
    skeptic.risk * calibratedWeights.skeptic +
    consistency.risk * calibratedWeights.consistency +
    grounding.risk * calibratedWeights.grounding;

  const spread = Math.max(skeptic.risk, consistency.risk, grounding.risk) - Math.min(skeptic.risk, consistency.risk, grounding.risk);
  const uncertainty = clamp(Math.round(35 + spread * 0.9), 20, 95);
  const risk = clamp(Math.round(weightedRisk), 5, 95);
  const trust = scoreTrust(risk, uncertainty);

  const verdict = verdictFromRisk(risk, uncertainty);

  const topReasons = [...skeptic.reasons, ...consistency.reasons, ...grounding.reasons].slice(0, 5);

  return {
    hallucinationRisk: risk,
    uncertainty,
    trust,
    verdict,
    topReasons,
    agents: [skeptic, consistency, grounding],
    weights: calibratedWeights
  };
}

function adaptWeights(currentWeights, feedback) {
  const next = { ...normalizeWeights(currentWeights) };
  const direction = feedback.correct ? -1 : 1;
  const target = feedback.target || "skeptic";

  if (next[target]) {
    next[target] = clamp(next[target] + 0.06 * direction, 0.05, 0.8);
  }

  // Slightly shift all other weights opposite direction for a stable sum.
  Object.keys(next).forEach((key) => {
    if (key !== target) {
      next[key] = clamp(next[key] - 0.03 * direction, 0.05, 0.8);
    }
  });

  return normalizeWeights(next);
}

module.exports = {
  analyzeText,
  adaptWeights
};
