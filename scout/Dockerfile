# Scout pipeline worker — Cloud Run Job, one-shot (mirrors ~/noodle-render-worker).
#
# Base image ships Playwright + a pre-installed, version-matched Chromium plus
# all the OS-level libs Chromium needs to actually launch headless (fonts,
# libnss, libatk, etc). Matching playwright's own version tag here (see
# package.json: "playwright": "^1.58.2") avoids the "browser was not found,
# run `playwright install`" failure you get from a generic node base image.
FROM mcr.microsoft.com/playwright:v1.58.2-jammy

WORKDIR /app

# tesseract.js (phase4 OCR) is pure JS + WASM — no native tesseract binary or
# language-data apt package needed; it downloads its own worker/core/lang
# bundle from a CDN on first use and caches it. No extra OS deps required
# beyond what the Playwright base already has.

# Install deps first for layer caching.
COPY package.json package-lock.json* ./
RUN npm install --omit=dev \
  # playwright-extra + puppeteer-extra-plugin-stealth don't trigger a second
  # browser download (the base image's Chromium is reused), but confirm it:
  && npx playwright install --with-deps chromium || true

COPY . .

# Cloud Run Jobs runs as root by default in this image (the Playwright base
# already runs Chromium fine as root under --no-sandbox, which Playwright sets
# automatically when it detects it's running as uid 0). Kept as root to avoid
# fighting Chromium's sandbox requirements inside gVisor; the container has no
# inbound network surface (one-shot job, no HTTP listener) so the risk profile
# here is different from the noodle-render worker's public-facing case.

ENV NODE_ENV=production
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# No public HTTP needed — one-shot Cloud Run Job. cloud-worker.js claims one
# scout_jobs row (SCOUT_JOB_ID env, or oldest queued), runs the full P1-P12
# pipeline via run-pipeline.js, writes progress + terminal status back to
# Supabase, then exits.
CMD ["node", "cloud-worker.js"]
