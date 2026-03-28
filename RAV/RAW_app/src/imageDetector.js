function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const AI_METADATA_KEYWORDS = [
  "stable diffusion",
  "midjourney",
  "dall-e",
  "dalle",
  "comfyui",
  "automatic1111",
  "invokeai",
  "fooocus",
  "firefly",
  "kandinsky",
  "diffusers",
  "sdxl",
  "flux",
  "runway",
  "prompt",
  "negative prompt",
  "sampler",
  "cfg",
  "seed",
  "steps"
];

const CAMERA_BRANDS = [
  "canon",
  "nikon",
  "sony",
  "fujifilm",
  "panasonic",
  "leica",
  "olympus",
  "pentax",
  "hasselblad",
  "iphone",
  "samsung",
  "xiaomi",
  "google pixel"
];

function createImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const imageUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(imageUrl);
      resolve(img);
    };

    img.onerror = () => {
      URL.revokeObjectURL(imageUrl);
      reject(new Error("Could not read image data."));
    };

    img.src = imageUrl;
  });
}

function countMatches(haystack, keywords) {
  const text = haystack.toLowerCase();
  return keywords.reduce((count, keyword) => {
    return count + (text.includes(keyword) ? 1 : 0);
  }, 0);
}

async function analyzeMetadataFootprint(file) {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);

  // We only need a prefix for keyword scanning while keeping runtime low.
  const scanLength = Math.min(bytes.length, 2_000_000);
  const textBlob = new TextDecoder("latin1").decode(bytes.slice(0, scanLength)).toLowerCase();

  let aiPoints = 0;
  let humanPoints = 0;
  const reasons = [];

  const aiKeywordHits = countMatches(textBlob, AI_METADATA_KEYWORDS);
  if (aiKeywordHits >= 2) {
    aiPoints += 28;
    reasons.push("Metadata footprint contains generator/tool signatures.");
  } else if (aiKeywordHits === 1) {
    aiPoints += 12;
    reasons.push("Metadata includes one AI-generation related marker.");
  }

  const cameraHits = countMatches(textBlob, CAMERA_BRANDS);
  const hasExifBlock = textBlob.includes("exif");
  const hasLensHint = textBlob.includes("lens") || textBlob.includes("fnumber") || textBlob.includes("exposure");

  if (cameraHits > 0 && (hasExifBlock || hasLensHint)) {
    humanPoints += 22;
    reasons.push("Metadata includes camera/exposure-like capture fields.");
  }

  if (textBlob.includes("c2pa") || textBlob.includes("content credentials")) {
    reasons.push("Content credentials marker detected in metadata.");
    // C2PA can represent edits or generation, so keep it informational.
  }

  const total = aiPoints + humanPoints;
  const hasSignal = total > 0;
  const ai = hasSignal ? aiPoints / total : 0.5;

  return {
    hasSignal,
    ai,
    human: 1 - ai,
    reasons
  };
}

function runSignalPass(data, strideBytes) {
  let variation = 0;
  let edgeStrength = 0;
  let colorSpread = 0;
  let entropyProxy = 0;
  let sampleCount = 0;

  for (let i = 0; i < data.length - (strideBytes + 8); i += strideBytes) {
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
    edgeStrength += Math.abs(r - r3) + Math.abs(g - g3) + Math.abs(b - b3);

    const avg = (r + g + b) / 3;
    colorSpread += Math.abs(r - avg) + Math.abs(g - avg) + Math.abs(b - avg);

    const intensity = avg / 255;
    const centered = Math.abs(intensity - 0.5);
    entropyProxy += 1 - centered;

    sampleCount += 1;
  }

  const safeCount = Math.max(sampleCount, 1);

  return {
    variation: variation / safeCount,
    edgeStrength: edgeStrength / safeCount,
    colorSpread: colorSpread / safeCount,
    entropyProxy: entropyProxy / safeCount
  };
}

function aggregatePasses(passes) {
  const weight = 1 / passes.length;
  return passes.reduce(
    (acc, pass) => {
      acc.variation += pass.variation * weight;
      acc.edgeStrength += pass.edgeStrength * weight;
      acc.colorSpread += pass.colorSpread * weight;
      acc.entropyProxy += pass.entropyProxy * weight;
      return acc;
    },
    { variation: 0, edgeStrength: 0, colorSpread: 0, entropyProxy: 0 }
  );
}

function analyzeVintageSignals(data) {
  let monochromeCount = 0;
  let warmToneCount = 0;
  let noiseAccumulator = 0;
  let samples = 0;

  for (let i = 0; i < data.length - 8; i += 16) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const r2 = data[i + 4];
    const g2 = data[i + 5];
    const b2 = data[i + 6];

    const rg = Math.abs(r - g);
    const gb = Math.abs(g - b);
    if (rg < 10 && gb < 10) {
      monochromeCount += 1;
    }

    if (r > g && g > b && (r - b) > 10) {
      warmToneCount += 1;
    }

    const l1 = (r + g + b) / 3;
    const l2 = (r2 + g2 + b2) / 3;
    noiseAccumulator += Math.abs(l1 - l2);
    samples += 1;
  }

  const safe = Math.max(samples, 1);
  return {
    monochromeRatio: monochromeCount / safe,
    warmToneRatio: warmToneCount / safe,
    grainNoise: noiseAccumulator / safe
  };
}

export async function analyzeImageFile(file) {
  if (!file) {
    return { error: "Please upload an image first." };
  }

  if (!file.type.startsWith("image/")) {
    return { error: "Only image files are supported." };
  }

  if (file.size > 10 * 1024 * 1024) {
    return { error: "Image is too large. Please upload a file under 10MB." };
  }

  await sleep(320 + Math.floor(Math.random() * 220));

  let img;
  try {
    img = await createImageFromFile(file);
  } catch (error) {
    return { error: error.message };
  }

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  if (!ctx) {
    return { error: "Image analyzer could not initialize canvas context." };
  }

  const maxSide = 512;
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
  canvas.width = Math.max(64, Math.floor(img.width * scale));
  canvas.height = Math.max(64, Math.floor(img.height * scale));

  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  await sleep(350 + Math.floor(Math.random() * 220));

  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const passes = [8, 16, 24].map((stride) => runSignalPass(data, stride));
  const metrics = aggregatePasses(passes);
  const vintage = analyzeVintageSignals(data);
  const metadata = await analyzeMetadataFootprint(file);

  let score = 0;
  const reasons = [];

  if (metrics.variation < 26) {
    score += 2;
    reasons.push("Low texture variation indicates synthetic smoothness.");
  } else if (metrics.variation > 48) {
    score -= 2;
    reasons.push("Strong texture variation suggests natural capture noise.");
  }

  if (metrics.edgeStrength < 30) {
    score += 2;
    reasons.push("Edge transitions are softer than typical camera photos.");
  } else if (metrics.edgeStrength > 56) {
    score -= 2;
    reasons.push("Edge sharpness is closer to real captured details.");
  }

  if (metrics.colorSpread < 22) {
    score += 1;
    reasons.push("Color distribution appears overly uniform.");
  } else if (metrics.colorSpread > 40) {
    score -= 1;
    reasons.push("Color distribution has natural channel variation.");
  }

  if (metrics.entropyProxy < 0.64) {
    score += 2;
    reasons.push("Lower entropy-like randomness suggests generated patterns.");
  } else if (metrics.entropyProxy > 0.78) {
    score -= 2;
    reasons.push("Higher randomness aligns with real-world image noise.");
  }

  // Old photos and album scans can be soft, warm, and monochrome while still being real.
  if (vintage.monochromeRatio > 0.45 && vintage.grainNoise > 12 && metrics.edgeStrength < 48) {
    score -= 2;
    reasons.push("Monochrome/grain profile resembles scanned or vintage photography.");
  }

  if (vintage.warmToneRatio > 0.34 && metrics.variation >= 24 && metrics.variation <= 58) {
    score -= 2;
    reasons.push("Warm color cast resembles film/album aging rather than synthetic rendering.");
  }

  if (vintage.grainNoise > 18 && metrics.entropyProxy > 0.72) {
    score -= 1;
    reasons.push("Fine luminance grain indicates camera or scan noise.");
  }

  await sleep(300 + Math.floor(Math.random() * 220));

  let visualAi;
  if (score >= 6) visualAi = 86;
  else if (score >= 4) visualAi = 72;
  else if (score <= -6) visualAi = 14;
  else if (score <= -4) visualAi = 30;
  else visualAi = 50;

  // Metadata-dominant blending: when metadata signal exists, trust it more than pixels.
  let metadataWeight = 0;
  if (metadata.hasSignal) {
    metadataWeight = 0.72;

    // If metadata is strongly one-sided, trust it even more.
    if (metadata.ai >= 0.82 || metadata.ai <= 0.18) {
      metadataWeight = 0.86;
    }
  }

  const blendedAi = (visualAi / 100) * (1 - metadataWeight) + metadata.ai * metadataWeight;

  const ai = clamp(Math.round(blendedAi * 100), 10, 90);
  const human = 100 - ai;

  let confidence = clamp(52 + Math.abs(score) * 7, 50, 90);
  if (metadata.hasSignal) {
    const metadataAiPct = Math.round(metadata.ai * 100);
    const agreement = Math.abs(metadataAiPct - visualAi);
    if (agreement <= 16) confidence = clamp(confidence + 8, 50, 90);
    else if (agreement >= 35) confidence = clamp(confidence - 4, 50, 90);

    if (metadataWeight >= 0.86) {
      confidence = clamp(confidence + 4, 50, 90);
    }

    reasons.push("Metadata-dominant mode enabled: metadata footprint weighted higher than visual cues.");
  }

  let verdict = "Uncertain";
  if (confidence >= 62 && ai >= 72) verdict = "AI Generated";
  else if (confidence >= 62 && ai >= 58) verdict = "Likely AI";
  else if (confidence >= 62 && human >= 72) verdict = "Human";
  else if (confidence >= 62 && human >= 58) verdict = "Likely Human";

  if (reasons.length === 0) {
    reasons.push("Signals are mixed across texture, edges, color, and entropy.");
  }

  if (metadata.reasons.length > 0) {
    reasons.push(...metadata.reasons);
  }

  return {
    ai,
    human,
    confidence,
    verdict,
    reasons: reasons.slice(0, 6),
    highlights: []
  };
}

export async function analyzeImageManually(file) {
  return analyzeImageFile(file);
}