import { useEffect, useState } from "react";
import { analyzeText } from "./detector";
import { analyzeImageFile } from "./imageDetector";
import "./App.css";

function App() {
  const [activeTab, setActiveTab] = useState("text");
  const [text, setText] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState("");
  const [imageResult, setImageResult] = useState(null);
  const [imageError, setImageError] = useState("");
  const [imageLoading, setImageLoading] = useState(false);

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
    if (activeTab === "text") {
      setText("");
      setResult(null);
      setError("");
      return;
    }

    setImageFile(null);
    setImagePreview("");
    setImageResult(null);
    setImageError("");
    setImageLoading(false);
  };

  const handleImageSelect = (event) => {
    const file = event.target.files?.[0];
    setImageError("");
    setImageResult(null);

    if (!file) {
      setImageFile(null);
      setImagePreview("");
      return;
    }

    if (!file.type.startsWith("image/")) {
      setImageFile(null);
      setImagePreview("");
      setImageError("Please upload a valid image file.");
      return;
    }

    if (imagePreview) {
      URL.revokeObjectURL(imagePreview);
    }

    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const handleAnalyzeImage = async () => {
    if (!imageFile) {
      setImageError("Select an image first.");
      return;
    }

    setImageLoading(true);
    setImageError("");
    setImageResult(null);

    try {
      const analyzed = await analyzeImageFile(imageFile);
      if (analyzed.error) {
        setImageError(analyzed.error);
      } else {
        setImageResult(analyzed);
      }
    } catch {
      setImageError("Could not analyze this image right now. Please try again.");
    } finally {
      setImageLoading(false);
    }
  };

  const isAnalyzeDisabled = !text.trim();
  const isClearDisabled = activeTab === "text"
    ? (!text && !result && !error)
    : (!imageFile && !imageResult && !imageError);
  const verdictClass = result
    ? result.verdict.toLowerCase().replace(/\s+/g, "-")
    : "";

  useEffect(() => {
    return () => {
      if (imagePreview) {
        URL.revokeObjectURL(imagePreview);
      }
    };
  }, [imagePreview]);

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
            <h2>{activeTab === "text" ? "Input Text" : "Image Check"}</h2>
            <p>
              {activeTab === "text"
                ? "Paste at least 15 words for reliable scoring."
                : "Upload a photo/artwork to estimate AI-generated likelihood."}
            </p>
          </header>

          <div className="actions" style={{ marginTop: 0, marginBottom: "0.8rem" }}>
            <button
              className={activeTab === "text" ? "analyze-button" : "clear-button"}
              type="button"
              onClick={() => setActiveTab("text")}
            >
              Text Analysis
            </button>
            <button
              className={activeTab === "image" ? "analyze-button" : "clear-button"}
              type="button"
              onClick={() => setActiveTab("image")}
            >
              Image Analysis
            </button>
          </div>

          {activeTab === "text" && (
            <>
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
            </>
          )}

          {activeTab === "image" && (
            <>
              <label htmlFor="analysis-image" className="input-label">
                Image file (PNG, JPG, WEBP)
              </label>
              <input
                id="analysis-image"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={handleImageSelect}
                className="image-upload-input"
              />

              {imagePreview && (
                <img
                  src={imagePreview}
                  alt="Preview for AI image detection"
                  style={{
                    width: "100%",
                    marginTop: "0.75rem",
                    borderRadius: "12px",
                    border: "1px solid #d4e2f3",
                    maxHeight: "280px",
                    objectFit: "cover"
                  }}
                />
              )}
            </>
          )}

          <div className="actions">
            {activeTab === "text" ? (
              <button
                className="analyze-button"
                onClick={handleAnalyze}
                disabled={isAnalyzeDisabled}
              >
                Analyze Text
              </button>
            ) : (
              <button
                className="analyze-button"
                type="button"
                onClick={handleAnalyzeImage}
                disabled={!imageFile || imageLoading}
              >
                {imageLoading ? "Analyzing Image..." : "Analyze Image"}
              </button>
            )}
            <button
              className="clear-button"
              onClick={handleClear}
              disabled={isClearDisabled}
              type="button"
            >
              Clear
            </button>
          </div>

          {activeTab === "text" && error && <p className="error-message">{error}</p>}
          {activeTab === "image" && imageError && <p className="error-message">{imageError}</p>}

          <p className="input-hint">
            {activeTab === "text"
              ? "Tip: longer samples usually produce better confidence signals."
              : "Tip: clear, uncompressed images usually produce stronger detection signals."}
          </p>
        </article>

        <article className="panel results-panel" aria-live="polite">
          <header className="panel-header">
            <h2>Result Board</h2>
            <p>
              {activeTab === "text"
                ? "Run analysis to see percentages and sentence-level clues."
                : "Run analysis to see image AI-likelihood and provider signals."}
            </p>
          </header>

          {activeTab === "text" && result && (
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

          {activeTab === "image" && imageResult && (
            <>
              <div className="verdict-row">
                <p className="verdict-badge">
                  Image Verdict: {imageResult.verdict}
                </p>
                <p className="confidence-pill">
                  Confidence: {Math.max(imageResult.ai, imageResult.human)}%
                </p>
              </div>

              <div className="score-row">
                <div className="score-head">
                  <span>AI Probability</span>
                  <strong>{imageResult.ai}%</strong>
                </div>
                <div className="bar-track">
                  <div className="bar-fill ai" style={{ width: `${imageResult.ai}%` }} />
                </div>
              </div>

              <div className="score-row">
                <div className="score-head">
                  <span>Human Probability</span>
                  <strong>{imageResult.human}%</strong>
                </div>
                <div className="bar-track">
                  <div className="bar-fill human" style={{ width: `${imageResult.human}%` }} />
                </div>
              </div>

              <div className="reason-box">
                <h3>Image Signals</h3>
                {imageResult.reasons.length > 0 ? (
                  <ul>
                    {imageResult.reasons.map((reason, i) => (
                      <li key={i}>{reason}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="no-reasons">No clear image indicators returned.</p>
                )}
              </div>
            </>
          )}

          {activeTab === "text" && !result && (
            <div className="empty-result">
              <p className="empty-title">No text result yet</p>
              <p>Paste text and click Analyze Text to view scoring and reasoning.</p>
            </div>
          )}

          {activeTab === "image" && !imageResult && (
            <div className="empty-result">
              <p className="empty-title">No image result yet</p>
              <p>Upload an image and click Analyze Image to view AI-likelihood signals.</p>
            </div>
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