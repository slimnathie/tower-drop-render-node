# Tower Drop — Render-ready Node version

This edition runs as a standard Next.js Node application and does not require a
database or any paid service. The player's best score is stored in their own
browser.

## Included gameplay

- A thick fraying rope that snaps on the fifth swing
- Normal, golden, steel and classic round bomb loads
- Five consecutive perfect drops widen the top block
- Bombs randomly swing at double, triple or 4x "insane" speed
- Safe bomb misses award +2, +3 or +10 depending on speed
- A rising sea advances one block-height every five swings
- The run ends if the water reaches the top of the screen

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
