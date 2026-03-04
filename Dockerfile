# ── Stage 1: Build React frontend ─────────────────────────────────────────────
FROM node:20-alpine AS frontend
WORKDIR /build
COPY ui/package.json ui/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY ui/ ./
RUN npm run build

# ── Stage 2: Python backend + serve built frontend ───────────────────────────
FROM python:3.11-slim
WORKDIR /app

# Install Python dependencies
COPY galleon/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend code
COPY galleon/ ./galleon/

# Copy built frontend from stage 1
COPY --from=frontend /build/dist ./ui/dist

# Create data directory for SQLite persistence
RUN mkdir -p galleon/data

EXPOSE 8000

# Run from galleon/ so relative imports work
WORKDIR /app/galleon
CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000"]
