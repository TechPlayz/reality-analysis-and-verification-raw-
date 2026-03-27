// RAW - Reality Analysis & Verification
// Clean, structured, and stable detection logic

export function analyzeText(text) {
  // -----------------------------
  // 1. EMPTY CHECK
  // -----------------------------
  if (!text || text.trim().length === 0) {
    return { error: "Please enter some text." };
  }

  const words = text.trim().split(/\s+/);

  // -----------------------------
  // 2. MIN WORD CHECK
  // -----------------------------
  if (words.length < 15) {
    return {
      error: "Minimum 15 words required for reliable analysis."
    };
  }

  // -----------------------------
  // 3. INITIAL SETUP
  // -----------------------------
  let aiScore = 0;
  let humanScore = 0;
  let reasons = [];
  let highlights = [];

  const sentences = text
    .split(/[.!?]/)
    .map(s => s.trim())
    .filter(Boolean);

  // -----------------------------
  // 4. GIBBERISH CHECK
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
  // 5. CODE DETECTION
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
      reasons.push("Consistent code structure (AI-like)");
    } else {
      humanScore += 30;
      reasons.push("Irregular coding style (human-like)");
    }

    if (text.includes("return") && text.includes("function")) {
      aiScore += 25;
    }
  }

  // -----------------------------
  // 6. HUMAN SIGNALS
  // -----------------------------
  const personalWords = ["i", "my", "me", "we", "our", "us", "bro", "lol"];
  const personalCount = words.filter(w => personalWords.includes(w)).length;

  if (personalCount >= 2) {
    humanScore += 45;
    reasons.push("Personal human tone detected");
  }

  if (text.includes("!!") || text.includes("?") || text.includes("...")) {
    humanScore += 20;
    reasons.push("Informal writing style");
  }

  if (words.length < 25) {
    humanScore += 10;
    reasons.push("Short casual structure");
  }

  // -----------------------------
  // 7. AI SIGNALS
  // -----------------------------
  const formalWords = [
    "significantly",
    "moreover",
    "therefore",
    "furthermore",
    "efficiently",
    "enhanced",
    "various",
    "overall",
    "contextually"
  ];

  const formalCount = words.filter(w => formalWords.includes(w)).length;

  if (formalCount >= 2) {
    aiScore += 35;
    reasons.push("Formal AI-like vocabulary");
  }

  const lengths = sentences.map(s => s.length);

  const avgLen =
    lengths.reduce((a, b) => a + b, 0) / (lengths.length || 1);

  const variance =
    lengths.reduce((sum, len) => sum + Math.abs(len - avgLen), 0) /
    (lengths.length || 1);

  if (variance < 18 && sentences.length > 2) {
    aiScore += 30;
    reasons.push("Uniform sentence structure");
  } else {
    humanScore += 15;
  }

  if (words.length > 90) {
    aiScore += 20;
    reasons.push("Long structured content");
  }

  // -----------------------------
  // 8. REPETITION CHECK
  // -----------------------------
  const uniqueWords = new Set(words);
  const repetition = words.length - uniqueWords.size;

  if (repetition > 20) {
    aiScore += 15;
    reasons.push("Repetitive phrasing detected");
  }

  // -----------------------------
  // 9. HIGHLIGHT AI SENTENCES
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
  // 10. FINAL CALCULATION
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

  // prevent extreme values
  if (ai > 95) ai = 95;
  if (human > 95) human = 95;

  // -----------------------------
  // 11. VERDICT
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