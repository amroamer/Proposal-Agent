FROM ollama/ollama:latest

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENV OLLAMA_HOST=0.0.0.0:11434
EXPOSE 11434

ENTRYPOINT ["/entrypoint.sh"]
