const DEFAULT_HF_MODELS = [
  "Ateeqq/ai-vs-human-image-detector",
  "umm-maybe/AI-image-detector"
];

const MODEL_LABEL_MAPS = {
  "Ateeqq/ai-vs-human-image-detector": {
    ai: ["ai", "0", "label_0"],
    human: ["hum", "human", "1", "label_1"]
  },
  "umm-maybe/AI-image-detector": {
    ai: ["artificial", "ai", "0", "label_0"],
    human: ["human", "real", "1", "label_1"]
  }
};

function resolveModelList() {
  const configured = import.meta.env.VITE_HF_IMAGE_MODELS;
  if (!configured) {
    return DEFAULT_HF_MODELS;
  }

  const models = configured
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  return models.length > 0 ? models : DEFAULT_HF_MODELS;
}

function scoreFromLabel(label, score) {
  const normalized = String(label || "").toLowerCase();

  const aiHints = ["ai", "generated", "synthetic", "fake", "cg", "diffusion"];
  const humanHints = ["human", "real", "natural", "authentic", "camera", "photo"];

  if (aiHints.some((hint) => normalized.includes(hint))) {
    return { ai: score, human: 1 - score, mapped: true };
  }

  if (humanHints.some((hint) => normalized.includes(hint))) {
    return { ai: 1 - score, human: score, mapped: true };
  }

  return { ai: 0.5, human: 0.5, mapped: false };
}

function scoreFromLabelWithModel(label, score, model) {
  const normalized = String(label || "").toLowerCase();
  const modelMap = MODEL_LABEL_MAPS[model];

  if (modelMap) {
    if (modelMap.ai.includes(normalized)) {
      return { ai: score, human: 1 - score, mapped: true };
    }

    if (modelMap.human.includes(normalized)) {
      return { ai: 1 - score, human: score, mapped: true };
    }
  }

  return scoreFromLabel(normalized, score);
}

function normalizePredictions(payload) {
  if (Array.isArray(payload) && payload.length > 0) {
    if (Array.isArray(payload[0])) {
      return payload[0];
    }

    return payload;
  }

  if (payload && typeof payload === "object" && payload.label) {
    return [payload];
  }

  return [];
}

function extractModelAiProbability(predictions, model) {
  const mapped = predictions
    .map((item) => {
      const score = clamp(Number(item.score) || 0, 0, 1);
      const mappedScore = scoreFromLabelWithModel(item.label, score, model);

      return {
        label: String(item.label || "unknown"),
        score,
        mappedScore,
        mapped: mappedScore.mapped
      };
    })
    .filter((item) => item.score > 0);

  if (mapped.length === 0) {
    return {
      ai: 0.5,
      human: 0.5,
      mapped: false,
      topLabel: "unknown",
      topScore: 0.5
    };
  }

  const top = [...mapped].sort((a, b) => b.score - a.score)[0];
  const mappedOnly = mapped.filter((item) => item.mapped);

  if (mappedOnly.length === 0) {
    return {
      ai: 0.5,
      human: 0.5,
      mapped: false,
      topLabel: top.label,
      topScore: top.score
    };
  }

  const weightedAi = mappedOnly.reduce((sum, item) => sum + (item.mappedScore.ai * item.score), 0);
  const weight = mappedOnly.reduce((sum, item) => sum + item.score, 0);
  const ai = weight > 0 ? weightedAi / weight : 0.5;

  return {
    ai,
    human: 1 - ai,
    mapped: true,
    topLabel: top.label,
    topScore: top.score
  };
}

async function callHfModel(file, model, apiKey) {
  const endpoint = `https://api-inference.huggingface.co/models/${model}?wait_for_model=true`;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": file.type || "application/octet-stream",
        Accept: "application/json"
      },
      body: file
    });

    const payload = await response.json();
    const predictions = normalizePredictions(payload);

    if (response.ok && predictions.length > 0) {
      return predictions;
    }

    const loading = payload?.error && String(payload.error).toLowerCase().includes("loading");
    const waitSeconds = Number(payload?.estimated_time);

    if (loading && attempt < 3) {
      const sleepMs = Number.isFinite(waitSeconds)
        ? clamp(Math.round(waitSeconds * 1000), 1000, 9000)
        : 1800;
      await new Promise((resolve) => setTimeout(resolve, sleepMs));
      continue;
    }

    if (!response.ok) {
      const message = payload?.error || `Model ${model} request failed.`;
      throw new Error(message);
    }

    throw new Error(`Model ${model} returned no classification results.`);
  }

  throw new Error(`Model ${model} did not return a usable response.`);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function summarizeConsensus(aiScores) {
  const mean = aiScores.reduce((sum, value) => sum + value, 0) / aiScores.length;
  const variance = aiScores.reduce((sum, value) => sum + (value - mean) ** 2, 0) / aiScores.length;
  const stdDev = Math.sqrt(variance);

  // Convert disagreement into an agreement score between 0 and 1.
  // 0.25 std-dev means strong disagreement in binary classification.
  const agreement = clamp(1 - stdDev / 0.25, 0, 1);

  return { mean, stdDev, agreement };
}

export async function analyzeImageFile(file) {
  if (!file) {
    return { error: "Please upload an image first." };
  }

  if (!file.type.startsWith("image/")) {
    return { error: "Only image files are supported." };
  }

  if (file.size > 8 * 1024 * 1024) {
    return { error: "Image is too large. Please upload a file under 8MB." };
  }

  const apiKey = import.meta.env.VITE_HF_API_TOKEN;
  if (!apiKey) {
    return {
      ai: 50,
      human: 50,
      verdict: "Uncertain",
      reasons: [
        "No Hugging Face API token configured.",
        "Set VITE_HF_API_TOKEN in your RAW_app/.env file to enable cloud image detection."
      ]
    };
  }

  const models = resolveModelList();
  const providerErrors = [];
  const successful = [];

  for (const model of models) {
    try {
      const predictions = await callHfModel(file, model, apiKey);
      const modelScore = extractModelAiProbability(predictions, model);
      const topConfidence = clamp(modelScore.topScore || 0.5, 0.05, 0.99);
      const weight = modelScore.mapped ? topConfidence : topConfidence * 0.55;

      successful.push({
        model,
        label: modelScore.topLabel,
        mapped: {
          ai: modelScore.ai,
          human: modelScore.human,
          mapped: modelScore.mapped
        },
        weight,
        confidence: topConfidence
      });
    } catch (error) {
      providerErrors.push(`${model}: ${error.message}`);
    }
  }

  if (successful.length > 0) {
    const weightedSum = successful.reduce((sum, item) => sum + (item.mapped.ai * item.weight), 0);
    const totalWeight = successful.reduce((sum, item) => sum + item.weight, 0);
    const aiRaw = totalWeight > 0 ? weightedSum / totalWeight : 0.5;

    const { agreement, stdDev } = summarizeConsensus(successful.map((item) => item.mapped.ai));

    // Pull results toward neutral when models disagree strongly.
    const aiAdjusted = 0.5 + (aiRaw - 0.5) * agreement;

    const ai = Math.round(clamp(aiAdjusted * 100, 1, 99));
    const human = 100 - ai;

    let verdict = "Uncertain";
    if (agreement < 0.4) verdict = "Uncertain (Model Disagreement)";
    else if (ai >= 80) verdict = "AI Generated (High Confidence)";
    else if (ai >= 60) verdict = "Likely AI Generated";
    else if (human >= 80) verdict = "Human Captured/Created (High Confidence)";
    else if (human >= 60) verdict = "Likely Human Captured/Created";

    const reasons = [
      `Consensus from ${successful.length}/${models.length} free model(s).`,
      `Model agreement: ${Math.round(agreement * 100)}% (std-dev ${stdDev.toFixed(2)}).`
    ];

    const sampleProviders = successful.slice(0, 3).map((item) => {
      return `${item.model}: ${item.label} (${Math.round(item.confidence * 100)}%)`;
    });

    reasons.push(...sampleProviders);

    if (successful.some((item) => !item.mapped.mapped)) {
      reasons.push("Some labels were ambiguous and down-weighted.");
    }

    if (providerErrors.length > 0) {
      reasons.push(`Some models failed: ${providerErrors.slice(0, 2).join(" | ")}`);
    }

    return { ai, human, verdict, reasons };
  }

  return {
    ai: 50,
    human: 50,
    verdict: "Uncertain",
    reasons: [
      "All configured free API models failed.",
      ...providerErrors.slice(0, 2)
    ]
  };
}
