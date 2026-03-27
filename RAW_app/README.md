# RAW App

RAW (Reality Analysis and Verification) analyzes text/code and now also supports image AI-likelihood checks.

## Run Locally

1. Install dependencies:

```bash
npm install
```

2. Configure environment variables:

```bash
cp .env.example .env
```

3. Add a free Hugging Face API token in `.env`:

```env
VITE_HF_API_TOKEN=hf_xxx_your_token_here
```

4. Start the app:

```bash
npm run dev
```

## Free Image Detection API Integration

Image analysis uses Hugging Face Inference API models (free tier).

- Default model list:
	- `Ateeqq/ai-vs-human-image-detector`
	- `umm-maybe/AI-image-detector`
- You can override with:

```env
VITE_HF_IMAGE_MODELS=model1,model2,model3
```

The app tries models in order and uses the first successful response.

## Notes

- Image detection confidence depends on the external model quality and labels.
- If no API token is configured, the UI still works and returns an explicit uncertain result for images.
