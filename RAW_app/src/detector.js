export function analyzeText(text) {
  // VALIDATION
  if (!text || text.trim().length === 0) {
    return { error: "Please enter some text." };
  }

  const words = text.trim().split(/\s+/);
  if (words.length < 15) {
    return { error: "Minimum 15 words required for reliable analysis." };
  }

  // SETUP
  let reasons = [];
  let highlights = [];
  const lowerText = text.toLowerCase();
  const sentences = text.split(/[.!?]+/).map(s => s.trim()).filter(Boolean);

  // ============================================
  // FEATURE 1: COMMON AI PATTERNS & PHRASES
  // ============================================
  const aiPhrases = [
    "as an ai", "as a language model", "as an artificial intelligence",
    "i'm an ai", "i am an ai", "i cannot", "i am unable to",
    "in conclusion", "to summarize", "in summary", "it's important to note",
    "ultimately", "at the end of the day", "the key takeaway",
    "in today's world", "in today's society", "furthermore, it is",
    "it is crucial", "it is essential", "it is vital", "it is important",
    "one can observe", "one might argue", "from a certain perspective",
    "this can be attributed to", "this suggests that", "this indicates",
    "one of the most", "one of the primary", "one of the main",
    "has been shown to", "has been proven to", "has been demonstrated",
    "please note", "i must emphasize", "i would like to emphasize",
    "engaging manner", "conversational tone", "as a helpful assistant",
    "i'm here to help", "happy to help", "glad to assist"
  ];

  const humanPhrases = [
    "lol", "haha", "honestly", "truthfully", "imho", "imo", "tbh",
    "idk", "dunno", "gonna", "wanna", "kinda", "sorta", "literally",
    "like", "you know", "i think", "i believe", "i feel",
    "ugh", "wow", "omg", "lmao", "rofl", "wtf", "damn",
    "i'm not", "don't you", "can't", "won't", "shouldn't",
    "ain't", "y'all", "gonna", "wanna", "coulda", "shoulda",
    "it's just", "it's like", "it's all", "doesn't make sense",
    "for real", "you're welcome", "my bad", "no worries"
  ];

  let aiPhraseCount = 0;
  let humanPhraseCount = 0;

  aiPhrases.forEach(phrase => {
    const regex = new RegExp(`\\b${phrase.replace(/\s+/g, "\\s+")}\\b`, "gi");
    const matches = lowerText.match(regex);
    aiPhraseCount += matches ? matches.length : 0;
  });

  humanPhrases.forEach(phrase => {
    const regex = new RegExp(`\\b${phrase.replace(/\s+/g, "\\s+")}\\b`, "gi");
    const matches = lowerText.match(regex);
    humanPhraseCount += matches ? matches.length : 0;
  });

  // ============================================
  // FEATURE 2: PUNCTUATION PATTERNS
  // ============================================
  const exclamationCount = (lowerText.match(/!/g) || []).length;
  const questionCount = (lowerText.match(/\?/g) || []).length;
  const ellipsisCount = (lowerText.match(/\.\.\./g) || []).length;
  const emojiCount = (lowerText.match(/[😀-🙏]/g) || []).length;
  const multiExclamation = (lowerText.match(/!!+/g) || []).length;
  const contractionsCount = (lowerText.match(/[a-z]+'[a-z]+/g) || []).length;

  // ============================================
  // FEATURE 3: WORD PATTERNS
  // ============================================
  const personalWords = ["i", "me", "my", "we", "our", "us", "you", "your"];
  const personalCount = words.filter(w => 
    personalWords.some(pw => w.toLowerCase() === pw)
  ).length;

  const personalRatio = personalCount / words.length;

  // Rare/specific words (more human)
  const rareWords = words.filter(w => {
    const len = w.length;
    return len > 8 && !["information", "important", "process", "system", "development", "available", "technology", "management"].some(rw => w.toLowerCase().includes(rw));
  });

  // ============================================
  // FEATURE 4: SENTENCE METRICS
  // ============================================
  const sentenceLengths = sentences.map(s => s.split(/\s+/).length);
  const avgSentenceLength = sentenceLengths.reduce((a, b) => a + b, 0) / sentenceLengths.length;
  const sentenceLengthVariance = calculateVariance(sentenceLengths);
  const sentenceLengthStdDev = Math.sqrt(sentenceLengthVariance);

  // ============================================
  // FEATURE 5: WORD LENGTH METRICS
  // ============================================
  const wordLengths = words.map(w => w.replace(/[^\w]/g, "").length);
  const avgWordLength = wordLengths.reduce((a, b) => a + b, 0) / wordLengths.length;
  const wordLengthVariance = calculateVariance(wordLengths);

  // ============================================
  // FEATURE 6: READABILITY INDEX (Flesch)
  // ============================================
  const syllableCount = estimateSyllables(text);
  const fleschScore = calculateFleschKincaid(words.length, sentences.length, syllableCount);

  // ============================================
  // FEATURE 7: PASSIVE VOICE
  // ============================================
  const passiveIndicators = ["is", "are", "was", "were", "be", "been", "being"];
  const pastParticiples = words.filter(w => w.endsWith("ed"));
  let passiveCount = 0;

  sentences.forEach(sentence => {
    const sentenceWords = sentence.toLowerCase().split(/\s+/);
    for (let i = 0; i < sentenceWords.length - 1; i++) {
      if (passiveIndicators.includes(sentenceWords[i]) && 
          sentenceWords[i + 1] && sentenceWords[i + 1].endsWith("ed")) {
        passiveCount++;
      }
    }
  });

  // ============================================
  // FEATURE 8: REPETITION PATTERNS
  // ============================================
  const wordFreq = {};
  words.forEach(w => {
    const clean = w.toLowerCase().replace(/[^\w]/g, "");
    if (clean.length > 3) {
      wordFreq[clean] = (wordFreq[clean] || 0) + 1;
    }
  });

  const repetitionScore = Object.values(wordFreq).filter(count => count > 2).length;

  // ============================================
  // SCORING ENGINE
  // ============================================
  let aiScore = 0;
  let humanScore = 0;

  // AI Indicators
  if (aiPhraseCount > 0) {
    aiScore += aiPhraseCount * 15;
    reasons.push(`${aiPhraseCount} AI-typical phrases detected`);
  }

  if (avgSentenceLength > 18) {
    aiScore += 12;
    reasons.push("Consistently long sentences (AI typical)");
  }

  if (sentenceLengthStdDev < 4) {
    aiScore += 20;
    reasons.push("Low sentence variation (AI smoothness)");
  }

  if (passiveCount > sentences.length * 0.15) {
    aiScore += 15;
    reasons.push("High passive voice usage (AI style)");
  }

  if (exclamationCount === 0 && questionCount < sentences.length * 0.1) {
    aiScore += 10;
    reasons.push("Lack of emotional punctuation (AI style)");
  }

  if (repetitionScore > words.length * 0.05) {
    aiScore += 8;
    reasons.push("Repetitive word patterns detected");
  }

  if (personalRatio < 0.02) {
    aiScore += 8;
    reasons.push("Minimal personal pronouns (AI style)");
  }

  // Human Indicators
  if (humanPhraseCount > 0) {
    humanScore += humanPhraseCount * 20;
    reasons.push(`${humanPhraseCount} human-typical phrases/slang detected`);
  }

  if (personalRatio > 0.08) {
    humanScore += 15;
    reasons.push("Strong personal voice (human trait)");
  }

  if (contractionsCount > words.length * 0.05) {
    humanScore += 12;
    reasons.push("Frequent contractions (human speech)");
  }

  if (ellipsisCount > 0) {
    humanScore += 10;
    reasons.push("Ellipsis usage (human thinking style)");
  }

  if (multiExclamation > 0 || exclamationCount > sentences.length * 0.2) {
    humanScore += 12;
    reasons.push("Emphatic punctuation (human emotion)");
  }

  if (fleschScore > 60) {
    humanScore += 10;
    reasons.push("Conversational tone detected");
  }

  if (emojiCount > 0) {
    humanScore += 20;
    reasons.push("Emoji usage (human engagement)");
  }

  if (sentenceLengthStdDev > 6) {
    humanScore += 12;
    reasons.push("Varied sentence structure (human writing)");
  }

  // ============================================
  // FINAL CALCULATION
  // ============================================
  let totalScore = aiScore + humanScore;

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

  // Confidence boost for strong signals
  if (aiScore > humanScore * 2) {
    aiPercent = Math.min(95, aiPercent + 5);
    humanPercent = 100 - aiPercent;
  } else if (humanScore > aiScore * 2) {
    humanPercent = Math.min(95, humanPercent + 5);
    aiPercent = 100 - humanPercent;
  }

  // ============================================
  // HIGHLIGHT DETECTION
  // ============================================
  sentences.forEach(sentence => {
    let sentenceAiScore = 0;
    
    aiPhrases.forEach(phrase => {
      if (sentence.toLowerCase().includes(phrase)) sentenceAiScore++;
    });

    const senWords = sentence.split(/\s+/);
    if (senWords.length > 15) sentenceAiScore++;
    if (sentenceAiScore >= 2) {
      highlights.push(sentence.trim());
    }
  });

  // ============================================
  // VERDICT
  // ============================================
  let verdict = "Uncertain";

  if (aiPercent >= 85) verdict = "AI Generated (Very High Confidence)";
  else if (aiPercent >= 70) verdict = "Likely AI Generated";
  else if (aiPercent >= 60) verdict = "Likely AI";
  else if (humanPercent >= 85) verdict = "Human Written (Very High Confidence)";
  else if (humanPercent >= 70) verdict = "Likely Human Written";
  else if (humanPercent >= 60) verdict = "Likely Human";

  return { ai: aiPercent, human: humanPercent, reasons, highlights, verdict };
}

// HELPER FUNCTIONS
function calculateVariance(values) {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
}

function estimateSyllables(text) {
  const words = text.toLowerCase().split(/\s+/);
  let sylCount = 0;

  words.forEach(word => {
    word = word.replace(/[^a-z]/g, "");
    let syl = 0;
    let vowels = false;

    for (let i = 0; i < word.length; i++) {
      const isVowel = "aeiouy".includes(word[i]);
      if (isVowel && !vowels) syl++;
      vowels = isVowel;
    }

    if (word.endsWith("e")) syl--;
    if (word.endsWith("le") && word.length > 2) syl++;
    if (syl === 0) syl = 1;

    sylCount += syl;
  });

  return Math.max(1, sylCount);
}

function calculateFleschKincaid(wordCount, sentenceCount, syllableCount) {
  if (sentenceCount === 0 || wordCount === 0) return 50;
  return Math.round(
    (0.39 * (wordCount / sentenceCount)) +
    (11.8 * (syllableCount / wordCount)) -
    15.59
  );
}