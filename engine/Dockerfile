FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Bake the htdemucs weights into the image at build time so the first real
# request isn't waiting on a ~300MB download from a cold container.
RUN python -c "from demucs.pretrained import get_model; get_model('htdemucs')"

COPY app.py .

RUN mkdir -p /tmp/jobs && chmod 777 /tmp/jobs

# Hugging Face Spaces (docker SDK) expects the app on 7860.
EXPOSE 7860
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "7860"]
