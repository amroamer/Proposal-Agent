#!/bin/sh
# Start Ollama in the background, wait for it, pull default models, then block.

set -e

# Start ollama server in background
ollama serve &
OLLAMA_PID=$!

# Wait until ready
echo "Waiting for Ollama to be ready..."
for i in $(seq 1 60); do
    if ollama list >/dev/null 2>&1; then
        echo "Ollama is ready."
        break
    fi
    sleep 2
done

# Pull default models (idempotent — skip if present)
MODELS="${OLLAMA_PRELOAD_MODELS:-qwen2.5:7b nomic-embed-text}"
for model in $MODELS; do
    echo "Pulling $model..."
    ollama pull "$model" || echo "Warning: failed to pull $model (continuing)"
done

echo "Ollama initialization complete. Attaching to server process."
wait $OLLAMA_PID
