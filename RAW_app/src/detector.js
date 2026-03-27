// RAW - Reality Analysis & Verification
// Final refined heuristic-based detector (balanced + stable)

export function analyzeText(text) {
  if (!text || text.trim().length === 0) {
    return { error: "Please enter some text." };
  }

  const words = text.trim().split(/\s+/);

  // -----------------------------
  // MIN WORD CHECK (STRICT)
  // -----------------------------
  if (words.length < 15) {
    return {
      error: "Input too short. Please enter at least 15 words for reliable analysis."
    };
  }

  let aiScore = 0;
  let humanScore = 0;
  let reasons = [];
  let highlights = [];

  const lowerText = text.toLowerCase();
  const sentences = text.split(/[.!?]/).map(s => s.trim()).filter(Boolean);

  // -----------------------------
  // 1. RANDOM / GIBBERISH DETECTION
  // -----------------------------
  const avgWordLength =
    words.reduce((sum, w) => sum + w.length, 0) / words.length;

  if (avgWordLength > 10) {
    return {
      ai: 5,
      human: 95,
      reasons: ["Text appears random or non-meaningful"],
      highlights: [],
      verdict: "Human Likely"
    };
  }

  // -----------------------------
  // 2. CODE DETECTION
  // -----------------------------
  const codePatterns = [";", "{", "}", "()", "=>", "function", "const", "let", "return"];
  const isCode = codePatterns.some(p => text.includes(p));

  if (isCode) {
    reasons.push("Code detected");

    const lines = text.split("\n").filter(l => l.trim());

    const avg =
      lines.reduce((a, b) => a + b.length, 0) / (lines.length || 1);

    const variance =
      lines.reduce((sum, l) => sum + Math.abs(l.length - avg), 0) /
      (lines.length || 1);

    if (variance < 12) {
      aiScore += 35;
      reasons.push("Highly consistent code formatting (AI-like)");
    } else {
      humanScore += 30;
      reasons.push("Irregular human coding style");
    }

    if (text.includes("return") && text.includes("function")) {
      aiScore += 25;
    }
  }

  // -----------------------------
  // 3. HUMAN SIGNALS (STRONG)
  // -----------------------------
  const personalWords = ["i", "my", "me", "we", "our", "us", "bro", "lol"];
  const personalCount = words.filter(w => personalWords.includes(w)).length;

  if (personalCount >= 2) {
    humanScore += 45;
    reasons.push("Strong personal / human tone");
  }

  if (text.includes("!!") || text.includes("?") || text.includes("...")) {
    humanScore += 20;
    reasons.push("Informal human writing style");
  }

  if (words.length < 25) {
    humanScore += 15;
    reasons.push("Short casual expression");
  }

  // -----------------------------
  // 4. AI SIGNALS (STRUCTURE)
  // -----------------------------
  const formalWords = [
    "significantly", "moreover", "therefore",
    "furthermore", "efficiently", "enhanced",
    "various", "notably", "overall", "contextually"
  ];

  const formalCount = words.filter(w => formalWords.includes(w)).length;

  if (formalCount >= 2) {
    aiScore += 35;
    reasons.push("Formal AI-style vocabulary");
  }

  // Sentence uniformity
  const lengths = sentences.map(s => s.length);
  const avgLen =
    lengths.reduce((a, b) => a + b, 0) / (lengths.length || 1);

  const variance =
    lengths.reduce((sum, len) => sum + Math.abs(len - avgLen), 0) /
    (lengths.length || 1);

  if (variance < 18 && sentences.length > 2) {
    aiScore += 30;
    reasons.push("Highly uniform sentence structure");
  } else {
    humanScore += 15;
  }

  // Long structured text
  if (words.length > 90) {
    aiScore += 20;
    reasons.push("Long structured response");
  }

  // -----------------------------
  // 5. REPETITION CHECK
  // -----------------------------
  const uniqueWords = new Set(words);
  const repetition = words.length - uniqueWords.size;

  if (repetition > 20) {
    aiScore += 15;
    reasons.push("Repetitive phrasing pattern");
  }

  // -----------------------------
  // 6. HIGHLIGHT AI-LIKE SENTENCES
  // -----------------------------
  sentences.forEach(sentence => {
    let s = sentence.toLowerCase();
    let score = 0;

    if (s.split(" ").length > 12) score++;

    formalWords.forEach(w => {
      if (s.includes(w)) score++;
    });

    if (score >= 2) {
      highlights.push(sentence);
    }
  });

  // -----------------------------
  // 7. FINAL CALCULATION (STABLE)
  // -----------------------------
  let total = aiScore + humanScore;

  if (total === 0) {
    return {
      ai: 50,
      human: 50,
      reasons: ["Not enough signals detected"],
      highlights,
      verdict: "Uncertain"
    };
  }

  let ai = Math.round((aiScore / total) * 100);
  let human = 100 - ai;

  // Prevent extreme overconfidence
  if (ai > 95) ai = 95;
  if (human > 95) human = 95;

  // -----------------------------
  // 8. VERDICT SYSTEM
  // -----------------------------
  let verdict = "Uncertain";

  if (ai >= 70) verdict = "AI Likely";
  else if (human >= 70) verdict = "Human Likely";

  return {
    ai,
    human,
    reasons,
    highlights,
    verdict
  };
}