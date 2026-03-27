const FORMAL_WORDS = new Set([
  "therefore", "moreover", "furthermore", "hence", "thus", "consequently",
  "notwithstanding", "however", "additionally", "specifically", "regarding",
  "utilize", "demonstrate", "significant", "substantial", "comprehensive"
]);

const INFORMAL_WORDS = new Set([
  "lol", "omg", "kinda", "sorta", "gonna", "wanna", "yeah", "nah", "dude",
  "honestly", "basically", "totally", "really", "actually", "youknow", "btw"
]);

const AI_STYLE_PHRASES = [
  "in conclusion",
  "to summarize",
  "it is important to note",
  "in today's",
  "this suggests that",
  "one can",
  "overall,",
  "in summary"
];

const AI_FOOTPRINT_PHRASES = [
  "as an ai",
  "as a language model",
  "i cannot provide",
  "i can't provide",
  "i cannot browse",
  "i don't have personal opinions",
  "i do not have personal opinions",
  "i do not have access to",
  "i cannot access real-time",
  "here is a refined",
  "based on the information provided",
  "it is important to note that"
];

const HUMAN_FOOTPRINT_PHRASES = [
  "i remember",
  "when i was",
  "my mom",
  "my dad",
  "my friend",
  "in my experience",
  "from my experience",
  "i made a mistake",
  "i messed up",
  "i was there"
];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function tokenizeWords(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9'\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function splitSentences(text) {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function roundPercent(value) {
  return Math.round(clamp(value, 10, 90));
}

function buildVerdict(ai, human, confidence) {
  const diff = Math.abs(ai - human);

  if (confidence < 60 || diff <= 10) {
    return "Uncertain";
  }
  if (ai >= 72) {
    return "AI Generated";
  }
  if (ai >= 58) {
    return "Likely AI";
  }
  if (human >= 72) {
    return "Human";
  }
  if (human >= 58) {
    return "Likely Human";
  }
  return "Uncertain";
}

function scoreAiLikeSentences(sentences) {
  return sentences
    .map((sentence) => {
      const s = sentence.toLowerCase();
      const words = tokenizeWords(sentence);
      const uniqueRatio = words.length > 0 ? new Set(words).size / words.length : 1;

      let score = 0;
      if (AI_STYLE_PHRASES.some((phrase) => s.includes(phrase))) score += 2;
      if (/\b(it is|there is|there are)\b/.test(s)) score += 1;
      if (words.length >= 14 && uniqueRatio < 0.55) score += 1;
      if (/\b(is|are|was|were|been|be)\s+\w+ed\b/.test(s)) score += 1;

      return { sentence: sentence.trim(), score };
    })
    .filter((item) => item.score >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map((item) => item.sentence);
}

function applySignal({ condition, ai, human, reason }, bucket) {
  if (!condition) return;
  bucket.aiPoints += ai;
  bucket.humanPoints += human;
  if (reason) bucket.reasons.push(reason);
}

function analyzeSignals(text) {
  const words = tokenizeWords(text);
  const sentences = splitSentences(text);
  const sentenceLengths = sentences.map((s) => tokenizeWords(s).length).filter(Boolean);

  const summary = {
    aiPoints: 0,
    humanPoints: 0,
    reasons: []
  };

  const avgLen = sentenceLengths.reduce((sum, n) => sum + n, 0) / Math.max(sentenceLengths.length, 1);
  const variance = sentenceLengths.reduce((sum, n) => sum + (n - avgLen) ** 2, 0) / Math.max(sentenceLengths.length, 1);
  const stdDev = Math.sqrt(variance);

  applySignal(
    {
      condition: sentenceLengths.length >= 4 && stdDev < 3,
      ai: 16,
      human: 0,
      reason: "Low burstiness: sentence lengths are very uniform."
    },
    summary
  );

  applySignal(
    {
      condition: sentenceLengths.length >= 4 && stdDev > 6.5,
      ai: 0,
      human: 12,
      reason: "High burstiness: sentence structure varies naturally."
    },
    summary
  );

  const uniqueWords = new Set(words).size;
  const lexicalDiversity = uniqueWords / Math.max(words.length, 1);
  const repeatedWords = words.length - uniqueWords;
  const repetitionRatio = repeatedWords / Math.max(words.length, 1);

  applySignal(
    {
      condition: lexicalDiversity < 0.43,
      ai: 15,
      human: 0,
      reason: "Perplexity-like signal: low word variety and repetitive phrasing."
    },
    summary
  );

  applySignal(
    {
      condition: lexicalDiversity > 0.62,
      ai: 0,
      human: 11,
      reason: "Perplexity-like signal: richer vocabulary spread."
    },
    summary
  );

  applySignal(
    {
      condition: repetitionRatio > 0.2,
      ai: 10,
      human: 0,
      reason: "Repeated token usage suggests templated generation."
    },
    summary
  );

  const formalCount = words.filter((word) => FORMAL_WORDS.has(word)).length;
  const informalCount = words.filter((word) => INFORMAL_WORDS.has(word)).length;
  const formalRatio = formalCount / Math.max(words.length, 1);

  applySignal(
    {
      condition: formalRatio > 0.09 && informalCount <= 1,
      ai: 11,
      human: 0,
      reason: "Tone leans highly formal with limited conversational language."
    },
    summary
  );

  applySignal(
    {
      condition: informalCount >= 2,
      ai: 0,
      human: 11,
      reason: "Informal vocabulary suggests human conversational tone."
    },
    summary
  );

  const personalPronouns = (text.match(/\b(i|me|my|mine|we|our|ours|us)\b/gi) || []).length;
  const pronounRatio = personalPronouns / Math.max(words.length, 1);

  applySignal(
    {
      condition: pronounRatio >= 0.06,
      ai: 0,
      human: 14,
      reason: "Personal pronoun usage indicates first-person human voice."
    },
    summary
  );

  applySignal(
    {
      condition: pronounRatio < 0.02,
      ai: 8,
      human: 0,
      reason: "Very low personal voice can indicate generic AI narration."
    },
    summary
  );

  const aiPhraseHits = AI_STYLE_PHRASES.reduce((count, phrase) => {
    return count + (text.toLowerCase().includes(phrase) ? 1 : 0);
  }, 0);

  applySignal(
    {
      condition: aiPhraseHits >= 2,
      ai: 12,
      human: 0,
      reason: "Multiple high-probability AI transition phrases detected."
    },
    summary
  );

  const openingBigrams = sentences
    .map((sentence) => tokenizeWords(sentence).slice(0, 2).join(" "))
    .filter(Boolean);
  const repeatedOpenings = openingBigrams.length - new Set(openingBigrams).size;

  applySignal(
    {
      condition: repeatedOpenings >= 2,
      ai: 8,
      human: 0,
      reason: "Repeated sentence openings suggest templated structure."
    },
    summary
  );

  return {
    ...summary,
    words,
    sentences,
    highlights: scoreAiLikeSentences(sentences)
  };
}

function analyzeTextFootprints(text) {
  const lowered = text.toLowerCase();
  let aiHits = 0;
  let humanHits = 0;
  const reasons = [];

  AI_FOOTPRINT_PHRASES.forEach((phrase) => {
    if (lowered.includes(phrase)) aiHits += 1;
  });

  HUMAN_FOOTPRINT_PHRASES.forEach((phrase) => {
    if (lowered.includes(phrase)) humanHits += 1;
  });

  const hasSignal = aiHits > 0 || humanHits > 0;

  if (aiHits > 0) {
    reasons.push("Explicit AI footprint phrases detected in wording.");
  }
  if (humanHits > 0) {
    reasons.push("Personal lived-experience phrases detected.");
  }

  const ai = hasSignal ? aiHits / Math.max(aiHits + humanHits, 1) : 0.5;

  return {
    hasSignal,
    ai,
    human: 1 - ai,
    aiHits,
    humanHits,
    reasons
  };
}

export async function analyzeText(text) {
  if (!text || text.trim().length === 0) {
    return { error: "Please enter some text." };
  }

  const wordCount = text.trim().split(/\s+/).length;
  if (wordCount < 15) {
    return { error: "Minimum 15 words required for reliable analysis." };
  }

  // Multi-step analysis with artificial thinking delay.
  await sleep(320 + Math.floor(Math.random() * 220));
  const base = analyzeSignals(text);
  const footprint = analyzeTextFootprints(text);
  await sleep(360 + Math.floor(Math.random() * 250));

  const aiPoints = Math.max(base.aiPoints, 1);
  const humanPoints = Math.max(base.humanPoints, 1);
  const total = aiPoints + humanPoints;

  const structuralAi = roundPercent((aiPoints / total) * 100);

  // Footprint-dominant blending: explicit text footprints outweigh style heuristics.
  let footprintWeight = 0;
  if (footprint.hasSignal) {
    footprintWeight = 0.72;
    if (footprint.aiHits >= 2 || footprint.humanHits >= 2) {
      footprintWeight = 0.86;
    }
  }

  const blendedAi = (structuralAi / 100) * (1 - footprintWeight) + footprint.ai * footprintWeight;
  let ai = roundPercent(blendedAi * 100);
  let human = 100 - ai;

  const margin = Math.abs(aiPoints - humanPoints);
  let confidence = clamp(Math.round(52 + margin * 1.35 + Math.min(base.reasons.length * 1.7, 10)), 50, 90);

  if (footprint.hasSignal) {
    const footprintAiPct = Math.round(footprint.ai * 100);
    const agreement = Math.abs(footprintAiPct - structuralAi);
    if (agreement <= 16) confidence = clamp(confidence + 8, 50, 90);
    else if (agreement >= 35) confidence = clamp(confidence - 4, 50, 90);
    if (footprintWeight >= 0.86) confidence = clamp(confidence + 4, 50, 90);
  }

  if (Math.abs(ai - human) <= 10) {
    ai = 50;
    human = 50;
    confidence = Math.min(confidence, 62);
  }

  const verdict = buildVerdict(ai, human, confidence);
  const reasons = base.reasons.slice(0, 5);

  if (footprint.hasSignal) {
    reasons.unshift("Footprint-dominant mode enabled: explicit text footprints weighted higher than writing-style cues.");
    reasons.push(...footprint.reasons);
  }

  await sleep(300 + Math.floor(Math.random() * 220));

  if (reasons.length === 0) {
    reasons.push("Signals were balanced across AI-like and human-like writing patterns.");
  }

  return {
    ai,
    human,
    confidence,
    verdict,
    reasons,
    highlights: base.highlights
  };
}