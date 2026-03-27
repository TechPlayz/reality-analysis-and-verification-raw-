import { useMemo, useState } from "react";
import "./App.css";

function meterClass(value, inverse = false) {
  const score = inverse ? 100 - value : value;
  if (score >= 70) return "meter-strong";
  if (score >= 45) return "meter-mid";
  return "meter-low";
}

function predictIntent(text) {
  const lower = text.toLowerCase();
  if (!lower.trim()) return "Intent pending";
  if (/(safe|risk|harm|fake|hallucinat)/.test(lower)) return "Intent: safety check";
  if (/(should i|decision|choose|better)/.test(lower)) return "Intent: decision support";
  if (/(why|how|explain|what is)/.test(lower)) return "Intent: factual verification";
  return "Intent: general reliability check";
}

const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

function App() {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [analysisId, setAnalysisId] = useState("");
  const [feedbackTarget, setFeedbackTarget] = useState("skeptic");
  const [feedbackMsg, setFeedbackMsg] = useState("");

  const intent = useMemo(() => predictIntent(text), [text]);
  const toneClass = result?.uncertainty >= 65 ? "tone-alert" : "tone-calm";

  const analyze = async () => {
    setLoading(true);
    setError("");
    setFeedbackMsg("");

    try {
      const response = await fetch(`${API_BASE}/api/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Analyze request failed.");
      }

      setAnalysisId(data.analysisId);
      setResult(data);
    } catch (e) {
      setError(e.message || "Unable to analyze content right now.");
    } finally {
      setLoading(false);
    }
  };

  const sendFeedback = async (correct) => {
    if (!analysisId) return;

    setFeedbackMsg("Saving feedback...");
    try {
      const response = await fetch(`${API_BASE}/api/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analysisId, correct, target: feedbackTarget })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Feedback failed.");
      }

      setResult((prev) => (prev ? { ...prev, weights: data.weights } : prev));
      setFeedbackMsg("Feedback learned. Agent weights updated in real time.");
    } catch (e) {
      setFeedbackMsg(e.message || "Could not save feedback.");
    }
  };

  return (
    <main className={`shell ${toneClass}`}>
      <section className="hero">
        <p className="eyebrow">RealityOps</p>
        <h1>Uncertainty Copilot</h1>
        <p>
          Multi-agent system for hallucination risk detection without ground truth,
          with live feedback adaptation.
        </p>
      </section>

      <section className="panel input-panel">
        <header>
          <h2>Analyze AI Output</h2>
          <p>{intent}</p>
        </header>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste an AI response (15+ words) to score hallucination risk and uncertainty..."
          rows={9}
        />

        <div className="row">
          <button onClick={analyze} disabled={loading || text.trim().split(/\s+/).length < 15}>
            {loading ? "Analyzing..." : "Run Multi-Agent Audit"}
          </button>
          <span className="word-count">Words: {text.trim() ? text.trim().split(/\s+/).length : 0}</span>
        </div>

        {error && <p className="error">{error}</p>}
      </section>

      <section className="panel output-panel">
        <header>
          <h2>Decision Board</h2>
          <p>Risk, uncertainty, trust score, and explainable agent outputs.</p>
        </header>

        {!result && <p className="empty">No result yet. Run analysis to start.</p>}

        {result && (
          <>
            <div className="pill-row">
              <span className="pill">Verdict: {result.verdict}</span>
              <span className="pill">Trust: {result.trust}%</span>
            </div>

            <div className="metric">
              <div className="label-row">
                <span>Hallucination Risk</span>
                <strong>{result.hallucinationRisk}%</strong>
              </div>
              <div className="bar">
                <div
                  className={`fill ${meterClass(result.hallucinationRisk)}`}
                  style={{ width: `${result.hallucinationRisk}%` }}
                />
              </div>
            </div>

            <div className="metric">
              <div className="label-row">
                <span>Uncertainty</span>
                <strong>{result.uncertainty}%</strong>
              </div>
              <div className="bar">
                <div
                  className={`fill ${meterClass(result.uncertainty)}`}
                  style={{ width: `${result.uncertainty}%` }}
                />
              </div>
            </div>

            <div className="metric">
              <div className="label-row">
                <span>Trust Score</span>
                <strong>{result.trust}%</strong>
              </div>
              <div className="bar">
                <div
                  className={`fill ${meterClass(result.trust, true)}`}
                  style={{ width: `${result.trust}%` }}
                />
              </div>
            </div>

            <div className="reasons">
              <h3>Top Reasons</h3>
              <ul>
                {result.topReasons.map((reason, idx) => (
                  <li key={`${reason}-${idx}`}>{reason}</li>
                ))}
              </ul>
            </div>

            <div className="agents">
              {result.agents.map((agent) => (
                <article key={agent.name} className="agent-card">
                  <h4>{agent.name} Agent</h4>
                  <p>Risk: {agent.risk}%</p>
                  <ul>
                    {agent.reasons.length === 0 && <li>No strong warning from this agent.</li>}
                    {agent.reasons.map((reason, idx) => (
                      <li key={`${agent.name}-${idx}`}>{reason}</li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>

            <div className="feedback-box">
              <h3>Real-Time Adaptation</h3>
              <p>Tell the system if this judgment was correct. It updates agent weights instantly.</p>

              <div className="row">
                <label htmlFor="target">Adjust Focus:</label>
                <select
                  id="target"
                  value={feedbackTarget}
                  onChange={(e) => setFeedbackTarget(e.target.value)}
                >
                  <option value="skeptic">Skeptic Agent</option>
                  <option value="consistency">Consistency Agent</option>
                  <option value="grounding">Grounding Agent</option>
                </select>
              </div>

              <div className="row">
                <button className="ghost" onClick={() => sendFeedback(true)}>This was correct</button>
                <button className="ghost" onClick={() => sendFeedback(false)}>This was wrong</button>
              </div>

              {result.weights && (
                <p className="weights">
                  Weights now: skeptic {Math.round(result.weights.skeptic * 100)}%, consistency {Math.round(result.weights.consistency * 100)}%, grounding {Math.round(result.weights.grounding * 100)}%
                </p>
              )}
              {feedbackMsg && <p className="feedback-msg">{feedbackMsg}</p>}
            </div>
          </>
        )}
      </section>
    </main>
  );
}

export default App;
