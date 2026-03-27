import { useState } from "react";
import { analyzeText } from "./detector";
import "./App.css";

function App() {
  const [text, setText] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const wordsCount = text.trim() ? text.trim().split(/\s+/).length : 0;
  const charCount = text.length;

  const handleAnalyze = () => {
    const res = analyzeText(text);
    setError("");
    setResult(null);

    if (res.error) {
      setError(res.error);
      return;
    }

    setResult(res);
  };

  const handleClear = () => {
    setText("");
    setResult(null);
    setError("");
  };

  const isAnalyzeDisabled = !text.trim();
  const verdictClass = result
    ? result.verdict.toLowerCase().replace(/\s+/g, "-")
    : "";

  return (
    <main className="app-shell">
      <section className="hero-panel">
        <p className="eyebrow">RAW Intelligence</p>
        <h1>Reality Analysis and Verification</h1>
        <p className="subtitle">
          Analyze writing signals and estimate whether text feels human-crafted
          or AI-generated.
        </p>
      </section>

      <section className="workspace-grid">
        <article className="panel input-panel">
          <header className="panel-header">
            <h2>Input Text</h2>
            <p>Paste at least 15 words for reliable scoring.</p>
          </header>

          <label htmlFor="analysis-input" className="input-label">
            Text sample
          </label>
          <textarea
            id="analysis-input"
            rows="9"
            className="analysis-input"
            placeholder="Paste your text or code here..."
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && !isAnalyzeDisabled) {
                handleAnalyze();
              }
            }}
          />

          <div className="meta-row" aria-live="polite">
            <span className="meta-chip">Words: {wordsCount}</span>
            <span className="meta-chip">Characters: {charCount}</span>
          </div>

          <div className="actions">
            <button
              className="analyze-button"
              onClick={handleAnalyze}
              disabled={isAnalyzeDisabled}
            >
              Analyze Text
            </button>
            <button
              className="clear-button"
              onClick={handleClear}
              disabled={!text && !result && !error}
              type="button"
            >
              Clear
            </button>
          </div>

          {error && <p className="error-message">{error}</p>}
          <p className="input-hint">
            Tip: longer samples usually produce better confidence signals.
          </p>
        </article>

        <article className="panel results-panel" aria-live="polite">
          <header className="panel-header">
            <h2>Result Board</h2>
            <p>Run analysis to see percentages and sentence-level clues.</p>
          </header>

          {result && (
            <>
              <div className="verdict-row">
                <p className={`verdict-badge ${verdictClass}`}>
                  Verdict: {result.verdict}
                </p>
                <p className="confidence-pill">
                  Confidence: {Math.max(result.ai, result.human)}%
                </p>
              </div>

              <div className="score-row">
                <div className="score-head">
                  <span>AI Probability</span>
                  <strong>{result.ai}%</strong>
                </div>
                <div className="bar-track">
                  <div className="bar-fill ai" style={{ width: `${result.ai}%` }} />
                </div>
              </div>

              <div className="score-row">
                <div className="score-head">
                  <span>Human Probability</span>
                  <strong>{result.human}%</strong>
                </div>
                <div className="bar-track">
                  <div className="bar-fill human" style={{ width: `${result.human}%` }} />
                </div>
              </div>

              <div className="reason-box">
                <h3>Why this score?</h3>
                {result.reasons.length > 0 ? (
                  <ul>
                    {result.reasons.map((reason, i) => (
                      <li key={i}>{reason}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="no-reasons">No strong indicators were detected.</p>
                )}
              </div>

              {result.highlights.length > 0 && (
                <div className="highlight-box">
                  <h3>AI-like Sentences</h3>
                  <ul>
                    {result.highlights.map((sentence, i) => (
                      <li key={i}>{sentence}</li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </article>
      </section>

      <footer className="app-footer">
        <p>
          RAW uses heuristic indicators for educational analysis and should be
          combined with human judgment.
        </p>
      </footer>
    </main>
  );
}

export default App;