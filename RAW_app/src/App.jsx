import { useState } from "react";
import { analyzeText } from "./detector";
import "./App.css";

function App() {
  const [text, setText] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

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

  const isAnalyzeDisabled = !text.trim();

  return (
    <main className="app-shell">
      <section className="panel">
        <header className="panel-header">
          <p className="eyebrow">RAW</p>
          <h1>Reality Analysis and Verification</h1>
          <p className="subtitle">
            Estimate whether text reads more AI-generated or human-written.
          </p>
        </header>

        <label htmlFor="analysis-input" className="input-label">
          Text to analyze
        </label>
        <textarea
          id="analysis-input"
          rows="7"
          className="analysis-input"
          placeholder="Paste your text or code here..."
          value={text}
          onChange={(e) => setText(e.target.value)}
        />

        <div className="actions">
          <button
            className="analyze-button"
            onClick={handleAnalyze}
            disabled={isAnalyzeDisabled}
          >
            Analyze Text
          </button>
        </div>

        {error && <p className="error-message">{error}</p>}
        <p className="input-hint">Tip: longer samples usually produce better signals.</p>
      </section>

      {result && (
        <section className="panel results-panel" aria-live="polite">
          <h2>Analysis Result</h2>
          <p className="verdict-badge">Verdict: {result.verdict}</p>

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
        </section>
      )}
    </main>
  );
}

export default App;