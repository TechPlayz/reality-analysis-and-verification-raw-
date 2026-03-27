export function analyzeText(text) {
  // VALIDATION
  if (!text || text.trim().length === 0) {
    return { error: "Please enter some text." };
  }

  const words = text.trim().split(/\s+/);
  if (words.length < 15) {
    return { error: "Minimum 15 words required for reliable analysis." };
  }

  // DETECT IF INPUT IS CODE
  const isCode = detectCode(text);
  
  if (isCode) {
    return analyzeCode(text);
  }

  // Otherwise analyze as natural language
  return analyzeNaturalLanguage(text);
}

function detectCode(text) {
  const codeIndicators = [
    /^[\s]*import\s+/m,
    /^[\s]*export\s+/m,
    /^[\s]*function\s+\w+\s*\(/m,
    /^[\s]*const\s+\w+\s*=/m,
    /^[\s]*let\s+\w+\s*=/m,
    /^[\s]*if\s*\(/m,
    /^[\s]*for\s*\(/m,
    /^[\s]*while\s*\(/m,
    /\{[\s]*\}/,
    /\(\)/,
    /\[\]/,
    /=>[\s]*[\{\(]/,
    /this\./,
    /\.map\(/,
    /\.filter\(/,
    /\.reduce\(/,
    /return[\s]+/m,
    /className=/,
    /onClick=/,
    /onChange=/
  ];

  const codeCount = codeIndicators.filter(regex => regex.test(text)).length;
  return codeCount >= 3;
}

function analyzeCode(text) {
  let reasons = [];
  let highlights = [];
  let aiScore = 0;
  let humanScore = 0;

  const lines = text.split('\n').filter(l => l.trim());
  
  // AI-generated code patterns
  // Over-commented explanations
  const commentCount = (text.match(/\/\/.*[\w\s]+describe|explain|note that|it is|this code/gi) || []).length;
  if (commentCount > lines.length * 0.1) {
    aiScore += 25;
    reasons.push("Over-commented code (AI tendency)");
  }

  // Verbose variable naming
  const verboseVarNames = (text.match(/\w{15,}(?=\s*[=:])/g) || []).length;
  if (verboseVarNames > 2) {
    aiScore += 15;
    reasons.push("Verbose variable naming");
  }

  // Repetitive patterns
  const repeatPatterns = text.match(/\.\w+\(/g) || [];
  const uniquePatterns = new Set(repeatPatterns).size;
  const repetitionRatio = uniquePatterns === 0 ? 0 : repeatPatterns.length / uniquePatterns;
  
  if (repetitionRatio > 3) {
    aiScore += 20;
    reasons.push("Repetitive method chaining patterns");
  }

  // Generic naming
  const genericNames = (text.match(/\b(data|value|item|temp|result|res|tmp|var|obj)\b/gi) || []).length;
  if (genericNames > lines.length * 0.15) {
    aiScore += 18;
    reasons.push("Generic placeholder naming");
  }

  // Inefficient or redundant code patterns
  if (text.match(/\bvar\s+/gi) && !text.match(/\bconst\s+/gi)) {
    aiScore += 10;
    reasons.push("Outdated variable declarations");
  }

  // HUMAN code patterns
  // Concise, meaningful variable names
  const meaningfulNames = (text.match(/\b(user|product|cart|order|auth|config|state|handler|manager|service)\w*\b/gi) || []).length;
  if (meaningfulNames > 2) {
    humanScore += 30;
    reasons.push("Domain-specific meaningful names");
  }

  // React patterns (human developers write natural React)
  const reactPatterns = (text.match(/useState|useEffect|useCallback|useRef|useContext/g) || []).length;
  if (reactPatterns > 0) {
    humanScore += 25;
    reasons.push("Natural React hooks usage");
  }

  // Error handling
  if (text.match(/catch|throw|Error|try/g)) {
    humanScore += 15;
    reasons.push("Proper error handling");
  }

  // Functional programming patterns
  if (text.match(/\.map\(|\.filter\(|\.reduce\(/)) {
    humanScore += 12;
    reasons.push("Functional programming style");
  }

  // Proper imports/exports structure
  if (text.match(/^import\s+/m) && text.match(/export\s+default/m)) {
    humanScore += 20;
    reasons.push("Proper module structure");
  }

  // Consistent formatting
  const indentPatterns = (text.match(/^\s{2,4}(?:const|let|function|if|for|return)/gm) || []).length;
  if (indentPatterns > lines.length * 0.3) {
    humanScore += 10;
    reasons.push("Consistent code indentation");
  }

  // Calculate scores
  const totalScore = aiScore + humanScore;
  
  if (totalScore === 0) {
    return {
      ai: 50,
      human: 50,
      reasons: ["Code analysis inconclusive"],
      highlights: [],
      verdict: "Uncertain"
    };
  }

  let aiPercent = Math.round((aiScore / totalScore) * 100);
  let humanPercent = 100 - aiPercent;

  // Boost for strong human signals
  if (humanScore > aiScore * 2) {
    humanPercent = Math.min(90, humanPercent + 10);
    aiPercent = 100 - humanPercent;
  }

  let verdict = "Uncertain";
  if (aiPercent >= 75) verdict = "AI Generated (High Confidence)";
  else if (aiPercent >= 60) verdict = "Likely AI Generated";
  else if (humanPercent >= 75) verdict = "Human Written (High Confidence)";
  else if (humanPercent >= 60) verdict = "Likely Human Written";

  return { ai: aiPercent, human: humanPercent, reasons, highlights, verdict };
}

function analyzeNaturalLanguage(text) {
  let aiScore = 0;
  let humanScore = 0;
  let reasons = [];
  let highlights = [];

  const words = text.trim().split(/\s+/);
  const sentences = text.split(/[.!?]+/).map(s => s.trim()).filter(Boolean);

  // AI Language Patterns
  const aiPhrases = [
    "as an ai", "as a language model", "as an artificial intelligence",
    "i'm an ai", "i am an ai", "i cannot", "i am unable to",
    "in conclusion", "to summarize", "in summary", "it's important to note",
    "ultimately", "at the end of the day", "the key takeaway",
    "in today's world", "in today's society", "furthermore, it is",
    "it is crucial", "it is essential", "it is vital", "it is important",
    "one can observe", "from a certain perspective", "this can be attributed to",
    "this suggests that", "one of the most important"
  ];

  const humanPhrases = [
    "lol", "haha", "honestly", "i think", "i believe", "i feel",
    "you know", "like", "literally", "actually", "seriously",
    "just saying", "no way", "omg", "wow", "ugh", "ugh"
  ];

  let aiPhraseCount = 0;
  aiPhrases.forEach(phrase => {
    const regex = new RegExp(`\\b${phrase.replace(/\s+/g, "\\s+")}\\b`, "gi");
    aiPhraseCount += (text.match(regex) || []).length;
  });

  let humanPhraseCount = 0;
  humanPhrases.forEach(phrase => {
    const regex = new RegExp(`\\b${phrase.replace(/\s+/g, "\\s+")}\\b`, "gi");
    humanPhraseCount += (text.match(regex) || []).length;
  });

  if (aiPhraseCount > 0) {
    aiScore += aiPhraseCount * 18;
    reasons.push(`${aiPhraseCount} AI-typical phrases detected`);
  }

  if (humanPhraseCount > 0) {
    humanScore += humanPhraseCount * 25;
    reasons.push(`${humanPhraseCount} human-typical phrases/slang detected`);
  }

  // Punctuation patterns
  const exclamationCount = (text.match(/!/g) || []).length;
  const questionCount = (text.match(/\?/g) || []).length;
  const ellipsisCount = (text.match(/\.\.\./g) || []).length;

  if (ellipsisCount > 0) {
    humanScore += 15;
    reasons.push("Ellipsis usage (human thinking style)");
  }

  if (exclamationCount > sentences.length * 0.2) {
    humanScore += 12;
    reasons.push("Emphatic punctuation (human emotion)");
  }

  // Sentence variation
  const sentenceLengths = sentences.map(s => s.split(/\s+/).length);
  const avgLength = sentenceLengths.reduce((a, b) => a + b, 0) / sentenceLengths.length;
  const variance = sentenceLengths.reduce((sum, len) => sum + Math.pow(len - avgLength, 2), 0) / sentenceLengths.length;
  const stdDev = Math.sqrt(variance);

  if (stdDev > 6) {
    humanScore += 15;
    reasons.push("High sentence variation (human writing)");
  } else if (stdDev < 2 && sentences.length > 3) {
    aiScore += 18;
    reasons.push("Low sentence variation (AI smoothness)");
  }

  // Personal pronouns
  const personalCount = (text.match(/\bi\b|\bme\b|\bmy\b|\bwe\b|\bour\b|\bus\b/gi) || []).length;
  const personalRatio = personalCount / words.length;

  if (personalRatio > 0.08) {
    humanScore += 18;
    reasons.push("Strong personal voice (human trait)");
  }

  // Contractions
  const contractions = (text.match(/[a-z]+'[a-z]+/gi) || []).length;
  if (contractions > words.length * 0.03) {
    humanScore += 12;
    reasons.push("Frequent contractions (human speech)");
  }

  // Passive voice
  const passiveCount = (text.match(/\b(is|are|was|were|be|been)\s+\w+ed\b/gi) || []).length;
  if (passiveCount > sentences.length * 0.2) {
    aiScore += 16;
    reasons.push("High passive voice usage (AI style)");
  }

  const totalScore = aiScore + humanScore;

  if (totalScore === 0) {
    return {
      ai: 50,
      human: 50,
      reasons: ["Neutral signals"],
      highlights: [],
      verdict: "Uncertain"
    };
  }

  let aiPercent = Math.round((aiScore / totalScore) * 100);
  let humanPercent = 100 - aiPercent;

  if (humanScore > aiScore * 2) {
    humanPercent = Math.min(88, humanPercent + 8);
    aiPercent = 100 - humanPercent;
  }

  let verdict = "Uncertain";
  if (aiPercent >= 80) verdict = "AI Generated (Very High Confidence)";
  else if (aiPercent >= 65) verdict = "Likely AI Generated";
  else if (humanPercent >= 80) verdict = "Human Written (Very High Confidence)";
  else if (humanPercent >= 65) verdict = "Likely Human Written";

  return { ai: aiPercent, human: humanPercent, reasons, highlights, verdict };
}