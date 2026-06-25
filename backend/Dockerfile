FROM python:3.11-slim

WORKDIR /app

# Install system dependencies needed by psycopg2
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies first (layer-cached)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Expose the port uvicorn will listen on
EXPOSE 8000

# Start uvicorn — AWS will inject DATABASE_URL, SECRET_KEY, ALLOWED_ORIGINS via env
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
