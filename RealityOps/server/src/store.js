const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");
const WEIGHTS_FILE = path.join(DATA_DIR, "weights.json");
const LOG_FILE = path.join(DATA_DIR, "feedback-log.json");

const DEFAULT_WEIGHTS = {
  skeptic: 0.38,
  consistency: 0.32,
  grounding: 0.3
};

function ensureDataFiles() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(WEIGHTS_FILE)) {
    fs.writeFileSync(WEIGHTS_FILE, JSON.stringify(DEFAULT_WEIGHTS, null, 2));
  }

  if (!fs.existsSync(LOG_FILE)) {
    fs.writeFileSync(LOG_FILE, JSON.stringify([], null, 2));
  }
}

function readJson(filePath, fallback) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function getWeights() {
  ensureDataFiles();
  const weights = readJson(WEIGHTS_FILE, DEFAULT_WEIGHTS);
  return normalizeWeights(weights);
}

function normalizeWeights(weights) {
  const keys = ["skeptic", "consistency", "grounding"];
  const sum = keys.reduce((acc, key) => acc + Math.max(0.01, Number(weights[key]) || 0), 0);

  return keys.reduce((acc, key) => {
    acc[key] = Math.max(0.01, Number(weights[key]) || 0) / sum;
    return acc;
  }, {});
}

function saveWeights(weights) {
  ensureDataFiles();
  writeJson(WEIGHTS_FILE, normalizeWeights(weights));
}

function appendFeedback(entry) {
  ensureDataFiles();
  const existing = readJson(LOG_FILE, []);
  existing.push(entry);
  writeJson(LOG_FILE, existing.slice(-300));
}

module.exports = {
  getWeights,
  saveWeights,
  appendFeedback,
  normalizeWeights,
  DEFAULT_WEIGHTS
};
