# Tower Drop — Render-ready Node version

This edition runs as a standard Next.js Node application and does not require a
database or any paid service. The player's best score is stored in their own
browser.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Deploy to Render for free

1. Extract this ZIP and push its contents to a GitHub repository.
2. In Render, choose **New → Blueprint**.
3. Connect the repository.
4. Render reads `render.yaml`; approve the free web service.

The included settings run:

- Build: `npm ci && npm run build`
- Start: `npm start`

No environment variables or database are required.
