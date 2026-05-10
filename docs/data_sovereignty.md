# Data sovereignty — proposal-review pipeline

## Why

KPMG Saudi Arabia client engagements include classified material that
must remain inside KSA region. The proposal-review pipeline does LLM
inference on uploaded `.pptx` content; depending on classification, the
inference target is restricted accordingly.

Failing closed (default = most restrictive) is a non-negotiable design
constraint.

## Classifications

Every proposal carries a `classification` field. Values:

| Value        | Meaning                                                   | Allowed providers            |
|--------------|-----------------------------------------------------------|------------------------------|
| `Public`     | Marketing / public-domain content                         | Any registered provider      |
| `Internal`   | KPMG-internal but not client-confidential                 | Any registered provider      |
| `Restricted` | Client-confidential or KSA-restricted (default)           | LOCAL providers ONLY         |

`Restricted` is the default for every new proposal. Downgrading is an
explicit user action; mis-classification fails closed (treated as
`Restricted`) by `Classification.coerce`.

Schema: `proposals.classification VARCHAR(16) NOT NULL DEFAULT 'Restricted'`
with a CHECK constraint to the three allowed values. Migration: V014.

## Single LLM chokepoint

Every LLM call made by the proposal-review pipeline goes through ONE
module:

```
backend/app/services/proposal_review/llm_client.py
```

That module:

1. Takes a `classification` argument with every call.
2. Knows which providers are local vs cloud (any provider whose value
   begins with `cloud_` is treated as cloud).
3. Refuses to call a cloud provider when classification is `Restricted`,
   raising `PermissionError` before the network request is made.
4. Forwards the call to the chosen transport. Today the only registered
   provider is `local_ollama`, which routes through
   `app.services.ollama_service` (host Ollama at `OLLAMA_BASE_URL`).

Adding a future cloud provider requires a code change in `llm_client.py`
that names it explicitly. There is NO provider registry sourced from
config — adding a cloud provider is reviewed in code, with the
classification gate enforced at the same site.

## Structured-output contract

The pipeline relies on Ollama's `format=<JSON Schema>` parameter (the
schema is generated from the per-section Pydantic model) and validates
the response with that same model. There is **no regex-parsing** of
model output, and **no json-repair** sanitisation pass. If validation
fails, the extractor retries once and then stores `{}` for the section
— it does not silently mutate model output.

This protects the dossier from absorbing malformed or hallucinated
fields under the guise of "parsing flexibility".

## What this does NOT cover

- **Embeddings**: the pipeline does not currently do RAG / vector
  retrieval. If embedding generation is added later, it MUST go through
  `llm_client.py` with the same classification gate.
- **Storage providers**: this document is about inference. The .pptx
  bytes themselves are stored in Postgres BYTEA inside the KSA
  deployment; no S3 / cloud blob storage is involved.
- **Logs**: log lines include slide counts, hashes, and durations, not
  proposal text. Operator log review is still scoped to `Internal` at
  most.

## How to verify the gate

```python
from app.services.proposal_review.llm_client import (
    Classification, Provider, _assert_allowed_for_classification,
)

# This raises PermissionError:
_assert_allowed_for_classification(
    Provider("cloud_openai"),  # hypothetical
    Classification.RESTRICTED,
)
```

A unit test at `app/tests/test_llm_client_sovereignty.py` exercises
this path so the gate cannot regress silently.
