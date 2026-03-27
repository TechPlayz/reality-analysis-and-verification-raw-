# RealityOps

RealityOps is a hackathon-ready uncertainty copilot that combines:
- Multi-agent hallucination risk analysis (no strict ground truth required)
- Explainable uncertainty and trust scoring
- Real-time adaptation from user feedback

## Stack

- Frontend: React + Vite
- Backend: Node.js + Express

## Run

Backend:

```bash
cd server
npm run dev
```

Frontend:

```bash
cd client
npm run dev
```

The frontend proxies `/api` to `http://localhost:8787` in dev.

## Demo Flow

1. Paste an AI-generated answer (15+ words)
2. Run multi-agent audit
3. Inspect risk, uncertainty, trust, and top reasons
4. Send feedback (`correct` or `wrong`)
5. Re-run and show updated agent weights
